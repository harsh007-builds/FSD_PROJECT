import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ArrowLeft, UserPlus, Calendar as CalendarIcon, 
  Activity, Settings, CheckCircle2, Clock, AlertTriangle, 
  Users, Briefcase, FileText, LayoutDashboard, Archive, 
  LogOut, UserMinus, ChevronLeft, ChevronRight, ExternalLink,
  Plus, Tag, MessageSquare, Shield, Crown, ArrowRightLeft, Mail, UserCheck, UserX, RefreshCw, Filter, BookOpen, Video
} from 'lucide-react';
import { projectService, activityService, messageService, noteService, sessionService } from '../services/api';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { useSocket } from '../context/SocketContext';
import KanbanBoard from '../components/KanbanBoard';
import TaskDetailsDrawer from '../components/TaskDetailsDrawer';
import ConfirmModal from './../components/ConfirmModal';
import InviteMemberModal from '../components/InviteMemberModal';
import TransferOwnershipModal from '../components/TransferOwnershipModal';
import IntegratedCalendar from '../components/IntegratedCalendar';
import ProjectResourcesTab from '../components/ProjectResourcesTab';
import ProjectDiscussionsTab from '../components/ProjectDiscussionsTab';
import ProjectNotesTab from '../components/ProjectNotesTab';
import ProjectStudyRoomsTab from '../components/ProjectStudyRoomsTab';

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
  invitation_declined: (a) => `declined the invitation to join the project`,
  task_created: (a) => `created task "${a.meta?.taskTitle || a.task?.title || '...'}"`,
  task_assigned: (a) => `assigned "${a.meta?.taskTitle || a.task?.title || '...'}" to ${a.targetUser?.name || 'a member'}`,
  task_reassigned: (a) => `reassigned "${a.meta?.taskTitle || a.task?.title || '...'}" to ${a.targetUser?.name || 'a member'}`,
  task_status_changed: (a) => `moved "${a.meta?.taskTitle || a.task?.title || '...'}" to ${a.meta?.newStatus || '...'}`,
  task_completed: (a) => `completed "${a.meta?.taskTitle || a.task?.title || '...'}"`,
  task_deleted: (a) => `deleted task "${a.meta?.taskTitle || '...'}"`,
  resource_created: (a) => `added resource link "${a.meta?.resourceTitle || a.resource?.title || '...'}"`,
  resource_uploaded: (a) => `uploaded file "${a.meta?.fileName || a.meta?.resourceTitle || a.resource?.title || '...'}"`,
  resource_updated: (a) => `updated resource "${a.meta?.resourceTitle || a.resource?.title || '...'}"`,
  resource_deleted: (a) => `deleted resource "${a.meta?.resourceTitle || '...'}"`,
  note_created: (a) => `created study note "${a.meta?.noteTitle || a.note?.title || '...'}"`,
  note_updated: (a) => `updated study note "${a.meta?.noteTitle || a.note?.title || '...'}"`,
  note_deleted: (a) => `deleted study note "${a.meta?.noteTitle || '...'}"`,
  note_restored: (a) => `restored study note "${a.meta?.noteTitle || '...'}" to v${a.meta?.version || '...'}"`,
  session_created: (a) => `scheduled study session "${a.meta?.sessionTitle || a.session?.title || '...'}"`,
  session_started: (a) => `started study session "${a.meta?.sessionTitle || a.session?.title || '...'}"`,
  session_completed: (a) => `completed study session "${a.meta?.sessionTitle || a.session?.title || '...'}"`,
  session_updated: (a) => `updated study session "${a.meta?.sessionTitle || a.session?.title || '...'}"`,
  session_cancelled: (a) => `cancelled study session "${a.meta?.sessionTitle || '...'}"`,
};

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'tasks', label: 'Tasks', icon: CheckCircle2 },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'discussions', label: 'Discussions', icon: MessageSquare },
  { id: 'notes', label: 'Notes', icon: BookOpen },
  { id: 'sessions', label: 'Study Rooms', icon: Video },
  { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
  { id: 'resources', label: 'Resources', icon: FileText },
  { id: 'activity', label: 'Activity', icon: Activity },
];

const ProjectWorkspace = ({ 
  projectId, 
  initialTab = 'overview',
  onTabChange,
  onClose, 
  onEditProject, 
  onAddMember,
  onArchiveProject,
  onRemoveMember,
  onLeaveProject,
  onUpdateMemberRole,
  onTransferOwnership,
  onInviteMember,
  onCancelInvitation,
  // Tasks props
  tasks = [],
  onEditTask,
  onCreateTask,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onUpdateTaskStatus,
  onAddComment,
  onDeleteComment,
  refreshProjects,
}) => {
  const { user } = useUser();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState(initialTab || 'overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals state
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Phase 2 Team states
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [inviteToCancel, setInviteToCancel] = useState(null);
  const [isCancellingInvite, setIsCancellingInvite] = useState(false);
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState(null);

  // Calendar tab state
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedCalendarTask, setSelectedCalendarTask] = useState(null);

  // Phase 5 Paginated Activity Timeline State
  const [projectActivities, setProjectActivities] = useState([]);
  const [activityPage, setActivityPage] = useState(1);
  const [activityTotal, setActivityTotal] = useState(0);
  const [hasMoreActivities, setHasMoreActivities] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [activityFilter, setActivityFilter] = useState('all'); // 'all' | 'tasks' | 'team' | 'project'
  const [unreadDiscussionCount, setUnreadDiscussionCount] = useState(0);

  const socketContext = useSocket();
  const socket = socketContext?.socket;

  // Phase 8 Discussions Unread Count
  useEffect(() => {
    if (!projectId) return;
    messageService.getUnreadCount(projectId)
      .then(res => setUnreadDiscussionCount(res.unreadCount || 0))
      .catch(() => {});
  }, [projectId, activeTab]);

  useEffect(() => {
    if (!socket || !projectId) return;
    const handleNewMessage = (msg) => {
      const msgProjId = msg.project?._id || msg.project;
      if (msgProjId && msgProjId.toString() === projectId.toString()) {
        const senderId = msg.sender?._id || msg.sender;
        if (senderId !== user?._id && activeTab !== 'discussions') {
          setUnreadDiscussionCount(prev => prev + 1);
        }
      }
    };
    socket.on('message:new', handleNewMessage);
    return () => socket.off('message:new', handleNewMessage);
  }, [socket, projectId, user?._id, activeTab]);

  const fetchProjectActivities = useCallback(async (pageToLoad = 1, append = false) => {
    if (!projectId) return;
    try {
      setLoadingActivities(true);
      const res = await activityService.getProjectActivities(projectId, pageToLoad, 15);
      if (append) {
        setProjectActivities(prev => [...prev, ...(res.activities || [])]);
      } else {
        setProjectActivities(res.activities || []);
      }
      setActivityPage(res.page || 1);
      setActivityTotal(res.total || 0);
      setHasMoreActivities(Boolean(res.hasMore));
    } catch (err) {
      console.error('Failed to load project activity timeline:', err);
    } finally {
      setLoadingActivities(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (activeTab === 'activity') {
      fetchProjectActivities(1, false);
    }
  }, [activeTab, fetchProjectActivities]);

  // Real-time activity updates for this project
  useEffect(() => {
    if (!socket || !projectId) return;
    const handleNewActivity = (newAct) => {
      const actProjId = newAct.project?._id || newAct.project;
      if (actProjId && actProjId.toString() === projectId.toString()) {
        setProjectActivities(prev => [newAct, ...prev]);
        setActivityTotal(prev => prev + 1);
      }
    };
    socket.on('activity:new', handleNewActivity);
    return () => socket.off('activity:new', handleNewActivity);
  }, [socket, projectId]);

  // Sync tab with props if initialTab changes
  useEffect(() => {
    if (initialTab && TABS.some(t => t.id === initialTab)) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabSelect = (tabId) => {
    setActiveTab(tabId);
    if (onTabChange) {
      onTabChange(tabId);
    }
  };

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

  // Tasks belonging to this project
  const projectTasks = useMemo(() => {
    return tasks.filter(t => t.projectId === projectId);
  }, [tasks, projectId]);

  // Calculate live statistics from actual tasks
  const liveStats = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let todo = 0;
    let backlog = 0;
    let review = 0;
    let overdue = 0;
    const total = projectTasks.length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    projectTasks.forEach(t => {
      if (t.status === 'Completed') completed++;
      else if (t.status === 'In Progress') inProgress++;
      else if (t.status === 'Todo') todo++;
      else if (t.status === 'Backlog') backlog++;
      else if (t.status === 'Review') review++;

      if (t.dueDate && t.status !== 'Completed') {
        const due = new Date(t.dueDate);
        due.setHours(0, 0, 0, 0);
        if (due.getTime() < today.getTime()) {
          overdue++;
        }
      }
    });

    const progress = total === 0 ? 0 : Math.round((completed / total) * 100);

    return {
      total,
      completed,
      inProgress,
      todo,
      backlog,
      review,
      overdue,
      progress,
    };
  }, [projectTasks]);

  // Detected external links across tasks
  const taskResources = useMemo(() => {
    const links = [];
    projectTasks.forEach(t => {
      const text = `${t.description || ''} ${(t.labels || []).join(' ')}`;
      const matches = text.match(/https?:\/\/[^\s]+/g);
      if (matches) {
        matches.forEach(url => {
          links.push({
            url: url.replace(/[.,;!?)]+$/, ''),
            taskTitle: t.task || t.title,
            taskId: t.id,
            priority: t.priority
          });
        });
      }
    });
    return links;
  }, [projectTasks]);

  const timeAgo = (date) => {
    if (!date) return 'just now';
    const diff = (Date.now() - new Date(date).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const handleArchiveToggle = async () => {
    if (!onArchiveProject) return;
    setIsActionLoading(true);
    try {
      const isCurrentlyArchived = data?.project?.status === 'Archived';
      await onArchiveProject(projectId);
      await fetchWorkspaceData();
      setShowArchiveConfirm(false);
      toast.success(isCurrentlyArchived ? 'Project unarchived' : 'Project archived');
    } catch (err) {
      toast.error(err.message || 'Failed to update project archive state');
      console.error('Failed to toggle archive', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRemoveMemberConfirm = async () => {
    if (!memberToRemove || !onRemoveMember) return;
    setIsActionLoading(true);
    try {
      await onRemoveMember(projectId, memberToRemove._id || memberToRemove.id);
      await fetchWorkspaceData();
      setMemberToRemove(null);
      toast.success('Member removed');
    } catch (err) {
      toast.error(err.message || 'Failed to remove member');
      console.error('Failed to remove member', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLeaveConfirm = async () => {
    if (!onLeaveProject) return;
    setIsActionLoading(true);
    try {
      await onLeaveProject(projectId);
      setShowLeaveConfirm(false);
      toast.success('You have left the project');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to leave project');
      console.error('Failed to leave project', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleInviteSubmit = async (inviteData) => {
    if (!onInviteMember) return;
    await onInviteMember(projectId, inviteData);
    toast.success(`In-app invitation sent to ${inviteData.email} as ${inviteData.role}`);
    await fetchWorkspaceData();
  };

  const handleTransferOwnershipSubmit = async (newOwnerId) => {
    if (!onTransferOwnership) return;
    await onTransferOwnership(projectId, newOwnerId);
    toast.success('Project ownership transferred successfully');
    await fetchWorkspaceData();
  };

  const handleRoleChange = async (memberId, newRole) => {
    if (!onUpdateMemberRole) return;
    setRoleUpdatingUserId(memberId);
    try {
      await onUpdateMemberRole(projectId, memberId, newRole);
      toast.success(`Role updated to ${newRole}`);
      await fetchWorkspaceData();
    } catch (err) {
      toast.error(err.message || 'Failed to update member role');
    } finally {
      setRoleUpdatingUserId(null);
    }
  };

  const handleCancelInviteSubmit = async () => {
    if (!inviteToCancel || !onCancelInvitation) return;
    setIsCancellingInvite(true);
    try {
      await onCancelInvitation(projectId, inviteToCancel._id);
      toast.info('Invitation cancelled');
      setInviteToCancel(null);
      await fetchWorkspaceData();
    } catch (err) {
      toast.error(err.message || 'Failed to cancel invitation');
    } finally {
      setIsCancellingInvite(false);
    }
  };

  // Calendar helpers
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const calendarCells = useMemo(() => {
    const cells = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(d);
    }
    return cells;
  }, [startDayOfWeek, daysInMonth]);

  const getCalendarTasksForDay = (day) => {
    const target = new Date(year, month, day);
    target.setHours(0, 0, 0, 0);
    return projectTasks.filter(t => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === target.getTime();
    });
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

  const { project, upcomingDeadlines, recentActivity } = data;
  const callerRole = data.callerRole || (project.owner && user && (project.owner._id === user._id || project.owner === user._id) ? 'Owner' : 'Member');
  const isOwner = callerRole === 'Owner';
  const isAdmin = callerRole === 'Admin';
  const canManageTeam = isOwner || isAdmin;
  const isArchived = project.status === 'Archived';
  const pendingInvitations = data.pendingInvitations || [];

  const allMembers = useMemo(() => {
    const list = [...(project.members || [])];
    const ownerId = project.owner?._id ? project.owner._id.toString() : project.owner?.toString();
    const hasOwner = list.some(m => (m._id ? m._id.toString() : m.toString()) === ownerId);
    if (!hasOwner && project.owner && typeof project.owner === 'object') {
      list.unshift({
        ...project.owner,
        role: 'Owner',
        workload: { totalAssigned: 0, completedTasks: 0, pendingTasks: 0, overdueTasks: 0, completionRate: 0 },
      });
    }
    return list;
  }, [project]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0A0F1C]">
      {/* Workspace Header */}
      <header className="bg-slate-900/40 border-b border-slate-800/80 shrink-0">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex gap-4">
              <button 
                onClick={onClose}
                className="mt-1 p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0"
                aria-label="Back to projects"
                title="Back to all projects"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold text-white">{project.name}</h1>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide border ${
                    isArchived ? 'bg-slate-800 text-slate-400 border-slate-700' :
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
                
                <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                    Owner: <span className="text-slate-300 font-medium">{project.owner?.name || 'Owner'}</span>
                  </div>
                  {project.deadline && (
                    <div className="flex items-center gap-1.5 text-orange-400">
                      <Clock className="w-3.5 h-3.5" />
                      Due: {new Date(project.deadline).toLocaleDateString()}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    {allMembers.length} Members
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                    Progress: <span className="font-semibold text-white">{liveStats.progress}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-2">
              {isOwner ? (
                <>
                  <button 
                    onClick={() => setShowArchiveConfirm(true)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                      isArchived 
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20' 
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                    title={isArchived ? "Unarchive Project" : "Archive Project"}
                  >
                    <Archive className="w-3.5 h-3.5" />
                    {isArchived ? 'Unarchive' : 'Archive'}
                  </button>
                  <button 
                    onClick={() => onAddMember(project)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors border border-slate-700"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Invite
                  </button>
                  <button 
                    onClick={() => onEditProject(project)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors border border-slate-700"
                  >
                    <Settings className="w-3.5 h-3.5" /> Settings
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowLeaveConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 rounded-lg text-xs font-medium transition-colors border border-slate-700"
                >
                  <LogOut className="w-3.5 h-3.5" /> Leave Project
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 flex gap-1 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabSelect(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'border-blue-500 text-blue-400 bg-blue-500/5' 
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.id === 'tasks' && (
                <span className="text-[10px] px-1.5 py-0.2 bg-slate-800 rounded-full text-slate-400">
                  {liveStats.total}
                </span>
              )}
              {tab.id === 'discussions' && unreadDiscussionCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold rounded-full animate-pulse">
                  {unreadDiscussionCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* Main Tab Content Area */}
      <main className="flex-1 overflow-y-auto p-6">
        
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6 max-w-6xl mx-auto">
            {/* Progress Bar (Calculated from live tasks) */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold text-white">Project Progress</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Calculated in real-time from active task completion</p>
                </div>
                <span className="text-2xl font-bold text-white">{liveStats.progress}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden shadow-inner">
                <div 
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    liveStats.progress === 100 ? 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)]' : 
                    liveStats.progress > 50 ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.4)]' : 
                    liveStats.progress > 0 ? 'bg-yellow-500' : 'bg-transparent'
                  }`}
                  style={{ width: `${liveStats.progress}%` }}
                />
              </div>
              <div className="flex justify-between mt-3 text-xs font-medium text-slate-500">
                <span>0%</span>
                <span>{liveStats.completed} / {liveStats.total} Tasks Completed</span>
                <span>100%</span>
              </div>
            </div>

            {/* Task Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { label: 'Total Tasks', value: liveStats.total, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                { label: 'Backlog', value: liveStats.backlog, color: 'text-slate-300', bg: 'bg-slate-800/50 border-slate-700/60' },
                { label: 'To Do', value: liveStats.todo, color: 'text-blue-300', bg: 'bg-blue-500/5 border-blue-500/15' },
                { label: 'In Progress', value: liveStats.inProgress, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
                { label: 'Review', value: liveStats.review, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
                { label: 'Completed', value: liveStats.completed, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
                { label: 'Overdue', value: liveStats.overdue, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
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
                
                {/* Team Preview Card */}
                <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-400" /> Team Preview ({allMembers.length})
                    </h3>
                    <button onClick={() => handleTabSelect('team')} className="text-xs font-medium text-blue-400 hover:underline">
                      Manage Team
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {allMembers.slice(0, 8).map((member, i) => (
                      <div key={member._id || member.id || i} className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/60 rounded-full pr-3 pl-1 py-1 text-xs">
                        <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] font-bold text-blue-400">
                          {member.avatarInitials || member.name?.[0] || '?'}
                        </div>
                        <span className="font-medium text-slate-300">{member.name?.split(' ')[0]}</span>
                        {i === 0 && <span className="text-[9px] bg-slate-700 px-1.5 rounded-sm text-slate-300">Owner</span>}
                      </div>
                    ))}
                    {allMembers.length > 8 && (
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-xs font-medium text-slate-400 border border-slate-700">
                        +{allMembers.length - 8}
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent Activity Card */}
                <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-slate-400" /> Recent Activity
                    </h3>
                    <button onClick={() => handleTabSelect('activity')} className="text-xs font-medium text-blue-400 hover:underline">
                      View All
                    </button>
                  </div>
                  {(!recentActivity || recentActivity.length === 0) ? (
                    <p className="text-xs text-slate-500 py-4 text-center">No recent activity recorded for this project.</p>
                  ) : (
                    <div className="space-y-3.5">
                      {recentActivity.slice(0, 5).map(a => (
                        <div key={a._id} className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-blue-400 shrink-0 mt-0.5">
                            {a.user?.avatarInitials || a.user?.name?.[0] || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-300 leading-normal">
                              <span className="font-semibold text-white">{a.user?.name || 'User'}</span>{' '}
                              {ACTIVITY_MESSAGES[a.type] ? ACTIVITY_MESSAGES[a.type](a) : a.type}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{timeAgo(a.createdAt)}</p>
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
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-4 h-4 text-orange-400" /> Upcoming Deadlines
                  </h3>
                  {(!upcomingDeadlines || upcomingDeadlines.length === 0) ? (
                    <p className="text-xs text-slate-500 py-4 text-center">No upcoming task deadlines within 7 days.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {upcomingDeadlines.map(task => {
                        const due = new Date(task.dueDate);
                        const today = new Date(); today.setHours(0,0,0,0);
                        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
                        const dueDay = new Date(due); dueDay.setHours(0,0,0,0);

                        let dateLabel;
                        if (dueDay.getTime() === today.getTime()) dateLabel = 'Today';
                        else if (dueDay.getTime() === tomorrow.getTime()) dateLabel = 'Tomorrow';
                        else dateLabel = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                        const isHigh = task.priority === 'High' || task.priority === 'Urgent';

                        return (
                          <div 
                            key={task._id} 
                            onClick={() => handleTabSelect('tasks')}
                            className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/50 hover:border-blue-500/40 cursor-pointer transition-colors"
                          >
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-xs font-semibold text-slate-200 line-clamp-1">{task.title}</p>
                              {isHigh && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-1" />}
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="w-3 h-3 text-slate-500" />
                                <span className={dateLabel === 'Today' ? 'text-red-400 font-semibold' : ''}>{dateLabel}</span>
                              </span>
                              <span className="text-[10px] text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded">{task.status}</span>
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

        {/* TASKS TAB (Full Kanban Board) */}
        {activeTab === 'tasks' && (
          <div className="h-full -mx-6 -mt-6">
            <KanbanBoard
              tasks={tasks}
              projectId={projectId}
              members={allMembers}
              user={user}
              onEditTask={onEditTask}
              onCreateTask={onCreateTask}
              onDeleteTask={onDeleteTask}
              onUpdateTaskStatus={onUpdateTaskStatus}
              onAddComment={onAddComment}
              onDeleteComment={onDeleteComment}
            />
          </div>
        )}

        {/* TEAM TAB (Phase 2 Full Team Management) */}
        {activeTab === 'team' && (
          <div className="max-w-5xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-400" /> Team & Collaboration
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Manage member roles, assigned workload, and in-app project invitations.
                </p>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                {canManageTeam && (
                  <button
                    onClick={() => setIsInviteModalOpen(true)}
                    className="btn-primary py-2 px-3 text-xs flex items-center gap-1.5 shadow-md shadow-blue-600/20"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Invite Teammate
                  </button>
                )}

                {isOwner && (
                  <button
                    onClick={() => setIsTransferModalOpen(true)}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors flex items-center gap-1.5"
                    title="Transfer project ownership"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer Ownership
                  </button>
                )}

                {!isOwner && (
                  <button
                    onClick={() => setShowLeaveConfirm(true)}
                    className="px-3 py-2 rounded-xl text-xs font-semibold border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Leave Project
                  </button>
                )}
              </div>
            </div>

            {/* Active Members Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  Active Members <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{allMembers.length}</span>
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-3.5">
                {allMembers.map((member, i) => {
                  const mId = member._id || member.id || i;
                  const isCurrentMemberOwner = (project.owner?._id || project.owner) === mId;
                  const isSelf = user && (user._id === mId || user.id === mId);
                  const memberRole = isCurrentMemberOwner ? 'Owner' : (member.role || 'Member');
                  const workload = member.workload || {
                    totalAssigned: 0,
                    completedTasks: 0,
                    pendingTasks: 0,
                    overdueTasks: 0,
                    completionRate: 0,
                  };

                  return (
                    <div 
                      key={mId}
                      className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-700/80 transition-colors"
                    >
                      {/* Left: User Profile & Role */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="relative shrink-0">
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm ${
                            memberRole === 'Owner' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                            memberRole === 'Admin' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' :
                            'bg-blue-500/20 text-blue-300 border border-blue-500/20'
                          }`}>
                            {member.avatarInitials || member.name?.[0] || '?'}
                          </div>
                          <div className={`absolute -bottom-1 -right-1 p-0.5 rounded-full ${
                            memberRole === 'Owner' ? 'bg-amber-500 text-slate-950' :
                            memberRole === 'Admin' ? 'bg-indigo-500 text-white' :
                            'bg-slate-700 text-slate-300'
                          }`}>
                            {memberRole === 'Owner' ? <Crown className="w-2.5 h-2.5" /> :
                             memberRole === 'Admin' ? <Shield className="w-2.5 h-2.5" /> :
                             <User className="w-2.5 h-2.5" />}
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-white truncate">{member.name}</p>
                            {isSelf && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-medium">You</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 truncate">{member.email}</p>
                        </div>
                      </div>

                      {/* Middle: Assigned Workload */}
                      <div className="flex flex-col gap-1.5 min-w-[200px] border-t md:border-t-0 md:border-l border-slate-800/80 pt-3 md:pt-0 md:pl-5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400 text-[11px] font-medium">
                            {workload.totalAssigned} {workload.totalAssigned === 1 ? 'Task' : 'Tasks'} Assigned
                          </span>
                          <span className="text-white text-[11px] font-semibold">
                            {workload.completionRate}% Done
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-1.5 rounded-full transition-all duration-500 ${
                              workload.completionRate === 100 ? 'bg-green-500' :
                              workload.completionRate > 50 ? 'bg-blue-500' :
                              workload.completionRate > 0 ? 'bg-yellow-500' : 'bg-slate-700'
                            }`}
                            style={{ width: `${workload.completionRate}%` }}
                          />
                        </div>

                        {/* Workload Breakdown Pills */}
                        <div className="flex items-center gap-2 flex-wrap text-[10px]">
                          <span className="text-slate-400">{workload.pendingTasks} pending</span>
                          <span className="text-slate-600">•</span>
                          <span className="text-green-400">{workload.completedTasks} completed</span>
                          {workload.overdueTasks > 0 && (
                            <>
                              <span className="text-slate-600">•</span>
                              <span className="text-red-400 font-semibold">{workload.overdueTasks} overdue</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Right: Role Control & Actions */}
                      <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0">
                        {/* Role selector for Owner modifying teammate roles */}
                        {isOwner && !isCurrentMemberOwner ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-500 hidden sm:inline">Role:</span>
                            <select
                              value={memberRole}
                              onChange={(e) => handleRoleChange(mId, e.target.value)}
                              disabled={roleUpdatingUserId === mId}
                              className="bg-slate-950 border border-slate-700 hover:border-slate-600 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                            >
                              <option value="Member">Member</option>
                              <option value="Admin">Admin</option>
                            </select>
                          </div>
                        ) : (
                          <span className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                            memberRole === 'Owner' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            memberRole === 'Admin' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                            'bg-slate-800 text-slate-300 border border-slate-700/60'
                          }`}>
                            {memberRole === 'Owner' && <Crown className="w-3.5 h-3.5" />}
                            {memberRole === 'Admin' && <Shield className="w-3.5 h-3.5" />}
                            {memberRole === 'Member' && <User className="w-3.5 h-3.5" />}
                            {memberRole}
                          </span>
                        )}

                        {/* Removal action */}
                        {((isOwner && !isCurrentMemberOwner) || (isAdmin && memberRole === 'Member' && !isSelf)) && (
                          <button
                            onClick={() => setMemberToRemove(member)}
                            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                            title="Remove from project"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pending In-App Invitations Section (Owners and Admins) */}
            {canManageTeam && (
              <div className="space-y-4 pt-4 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <Mail className="w-4 h-4 text-blue-400" /> Pending Invitations 
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                        {pendingInvitations.length}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Secure in-app invites awaiting recipient acceptance
                    </p>
                  </div>
                </div>

                {pendingInvitations.length === 0 ? (
                  <div className="p-6 text-center border border-dashed border-slate-800/80 rounded-2xl bg-slate-900/10">
                    <Mail className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-xs text-slate-400 font-medium">No pending invitations</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Teammates you invite will appear here until they accept or decline.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {pendingInvitations.map((invite) => {
                      const isExpired = new Date(invite.expiresAt) < new Date();
                      return (
                        <div
                          key={invite._id}
                          className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl flex items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                              {invite.recipient?.avatarInitials || invite.recipientEmail[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white truncate">
                                {invite.recipient?.name || invite.recipientEmail}
                              </p>
                              <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                                <span>{invite.recipientEmail}</span>
                                <span>•</span>
                                <span className="text-slate-500">
                                  Invited by {invite.sender?.name || 'Teammate'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              invite.role === 'Admin' 
                                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}>
                              {invite.role}
                            </span>

                            <span className={`text-[11px] flex items-center gap-1 ${
                              isExpired ? 'text-red-400' : 'text-slate-500'
                            }`}>
                              <Clock className="w-3 h-3" />
                              {isExpired ? 'Expired' : `${Math.ceil((new Date(invite.expiresAt) - new Date()) / (1000 * 60 * 60 * 24))}d left`}
                            </span>

                            <button
                              onClick={() => setInviteToCancel(invite)}
                              className="px-2.5 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors font-medium"
                              title="Cancel invitation"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CALENDAR TAB (Functional Integrated Project Calendar) */}
        {activeTab === 'calendar' && (
          <div className="h-full max-w-6xl mx-auto flex flex-col min-h-[620px]">
            <IntegratedCalendar
              projectId={projectId}
              projects={project ? [project] : []}
              tasks={projectTasks}
              onAddTask={onAddTask || onCreateTask}
              onUpdateTask={onUpdateTask || onEditTask}
              onDeleteTask={onDeleteTask}
              onTaskStatusChange={onUpdateTaskStatus}
              onAddComment={onAddComment}
              onDeleteComment={onDeleteComment}
              currentUser={user}
              isLoading={false}
              title={`${project?.name || 'Project'} Calendar`}
            />
          </div>
        )}

        {/* DISCUSSIONS TAB (Persistent project conversations & threaded replies) */}
        {activeTab === 'discussions' && (
          <ProjectDiscussionsTab
            projectId={projectId}
            project={project}
            currentUser={user}
            userRole={callerRole}
            onUnreadCleared={() => setUnreadDiscussionCount(0)}
          />
        )}

        {/* NOTES TAB (Persistent shared study notes with markdown, revisions & conflict detection) */}
        {activeTab === 'notes' && (
          <ProjectNotesTab
            projectId={projectId}
            project={project}
            currentUser={user}
            userRole={callerRole}
          />
        )}

        {/* STUDY ROOMS & SESSIONS TAB (Group focus blocks, Pomodoro cycles & goals) */}
        {activeTab === 'sessions' && (
          <ProjectStudyRoomsTab
            projectId={projectId}
            project={project}
            currentUser={user}
            userRole={callerRole}
          />
        )}

        {/* RESOURCES TAB (Dedicated persistent cloud files and learning links) */}
        {activeTab === 'resources' && (
          <ProjectResourcesTab
            projectId={projectId}
            project={project}
            currentUser={user}
            userRole={callerRole}
          />
        )}

        {/* ACTIVITY TAB (Full dedicated chronological feed with pagination and filters) */}
        {activeTab === 'activity' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/40 border border-slate-800 rounded-2xl p-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-400" />
                  Project Activity Timeline
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Chronological audit history of all project changes, tasks, and team actions
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchProjectActivities(1, false)}
                  disabled={loadingActivities}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  title="Refresh activity timeline"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingActivities ? 'animate-spin text-blue-400' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              {[
                { id: 'all', label: 'All Activities' },
                { id: 'tasks', label: 'Tasks & Workflow' },
                { id: 'team', label: 'Team & Members' },
                { id: 'project', label: 'Project Settings' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setActivityFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl font-medium transition-colors shrink-0 ${
                    activityFilter === f.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <span className="text-slate-500 text-[11px] ml-auto shrink-0">
                {activityTotal > 0 ? `${activityTotal} total recorded` : ''}
              </span>
            </div>

            {/* Activity List */}
            {(() => {
              const displayList = (projectActivities.length > 0 ? projectActivities : (recentActivity || [])).filter(a => {
                if (activityFilter === 'tasks') {
                  return a.type?.startsWith('task_');
                }
                if (activityFilter === 'team') {
                  return ['member_added', 'member_removed', 'role_updated', 'ownership_transferred', 'invitation_sent', 'invitation_accepted', 'invitation_declined'].includes(a.type);
                }
                if (activityFilter === 'project') {
                  return ['project_created', 'project_updated', 'project_deleted'].includes(a.type);
                }
                return true;
              });

              if (loadingActivities && displayList.length === 0) {
                return (
                  <div className="py-16 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
                    <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
                    <p className="text-xs text-slate-400">Loading chronological timeline...</p>
                  </div>
                );
              }

              if (displayList.length === 0) {
                return (
                  <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/20 text-slate-500 text-xs">
                    <Activity className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-semibold text-slate-300">No activity recorded for this filter</p>
                    <p className="mt-1 text-slate-500">Activities will automatically appear as you and your teammates work on this project.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6 divide-y divide-slate-800/60 shadow-xl">
                    {displayList.map(a => {
                      const isTask = a.type?.startsWith('task_');
                      const isTeam = ['member_added', 'member_removed', 'role_updated', 'ownership_transferred', 'invitation_sent', 'invitation_accepted', 'invitation_declined'].includes(a.type);
                      const isCompleted = a.type === 'task_completed';

                      return (
                        <div key={a._id} className="flex items-start gap-3.5 py-4 first:pt-0 last:pb-0 group">
                          {/* User Avatar */}
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 border ${
                            isCompleted 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : isTask
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                              : isTeam
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}>
                            {a.user?.avatarInitials || a.user?.name?.[0] || '?'}
                          </div>

                          {/* Activity Details */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs sm:text-sm text-slate-200 leading-snug">
                              <span className="font-semibold text-white">{a.user?.name || 'Someone'}</span>{' '}
                              {ACTIVITY_MESSAGES[a.type] ? ACTIVITY_MESSAGES[a.type](a) : a.type}
                            </p>

                            {/* Additional metadata tags */}
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                              <span className="text-[10px] text-slate-500">
                                {new Date(a.createdAt).toLocaleString()}
                              </span>

                              {a.meta?.oldStatus && a.meta?.newStatus && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700 text-[10px] text-slate-300">
                                  {a.meta.oldStatus} → <strong className="text-blue-400">{a.meta.newStatus}</strong>
                                </span>
                              )}

                              {a.meta?.newRole && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-[10px] text-yellow-300 font-medium">
                                  Role: {a.meta.newRole}
                                </span>
                              )}

                              {a.meta?.role && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-300 font-medium">
                                  Invited as {a.meta.role}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Load More Pagination Button */}
                  {hasMoreActivities && (
                    <div className="text-center pt-2">
                      <button
                        onClick={() => fetchProjectActivities(activityPage + 1, true)}
                        disabled={loadingActivities}
                        className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors inline-flex items-center gap-2 disabled:opacity-50"
                      >
                        {loadingActivities ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                            <span>Loading older activities...</span>
                          </>
                        ) : (
                          <span>Load More Activities ({displayList.length} of {activityTotal})</span>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

      </main>

      {/* Task Details Drawer (when calendar task clicked) */}
      <TaskDetailsDrawer
        task={selectedCalendarTask}
        isOpen={Boolean(selectedCalendarTask)}
        onClose={() => setSelectedCalendarTask(null)}
        onEdit={(t) => {
          setSelectedCalendarTask(null);
          onEditTask(t);
        }}
        onDelete={(id) => {
          setSelectedCalendarTask(null);
          onDeleteTask(id);
        }}
        onStatusChange={(id, status) => {
          onUpdateTaskStatus(id, status);
        }}
        onAddComment={onAddComment}
        onDeleteComment={onDeleteComment}
        members={allMembers}
        currentUser={user}
      />

      {/* Archive / Unarchive Modal */}
      <ConfirmModal
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        onConfirm={handleArchiveToggle}
        title={isArchived ? "Unarchive Project" : "Archive Project"}
        message={isArchived 
          ? "Are you sure you want to reactivate this project?" 
          : "Archiving will mark this project as archived. All tasks will remain preserved."}
        confirmText={isArchived ? "Unarchive" : "Archive"}
        isDanger={false}
        isLoading={isActionLoading}
      />

      {/* Remove Member Modal */}
      <ConfirmModal
        isOpen={Boolean(memberToRemove)}
        onClose={() => setMemberToRemove(null)}
        onConfirm={handleRemoveMemberConfirm}
        title="Remove Member"
        message={`Are you sure you want to remove ${memberToRemove?.name || 'this member'} from the project? Their assigned tasks will be unassigned.`}
        confirmText="Remove Member"
        isDanger={true}
        isLoading={isActionLoading}
      />

      {/* Leave Project Modal */}
      <ConfirmModal
        isOpen={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={handleLeaveConfirm}
        title="Leave Project"
        message="Are you sure you want to leave this project? You will need an invite to rejoin."
        confirmText="Leave Project"
        isDanger={true}
        isLoading={isActionLoading}
      />

      {/* Invite Member Modal */}
      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInvite={handleInviteSubmit}
        projectName={project.name}
        currentUserRole={callerRole}
      />

      {/* Transfer Ownership Modal */}
      <TransferOwnershipModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        onTransfer={handleTransferOwnershipSubmit}
        members={allMembers}
        currentOwnerId={project.owner?._id || project.owner}
        projectName={project.name}
      />

      {/* Cancel Invitation Modal */}
      <ConfirmModal
        isOpen={Boolean(inviteToCancel)}
        onClose={() => setInviteToCancel(null)}
        onConfirm={handleCancelInviteSubmit}
        title="Cancel Invitation"
        message={`Are you sure you want to cancel the invitation for ${inviteToCancel?.recipient?.name || inviteToCancel?.recipientEmail || 'this user'}? They will no longer be able to accept it.`}
        confirmText="Cancel Invitation"
        isDanger={true}
        isLoading={isCancellingInvite}
      />
    </div>
  );
};

export default ProjectWorkspace;
