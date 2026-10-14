import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, CheckCheck, Trash2, Settings, Bell, Clock, AlertTriangle, 
  CheckCircle2, Users, Shield, ArrowRight, ExternalLink, RefreshCw, 
  UserCheck, Mail, ArrowRightLeft, Sparkles, SlidersHorizontal, Check
} from 'lucide-react';
import { notificationService } from '../services/api';
import { useToast } from '../context/ToastContext';

const NOTIF_ICONS = {
  task_assigned: { icon: UserCheck, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  task_reassigned: { icon: ArrowRightLeft, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  task_status_changed: { icon: ArrowRight, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  task_completed: { icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  task_deadline_approaching: { icon: Clock, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  task_overdue: { icon: AlertTriangle, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  project_invitation: { icon: Mail, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  invitation_accepted: { icon: UserCheck, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  invitation_declined: { icon: X, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  role_changed: { icon: Shield, color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
  ownership_transferred: { icon: Shield, color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  member_removed: { icon: Users, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  member_left: { icon: Users, color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
  added_to_project: { icon: Users, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  project_updated: { icon: Sparkles, color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
};

function timeAgo(date) {
  if (!date) return '';
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

const NotificationCenterModal = ({ 
  isOpen, 
  onClose, 
  onNavigateToProject, 
  onOpenInvitations,
  onNotificationsUpdated,
}) => {
  const toast = useToast();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'unread' | 'tasks' | 'team'
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState({
    taskAssigned: true,
    taskStatusChanged: true,
    projectInvitations: true,
    membershipChanges: true,
    deadlineReminders: true,
  });
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  const [isCheckingDeadlines, setIsCheckingDeadlines] = useState(false);

  // Fetch notifications and preferences
  const fetchAll = async () => {
    try {
      setLoading(true);
      const [notifData, countData, prefData] = await Promise.all([
        notificationService.getNotifications().catch(() => []),
        notificationService.getUnreadCount().catch(() => ({ count: 0 })),
        notificationService.getPreferences().catch(() => null),
      ]);
      setNotifications(notifData || []);
      setUnreadCount(countData.count || 0);
      if (prefData) setPreferences(prefData);
      if (onNotificationsUpdated) onNotificationsUpdated(notifData || [], countData.count || 0);
    } catch (err) {
      console.error('Failed to load notification center data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAll();
    }
  }, [isOpen]);

  // Mark single notification as read
  const handleMarkAsRead = async (notifId, e) => {
    if (e) e.stopPropagation();
    try {
      await notificationService.markAsRead(notifId);
      setNotifications(prev => prev.map(n => n._id === notifId ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
      if (onNotificationsUpdated) {
        onNotificationsUpdated(
          notifications.map(n => n._id === notifId ? { ...n, read: true } : n),
          Math.max(0, unreadCount - 1)
        );
      }
    } catch (err) {
      toast?.showToast('Failed to mark notification as read', 'error');
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      toast?.showToast('All notifications marked as read', 'success');
      if (onNotificationsUpdated) {
        onNotificationsUpdated(notifications.map(n => ({ ...n, read: true })), 0);
      }
    } catch (err) {
      toast?.showToast('Failed to mark all as read', 'error');
    }
  };

  // Dismiss single notification
  const handleDismiss = async (notifId, e) => {
    if (e) e.stopPropagation();
    try {
      const target = notifications.find(n => n._id === notifId);
      await notificationService.deleteNotification(notifId);
      const updated = notifications.filter(n => n._id !== notifId);
      setNotifications(updated);
      if (target && !target.read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      toast?.showToast('Notification dismissed', 'success');
      if (onNotificationsUpdated) {
        onNotificationsUpdated(updated, target && !target.read ? Math.max(0, unreadCount - 1) : unreadCount);
      }
    } catch (err) {
      toast?.showToast('Failed to dismiss notification', 'error');
    }
  };

  // Clear all read notifications
  const handleClearAllRead = async () => {
    try {
      const res = await notificationService.clearAllReadNotifications();
      const updated = notifications.filter(n => !n.read);
      setNotifications(updated);
      toast?.showToast(`Cleared ${res.deletedCount || 0} read notifications`, 'success');
      if (onNotificationsUpdated) {
        onNotificationsUpdated(updated, unreadCount);
      }
    } catch (err) {
      toast?.showToast('Failed to clear read notifications', 'error');
    }
  };

  // Toggle preference
  const handleTogglePreference = async (key) => {
    const newPrefs = { ...preferences, [key]: !preferences[key] };
    setPreferences(newPrefs);
    try {
      setIsSavingPrefs(true);
      await notificationService.updatePreferences(newPrefs);
      toast?.showToast('Preferences updated', 'success');
    } catch (err) {
      toast?.showToast('Failed to update preference', 'error');
      // Rollback
      setPreferences(preferences);
    } finally {
      setIsSavingPrefs(false);
    }
  };

  // Run deadline sweep
  const handleCheckDeadlines = async () => {
    try {
      setIsCheckingDeadlines(true);
      const res = await notificationService.checkDeadlineReminders();
      if (res.remindersSent > 0) {
        toast?.showToast(`Found ${res.remindersSent} new deadline reminder${res.remindersSent === 1 ? '' : 's'}!`, 'info');
        await fetchAll();
      } else {
        toast?.showToast('All deadline checks up to date. No new alerts.', 'info');
      }
    } catch (err) {
      toast?.showToast('Failed to run deadline check', 'error');
    } finally {
      setIsCheckingDeadlines(false);
    }
  };

  // Direct resource navigation handler
  const handleActionClick = (notif) => {
    // Automatically mark as read if not already
    if (!notif.read) {
      handleMarkAsRead(notif._id);
    }

    if (notif.type === 'project_invitation' || notif.invitation) {
      onClose();
      if (onOpenInvitations) onOpenInvitations();
    } else if (notif.project?._id || notif.project) {
      const projId = notif.project?._id || notif.project;
      onClose();
      if (onNavigateToProject) onNavigateToProject(projId);
    }
  };

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    if (activeTab === 'unread') {
      return notifications.filter(n => !n.read);
    }
    if (activeTab === 'tasks') {
      return notifications.filter(n => 
        ['task_assigned', 'task_reassigned', 'task_status_changed', 'task_completed', 'task_deadline_approaching', 'task_overdue'].includes(n.type)
      );
    }
    if (activeTab === 'team') {
      return notifications.filter(n => 
        ['project_invitation', 'invitation_accepted', 'invitation_declined', 'role_changed', 'ownership_transferred', 'member_removed', 'member_left', 'added_to_project', 'project_updated'].includes(n.type)
      );
    }
    return notifications;
  }, [notifications, activeTab]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-center-title"
      >
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="notif-center-title" className="text-base sm:text-lg font-bold text-white">
                  Notification Center
                </h2>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-semibold">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">Real-time alerts, project updates & assignments</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreferences(prev => !prev)}
              className={`p-2 rounded-lg border transition-colors ${
                showPreferences 
                  ? 'bg-blue-600 text-white border-blue-500' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Notification Preferences"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors"
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PREFERENCES PANEL (Collapsible) */}
        {showPreferences && (
          <div className="p-4 bg-slate-950/60 border-b border-slate-800 space-y-3 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                  Notification Preferences
                </h3>
              </div>
              <span className="text-[11px] text-slate-500">Auto-saved to your account</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {[
                { key: 'taskAssigned', label: 'Task Assignments & Reassignments' },
                { key: 'taskStatusChanged', label: 'Task Status Changes & Completions' },
                { key: 'projectInvitations', label: 'Project Invitations & Responses' },
                { key: 'membershipChanges', label: 'Team Roles & Membership Updates' },
                { key: 'deadlineReminders', label: 'Approaching & Overdue Deadlines' },
              ].map(({ key, label }) => (
                <label 
                  key={key} 
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors"
                >
                  <span className="text-slate-300">{label}</span>
                  <input
                    type="checkbox"
                    checked={preferences[key] !== false}
                    onChange={() => handleTogglePreference(key)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-800 border-slate-700 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ACTION BAR & TABS */}
        <div className="px-4 py-3 border-b border-slate-800/80 bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/60 rounded-xl border border-slate-800">
            {[
              { id: 'all', label: 'All' },
              { id: 'unread', label: `Unread (${unreadCount})` },
              { id: 'tasks', label: 'Tasks' },
              { id: 'team', label: 'Team & Projects' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCheckDeadlines}
              disabled={isCheckingDeadlines}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Check for approaching deadlines"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingDeadlines ? 'animate-spin text-amber-400' : ''}`} />
              <span className="hidden sm:inline">Check Deadlines</span>
            </button>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 font-medium flex items-center gap-1.5 transition-colors"
                title="Mark all notifications as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mark all read</span>
              </button>
            )}

            {notifications.some(n => n.read) && (
              <button
                onClick={handleClearAllRead}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-red-500/10 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/30 font-medium flex items-center gap-1.5 transition-colors"
                title="Clear all read notifications"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear read</span>
              </button>
            )}
          </div>
        </div>

        {/* NOTIFICATION FEED */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-2 sm:p-4 space-y-1">
          {loading ? (
            <div className="py-16 text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Loading notifications...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/50 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto mb-3">
                <Bell className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-300">No notifications found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {activeTab === 'unread' 
                  ? "You're all caught up! There are no unread notifications right now."
                  : "No notifications have been recorded for this category yet."}
              </p>
            </div>
          ) : (
            filteredNotifications.map((notif) => {
              const meta = NOTIF_ICONS[notif.type] || { icon: Bell, color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' };
              const IconComponent = meta.icon;

              return (
                <div
                  key={notif._id}
                  onClick={() => handleActionClick(notif)}
                  className={`group relative p-3.5 sm:p-4 rounded-xl transition-all cursor-pointer border ${
                    !notif.read 
                      ? 'bg-blue-950/20 border-blue-900/40 hover:bg-blue-950/30' 
                      : 'bg-slate-900/40 border-transparent hover:bg-slate-800/40 hover:border-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    {/* TYPE ICON */}
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${meta.color}`}>
                      <IconComponent className="w-4 h-4" />
                    </div>

                    {/* CONTENT */}
                    <div className="flex-1 min-w-0 pr-8">
                      <div className="flex items-center gap-2">
                        <p className={`text-xs sm:text-sm leading-snug ${!notif.read ? 'font-semibold text-white' : 'text-slate-300'}`}>
                          {notif.message}
                        </p>
                        {!notif.read && (
                          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" title="Unread" />
                        )}
                      </div>

                      {/* META BADGES & TIMESTAMP */}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-[11px] text-slate-500 font-medium">
                          {timeAgo(notif.createdAt)}
                        </span>

                        {notif.project?.name && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700/60 text-[10px] text-slate-300">
                            📁 {notif.project.name}
                          </span>
                        )}

                        {notif.task?.title && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700/60 text-[10px] text-slate-300 truncate max-w-[180px]">
                            ✓ {notif.task.title}
                          </span>
                        )}

                        {/* Navigation pill button */}
                        {(notif.project || notif.type === 'project_invitation') && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-blue-400 group-hover:text-blue-300 font-medium underline underline-offset-2 ml-auto">
                            {notif.type === 'project_invitation' ? 'Review Invitation' : 'Go to Project'}
                            <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ACTIONS (HOVER OR CONSTANT) */}
                    <div className="absolute right-3 top-3 flex items-center gap-1">
                      {!notif.read && (
                        <button
                          onClick={(e) => handleMarkAsRead(notif._id, e)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-blue-600 text-slate-400 hover:text-white transition-colors"
                          title="Mark as read"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDismiss(notif._id, e)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors opacity-70 group-hover:opacity-100"
                        title="Dismiss notification"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-500 px-4">
          <span>{notifications.length} total alerts</span>
          <span>Click on any notification to navigate to its source</span>
        </div>
      </div>
    </div>
  );
};

export default NotificationCenterModal;
