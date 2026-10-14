const Task = require('../models/Task');
const Project = require('../models/Project');
const { logActivity } = require('./activityController');
const { createNotification } = require('./notificationController');
const { getIO } = require('../socket');

// Helper function to check if user is authorized for a project
const isAuthorizedForProject = async (projectId, userId) => {
  const project = await Project.findById(projectId);
  if (!project) return false;
  return project.owner.toString() === userId.toString() || project.members.some(m => m.toString() === userId.toString());
};

// Helper function to update project progress from actual tasks
const updateProjectProgress = async (projectId) => {
  try {
    const tasks = await Task.find({ project: projectId }).select('status').lean();
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'Completed').length;
    const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
    await Project.findByIdAndUpdate(projectId, { progress });
  } catch (err) {
    console.error('Failed to auto-update project progress:', err);
  }
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
      .populate('project', 'name status deadline')
      .populate('assignee', 'name email avatarInitials')
      .populate('comments.user', 'name email avatarInitials')
      .sort({ order: 1, createdAt: -1 })
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
      .populate('project', 'name status deadline')
      .populate('assignee', 'name email avatarInitials')
      .populate('comments.user', 'name email avatarInitials')
      .sort({ order: 1, createdAt: -1 })
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
      .populate('comments.user', 'name email avatarInitials')
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
    const { title, description, priority, type, status, assignee, dueDate, labels, order } = req.body;
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

    if (!title || !title.trim()) {
      res.status(400);
      throw new Error('Task title is required');
    }

    // Assignee must be a project member if provided
    if (assignee && project.owner.toString() !== assignee && !project.members.some(m => m.toString() === assignee)) {
      res.status(400);
      throw new Error('Assignee must be a member of the project');
    }

    const task = await Task.create({
      title: title.trim(),
      description: description ? description.trim() : '',
      project: projectId,
      priority: priority || 'Medium',
      type: ['Task', 'Milestone', 'Study Session'].includes(type) ? type : 'Task',
      status: status || 'Todo',
      assignee: assignee || null,
      createdBy: req.user._id,
      dueDate: dueDate || null,
      labels: labels || [],
      order: typeof order === 'number' ? order : 0,
      comments: [],
    });

    const populatedTask = await Task.findById(task._id)
      .populate('project', 'name status deadline')
      .populate('assignee', 'name email avatarInitials')
      .populate('comments.user', 'name email avatarInitials');

    // Update project progress
    await updateProjectProgress(projectId);

    // Log activity
    logActivity({ type: 'task_created', userId: req.user._id, projectId, taskId: task._id, meta: { taskTitle: title } });

    // Notify assignee
    if (assignee && assignee.toString() !== req.user._id.toString()) {
      await createNotification({ type: 'task_assigned', recipientId: assignee, senderId: req.user._id, projectId, taskId: task._id, message: `You were assigned task "${title}"` });
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
      if (project.owner.toString() !== req.body.assignee && !project.members.some(m => m.toString() === req.body.assignee)) {
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
    )
      .populate('project', 'name status deadline')
      .populate('assignee', 'name email avatarInitials')
      .populate('comments.user', 'name email avatarInitials');

    // Update project progress
    await updateProjectProgress(task.project);

    // Log assignment change
    if (req.body.assignee !== undefined && req.body.assignee !== oldAssignee) {
      logActivity({
        type: 'task_assigned',
        userId: req.user._id,
        projectId: task.project,
        taskId: task._id,
        targetUserId: req.body.assignee,
        meta: { taskTitle: updatedTask.title, oldAssignee, newAssignee: req.body.assignee }
      });

      // Notify previous assignee that task was reassigned
      if (oldAssignee && oldAssignee !== req.user._id.toString()) {
        await createNotification({
          type: 'task_reassigned',
          recipientId: oldAssignee,
          senderId: req.user._id,
          projectId: task.project,
          taskId: task._id,
          message: `Task "${updatedTask.title}" was reassigned.`
        });
      }

      // Notify new assignee
      if (req.body.assignee && req.body.assignee !== req.user._id.toString()) {
        const notifType = oldAssignee ? 'task_reassigned' : 'task_assigned';
        await createNotification({
          type: notifType,
          recipientId: req.body.assignee,
          senderId: req.user._id,
          projectId: task.project,
          taskId: task._id,
          message: oldAssignee 
            ? `You were reassigned task "${updatedTask.title}".` 
            : `You were assigned task "${updatedTask.title}".`
        });
      }
    }

    // Log & notify status change
    if (req.body.status && req.body.status !== oldStatus) {
      const isCompleted = req.body.status === 'Completed';
      const actType = isCompleted ? 'task_completed' : 'task_status_changed';
      logActivity({
        type: actType,
        userId: req.user._id,
        projectId: task.project,
        taskId: task._id,
        meta: { taskTitle: updatedTask.title, oldStatus, newStatus: req.body.status }
      });

      const currentAssignee = updatedTask.assignee?._id?.toString() || (typeof updatedTask.assignee === 'string' ? updatedTask.assignee : null);
      if (currentAssignee && currentAssignee !== req.user._id.toString()) {
        await createNotification({
          type: isCompleted ? 'task_completed' : 'task_status_changed',
          recipientId: currentAssignee,
          senderId: req.user._id,
          projectId: task.project,
          taskId: task._id,
          message: isCompleted 
            ? `Task "${updatedTask.title}" was marked as completed.` 
            : `Task "${updatedTask.title}" status changed to ${req.body.status}.`
        });
      }
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
    const { status, order } = req.body;
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
    if (typeof order === 'number') {
      task.order = order;
    }
    await task.save();

    const updatedTask = await Task.findById(task._id)
      .populate('assignee', 'name email avatarInitials')
      .populate('comments.user', 'name email avatarInitials');

    // Update project progress
    await updateProjectProgress(task.project);

    // Log activity
    const actType = status === 'Completed' ? 'task_completed' : 'task_status_changed';
    logActivity({ type: actType, userId: req.user._id, projectId: task.project, taskId: task._id, meta: { taskTitle: task.title, oldStatus, newStatus: status } });

    // Notify assignee on status change or completion
    if (task.assignee && task.assignee.toString() !== req.user._id.toString()) {
      if (status === 'Completed') {
        await createNotification({
          type: 'task_completed',
          recipientId: task.assignee,
          senderId: req.user._id,
          projectId: task.project,
          taskId: task._id,
          message: `Task "${task.title}" was marked as completed.`
        });
      } else if (status !== oldStatus) {
        await createNotification({
          type: 'task_status_changed',
          recipientId: task.assignee,
          senderId: req.user._id,
          projectId: task.project,
          taskId: task._id,
          message: `Task "${task.title}" status changed to ${status}.`
        });
      }
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

    const projectId = task.project;

    // Log activity before deleting
    logActivity({ type: 'task_deleted', userId: req.user._id, projectId, taskId: task._id, meta: { taskTitle: task.title } });

    await task.deleteOne();

    // Update project progress
    await updateProjectProgress(projectId);

    // Emit socket event
    try {
      getIO().to(`project_${projectId}`).emit('task:deleted', { taskId: task._id, projectId });
    } catch (err) {
      console.error('Socket emit error:', err);
    }

    res.status(200).json({ message: 'Task removed' });
  } catch (error) {
    next(error);
  }
};

// @desc    Add comment to task
// @route   POST /api/tasks/:id/comments
const addComment = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      res.status(400);
      throw new Error('Comment text cannot be empty');
    }

    const task = await Task.findById(req.params.id);
    if (!task) {
      res.status(404);
      throw new Error('Task not found');
    }

    const isAuth = await isAuthorizedForProject(task.project, req.user._id);
    if (!isAuth) {
      res.status(401);
      throw new Error('Not authorized to comment on this task');
    }

    task.comments.push({
      user: req.user._id,
      text: text.trim(),
      createdAt: new Date(),
    });

    await task.save();

    const updatedTask = await Task.findById(task._id)
      .populate('assignee', 'name email avatarInitials')
      .populate('comments.user', 'name email avatarInitials');

    try {
      getIO().to(`project_${task.project}`).emit('task:updated', updatedTask);
    } catch (err) {
      console.error('Socket emit error:', err);
    }

    res.status(201).json(updatedTask);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete comment from task
// @route   DELETE /api/tasks/:id/comments/:commentId
const deleteComment = async (req, res, next) => {
  try {
    const { id, commentId } = req.params;
    const task = await Task.findById(id);
    if (!task) {
      res.status(404);
      throw new Error('Task not found');
    }

    const isAuth = await isAuthorizedForProject(task.project, req.user._id);
    if (!isAuth) {
      res.status(401);
      throw new Error('Not authorized');
    }

    const comment = task.comments.id(commentId);
    if (!comment) {
      res.status(404);
      throw new Error('Comment not found');
    }

    const project = await Project.findById(task.project);
    const isOwner = project && project.owner.toString() === req.user._id.toString();
    const isAuthor = comment.user.toString() === req.user._id.toString();

    if (!isAuthor && !isOwner) {
      res.status(401);
      throw new Error('Not authorized to delete this comment');
    }

    task.comments.pull(commentId);
    await task.save();

    const updatedTask = await Task.findById(task._id)
      .populate('assignee', 'name email avatarInitials')
      .populate('comments.user', 'name email avatarInitials');

    try {
      getIO().to(`project_${task.project}`).emit('task:updated', updatedTask);
    } catch (err) {
      console.error('Socket emit error:', err);
    }

    res.status(200).json(updatedTask);
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
  addComment,
  deleteComment,
};
