import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Video, Play, Pause, RotateCcw, SkipForward, CheckCircle2, 
  Circle, Clock, Calendar, Users, Target, BookOpen, 
  FileText, Plus, Search, Edit3, Trash2, X, ArrowLeft, 
  Check, AlertCircle, RefreshCw, Sparkles, Coffee, Shield, 
  Crown, ExternalLink, ChevronRight, CheckSquare, Layers
} from 'lucide-react';
import { sessionService, taskService, noteService, resourceService } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import ConfirmModal from './ConfirmModal';

const STATUS_THEMES = {
  'Scheduled': { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300' },
  'In Progress': { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300 animate-pulse' },
  'Completed': { bg: 'bg-slate-800/60', border: 'border-slate-700', text: 'text-slate-300', badge: 'bg-slate-700 text-slate-300' },
  'Cancelled': { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400', badge: 'bg-rose-500/20 text-rose-300' },
};

const ProjectStudyRoomsTab = ({ projectId, project, currentUser, userRole }) => {
  const toast = useToast();
  const socketContext = useSocket();
  const socket = socketContext?.socket;

  // Session state
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState(null); // When inside a study room
  const [loadingSession, setLoadingSession] = useState(false);
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'active' | 'upcoming' | 'completed'
  const [searchQuery, setSearchQuery] = useState('');

  // Creation / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formAgenda, setFormAgenda] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formDuration, setFormDuration] = useState(60);
  const [formGoals, setFormGoals] = useState(['']);
  const [formParticipants, setFormParticipants] = useState([]);
  const [formWorkInterval, setFormWorkInterval] = useState(25);
  const [formBreakInterval, setFormBreakInterval] = useState(5);
  const [formLinkedTasks, setFormLinkedTasks] = useState([]);
  const [formLinkedNotes, setFormLinkedNotes] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  // Available project resources for linking
  const [availableTasks, setAvailableTasks] = useState([]);
  const [availableNotes, setAvailableNotes] = useState([]);

  // Local Timer Tick state for smooth second-by-second countdown
  const [timerSecondsLeft, setTimerSecondsLeft] = useState(1500);
  const timerIntervalRef = useRef(null);

  // Modals
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');

  // Permissions
  const isOwner = userRole === 'Owner' || project?.owner?._id === currentUser?._id || project?.owner === currentUser?._id;
  const isAdmin = userRole === 'Admin';
  const canModerate = isOwner || isAdmin;
  const allMembers = useMemo(() => {
    const list = project?.members ? [...project.members] : [];
    if (project?.owner && !list.some(m => (m._id || m) === (project.owner._id || project.owner))) {
      list.unshift(project.owner);
    }
    return list;
  }, [project]);

  // 1. Fetch sessions
  const fetchSessions = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const params = {};
      if (filterTab === 'active') params.status = 'In Progress';
      if (filterTab === 'upcoming') params.status = 'Scheduled';
      if (filterTab === 'completed') params.status = 'Completed';
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const data = await sessionService.getSessions(projectId, params);
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Failed to load study sessions:', err);
      toast.error('Failed to load study sessions: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, filterTab, searchQuery]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Fetch available tasks & notes for linking when modal opens
  const fetchLinkableData = async () => {
    try {
      const [tasksRes, notesRes] = await Promise.all([
        taskService.getTasks ? taskService.getTasks(projectId) : Promise.resolve([]),
        noteService.getNotes(projectId, { limit: 100 }),
      ]);
      setAvailableTasks(tasksRes.tasks || tasksRes || []);
      setAvailableNotes(notesRes.notes || []);
    } catch (e) {
      // Non-critical
    }
  };

  // 2. Real-time socket events
  useEffect(() => {
    if (!socket || !projectId) return;

    const handleCreated = (newSession) => {
      setSessions(prev => [newSession, ...prev]);
    };

    const handleUpdated = (updatedSession) => {
      setSessions(prev => prev.map(s => s._id === updatedSession._id ? updatedSession : s));
      setActiveSession(current => {
        if (current && current._id === updatedSession._id) {
          return updatedSession;
        }
        return current;
      });
    };

    const handleTimerUpdated = ({ sessionId, timerState }) => {
      setActiveSession(current => {
        if (current && current._id === sessionId) {
          return { ...current, timerState };
        }
        return current;
      });
    };

    const handleGoalUpdated = ({ sessionId, goalId, goal }) => {
      setActiveSession(current => {
        if (current && current._id === sessionId) {
          const updatedGoals = current.goals.map(g => g._id === goalId ? goal : g);
          return { ...current, goals: updatedGoals };
        }
        return current;
      });
    };

    const handleDeleted = ({ sessionId }) => {
      setSessions(prev => prev.filter(s => s._id !== sessionId));
      setActiveSession(current => {
        if (current && current._id === sessionId) return null;
        return current;
      });
    };

    socket.on('session:created', handleCreated);
    socket.on('session:updated', handleUpdated);
    socket.on('session:timer_updated', handleTimerUpdated);
    socket.on('session:goal_updated', handleGoalUpdated);
    socket.on('session:deleted', handleDeleted);

    return () => {
      socket.off('session:created', handleCreated);
      socket.off('session:updated', handleUpdated);
      socket.off('session:timer_updated', handleTimerUpdated);
      socket.off('session:goal_updated', handleGoalUpdated);
      socket.off('session:deleted', handleDeleted);
    };
  }, [socket, projectId]);

  // 3. Client countdown timer ticker anchored to server targetEndTime
  useEffect(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    if (activeSession && activeSession.timerState?.status === 'running' && activeSession.timerState?.targetEndTime) {
      const updateClock = () => {
        const target = new Date(activeSession.timerState.targetEndTime).getTime();
        const diff = Math.max(0, Math.round((target - Date.now()) / 1000));
        setTimerSecondsLeft(diff);

        if (diff === 0) {
          // Completed current countdown
          clearInterval(timerIntervalRef.current);
        }
      };

      updateClock();
      timerIntervalRef.current = setInterval(updateClock, 1000);
    } else if (activeSession && activeSession.timerState) {
      setTimerSecondsLeft(activeSession.timerState.remainingSeconds || 1500);
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [activeSession?.timerState?.status, activeSession?.timerState?.targetEndTime, activeSession?.timerState?.remainingSeconds]);

  // Enter Study Room view
  const handleOpenRoom = async (sessionId) => {
    try {
      setLoadingSession(true);
      const session = await sessionService.getSessionById(projectId, sessionId);
      setActiveSession(session);
      setTimerSecondsLeft(session.timerState?.remainingSeconds || 1500);
    } catch (err) {
      toast.error('Failed to enter study room: ' + err.message);
    } finally {
      setLoadingSession(false);
    }
  };

  // Timer controls
  const handleTimerAction = async (action, phase) => {
    if (!activeSession) return;
    try {
      const res = await sessionService.updateTimer(projectId, activeSession._id, {
        action,
        phase,
        remainingSeconds: timerSecondsLeft,
      });
      setActiveSession(prev => ({
        ...prev,
        status: res.status || prev.status,
        timerState: res.timerState,
      }));
    } catch (err) {
      toast.error('Timer action failed: ' + err.message);
    }
  };

  // Toggle Goal
  const handleToggleGoal = async (goalId) => {
    if (!activeSession) return;
    try {
      const res = await sessionService.toggleGoal(projectId, activeSession._id, goalId);
      setActiveSession(prev => ({
        ...prev,
        goals: res.goals,
      }));
    } catch (err) {
      toast.error('Failed to update goal: ' + err.message);
    }
  };

  // Join session
  const handleJoinSession = async (sessionId) => {
    try {
      const updated = await sessionService.joinSession(projectId, sessionId);
      setActiveSession(prev => (prev?._id === sessionId ? updated : prev));
      setSessions(prev => prev.map(s => s._id === sessionId ? updated : s));
      toast.success('Joined study session');
    } catch (err) {
      toast.error('Could not join session: ' + err.message);
    }
  };

  // Complete session modal submit
  const handleCompleteSession = async () => {
    if (!activeSession) return;
    try {
      const updated = await sessionService.updateSession(projectId, activeSession._id, {
        status: 'Completed',
        summaryNotes: completionNotes,
      });
      setActiveSession(updated);
      setSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
      setShowCompleteModal(false);
      toast.success('Study session completed!');
    } catch (err) {
      toast.error('Failed to complete session: ' + err.message);
    }
  };

  // Open Create Modal
  const openCreateModal = () => {
    setEditingSession(null);
    setFormTitle('');
    setFormAgenda('');
    // Default start time: nearest upcoming hour
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    const localIso = new Date(nextHour.getTime() - nextHour.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setFormStartTime(localIso);
    setFormDuration(60);
    setFormGoals(['Review core concepts', 'Complete assigned practice problems']);
    setFormParticipants(allMembers.map(m => m._id || m));
    setFormWorkInterval(25);
    setFormBreakInterval(5);
    setFormLinkedTasks([]);
    setFormLinkedNotes([]);
    fetchLinkableData();
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (session) => {
    setEditingSession(session);
    setFormTitle(session.title);
    setFormAgenda(session.agenda || '');
    const d = new Date(session.startTime);
    const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setFormStartTime(localIso);
    setFormDuration(session.duration);
    setFormGoals(session.goals?.map(g => g.text) || []);
    setFormParticipants(session.participants?.map(p => p._id || p) || []);
    setFormWorkInterval(session.timerConfig?.workInterval || 25);
    setFormBreakInterval(session.timerConfig?.breakInterval || 5);
    setFormLinkedTasks(session.linkedTasks?.map(t => t._id || t) || []);
    setFormLinkedNotes(session.linkedNotes?.map(n => n._id || n) || []);
    fetchLinkableData();
    setIsModalOpen(true);
  };

  // Save session form
  const handleSaveSession = async (e) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      toast.error('Session title is required');
      return;
    }
    if (!formStartTime) {
      toast.error('Start time is required');
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        title: formTitle.trim(),
        agenda: formAgenda.trim(),
        startTime: new Date(formStartTime).toISOString(),
        duration: Number(formDuration),
        goals: formGoals.filter(g => g.trim().length > 0).map(g => ({ text: g.trim() })),
        participants: formParticipants,
        timerConfig: {
          mode: 'pomodoro',
          workInterval: Number(formWorkInterval),
          breakInterval: Number(formBreakInterval),
        },
        linkedTasks: formLinkedTasks,
        linkedNotes: formLinkedNotes,
      };

      if (editingSession) {
        const updated = await sessionService.updateSession(projectId, editingSession._id, payload);
        setSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
        if (activeSession?._id === updated._id) setActiveSession(updated);
        toast.success('Study session updated');
      } else {
        const created = await sessionService.createSession(projectId, payload);
        setSessions(prev => [created, ...prev]);
        toast.success('Study session scheduled!');
      }

      setIsModalOpen(false);
    } catch (err) {
      toast.error('Failed to save session: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete session confirm
  const handleDeleteConfirm = async () => {
    if (!sessionToDelete) return;
    try {
      setIsDeleting(true);
      await sessionService.deleteSession(projectId, sessionToDelete._id);
      setSessions(prev => prev.filter(s => s._id !== sessionToDelete._id));
      if (activeSession?._id === sessionToDelete._id) setActiveSession(null);
      toast.success('Study session deleted');
      setSessionToDelete(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete session');
    } finally {
      setIsDeleting(false);
    }
  };

  // Format seconds to MM:SS
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-[calc(100vh-170px)] min-h-[600px] flex flex-col bg-slate-950 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl">
      
      {/* If inside an active Study Room */}
      {activeSession ? (
        <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in">
          
          {/* Study Room Top Navigation */}
          <div className="px-6 py-3 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveSession(null)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Back to all sessions"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white truncate max-w-md">
                    {activeSession.title}
                  </h2>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_THEMES[activeSession.status]?.border} ${STATUS_THEMES[activeSession.status]?.bg} ${STATUS_THEMES[activeSession.status]?.text}`}>
                    {activeSession.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Hosted by <strong className="text-slate-300 font-medium">{activeSession.host?.name}</strong> • {new Date(activeSession.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({activeSession.duration}m planned)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Join Button */}
              {!activeSession.participants?.some(p => (p._id || p) === currentUser?._id) && (
                <button
                  onClick={() => handleJoinSession(activeSession._id)}
                  className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-semibold transition-colors"
                >
                  Join Session
                </button>
              )}

              {/* Complete Session */}
              {activeSession.status !== 'Completed' && (activeSession.host?._id === currentUser?._id || canModerate) && (
                <button
                  onClick={() => setShowCompleteModal(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Finish Session</span>
                </button>
              )}

              {/* Edit Session */}
              {(activeSession.host?._id === currentUser?._id || canModerate) && (
                <button
                  onClick={() => openEditModal(activeSession)}
                  className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                  title="Edit session details"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Study Room Workspace Columns */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
            
            {/* Left 5 Cols: Focus Timer & Participant Presence */}
            <div className="lg:col-span-5 p-6 border-b lg:border-b-0 lg:border-r border-slate-800/80 bg-slate-900/30 flex flex-col justify-between overflow-y-auto space-y-6">
              
              {/* Focus Timer Display */}
              <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1.5 font-medium">
                    {activeSession.timerState?.phase === 'work' ? (
                      <Sparkles className="w-4 h-4 text-blue-400" />
                    ) : (
                      <Coffee className="w-4 h-4 text-emerald-400" />
                    )}
                    {activeSession.timerState?.phase === 'work' ? 'Focus Interval' : 'Rest Break'}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300">
                    Cycle {activeSession.timerState?.currentCycle || 1} of {activeSession.timerConfig?.cycles || 4}
                  </span>
                </div>

                {/* Digital Clock */}
                <div className="py-2">
                  <div className="text-6xl sm:text-7xl font-mono font-extrabold tracking-tighter text-white tabular-nums drop-shadow-md">
                    {formatTime(timerSecondsLeft)}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    {activeSession.timerState?.status === 'running' 
                      ? '⏱ Focus timer running (synchronized to cloud timestamps)' 
                      : activeSession.timerState?.status === 'paused'
                      ? '⏸ Timer paused'
                      : '⏹ Ready to begin focus interval'}
                  </p>
                </div>

                {/* Timer Controls */}
                <div className="flex items-center justify-center gap-3 pt-2">
                  {activeSession.timerState?.status === 'running' ? (
                    <button
                      onClick={() => handleTimerAction('pause')}
                      className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl text-xs font-bold transition-all shadow-lg shadow-amber-600/20 flex items-center gap-2"
                    >
                      <Pause className="w-4 h-4" />
                      <span>Pause</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleTimerAction('start')}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>{activeSession.timerState?.status === 'paused' ? 'Resume' : 'Start Focus'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleTimerAction('reset')}
                    className="p-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
                    title="Reset to interval start"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleTimerAction('next_phase')}
                    className="p-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
                    title="Skip to next phase"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Participants & Team Presence */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <h4 className="font-bold text-white flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-blue-400" />
                    Participants ({activeSession.participants?.length || 0})
                  </h4>
                  <span className="text-[10px] text-slate-500">Project study group</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {activeSession.participants?.map((p) => {
                    const isHost = (p._id || p) === (activeSession.host?._id || activeSession.host);
                    return (
                      <div
                        key={p._id || p}
                        className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs"
                      >
                        <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-300 font-bold flex items-center justify-center text-[11px] shrink-0">
                          {p.avatarInitials || p.name?.slice(0, 2).toUpperCase() || 'U'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-slate-200 font-medium truncate text-[11px] flex items-center gap-1">
                            {p.name}
                            {isHost && <Crown className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
                          </p>
                          <span className="text-[9px] text-slate-500">
                            {isHost ? 'Host' : 'Member'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right 7 Cols: Goals Checklist & Linked Assets */}
            <div className="lg:col-span-7 p-6 overflow-y-auto space-y-6">
              
              {/* Learning Goals Checklist */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Target className="w-4 h-4 text-emerald-400" />
                      Learning Goals
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Check off goals as your study group accomplishes them
                    </p>
                  </div>

                  {/* Goal Progress % */}
                  {(() => {
                    const totalGoals = activeSession.goals?.length || 0;
                    const completedGoals = activeSession.goals?.filter(g => g.completed).length || 0;
                    const pct = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;
                    return (
                      <div className="text-right">
                        <span className="text-xs font-bold text-emerald-400">{pct}%</span>
                        <span className="text-[10px] text-slate-500 block">({completedGoals}/{totalGoals} done)</span>
                      </div>
                    );
                  })()}
                </div>

                {/* Goals List */}
                <div className="space-y-2">
                  {(!activeSession.goals || activeSession.goals.length === 0) ? (
                    <p className="text-xs text-slate-500 italic py-2">No learning goals defined for this session.</p>
                  ) : (
                    activeSession.goals.map((g) => (
                      <div
                        key={g._id}
                        onClick={() => handleToggleGoal(g._id)}
                        className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                          g.completed 
                            ? 'bg-emerald-500/5 border-emerald-500/20 text-slate-400' 
                            : 'bg-slate-950/60 border-slate-800 text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <div className="mt-0.5">
                          {g.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Circle className="w-4 h-4 text-slate-600 hover:text-slate-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs ${g.completed ? 'line-through text-slate-400' : 'text-slate-200 font-medium'}`}>
                            {g.text}
                          </p>
                          {g.completed && g.completedBy && (
                            <span className="text-[10px] text-slate-500 mt-0.5 block">
                              Completed by {g.completedBy.name || 'Member'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Agenda & Study Topics */}
              {activeSession.agenda && (
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-2">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    Session Agenda & Notes
                  </h4>
                  <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {activeSession.agenda}
                  </p>
                </div>
              )}

              {/* Linked Items (Tasks, Study Notes & Resources) */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  Linked Study Material
                </h4>

                <div className="space-y-2">
                  {/* Linked Tasks */}
                  {activeSession.linkedTasks?.map(t => (
                    <div key={t._id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckSquare className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="text-slate-200 font-medium truncate">{t.title}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                        {t.status}
                      </span>
                    </div>
                  ))}

                  {/* Linked Notes */}
                  {activeSession.linkedNotes?.map(n => (
                    <div key={n._id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <BookOpen className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span className="text-slate-200 font-medium truncate">{n.title}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300">
                        {n.category || 'Note'}
                      </span>
                    </div>
                  ))}

                  {(!activeSession.linkedTasks?.length && !activeSession.linkedNotes?.length) && (
                    <p className="text-xs text-slate-500 italic">No tasks or notes explicitly linked to this session.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* SESSIONS DIRECTORY LIST VIEW */
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* Top Bar with Stats & Schedule Action */}
          <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-900/60 flex flex-wrap items-center justify-between gap-4 shrink-0">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Video className="w-5 h-5 text-blue-400" />
                Study Rooms & Sessions
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Organize focused group study blocks, Pomodoro cycles, and learning sessions
              </p>
            </div>

            <button
              onClick={openCreateModal}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule Session</span>
            </button>
          </div>

          {/* Filter Pills & Search */}
          <div className="p-4 border-b border-slate-800/60 flex flex-wrap items-center justify-between gap-3 bg-slate-900/20 shrink-0">
            <div className="flex items-center gap-1.5 text-xs">
              {[
                { id: 'all', label: 'All Sessions' },
                { id: 'upcoming', label: 'Upcoming' },
                { id: 'active', label: 'In Progress' },
                { id: 'completed', label: 'Completed' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setFilterTab(t.id)}
                  className={`px-3 py-1.5 rounded-xl font-medium transition-colors ${
                    filterTab === t.id 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500/60"
              />
            </div>
          </div>

          {/* Sessions Grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
                <span className="text-xs">Loading sessions...</span>
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-20 px-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mx-auto mb-3 shadow-inner">
                  <Video className="w-8 h-8" />
                </div>
                <h3 className="text-sm font-bold text-slate-300">No Study Sessions Found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Schedule group focus sessions with goals, Pomodoro intervals, and linked study resources.
                </p>
                <button
                  onClick={openCreateModal}
                  className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Schedule First Session</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sessions.map(s => {
                  const theme = STATUS_THEMES[s.status] || STATUS_THEMES['Scheduled'];
                  const totalGoals = s.goals?.length || 0;
                  const completedGoals = s.goals?.filter(g => g.completed).length || 0;
                  const pct = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;
                  const isHost = (s.host?._id || s.host) === currentUser?._id;

                  return (
                    <div
                      key={s._id}
                      className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${theme.bg} ${theme.border} hover:border-slate-700 shadow-md`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${theme.border} ${theme.badge}`}>
                            {s.status}
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {s.duration} mins
                          </span>
                        </div>

                        <div>
                          <h4 className="text-sm font-bold text-white truncate">{s.title}</h4>
                          <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                            {s.agenda || 'No specific agenda specified.'}
                          </p>
                        </div>

                        {/* Date & Time */}
                        <div className="flex items-center gap-2 text-xs text-slate-300 pt-1">
                          <Calendar className="w-3.5 h-3.5 text-blue-400" />
                          <span>
                            {new Date(s.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })} at {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {/* Goals Progress Bar */}
                        {totalGoals > 0 && (
                          <div className="space-y-1 pt-1">
                            <div className="flex justify-between text-[10px] text-slate-400">
                              <span>Goals Progress</span>
                              <span className="text-emerald-400 font-bold">{completedGoals}/{totalGoals} ({pct}%)</span>
                            </div>
                            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Users className="w-3 h-3 text-slate-500" />
                          <span>{s.participants?.length || 1} joined</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {(isHost || canModerate) && (
                            <button
                              onClick={() => setSessionToDelete(s)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Delete session"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenRoom(s._id)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md transition-colors flex items-center gap-1"
                          >
                            <span>Enter Room</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE / EDIT SESSION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150">
            
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Video className="w-4 h-4 text-blue-400" />
                {editingSession ? 'Edit Study Session' : 'Schedule Study Session'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSession} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Session Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Algorithms Midterm Review Session"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Agenda & Study Topics</label>
                <textarea
                  rows={3}
                  placeholder="What will your group focus on during this block?"
                  value={formAgenda}
                  onChange={(e) => setFormAgenda(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Start Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Duration (minutes)</label>
                  <input
                    type="number"
                    min={5}
                    max={720}
                    value={formDuration}
                    onChange={(e) => setFormDuration(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Pomodoro Timer Configuration */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                <span className="font-semibold text-slate-300 block">Focus Timer Intervals</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 text-[11px] block">Work Interval (mins)</label>
                    <input
                      type="number"
                      min={5}
                      max={120}
                      value={formWorkInterval}
                      onChange={(e) => setFormWorkInterval(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-[11px] block">Break Interval (mins)</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={formBreakInterval}
                      onChange={(e) => setFormBreakInterval(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200"
                    />
                  </div>
                </div>
              </div>

              {/* Learning Goals Inputs */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Learning Goals</label>
                <div className="space-y-2">
                  {formGoals.map((goal, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={`Goal #${idx + 1}`}
                        value={goal}
                        onChange={(e) => {
                          const updated = [...formGoals];
                          updated[idx] = e.target.value;
                          setFormGoals(updated);
                        }}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs"
                      />
                      {formGoals.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setFormGoals(formGoals.filter((_, i) => i !== idx))}
                          className="text-slate-500 hover:text-red-400 p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormGoals([...formGoals, ''])}
                    className="text-[11px] text-blue-400 hover:underline flex items-center gap-1 mt-1"
                  >
                    <Plus className="w-3 h-3" /> Add another goal
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingSession ? 'Update Session' : 'Schedule Session'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMPLETE SESSION SUMMARY MODAL */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Complete Study Session
            </h3>
            <p className="text-xs text-slate-400">
              Wrap up this study session. You can record any key takeaways or summary notes for the team.
            </p>
            <textarea
              rows={3}
              placeholder="Session takeaways, conclusions, or next steps..."
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowCompleteModal(false)}
                className="px-3.5 py-1.5 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteSession}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold"
              >
                Mark as Completed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      <ConfirmModal
        isOpen={Boolean(sessionToDelete)}
        onClose={() => setSessionToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Study Session"
        message={`Are you sure you want to delete "${sessionToDelete?.title || 'this session'}"? All session timers, goals, and records will be removed.`}
        confirmText="Delete Session"
        isDanger={true}
        isLoading={isDeleting}
      />
    </div>
  );
};

export default ProjectStudyRoomsTab;
