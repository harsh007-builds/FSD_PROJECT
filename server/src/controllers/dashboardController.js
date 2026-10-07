const Project = require('../models/Project');
const Task = require('../models/Task');

// @desc    Get dashboard statistics for user
// @route   GET /api/dashboard/stats
const getDashboardStats = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Get user's projects
    const projects = await Project.find({
      $or: [{ owner: userId }, { members: userId }]
    }).select('_id status').lean();

    const projectIds = projects.map(p => p._id);

    // Get all tasks for user's projects
    const tasks = await Task.find({ project: { $in: projectIds } })
      .populate('assignee', 'name email avatarInitials')
      .lean();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalProjects = projects.length;
    const activeProjects = projects.filter(p => p.status === 'Active').length;
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'Completed').length;
    const pendingTasks = tasks.filter(t => t.status !== 'Completed').length;
    const overdueTasks = tasks.filter(t => {
      if (!t.dueDate || t.status === 'Completed') return false;
      const due = new Date(t.dueDate);
      due.setHours(0, 0, 0, 0);
      return due < today;
    }).length;

    const myTasks = tasks.filter(t =>
      t.assignee && t.assignee._id && t.assignee._id.toString() === userId.toString()
    ).length;

    // Upcoming deadlines (next 7 days, not completed)
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    const upcomingDeadlines = tasks
      .filter(t => {
        if (!t.dueDate || t.status === 'Completed') return false;
        const due = new Date(t.dueDate);
        due.setHours(0, 0, 0, 0);
        return due >= today && due <= weekFromNow;
      })
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
      .slice(0, 10);

    res.status(200).json({
      totalProjects,
      activeProjects,
      totalTasks,
      completedTasks,
      pendingTasks,
      overdueTasks,
      myTasks,
      upcomingDeadlines,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardStats,
};
