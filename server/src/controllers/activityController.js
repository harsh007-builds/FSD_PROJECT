const Activity = require('../models/Activity');
const Project = require('../models/Project');

// @desc    Get activities for user's projects
// @route   GET /api/activities
const getActivities = async (req, res, next) => {
  try {
    const projects = await Project.find({
      $or: [{ owner: req.user._id }, { members: req.user._id }]
    }).select('_id');

    const projectIds = projects.map(p => p._id);

    const activities = await Activity.find({ project: { $in: projectIds } })
      .populate('user', 'name email avatarInitials')
      .populate('targetUser', 'name email avatarInitials')
      .populate('project', 'name')
      .populate('task', 'title')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.status(200).json(activities);
  } catch (error) {
    next(error);
  }
};

// Helper: log activity (called from other controllers, not an endpoint)
const logActivity = async ({ type, userId, projectId, taskId, targetUserId, meta }) => {
  try {
    await Activity.create({
      type,
      user: userId,
      project: projectId,
      task: taskId,
      targetUser: targetUserId,
      meta,
    });
  } catch (err) {
    console.error('Failed to log activity:', err.message);
  }
};

module.exports = {
  getActivities,
  logActivity,
};
