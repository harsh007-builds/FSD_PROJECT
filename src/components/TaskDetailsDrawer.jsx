import React, { useState } from 'react';
import { 
  X, Calendar as CalendarIcon, Clock, AlertTriangle, Tag, 
  User, CheckCircle2, Circle, Trash2, Edit3, MessageSquare, 
  Send, CornerDownRight, ExternalLink 
} from 'lucide-react';

const PRIORITY_BADGES = {
  Urgent: 'bg-red-500/10 text-red-400 border-red-500/20',
  High: 'bg-red-500/10 text-red-400 border-red-500/20',
  Medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  Low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

const STATUS_OPTIONS = ['Backlog', 'Todo', 'In Progress', 'Review', 'Completed'];

const isTaskOverdue = (dueDate, status) => {
  if (!dueDate || status === 'Completed') return false;
  const due = new Date(dueDate);
  due.setHours(23, 59, 59, 999);
  return due.getTime() < Date.now();
};

const TaskDetailsDrawer = ({
  task,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onStatusChange,
  onAddComment,
  onDeleteComment,
  members = [],
  currentUser,
}) => {
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  if (!isOpen || !task) return null;

  const overdue = isTaskOverdue(task.dueDate, task.status);

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || isSubmittingComment) return;

    setIsSubmittingComment(true);
    try {
      await onAddComment(task.id, commentText.trim());
      setCommentText('');
    } catch (err) {
      console.error('Failed to post comment', err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return 'just now';
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col h-full text-slate-100">
          
          {/* Header */}
          <div className="p-6 border-b border-slate-800/80 flex items-center justify-between shrink-0 bg-slate-950/40">
            <div className="flex items-center gap-3">
              <span className={`text-xs uppercase font-bold tracking-wider px-2.5 py-1 rounded-full border ${PRIORITY_BADGES[task.priority] || PRIORITY_BADGES.Medium}`}>
                {task.priority || 'Medium'}
              </span>
              {overdue && (
                <span className="flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3.5 h-3.5" /> Overdue
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onEdit(task)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="Edit Task"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(task.id)}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Delete Task"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-1"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Title */}
            <div>
              <h2 className="text-xl font-bold text-white leading-snug">
                {task.task || task.title}
              </h2>
            </div>

            {/* Quick Status and Fields Grid */}
            <div className="grid grid-cols-2 gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 text-sm">
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">Status</label>
                <select
                  value={task.status}
                  onChange={(e) => onStatusChange(task.id, e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">Due Date</label>
                <div className="flex items-center gap-2 text-xs py-1.5 text-slate-300">
                  <CalendarIcon className="w-4 h-4 text-slate-500" />
                  <span>
                    {task.dueDate 
                      ? new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) 
                      : 'No due date'}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">Assignee</label>
                <div className="flex items-center gap-2 py-1">
                  {task.assignee ? (
                    <>
                      <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                        {task.assignee.avatarInitials || task.assignee.name?.[0] || '?'}
                      </div>
                      <span className="text-xs text-slate-200 truncate">{task.assignee.name || 'Assigned'}</span>
                    </>
                  ) : (
                    <span className="text-xs text-slate-500">Unassigned</span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">Priority</label>
                <span className="text-xs text-slate-300 py-1 block">{task.priority || 'Medium'}</span>
              </div>
            </div>

            {/* Labels */}
            {task.labels && task.labels.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Labels</h4>
                <div className="flex flex-wrap gap-1.5">
                  {task.labels.map((l, i) => (
                    <span key={i} className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md border border-slate-700/60 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-slate-500" /> {l}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Description</h4>
              {task.description ? (
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {task.description}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">No description provided for this task.</p>
              )}
            </div>

            {/* Comments Architecture */}
            <div className="pt-4 border-t border-slate-800/80">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-400" />
                  Comments & Activity ({task.comments?.length || 0})
                </h4>
              </div>

              {/* Comments List */}
              <div className="space-y-3 mb-5 max-h-60 overflow-y-auto pr-1">
                {(!task.comments || task.comments.length === 0) ? (
                  <div className="p-4 bg-slate-950/30 rounded-xl border border-slate-800/40 text-center text-xs text-slate-500">
                    No comments yet. Start the conversation below!
                  </div>
                ) : (
                  task.comments.map(c => {
                    const isAuthor = currentUser && c.user && (c.user._id === currentUser._id || c.user === currentUser._id);
                    return (
                      <div key={c._id || c.id} className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">
                              {c.user?.avatarInitials || c.user?.name?.[0] || '?'}
                            </div>
                            <span className="text-xs font-semibold text-slate-200">{c.user?.name || 'Teammate'}</span>
                            <span className="text-[10px] text-slate-500">{timeAgo(c.createdAt)}</span>
                          </div>
                          {isAuthor && onDeleteComment && (
                            <button
                              onClick={() => onDeleteComment(task.id, c._id || c.id)}
                              className="text-slate-500 hover:text-red-400 p-0.5 transition-colors"
                              title="Delete comment"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed pl-7">{c.text}</p>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Add Comment Form */}
              <form onSubmit={handleCommentSubmit} className="relative">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment or note..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 pr-12 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      handleCommentSubmit(e);
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={!commentText.trim() || isSubmittingComment}
                  className="absolute right-2.5 bottom-3 p-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white rounded-lg transition-colors"
                  title="Send (Ctrl+Enter)"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
              <span className="text-[10px] text-slate-500 mt-1 block">Press Ctrl+Enter to send</span>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailsDrawer;
