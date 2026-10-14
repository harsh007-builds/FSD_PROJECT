import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Search, X, ExternalLink, CheckCircle2, Clock, AlertTriangle, 
  Briefcase, Folder, User, Tag, ArrowRight, CornerDownLeft, 
  SlidersHorizontal, Filter, RefreshCw, ChevronLeft, ChevronRight,
  Sparkles, CheckSquare, Layers
} from 'lucide-react';
import { searchService, projectService } from '../services/api';
import { useToast } from '../context/ToastContext';

const STATUS_COLORS = {
  Backlog: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  Todo: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'In Progress': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  Review: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  Completed: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

const PRIORITY_COLORS = {
  Low: 'text-slate-400 bg-slate-800 border-slate-700',
  Medium: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  High: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  Urgent: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
};

const GlobalSearchModal = ({ 
  isOpen, 
  onClose, 
  onNavigateToProject, 
  onOpenTaskDetails 
}) => {
  const toast = useToast();
  const inputRef = useRef(null);

  // Search state
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [type, setType] = useState('all'); // 'all' | 'projects' | 'tasks' | 'resources'
  
  // Filter states
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assignee, setAssignee] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [sortBy, setSortBy] = useState('relevance');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  // Accessible projects list for filter dropdown
  const [accessibleProjects, setAccessibleProjects] = useState([]);

  // Results state
  const [resultsData, setResultsData] = useState({
    results: [],
    counts: { projects: 0, tasks: 0, resources: 0, total: 0 },
    grouped: { projects: [], tasks: [], resources: [] },
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Active keyboard navigation index
  const [activeIndex, setActiveIndex] = useState(0);

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1); // Reset page on new query
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      // Fetch accessible projects for filter dropdown
      projectService.getProjects()
        .then(res => setAccessibleProjects(res || []))
        .catch(() => {});
    } else {
      setQuery('');
      setDebouncedQuery('');
      setActiveIndex(0);
      setShowFilters(false);
    }
  }, [isOpen]);

  // Perform search
  const performSearch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        q: debouncedQuery,
        type,
        page,
        limit: 15,
        sortBy,
        sortOrder,
      };
      if (status) params.status = status;
      if (priority) params.priority = priority;
      if (assignee) params.assignee = assignee;
      if (selectedProjectId) params.projectId = selectedProjectId;

      const data = await searchService.search(params);
      setResultsData(data);
      setActiveIndex(0);
    } catch (err) {
      console.error('Search request failed:', err);
      setError(err.message || 'Failed to perform search');
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, type, status, priority, assignee, selectedProjectId, sortBy, sortOrder, page]);

  useEffect(() => {
    if (isOpen) {
      performSearch();
    }
  }, [isOpen, performSearch]);

  // Flattened results for keyboard navigation
  const currentItems = resultsData.results || [];

  // Item selection handler
  const handleSelectItem = (item) => {
    if (!item) return;

    if (item.resultType === 'project') {
      onClose();
      if (onNavigateToProject) {
        onNavigateToProject(item._id);
      }
    } else if (item.resultType === 'task') {
      onClose();
      if (onOpenTaskDetails) {
        onOpenTaskDetails(item, item.project?._id || item.project);
      } else if (onNavigateToProject) {
        onNavigateToProject(item.project?._id || item.project);
      }
    } else if (item.resultType === 'resource') {
      if (item.url) {
        window.open(item.url, '_blank', 'noopener,noreferrer');
      } else if (item.task?._id && onNavigateToProject) {
        onClose();
        onNavigateToProject(item.project?._id || item.project);
      }
    }
  };

  // Keyboard navigation handler
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % Math.max(1, currentItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + currentItems.length) % Math.max(1, currentItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentItems[activeIndex]) {
        handleSelectItem(currentItems[activeIndex]);
      }
    }
  };

  // Reset filters
  const handleResetFilters = () => {
    setStatus('');
    setPriority('');
    setAssignee('');
    setSelectedProjectId('');
    setSortBy('relevance');
    setSortOrder('desc');
    setPage(1);
  };

  const hasActiveFilters = Boolean(status || priority || assignee || selectedProjectId || sortBy !== 'relevance');

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 sm:pt-16 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Global Search Palette"
      >
        {/* SEARCH INPUT BAR */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-slate-800 bg-slate-900/90">
          <Search className="w-5 h-5 text-slate-400 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, tasks, labels, resources... (Press Esc to exit)"
            className="w-full bg-transparent text-sm sm:text-base text-white placeholder-slate-500 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-slate-400 hover:text-white mr-2"
              title="Clear search query"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setShowFilters(prev => !prev)}
            className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors ${
              showFilters || hasActiveFilters
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-700'
            }`}
            title="Toggle filters"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filters</span>
            {hasActiveFilters && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            )}
          </button>
        </div>

        {/* CATEGORY TABS */}
        <div className="px-4 py-2 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between gap-2 overflow-x-auto text-xs">
          <div className="flex items-center gap-1">
            {[
              { id: 'all', label: `All (${resultsData.counts?.total || 0})` },
              { id: 'projects', label: `Projects (${resultsData.counts?.projects || 0})` },
              { id: 'tasks', label: `Tasks (${resultsData.counts?.tasks || 0})` },
              { id: 'resources', label: `Resources (${resultsData.counts?.resources || 0})` },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setType(tab.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  type === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">↵</kbd>
              open
            </span>
          </div>
        </div>

        {/* EXPANDABLE FILTER ROW */}
        {showFilters && (
          <div className="p-3 bg-slate-950/80 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs animate-in slide-in-from-top-2 duration-150">
            {/* Project Filter */}
            <div>
              <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">Project</label>
              <select
                value={selectedProjectId}
                onChange={(e) => { setSelectedProjectId(e.target.value); setPage(1); }}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Projects</option>
                {accessibleProjects.map(p => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="Todo">Todo</option>
                <option value="In Progress">In Progress</option>
                <option value="Review">Review</option>
                <option value="Completed">Completed</option>
                <option value="Backlog">Backlog</option>
              </select>
            </div>

            {/* Priority Filter */}
            <div>
              <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => { setPriority(e.target.value); setPage(1); }}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Priorities</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>

            {/* Assignee Filter */}
            <div>
              <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">Assignee</label>
              <select
                value={assignee}
                onChange={(e) => { setAssignee(e.target.value); setPage(1); }}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Assignees</option>
                <option value="me">Assigned to Me</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </div>

            {/* Sort Filter & Reset */}
            <div>
              <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">Sort By</label>
              <div className="flex items-center gap-1.5">
                <select
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="relevance">Relevance</option>
                  <option value="dueDate">Due Date</option>
                  <option value="priority">Priority</option>
                  <option value="name">Name / Title</option>
                  <option value="createdAt">Created Date</option>
                </select>
                {hasActiveFilters && (
                  <button
                    onClick={handleResetFilters}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                    title="Reset all filters"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* RESULTS SCROLLABLE LIST */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-3 divide-y divide-slate-800/40">
          {loading ? (
            <div className="py-16 text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Searching your authorized workspace...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-red-400 text-xs">
              <AlertTriangle className="w-6 h-6 mx-auto mb-2 opacity-80" />
              <p className="font-semibold">Search encountered an error</p>
              <p className="text-slate-500 mt-1">{error}</p>
            </div>
          ) : currentItems.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/40 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto mb-3">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-300">No matching records found</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {query 
                  ? `No accessible projects, tasks, or resources matched "${query}". Try adjusting keywords or clearing active filters.`
                  : 'Start typing to search projects, tasks, deadlines, and indexed resource links.'}
              </p>
            </div>
          ) : (
            currentItems.map((item, idx) => {
              const isSelected = idx === activeIndex;

              // RENDER PROJECT RESULT
              if (item.resultType === 'project') {
                return (
                  <div
                    key={`p_${item._id}`}
                    onClick={() => handleSelectItem(item)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 border ${
                      isSelected 
                        ? 'bg-blue-600/15 border-blue-500/40 shadow-sm' 
                        : 'border-transparent hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                        <Folder className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">Project</span>
                          <span className="text-sm font-medium text-white truncate">{item.name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                            {item.status}
                          </span>
                        </div>
                        {item.description && (
                          <p className="text-xs text-slate-400 truncate mt-0.5 max-w-md">{item.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-400 hidden sm:inline">{item.progress || 0}% complete</span>
                      <ArrowRight className={`w-4 h-4 text-slate-400 transition-transform ${isSelected ? 'translate-x-1 text-blue-400' : ''}`} />
                    </div>
                  </div>
                );
              }

              // RENDER TASK RESULT
              if (item.resultType === 'task') {
                const statusStyle = STATUS_COLORS[item.status] || STATUS_COLORS.Todo;
                const priorityStyle = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.Medium;

                return (
                  <div
                    key={`t_${item._id}`}
                    onClick={() => handleSelectItem(item)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 border ${
                      isSelected 
                        ? 'bg-blue-600/15 border-blue-500/40 shadow-sm' 
                        : 'border-transparent hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                        <CheckSquare className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Task</span>
                          <span className="text-sm font-medium text-white truncate">{item.title}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-md border font-medium ${statusStyle}`}>
                            {item.status}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-md border font-medium ${priorityStyle}`}>
                            {item.priority}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                          {item.project?.name && (
                            <span className="truncate max-w-[140px] text-slate-400">
                              📁 {item.project.name}
                            </span>
                          )}
                          {item.assignee?.name && (
                            <span className="truncate max-w-[120px] flex items-center gap-1 text-slate-400">
                              <User className="w-3 h-3" /> {item.assignee.name}
                            </span>
                          )}
                          {item.dueDate && (
                            <span className="flex items-center gap-1 text-slate-400">
                              <Clock className="w-3 h-3" /> {new Date(item.dueDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <ArrowRight className={`w-4 h-4 text-slate-400 transition-transform ${isSelected ? 'translate-x-1 text-blue-400' : ''}`} />
                    </div>
                  </div>
                );
              }

              // RENDER RESOURCE RESULT
              if (item.resultType === 'resource') {
                return (
                  <div
                    key={`r_${item._id}`}
                    onClick={() => handleSelectItem(item)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 border ${
                      isSelected 
                        ? 'bg-blue-600/15 border-blue-500/40 shadow-sm' 
                        : 'border-transparent hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                        <ExternalLink className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">Resource</span>
                          <span className="text-sm font-medium text-blue-400 underline underline-offset-2 truncate">
                            {item.url}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          From task: {item.task?.title}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-500 hidden sm:inline">Open URL</span>
                      <ExternalLink className={`w-4 h-4 text-purple-400 transition-transform ${isSelected ? 'scale-110' : ''}`} />
                    </div>
                  </div>
                );
              }

              return null;
            })
          )}
        </div>

        {/* MODAL FOOTER & PAGINATION */}
        <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing {currentItems.length} of {resultsData.total} results
          </div>

          {resultsData.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition-colors"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-medium text-slate-300">
                Page {page} of {resultsData.totalPages}
              </span>
              <button
                onClick={() => setPage(prev => Math.min(resultsData.totalPages, prev + 1))}
                disabled={page >= resultsData.totalPages}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition-colors"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GlobalSearchModal;
