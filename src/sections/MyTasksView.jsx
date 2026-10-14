import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  CheckSquare, Clock, AlertTriangle, CheckCircle2, Circle, 
  Folder, User, Tag, Search, Filter, SlidersHorizontal, 
  Bookmark, BookmarkPlus, Trash2, ArrowUpDown, RefreshCw, 
  ExternalLink, Calendar, ChevronLeft, ChevronRight, X, Plus
} from 'lucide-react';
import { searchService, taskService, projectService } from '../services/api';
import { useUser } from '../context/UserContext';
import { useRouter } from '../context/RouterContext';
import { useToast } from '../context/ToastContext';
import TaskDetailsDrawer from '../components/TaskDetailsDrawer';
import TaskModal from '../components/TaskModal';

const STATUS_OPTIONS = ['Backlog', 'Todo', 'In Progress', 'Review', 'Completed'];
const PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Urgent'];

const STATUS_COLORS = {
  Backlog: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  Todo: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'In Progress': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Review: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

const PRIORITY_COLORS = {
  Low: 'bg-slate-800 text-slate-400 border-slate-700',
  Medium: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  High: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  Urgent: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

const MyTasksView = () => {
  const { user } = useUser();
  const { navigateToProject } = useRouter();
  const toast = useToast();

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [projectId, setProjectId] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // 'all' | 'today' | 'upcoming' | 'overdue'
  const [sortBy, setSortBy] = useState('dueDate');
  const [sortOrder, setSortOrder] = useState('asc');
  const [page, setPage] = useState(1);
  const limit = 12;

  // Data state
  const [tasks, setTasks] = useState([]);
  const [summary, setSummary] = useState({
    totalAssigned: 0,
    dueToday: 0,
    overdue: 0,
    completed: 0,
    inProgress: 0,
  });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Accessible projects for dropdown
  const [projectsList, setProjectsList] = useState([]);

  // Saved filter presets
  const [savedFilters, setSavedFilters] = useState([]);
  const [isSavingFilter, setIsSavingFilter] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [savingFilterLoading, setSavingFilterLoading] = useState(false);

  // Drawer / Modals
  const [selectedTaskForDrawer, setSelectedTaskForDrawer] = useState(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Load accessible projects and saved filters on mount
  useEffect(() => {
    projectService.getProjects()
      .then(res => setProjectsList(res || []))
      .catch(err => console.error('Failed to load projects:', err));

    loadSavedFilters();
  }, []);

  const loadSavedFilters = async () => {
    try {
      const filters = await searchService.getSavedFilters();
      setSavedFilters(filters || []);
    } catch (err) {
      console.error('Failed to load saved filters:', err);
    }
  };

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        page,
        limit,
        sortBy,
        sortOrder,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (status) params.status = status;
      if (priority) params.priority = priority;
      if (projectId) params.projectId = projectId;
      if (dateFilter && dateFilter !== 'all') params.dateFilter = dateFilter;

      const data = await searchService.getMyTasks(params);
      setTasks(data.tasks || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (err) {
      console.error('Failed to fetch personal tasks:', err);
      setError(err.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status, priority, projectId, dateFilter, sortBy, sortOrder, page]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Quick toggle task status
  const handleToggleComplete = async (e, task) => {
    e.stopPropagation();
    const newStatus = task.status === 'Completed' ? 'Todo' : 'Completed';
    try {
      // Optimistic update
      setTasks(prev => prev.map(t => t._id === task._id ? { ...t, status: newStatus } : t));
      await taskService.updateTaskStatus(task._id, newStatus);
      toast.success(newStatus === 'Completed' ? 'Task marked as completed!' : 'Task reopened');
      fetchTasks();
    } catch (err) {
      toast.error('Failed to update task status');
      fetchTasks();
    }
  };

  // Apply a saved filter preset
  const handleApplySavedFilter = (preset) => {
    if (!preset || !preset.filters) return;
    const f = preset.filters;
    setStatus(f.status || '');
    setPriority(f.priority || '');
    setProjectId(f.projectId || '');
    setDateFilter(f.dateFilter || 'all');
    setSortBy(f.sortBy || 'dueDate');
    setSortOrder(f.sortOrder || 'asc');
    if (f.search) setSearch(f.search);
    setPage(1);
    toast.info(`Applied filter preset: ${preset.name}`);
  };

  // Save current filter preset
  const handleSaveFilter = async (e) => {
    e.preventDefault();
    if (!newFilterName.trim()) {
      toast.error('Please enter a name for the filter preset');
      return;
    }
    try {
      setSavingFilterLoading(true);
      const filters = {
        status: status || undefined,
        priority: priority || undefined,
        projectId: projectId || undefined,
        dateFilter: dateFilter !== 'all' ? dateFilter : undefined,
        sortBy,
        sortOrder,
        search: search.trim() || undefined,
      };
      const created = await searchService.createSavedFilter({
        name: newFilterName.trim(),
        filters,
      });
      setSavedFilters(prev => [...prev, created]);
      setNewFilterName('');
      setIsSavingFilter(false);
      toast.success('Filter preset saved!');
    } catch (err) {
      toast.error(err.message || 'Failed to save filter preset');
    } finally {
      setSavingFilterLoading(false);
    }
  };

  // Delete saved filter preset
  const handleDeleteSavedFilter = async (e, id) => {
    e.stopPropagation();
    try {
      await searchService.deleteSavedFilter(id);
      setSavedFilters(prev => prev.filter(f => f._id !== id));
      toast.success('Filter preset removed');
    } catch (err) {
      toast.error('Failed to delete filter preset');
    }
  };

  // Reset all active filters
  const handleResetFilters = () => {
    setSearch('');
    setStatus('');
    setPriority('');
    setProjectId('');
    setDateFilter('all');
    setSortBy('dueDate');
    setSortOrder('asc');
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    search || status || priority || projectId || dateFilter !== 'all' || sortBy !== 'dueDate'
  );

  return (
    <div className="flex-1 bg-slate-950 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto animate-in fade-in duration-200">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">My Tasks</h1>
              <p className="text-sm text-slate-400">
                Track, filter, and organize all tasks assigned to you across projects
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchTasks()}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Refresh tasks"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
          
          <button
            onClick={() => setIsSavingFilter(prev => !prev)}
            className={`px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-2 transition-all ${
              isSavingFilter
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <BookmarkPlus className="w-4 h-4 text-blue-400" />
            <span>Save Filter View</span>
          </button>
        </div>
      </div>

      {/* SUMMARY STATS TILES */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
        {/* Total Assigned */}
        <div 
          onClick={() => { setDateFilter('all'); setStatus(''); setPage(1); }}
          className={`p-4 rounded-2xl border cursor-pointer transition-all ${
            dateFilter === 'all' && !status
              ? 'bg-blue-600/10 border-blue-500/40 shadow-lg shadow-blue-500/5'
              : 'bg-slate-900/60 border-slate-800 hover:bg-slate-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assigned</span>
            <CheckSquare className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{summary.totalAssigned}</div>
          <span className="text-[11px] text-slate-500">Across all projects</span>
        </div>

        {/* Due Today */}
        <div 
          onClick={() => { setDateFilter('today'); setStatus(''); setPage(1); }}
          className={`p-4 rounded-2xl border cursor-pointer transition-all ${
            dateFilter === 'today'
              ? 'bg-amber-600/15 border-amber-500/50 shadow-lg shadow-amber-500/5'
              : 'bg-slate-900/60 border-slate-800 hover:bg-slate-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Due Today</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-300 mt-2">{summary.dueToday}</div>
          <span className="text-[11px] text-slate-500">Requires attention</span>
        </div>

        {/* Overdue */}
        <div 
          onClick={() => { setDateFilter('overdue'); setStatus(''); setPage(1); }}
          className={`p-4 rounded-2xl border cursor-pointer transition-all ${
            dateFilter === 'overdue'
              ? 'bg-rose-600/15 border-rose-500/50 shadow-lg shadow-rose-500/5'
              : 'bg-slate-900/60 border-slate-800 hover:bg-slate-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-400">Overdue</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-2">{summary.overdue}</div>
          <span className="text-[11px] text-slate-500">Past deadline</span>
        </div>

        {/* In Progress */}
        <div 
          onClick={() => { setStatus('In Progress'); setDateFilter('all'); setPage(1); }}
          className={`p-4 rounded-2xl border cursor-pointer transition-all ${
            status === 'In Progress'
              ? 'bg-indigo-600/15 border-indigo-500/50 shadow-lg shadow-indigo-500/5'
              : 'bg-slate-900/60 border-slate-800 hover:bg-slate-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">In Progress</span>
            <Circle className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-indigo-300 mt-2">{summary.inProgress}</div>
          <span className="text-[11px] text-slate-500">Active work</span>
        </div>

        {/* Completed */}
        <div 
          onClick={() => { setStatus('Completed'); setDateFilter('all'); setPage(1); }}
          className={`p-4 rounded-2xl border cursor-pointer transition-all ${
            status === 'Completed'
              ? 'bg-emerald-600/15 border-emerald-500/50 shadow-lg shadow-emerald-500/5'
              : 'bg-slate-900/60 border-slate-800 hover:bg-slate-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-2">{summary.completed}</div>
          <span className="text-[11px] text-slate-500">Finished tasks</span>
        </div>
      </div>

      {/* SAVE FILTER INLINE MODAL */}
      {isSavingFilter && (
        <form 
          onSubmit={handleSaveFilter}
          className="mb-6 p-4 rounded-2xl bg-slate-900/90 border border-blue-500/30 flex flex-col sm:flex-row items-center gap-3 animate-in slide-in-from-top-2 duration-150"
        >
          <Bookmark className="w-5 h-5 text-blue-400 shrink-0 hidden sm:block" />
          <div className="flex-1 w-full">
            <input
              type="text"
              value={newFilterName}
              onChange={(e) => setNewFilterName(e.target.value)}
              placeholder="Enter preset name (e.g., 'High Priority Tasks', 'Sprint Bugs')..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="submit"
              disabled={savingFilterLoading || !newFilterName.trim()}
              className="btn-primary py-2 px-4 text-xs font-medium disabled:opacity-50"
            >
              {savingFilterLoading ? 'Saving...' : 'Save Preset'}
            </button>
            <button
              type="button"
              onClick={() => { setIsSavingFilter(false); setNewFilterName(''); }}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* SAVED FILTER PRESETS ROW */}
      {savedFilters.length > 0 && (
        <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider shrink-0 flex items-center gap-1.5 mr-1">
            <Bookmark className="w-3.5 h-3.5" /> Saved Views:
          </span>
          {savedFilters.map((preset) => (
            <div
              key={preset._id}
              onClick={() => handleApplySavedFilter(preset)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white cursor-pointer shrink-0 transition-colors group"
            >
              <span className="font-medium">{preset.name}</span>
              <button
                type="button"
                onClick={(e) => handleDeleteSavedFilter(e, preset._id)}
                className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity p-0.5"
                title="Delete preset"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* SEARCH AND FILTERS TOOLBAR */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 mb-6 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your assigned tasks, descriptions, labels..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Date Range Pills */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1 self-stretch sm:self-auto overflow-x-auto text-xs">
            {[
              { id: 'all', label: 'All Dates' },
              { id: 'today', label: 'Due Today' },
              { id: 'overdue', label: 'Overdue' },
              { id: 'upcoming', label: 'Upcoming' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setDateFilter(tab.id); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  dateFilter === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dropdowns Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 text-xs">
          {/* Project Filter */}
          <div>
            <select
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Projects</option>
              {projectsList.map(p => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <select
              value={priority}
              onChange={(e) => { setPriority(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Priorities</option>
              {PRIORITY_OPTIONS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Sort By Filter */}
          <div>
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="dueDate">Sort: Due Date</option>
              <option value="priority">Sort: Priority</option>
              <option value="status">Sort: Status</option>
              <option value="title">Sort: Title</option>
              <option value="createdAt">Sort: Created Date</option>
            </select>
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <div className="col-span-2 sm:col-span-4 lg:col-span-1 flex items-center">
              <button
                onClick={handleResetFilters}
                className="w-full py-2 px-3 rounded-xl bg-slate-950 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 transition-colors flex items-center justify-center gap-1.5 font-medium"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* TASK LIST CONTAINER */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="py-24 text-center">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-400">Loading your assigned tasks...</p>
          </div>
        ) : error ? (
          <div className="py-16 text-center text-rose-400">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-80" />
            <p className="text-sm font-semibold">Failed to fetch tasks</p>
            <p className="text-xs text-slate-500 mt-1">{error}</p>
            <button
              onClick={() => fetchTasks()}
              className="mt-4 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-white"
            >
              Try Again
            </button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="py-20 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700 flex items-center justify-center text-slate-400 mx-auto mb-3">
              <CheckSquare className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-white">No tasks match your criteria</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {hasActiveFilters 
                ? 'Try clearing active filters or searching with different keywords.'
                : 'You have no tasks assigned to you right now. Create or assign tasks within your project workspaces.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="mt-4 px-4 py-2 rounded-xl bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 text-xs font-medium"
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {tasks.map((task) => {
              const statusStyle = STATUS_COLORS[task.status] || STATUS_COLORS.Todo;
              const priorityStyle = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.Medium;
              const isCompleted = task.status === 'Completed';

              // Due date calculations
              let isOverdue = false;
              let isDueToday = false;
              if (task.dueDate && !isCompleted) {
                const due = new Date(task.dueDate);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const dueDay = new Date(due);
                dueDay.setHours(0, 0, 0, 0);
                if (dueDay.getTime() === today.getTime()) {
                  isDueToday = true;
                } else if (dueDay.getTime() < today.getTime()) {
                  isOverdue = true;
                }
              }

              return (
                <div
                  key={task._id}
                  onClick={() => setSelectedTaskForDrawer(task)}
                  className="p-4 hover:bg-slate-850/50 cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    {/* Completion checkbox button */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleComplete(e, task)}
                      className="mt-0.5 sm:mt-0 text-slate-500 hover:text-emerald-400 transition-colors shrink-0"
                      title={isCompleted ? 'Mark as incomplete' : 'Mark as completed'}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-500/20" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${isCompleted ? 'line-through text-slate-500' : 'text-white'}`}>
                          {task.title}
                        </span>
                        
                        <span className={`text-[10px] px-2 py-0.5 rounded-md border font-medium ${statusStyle}`}>
                          {task.status}
                        </span>

                        <span className={`text-[10px] px-2 py-0.5 rounded-md border font-medium ${priorityStyle}`}>
                          {task.priority}
                        </span>

                        {isOverdue && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Overdue
                          </span>
                        )}

                        {isDueToday && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Due Today
                          </span>
                        )}
                      </div>

                      {task.description && (
                        <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                          {task.description}
                        </p>
                      )}

                      {/* Tags & Project row */}
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-2 flex-wrap">
                        {task.project && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateToProject(task.project._id || task.project);
                            }}
                            className="flex items-center gap-1 text-blue-400 hover:underline hover:text-blue-300"
                            title="Go to project workspace"
                          >
                            <Folder className="w-3.5 h-3.5" />
                            <span>{task.project.name || 'View Project'}</span>
                          </button>
                        )}

                        {task.dueDate && (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                          </span>
                        )}

                        {task.labels && task.labels.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Tag className="w-3 h-3 text-slate-500" />
                            {task.labels.map(lbl => (
                              <span key={lbl} className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                                {lbl}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side quick action */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTaskForDrawer(task);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors opacity-80 group-hover:opacity-100"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* PAGINATION FOOTER */}
        <div className="px-4 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing {tasks.length} of {total} assigned tasks
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition-colors"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-slate-300 font-medium">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition-colors"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* TASK DETAILS DRAWER */}
      {selectedTaskForDrawer && (
        <TaskDetailsDrawer
          task={{
            ...selectedTaskForDrawer,
            id: selectedTaskForDrawer._id || selectedTaskForDrawer.id,
          }}
          isOpen={Boolean(selectedTaskForDrawer)}
          onClose={() => setSelectedTaskForDrawer(null)}
          onEdit={() => {
            setEditingTask(selectedTaskForDrawer);
            setSelectedTaskForDrawer(null);
            setIsTaskModalOpen(true);
          }}
          onDelete={async (id) => {
            try {
              await taskService.deleteTask(id);
              toast.success('Task deleted successfully');
              setSelectedTaskForDrawer(null);
              fetchTasks();
            } catch (err) {
              toast.error('Failed to delete task');
            }
          }}
          onStatusChange={async (id, newStatus) => {
            try {
              await taskService.updateTaskStatus(id, newStatus);
              toast.success(`Task moved to ${newStatus}`);
              setSelectedTaskForDrawer(prev => prev ? { ...prev, status: newStatus } : null);
              fetchTasks();
            } catch (err) {
              toast.error('Failed to update status');
            }
          }}
          onAddComment={async (id, text) => {
            const comment = await taskService.addComment(id, text);
            setSelectedTaskForDrawer(prev => prev ? {
              ...prev,
              comments: [...(prev.comments || []), comment]
            } : null);
            fetchTasks();
          }}
          onDeleteComment={async (id, commentId) => {
            await taskService.deleteComment(id, commentId);
            setSelectedTaskForDrawer(prev => prev ? {
              ...prev,
              comments: (prev.comments || []).filter(c => (c._id || c.id) !== commentId)
            } : null);
            fetchTasks();
          }}
          currentUser={user}
        />
      )}

      {/* TASK EDIT MODAL */}
      {isTaskModalOpen && editingTask && (
        <TaskModal
          isOpen={isTaskModalOpen}
          onClose={() => {
            setIsTaskModalOpen(false);
            setEditingTask(null);
          }}
          initialData={editingTask}
          onSubmit={async (taskData) => {
            try {
              await taskService.updateTask(editingTask._id || editingTask.id, taskData);
              toast.success('Task updated successfully');
              setIsTaskModalOpen(false);
              setEditingTask(null);
              fetchTasks();
            } catch (err) {
              toast.error(err.message || 'Failed to update task');
            }
          }}
          projects={projectsList}
        />
      )}
    </div>
  );
};

export default MyTasksView;
