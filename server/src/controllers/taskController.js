const Task = require('../models/Task');
const Project = require('../models/Project');
const { logActivity } = require('./activityController');
const { createNotification } = require('./notificationController');
const { getIO } = require('../socket');

// Helper function to check if user is authorized for a project
const isAuthorizedForProject = async (projectId, userId) => {
  const project = await Project.findById(projectId);
  if (!project) return false;
  return project.owner.toString() === userId.toString() || project.members.includes(userId);
};

// @desc    Get all tasks for user
// @route   GET /api/tasks
const getAllTasks = async (req, res, next) => {
  try {
    // Find projects the user is part of
    const projects = await Project.find({
      $or: [{ owner: req.user._id }, { members: req.user._id }]
    }).select('_id');
    
    const projectIds = projects.map(p => p._id);
    
    const tasks = await Task.find({ project: { $in: projectIds } })
      .populate('assignee', 'name email avatarInitials')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(tasks);
  } catch (error) {
    next(error);
  }
};

// @desc    Get tasks for a specific project
// @route   GET /api/projects/:projectId/tasks
const getTasks = async (req, res, next) => {
  try {
    const isAuth = await isAuthorizedForProject(req.params.projectId, req.user._id);
    if (!isAuth) {
      res.status(401);
      throw new Error('Not authorized to access tasks for this project');
    }

    const tasks = await Task.find({ project: req.params.projectId })
      .populate('assignee', 'name email avatarInitials')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(tasks);
  } catch (error) {
    next(error);
  }
};

// @desc    Get single task
// @route   GET /api/tasks/:id
const getTaskById = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignee', 'name email avatarInitials')
      .lean();
      
    if (!task) {
      res.status(404);
      throw new Error('Task not found');
    }
    
    const isAuth = await isAuthorizedForProject(task.project, req.user._id);
    if (!isAuth) {
      res.status(401);
      throw new Error('Not authorized to access this task');
    }

    res.status(200).json(task);
  } catch (error) {
    next(error);
  }
};

// @desc    Create task for a project
// @route   POST /api/projects/:projectId/tasks
const createTask = async (req, res, next) => {
  try {
    const { title, description, priority, status, assignee, dueDate, labels } = req.body;
    const projectId = req.params.projectId;

    // Verify project exists
    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404);
      throw new Error('Project not found');
    }

    const isAuth = await isAuthorizedForProject(projectId, req.user._id);
    if (!isAuth) {
      res.status(401);
      throw new Error('Not authorized to create tasks for this project');
    }

    if (!title) {
      res.status(400);
      throw new Error('Task title is required');
    }

    // Assignee must be a project member if provided
    if (assignee && project.owner.toString() !== assignee && !project.members.includes(assignee)) {
      res.status(400);
      throw new Error('Assignee must be a member of the project');
    }

    const task = await Task.create({
      title,
      description,
      project: projectId,
      priority,
      status,
      assignee, // Object ID of User
      createdBy: req.user._id,
      dueDate,
      labels: labels || [],
    });

    const populatedTask = await Task.findById(task._id).populate('assignee', 'name email avatarInitials');

    // Log activity
    logActivity({ type: 'task_created', userId: req.user._id, projectId, taskId: task._id, meta: { taskTitle: title } });

    // Notify assignee
    if (assignee && assignee !== req.user._id.toString()) {
      createNotification({ type: 'task_assigned', recipientId: assignee, senderId: req.user._id, projectId, taskId: task._id, message: `You were assigned task "${title}"` });
      logActivity({ type: 'task_assigned', userId: req.user._id, projectId, taskId: task._id, targetUserId: assignee, meta: { taskTitle: title } });
    }

    // Emit socket event
    try {
      getIO().to(`project_${projectId}`).emit('task:created', populatedTask);
    } catch (err) {
      console.error('Socket emit error:', err);
    }

    res.status(201).json(populatedTask);
  } catch (error) {
    if (error.name === 'ValidationError') res.status(400);
    next(error);
  }
};

// @desc    Update task
// @route   PUT /api/tasks/:id
const updateTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      res.status(404);
      throw new Error('Task not found');
    }
    
    const isAuth = await isAuthorizedForProject(task.project, req.user._id);
    if (!isAuth) {
      res.status(401);
      throw new Error('Not authorized to update this task');
    }

    if (req.body.assignee) {
      const project = await Project.findById(task.project);
      if (project.owner.toString() !== req.body.assignee && !project.members.includes(req.body.assignee)) {
        res.status(400);
        throw new Error('Assignee must be a member of the project');
      }
    }

    const oldAssignee = task.assignee ? task.assignee.toString() : null;
    const oldStatus = task.status;

    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('assignee', 'name email avatarInitials');

    // Log assignment change
    if (req.body.assignee && req.body.assignee !== oldAssignee) {
      logActivity({ type: 'task_assigned', userId: req.user._id, projectId: task.project, taskId: task._id, targetUserId: req.body.assignee, meta: { taskTitle: updatedTask.title } });
      createNotification({ type: 'task_assigned', recipientId: req.body.assignee, senderId: req.user._id, projectId: task.project, taskId: task._id, message: `You were assigned task "${updatedTask.title}"` });
    }

    // Log status change
    if (req.body.status && req.body.status !== oldStatus) {
      const actType = req.body.status === 'Completed' ? 'task_completed' : 'task_status_changed';
      logActivity({ type: actType, userId: req.user._id, projectId: task.project, taskId: task._id, meta: { taskTitle: updatedTask.title, oldStatus, newStatus: req.body.status } });
    }

    // Emit socket event
    try {
      getIO().to(`project_${task.project}`).emit('task:updated', updatedTask);
    } catch (err) {
      console.error('Socket emit error:', err);
    }

    res.status(200).json(updatedTask);
  } catch (error) {
    if (error.name === 'ValidationError') res.status(400);
    next(error);
  }
};

// @desc    Update task status (partial update)
// @route   PATCH /api/tasks/:id/status
const updateTaskStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) {
      res.status(400);
      throw new Error('Status is required');
    }

    const task = await Task.findById(req.params.id);
    if (!task) {
      res.status(404);
      throw new Error('Task not found');
    }
    
    const isAuth = await isAuthorizedForProject(task.project, req.user._id);
    if (!isAuth) {
      res.status(401);
      throw new Error('Not authorized to update this task');
    }

    const oldStatus = task.status;
    task.status = status;
    await task.save();

    const updatedTask = await Task.findById(task._id).populate('assignee', 'name email avatarInitials');

    // Log activity
    const actType = status === 'Completed' ? 'task_completed' : 'task_status_changed';
    logActivity({ type: actType, userId: req.user._id, projectId: task.project, taskId: task._id, meta: { taskTitle: task.title, oldStatus, newStatus: status } });

    // Notify assignee on completion
    if (status === 'Completed' && task.assignee && task.assignee.toString() !== req.user._id.toString()) {
      createNotification({ type: 'task_completed', recipientId: task.assignee, senderId: req.user._id, projectId: task.project, taskId: task._id, message: `Task "${task.title}" was marked as completed` });
    }

    // Emit socket event
    try {
      getIO().to(`project_${task.project}`).emit('task:updated', updatedTask);
    } catch (err) {
      console.error('Socket emit error:', err);
    }

    res.status(200).json(updatedTask);
  } catch (error) {
    if (error.name === 'ValidationError') res.status(400);
    next(error);
  }
};

// @desc    Delete task
// @route   DELETE /api/tasks/:id
const deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      res.status(404);
      throw new Error('Task not found');
    }

    const isAuth = await isAuthorizedForProject(task.project, req.user._id);
    if (!isAuth) {
      res.status(401);
      throw new Error('Not authorized to delete this task');
    }

    // Log activity before deleting
    logActivity({ type: 'task_deleted', userId: req.user._id, projectId: task.project, taskId: task._id, meta: { taskTitle: task.title } });

    await task.deleteOne();

    // Emit socket event
    try {
      getIO().to(`project_${task.project}`).emit('task:deleted', { taskId: task._id, projectId: task.project });
    } catch (err) {
      console.error('Socket emit error:', err);
    }

    res.status(200).json({ message: 'Task removed' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllTasks,
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
};
