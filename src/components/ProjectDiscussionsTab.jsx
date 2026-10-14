import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  MessageSquare, Send, Reply, Edit3, Trash2, X, 
  Search, RefreshCw, CheckCheck, AlertCircle, Clock, 
  ChevronUp, CornerDownRight, Check, Shield, Crown, User, 
  Smile, Paperclip, ArrowDown
} from 'lucide-react';
import { messageService } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import ConfirmModal from './ConfirmModal';

const ProjectDiscussionsTab = ({ projectId, project, currentUser, userRole, onUnreadCleared }) => {
  const toast = useToast();
  const socketContext = useSocket();
  const socket = socketContext?.socket;
  const isConnected = socketContext?.isConnected;

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);

  // Messages state
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState(null);

  // Input & composer state
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Failed send queue
  const [failedMessage, setFailedMessage] = useState(null);

  // Delete modal
  const [messageToDelete, setMessageToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // User permissions
  const isOwner = userRole === 'Owner' || project?.owner?._id === currentUser?._id || project?.owner === currentUser?._id;
  const isAdmin = userRole === 'Admin';
  const canModerate = isOwner || isAdmin;

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Scroll to bottom helper
  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  // Mark messages as read helper
  const handleMarkAsRead = useCallback(async () => {
    if (!projectId) return;
    try {
      await messageService.markMessagesAsRead(projectId);
      setUnreadCount(0);
      if (onUnreadCleared) onUnreadCleared();
    } catch (err) {
      // Non-critical, ignore
    }
  }, [projectId, onUnreadCleared]);

  // Fetch initial message history
  const fetchMessages = useCallback(async (isInitial = true) => {
    if (!projectId) return;
    try {
      if (isInitial) setLoading(true);
      setError(null);

      const params = { limit: 30 };
      if (debouncedSearch) params.search = debouncedSearch;

      const data = await messageService.getMessages(projectId, params);
      setMessages(data.messages || []);
      setHasMore(Boolean(data.hasMore));
      setTotal(data.total || 0);
      setUnreadCount(data.unreadCount || 0);

      if (isInitial) {
        setTimeout(() => scrollToBottom(false), 50);
      }
    } catch (err) {
      console.error('Failed to load project messages:', err);
      setError(err.message || 'Failed to load messages');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [projectId, debouncedSearch]);

  useEffect(() => {
    fetchMessages(true);
    handleMarkAsRead();
  }, [fetchMessages, handleMarkAsRead]);

  // Load earlier messages (incremental cursor pagination)
  const handleLoadEarlier = async () => {
    if (loadingEarlier || !hasMore || messages.length === 0) return;

    try {
      setLoadingEarlier(true);
      const earliestId = messages[0]._id;
      const container = messagesContainerRef.current;
      const prevScrollHeight = container ? container.scrollHeight : 0;

      const params = {
        limit: 30,
        before: earliestId,
      };
      if (debouncedSearch) params.search = debouncedSearch;

      const data = await messageService.getMessages(projectId, params);
      const earlier = data.messages || [];

      setMessages(prev => [...earlier, ...prev]);
      setHasMore(Boolean(data.hasMore));

      // Preserve scroll position
      setTimeout(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - prevScrollHeight;
        }
      }, 30);
    } catch (err) {
      toast.error('Failed to load earlier messages');
    } finally {
      setLoadingEarlier(false);
    }
  };

  // Socket real-time events
  useEffect(() => {
    if (!socket || !projectId) return;

    const handleNewMessage = (newMsg) => {
      const msgProjectId = newMsg.project?._id || newMsg.project;
      if (msgProjectId && msgProjectId.toString() === projectId.toString()) {
        setMessages(prev => {
          // Avoid duplicate insertion if already added optimistically
          if (prev.some(m => m._id === newMsg._id || m.clientTempId === newMsg.clientTempId)) {
            return prev.map(m => m.clientTempId === newMsg.clientTempId ? newMsg : m);
          }
          return [...prev, newMsg];
        });
        setTotal(prev => prev + 1);

        // If message is from someone else, mark as read if active tab
        if (newMsg.sender?._id !== currentUser?._id) {
          handleMarkAsRead();
        }

        setTimeout(() => scrollToBottom(true), 60);
      }
    };

    const handleUpdateMessage = (updatedMsg) => {
      setMessages(prev => prev.map(m => m._id === updatedMsg._id ? updatedMsg : m));
    };

    const handleDeleteMessage = ({ messageId }) => {
      setMessages(prev => prev.filter(m => m._id !== messageId));
      setTotal(prev => Math.max(0, prev - 1));
    };

    const handleMessageRead = ({ userId }) => {
      // Update read status indicator
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:updated', handleUpdateMessage);
    socket.on('message:deleted', handleDeleteMessage);
    socket.on('message:read', handleMessageRead);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:updated', handleUpdateMessage);
      socket.off('message:deleted', handleDeleteMessage);
      socket.off('message:read', handleMessageRead);
    };
  }, [socket, projectId, currentUser, handleMarkAsRead]);

  // Send or Edit message
  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || sending) return;

    const textToSend = inputText.trim();

    // 1. EDIT MODE
    if (editingMessage) {
      try {
        setSending(true);
        const updated = await messageService.updateMessage(projectId, editingMessage._id, {
          content: textToSend,
        });
        setMessages(prev => prev.map(m => m._id === updated._id ? updated : m));
        setEditingMessage(null);
        setInputText('');
        toast.success('Message updated');
      } catch (err) {
        toast.error(err.message || 'Failed to update message');
      } finally {
        setSending(false);
      }
      return;
    }

    // 2. SEND NEW MESSAGE
    const tempId = `temp_${Date.now()}`;
    const optimisticMessage = {
      _id: tempId,
      clientTempId: tempId,
      project: projectId,
      sender: {
        _id: currentUser?._id,
        name: currentUser?.name || 'You',
        email: currentUser?.email,
        avatarInitials: currentUser?.avatarInitials || 'ME',
      },
      content: textToSend,
      replyTo: replyingTo,
      createdAt: new Date().toISOString(),
      isPending: true,
    };

    // Optimistically append
    setMessages(prev => [...prev, optimisticMessage]);
    setInputText('');
    const targetReplyTo = replyingTo?._id;
    setReplyingTo(null);
    setFailedMessage(null);
    setTimeout(() => scrollToBottom(true), 30);

    try {
      setSending(true);
      const created = await messageService.sendMessage(projectId, {
        content: textToSend,
        replyTo: targetReplyTo,
      });

      // Replace optimistic message with server persisted record
      setMessages(prev => prev.map(m => m._id === tempId ? created : m));
      setTotal(prev => prev + 1);
    } catch (err) {
      console.error('Failed to send message:', err);
      // Mark optimistic message as failed
      setMessages(prev => prev.filter(m => m._id !== tempId));
      setFailedMessage({
        content: textToSend,
        replyTo: targetReplyTo,
        error: err.message || 'Failed to send message',
      });
      toast.error('Message failed to send. Click retry below.');
    } finally {
      setSending(false);
    }
  };

  // Retry sending failed message
  const handleRetryFailed = () => {
    if (!failedMessage) return;
    setInputText(failedMessage.content);
    if (failedMessage.replyTo) {
      const parent = messages.find(m => m._id === failedMessage.replyTo);
      if (parent) setReplyingTo(parent);
    }
    setFailedMessage(null);
    inputRef.current?.focus();
  };

  // Keyboard shortcut handler in textarea
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape') {
      if (editingMessage) {
        setEditingMessage(null);
        setInputText('');
      } else if (replyingTo) {
        setReplyingTo(null);
      }
    }
  };

  // Start editing a message
  const handleStartEdit = (msg) => {
    setEditingMessage(msg);
    setReplyingTo(null);
    setInputText(msg.content);
    inputRef.current?.focus();
  };

  // Start replying to a message
  const handleStartReply = (msg) => {
    setReplyingTo(msg);
    setEditingMessage(null);
    inputRef.current?.focus();
  };

  // Delete message confirmation
  const handleConfirmDelete = async () => {
    if (!messageToDelete) return;
    try {
      setIsDeleting(true);
      await messageService.deleteMessage(projectId, messageToDelete._id);
      setMessages(prev => prev.filter(m => m._id !== messageToDelete._id));
      setTotal(prev => Math.max(0, prev - 1));
      toast.success('Message deleted');
      setMessageToDelete(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete message');
    } finally {
      setIsDeleting(false);
    }
  };

  // Format timestamp
  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Format date headers
  const formatDateHeader = (dateStr) => {
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const itemDay = new Date(d);
    itemDay.setHours(0, 0, 0, 0);

    const diff = (today.getTime() - itemDay.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="h-[750px] max-h-[82vh] bg-slate-900/40 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in fade-in duration-200">
      {/* 1. TOP DISCUSSIONS HEADER */}
      <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                Project Discussions & Q&A
              </h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                {total} messages
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">
              {project?.name || 'Project'} • Collaborate, share thoughts, ask questions
            </p>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Search Toggle */}
          <div className="relative">
            {isSearchOpen ? (
              <div className="flex items-center bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 mr-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter messages..."
                  className="bg-transparent text-white focus:outline-none w-28 sm:w-44 text-xs"
                  autoFocus
                />
                <button
                  onClick={() => { setSearchQuery(''); setIsSearchOpen(false); }}
                  className="p-0.5 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsSearchOpen(true)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Search messages"
              >
                <Search className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Refresh button */}
          <button
            onClick={() => fetchMessages(false)}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50"
            title="Refresh discussion history"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. MESSAGES SCROLL CONTAINER */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-950/40"
      >
        {/* Load Earlier Messages Button */}
        {hasMore && (
          <div className="text-center pt-1 pb-3">
            <button
              onClick={handleLoadEarlier}
              disabled={loadingEarlier}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-blue-400 font-medium flex items-center gap-1.5 mx-auto transition-colors disabled:opacity-50"
            >
              {loadingEarlier ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading earlier messages...</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Load Earlier Messages</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* LOADING SKELETON */}
        {loading ? (
          <div className="py-24 text-center">
            <RefreshCw className="w-7 h-7 text-blue-500 animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-medium">Loading project conversation...</p>
          </div>
        ) : error ? (
          <div className="py-16 text-center text-red-400 border border-dashed border-red-500/20 rounded-2xl bg-red-500/5">
            <AlertCircle className="w-7 h-7 mx-auto mb-2 opacity-80" />
            <p className="text-xs font-semibold">Failed to load messages</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{error}</p>
            <button
              onClick={() => fetchMessages(true)}
              className="mt-3 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white"
            >
              Try Again
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="py-20 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 mx-auto mb-3 shadow-sm">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-white">No discussion messages yet</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {searchQuery
                ? `No messages matched "${searchQuery}". Clear search to view all messages.`
                : 'Start the conversation! Share study plans, ask questions, or coordinate upcoming tasks.'}
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isSelf = msg.sender?._id === currentUser?._id;
            const isMsgOwner = isSelf;
            const canDelete = isMsgOwner || canModerate;

            // Day separator check
            const prevMsg = messages[index - 1];
            const showDateHeader = !prevMsg || 
              new Date(prevMsg.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();

            return (
              <React.Fragment key={msg._id || msg.clientTempId || index}>
                {/* Date separator divider */}
                {showDateHeader && (
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 border-t border-slate-800" />
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2 py-0.5 bg-slate-900 border border-slate-800 rounded-full">
                      {formatDateHeader(msg.createdAt)}
                    </span>
                    <div className="flex-1 border-t border-slate-800" />
                  </div>
                )}

                {/* Message Bubble Container */}
                <div className={`flex items-start gap-3 group transition-colors ${isSelf ? 'flex-row-reverse' : ''}`}>
                  {/* Sender Avatar */}
                  <div className="relative shrink-0 mt-0.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                      isSelf 
                        ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40' 
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}>
                      {msg.sender?.avatarInitials || msg.sender?.name?.[0] || '?'}
                    </div>
                  </div>

                  {/* Message Content & Metadata */}
                  <div className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${isSelf ? 'items-end' : 'items-start'}`}>
                    {/* Sender Info Line */}
                    <div className={`flex items-center gap-2 mb-1 text-[11px] text-slate-400 ${isSelf ? 'flex-row-reverse' : ''}`}>
                      <span className="font-semibold text-slate-300">
                        {isSelf ? 'You' : msg.sender?.name || 'Teammate'}
                      </span>
                      <span className="text-slate-500 text-[10px]">
                        {formatTime(msg.createdAt)}
                      </span>
                      {msg.isEdited && (
                        <span className="text-[9px] text-slate-500 italic">
                          (edited)
                        </span>
                      )}
                    </div>

                    {/* Quoted Reply Preview */}
                    {msg.replyTo && (
                      <div className={`mb-1 px-3 py-1.5 rounded-xl border text-xs flex items-center gap-2 max-w-full ${
                        isSelf
                          ? 'bg-blue-950/40 border-blue-800/40 text-blue-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}>
                        <CornerDownRight className="w-3.5 h-3.5 shrink-0 opacity-70" />
                        <span className="font-semibold truncate text-[11px]">
                          {msg.replyTo.sender?.name || 'User'}:
                        </span>
                        <span className="truncate text-[11px] opacity-80">
                          {msg.replyTo.content}
                        </span>
                      </div>
                    )}

                    {/* Main Message Bubble */}
                    <div className="relative group/bubble">
                      <div className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm whitespace-pre-wrap break-words leading-relaxed border shadow-sm ${
                        isSelf
                          ? 'bg-blue-600 text-white border-blue-500/60 rounded-tr-none'
                          : 'bg-slate-900 text-slate-200 border-slate-800 rounded-tl-none'
                      }`}>
                        {msg.content}
                      </div>

                      {/* Hover Actions Toolbar */}
                      <div className={`absolute top-0 -translate-y-1/2 opacity-0 group-hover/bubble:opacity-100 transition-opacity bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-lg flex items-center gap-0.5 z-10 ${
                        isSelf ? 'right-0' : 'left-0'
                      }`}>
                        <button
                          onClick={() => handleStartReply(msg)}
                          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
                          title="Reply to message"
                        >
                          <Reply className="w-3.5 h-3.5" />
                        </button>

                        {isMsgOwner && (
                          <button
                            onClick={() => handleStartEdit(msg)}
                            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-amber-400 rounded-lg transition-colors"
                            title="Edit message"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canDelete && (
                          <button
                            onClick={() => setMessageToDelete(msg)}
                            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                            title="Delete message"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 3. FAILED SEND ALERT & RETRY */}
      {failedMessage && (
        <div className="px-5 py-2.5 bg-red-500/10 border-t border-red-500/20 flex items-center justify-between text-xs text-red-400 animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Message failed to send: "{failedMessage.content.slice(0, 30)}..."</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRetryFailed}
              className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 font-semibold rounded-lg transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => setFailedMessage(null)}
              className="p-1 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 4. REPLYING / EDITING PREVIEW BAR */}
      {(replyingTo || editingMessage) && (
        <div className="px-5 py-2 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-2 min-w-0">
            {replyingTo ? (
              <>
                <Reply className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-slate-400">Replying to</span>
                <span className="font-semibold text-white truncate max-w-[120px]">
                  @{replyingTo.sender?.name || 'Teammate'}:
                </span>
                <span className="text-slate-500 truncate max-w-xs italic">
                  "{replyingTo.content}"
                </span>
              </>
            ) : (
              <>
                <Edit3 className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-amber-400 font-semibold">Editing message:</span>
                <span className="text-slate-400 truncate max-w-xs">
                  "{editingMessage.content}"
                </span>
              </>
            )}
          </div>

          <button
            onClick={() => { setReplyingTo(null); setEditingMessage(null); if (editingMessage) setInputText(''); }}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-850"
            title="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 5. INPUT COMPOSER BAR */}
      <form onSubmit={handleSend} className="p-3 sm:p-4 border-t border-slate-800 bg-slate-900/90">
        <div className="relative flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-2 focus-within:border-blue-500/70 transition-colors shadow-inner">
          <textarea
            ref={inputRef}
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              editingMessage 
                ? 'Update your message... (Press Enter to save, Esc to cancel)' 
                : replyingTo 
                ? `Replying to @${replyingTo.sender?.name || 'Teammate'}...` 
                : 'Write a discussion message... (Enter to send, Shift+Enter for newline)'
            }
            maxLength={4000}
            className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none resize-none max-h-32"
          />

          <div className="flex items-center gap-1 shrink-0">
            {inputText.length > 3000 && (
              <span className="text-[10px] text-amber-400 mr-1">
                {4000 - inputText.length} left
              </span>
            )}

            <button
              type="submit"
              disabled={sending || !inputText.trim()}
              className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white disabled:text-slate-600 transition-colors shadow-sm"
              title={editingMessage ? 'Save changes' : 'Send message (Enter)'}
            >
              {sending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : editingMessage ? (
                <Check className="w-4 h-4" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </form>

      {/* DELETE CONFIRMATION MODAL */}
      {messageToDelete && (
        <ConfirmModal
          isOpen={Boolean(messageToDelete)}
          onClose={() => setMessageToDelete(null)}
          onConfirm={handleConfirmDelete}
          title="Delete Message"
          message={`Are you sure you want to delete this message? "${messageToDelete.content.slice(0, 50)}..." This action cannot be undone.`}
          confirmText={isDeleting ? 'Deleting...' : 'Delete'}
          type="danger"
        />
      )}
    </div>
  );
};

export default ProjectDiscussionsTab;
