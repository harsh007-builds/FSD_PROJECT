const Activity = require('../models/Activity');
const Project = require('../models/Project');

// @desc    Get activities for user's projects (with optional pagination)
// @route   GET /api/activities
const getActivities = async (req, res, next) => {
  try {
    const projects = await Project.find({
      $or: [{ owner: req.user._id }, { members: req.user._id }]
    }).select('_id');

    const projectIds = projects.map(p => p._id);
    const filter = { project: { $in: projectIds } };

    if (req.query.projectId) {
      filter.project = req.query.projectId;
    }
    if (req.query.type) {
      filter.type = req.query.type;
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const total = await Activity.countDocuments(filter);
    const activities = await Activity.find(filter)
      .populate('user', 'name email avatarInitials')
      .populate('targetUser', 'name email avatarInitials')
      .populate('project', 'name')
      .populate('task', 'title')
      .populate('resource', 'title type category')
      .populate('note', 'title category')
      .populate('session', 'title status startTime duration')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // If client explicitly requested paginated format or page param was passed
    if (req.query.paginate === 'true' || req.query.page) {
      return res.status(200).json({
        activities,
        total,
        page,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: page * limit < total,
      });
    }

    // Default backward compatible array response
    res.status(200).json(activities);
  } catch (error) {
    next(error);
  }
};

// @desc    Get activities for a specific project (chronological with pagination)
// @route   GET /api/projects/:id/activities or GET /api/activities/project/:projectId
const getProjectActivities = async (req, res, next) => {
  try {
    const projectId = req.params.id || req.params.projectId;

    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404);
      throw new Error('Project not found');
    }

    // Check authorization: must be owner or member
    const isOwner = project.owner.toString() === req.user._id.toString();
    const isMember = project.members.some(m => m.toString() === req.user._id.toString());
    if (!isOwner && !isMember) {
      res.status(403);
      throw new Error('Not authorized to view activity for this project');
    }

    const filter = { project: projectId };
    if (req.query.type) {
      filter.type = req.query.type;
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const total = await Activity.countDocuments(filter);
    const activities = await Activity.find(filter)
      .populate('user', 'name email avatarInitials')
      .populate('targetUser', 'name email avatarInitials')
      .populate('project', 'name')
      .populate('task', 'title')
      .populate('resource', 'title type category')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json({
      activities,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      hasMore: page * limit < total,
    });
  } catch (error) {
    next(error);
  }
};

// Helper: log activity (called from other controllers, with real-time socket emit)
const logActivity = async ({ type, userId, user, projectId, taskId, targetUserId, resourceId, resource, noteId, note, sessionId, session, meta }) => {
  try {
    const activity = await Activity.create({
      type,
      user: userId || user,
      project: projectId,
      task: taskId,
      resource: resourceId || resource,
      note: noteId || note,
      session: sessionId || session,
      targetUser: targetUserId,
      meta,
    });

    const populated = await Activity.findById(activity._id)
      .populate('user', 'name email avatarInitials')
      .populate('targetUser', 'name email avatarInitials')
      .populate('project', 'name')
      .populate('task', 'title')
      .populate('resource', 'title type category')
      .populate('note', 'title category')
      .populate('session', 'title status startTime duration')
      .lean();

    // Emit socket event to project room
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (projectId) {
        io.to(`project_${projectId}`).emit('activity:new', populated);
      }
    } catch (socketErr) {
      // Socket not active or unit test environment
    }

    return populated;
  } catch (err) {
    console.error('Failed to log activity:', err.message);
    return null;
  }
};

module.exports = {
  getActivities,
  getProjectActivities,
  logActivity,
};
