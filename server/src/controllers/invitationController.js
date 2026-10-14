const Invitation = require('../models/Invitation');
const Project = require('../models/Project');
const User = require('../models/User');
const { createNotification } = require('./notificationController');
const { logActivity } = require('./activityController');

// @desc    Invite a registered user to project (In-App invitation)
// @route   POST /api/projects/:id/invitations
// @access  Private (Owner / Admin)
const inviteUserToProject = async (req, res, next) => {
  try {
    const { email, role = 'Member' } = req.body;
    const projectId = req.params.id;

    if (!email) {
      res.status(400);
      throw new Error('Recipient email is required');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Verify valid role assignment
    if (!['Admin', 'Member'].includes(role)) {
      res.status(400);
      throw new Error('Invalid role. Allowed invitation roles are "Admin" and "Member".');
    }

    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404);
      throw new Error('Project not found');
    }

    // Role check: Only Owner or Admin can invite
    const callerRole = project.getUserRole(req.user._id);
    if (!callerRole || (callerRole !== 'Owner' && callerRole !== 'Admin')) {
      res.status(403);
      throw new Error('Permission denied. Only project Owner or Admins can invite team members.');
    }

    // Privilege escalation check: Admins cannot invite other Admins, only Members
    if (callerRole === 'Admin' && role === 'Admin') {
      res.status(403);
      throw new Error('Permission denied. Only the project Owner can invite or promote Admin members.');
    }

    // Recipient must be an existing registered user
    const recipientUser = await User.findOne({ email: normalizedEmail });
    if (!recipientUser) {
      res.status(404);
      throw new Error(`User with email "${normalizedEmail}" is not registered on StudySync. In-app invitations require existing registered users.`);
    }

    // Check if recipient is the sender
    if (recipientUser._id.toString() === req.user._id.toString()) {
      res.status(400);
      throw new Error('You cannot invite yourself to the project.');
    }

    // Check if already a member
    const isMember = project.members.some(m => m.toString() === recipientUser._id.toString());
    if (isMember) {
      res.status(400);
      throw new Error(`User "${recipientUser.name}" (${normalizedEmail}) is already a member of this project.`);
    }

    // Check for existing pending invitation
    const existingInvite = await Invitation.findOne({
      project: projectId,
      recipient: recipientUser._id,
      status: 'Pending',
    });

    if (existingInvite) {
      if (!existingInvite.isExpired()) {
        res.status(400);
        throw new Error(`An active invitation is already pending for ${recipientUser.name}.`);
      } else {
        existingInvite.status = 'Expired';
        await existingInvite.save();
      }
    }

    // Create secure in-app invitation
    const invitation = await Invitation.create({
      project: projectId,
      sender: req.user._id,
      recipient: recipientUser._id,
      recipientEmail: normalizedEmail,
      role,
      status: 'Pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    // In-app notification
    await createNotification({
      type: 'project_invitation',
      recipientId: recipientUser._id,
      senderId: req.user._id,
      projectId: project._id,
      invitationId: invitation._id,
      message: `${req.user.name} invited you to join "${project.name}" as ${role}.`,
    });

    // Activity log
    logActivity({
      type: 'invitation_sent',
      userId: req.user._id,
      projectId: project._id,
      targetUser: recipientUser._id,
      meta: {
        recipientName: recipientUser.name,
        projectName: project.name,
        role,
      },
    });

    const populatedInvitation = await Invitation.findById(invitation._id)
      .populate('sender', 'name email avatarInitials')
      .populate('recipient', 'name email avatarInitials')
      .populate('project', 'name');

    res.status(201).json(populatedInvitation);
  } catch (error) {
    next(error);
  }
};

// @desc    Get all invitations for a project
// @route   GET /api/projects/:id/invitations
// @access  Private (Owner / Admin)
const getProjectInvitations = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404);
      throw new Error('Project not found');
    }

    const callerRole = project.getUserRole(req.user._id);
    if (!callerRole || (callerRole !== 'Owner' && callerRole !== 'Admin')) {
      res.status(403);
      throw new Error('Permission denied. Only Owner or Admins can view project invitations.');
    }

    // Mark expired pending invitations
    await Invitation.updateMany(
      {
        project: projectId,
        status: 'Pending',
        expiresAt: { $lt: new Date() },
      },
      { $set: { status: 'Expired' } }
    );

    const invitations = await Invitation.find({ project: projectId })
      .populate('sender', 'name email avatarInitials')
      .populate('recipient', 'name email avatarInitials')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(invitations);
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel an invitation
// @route   DELETE /api/projects/:id/invitations/:inviteId
// @access  Private (Owner / Admin)
const cancelInvitation = async (req, res, next) => {
  try {
    const { id: projectId, inviteId } = req.params;
    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404);
      throw new Error('Project not found');
    }

    const callerRole = project.getUserRole(req.user._id);
    if (!callerRole || (callerRole !== 'Owner' && callerRole !== 'Admin')) {
      res.status(403);
      throw new Error('Permission denied. Only Owner or Admins can cancel invitations.');
    }

    const invitation = await Invitation.findOne({ _id: inviteId, project: projectId });
    if (!invitation) {
      res.status(404);
      throw new Error('Invitation not found');
    }

    if (invitation.status !== 'Pending') {
      res.status(400);
      throw new Error(`Cannot cancel invitation with status "${invitation.status}".`);
    }

    invitation.status = 'Cancelled';
    await invitation.save();

    res.status(200).json({ message: 'Invitation cancelled', invitation });
  } catch (error) {
    next(error);
  }
};

// @desc    Get pending invitations for the logged-in user
// @route   GET /api/invitations/my
// @access  Private
const getMyInvitations = async (req, res, next) => {
  try {
    // Auto-expire outdated pending invites
    await Invitation.updateMany(
      {
        recipient: req.user._id,
        status: 'Pending',
        expiresAt: { $lt: new Date() },
      },
      { $set: { status: 'Expired' } }
    );

    const invitations = await Invitation.find({
      recipient: req.user._id,
      status: 'Pending',
    })
      .populate('project', 'name description status')
      .populate('sender', 'name email avatarInitials')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(invitations);
  } catch (error) {
    next(error);
  }
};

// @desc    Accept an invitation
// @route   POST /api/invitations/:id/accept
// @access  Private (Recipient only)
const acceptInvitation = async (req, res, next) => {
  try {
    const invitation = await Invitation.findById(req.params.id)
      .populate('project')
      .populate('sender', 'name email');

    if (!invitation) {
      res.status(404);
      throw new Error('Invitation not found');
    }

    if (invitation.recipient.toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error('Not authorized to accept this invitation.');
    }

    if (invitation.status !== 'Pending') {
      res.status(400);
      throw new Error(`Invitation is already ${invitation.status.toLowerCase()}.`);
    }

    if (invitation.isExpired()) {
      invitation.status = 'Expired';
      await invitation.save();
      res.status(400);
      throw new Error('This invitation has expired.');
    }

    const project = await Project.findById(invitation.project._id);
    if (!project) {
      res.status(404);
      throw new Error('The invited project no longer exists.');
    }

    // Add user to project if not already present
    const isMember = project.members.some(m => m.toString() === req.user._id.toString());
    if (!isMember) {
      project.members.push(req.user._id);
      
      // Ensure memberRoles has entry
      if (!project.memberRoles) project.memberRoles = [];
      project.memberRoles.push({
        user: req.user._id,
        role: invitation.role || 'Member',
        joinedAt: new Date(),
      });

      await project.save();
    }

    invitation.status = 'Accepted';
    await invitation.save();

    // Notify inviter
    await createNotification({
      type: 'invitation_accepted',
      recipientId: invitation.sender._id,
      senderId: req.user._id,
      projectId: project._id,
      message: `${req.user.name} accepted your invitation to join "${project.name}".`,
    });

    // Log Activity
    logActivity({
      type: 'invitation_accepted',
      userId: req.user._id,
      projectId: project._id,
      targetUser: invitation.sender._id,
      meta: {
        memberName: req.user.name,
        projectName: project.name,
        role: invitation.role,
      },
    });

    res.status(200).json({
      message: 'Invitation accepted successfully',
      projectId: project._id,
      project,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Decline an invitation
// @route   POST /api/invitations/:id/decline
// @access  Private (Recipient only)
const declineInvitation = async (req, res, next) => {
  try {
    const invitation = await Invitation.findById(req.params.id)
      .populate('project', 'name')
      .populate('sender', 'name email');

    if (!invitation) {
      res.status(404);
      throw new Error('Invitation not found');
    }

    if (invitation.recipient.toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error('Not authorized to decline this invitation.');
    }

    if (invitation.status !== 'Pending') {
      res.status(400);
      throw new Error(`Invitation is already ${invitation.status.toLowerCase()}.`);
    }

    invitation.status = 'Declined';
    await invitation.save();

    // Notify inviter
    if (invitation.sender) {
      await createNotification({
        type: 'invitation_declined',
        recipientId: invitation.sender._id,
        senderId: req.user._id,
        projectId: invitation.project?._id,
        message: `${req.user.name} declined the invitation to join "${invitation.project?.name || 'Project'}".`,
      });

      logActivity({
        type: 'invitation_declined',
        userId: req.user._id,
        projectId: invitation.project?._id,
        targetUser: invitation.sender._id,
        meta: {
          memberName: req.user.name,
          projectName: invitation.project?.name,
        },
      });
    }

    res.status(200).json({ message: 'Invitation declined' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  inviteUserToProject,
  getProjectInvitations,
  cancelInvitation,
  getMyInvitations,
  acceptInvitation,
  declineInvitation,
};
