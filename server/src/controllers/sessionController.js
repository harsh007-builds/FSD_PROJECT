const mongoose = require('mongoose');
const Session = require('../models/Session');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Note = require('../models/Note');
const Resource = require('../models/Resource');
const { logActivity } = require('./activityController');

/**
 * Verify project membership & permissions
 */
const verifyProjectMembership = async (projectId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    return { isAuthorized: false, role: null, project: null };
  }

  const project = await Project.findById(projectId);
  if (!project) {
    return { isAuthorized: false, role: null, project: null };
  }

  const userIdStr = userId.toString();
  const isOwner = project.owner.toString() === userIdStr;

  if (isOwner) {
    return { isAuthorized: true, role: 'Owner', project };
  }

  const isMember = project.members.some((m) => m.toString() === userIdStr);
  if (!isMember) {
    return { isAuthorized: false, role: null, project };
  }

  const memberEntry = (project.membersList || []).find(
    (m) => m.user && m.user.toString() === userIdStr
  );
  const role = memberEntry ? memberEntry.role : 'Member';

  return { isAuthorized: true, role, project };
};

// Safe regex helper
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Safely emit socket event to project room
 */
const emitSocketEvent = (projectId, event, data) => {
  try {
    const { getIO } = require('../socket');
    const io = getIO();
    if (io && projectId) {
      io.to(`project_${projectId}`).emit(event, data);
    }
  } catch (err) {
    // Non-socket / test environment
  }
};

/**
 * @desc    Get all study sessions for a project with filters & counts
 * @route   GET /api/projects/:projectId/sessions
 */
const getSessions = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    const {
      status,
      timeframe,
      search,
      sortBy = 'startTime',
      sortOrder = 'asc',
      page = 1,
      limit = 50,
    } = req.query;

    const filter = { project: projectId };

    // Status filter
    if (status && status !== 'all') {
      if (status === 'active_and_upcoming') {
        filter.status = { $in: ['Scheduled', 'In Progress'] };
      } else {
        filter.status = status;
      }
    }

    // Timeframe filter
    const now = new Date();
    if (timeframe === 'upcoming') {
      filter.$or = [
        { startTime: { $gte: now } },
        { status: 'In Progress' },
      ];
    } else if (timeframe === 'past') {
      filter.startTime = { $lt: now };
    }

    // Search filter
    if (search && search.trim()) {
      const reg = new RegExp(escapeRegex(search.trim()), 'i');
      filter.$or = [
        { title: reg },
        { agenda: reg },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const order = sortOrder === 'desc' ? -1 : 1;
    const sort = { [sortBy]: order };

    // Fetch sessions & calculate category aggregates
    const [sessions, total, scheduledCount, inProgressCount, completedCount] = await Promise.all([
      Session.find(filter)
        .populate('host', 'name email avatarInitials')
        .populate('participants', 'name email avatarInitials')
        .populate('goals.completedBy', 'name email avatarInitials')
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Session.countDocuments(filter),
      Session.countDocuments({ project: projectId, status: 'Scheduled' }),
      Session.countDocuments({ project: projectId, status: 'In Progress' }),
      Session.countDocuments({ project: projectId, status: 'Completed' }),
    ]);

    // Recalculate remaining seconds for any running timers based on absolute targetEndTime
    const processedSessions = sessions.map((s) => {
      if (s.timerState?.status === 'running' && s.timerState?.targetEndTime) {
        const remaining = Math.max(0, Math.round((new Date(s.timerState.targetEndTime).getTime() - Date.now()) / 1000));
        s.timerState.remainingSeconds = remaining;
      }
      return s;
    });

    res.status(200).json({
      sessions: processedSessions,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      hasMore: pageNum * limitNum < total,
      counts: {
        upcoming: scheduledCount,
        active: inProgressCount,
        completed: completedCount,
        total: scheduledCount + inProgressCount + completedCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single study session details by ID
 * @route   GET /api/projects/:projectId/sessions/:sessionId
 */
const getSessionById = async (req, res, next) => {
  try {
    const { projectId, sessionId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: 'Invalid session ID' });
    }

    const session = await Session.findOne({ _id: sessionId, project: projectId })
      .populate('host', 'name email avatarInitials')
      .populate('participants', 'name email avatarInitials')
      .populate('goals.completedBy', 'name email avatarInitials')
      .populate('linkedTasks', 'title status priority dueDate')
      .populate('linkedNotes', 'title category tags')
      .populate('linkedResources', 'title type category file url')
      .lean();

    if (!session) {
      return res.status(404).json({ message: 'Study session not found' });
    }

    // Refresh running timer seconds
    if (session.timerState?.status === 'running' && session.timerState?.targetEndTime) {
      const remaining = Math.max(0, Math.round((new Date(session.timerState.targetEndTime).getTime() - Date.now()) / 1000));
      session.timerState.remainingSeconds = remaining;
    }

    res.status(200).json(session);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new study session
 * @route   POST /api/projects/:projectId/sessions
 */
const createSession = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    const {
      title,
      agenda = '',
      startTime,
      duration = 60,
      participants = [],
      goals = [],
      timerConfig = {},
      linkedTasks = [],
      linkedNotes = [],
      linkedResources = [],
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Session title is required' });
    }
    if (title.trim().length > 200) {
      return res.status(400).json({ message: 'Session title cannot exceed 200 characters' });
    }

    if (!startTime) {
      return res.status(400).json({ message: 'Session start time is required' });
    }
    const parsedStartTime = new Date(startTime);
    if (isNaN(parsedStartTime.getTime())) {
      return res.status(400).json({ message: 'Invalid session start time format' });
    }

    const durationNum = parseInt(duration, 10);
    if (isNaN(durationNum) || durationNum < 5 || durationNum > 720) {
      return res.status(400).json({ message: 'Duration must be between 5 and 720 minutes' });
    }

    // Format goals array
    const formattedGoals = Array.isArray(goals)
      ? goals.map((g) => ({
          text: typeof g === 'string' ? g.trim() : (g.text || '').trim(),
          completed: typeof g === 'object' ? Boolean(g.completed) : false,
        })).filter((g) => g.text.length > 0)
      : [];

    // Ensure host is included in participants
    const participantIds = new Set([req.user._id.toString()]);
    if (Array.isArray(participants)) {
      participants.forEach((p) => {
        const id = p?._id || p;
        if (id && mongoose.Types.ObjectId.isValid(id)) {
          participantIds.add(id.toString());
        }
      });
    }

    const workInterval = timerConfig.workInterval || 25;
    const breakInterval = timerConfig.breakInterval || 5;
    const longBreakInterval = timerConfig.longBreakInterval || 15;
    const cycles = timerConfig.cycles || 4;

    const session = await Session.create({
      project: projectId,
      title: title.trim(),
      agenda: (agenda || '').trim(),
      startTime: parsedStartTime,
      duration: durationNum,
      status: 'Scheduled',
      host: req.user._id,
      participants: Array.from(participantIds),
      goals: formattedGoals,
      timerConfig: {
        mode: timerConfig.mode || 'pomodoro',
        workInterval,
        breakInterval,
        longBreakInterval,
        cycles,
      },
      timerState: {
        status: 'idle',
        phase: 'work',
        currentCycle: 1,
        remainingSeconds: workInterval * 60,
      },
      linkedTasks: Array.isArray(linkedTasks) ? linkedTasks : [],
      linkedNotes: Array.isArray(linkedNotes) ? linkedNotes : [],
      linkedResources: Array.isArray(linkedResources) ? linkedResources : [],
    });

    const populated = await Session.findById(session._id)
      .populate('host', 'name email avatarInitials')
      .populate('participants', 'name email avatarInitials')
      .populate('linkedTasks', 'title status priority dueDate')
      .populate('linkedNotes', 'title category tags')
      .populate('linkedResources', 'title type category file url')
      .lean();

    // Log activity
    logActivity({
      type: 'session_created',
      userId: req.user._id,
      projectId,
      sessionId: session._id,
      meta: {
        sessionTitle: session.title,
        startTime: session.startTime,
        duration: session.duration,
      },
    });

    emitSocketEvent(projectId, 'session:created', populated);

    res.status(201).json(populated);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a study session
 * @route   PUT /api/projects/:projectId/sessions/:sessionId
 */
const updateSession = async (req, res, next) => {
  try {
    const { projectId, sessionId } = req.params;
    const { isAuthorized, role, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    const session = await Session.findOne({ _id: sessionId, project: projectId });
    if (!session) return res.status(404).json({ message: 'Study session not found' });

    // Permissions: Host, Owner, or Admin
    const isHost = session.host.toString() === req.user._id.toString();
    const canModerate = role === 'Owner' || role === 'Admin';
    if (!isHost && !canModerate) {
      return res.status(403).json({ message: 'Only the session host or project admins can edit this session' });
    }

    const {
      title,
      agenda,
      startTime,
      duration,
      status,
      participants,
      goals,
      linkedTasks,
      linkedNotes,
      linkedResources,
      summaryNotes,
      timerConfig,
    } = req.body;

    if (title !== undefined) {
      if (!title || !title.trim()) return res.status(400).json({ message: 'Session title cannot be blank' });
      session.title = title.trim();
    }

    if (agenda !== undefined) session.agenda = agenda;

    if (startTime !== undefined) {
      const parsedStartTime = new Date(startTime);
      if (isNaN(parsedStartTime.getTime())) return res.status(400).json({ message: 'Invalid start time' });
      session.startTime = parsedStartTime;
    }

    if (duration !== undefined) {
      const dur = parseInt(duration, 10);
      if (isNaN(dur) || dur < 5 || dur > 720) return res.status(400).json({ message: 'Duration must be 5-720 mins' });
      session.duration = dur;
    }

    if (status !== undefined && ['Scheduled', 'In Progress', 'Completed', 'Cancelled'].includes(status)) {
      const prevStatus = session.status;
      session.status = status;
      if (status === 'In Progress' && !session.startedAt) session.startedAt = new Date();
      if (status === 'Completed' && !session.completedAt) session.completedAt = new Date();

      if (prevStatus !== status) {
        logActivity({
          type: status === 'In Progress' ? 'session_started' : status === 'Completed' ? 'session_completed' : 'session_updated',
          userId: req.user._id,
          projectId,
          sessionId: session._id,
          meta: { sessionTitle: session.title, newStatus: status, prevStatus },
        });
      }
    }

    if (participants !== undefined && Array.isArray(participants)) {
      session.participants = participants;
    }

    if (goals !== undefined && Array.isArray(goals)) {
      session.goals = goals.map((g) => ({
        text: typeof g === 'string' ? g.trim() : (g.text || '').trim(),
        completed: typeof g === 'object' ? Boolean(g.completed) : false,
        completedAt: g.completedAt,
        completedBy: g.completedBy,
      })).filter((g) => g.text.length > 0);
    }

    if (linkedTasks !== undefined && Array.isArray(linkedTasks)) session.linkedTasks = linkedTasks;
    if (linkedNotes !== undefined && Array.isArray(linkedNotes)) session.linkedNotes = linkedNotes;
    if (linkedResources !== undefined && Array.isArray(linkedResources)) session.linkedResources = linkedResources;
    if (summaryNotes !== undefined) session.summaryNotes = summaryNotes;

    if (timerConfig !== undefined && typeof timerConfig === 'object') {
      session.timerConfig = { ...session.timerConfig, ...timerConfig };
    }

    await session.save();

    const populated = await Session.findById(session._id)
      .populate('host', 'name email avatarInitials')
      .populate('participants', 'name email avatarInitials')
      .populate('goals.completedBy', 'name email avatarInitials')
      .populate('linkedTasks', 'title status priority dueDate')
      .populate('linkedNotes', 'title category tags')
      .populate('linkedResources', 'title type category file url')
      .lean();

    emitSocketEvent(projectId, 'session:updated', populated);

    res.status(200).json(populated);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Control session timer (Pomodoro / Focus timer)
 * @route   POST /api/projects/:projectId/sessions/:sessionId/timer
 */
const updateTimer = async (req, res, next) => {
  try {
    const { projectId, sessionId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    const session = await Session.findOne({ _id: sessionId, project: projectId });
    if (!session) return res.status(404).json({ message: 'Study session not found' });

    const { action, phase, remainingSeconds: clientRemaining } = req.body;

    const workSeconds = (session.timerConfig?.workInterval || 25) * 60;
    const breakSeconds = (session.timerConfig?.breakInterval || 5) * 60;
    const longBreakSeconds = (session.timerConfig?.longBreakInterval || 15) * 60;

    if (action === 'start') {
      const durationSecs = clientRemaining || session.timerState.remainingSeconds || workSeconds;
      session.timerState.status = 'running';
      session.timerState.startedAt = new Date();
      session.timerState.pausedAt = null;
      session.timerState.remainingSeconds = durationSecs;
      session.timerState.targetEndTime = new Date(Date.now() + durationSecs * 1000);

      // Auto-transition session to 'In Progress' if scheduled
      if (session.status === 'Scheduled') {
        session.status = 'In Progress';
        session.startedAt = new Date();
      }
    } else if (action === 'pause') {
      if (session.timerState.status === 'running' && session.timerState.targetEndTime) {
        const remaining = Math.max(0, Math.round((new Date(session.timerState.targetEndTime).getTime() - Date.now()) / 1000));
        session.timerState.remainingSeconds = remaining;
      }
      session.timerState.status = 'paused';
      session.timerState.pausedAt = new Date();
      session.timerState.targetEndTime = null;
    } else if (action === 'reset') {
      session.timerState.status = 'idle';
      session.timerState.phase = phase || session.timerState.phase || 'work';
      const curPhase = session.timerState.phase;
      session.timerState.remainingSeconds =
        curPhase === 'break' ? breakSeconds : curPhase === 'long_break' ? longBreakSeconds : workSeconds;
      session.timerState.targetEndTime = null;
      session.timerState.pausedAt = null;
    } else if (action === 'next_phase') {
      // Toggle cycle
      let nextPhase = 'break';
      let nextCycle = session.timerState.currentCycle;

      if (session.timerState.phase === 'work') {
        if (session.timerState.currentCycle >= (session.timerConfig?.cycles || 4)) {
          nextPhase = 'long_break';
        } else {
          nextPhase = 'break';
        }
      } else {
        nextPhase = 'work';
        nextCycle = session.timerState.currentCycle + 1;
      }

      session.timerState.phase = nextPhase;
      session.timerState.currentCycle = nextCycle;
      session.timerState.status = 'idle';
      session.timerState.remainingSeconds =
        nextPhase === 'break' ? breakSeconds : nextPhase === 'long_break' ? longBreakSeconds : workSeconds;
      session.timerState.targetEndTime = null;
    }

    await session.save();

    emitSocketEvent(projectId, 'session:timer_updated', {
      sessionId,
      timerState: session.timerState,
    });

    res.status(200).json({
      message: `Timer ${action} succeeded`,
      timerState: session.timerState,
      status: session.status,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle session goal completion
 * @route   PATCH /api/projects/:projectId/sessions/:sessionId/goals/:goalId
 */
const toggleGoal = async (req, res, next) => {
  try {
    const { projectId, sessionId, goalId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    const session = await Session.findOne({ _id: sessionId, project: projectId });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    const goal = session.goals.id(goalId);
    if (!goal) return res.status(404).json({ message: 'Goal item not found' });

    goal.completed = !goal.completed;
    goal.completedAt = goal.completed ? new Date() : null;
    goal.completedBy = goal.completed ? req.user._id : null;

    await session.save();

    const populated = await Session.findById(session._id)
      .populate('goals.completedBy', 'name email avatarInitials')
      .lean();

    emitSocketEvent(projectId, 'session:goal_updated', {
      sessionId,
      goalId,
      goal,
    });

    res.status(200).json({
      goal,
      goals: populated.goals,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Join study session as participant
 * @route   POST /api/projects/:projectId/sessions/:sessionId/join
 */
const joinSession = async (req, res, next) => {
  try {
    const { projectId, sessionId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    const session = await Session.findOne({ _id: sessionId, project: projectId });
    if (!session) return res.status(404).json({ message: 'Study session not found' });

    const userIdStr = req.user._id.toString();
    const alreadyJoined = session.participants.some((p) => p.toString() === userIdStr);

    if (!alreadyJoined) {
      session.participants.push(req.user._id);
      await session.save();
    }

    const populated = await Session.findById(session._id)
      .populate('participants', 'name email avatarInitials')
      .lean();

    emitSocketEvent(projectId, 'session:participant_joined', {
      sessionId,
      user: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        avatarInitials: req.user.avatarInitials,
      },
    });

    res.status(200).json(populated);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete study session
 * @route   DELETE /api/projects/:projectId/sessions/:sessionId
 */
const deleteSession = async (req, res, next) => {
  try {
    const { projectId, sessionId } = req.params;
    const { isAuthorized, role, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    const session = await Session.findOne({ _id: sessionId, project: projectId });
    if (!session) return res.status(404).json({ message: 'Study session not found' });

    const isHost = session.host.toString() === req.user._id.toString();
    const canModerate = role === 'Owner' || role === 'Admin';
    if (!isHost && !canModerate) {
      return res.status(403).json({ message: 'Only the session host or project admins can delete this session' });
    }

    const deletedTitle = session.title;
    await Session.deleteOne({ _id: sessionId });

    logActivity({
      type: 'session_cancelled',
      userId: req.user._id,
      projectId,
      meta: { sessionTitle: deletedTitle },
    });

    emitSocketEvent(projectId, 'session:deleted', { sessionId, projectId });

    res.status(200).json({
      message: 'Study session deleted successfully',
      sessionId,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSessions,
  getSessionById,
  createSession,
  updateSession,
  updateTimer,
  toggleGoal,
  joinSession,
  deleteSession,
};
