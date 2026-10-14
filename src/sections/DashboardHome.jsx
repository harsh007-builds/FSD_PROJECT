import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  BookOpen, Activity, CheckCircle2, Clock, AlertTriangle, 
  BarChart3, Calendar as CalendarIcon, Users, ArrowRight, 
  Plus, CheckSquare, Flag, TrendingUp, Filter, RotateCcw, 
  ChevronRight, ExternalLink, Mail, Shield, Crown, Inbox, Bell, X
} from 'lucide-react';
import { dashboardService, activityService, notificationService } from '../services/api';
import { useProjects } from '../hooks/useProjects';
import { useUser } from '../context/UserContext';
import { useRouter } from '../context/RouterContext';
import { useToast } from '../context/ToastContext';
import { formatHumanDate, toDateKey, isTaskOverdue, isTaskDueToday, isTaskUpcoming } from '../utils/dateUtils';
import TaskModal from '../components/TaskModal';
import ProjectModal from '../components/ProjectModal';
import TaskDetailsDrawer from '../components/TaskDetailsDrawer';
import UserInvitationsModal from '../components/UserInvitationsModal';

const ACTIVITY_MESSAGES = {
  project_created: (a) => `created project "${a.meta?.projectName || a.project?.name || '...'}"`,
  project_updated: (a) => `updated project "${a.meta?.projectName || a.project?.name || '...'}"`,
  project_deleted: (a) => `deleted project "${a.meta?.projectName || '...'}"`,
  member_added: (a) => `added ${a.targetUser?.name || 'a member'} to "${a.meta?.projectName || a.project?.name || '...'}"`,
  member_removed: (a) => a.meta?.selfLeave ? `left the project` : `removed ${a.targetUser?.name || a.meta?.memberName || 'a member'} from the project`,
  role_updated: (a) => `updated ${a.targetUser?.name || a.meta?.memberName || 'a member'}'s role to ${a.meta?.newRole || '...'}`,
  ownership_transferred: (a) => `transferred project ownership to ${a.targetUser?.name || a.meta?.newOwner || 'a teammate'}`,
  invitation_sent: (a) => `invited ${a.meta?.recipientName || 'a teammate'} as ${a.meta?.role || 'Member'}`,
  invitation_accepted: (a) => `accepted the invitation and joined the project`,
  task_created: (a) => `created task "${a.meta?.taskTitle || a.task?.title || '...'}"`,
  task_assigned: (a) => `assigned "${a.meta?.taskTitle || a.task?.title || '...'}" to ${a.targetUser?.name || 'a member'}`,
  task_status_changed: (a) => `moved "${a.meta?.taskTitle || a.task?.title || '...'}" to ${a.meta?.newStatus || '...'}`,
  task_completed: (a) => `completed "${a.meta?.taskTitle || a.task?.title || '...'}"`,
  task_deleted: (a) => `deleted task "${a.meta?.taskTitle || '...'}"`,
};

const STATUS_COLORS = {
  Backlog: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  Todo: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'In Progress': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  Review: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Completed: 'bg-green-500/20 text-green-300 border-green-500/30',
};

const PRIORITY_BADGES = {
  Urgent: 'bg-red-500/10 text-red-400 border-red-500/20',
  High: 'bg-red-500/10 text-red-400 border-red-500/20',
  Medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  Low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

const DashboardHome = () => {
  const { user } = useUser();
  const { 
    projects, tasks, addTask, updateTask, deleteTask, 
    setTaskStatus, addProject, addComment, deleteComment, refreshProjects 
  } = useProjects();
  const { navigateToProject, navigate } = useRouter();
  const toast = useToast();

  // Dashboard API state
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters state
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [selectedTimeRange, setSelectedTimeRange] = useState('7d');

  // Interactive My Tasks Tab
  const [myTasksTab, setMyTasksTab] = useState('all'); // 'all' | 'today' | 'overdue' | 'upcoming' | 'completed'

  // Activity vs Notifications feed toggle
  const [feedTab, setFeedTab] = useState('activity'); // 'activity' | 'notifications'

  // Modals state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isInvitationsModalOpen, setIsInvitationsModalOpen] = useState(false);
  const [selectedTaskForDrawer, setSelectedTaskForDrawer] = useState(null);
  const [editingTaskForModal, setEditingTaskForModal] = useState(null);

  // Fetch Dashboard Analytics
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, activitiesData, notificationsData] = await Promise.all([
        dashboardService.getStats({ projectId: selectedProjectId, timeRange: selectedTimeRange }),
        activityService.getActivities().catch(() => []),
        notificationService.getNotifications().catch(() => []),
      ]);
      setStats(statsData);
      setActivities(Array.isArray(activitiesData) ? activitiesData : (activitiesData?.activities || []));
      setNotifications(Array.isArray(notificationsData) ? notificationsData : (notificationsData?.notifications || []));
    } catch (err) {
      console.error('Failed to load dashboard statistics:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, selectedTimeRange]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Personalized Greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const userName = user?.name ? user.name.split(' ')[0] : 'there';

  // Filter My Tasks based on active tab
  const filteredMyTasks = useMemo(() => {
    if (!user) return [];
    const myAll = tasks.filter(t => {
      const aId = t.assignee?._id ? t.assignee._id.toString() : t.assignee?.toString();
      const matchUser = aId === user._id.toString();
      if (!matchUser) return false;
      if (selectedProjectId !== 'all' && t.projectId !== selectedProjectId) return false;
      return true;
    });

    if (myTasksTab === 'today') {
      return myAll.filter(t => isTaskDueToday(t.dueDate, t.status));
    }
    if (myTasksTab === 'overdue') {
      return myAll.filter(t => isTaskOverdue(t.dueDate, t.status));
    }
    if (myTasksTab === 'upcoming') {
      return myAll.filter(t => isTaskUpcoming(t.dueDate, t.status));
    }
    if (myTasksTab === 'completed') {
      return myAll.filter(t => t.status === 'Completed');
    }
    return myAll;
  }, [tasks, user, myTasksTab, selectedProjectId]);

  // Time ago formatter
  const timeAgo = (date) => {
    if (!date) return 'just now';
    const diff = (Date.now() - new Date(date).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  // Quick Action Handlers
  const handleOpenNewTask = () => {
    setEditingTaskForModal(null);
    setIsTaskModalOpen(true);
  };

  const handleCreateTaskSubmit = async (taskData) => {
    await addTask(taskData);
    toast.success('Task created successfully');
    await fetchDashboardData();
  };

  const handleCreateProjectSubmit = async (projectData) => {
    await addProject(projectData);
    toast.success('Project created successfully');
    await fetchDashboardData();
  };

  const handleEditTaskFromDrawer = (t) => {
    setSelectedTaskForDrawer(null);
    setEditingTaskForModal(t);
    setIsTaskModalOpen(true);
  };

  const handleUpdateTaskStatus = async (taskId, newStatus) => {
    try {
      await setTaskStatus(taskId, newStatus);
      toast.success(`Task moved to ${newStatus}`);
      await fetchDashboardData();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSelectedProjectId('all');
    setSelectedTimeRange('7d');
  };

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8 space-y-8 bg-[#0A0F1C] text-slate-100">
      
      {/* 1. WELCOME SECTION & QUICK ACTIONS */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 p-6 bg-gradient-to-r from-blue-900/20 via-indigo-900/10 to-transparent border border-slate-800 rounded-3xl shadow-xl backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-full">
              Workspace Overview
            </span>
            {stats?.summary?.overdueTasks > 0 && (
              <span className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                <AlertTriangle className="w-3 h-3" />
                {stats.summary.overdueTasks} Overdue
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {greeting}, {userName}!
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            {stats?.myTasksSummary?.dueToday > 0 ? (
              <>You have <strong className="text-white">{stats.myTasksSummary.dueToday} tasks due today</strong> across your projects. Let's make progress!</>
            ) : (
              <>All caught up for today! Review ongoing projects, deadlines, and milestones below.</>
            )}
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={handleOpenNewTask}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25 transition-all hover:scale-105"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
          <button
            onClick={() => setIsProjectModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition-all hover:scale-105"
          >
            <BookOpen className="w-4 h-4 text-blue-400" />
            <span>New Project</span>
          </button>
          <button
            onClick={() => navigate('/calendar')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900/60 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
            title="Open Calendar"
          >
            <CalendarIcon className="w-4 h-4 text-purple-400" />
            <span>Calendar</span>
          </button>
          <button
            onClick={() => navigate('/board')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900/60 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
            title="Open Kanban Board"
          >
            <CheckSquare className="w-4 h-4 text-emerald-400" />
            <span>Kanban</span>
          </button>
        </div>
      </div>

      {/* 2. GLOBAL FILTERS BAR */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900/40 border border-slate-800 rounded-2xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-blue-400" />
            <span>Filter Dashboard:</span>
          </div>

          {/* Project Filter */}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
          >
            <option value="all">All Projects ({projects.length})</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Time Range Filter */}
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
          >
            <option value="7d">Last 7 Days</option>
            <option value="14d">Last 14 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
        </div>

        {(selectedProjectId !== 'all' || selectedTimeRange !== '7d') && (
          <button
            onClick={handleResetFilters}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Filters</span>
          </button>
        )}
      </div>

      {/* 3. KEY METRIC SUMMARY STAT CARDS */}
      {loading && !stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse p-4" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          
          {/* My Tasks */}
          <div 
            onClick={() => setMyTasksTab('all')}
            className={`p-4 rounded-2xl border transition-all cursor-pointer hover:scale-[1.02] ${
              myTasksTab === 'all' 
                ? 'bg-blue-600/15 border-blue-500/50 shadow-lg shadow-blue-500/10' 
                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400">My Tasks</span>
              <CheckSquare className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-2xl font-bold text-white">{stats.myTasksSummary.total}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              {stats.myTasksSummary.completionRate}% completed
            </p>
          </div>

          {/* Due Today */}
          <div 
            onClick={() => setMyTasksTab('today')}
            className={`p-4 rounded-2xl border transition-all cursor-pointer hover:scale-[1.02] ${
              myTasksTab === 'today' 
                ? 'bg-amber-500/15 border-amber-500/50 shadow-lg shadow-amber-500/10' 
                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400">Due Today</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-amber-300">{stats.summary.dueTodayTasks}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              {stats.myTasksSummary.dueToday} assigned to you
            </p>
          </div>

          {/* Overdue */}
          <div 
            onClick={() => setMyTasksTab('overdue')}
            className={`p-4 rounded-2xl border transition-all cursor-pointer hover:scale-[1.02] ${
              myTasksTab === 'overdue' 
                ? 'bg-red-500/15 border-red-500/50 shadow-lg shadow-red-500/10' 
                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400">Overdue</span>
              <AlertTriangle className={`w-4 h-4 ${stats.summary.overdueTasks > 0 ? 'text-red-400 animate-pulse' : 'text-slate-500'}`} />
            </div>
            <p className={`text-2xl font-bold ${stats.summary.overdueTasks > 0 ? 'text-red-400' : 'text-white'}`}>
              {stats.summary.overdueTasks}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {stats.myTasksSummary.overdue} in your queue
            </p>
          </div>

          {/* Active Projects */}
          <div 
            onClick={() => navigate('/board')}
            className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer hover:scale-[1.02]"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400">Projects</span>
              <BookOpen className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-bold text-white">{stats.summary.activeProjects}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              {stats.summary.totalProjects} total joined
            </p>
          </div>

          {/* Total Completed */}
          <div 
            onClick={() => setMyTasksTab('completed')}
            className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer hover:scale-[1.02]"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400">Completed</span>
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            </div>
            <p className="text-2xl font-bold text-green-400">{stats.summary.completedTasks}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              {stats.summary.completionRate}% completion rate
            </p>
          </div>

          {/* Upcoming Milestones */}
          <div 
            onClick={() => navigate('/calendar')}
            className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer hover:scale-[1.02]"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400">Milestones</span>
              <Flag className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-2xl font-bold text-purple-300">{stats.milestones.length}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Target deadlines
            </p>
          </div>
        </div>
      ) : null}

      {/* 4. MAIN CONTENT GRID: MY TASKS & ANALYTICS DISTRIBUTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT 2 COLS: MY TASKS PANEL */}
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80 mb-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-blue-400" />
                  <span>My Assigned Tasks</span>
                </h2>
                <button
                  onClick={() => navigate('/tasks')}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium hover:underline flex items-center gap-1"
                  title="Open dedicated My Tasks workspace"
                >
                  <span>Open Full View</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Tasks allocated to your account across active workspaces
              </p>
            </div>

            {/* My Tasks Tabs */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
              {[
                { id: 'all', label: 'All' },
                { id: 'today', label: 'Today' },
                { id: 'overdue', label: 'Overdue' },
                { id: 'upcoming', label: 'Upcoming' },
                { id: 'completed', label: 'Done' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setMyTasksTab(tab.id)}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${
                    myTasksTab === tab.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* My Tasks List */}
          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[360px] pr-1">
            {filteredMyTasks.length === 0 ? (
              <div className="py-12 text-center flex flex-col items-center justify-center border border-dashed border-slate-800/80 rounded-2xl">
                <Inbox className="w-10 h-10 text-slate-700 mb-2" />
                <p className="text-sm font-semibold text-slate-400">No tasks in this category</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  {myTasksTab === 'today' ? 'Nothing due today! Enjoy your productive momentum.' :
                   myTasksTab === 'overdue' ? 'No overdue tasks! You are on schedule.' :
                   'You currently have no tasks assigned in this filter.'}
                </p>
              </div>
            ) : (
              filteredMyTasks.map(t => {
                const isCompleted = t.status === 'Completed';
                const overdue = isTaskOverdue(t.dueDate, t.status);
                const dueToday = isTaskDueToday(t.dueDate, t.status);

                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTaskForDrawer(t)}
                    className="group flex items-center justify-between p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-2xl hover:border-slate-700 transition-all cursor-pointer hover:bg-slate-900/40"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Status toggle checkbox */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateTaskStatus(t.id, isCompleted ? 'Todo' : 'Completed');
                        }}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                          isCompleted
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-slate-700 hover:border-blue-400 text-transparent'
                        }`}
                        title={isCompleted ? "Mark incomplete" : "Mark completed"}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="min-w-0">
                        <h4 className={`text-xs font-bold truncate ${isCompleted ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                          {t.task || t.title}
                        </h4>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                          <span 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (t.projectId) navigateToProject(t.projectId);
                            }}
                            className="text-blue-400 hover:underline font-medium truncate max-w-[120px]"
                          >
                            {t.project?.name || 'Project'}
                          </span>
                          {t.dueDate && (
                            <>
                              <span>•</span>
                              <span className={`font-semibold ${
                                overdue ? 'text-red-400' : dueToday ? 'text-amber-400' : 'text-slate-400'
                              }`}>
                                {dueToday ? 'Due Today' : overdue ? `Overdue (${formatHumanDate(t.dueDate)})` : formatHumanDate(t.dueDate)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PRIORITY_BADGES[t.priority] || PRIORITY_BADGES.Medium}`}>
                        {t.priority || 'Medium'}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[t.status] || STATUS_COLORS.Todo}`}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT 1 COL: TASK DISTRIBUTIONS (STATUS & PRIORITY) */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-purple-400" />
              <span>Status Distribution</span>
            </h2>
            <p className="text-xs text-slate-400">Breakdown of scoped workspace tasks</p>
          </div>

          {/* Proportional Progress Bar */}
          {stats?.summary?.totalTasks > 0 ? (
            <div className="space-y-4">
              <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-950 border border-slate-800">
                {Object.entries(stats.byStatus).map(([statusKey, count]) => {
                  if (count === 0) return null;
                  const pct = (count / stats.summary.totalTasks) * 100;
                  const colorMap = {
                    Backlog: 'bg-slate-500',
                    Todo: 'bg-blue-500',
                    'In Progress': 'bg-yellow-500',
                    Review: 'bg-purple-500',
                    Completed: 'bg-green-500',
                  };
                  return (
                    <div
                      key={statusKey}
                      className={`${colorMap[statusKey] || 'bg-blue-500'} transition-all`}
                      style={{ width: `${pct}%` }}
                      title={`${statusKey}: ${count} (${Math.round(pct)}%)`}
                    />
                  );
                })}
              </div>

              {/* Status pills list */}
              <div className="space-y-2">
                {Object.entries(stats.byStatus).map(([statusKey, count]) => {
                  const pct = stats.summary.totalTasks > 0 ? Math.round((count / stats.summary.totalTasks) * 100) : 0;
                  return (
                    <div key={statusKey} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/40 last:border-0">
                      <span className="text-slate-300 font-medium">{statusKey}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{count}</span>
                        <span className="text-[11px] text-slate-500 w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">No tasks in current filter.</p>
          )}

          {/* Priority Breakdown */}
          <div className="pt-4 border-t border-slate-800/80">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Priority Allocation
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {['Urgent', 'High', 'Medium', 'Low'].map(pKey => {
                const count = stats?.byPriority?.[pKey] || 0;
                return (
                  <div key={pKey} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400">{pKey}</span>
                    <span className="text-xs font-bold text-white">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* 5. PRODUCTIVITY TRENDS (REAL DATA CHART) & UPCOMING MILESTONES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* PRODUCTIVITY TRENDS CHART */}
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                <span>Productivity History</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Real task completion volume over time
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" /> Completed Tasks
              </span>
              <span className="flex items-center gap-1.5 ml-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Created Tasks
              </span>
            </div>
          </div>

          {/* Real Trend Chart */}
          {stats?.productivityTrend?.days?.length > 0 ? (
            <div className="space-y-4">
              <div className="h-44 flex items-end gap-2 pt-6 pb-2 px-2 border-b border-slate-800">
                {stats.productivityTrend.days.map((item, idx) => {
                  const maxVal = Math.max(...stats.productivityTrend.days.map(d => Math.max(d.completed, d.created, 1)));
                  const completedHeight = Math.max((item.completed / maxVal) * 100, item.completed > 0 ? 12 : 0);
                  const createdHeight = Math.max((item.created / maxVal) * 100, item.created > 0 ? 12 : 0);

                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                      {/* Tooltip */}
                      <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950 border border-slate-700 text-[10px] text-white px-2 py-1 rounded shadow-lg pointer-events-none whitespace-nowrap z-20">
                        {item.date}: {item.completed} completed, {item.created} created
                      </div>

                      {/* Bars */}
                      <div className="w-full flex items-end justify-center gap-1 h-full">
                        <div 
                          className="w-1/2 max-w-[14px] bg-green-500 rounded-t transition-all hover:bg-green-400"
                          style={{ height: `${completedHeight}%` }}
                        />
                        <div 
                          className="w-1/2 max-w-[14px] bg-blue-500/70 rounded-t transition-all hover:bg-blue-400"
                          style={{ height: `${createdHeight}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 mt-2 truncate w-full text-center">
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {!stats.productivityTrend.hasData ? (
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
                  No task completions logged in this period yet. Complete tasks on your Kanban board to populate real trend metrics.
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs text-slate-400 px-2">
                  <span>Total completed in window: <strong className="text-white">{stats.productivityTrend.totalCompleted}</strong></span>
                  <span>Total created in window: <strong className="text-white">{stats.productivityTrend.totalCreated}</strong></span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No trend data available.</p>
          )}
        </div>

        {/* UPCOMING MILESTONES */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Flag className="w-4 h-4 text-purple-400" />
                <span>Upcoming Milestones</span>
              </h2>
              <p className="text-xs text-slate-400">Critical deliverables and deadlines</p>
            </div>
            <button 
              onClick={() => navigate('/calendar')}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
            >
              View All
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto max-h-[300px] pr-1">
            {stats?.milestones?.length === 0 ? (
              <div className="py-10 text-center flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-2xl">
                <Flag className="w-8 h-8 text-slate-700 mb-2" />
                <p className="text-xs text-slate-400 font-semibold">No upcoming milestones</p>
                <p className="text-[11px] text-slate-500 mt-1">Set project deadlines or milestone tasks to track them here.</p>
              </div>
            ) : (
              stats?.milestones?.map(m => (
                <div 
                  key={m.id}
                  onClick={() => {
                    if (m.projectId) navigateToProject(m.projectId);
                  }}
                  className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl hover:border-purple-500/30 transition-colors cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate group-hover:text-purple-300 transition-colors">
                        {m.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {m.projectName} • {m.type}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${
                      m.isCompleted ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                      m.isOverdue ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      'bg-purple-500/10 text-purple-300 border-purple-500/20'
                    }`}>
                      {m.isCompleted ? 'Done' : m.dueDate ? formatHumanDate(m.dueDate) : 'TBD'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* 6. PROJECT PROGRESS OVERVIEW & TEAM WORKLOAD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* PROJECT PROGRESS OVERVIEW */}
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-400" />
                <span>Project Status & Membership</span>
              </h2>
              <p className="text-xs text-slate-400">Current progress calculated from completed tasks</p>
            </div>
            <button
              onClick={() => navigate('/board')}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
            >
              Open Workspaces
            </button>
          </div>

          <div className="space-y-4">
            {stats?.projectSummaries?.length === 0 ? (
              <p className="text-xs text-slate-500">No active projects joined.</p>
            ) : (
              stats?.projectSummaries?.map(p => (
                <div
                  key={p.id}
                  onClick={() => navigateToProject(p.id)}
                  className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl hover:border-slate-700 transition-colors cursor-pointer group"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">
                          {p.name}
                        </h4>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          p.status === 'Active' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                          p.status === 'Archived' ? 'bg-slate-800 text-slate-400 border-slate-700' :
                          'bg-green-500/10 text-green-400 border-green-500/20'
                        }`}>
                          {p.status}
                        </span>
                      </div>
                      {p.description && (
                        <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                          {p.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400 shrink-0">
                      <span>{p.completedTasks}/{p.totalTasks} Tasks</span>
                      <span className="font-bold text-white">{p.progress}%</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden mb-3 border border-slate-800/80">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        p.progress === 100 ? 'bg-green-500' :
                        p.progress > 50 ? 'bg-blue-500' :
                        p.progress > 0 ? 'bg-yellow-500' : 'bg-slate-700'
                      }`}
                      style={{ width: `${p.progress}%` }}
                    />
                  </div>

                  {/* Members Avatars and Deadline Footer */}
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      <span>{p.membersCount} Members</span>
                    </div>

                    {p.deadline && (
                      <span className="text-[11px] text-slate-500">
                        Deadline: <strong className="text-slate-300">{formatHumanDate(p.deadline)}</strong>
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* TEAM WORKLOAD OVERVIEW */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col">
          <div className="mb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              <span>Team Workload Overview</span>
            </h2>
            <p className="text-xs text-slate-400">Assigned task distribution across members</p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto max-h-[360px] pr-1">
            {stats?.memberWorkloads?.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">No assigned workload recorded yet.</p>
            ) : (
              stats?.memberWorkloads?.map((w, idx) => (
                <div key={idx} className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold flex items-center justify-center shrink-0">
                        {w.user?.avatarInitials || w.user?.name?.[0] || '?'}
                      </div>
                      <span className="text-xs font-bold text-white truncate">{w.user?.name || 'Member'}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-300">
                      {w.completed}/{w.totalAssigned} done
                    </span>
                  </div>

                  <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${w.completionRate}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1.5">
                    <span>{w.pending} pending</span>
                    {w.overdue > 0 ? (
                      <span className="text-red-400 font-semibold">{w.overdue} overdue</span>
                    ) : (
                      <span>0 overdue</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* 7. ACTIVITY FEED & NOTIFICATIONS INBOX */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFeedTab('activity')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                feedTab === 'activity'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Recent Activity ({activities.length})</span>
            </button>
            <button
              onClick={() => setFeedTab('notifications')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                feedTab === 'notifications'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Notifications ({notifications.length})</span>
            </button>
          </div>
        </div>

        {feedTab === 'activity' ? (
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {activities.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No recent activity found.</p>
            ) : (
              activities.slice(0, 15).map(a => (
                <div key={a._id} className="flex items-start gap-3 py-2 border-b border-slate-800/40 last:border-0">
                  <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-blue-400 shrink-0 mt-0.5">
                    {a.user?.avatarInitials || a.user?.name?.[0] || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-300">
                      <span className="font-semibold text-white">{a.user?.name || 'Someone'}</span>{' '}
                      {ACTIVITY_MESSAGES[a.type] ? ACTIVITY_MESSAGES[a.type](a) : a.type}
                    </p>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">{timeAgo(a.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {notifications.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No notifications in your inbox.</p>
            ) : (
              notifications.slice(0, 15).map(n => (
                <div 
                  key={n._id} 
                  onClick={async () => {
                    if (!n.read) {
                      await notificationService.markAsRead(n._id).catch(() => {});
                      setNotifications(prev => prev.map(item => item._id === n._id ? { ...item, read: true } : item));
                    }
                    if (n.project?._id || n.project) {
                      navigate(`/projects/${n.project?._id || n.project}`);
                    }
                  }}
                  className={`group relative flex items-start gap-3 p-2.5 rounded-xl border border-slate-800/60 cursor-pointer transition-all hover:border-slate-700 ${!n.read ? 'bg-blue-500/10 border-blue-500/30' : 'bg-slate-950/40 hover:bg-slate-900/50'}`}
                >
                  <Bell className={`w-4 h-4 shrink-0 mt-0.5 ${!n.read ? 'text-blue-400' : 'text-slate-500'}`} />
                  <div className="min-w-0 flex-1 pr-6">
                    <p className={`text-xs ${!n.read ? 'font-medium text-white' : 'text-slate-300'}`}>{n.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-500">{timeAgo(n.createdAt)}</span>
                      {n.project?.name && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {n.project.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await notificationService.deleteNotification(n._id).catch(() => {});
                      setNotifications(prev => prev.filter(item => item._id !== n._id));
                    }}
                    className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                    title="Dismiss notification"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* MODALS */}
      {/* 1. Create / Edit Task Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setEditingTaskForModal(null);
        }}
        onSubmit={handleCreateTaskSubmit}
        initialData={editingTaskForModal}
        activeProject={null}
        projects={projects}
      />

      {/* 2. Create Project Modal */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        onSubmit={handleCreateProjectSubmit}
      />

      {/* 3. User Invitations Modal */}
      <UserInvitationsModal
        isOpen={isInvitationsModalOpen}
        onClose={() => setIsInvitationsModalOpen(false)}
        onInvitationAccepted={() => {
          fetchDashboardData();
          refreshProjects();
        }}
      />

      {/* 4. Task Details Drawer */}
      <TaskDetailsDrawer
        task={selectedTaskForDrawer}
        isOpen={Boolean(selectedTaskForDrawer)}
        onClose={() => setSelectedTaskForDrawer(null)}
        onEdit={handleEditTaskFromDrawer}
        onDelete={async (id) => {
          setSelectedTaskForDrawer(null);
          await deleteTask(id);
          toast.success('Task deleted');
          await fetchDashboardData();
        }}
        onStatusChange={async (id, st) => {
          await handleUpdateTaskStatus(id, st);
          if (selectedTaskForDrawer) {
            setSelectedTaskForDrawer(prev => ({ ...prev, status: st }));
          }
        }}
        onAddComment={addComment}
        onDeleteComment={deleteComment}
        members={projects.find(p => p.id === (selectedTaskForDrawer?.projectId || selectedTaskForDrawer?.project))?.members || []}
        currentUser={user}
      />

    </div>
  );
};

export default DashboardHome;
