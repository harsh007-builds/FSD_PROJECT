import React, { useState, useMemo } from 'react';
import { 
  Plus, Trash2, Search, Filter, AlertTriangle, 
  Calendar as CalendarIcon, GripVertical, LayoutGrid, Tag
} from 'lucide-react';

const COLUMNS = [
  { status: 'Backlog', color: 'text-slate-400', dotColor: 'bg-slate-500', headerBg: 'bg-slate-800/30' },
  { status: 'Todo', color: 'text-blue-400', dotColor: 'bg-blue-500', headerBg: 'bg-blue-500/5' },
  { status: 'In Progress', color: 'text-yellow-400', dotColor: 'bg-yellow-500', headerBg: 'bg-yellow-500/5' },
  { status: 'Review', color: 'text-purple-400', dotColor: 'bg-purple-500', headerBg: 'bg-purple-500/5' },
  { status: 'Completed', color: 'text-green-400', dotColor: 'bg-green-500', headerBg: 'bg-green-500/5' },
];

const PRIORITY_CONFIG = {
  'Urgent': { bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500/30' },
  'High': { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  'Medium': { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  'Low': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
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
  refreshProjects,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [dragOverColumn, setDragOverColumn] = useState(null);

  // Filter tasks for this project
  const projectTasks = useMemo(() => {
    return tasks.filter(t => t.projectId === projectId);
  }, [tasks, projectId]);

  // Apply search + filters
  const filteredTasks = useMemo(() => {
    let result = [...projectTasks];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.task.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    }

    if (filterPriority !== 'all') {
      result = result.filter(t => t.priority === filterPriority);
    }

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

    return result;
  }, [projectTasks, searchQuery, filterPriority, filterAssignee]);

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

  const hasActiveFilters = searchQuery || filterPriority !== 'all' || filterAssignee !== 'all';

  // Drag handlers
  const onDragStart = (e, taskId) => {
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e, status) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(status);
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
        // Rollback handled by setTaskStatus in useProjects
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Stats Bar */}
      <div className="shrink-0 px-6 pt-4 pb-3">
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
          <span className="text-slate-300 bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-700/50">
            {stats.total} Total
          </span>
          {COLUMNS.map(col => (
            <span key={col.status} className={`${col.color} bg-slate-800/40 px-2.5 py-1 rounded-lg`}>
              {stats[col.status] || 0} {col.status}
            </span>
          ))}
          {stats.overdue > 0 && (
            <span className="text-red-400 bg-red-500/10 px-2.5 py-1 rounded-lg border border-red-500/20 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {stats.overdue} Overdue
            </span>
          )}
        </div>
      </div>

      {/* Filter/Search Toolbar */}
      <div className="shrink-0 px-6 pb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>

        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
        >
          <option value="all">All Priorities</option>
          <option value="Urgent">Urgent</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

        <select
          value={filterAssignee}
          onChange={e => setFilterAssignee(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
        >
          <option value="all">All Members</option>
          <option value="unassigned">Unassigned</option>
          {members.map(m => (
            <option key={m._id} value={m._id}>{m.name}</option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            onClick={() => { setSearchQuery(''); setFilterPriority('all'); setFilterAssignee('all'); }}
            className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1"
          >
            Clear Filters
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
                className={`w-72 flex flex-col h-full rounded-2xl border transition-colors duration-200 overflow-hidden ${
                  isDragOver
                    ? 'border-blue-500/50 bg-blue-500/5'
                    : 'border-slate-800/50 bg-slate-900/20'
                }`}
                onDragOver={(e) => onDragOver(e, col.status)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, col.status)}
              >
                {/* Column Header */}
                <div className={`p-3.5 border-b border-slate-800/50 flex items-center justify-between ${col.headerBg}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${col.dotColor}`} />
                    <h3 className={`text-sm font-semibold ${col.color}`}>{col.status}</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800/80 text-[11px] font-medium text-slate-400">
                    {columnTasks.length}
                  </span>
                </div>

                {/* Task Cards */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                  {columnTasks.length === 0 && (
                    <div className="py-8 text-center">
                      <p className="text-xs text-slate-600">
                        {hasActiveFilters ? 'No matching tasks' : 'No tasks'}
                      </p>
                    </div>
                  )}

                  {columnTasks.map(task => {
                    const overdue = isOverdue(task);
                    const pConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG['Medium'];

                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, task.id)}
                        onClick={() => onEditTask(task)}
                        className={`bg-slate-950/80 border rounded-xl p-3.5 cursor-pointer transition-all hover:shadow-lg hover:shadow-blue-900/5 group ${
                          overdue ? 'border-red-500/30 hover:border-red-500/50' : 'border-slate-800 hover:border-blue-500/40'
                        }`}
                      >
                        {/* Priority + Delete */}
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${pConfig.bg} ${pConfig.text} ${pConfig.border}`}>
                            {task.priority || 'Medium'}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm('Delete this task?')) onDeleteTask(task.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Title */}
                        <h4 className="text-sm font-medium text-white mb-1 line-clamp-2 leading-snug">
                          {task.task}
                        </h4>

                        {/* Description */}
                        {task.description && (
                          <p className="text-xs text-slate-500 line-clamp-2 mb-2">{task.description}</p>
                        )}

                        {/* Labels */}
                        {task.labels && task.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {task.labels.slice(0, 3).map((label, i) => (
                              <span key={i} className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700/50 flex items-center gap-0.5">
                                <Tag className="w-2.5 h-2.5" />{label}
                              </span>
                            ))}
                            {task.labels.length > 3 && (
                              <span className="text-[10px] text-slate-500">+{task.labels.length - 3}</span>
                            )}
                          </div>
                        )}

                        {/* Footer: Due Date + Assignee */}
                        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-800/50">
                          <div className={`flex items-center gap-1 text-xs font-medium ${overdue ? 'text-red-400' : 'text-slate-500'}`}>
                            {overdue && <AlertTriangle className="w-3 h-3" />}
                            <CalendarIcon className="w-3 h-3" />
                            <span>
                              {task.dueDate
                                ? (overdue ? 'Overdue · ' : '') + new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                : 'No date'}
                            </span>
                          </div>
                          {task.assignee && (
                            <div
                              className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-white border border-slate-700"
                              title={task.assignee.name}
                            >
                              {task.assignee.avatarInitials || '?'}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Add Task Button */}
                  <button
                    onClick={() => onCreateTask(col.status)}
                    className="w-full py-2 rounded-xl border border-dashed border-slate-700/60 hover:border-blue-500/40 hover:bg-blue-500/5 text-xs text-slate-500 hover:text-blue-400 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Task
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default KanbanBoard;
