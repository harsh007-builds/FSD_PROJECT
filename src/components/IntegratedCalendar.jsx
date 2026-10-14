import React, { useState, useMemo, useCallback } from 'react';
import { 
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, 
  Filter, Plus, Search, CheckCircle2, Clock, AlertTriangle, 
  BookOpen, Flag, User, Briefcase, ListFilter, X, 
  RotateCcw, Sparkles, CheckSquare, Layers, FolderKanban
} from 'lucide-react';
import { 
  formatDateKey, toDateKey, createSafeDateString, 
  fromInputDateToIso, getTodayKey, isTaskOverdue, 
  isTaskDueToday, isTaskUpcoming, getWeekDays, 
  getMonthGrid, formatHumanDate 
} from '../utils/dateUtils';
import { useToast } from '../context/ToastContext';
import TaskDetailsDrawer from './TaskDetailsDrawer';
import TaskModal from './TaskModal';

const EVENT_TYPE_STYLES = {
  'Task': {
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    icon: CheckSquare,
    label: 'Task',
  },
  'Study Session': {
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    icon: BookOpen,
    label: 'Study Session',
  },
  'Milestone': {
    badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    icon: Flag,
    label: 'Milestone',
  },
};

const IntegratedCalendar = ({
  projectId = null, // Scoped to specific project if provided, otherwise across all projects
  projects = [],
  tasks = [],
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onTaskStatusChange,
  onAddComment,
  onDeleteComment,
  currentUser,
  isLoading = false,
  title = null,
}) => {
  const toast = useToast();

  // Navigation State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week' | 'agenda'

  // Filter States
  const [selectedProject, setSelectedProject] = useState(projectId || 'all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState('all');
  const [selectedAssignee, setSelectedAssignee] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Drag and Drop state
  const [dragOverDateKey, setDragOverDateKey] = useState(null);

  // Modals state
  const [selectedTask, setSelectedTask] = useState(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [modalInitialData, setModalInitialData] = useState(null);
  const [modalInitialDate, setModalInitialDate] = useState('');
  const [modalInitialType, setModalInitialType] = useState('Task');

  // Derive current calendar numbers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Navigation handlers
  const handlePrev = () => {
    if (viewMode === 'month' || viewMode === 'agenda') {
      setCurrentDate(new Date(year, month - 1, 1));
    } else if (viewMode === 'week') {
      const prevWeek = new Date(currentDate);
      prevWeek.setDate(prevWeek.getDate() - 7);
      setCurrentDate(prevWeek);
    }
  };

  const handleNext = () => {
    if (viewMode === 'month' || viewMode === 'agenda') {
      setCurrentDate(new Date(year, month + 1, 1));
    } else if (viewMode === 'week') {
      const nextWeek = new Date(currentDate);
      nextWeek.setDate(nextWeek.getDate() + 7);
      setCurrentDate(nextWeek);
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Header Title based on view
  const headerDateLabel = useMemo(() => {
    if (viewMode === 'month' || viewMode === 'agenda') {
      return currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    } else {
      const weekDays = getWeekDays(currentDate);
      const start = weekDays[0].date;
      const end = weekDays[6].date;
      const startMonth = start.toLocaleString('default', { month: 'short' });
      const endMonth = end.toLocaleString('default', { month: 'short' });
      if (startMonth === endMonth) {
        return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
      }
      return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
    }
  }, [currentDate, viewMode]);

  // Determine active project object
  const activeProjectObj = useMemo(() => {
    if (projectId) return projects.find(p => p.id === projectId) || null;
    if (selectedProject !== 'all') return projects.find(p => p.id === selectedProject) || null;
    return null;
  }, [projectId, selectedProject, projects]);

  // Aggregate and Normalize Events
  const allEvents = useMemo(() => {
    const list = [];

    // 1. Tasks & Study Sessions
    tasks.forEach(t => {
      const pId = t.projectId || (t.project?._id ? t.project._id : t.project);
      
      // Determine type
      let type = t.type || 'Task';
      if ((t.labels || []).some(l => l.toLowerCase() === 'study-session' || l.toLowerCase() === 'study session')) {
        type = 'Study Session';
      }

      list.push({
        id: t.id,
        kind: 'task',
        title: t.task || t.title,
        description: t.description,
        dueDate: t.dueDate,
        dateKey: toDateKey(t.dueDate),
        priority: t.priority || 'Medium',
        status: t.status || 'Todo',
        type,
        projectId: pId,
        project: t.project || projects.find(p => p.id === pId),
        assignee: t.assignee,
        labels: t.labels || [],
        rawTask: t,
      });
    });

    // 2. Project Milestones (Project Deadlines)
    const targetProjects = projectId 
      ? projects.filter(p => p.id === projectId) 
      : projects;

    targetProjects.forEach(p => {
      if (p.deadline) {
        list.push({
          id: `proj-dl-${p.id}`,
          kind: 'milestone',
          title: `Milestone: ${p.name} Final Due`,
          description: p.description,
          dueDate: p.deadline,
          dateKey: toDateKey(p.deadline),
          priority: 'Urgent',
          status: p.status === 'Completed' ? 'Completed' : 'Todo',
          type: 'Milestone',
          projectId: p.id,
          project: p,
          assignee: p.owner,
          labels: ['milestone', 'project-deadline'],
          rawProject: p,
        });
      }
    });

    return list;
  }, [tasks, projects, projectId]);

  // Filter Events
  const filteredEvents = useMemo(() => {
    return allEvents.filter(ev => {
      // Scoped project check
      if (projectId && ev.projectId !== projectId) return false;
      if (!projectId && selectedProject !== 'all' && ev.projectId !== selectedProject) return false;

      // Status filter
      if (selectedStatus !== 'all' && ev.status !== selectedStatus) return false;

      // Priority filter
      if (selectedPriority !== 'all' && ev.priority !== selectedPriority) return false;

      // Type filter
      if (selectedType !== 'all' && ev.type !== selectedType) return false;

      // Assignee filter
      if (selectedAssignee !== 'all') {
        const assigneeId = ev.assignee?._id ? ev.assignee._id.toString() : ev.assignee?.toString();
        if (selectedAssignee === 'me') {
          if (currentUser && assigneeId !== currentUser._id.toString()) return false;
        } else if (assigneeId !== selectedAssignee) {
          return false;
        }
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (ev.title || '').toLowerCase().includes(q);
        const matchDesc = (ev.description || '').toLowerCase().includes(q);
        const matchLabels = (ev.labels || []).some(l => l.toLowerCase().includes(q));
        if (!matchTitle && !matchDesc && !matchLabels) return false;
      }

      return true;
    });
  }, [
    allEvents, projectId, selectedProject, selectedStatus, 
    selectedPriority, selectedType, selectedAssignee, searchQuery, currentUser
  ]);

  // Map events by dateKey for fast O(1) lookup
  const eventsByDate = useMemo(() => {
    const map = {};
    filteredEvents.forEach(ev => {
      if (!ev.dateKey) return;
      if (!map[ev.dateKey]) map[ev.dateKey] = [];
      map[ev.dateKey].push(ev);
    });
    return map;
  }, [filteredEvents]);

  // Check if filters are actively applied
  const isFilterActive = useMemo(() => {
    return (!projectId && selectedProject !== 'all') ||
      selectedStatus !== 'all' ||
      selectedPriority !== 'all' ||
      selectedAssignee !== 'all' ||
      selectedType !== 'all' ||
      searchQuery.trim().length > 0;
  }, [projectId, selectedProject, selectedStatus, selectedPriority, selectedAssignee, selectedType, searchQuery]);

  const resetFilters = () => {
    if (!projectId) setSelectedProject('all');
    setSelectedStatus('all');
    setSelectedPriority('all');
    setSelectedAssignee('all');
    setSelectedType('all');
    setSearchQuery('');
  };

  // Drag and Drop Rescheduling Handler
  const handleDragStart = (e, eventItem) => {
    if (eventItem.kind !== 'task') return; // Only tasks can be rescheduled directly
    e.dataTransfer.setData('text/plain', JSON.stringify({ taskId: eventItem.id }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, dateKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDateKey !== dateKey) {
      setDragOverDateKey(dateKey);
    }
  };

  const handleDragLeave = (e, dateKey) => {
    if (dragOverDateKey === dateKey) {
      setDragOverDateKey(null);
    }
  };

  const handleDrop = async (e, targetDateKey) => {
    e.preventDefault();
    setDragOverDateKey(null);
    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const { taskId } = JSON.parse(raw);
      if (!taskId || !onUpdateTask) return;

      const safeIso = fromInputDateToIso(targetDateKey);
      await onUpdateTask(taskId, { dueDate: safeIso });
      toast.success(`Rescheduled to ${formatHumanDate(targetDateKey)}`);
    } catch (err) {
      console.error('Failed to reschedule task:', err);
      toast.error('Failed to reschedule task.');
    }
  };

  // Modal open helpers
  const handleOpenCreateForDate = (dateKey, type = 'Task') => {
    setModalInitialData(null);
    setModalInitialDate(dateKey);
    setModalInitialType(type);
    setIsTaskModalOpen(true);
  };

  const handleEventClick = (eventItem) => {
    if (eventItem.kind === 'task') {
      setSelectedTask(eventItem.rawTask);
    } else if (eventItem.kind === 'milestone') {
      toast.info(`Milestone: "${eventItem.title}" deadline`);
    }
  };

  const handleEditTaskFromDrawer = (taskToEdit) => {
    setSelectedTask(null);
    setModalInitialData(taskToEdit);
    setModalInitialDate(taskToEdit.dueDate ? toDateKey(taskToEdit.dueDate) : '');
    setModalInitialType(taskToEdit.type || 'Task');
    setIsTaskModalOpen(true);
  };

  const handleSaveTaskModal = async (taskPayload) => {
    if (modalInitialData) {
      await onUpdateTask(modalInitialData.id, taskPayload);
      toast.success('Task updated successfully');
    } else {
      await onAddTask(taskPayload);
      toast.success(`${taskPayload.type || 'Task'} scheduled successfully`);
    }
  };

  // Month grid structure
  const monthCells = useMemo(() => {
    return getMonthGrid(year, month);
  }, [year, month]);

  // Week days structure
  const weekDays = useMemo(() => {
    return getWeekDays(currentDate);
  }, [currentDate]);

  // Agenda items (sorted chronologically)
  const agendaSections = useMemo(() => {
    const overdueList = [];
    const upcomingMap = {};

    const todayKey = getTodayKey();

    filteredEvents.forEach(ev => {
      if (!ev.dueDate) return;
      const isOver = isTaskOverdue(ev.dueDate, ev.status);
      if (isOver) {
        overdueList.push(ev);
      } else {
        if (!upcomingMap[ev.dateKey]) upcomingMap[ev.dateKey] = [];
        upcomingMap[ev.dateKey].push(ev);
      }
    });

    // Sort overdue by date ascending (oldest first)
    overdueList.sort((a, b) => (a.dateKey > b.dateKey ? 1 : -1));

    // Sort upcoming dates ascending
    const sortedUpcomingDates = Object.keys(upcomingMap).sort();

    return {
      overdueList,
      sortedUpcomingDates,
      upcomingMap,
    };
  }, [filteredEvents]);

  // Render Event Pill in Month & Week view
  const renderEventChip = (ev) => {
    const isCompleted = ev.status === 'Completed';
    const isOverdue = isTaskOverdue(ev.dueDate, ev.status);
    const isToday = isTaskDueToday(ev.dueDate, ev.status);

    let borderStyle = 'border-slate-800 bg-slate-900/80 text-slate-300';
    let iconColor = 'text-blue-400';

    if (isCompleted) {
      borderStyle = 'border-green-500/20 bg-green-500/10 text-green-400 line-through';
      iconColor = 'text-green-400';
    } else if (isOverdue) {
      borderStyle = 'border-red-500/30 bg-red-500/10 text-red-300 shadow-sm shadow-red-500/10';
      iconColor = 'text-red-400';
    } else if (isToday) {
      borderStyle = 'border-amber-500/40 bg-amber-500/10 text-amber-200';
      iconColor = 'text-amber-400';
    } else if (ev.type === 'Study Session') {
      borderStyle = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
      iconColor = 'text-emerald-400';
    } else if (ev.type === 'Milestone') {
      borderStyle = 'border-purple-500/30 bg-purple-500/10 text-purple-300 font-semibold';
      iconColor = 'text-purple-400';
    }

    return (
      <div
        key={ev.id}
        draggable={ev.kind === 'task'}
        onDragStart={(e) => handleDragStart(e, ev)}
        onClick={() => handleEventClick(ev)}
        className={`group text-[11px] px-2 py-1 rounded-md border flex items-center justify-between gap-1.5 cursor-pointer transition-all hover:scale-[1.02] ${borderStyle}`}
        title={`${ev.title} (${ev.status}) - ${ev.project?.name || 'Project'}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {ev.type === 'Study Session' ? (
            <BookOpen className={`w-3 h-3 shrink-0 ${iconColor}`} />
          ) : ev.type === 'Milestone' ? (
            <Flag className={`w-3 h-3 shrink-0 ${iconColor}`} />
          ) : isCompleted ? (
            <CheckCircle2 className={`w-3 h-3 shrink-0 ${iconColor}`} />
          ) : isOverdue ? (
            <AlertTriangle className={`w-3 h-3 shrink-0 ${iconColor}`} />
          ) : (
            <CheckSquare className={`w-3 h-3 shrink-0 ${iconColor}`} />
          )}
          <span className="truncate">{ev.title}</span>
        </div>
        
        {ev.priority === 'Urgent' && !isCompleted && (
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-ping" />
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0F1C] overflow-hidden">
      {/* Calendar Header Bar */}
      <div className="p-4 lg:p-6 border-b border-slate-800 bg-slate-950/60 shrink-0">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          
          {/* Left: Title & Navigation */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-between lg:justify-start">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  {title || (projectId ? 'Project Calendar & Deadlines' : 'Personal Calendar & Schedule')}
                </h1>
                <p className="text-xs text-slate-400 font-medium">{headerDateLabel}</p>
              </div>
            </div>

            {/* Navigation Controls */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl">
              <button 
                onClick={handleToday}
                className="px-3 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Today
              </button>
              <div className="h-4 w-px bg-slate-800" />
              <button 
                onClick={handlePrev}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={handleNext}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right: View Switcher, Filter Toggle & Add Button */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-between lg:justify-end">
            
            {/* View Switcher */}
            <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs font-semibold">
              {['month', 'week', 'agenda'].map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 rounded-lg capitalize transition-all ${
                    viewMode === mode
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                showFilters || isFilterActive
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filters</span>
              {isFilterActive && (
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              )}
            </button>

            {/* Quick Add Button */}
            <button
              onClick={() => handleOpenCreateForDate(getTodayKey(), 'Task')}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors shadow-lg shadow-blue-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>New Event</span>
            </button>
          </div>
        </div>

        {/* Expandable Filter Drawer / Row */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 animate-fadeIn space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
              
              {/* Project Filter (only in global view) */}
              {!projectId && (
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Project</label>
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Projects ({projects.length})</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Status Filter */}
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Status</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="Backlog">Backlog</option>
                  <option value="Todo">Todo</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Review">Review</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              {/* Priority Filter */}
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Priority</label>
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="all">All Priorities</option>
                  <option value="Urgent">Urgent</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              {/* Event Type Filter */}
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Type</label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="all">All Types</option>
                  <option value="Task">Tasks Only</option>
                  <option value="Study Session">Study Sessions Only</option>
                  <option value="Milestone">Milestones Only</option>
                </select>
              </div>

              {/* Assignee Filter */}
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Assignee</label>
                <select
                  value={selectedAssignee}
                  onChange={(e) => setSelectedAssignee(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="all">Everyone</option>
                  {currentUser && <option value="me">Assigned to Me</option>}
                  {activeProjectObj && activeProjectObj.members?.map(m => (
                    <option key={m._id || m} value={m._id || m}>{m.name || 'Member'}</option>
                  ))}
                </select>
              </div>

              {/* Keyword Search */}
              <div className="relative">
                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Search</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter by title..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Clear filters badge */}
            {isFilterActive && (
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-400">
                  Showing <strong>{filteredEvents.length}</strong> matching events
                </span>
                <button
                  onClick={resetFilters}
                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300 font-semibold"
                >
                  <RotateCcw className="w-3 h-3" /> Clear Filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Calendar Body */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        
        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-400">Syncing calendar events...</p>
          </div>
        )}

        {!isLoading && (
          <>
            {/* 1. MONTH VIEW */}
            {viewMode === 'month' && (
              <div className="space-y-2">
                {/* Day Header Names */}
                <div className="grid grid-cols-7 border-b border-slate-800 pb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(dayName => (
                    <div key={dayName} className="text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {dayName}
                    </div>
                  ))}
                </div>

                {/* Month Grid */}
                <div className="grid grid-cols-7 border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40 divide-x divide-y divide-slate-800/60 shadow-xl">
                  {monthCells.map((cell, idx) => {
                    if (cell === null) {
                      return (
                        <div 
                          key={`empty-${idx}`} 
                          className="min-h-[120px] bg-slate-950/20 border-b border-slate-800/30" 
                        />
                      );
                    }

                    const { day, dateKey, isToday } = cell;
                    const dayEvents = eventsByDate[dateKey] || [];
                    const isDragTarget = dragOverDateKey === dateKey;

                    return (
                      <div
                        key={dateKey}
                        onDragOver={(e) => handleDragOver(e, dateKey)}
                        onDragLeave={(e) => handleDragLeave(e, dateKey)}
                        onDrop={(e) => handleDrop(e, dateKey)}
                        className={`group min-h-[120px] p-2 flex flex-col justify-between transition-colors relative ${
                          isDragTarget 
                            ? 'bg-blue-500/15 ring-2 ring-blue-500/60 z-10' 
                            : isToday 
                              ? 'bg-blue-500/5' 
                              : 'hover:bg-slate-900/30'
                        }`}
                      >
                        {/* Day Number and Quick Action Header */}
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                            isToday
                              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                              : 'text-slate-400 group-hover:text-slate-200'
                          }`}>
                            {day}
                          </span>

                          <button
                            onClick={() => handleOpenCreateForDate(dateKey, 'Task')}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-white rounded hover:bg-slate-800 transition-all"
                            title={`Add task for ${formatHumanDate(dateKey)}`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Events list for this day */}
                        <div className="flex-1 space-y-1 overflow-y-auto max-h-[88px] pr-0.5 scrollbar-thin">
                          {dayEvents.map(ev => renderEventChip(ev))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. WEEK VIEW */}
            {viewMode === 'week' && (
              <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                {weekDays.map(({ date, day, dateKey, isToday }) => {
                  const dayEvents = eventsByDate[dateKey] || [];
                  const isDragTarget = dragOverDateKey === dateKey;
                  const dayName = date.toLocaleDateString('default', { weekday: 'short' });

                  return (
                    <div
                      key={dateKey}
                      onDragOver={(e) => handleDragOver(e, dateKey)}
                      onDragLeave={(e) => handleDragLeave(e, dateKey)}
                      onDrop={(e) => handleDrop(e, dateKey)}
                      className={`flex flex-col bg-slate-900/40 border rounded-2xl p-3 min-h-[460px] transition-all ${
                        isDragTarget
                          ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/50'
                          : isToday
                            ? 'border-blue-500/40 bg-blue-500/5 shadow-lg shadow-blue-500/5'
                            : 'border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      {/* Column Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{dayName}</p>
                          <h4 className={`text-sm font-extrabold ${isToday ? 'text-blue-400' : 'text-white'}`}>
                            {date.toLocaleDateString('default', { month: 'short' })} {day}
                          </h4>
                        </div>
                        <button
                          onClick={() => handleOpenCreateForDate(dateKey, 'Task')}
                          className="p-1.5 text-slate-500 hover:text-white bg-slate-800/40 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Schedule item"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Events list */}
                      <div className="flex-1 space-y-2 overflow-y-auto">
                        {dayEvents.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center p-4 text-center border border-dashed border-slate-800/50 rounded-xl">
                            <p className="text-xs text-slate-600 font-medium">No events</p>
                            <button
                              onClick={() => handleOpenCreateForDate(dateKey, 'Task')}
                              className="mt-2 text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
                            >
                              + Add Item
                            </button>
                          </div>
                        ) : (
                          dayEvents.map(ev => renderEventChip(ev))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 3. AGENDA / LIST VIEW */}
            {viewMode === 'agenda' && (
              <div className="max-w-4xl mx-auto space-y-6">
                
                {/* Overdue Section */}
                {agendaSections.overdueList.length > 0 && (
                  <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center gap-2 mb-4 text-red-400 font-bold text-sm">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Overdue Tasks ({agendaSections.overdueList.length})</span>
                    </div>

                    <div className="space-y-2.5">
                      {agendaSections.overdueList.map(ev => (
                        <div
                          key={ev.id}
                          onClick={() => handleEventClick(ev)}
                          className="flex items-center justify-between p-3.5 bg-slate-950/80 border border-red-500/20 rounded-xl hover:border-red-500/40 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                            <div className="min-w-0">
                              <h5 className="text-xs font-bold text-white truncate">{ev.title}</h5>
                              <p className="text-[11px] text-red-400">
                                Due {formatHumanDate(ev.dateKey)} • Project: {ev.project?.name || 'Project'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                              Overdue
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                              {ev.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upcoming Schedule */}
                {agendaSections.sortedUpcomingDates.length === 0 && agendaSections.overdueList.length === 0 ? (
                  <div className="text-center py-16 p-8 bg-slate-900/30 border border-dashed border-slate-800 rounded-2xl">
                    <CalendarIcon className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                    <h4 className="text-base font-bold text-slate-300">No Scheduled Events</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                      No task deadlines or study sessions found for the current filter criteria.
                    </p>
                    <button
                      onClick={() => handleOpenCreateForDate(getTodayKey(), 'Task')}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Schedule First Event</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {agendaSections.sortedUpcomingDates.map(dateKey => {
                      const dayEvents = agendaSections.upcomingMap[dateKey];
                      const isToday = dateKey === getTodayKey();

                      return (
                        <div key={dateKey} className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 shadow-sm">
                          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-extrabold px-2.5 py-1 rounded-lg ${
                                isToday
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-800 text-slate-300'
                              }`}>
                                {formatHumanDate(dateKey)}
                              </span>
                              {isToday && (
                                <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                                  Today
                                </span>
                              )}
                            </div>

                            <button
                              onClick={() => handleOpenCreateForDate(dateKey, 'Task')}
                              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" /> Add
                            </button>
                          </div>

                          <div className="space-y-2">
                            {dayEvents.map(ev => {
                              const TypeIcon = EVENT_TYPE_STYLES[ev.type]?.icon || CheckSquare;
                              const isCompleted = ev.status === 'Completed';

                              return (
                                <div
                                  key={ev.id}
                                  onClick={() => handleEventClick(ev)}
                                  className="flex items-center justify-between p-3 bg-slate-950/70 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className={`p-2 rounded-lg border ${EVENT_TYPE_STYLES[ev.type]?.badge || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                                      <TypeIcon className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <h5 className={`text-xs font-bold truncate ${isCompleted ? 'line-through text-slate-500' : 'text-white'}`}>
                                        {ev.title}
                                      </h5>
                                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                                        <span>Project: <strong className="text-slate-300">{ev.project?.name || 'Project'}</strong></span>
                                        {ev.assignee && (
                                          <span>• Assigned to: <strong className="text-slate-300">{ev.assignee.name || 'Member'}</strong></span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${EVENT_TYPE_STYLES[ev.type]?.badge || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                                      {ev.type}
                                    </span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded border ${
                                      isCompleted 
                                        ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                                        : 'bg-slate-800 text-slate-300 border-slate-700'
                                    }`}>
                                      {ev.status}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            )}
          </>
        )}

      </div>

      {/* Task Details Drawer (when calendar event clicked) */}
      <TaskDetailsDrawer
        task={selectedTask}
        isOpen={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        onEdit={handleEditTaskFromDrawer}
        onDelete={async (id) => {
          setSelectedTask(null);
          if (onDeleteTask) await onDeleteTask(id);
          toast.success('Task deleted');
        }}
        onStatusChange={async (id, status) => {
          if (onTaskStatusChange) await onTaskStatusChange(id, status);
        }}
        onAddComment={onAddComment}
        onDeleteComment={onDeleteComment}
        members={activeProjectObj?.members || []}
        currentUser={currentUser}
      />

      {/* Task / Event Creation & Edit Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setModalInitialData(null);
        }}
        onSubmit={handleSaveTaskModal}
        initialData={modalInitialData}
        initialDate={modalInitialDate}
        initialType={modalInitialType}
        activeProject={activeProjectObj}
        projects={projects}
      />
    </div>
  );
};

export default IntegratedCalendar;
