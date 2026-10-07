const Project = require('../models/Project');
const Task = require('../models/Task');
const Activity = require('../models/Activity');

// Helper function to check if user is authorized for a project
const isAuthorizedForProject = async (projectId, userId) => {
  const project = await Project.findById(projectId);
  if (!project) return false;
  return project.owner.toString() === userId.toString() || project.members.includes(userId);
};

// @desc    Get complete workspace data for a project
// @route   GET /api/projects/:id/workspace
// @access  Private
const getProjectWorkspace = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const userId = req.user._id;

    // 1. Verify Authorization
    const isAuth = await isAuthorizedForProject(projectId, userId);
    if (!isAuth) {
      res.status(401);
      throw new Error('Not authorized to access this project workspace');
    }

    // 2. Fetch Project with populated members
    const project = await Project.findById(projectId)
      .populate('owner', 'name email avatarInitials')
      .populate('members', 'name email avatarInitials')
      .lean();

    if (!project) {
      res.status(404);
      throw new Error('Project not found');
    }

    // 3. Fetch Tasks and Calculate Statistics
    const tasks = await Task.find({ project: projectId })
      .populate('assignee', 'name email avatarInitials')
      .sort({ createdAt: -1 })
      .lean();

    let totalTasks = tasks.length;
    let completed = 0;
    let inProgress = 0;
    let todo = 0;
    let backlog = 0;
    let review = 0;
    let overdue = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcomingDeadlines = [];
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    tasks.forEach(t => {
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
        
        if (due.getTime() >= today.getTime() && due.getTime() <= sevenDaysFromNow.getTime()) {
          upcomingDeadlines.push(t);
        }
      }
    });

    const progress = totalTasks === 0 ? 0 : Math.round((completed / totalTasks) * 100);

    // Sort deadlines closest first
    upcomingDeadlines.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    // 4. Fetch Recent Activity
    const recentActivity = await Activity.find({ project: projectId })
      .populate('user', 'name email avatarInitials')
      .populate('targetUser', 'name email avatarInitials')
      .populate('project', 'name')
      .populate('task', 'title')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // 5. Construct Response
    res.status(200).json({
      project,
      stats: {
        totalTasks,
        completed,
        inProgress,
        todo,
        backlog,
        review,
        overdue,
        progress,
      },
      upcomingDeadlines: upcomingDeadlines.slice(0, 5), // top 5
      recentActivity,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProjectWorkspace,
};
