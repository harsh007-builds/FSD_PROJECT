import React, { useState, useMemo } from 'react';
import { 
  Plus, Trash2, Search, AlertTriangle, 
  Calendar as CalendarIcon, Tag, MessageSquare, 
  CheckCircle2, X 
} from 'lucide-react';
import TaskDetailsDrawer from './TaskDetailsDrawer';
import ConfirmModal from './ConfirmModal';

const COLUMNS = [
  { status: 'Backlog', label: 'Backlog', color: 'text-slate-400', dotColor: 'bg-slate-500', headerBg: 'bg-slate-800/30' },
  { status: 'Todo', label: 'To Do', color: 'text-blue-400', dotColor: 'bg-blue-500', headerBg: 'bg-blue-500/5' },
  { status: 'In Progress', label: 'In Progress', color: 'text-yellow-400', dotColor: 'bg-yellow-500', headerBg: 'bg-yellow-500/5' },
  { status: 'Review', label: 'Review', color: 'text-purple-400', dotColor: 'bg-purple-500', headerBg: 'bg-purple-500/5' },
  { status: 'Completed', label: 'Completed', color: 'text-green-400', dotColor: 'bg-green-500', headerBg: 'bg-green-500/5' },
];

const PRIORITY_CONFIG = {
  Urgent: { bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500/30' },
  High: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  Medium: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  Low: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
};

const isOverdue = (task) => {
  if (!task.dueDate || task.status === 'Completed') return false;
  const due = new Date(task.dueDate);
  due.setHours(23, 59, 59, 999);
  return due.getTime() < Date.now();
};

const KanbanBoard = ({ 
  tasks = [], 
  projectId, 
  members = [],
  user,
  onEditTask, 
  onCreateTask, 
  onDeleteTask, 
  onUpdateTaskStatus,
  onAddComment,
  onDeleteComment,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [filterDueDate, setFilterDueDate] = useState('all'); // 'all', 'overdue', 'today', 'week', 'none'
  const [dragOverColumn, setDragOverColumn] = useState(null);

  // Task Details Drawer State
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [taskToDeleteId, setTaskToDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter tasks for this project
  const projectTasks = useMemo(() => {
    return tasks.filter(t => t.projectId === projectId);
  }, [tasks, projectId]);

  // Selected task entity for drawer (kept reactive to task updates)
  const selectedTask = useMemo(() => {
    return tasks.find(t => t.id === selectedTaskId) || null;
  }, [tasks, selectedTaskId]);

  // Apply search + filters
  const filteredTasks = useMemo(() => {
    let result = [...projectTasks];

    // Search query (title + description)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        (t.task && t.task.toLowerCase().includes(q)) ||
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    }

    // Priority filter
    if (filterPriority !== 'all') {
      result = result.filter(t => t.priority === filterPriority);
    }

    // Assignee filter
    if (filterAssignee !== 'all') {
      if (filterAssignee === 'unassigned') {
        result = result.filter(t => !t.assignee);
      } else {
        result = result.filter(t => {
          const aId = t.assignee?._id || t.assignee;
          return aId === filterAssignee;
        });
      }
    }

    // Due Date filter
    if (filterDueDate !== 'all') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(today);
      endOfWeek.setDate(endOfWeek.getDate() + 7);

      result = result.filter(t => {
        if (filterDueDate === 'none') return !t.dueDate;
        if (!t.dueDate) return false;

        const due = new Date(t.dueDate);
        due.setHours(0, 0, 0, 0);

        if (filterDueDate === 'overdue') {
          return due.getTime() < today.getTime() && t.status !== 'Completed';
        }
        if (filterDueDate === 'today') {
          return due.getTime() === today.getTime();
        }
        if (filterDueDate === 'week') {
          return due.getTime() >= today.getTime() && due.getTime() <= endOfWeek.getTime();
        }
        return true;
      });
    }

    // Sort within column by order or createdAt
    result.sort((a, b) => (a.order || 0) - (b.order || 0));

    return result;
  }, [projectTasks, searchQuery, filterPriority, filterAssignee, filterDueDate]);

  // Stats from ALL project tasks (unfiltered)
  const stats = useMemo(() => {
    const s = { total: projectTasks.length, overdue: 0 };
    COLUMNS.forEach(c => { s[c.status] = 0; });
    projectTasks.forEach(t => {
      if (s[t.status] !== undefined) s[t.status]++;
      if (isOverdue(t)) s.overdue++;
    });
    return s;
  }, [projectTasks]);

  const hasActiveFilters = searchQuery || filterPriority !== 'all' || filterAssignee !== 'all' || filterDueDate !== 'all';

  // Drag & drop handlers
  const onDragStart = (e, taskId) => {
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e, status) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  const onDragLeave = () => {
    setDragOverColumn(null);
  };

  const onDrop = async (e, newStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;

    const task = tasks.find(t => t.id === taskId);
    if (task && task.status !== newStatus) {
      try {
        await onUpdateTaskStatus(taskId, newStatus);
      } catch (err) {
        console.error('Drag drop status update failed:', err);
      }
    }
  };

  const handleDeleteConfirm = async () => {
    if (!taskToDeleteId) return;
    setIsDeleting(true);
    try {
      await onDeleteTask(taskToDeleteId);
      if (selectedTaskId === taskToDeleteId) {
        setSelectedTaskId(null);
      }
      setTaskToDeleteId(null);
    } catch (err) {
      console.error('Failed to delete task:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0A0F1C]">
      {/* Stats Bar */}
      <div className="shrink-0 px-6 pt-4 pb-3">
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
          <span className="text-slate-300 bg-slate-800/60 px-3 py-1 rounded-lg border border-slate-700/50">
            {stats.total} Total Tasks
          </span>
          {COLUMNS.map(col => (
            <span key={col.status} className={`${col.color} bg-slate-800/40 px-2.5 py-1 rounded-lg border border-slate-800`}>
              {stats[col.status] || 0} {col.label}
            </span>
          ))}
          {stats.overdue > 0 && (
            <span className="text-red-400 bg-red-500/10 px-2.5 py-1 rounded-lg border border-red-500/20 flex items-center gap-1.5 animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" /> {stats.overdue} Overdue
            </span>
          )}
        </div>
      </div>

      {/* Filter/Search Toolbar */}
      <div className="shrink-0 px-6 pb-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tasks by title or details..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>

        {/* Priority Filter */}
        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
        >
          <option value="all">All Priorities</option>
          <option value="Urgent">Urgent</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

        {/* Assignee Filter */}
        <select
          value={filterAssignee}
          onChange={e => setFilterAssignee(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
        >
          <option value="all">All Assignees</option>
          <option value="unassigned">Unassigned</option>
          {members.map(m => (
            <option key={m._id || m.id} value={m._id || m.id}>{m.name}</option>
          ))}
        </select>

        {/* Due Date Filter */}
        <select
          value={filterDueDate}
          onChange={e => setFilterDueDate(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
        >
          <option value="all">All Dates</option>
          <option value="overdue">Overdue Only</option>
          <option value="today">Due Today</option>
          <option value="week">Due This Week</option>
          <option value="none">No Due Date</option>
        </select>

        {hasActiveFilters && (
          <button
            onClick={() => { 
              setSearchQuery(''); 
              setFilterPriority('all'); 
              setFilterAssignee('all'); 
              setFilterDueDate('all'); 
            }}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Clear Filters
          </button>
        )}
      </div>

      {/* Kanban Columns */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 pb-6">
        <div className="flex gap-4 h-full min-w-max">
          {COLUMNS.map(col => {
            const columnTasks = filteredTasks.filter(t => t.status === col.status);
            const isDragOver = dragOverColumn === col.status;

            return (
              <div
                key={col.status}
                className={`w-72 flex flex-col h-full rounded-2xl border transition-all duration-200 overflow-hidden ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                    : 'border-slate-800/60 bg-slate-900/20'
                }`}
                onDragOver={(e) => onDragOver(e, col.status)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, col.status)}
              >
                {/* Column Header */}
                <div className={`p-3.5 border-b border-slate-800/60 flex items-center justify-between ${col.headerBg}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${col.dotColor}`} />
                    <h3 className={`text-xs font-semibold ${col.color}`}>{col.label}</h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[11px] font-medium text-slate-400">
                      {columnTasks.length}
                    </span>
                    <button
                      onClick={() => onCreateTask(col.status)}
                      className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                      title={`Add task to ${col.label}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Task Cards Container */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                  {columnTasks.length === 0 ? (
                    <div className="py-8 text-center border border-dashed border-slate-800/60 rounded-xl my-2">
                      <p className="text-xs text-slate-500">
                        {hasActiveFilters ? 'No matching tasks' : 'No tasks in this column'}
                      </p>
                    </div>
                  ) : (
                    columnTasks.map(task => {
                      const overdue = isOverdue(task);
                      const pConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.Medium;

                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => onDragStart(e, task.id)}
                          onClick={() => setSelectedTaskId(task.id)}
                          className={`bg-slate-950/80 border rounded-xl p-3.5 cursor-pointer transition-all hover:shadow-xl hover:shadow-blue-900/10 group ${
                            overdue 
                              ? 'border-red-500/40 hover:border-red-500/70 bg-red-950/10' 
                              : 'border-slate-800 hover:border-blue-500/50'
                          }`}
                        >
                          {/* Priority Badge + Delete Shortcut */}
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${pConfig.bg} ${pConfig.text} ${pConfig.border}`}>
                              {task.priority || 'Medium'}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setTaskToDeleteId(task.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                              title="Delete task"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Task Title */}
                          <h4 className="text-xs font-semibold text-white mb-1.5 line-clamp-2 leading-relaxed">
                            {task.task || task.title}
                          </h4>

                          {/* Description snippet */}
                          {task.description && (
                            <p className="text-[11px] text-slate-400 line-clamp-2 mb-2 leading-normal">
                              {task.description}
                            </p>
                          )}

                          {/* Labels */}
                          {task.labels && task.labels.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2.5">
                              {task.labels.slice(0, 3).map((label, i) => (
                                <span key={i} className="text-[10px] bg-slate-900 text-slate-300 px-1.5 py-0.5 rounded border border-slate-800 flex items-center gap-0.5">
                                  <Tag className="w-2.5 h-2.5 text-slate-500" />{label}
                                </span>
                              ))}
                              {task.labels.length > 3 && (
                                <span className="text-[10px] text-slate-500 self-center">+{task.labels.length - 3}</span>
                              )}
                            </div>
                          )}

                          {/* Footer: Due date, comments count, assignee */}
                          <div className="flex items-center justify-between mt-2 pt-2.5 border-t border-slate-800/60 text-[11px]">
                            <div className={`flex items-center gap-1 font-medium ${overdue ? 'text-red-400' : 'text-slate-400'}`}>
                              {overdue && <AlertTriangle className="w-3 h-3 text-red-400" />}
                              <CalendarIcon className="w-3 h-3 text-slate-500" />
                              <span>
                                {task.dueDate
                                  ? (overdue ? 'Overdue · ' : '') + new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                  : 'No date'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {task.comments && task.comments.length > 0 && (
                                <span className="flex items-center gap-1 text-[10px] text-slate-400" title={`${task.comments.length} comments`}>
                                  <MessageSquare className="w-3 h-3" /> {task.comments.length}
                                </span>
                              )}

                              {task.assignee && (
                                <div
                                  className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center text-[9px] font-bold"
                                  title={task.assignee.name || 'Assigned'}
                                >
                                  {task.assignee.avatarInitials || task.assignee.name?.[0] || '?'}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Add Task Button */}
                  <button
                    onClick={() => onCreateTask(col.status)}
                    className="w-full py-2 rounded-xl border border-dashed border-slate-800 hover:border-blue-500/40 hover:bg-blue-500/5 text-xs text-slate-500 hover:text-blue-400 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Task
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task Details Drawer */}
      <TaskDetailsDrawer
        task={selectedTask}
        isOpen={Boolean(selectedTask)}
        onClose={() => setSelectedTaskId(null)}
        onEdit={(t) => {
          setSelectedTaskId(null);
          onEditTask(t);
        }}
        onDelete={(id) => {
          setTaskToDeleteId(id);
        }}
        onStatusChange={(id, status) => {
          onUpdateTaskStatus(id, status);
        }}
        onAddComment={onAddComment}
        onDeleteComment={onDeleteComment}
        members={members}
        currentUser={user}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(taskToDeleteId)}
        onClose={() => setTaskToDeleteId(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Task"
        message="Are you sure you want to delete this task? All comments and associated data will be permanently removed."
        confirmText="Delete Task"
        isDanger={true}
        isLoading={isDeleting}
      />
    </div>
  );
};

export default KanbanBoard;
