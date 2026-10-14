import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  BookOpen, Plus, Search, Edit3, Trash2, Pin, Clock, 
  History, AlertTriangle, CheckCircle2, RotateCcw, Save, 
  X, Tag, Folder, Eye, Columns, User, Filter, ChevronRight, 
  RefreshCw, Check, ArrowLeft, Shield, Crown, FileEdit, Sparkles
} from 'lucide-react';
import { noteService } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import ConfirmModal from './ConfirmModal';

const CATEGORIES = [
  'All',
  'General',
  'Lecture',
  'Meeting',
  'Brainstorm',
  'Research',
  'Summary',
  'Code'
];

const COLOR_THEMES = [
  { id: 'blue', label: 'Blue', border: 'border-blue-500/30', bg: 'bg-blue-500/10', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300' },
  { id: 'purple', label: 'Purple', border: 'border-purple-500/30', bg: 'bg-purple-500/10', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300' },
  { id: 'emerald', label: 'Emerald', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300' },
  { id: 'amber', label: 'Amber', border: 'border-amber-500/30', bg: 'bg-amber-500/10', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300' },
  { id: 'rose', label: 'Rose', border: 'border-rose-500/30', bg: 'bg-rose-500/10', text: 'text-rose-400', badge: 'bg-rose-500/20 text-rose-300' },
  { id: 'cyan', label: 'Cyan', border: 'border-cyan-500/30', bg: 'bg-cyan-500/10', text: 'text-cyan-400', badge: 'bg-cyan-500/20 text-cyan-300' },
  { id: 'slate', label: 'Slate', border: 'border-slate-600', bg: 'bg-slate-800/40', text: 'text-slate-400', badge: 'bg-slate-700 text-slate-300' },
];

// Simple, fast client-side markdown formatter for preview
const renderMarkdownPreview = (text) => {
  if (!text) return '<p class="text-slate-500 italic">No note content written yet...</p>';

  const lines = text.split('\n');
  const htmlLines = [];
  let inCodeBlock = false;
  let codeBlockBuffer = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        htmlLines.push(`<pre class="bg-slate-950 text-slate-200 p-3 rounded-xl my-2 text-xs font-mono overflow-x-auto border border-slate-800"><code>${codeBlockBuffer.join('\n')}</code></pre>`);
        codeBlockBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockBuffer.push(line.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      continue;
    }

    // Headers
    if (line.startsWith('# ')) {
      htmlLines.push(`<h1 class="text-xl font-bold text-white mt-4 mb-2">${escapeAndFormatInline(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith('## ')) {
      htmlLines.push(`<h2 class="text-lg font-bold text-slate-100 mt-3 mb-1.5">${escapeAndFormatInline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('### ')) {
      htmlLines.push(`<h3 class="text-sm font-bold text-slate-200 mt-2 mb-1">${escapeAndFormatInline(line.slice(4))}</h3>`);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      htmlLines.push(`<blockquote class="border-l-4 border-blue-500/60 pl-3 py-1 my-2 text-slate-300 italic bg-blue-500/5 rounded-r">${escapeAndFormatInline(line.slice(2))}</blockquote>`);
      continue;
    }

    // Bullet lists
    if (line.trim().startsWith('- [ ] ')) {
      htmlLines.push(`<div class="flex items-center gap-2 my-1 text-slate-300 text-xs"><input type="checkbox" disabled class="rounded border-slate-700 text-blue-500" /> <span>${escapeAndFormatInline(line.trim().slice(6))}</span></div>`);
      continue;
    }
    if (line.trim().startsWith('- [x] ') || line.trim().startsWith('- [X] ')) {
      htmlLines.push(`<div class="flex items-center gap-2 my-1 text-slate-400 line-through text-xs"><input type="checkbox" checked disabled class="rounded border-slate-700 text-blue-500" /> <span>${escapeAndFormatInline(line.trim().slice(6))}</span></div>`);
      continue;
    }
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      htmlLines.push(`<li class="ml-4 list-disc text-slate-300 text-xs my-0.5">${escapeAndFormatInline(line.trim().slice(2))}</li>`);
      continue;
    }

    // Numbered list
    const numMatch = line.trim().match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      htmlLines.push(`<li class="ml-4 list-decimal text-slate-300 text-xs my-0.5">${escapeAndFormatInline(numMatch[2])}</li>`);
      continue;
    }

    // Divider
    if (line.trim() === '---' || line.trim() === '***') {
      htmlLines.push(`<hr class="border-slate-800 my-4" />`);
      continue;
    }

    // Regular paragraph
    if (line.trim()) {
      htmlLines.push(`<p class="text-slate-300 text-xs leading-relaxed my-1.5">${escapeAndFormatInline(line)}</p>`);
    } else {
      htmlLines.push(`<div class="h-2"></div>`);
    }
  }

  return htmlLines.join('');
};

const escapeAndFormatInline = (str) => {
  let s = str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Bold
  s = s.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
  // Italic
  s = s.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
  // Inline code
  s = s.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-[11px] text-blue-300">$1</code>');
  // Links
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">$1</a>');
  return s;
};

const ProjectNotesTab = ({ projectId, project, currentUser, userRole }) => {
  const toast = useToast();
  const socketContext = useSocket();
  const socket = socketContext?.socket;

  // Notes state
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [activeNote, setActiveNote] = useState(null);
  const [loadingNote, setLoadingNote] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState('updatedAt');

  // Editor states
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorCategory, setEditorCategory] = useState('General');
  const [editorTags, setEditorTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [editorColor, setEditorColor] = useState('blue');
  const [editorPinned, setEditorPinned] = useState(false);

  // Autosave status: 'saved' | 'saving' | 'unsaved' | 'error' | 'conflict'
  const [saveStatus, setSaveStatus] = useState('saved');
  const [saveError, setSaveError] = useState(null);
  const [conflictData, setConflictData] = useState(null);

  // Editor view mode: 'edit' | 'preview' | 'split'
  const [viewMode, setViewMode] = useState('edit');

  // History & Revision Modal
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState(null);
  const [noteToDelete, setNoteToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Autosave timer ref
  const autosaveTimerRef = useRef(null);
  const lastSavedPayloadRef = useRef(null);
  const textareaRef = useRef(null);

  // Permissions
  const isOwner = userRole === 'Owner' || project?.owner?._id === currentUser?._id || project?.owner === currentUser?._id;
  const isAdmin = userRole === 'Admin';
  const canModerate = isOwner || isAdmin;

  // 1. Fetch notes list
  const fetchNotes = useCallback(async (selectFirst = false) => {
    if (!projectId) return;
    try {
      setLoading(true);
      const params = {
        sortBy,
        sortOrder: 'desc',
      };
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (selectedCategory && selectedCategory !== 'All') params.category = selectedCategory;

      const data = await noteService.getNotes(projectId, params);
      const fetchedNotes = data.notes || [];
      setNotes(fetchedNotes);

      // Auto-select first note if none selected or requested
      if (selectFirst && fetchedNotes.length > 0 && !selectedNoteId) {
        loadNoteDetail(fetchedNotes[0]._id);
      }
    } catch (err) {
      console.error('Failed to load notes:', err);
      toast.error('Failed to load project notes: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, searchQuery, selectedCategory, sortBy]);

  // Load single note details (including full content & revisions)
  const loadNoteDetail = async (noteId) => {
    if (!noteId) return;
    try {
      setLoadingNote(true);
      setConflictData(null);
      const note = await noteService.getNoteById(projectId, noteId);
      setActiveNote(note);
      setSelectedNoteId(note._id);

      // Populate editor form
      setEditorTitle(note.title || '');
      setEditorContent(note.content || '');
      setEditorCategory(note.category || 'General');
      setEditorTags(note.tags || []);
      setEditorColor(note.color || 'blue');
      setEditorPinned(Boolean(note.isPinned));

      lastSavedPayloadRef.current = {
        title: note.title || '',
        content: note.content || '',
        category: note.category || 'General',
        tags: note.tags || [],
        color: note.color || 'blue',
        isPinned: Boolean(note.isPinned),
        version: note.version,
      };

      setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to load note detail:', err);
      toast.error('Could not load note content: ' + err.message);
    } finally {
      setLoadingNote(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchNotes(true);
  }, [fetchNotes]);

  // Real-time socket updates for note events
  useEffect(() => {
    if (!socket || !projectId) return;

    const handleNoteCreated = (newNote) => {
      setNotes(prev => {
        if (prev.some(n => n._id === newNote._id)) return prev;
        return [newNote, ...prev];
      });
    };

    const handleNoteUpdated = (updatedNote) => {
      setNotes(prev => prev.map(n => n._id === updatedNote._id ? { ...n, ...updatedNote } : n));
      // If currently open note was updated by someone else
      setActiveNote(current => {
        if (current && current._id === updatedNote._id) {
          const editorId = updatedNote.lastEditor?._id || updatedNote.lastEditor;
          if (editorId !== currentUser?._id && saveStatus !== 'saving') {
            // Background update notification
            setConflictData({
              serverNote: updatedNote,
              message: `This note was updated remotely by ${updatedNote.lastEditor?.name || 'another member'}.`,
            });
          }
        }
        return current;
      });
    };

    const handleNoteDeleted = ({ noteId }) => {
      setNotes(prev => prev.filter(n => n._id !== noteId));
      if (selectedNoteId === noteId) {
        setActiveNote(null);
        setSelectedNoteId(null);
      }
    };

    socket.on('note:created', handleNoteCreated);
    socket.on('note:updated', handleNoteUpdated);
    socket.on('note:deleted', handleNoteDeleted);

    return () => {
      socket.off('note:created', handleNoteCreated);
      socket.off('note:updated', handleNoteUpdated);
      socket.off('note:deleted', handleNoteDeleted);
    };
  }, [socket, projectId, currentUser?._id, selectedNoteId, saveStatus]);

  // Save current note changes (autosave or manual)
  const saveNoteChanges = async (isManual = false, forceOverwrite = false) => {
    if (!activeNote || !activeNote._id) return;
    if (!editorTitle.trim()) {
      if (isManual) toast.error('Note title cannot be blank');
      return;
    }

    const payload = {
      title: editorTitle.trim(),
      content: editorContent,
      category: editorCategory,
      tags: editorTags,
      color: editorColor,
      isPinned: editorPinned,
      expectedVersion: activeNote.version,
      force: forceOverwrite,
    };

    // Check if nothing changed
    const last = lastSavedPayloadRef.current;
    if (
      !forceOverwrite &&
      last &&
      last.title === payload.title &&
      last.content === payload.content &&
      last.category === payload.category &&
      last.isPinned === payload.isPinned &&
      last.color === payload.color &&
      JSON.stringify(last.tags) === JSON.stringify(payload.tags)
    ) {
      setSaveStatus('saved');
      return;
    }

    try {
      setSaveStatus('saving');
      setSaveError(null);

      const updated = await noteService.updateNote(projectId, activeNote._id, payload);

      setActiveNote(updated);
      setConflictData(null);
      lastSavedPayloadRef.current = {
        title: updated.title,
        content: updated.content,
        category: updated.category,
        tags: updated.tags,
        color: updated.color,
        isPinned: updated.isPinned,
        version: updated.version,
      };

      // Update in local notes list
      setNotes(prev => prev.map(n => n._id === updated._id ? { ...n, ...updated } : n));
      setSaveStatus('saved');

      if (isManual) {
        toast.success(`Note "${updated.title}" saved (v${updated.version})`);
      }
    } catch (err) {
      console.error('Note update failed:', err);
      // Check for 409 conflict
      if (err.status === 409 || err.code === 'CONCURRENCY_CONFLICT' || err.message?.includes('modified by another')) {
        setSaveStatus('conflict');
        setConflictData({
          message: err.message || 'Conflict detected: A newer version of this note exists on the server.',
          serverNote: err.serverNote,
        });
      } else {
        setSaveStatus('error');
        setSaveError(err.message || 'Failed to save changes');
        if (isManual) toast.error('Save failed: ' + (err.message || 'Server error'));
      }
    }
  };

  // Debounced Autosave Trigger (1500ms)
  useEffect(() => {
    if (!activeNote || !selectedNoteId) return;

    // Check if anything actually differs from last saved state
    const last = lastSavedPayloadRef.current;
    if (!last) return;

    const hasChanges =
      editorTitle !== last.title ||
      editorContent !== last.content ||
      editorCategory !== last.category ||
      editorPinned !== last.isPinned ||
      editorColor !== last.color ||
      JSON.stringify(editorTags) !== JSON.stringify(last.tags);

    if (hasChanges && saveStatus !== 'conflict') {
      setSaveStatus('unsaved');
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

      autosaveTimerRef.current = setTimeout(() => {
        saveNoteChanges(false, false);
      }, 1500);
    }

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [editorTitle, editorContent, editorCategory, editorTags, editorPinned, editorColor]);

  // Keyboard shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveNoteChanges(true, false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeNote, editorTitle, editorContent, editorCategory, editorTags, editorPinned, editorColor]);

  // Create new blank note
  const handleCreateNote = async () => {
    try {
      const defaultTitle = `Untitled Study Note - ${new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
      const newNote = await noteService.createNote(projectId, {
        title: defaultTitle,
        content: '# New Study Note\n\nStart jotting down thoughts, study concepts, or meeting items here...',
        category: selectedCategory !== 'All' ? selectedCategory : 'General',
        tags: [],
        color: 'blue',
      });

      setNotes(prev => [newNote, ...prev]);
      setActiveNote(newNote);
      setSelectedNoteId(newNote._id);
      setEditorTitle(newNote.title);
      setEditorContent(newNote.content);
      setEditorCategory(newNote.category);
      setEditorTags(newNote.tags);
      setEditorColor(newNote.color);
      setEditorPinned(false);
      lastSavedPayloadRef.current = {
        title: newNote.title,
        content: newNote.content,
        category: newNote.category,
        tags: newNote.tags,
        color: newNote.color,
        isPinned: false,
        version: newNote.version,
      };
      setSaveStatus('saved');
      toast.success('New study note created');
    } catch (err) {
      toast.error('Failed to create note: ' + err.message);
    }
  };

  // Delete note
  const handleDeleteConfirm = async () => {
    if (!noteToDelete) return;
    try {
      setIsDeleting(true);
      await noteService.deleteNote(projectId, noteToDelete._id);
      setNotes(prev => prev.filter(n => n._id !== noteToDelete._id));
      if (selectedNoteId === noteToDelete._id) {
        setActiveNote(null);
        setSelectedNoteId(null);
      }
      toast.success(`Deleted "${noteToDelete.title}"`);
      setNoteToDelete(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete note');
    } finally {
      setIsDeleting(false);
    }
  };

  // Restore Revision
  const handleRestoreRevision = async (targetVersion) => {
    if (!activeNote || !activeNote._id) return;
    try {
      setRestoringVersion(targetVersion);
      const res = await noteService.restoreRevision(projectId, activeNote._id, targetVersion);
      const restored = res.note;
      setActiveNote(restored);
      setEditorTitle(restored.title);
      setEditorContent(restored.content);
      setEditorCategory(restored.category);
      setEditorTags(restored.tags);
      setEditorColor(restored.color);
      setEditorPinned(restored.isPinned);

      lastSavedPayloadRef.current = {
        title: restored.title,
        content: restored.content,
        category: restored.category,
        tags: restored.tags,
        color: restored.color,
        isPinned: restored.isPinned,
        version: restored.version,
      };

      setNotes(prev => prev.map(n => n._id === restored._id ? { ...n, ...restored } : n));
      setSaveStatus('saved');
      setIsHistoryOpen(false);
      toast.success(res.message || `Restored revision v${targetVersion}`);
    } catch (err) {
      toast.error('Failed to restore revision: ' + err.message);
    } finally {
      setRestoringVersion(null);
    }
  };

  // Add tag
  const handleAddTag = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagInput.trim().replace(/^#/, '');
      if (val && !editorTags.includes(val)) {
        setEditorTags(prev => [...prev, val]);
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setEditorTags(prev => prev.filter(t => t !== tagToRemove));
  };

  // Helper formatting shortcuts for textarea
  const insertFormatting = (prefix, suffix = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = editorContent.substring(start, end);
    const replacement = `${prefix}${selected || 'text'}${suffix}`;

    const newContent = editorContent.substring(0, start) + replacement + editorContent.substring(end);
    setEditorContent(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + (selected.length || 4));
    }, 10);
  };

  // Filtered notes list for search and categories
  const filteredNotes = useMemo(() => {
    return notes.filter(n => {
      if (selectedCategory !== 'All' && n.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = n.title?.toLowerCase().includes(q);
        const matchesTags = n.tags?.some(t => t.toLowerCase().includes(q));
        if (!matchesTitle && !matchesTags) return false;
      }
      return true;
    });
  }, [notes, selectedCategory, searchQuery]);

  return (
    <div className="h-[calc(100vh-170px)] min-h-[600px] flex flex-col bg-slate-950 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl">
      
      {/* Top Main Bar */}
      <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              Project Study Notes
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                {notes.length} {notes.length === 1 ? 'note' : 'notes'}
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Shared team notebook with revision history & optimistic conflict protection
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateNote}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Note</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Layout (Sidebar Notes List + Main Editor Panel) */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT SIDEBAR: Notes Directory */}
        <aside className="w-80 sm:w-88 border-r border-slate-800/80 bg-slate-900/30 flex flex-col shrink-0">
          
          {/* Search & Sort Controls */}
          <div className="p-3 border-b border-slate-800/60 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search notes or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] scrollbar-none">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg shrink-0 font-medium transition-colors ${
                    selectedCategory === cat 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Notes List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500 space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
                <span className="text-xs">Loading notes...</span>
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="text-center py-12 px-4">
                <BookOpen className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-400">No study notes found</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {searchQuery ? 'Try matching another search term' : 'Click "New Note" to create the first one'}
                </p>
              </div>
            ) : (
              filteredNotes.map(note => {
                const isSelected = selectedNoteId === note._id;
                const theme = COLOR_THEMES.find(t => t.id === note.color) || COLOR_THEMES[0];

                return (
                  <div
                    key={note._id}
                    onClick={() => loadNoteDetail(note._id)}
                    className={`group relative p-3 rounded-xl border transition-all cursor-pointer text-left ${
                      isSelected 
                        ? `${theme.bg} ${theme.border} shadow-md` 
                        : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/40 hover:border-slate-700/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {note.isPinned && (
                          <Pin className="w-3 h-3 text-amber-400 shrink-0 fill-amber-400/30" />
                        )}
                        <h4 className={`text-xs font-semibold truncate ${isSelected ? 'text-white' : 'text-slate-200 group-hover:text-white'}`}>
                          {note.title || 'Untitled'}
                        </h4>
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0">
                        v{note.version}
                      </span>
                    </div>

                    {/* Excerpt preview */}
                    <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 font-normal leading-relaxed">
                      {note.content ? note.content.replace(/[#*`>_-]/g, '').slice(0, 90) : 'Empty note...'}
                    </p>

                    {/* Metadata Footer */}
                    <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-slate-800/50 text-[10px] text-slate-500">
                      <span className={`px-1.5 py-0.5 rounded font-medium ${theme.badge}`}>
                        {note.category || 'General'}
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Clock className="w-2.5 h-2.5 text-slate-600" />
                        <span>
                          {new Date(note.updatedAt || note.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* RIGHT MAIN PANEL: Note Editor / Viewer */}
        <main className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
          {loadingNote ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
              <span className="text-xs">Loading note content...</span>
            </div>
          ) : !activeNote ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-4 shadow-inner">
                <FileEdit className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-slate-200">No Note Selected</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Select a note from the left sidebar to view and edit its content, or create a new note for your project.
              </p>
              <button
                onClick={handleCreateNote}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Note</span>
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              
              {/* Conflict Alert Banner */}
              {conflictData && (
                <div className="bg-amber-500/10 border-b border-amber-500/30 px-5 py-2.5 flex items-center justify-between gap-3 text-amber-300 text-xs shrink-0 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{conflictData.message}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => loadNoteDetail(activeNote._id)}
                      className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-lg text-[11px] font-semibold transition-colors"
                    >
                      Reload Server Version
                    </button>
                    <button
                      onClick={() => saveNoteChanges(true, true)}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[11px] font-semibold transition-colors"
                    >
                      Overwrite With My Changes
                    </button>
                  </div>
                </div>
              )}

              {/* Note Header Toolbar */}
              <div className="px-6 py-3 border-b border-slate-800/80 bg-slate-900/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
                
                {/* Autosave & Metadata Badges */}
                <div className="flex items-center gap-3">
                  {saveStatus === 'saved' && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                      <Check className="w-3.5 h-3.5" />
                      Saved (v{activeNote.version})
                    </span>
                  )}
                  {saveStatus === 'saving' && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-blue-400 font-medium">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Autosaving...
                    </span>
                  )}
                  {saveStatus === 'unsaved' && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                      Unsaved edits
                    </span>
                  )}
                  {saveStatus === 'conflict' && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Version conflict
                    </span>
                  )}

                  <span className="text-slate-700">|</span>

                  {/* Creator / Editor Info */}
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <User className="w-3 h-3 text-slate-500" />
                    Last edited by <strong className="text-slate-300 font-medium">{activeNote.lastEditor?.name || 'Teammate'}</strong>
                  </span>
                </div>

                {/* Actions & View Modes */}
                <div className="flex items-center gap-2">
                  
                  {/* View Mode Toggle */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-0.5 flex items-center text-xs">
                    <button
                      onClick={() => setViewMode('edit')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${viewMode === 'edit' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                      title="Editor only"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setViewMode('split')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-colors hidden sm:block ${viewMode === 'split' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                      title="Split editor & preview"
                    >
                      <Columns className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setViewMode('preview')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${viewMode === 'preview' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                      title="Preview only"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Pin Toggle */}
                  <button
                    onClick={() => {
                      setEditorPinned(p => !p);
                    }}
                    className={`p-1.5 rounded-xl border text-xs transition-colors ${
                      editorPinned 
                        ? 'bg-amber-500/20 border-amber-500/30 text-amber-300' 
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                    title={editorPinned ? 'Unpin note' : 'Pin note to top'}
                  >
                    <Pin className={`w-3.5 h-3.5 ${editorPinned ? 'fill-amber-300' : ''}`} />
                  </button>

                  {/* Revision History Modal Trigger */}
                  <button
                    onClick={() => setIsHistoryOpen(true)}
                    className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                    title="Revision history & restore"
                  >
                    <History className="w-3.5 h-3.5" />
                  </button>

                  {/* Save Now Button */}
                  <button
                    onClick={() => saveNoteChanges(true, false)}
                    disabled={saveStatus === 'saving'}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5 text-blue-400" />
                    <span className="hidden sm:inline">Save</span>
                  </button>

                  {/* Delete Button (Creator, Owner, or Admin) */}
                  {(activeNote.creator?._id === currentUser?._id || canModerate) && (
                    <button
                      onClick={() => setNoteToDelete(activeNote)}
                      className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-colors"
                      title="Delete note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Title, Category & Color Tag Row */}
              <div className="px-6 pt-4 pb-2 space-y-3 shrink-0">
                <input
                  type="text"
                  placeholder="Note Title..."
                  value={editorTitle}
                  onChange={(e) => setEditorTitle(e.target.value)}
                  maxLength={200}
                  className="w-full text-xl font-bold text-white bg-transparent border-0 focus:outline-none focus:ring-0 placeholder:text-slate-600"
                />

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {/* Category selector */}
                  <div className="flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-slate-500" />
                    <select
                      value={editorCategory}
                      onChange={(e) => setEditorCategory(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-blue-500/60"
                    >
                      {CATEGORIES.filter(c => c !== 'All').map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* Color Accent Picker */}
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-slate-500" />
                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
                      {COLOR_THEMES.map(theme => (
                        <button
                          key={theme.id}
                          onClick={() => setEditorColor(theme.id)}
                          className={`w-3.5 h-3.5 rounded-full transition-transform ${
                            theme.id === 'blue' ? 'bg-blue-500' :
                            theme.id === 'purple' ? 'bg-purple-500' :
                            theme.id === 'emerald' ? 'bg-emerald-500' :
                            theme.id === 'amber' ? 'bg-amber-500' :
                            theme.id === 'rose' ? 'bg-rose-500' :
                            theme.id === 'cyan' ? 'bg-cyan-500' : 'bg-slate-500'
                          } ${editorColor === theme.id ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-slate-950' : 'opacity-70 hover:opacity-100'}`}
                          title={theme.label}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                    {editorTags.map(tag => (
                      <span 
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[11px] text-slate-300"
                      >
                        #{tag}
                        <button 
                          onClick={() => handleRemoveTag(tag)}
                          className="text-slate-500 hover:text-slate-300"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      placeholder="Add tag + Enter..."
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleAddTag}
                      className="bg-transparent text-[11px] text-slate-300 placeholder:text-slate-600 focus:outline-none w-28"
                    />
                  </div>
                </div>

                {/* Markdown Formatting Quick Buttons */}
                {viewMode !== 'preview' && (
                  <div className="flex items-center gap-1 pt-2 border-t border-slate-800/60 overflow-x-auto text-[11px] text-slate-400">
                    <button onClick={() => insertFormatting('**', '**')} className="px-2 py-1 bg-slate-900 hover:bg-slate-800 rounded font-bold hover:text-white" title="Bold">B</button>
                    <button onClick={() => insertFormatting('*', '*')} className="px-2 py-1 bg-slate-900 hover:bg-slate-800 rounded italic hover:text-white" title="Italic">I</button>
                    <button onClick={() => insertFormatting('# ')} className="px-2 py-1 bg-slate-900 hover:bg-slate-800 rounded font-semibold hover:text-white" title="Heading 1">H1</button>
                    <button onClick={() => insertFormatting('## ')} className="px-2 py-1 bg-slate-900 hover:bg-slate-800 rounded font-semibold hover:text-white" title="Heading 2">H2</button>
                    <button onClick={() => insertFormatting('- ')} className="px-2 py-1 bg-slate-900 hover:bg-slate-800 rounded hover:text-white" title="Bullet List">• List</button>
                    <button onClick={() => insertFormatting('- [ ] ')} className="px-2 py-1 bg-slate-900 hover:bg-slate-800 rounded hover:text-white" title="Task checkbox">☑ Task</button>
                    <button onClick={() => insertFormatting('> ')} className="px-2 py-1 bg-slate-900 hover:bg-slate-800 rounded hover:text-white" title="Quote">“ Quote</button>
                    <button onClick={() => insertFormatting('```\n', '\n```')} className="px-2 py-1 bg-slate-900 hover:bg-slate-800 rounded font-mono hover:text-white" title="Code block">&lt;/&gt;</button>
                    <button onClick={() => insertFormatting('[Link Title](', ')')} className="px-2 py-1 bg-slate-900 hover:bg-slate-800 rounded hover:text-white" title="Hyperlink">Link</button>
                    <button onClick={() => insertFormatting('\n---\n')} className="px-2 py-1 bg-slate-900 hover:bg-slate-800 rounded hover:text-white" title="Horizontal Divider">— Line</button>
                  </div>
                )}
              </div>

              {/* Main Content Area: Editor & Preview */}
              <div className="flex-1 flex overflow-hidden px-6 pb-6 pt-2 gap-4">
                
                {/* Editor Textarea */}
                {(viewMode === 'edit' || viewMode === 'split') && (
                  <div className="flex-1 flex flex-col h-full overflow-hidden">
                    <textarea
                      ref={textareaRef}
                      value={editorContent}
                      onChange={(e) => setEditorContent(e.target.value)}
                      placeholder="Write your study notes using markdown..."
                      className="w-full flex-1 p-4 bg-slate-900/60 border border-slate-800 rounded-2xl text-slate-200 font-mono text-xs leading-relaxed focus:outline-none focus:border-blue-500/50 resize-none overflow-y-auto"
                    />
                  </div>
                )}

                {/* Formatted Preview */}
                {(viewMode === 'preview' || viewMode === 'split') && (
                  <div className="flex-1 flex flex-col h-full overflow-hidden">
                    <div 
                      className="w-full flex-1 p-5 bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-y-auto prose prose-invert max-w-none text-xs"
                      dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(editorContent) }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* REVISION HISTORY DRAWER / MODAL */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-slate-950 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-white">Revision History</h3>
              </div>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Revisions List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <p className="text-xs text-slate-400 leading-relaxed">
                StudySync saves previous versions when edits occur. You can restore any past version at any time.
              </p>

              {(!activeNote?.revisions || activeNote.revisions.length === 0) ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  No prior revisions recorded yet.
                </div>
              ) : (
                activeNote.revisions.map((rev) => (
                  <div
                    key={rev._id || rev.version}
                    className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[10px] font-bold">
                        Revision v{rev.version}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(rev.editedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <h4 className="text-xs font-semibold text-slate-200 truncate">
                      {rev.title}
                    </h4>

                    {rev.changeSummary && (
                      <p className="text-[11px] text-slate-400 italic">
                        "{rev.changeSummary}"
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                      <span className="text-[10px] text-slate-500">
                        By {rev.editedBy?.name || 'Teammate'}
                      </span>

                      <button
                        onClick={() => handleRestoreRevision(rev.version)}
                        disabled={restoringVersion !== null}
                        className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-[10px] font-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>Restore v{rev.version}</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Note Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(noteToDelete)}
        onClose={() => setNoteToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Study Note"
        message={`Are you sure you want to delete note "${noteToDelete?.title || 'this note'}"? All revisions and contents will be permanently removed.`}
        confirmText="Delete Note"
        isDanger={true}
        isLoading={isDeleting}
      />
    </div>
  );
};

export default ProjectNotesTab;
