const Project = require('../models/Project');
const User = require('../models/User');
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
      .sort({ createdAt: -1 });
    res.status(200).json(projects);
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
      members: [req.user._id]
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

    // Check if user is authorized to update this project (only owner)
    if (project.owner.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error('Not authorized to update this project. Only owner can update.');
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

    await project.deleteOne();
    res.status(200).json({ message: 'Project removed' });
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
      throw new Error('User not found');
    }

    // Check if already a member
    if (project.members.includes(userToAdd._id)) {
      res.status(400);
      throw new Error('User is already a member');
    }

    project.members.push(userToAdd._id);
    await project.save();

    const updatedProject = await Project.findById(project._id)
      .populate('owner', 'name email avatarInitials')
      .populate('members', 'name email avatarInitials');

    // Log activity
    logActivity({ type: 'member_added', userId: req.user._id, projectId: project._id, targetUserId: userToAdd._id, meta: { memberName: userToAdd.name, projectName: project.name } });

    // Notify the added user
    createNotification({ type: 'added_to_project', recipientId: userToAdd._id, senderId: req.user._id, projectId: project._id, message: `You were added to project "${project.name}"` });

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
  addMember
};
