const Project = require('../models/Project');
const User = require('../models/User');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const Notification = require('../models/Notification');
const { logActivity } = require('./activityController');
const { createNotification } = require('./notificationController');

// @desc    Get all projects for logged in user
// @route   GET /api/projects
const getProjects = async (req, res, next) => {
  try {
    const projects = await Project.find({
      $or: [{ owner: req.user._id }, { members: req.user._id }]
    })
      .populate('owner', 'name email avatarInitials')
      .populate('members', 'name email avatarInitials')
      .sort({ createdAt: -1 })
      .lean();

    // Calculate real progress for each project from actual task data
    const projectIds = projects.map(p => p._id);
    const tasks = await Task.find({ project: { $in: projectIds } }).select('project status').lean();

    const taskCounts = {};
    tasks.forEach(t => {
      const pId = t.project.toString();
      if (!taskCounts[pId]) taskCounts[pId] = { total: 0, completed: 0 };
      taskCounts[pId].total++;
      if (t.status === 'Completed') taskCounts[pId].completed++;
    });

    const enrichedProjects = projects.map(p => {
      const stats = taskCounts[p._id.toString()] || { total: 0, completed: 0 };
      const calculatedProgress = stats.total === 0 ? (p.progress || 0) : Math.round((stats.completed / stats.total) * 100);
      return {
        ...p,
        totalTasks: stats.total,
        completedTasks: stats.completed,
        progress: calculatedProgress,
      };
    });

    res.status(200).json(enrichedProjects);
  } catch (error) {
    next(error);
  }
};

// @desc    Get single project
// @route   GET /api/projects/:id
const getProjectById = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('owner', 'name email avatarInitials')
      .populate('members', 'name email avatarInitials');
      
    if (!project) {
      res.status(404);
      throw new Error('Project not found');
    }

    // Check if user is authorized to view this project
    const isOwner = project.owner._id.toString() === req.user._id.toString();
    const isMember = project.members.some(m => m._id.toString() === req.user._id.toString());
    
    if (!isOwner && !isMember) {
      res.status(401);
      throw new Error('Not authorized to access this project');
    }

    res.status(200).json(project);
  } catch (error) {
    next(error);
  }
};

// @desc    Create project
// @route   POST /api/projects
const createProject = async (req, res, next) => {
  try {
    const { name, progress, description, status, startDate, deadline } = req.body;
    if (!name) {
      res.status(400);
      throw new Error('Project name is required');
    }

    const project = await Project.create({
      name,
      description,
      status: status || 'Active',
      startDate,
      deadline,
      progress: progress || 0,
      owner: req.user._id,
      members: [req.user._id],
      memberRoles: [{ user: req.user._id, role: 'Owner', joinedAt: new Date() }],
    });

    const populatedProject = await Project.findById(project._id)
      .populate('owner', 'name email avatarInitials')
      .populate('members', 'name email avatarInitials');

    // Log activity
    logActivity({ type: 'project_created', userId: req.user._id, projectId: project._id, meta: { projectName: name } });

    res.status(201).json(populatedProject);
  } catch (error) {
    if (error.name === 'ValidationError') res.status(400);
    next(error);
  }
};

// @desc    Update project
// @route   PUT /api/projects/:id
const updateProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      res.status(404);
      throw new Error('Project not found');
    }

    // Check if user is authorized (Owner or Admin)
    const callerRole = project.getUserRole(req.user._id);
    if (!callerRole || (callerRole !== 'Owner' && callerRole !== 'Admin')) {
      res.status(403);
      throw new Error('Not authorized to update this project. Requires Owner or Admin role.');
    }

    const updatedProject = await Project.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('owner', 'name email avatarInitials')
      .populate('members', 'name email avatarInitials');

    // Log activity
    logActivity({ type: 'project_updated', userId: req.user._id, projectId: project._id, meta: { projectName: updatedProject.name } });

    res.status(200).json(updatedProject);
  } catch (error) {
    if (error.name === 'ValidationError') res.status(400);
    next(error);
  }
};

// @desc    Delete project
// @route   DELETE /api/projects/:id
const deleteProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      res.status(404);
      throw new Error('Project not found');
    }

    // Check if user is authorized to delete this project (only owner)
    if (project.owner.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error('Not authorized to delete this project. Only owner can delete.');
    }

    // Log activity
    logActivity({ type: 'project_deleted', userId: req.user._id, projectId: project._id, meta: { projectName: project.name } });

    // Cascade delete related tasks, activities, and notifications to prevent orphaned records
    await Task.deleteMany({ project: project._id });
    await Activity.deleteMany({ project: project._id });
    await Notification.deleteMany({ project: project._id });

    await project.deleteOne();
    res.status(200).json({ message: 'Project removed' });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle project archived status
// @route   PATCH /api/projects/:id/archive
const archiveProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      res.status(404);
      throw new Error('Project not found');
    }

    if (project.owner.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error('Not authorized. Only the owner can archive/unarchive this project.');
    }

    const nextStatus = project.status === 'Archived' ? 'Active' : 'Archived';
    project.status = nextStatus;
    await project.save();

    const updatedProject = await Project.findById(project._id)
      .populate('owner', 'name email avatarInitials')
      .populate('members', 'name email avatarInitials');

    logActivity({
      type: 'project_updated',
      userId: req.user._id,
      projectId: project._id,
      meta: { projectName: project.name, status: nextStatus }
    });

    res.status(200).json(updatedProject);
  } catch (error) {
    next(error);
  }
};

// @desc    Add member to project
// @route   POST /api/projects/:id/members
const addMember = async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      res.status(400);
      throw new Error('User email is required');
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      res.status(404);
      throw new Error('Project not found');
    }

    // Only owner can add members
    if (project.owner.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error('Not authorized to add members. Only owner can add members.');
    }

    const userToAdd = await User.findOne({ email });
    if (!userToAdd) {
      res.status(404);
      throw new Error('User not found with this email');
    }

    // Check if already a member
    if (project.members.some(m => m.toString() === userToAdd._id.toString())) {
      res.status(400);
      throw new Error('User is already a member of this project');
    }

    project.members.push(userToAdd._id);
    await project.save();

    const updatedProject = await Project.findById(project._id)
      .populate('owner', 'name email avatarInitials')
      .populate('members', 'name email avatarInitials');

    // Log activity
    logActivity({ type: 'member_added', userId: req.user._id, projectId: project._id, targetUserId: userToAdd._id, meta: { memberName: userToAdd.name, projectName: project.name } });

    // Notify the added user
    await createNotification({ type: 'added_to_project', recipientId: userToAdd._id, senderId: req.user._id, projectId: project._id, message: `You were added to project "${project.name}"` });

    res.status(200).json(updatedProject);
  } catch (error) {
    next(error);
  }
};

// @desc    Remove member from project (Owner / Admin action)
// @route   DELETE /api/projects/:id/members/:userId
const removeMember = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const project = await Project.findById(req.params.id);
    if (!project) {
      res.status(404);
      throw new Error('Project not found');
    }

    const callerRole = project.getUserRole(req.user._id);
    if (!callerRole || (callerRole !== 'Owner' && callerRole !== 'Admin')) {
      res.status(403);
      throw new Error('Not authorized. Only the project Owner or Admins can remove members.');
    }

    const targetRole = project.getUserRole(userId);
    if (!targetRole) {
      res.status(400);
      throw new Error('Target user is not a member of this project');
    }

    if (targetRole === 'Owner') {
      res.status(400);
      throw new Error('The Owner cannot be removed from the project.');
    }

    // Admins cannot remove other Admins or the Owner
    if (callerRole === 'Admin' && targetRole === 'Admin') {
      res.status(403);
      throw new Error('Permission denied. Admins cannot remove other Admins.');
    }

    // Remove from members array
    project.members = project.members.filter(m => m.toString() !== userId);
    
    // Remove from memberRoles array
    if (project.memberRoles) {
      project.memberRoles = project.memberRoles.filter(m => {
        const entryId = m.user?._id ? m.user._id.toString() : m.user?.toString();
        return entryId !== userId;
      });
    }

    await project.save();

    // Unassign tasks assigned to removed user
    await Task.updateMany(
      { project: project._id, assignee: userId },
      { $set: { assignee: null } }
    );

    const targetUser = await User.findById(userId);

    // Notify removed user
    await createNotification({
      type: 'member_removed',
      recipientId: userId,
      senderId: req.user._id,
      projectId: project._id,
      message: `You were removed from project "${project.name}" by ${req.user.name}.`,
    });

    // Log Activity
    logActivity({
      type: 'member_removed',
      userId: req.user._id,
      projectId: project._id,
      targetUser: userId,
      meta: { memberName: targetUser?.name || 'Member', projectName: project.name },
    });

    const updatedProject = await Project.findById(project._id)
      .populate('owner', 'name email avatarInitials')
      .populate('members', 'name email avatarInitials');

    res.status(200).json(updatedProject);
  } catch (error) {
    next(error);
  }
};

// @desc    Leave project (non-owner member)
// @route   POST /api/projects/:id/leave
const leaveProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      res.status(404);
      throw new Error('Project not found');
    }

    const callerRole = project.getUserRole(req.user._id);
    if (!callerRole) {
      res.status(400);
      throw new Error('You are not a member of this project');
    }

    if (callerRole === 'Owner') {
      res.status(400);
      throw new Error('Project Owner cannot leave. You must transfer ownership first or delete the project.');
    }

    project.members = project.members.filter(m => m.toString() !== req.user._id.toString());
    if (project.memberRoles) {
      project.memberRoles = project.memberRoles.filter(m => {
        const entryId = m.user?._id ? m.user._id.toString() : m.user?.toString();
        return entryId !== req.user._id.toString();
      });
    }

    await project.save();

    // Unassign tasks assigned to the leaving user
    await Task.updateMany(
      { project: project._id, assignee: req.user._id },
      { $set: { assignee: null } }
    );

    logActivity({
      type: 'member_removed',
      userId: req.user._id,
      projectId: project._id,
      meta: { memberName: req.user.name, projectName: project.name, selfLeave: true },
    });

    // Notify project owner
    await createNotification({
      type: 'member_left',
      recipientId: project.owner,
      senderId: req.user._id,
      projectId: project._id,
      message: `${req.user.name} left project "${project.name}".`,
    });

    res.status(200).json({ message: 'Successfully left project' });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a member's role (Owner or Admin)
// @route   PATCH /api/projects/:id/members/:userId/role
const updateMemberRole = async (req, res, next) => {
  try {
    const { id: projectId, userId } = req.params;
    const { role } = req.body;

    if (!['Admin', 'Member'].includes(role)) {
      res.status(400);
      throw new Error('Invalid role. Role must be "Admin" or "Member".');
    }

    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404);
      throw new Error('Project not found');
    }

    const callerRole = project.getUserRole(req.user._id);
    if (!callerRole || (callerRole !== 'Owner' && callerRole !== 'Admin')) {
      res.status(403);
      throw new Error('Permission denied. Only Owner or Admins can change member roles.');
    }

    const targetRole = project.getUserRole(userId);
    if (!targetRole) {
      res.status(404);
      throw new Error('User is not a member of this project');
    }

    if (targetRole === 'Owner') {
      res.status(400);
      throw new Error('Cannot change the Owner role. Transfer ownership instead.');
    }

    if (userId.toString() === req.user._id.toString()) {
      res.status(400);
      throw new Error('Cannot change your own role.');
    }

    // Privilege escalation check: Admins cannot promote users to Admin or demote other Admins
    if (callerRole === 'Admin') {
      res.status(403);
      throw new Error('Permission denied. Only the project Owner can assign or modify Admin roles.');
    }

    if (!project.memberRoles) project.memberRoles = [];
    const entry = project.memberRoles.find(m => {
      const entryId = m.user?._id ? m.user._id.toString() : m.user?.toString();
      return entryId === userId.toString();
    });

    if (entry) {
      entry.role = role;
    } else {
      project.memberRoles.push({ user: userId, role, joinedAt: new Date() });
    }

    await project.save();

    const targetUser = await User.findById(userId);

    // Notify user
    await createNotification({
      type: 'role_changed',
      recipientId: userId,
      senderId: req.user._id,
      projectId: project._id,
      message: `Your role in project "${project.name}" was updated to ${role} by ${req.user.name}.`,
    });

    // Log Activity
    logActivity({
      type: 'role_updated',
      userId: req.user._id,
      projectId: project._id,
      targetUser: userId,
      meta: { memberName: targetUser?.name || 'Member', newRole: role, projectName: project.name },
    });

    const updatedProject = await Project.findById(project._id)
      .populate('owner', 'name email avatarInitials')
      .populate('members', 'name email avatarInitials');

    res.status(200).json(updatedProject);
  } catch (error) {
    next(error);
  }
};

// @desc    Transfer project ownership to another member (Owner only)
// @route   POST /api/projects/:id/transfer-ownership
const transferOwnership = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const { newOwnerId } = req.body;

    if (!newOwnerId) {
      res.status(400);
      throw new Error('New owner ID is required');
    }

    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404);
      throw new Error('Project not found');
    }

    // Only current owner can transfer ownership
    if (project.owner.toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error('Permission denied. Only the current project Owner can transfer ownership.');
    }

    if (newOwnerId.toString() === req.user._id.toString()) {
      res.status(400);
      throw new Error('You are already the owner of this project.');
    }

    // Target must be an existing member of the project
    const isMember = project.members.some(m => m.toString() === newOwnerId.toString());
    if (!isMember) {
      res.status(400);
      throw new Error('Target user must already be a member of this project.');
    }

    const newOwnerUser = await User.findById(newOwnerId);
    if (!newOwnerUser) {
      res.status(404);
      throw new Error('Target user not found');
    }

    const previousOwnerId = req.user._id;

    // Set new owner
    project.owner = newOwnerId;

    // Update memberRoles: previous owner becomes Admin, new owner becomes Owner
    if (!project.memberRoles) project.memberRoles = [];

    const oldOwnerEntry = project.memberRoles.find(m => {
      const entryId = m.user?._id ? m.user._id.toString() : m.user?.toString();
      return entryId === previousOwnerId.toString();
    });
    if (oldOwnerEntry) {
      oldOwnerEntry.role = 'Admin';
    } else {
      project.memberRoles.push({ user: previousOwnerId, role: 'Admin', joinedAt: new Date() });
    }

    const newOwnerEntry = project.memberRoles.find(m => {
      const entryId = m.user?._id ? m.user._id.toString() : m.user?.toString();
      return entryId === newOwnerId.toString();
    });
    if (newOwnerEntry) {
      newOwnerEntry.role = 'Owner';
    } else {
      project.memberRoles.push({ user: newOwnerId, role: 'Owner', joinedAt: new Date() });
    }

    if (!project.members.some(m => m.toString() === previousOwnerId.toString())) {
      project.members.push(previousOwnerId);
    }

    await project.save();

    // Notify new owner
    await createNotification({
      type: 'ownership_transferred',
      recipientId: newOwnerId,
      senderId: req.user._id,
      projectId: project._id,
      message: `${req.user.name} transferred ownership of project "${project.name}" to you. You are now the Owner.`,
    });

    // Log Activity
    logActivity({
      type: 'ownership_transferred',
      userId: req.user._id,
      projectId: project._id,
      targetUser: newOwnerId,
      meta: {
        previousOwner: req.user.name,
        newOwner: newOwnerUser.name,
        projectName: project.name,
      },
    });

    const updatedProject = await Project.findById(project._id)
      .populate('owner', 'name email avatarInitials')
      .populate('members', 'name email avatarInitials');

    res.status(200).json(updatedProject);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  archiveProject,
  addMember,
  removeMember,
  leaveProject,
  updateMemberRole,
  transferOwnership,
};
