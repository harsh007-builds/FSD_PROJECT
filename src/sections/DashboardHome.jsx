import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Activity, CheckCircle2, Clock, AlertTriangle, BarChart3, Calendar as CalendarIcon, Users, ArrowRight } from 'lucide-react';
import { dashboardService, activityService } from '../services/api';
import { useProjects } from '../hooks/useProjects';
import { useUser } from '../context/UserContext';

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

const StatCard = ({ label, value, icon: Icon, color = 'blue' }) => {
  const colors = {
    blue: 'from-blue-500/10 to-blue-600/5 border-blue-500/20 text-blue-400',
    green: 'from-green-500/10 to-green-600/5 border-green-500/20 text-green-400',
    yellow: 'from-yellow-500/10 to-yellow-600/5 border-yellow-500/20 text-yellow-400',
    red: 'from-red-500/10 to-red-600/5 border-red-500/20 text-red-400',
    purple: 'from-purple-500/10 to-purple-600/5 border-purple-500/20 text-purple-400',
    indigo: 'from-indigo-500/10 to-indigo-600/5 border-indigo-500/20 text-indigo-400',
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br ${colors[color]} border p-5 transition-transform hover:scale-[1.02]`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-400">{label}</span>
        <Icon className={`w-5 h-5 ${colors[color].split(' ').pop()}`} />
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  );
};

const DashboardHome = () => {
  const { user } = useUser();
  const { projects, tasks } = useProjects();
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statsData, activitiesData] = await Promise.all([
        dashboardService.getStats(),
        activityService.getActivities(),
      ]);
      setStats(statsData);
      setActivities(activitiesData);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate project progress from tasks
  const projectsWithProgress = projects.map(p => {
    const projectTasks = tasks.filter(t => t.projectId === p.id);
    const total = projectTasks.length;
    const completed = projectTasks.filter(t => t.status === 'Completed').length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { ...p, calculatedProgress: progress, totalTasks: total, completedTasks: completed };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const timeAgo = (date) => {
    const diff = (Date.now() - new Date(date).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8 space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-white">Welcome back, {user?.name?.split(' ')[0] || 'User'}</h1>
        <p className="text-slate-400 mt-1">Here's what's happening across your projects.</p>
      </div>

      {/* Stat Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Projects" value={stats.totalProjects} icon={BookOpen} color="blue" />
          <StatCard label="Active" value={stats.activeProjects} icon={Activity} color="indigo" />
          <StatCard label="Tasks" value={stats.totalTasks} icon={BarChart3} color="purple" />
          <StatCard label="Completed" value={stats.completedTasks} icon={CheckCircle2} color="green" />
          <StatCard label="Pending" value={stats.pendingTasks} icon={Clock} color="yellow" />
          <StatCard label="Overdue" value={stats.overdueTasks} icon={AlertTriangle} color="red" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Project Progress */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-5">Project Progress</h2>
          {projectsWithProgress.length === 0 ? (
            <p className="text-slate-500 text-sm">No projects yet. Create one to get started!</p>
          ) : (
            <div className="space-y-5">
              {projectsWithProgress.map(p => (
                <div key={p.id}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-300">{p.name}</span>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{p.completedTasks}/{p.totalTasks} tasks</span>
                      <span className="font-bold text-white">{p.calculatedProgress}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className={`h-2.5 rounded-full transition-all duration-500 ${
                        p.calculatedProgress === 100 ? 'bg-green-500' : 
                        p.calculatedProgress > 50 ? 'bg-blue-500' : 
                        p.calculatedProgress > 0 ? 'bg-yellow-500' : 'bg-slate-700'
                      }`}
                      style={{ width: `${p.calculatedProgress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Deadlines */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-5">Upcoming Deadlines</h2>
          {stats?.upcomingDeadlines?.length === 0 ? (
            <p className="text-slate-500 text-sm">No upcoming deadlines this week.</p>
          ) : (
            <div className="space-y-4">
              {stats?.upcomingDeadlines?.map(task => {
                const due = new Date(task.dueDate);
                const today = new Date(); today.setHours(0,0,0,0);
                const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
                const dueDay = new Date(due); dueDay.setHours(0,0,0,0);

                let dateLabel;
                if (dueDay.getTime() === today.getTime()) dateLabel = 'Today';
                else if (dueDay.getTime() === tomorrow.getTime()) dateLabel = 'Tomorrow';
                else dateLabel = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                return (
                  <div key={task._id} className="flex items-center justify-between py-2 border-b border-slate-800/50 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        task.priority === 'High' ? 'bg-red-500' : task.priority === 'Medium' ? 'bg-yellow-500' : 'bg-blue-500'
                      }`} />
                      <span className="text-sm text-slate-300 truncate">{task.title}</span>
                    </div>
                    <span className="text-xs text-slate-500 ml-3 whitespace-nowrap">{dateLabel}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Activity Feed */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-5">Recent Activity</h2>
        {activities.length === 0 ? (
          <p className="text-slate-500 text-sm">No activity yet. Start creating projects and tasks!</p>
        ) : (
          <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
            {activities.slice(0, 20).map(a => (
              <div key={a._id} className="flex items-start gap-3 py-2 border-b border-slate-800/30 last:border-0">
                <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-blue-400 shrink-0 mt-0.5">
                  {a.user?.avatarInitials || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-300">
                    <span className="font-medium text-white">{a.user?.name || 'Someone'}</span>{' '}
                    {ACTIVITY_MESSAGES[a.type] ? ACTIVITY_MESSAGES[a.type](a) : a.type}
                  </p>
                  <span className="text-xs text-slate-500">{timeAgo(a.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardHome;
