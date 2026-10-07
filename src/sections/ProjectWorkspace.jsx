import React, { useState, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, Edit2, UserPlus, Calendar as CalendarIcon, 
  Activity, Settings, CheckCircle2, Circle, Clock, AlertTriangle, 
  Users, Briefcase, FileText, LayoutDashboard, MessageSquare
} from 'lucide-react';
import { projectService } from '../services/api';
import { useUser } from '../context/UserContext';
import KanbanBoard from '../components/KanbanBoard';

const ACTIVITY_MESSAGES = {
  project_created: (a) => `created project "${a.meta?.projectName || a.project?.name || '...'}"`,
  project_updated: (a) => `updated project "${a.meta?.projectName || a.project?.name || '...'}"`,
  project_deleted: (a) => `deleted project "${a.meta?.projectName || '...'}"`,
  member_added: (a) => `added ${a.targetUser?.name || 'a member'} to "${a.meta?.projectName || a.project?.name || '...'}"`,
  task_created: (a) => `created task "${a.meta?.taskTitle || a.task?.title || '...'}"`,
  task_assigned: (a) => `assigned "${a.meta?.taskTitle || a.task?.title || '...'}" to ${a.targetUser?.name || 'a member'}`,
  task_status_changed: (a) => `moved "${a.meta?.taskTitle || a.task?.title || '...'}" to ${a.meta?.newStatus || '...'}`,
  task_completed: (a) => `completed "${a.meta?.taskTitle || a.task?.title || '...'}"`,
  task_deleted: (a) => `deleted task "${a.meta?.taskTitle || '...'}"`,
};

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'tasks', label: 'Tasks', icon: CheckCircle2 },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
  { id: 'resources', label: 'Resources', icon: FileText },
  { id: 'activity', label: 'Activity', icon: Activity },
];

const ProjectWorkspace = ({ 
  projectId, 
  onClose, 
  onEditProject, 
  onAddMember,
  // Kanban props
  tasks,
  onEditTask,
  onCreateTask,
  onDeleteTask,
  onUpdateTaskStatus,
  refreshProjects,
}) => {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchWorkspaceData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const res = await projectService.getWorkspaceData(projectId);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load workspace');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchWorkspaceData();
  }, [fetchWorkspaceData]);

  const timeAgo = (date) => {
    const diff = (Date.now() - new Date(date).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0A0F1C] h-full">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0A0F1C] h-full text-center p-6">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Workspace Error</h2>
        <p className="text-slate-400 max-w-md">{error}</p>
        <button onClick={onClose} className="mt-6 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors">
          Go Back
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { project, stats, upcomingDeadlines, recentActivity } = data;
  const isOwner = project.owner && user && project.owner._id === user._id;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0A0F1C]">
      {/* Workspace Header */}
      <header className="bg-slate-900/50 border-b border-slate-800/80 shrink-0">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex gap-4">
              <button 
                onClick={onClose}
                className="mt-1 p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold text-white">{project.name}</h1>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide border ${
                    project.status === 'Completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                    project.status === 'On Hold' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                    'bg-blue-500/10 text-blue-400 border-blue-500/20'
                  }`}>
                    {project.status || 'Active'}
                  </span>
                </div>
                {project.description && (
                  <p className="text-sm text-slate-400 max-w-2xl line-clamp-2">{project.description}</p>
                )}
                
                <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5" />
                    Owner: <span className="text-slate-300 font-medium">{project.owner?.name}</span>
                  </div>
                  {project.deadline && (
                    <div className="flex items-center gap-1.5 text-orange-400">
                      <Clock className="w-3.5 h-3.5" />
                      Due: {new Date(project.deadline).toLocaleDateString()}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    {project.members?.length + 1} Members
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isOwner && (
                <>
                  <button 
                    onClick={() => onAddMember(project)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors border border-slate-700"
                  >
                    <UserPlus className="w-4 h-4" /> Add Member
                  </button>
                  <button 
                    onClick={() => onEditProject(project)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors border border-slate-700"
                  >
                    <Settings className="w-4 h-4" /> Settings
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 flex gap-1 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'border-blue-500 text-blue-400 bg-blue-500/5' 
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Tab Content Area */}
      <main className="flex-1 overflow-y-auto p-6">
        
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6 max-w-6xl mx-auto">
            {/* Progress Section */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Project Progress</h3>
                <span className="text-2xl font-bold text-white">{stats.progress}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden shadow-inner">
                <div 
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    stats.progress === 100 ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]' : 
                    stats.progress > 50 ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.4)]' : 
                    stats.progress > 0 ? 'bg-yellow-500' : 'bg-transparent'
                  }`}
                  style={{ width: `${stats.progress}%` }}
                />
              </div>
              <div className="flex justify-between mt-3 text-xs font-medium text-slate-500">
                <span>0%</span>
                <span>{stats.completed} / {stats.totalTasks} Tasks Completed</span>
                <span>100%</span>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              {[
                { label: 'Total Tasks', value: stats.totalTasks, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                { label: 'Backlog', value: stats.backlog || 0, color: 'text-slate-300', bg: 'bg-slate-800/50 border-slate-700' },
                { label: 'Todo', value: stats.todo, color: 'text-blue-300', bg: 'bg-blue-500/5 border-blue-500/15' },
                { label: 'In Progress', value: stats.inProgress, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
                { label: 'Review', value: stats.review || 0, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
                { label: 'Completed', value: stats.completed, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
                { label: 'Overdue', value: stats.overdue, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
              ].map((s, i) => (
                <div key={i} className={`p-4 rounded-xl border ${s.bg}`}>
                  <p className="text-xs font-medium text-slate-400 mb-1">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Activity & Team (Left Column) */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Team Preview */}
                <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-md font-semibold text-white flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-400" /> Team Preview
                    </h3>
                    <button onClick={() => setActiveTab('team')} className="text-xs font-medium text-blue-400 hover:underline">
                      View All
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {[project.owner, ...project.members].filter(Boolean).slice(0, 10).map((member, i) => (
                      <div key={member._id || i} className="flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 rounded-full pr-3 pl-1 py-1">
                        <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] font-bold text-blue-400">
                          {member.avatarInitials || '?'}
                        </div>
                        <span className="text-xs font-medium text-slate-300">{member.name.split(' ')[0]}</span>
                        {i === 0 && <span className="text-[9px] bg-slate-700 px-1.5 rounded-sm text-slate-300">Owner</span>}
                      </div>
                    ))}
                    {project.members.length > 9 && (
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-xs font-medium text-slate-400 border border-slate-700">
                        +{project.members.length - 9}
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6">
                  <h3 className="text-md font-semibold text-white flex items-center gap-2 mb-4">
                    <Activity className="w-4 h-4 text-slate-400" /> Recent Activity
                  </h3>
                  {recentActivity.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">No recent activity for this project.</p>
                  ) : (
                    <div className="space-y-4">
                      {recentActivity.map(a => (
                        <div key={a._id} className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                            {a.user?.avatarInitials || '?'}
                          </div>
                          <div>
                            <p className="text-sm text-slate-300">
                              <span className="font-medium text-white">{a.user?.name || 'Someone'}</span>{' '}
                              {ACTIVITY_MESSAGES[a.type] ? ACTIVITY_MESSAGES[a.type](a) : a.type}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">{timeAgo(a.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Upcoming Deadlines (Right Column) */}
              <div className="space-y-6">
                <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6">
                  <h3 className="text-md font-semibold text-white flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-4 h-4 text-slate-400" /> Upcoming Deadlines
                  </h3>
                  {upcomingDeadlines.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">No upcoming deadlines within 7 days.</p>
                  ) : (
                    <div className="space-y-3">
                      {upcomingDeadlines.map(task => {
                        const due = new Date(task.dueDate);
                        const today = new Date(); today.setHours(0,0,0,0);
                        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
                        const dueDay = new Date(due); dueDay.setHours(0,0,0,0);

                        let dateLabel;
                        if (dueDay.getTime() === today.getTime()) dateLabel = 'Today';
                        else if (dueDay.getTime() === tomorrow.getTime()) dateLabel = 'Tomorrow';
                        else dateLabel = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                        const isHigh = task.priority === 'High';

                        return (
                          <div key={task._id} className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/50">
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-sm font-medium text-slate-200 line-clamp-1">{task.title}</p>
                              {isHigh && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-1.5" />}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              <CalendarIcon className="w-3.5 h-3.5" />
                              <span className={dateLabel === 'Today' ? 'text-red-400 font-medium' : ''}>{dateLabel}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TASKS TAB (Advanced Kanban Board) */}
        {activeTab === 'tasks' && (
          <div className="h-full -mx-6 -mt-6">
            <KanbanBoard
              tasks={tasks}
              projectId={projectId}
              members={data ? [data.project.owner, ...data.project.members].filter(Boolean) : []}
              user={user}
              onEditTask={onEditTask}
              onCreateTask={onCreateTask}
              onDeleteTask={onDeleteTask}
              onUpdateTaskStatus={onUpdateTaskStatus}
              refreshProjects={refreshProjects}
            />
          </div>
        )}

        {/* TEAM TAB */}
        {activeTab === 'team' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <h2 className="text-xl font-bold text-white mb-6">Team Members</h2>
            <div className="bg-slate-900/30 border border-slate-800 rounded-2xl overflow-hidden">
              {[project.owner, ...project.members].filter(Boolean).map((member, i) => (
                <div key={member._id || i} className="flex items-center justify-between p-4 border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-sm font-bold text-blue-400">
                      {member.avatarInitials || '?'}
                    </div>
                    <div>
                      <p className="font-medium text-slate-200">{member.name}</p>
                      <p className="text-sm text-slate-500">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded text-xs font-medium ${i === 0 ? 'bg-indigo-500/10 text-indigo-400' : 'bg-slate-800 text-slate-400'}`}>
                      {i === 0 ? 'Owner' : 'Member'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PLACEHOLDER TABS FOR FUTURE FEATURES */}
        {['calendar', 'resources', 'activity'].includes(activeTab) && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-6 text-slate-500">
              {activeTab === 'calendar' && <CalendarIcon className="w-8 h-8" />}
              {activeTab === 'resources' && <FileText className="w-8 h-8" />}
              {activeTab === 'activity' && <MessageSquare className="w-8 h-8" />}
            </div>
            <h2 className="text-2xl font-bold text-white mb-2 capitalize">{activeTab}</h2>
            <p className="text-slate-400">
              This module is currently an integration point for future features. Advanced {activeTab} functionality will be implemented here soon.
            </p>
          </div>
        )}

      </main>
    </div>
  );
};

export default ProjectWorkspace;
