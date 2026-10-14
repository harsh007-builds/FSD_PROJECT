const mongoose = require('mongoose');
const Message = require('../models/Message');
const Project = require('../models/Project');

/**
 * Helper to check project membership and determine user role.
 * @returns {Promise<{ isAuthorized: boolean, role: string|null, project: Object|null }>}
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

  // Check custom member role in membersList
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
 * Helper to emit socket event safely
 */
const emitSocketEvent = (projectId, event, data) => {
  try {
    const { getIO } = require('../socket');
    const io = getIO();
    if (io && projectId) {
      io.to(`project_${projectId}`).emit(event, data);
    }
  } catch (err) {
    // Socket not initialized in tests or disconnected
  }
};

/**
 * @desc    Get project message history with cursor-based or incremental loading
 * @route   GET /api/projects/:projectId/messages
 */
const getMessages = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    if (!isAuthorized) {
      return res.status(403).json({ message: 'Not authorized to view messages for this project' });
    }

    const {
      limit = 30,
      before,
      after,
      search,
    } = req.query;

    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 30));
    const filter = { project: projectId };

    // Search query
    if (search && search.trim()) {
      filter.content = { $regex: escapeRegex(search.trim()), $options: 'i' };
    }

    // Cursor pagination (before = older messages, after = newer messages)
    if (before) {
      if (mongoose.Types.ObjectId.isValid(before)) {
        filter._id = { $lt: new mongoose.Types.ObjectId(before) };
      } else if (!isNaN(new Date(before).getTime())) {
        filter.createdAt = { $lt: new Date(before) };
      }
    } else if (after) {
      if (mongoose.Types.ObjectId.isValid(after)) {
        filter._id = { $gt: new mongoose.Types.ObjectId(after) };
      } else if (!isNaN(new Date(after).getTime())) {
        filter.createdAt = { $gt: new Date(after) };
      }
    }

    // Fetch messages (sorted newest first to slice accurately, then inverted for chronological display)
    const rawMessages = await Message.find(filter)
      .populate('sender', 'name email avatarInitials')
      .populate({
        path: 'replyTo',
        select: 'content sender createdAt isEdited',
        populate: { path: 'sender', select: 'name email avatarInitials' },
      })
      .sort({ createdAt: -1 })
      .limit(limitNum + 1)
      .lean();

    const hasMore = rawMessages.length > limitNum;
    const items = hasMore ? rawMessages.slice(0, limitNum) : rawMessages;

    // Invert to chronological order: oldest -> newest
    const messages = items.reverse();

    // Calculate unread count for current user
    const [unreadCount, totalCount] = await Promise.all([
      Message.countDocuments({
        project: projectId,
        sender: { $ne: req.user._id },
        'readBy.user': { $ne: req.user._id },
      }),
      Message.countDocuments({ project: projectId }),
    ]);

    res.status(200).json({
      messages,
      hasMore,
      limit: limitNum,
      unreadCount,
      total: totalCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Send a message in the project discussion
 * @route   POST /api/projects/:projectId/messages
 */
const sendMessage = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    if (!isAuthorized) {
      return res.status(403).json({ message: 'Not authorized to send messages in this project' });
    }

    const { content, replyTo, attachments } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Message content cannot be empty' });
    }

    if (content.trim().length > 4000) {
      return res.status(400).json({ message: 'Message cannot exceed 4000 characters' });
    }

    // Validate replyTo if provided
    let validReplyTo = null;
    if (replyTo) {
      if (mongoose.Types.ObjectId.isValid(replyTo)) {
        const parentMsg = await Message.findOne({ _id: replyTo, project: projectId });
        if (parentMsg) {
          validReplyTo = parentMsg._id;
        }
      }
    }

    const message = await Message.create({
      project: projectId,
      sender: req.user._id,
      content: content.trim(),
      replyTo: validReplyTo,
      attachments: Array.isArray(attachments) ? attachments : [],
      readBy: [{ user: req.user._id, readAt: new Date() }],
    });

    const populated = await Message.findById(message._id)
      .populate('sender', 'name email avatarInitials')
      .populate({
        path: 'replyTo',
        select: 'content sender createdAt isEdited',
        populate: { path: 'sender', select: 'name email avatarInitials' },
      })
      .lean();

    // Real-time broadcast
    emitSocketEvent(projectId, 'message:new', populated);

    res.status(201).json(populated);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Edit a previously sent message
 * @route   PATCH /api/projects/:projectId/messages/:messageId
 */
const updateMessage = async (req, res, next) => {
  try {
    const { projectId, messageId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    const message = await Message.findOne({ _id: messageId, project: projectId });
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Only the original author can edit their message
    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only edit your own messages' });
    }

    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Message content cannot be empty' });
    }
    if (content.trim().length > 4000) {
      return res.status(400).json({ message: 'Message cannot exceed 4000 characters' });
    }

    message.content = content.trim();
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    const populated = await Message.findById(message._id)
      .populate('sender', 'name email avatarInitials')
      .populate({
        path: 'replyTo',
        select: 'content sender createdAt isEdited',
        populate: { path: 'sender', select: 'name email avatarInitials' },
      })
      .lean();

    // Real-time broadcast
    emitSocketEvent(projectId, 'message:updated', populated);

    res.status(200).json(populated);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a message
 * @route   DELETE /api/projects/:projectId/messages/:messageId
 */
const deleteMessage = async (req, res, next) => {
  try {
    const { projectId, messageId } = req.params;
    const { isAuthorized, role, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    const message = await Message.findOne({ _id: messageId, project: projectId });
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Permitted if author OR Project Owner OR Admin
    const isAuthor = message.sender.toString() === req.user._id.toString();
    const canModerate = role === 'Owner' || role === 'Admin';

    if (!isAuthor && !canModerate) {
      return res.status(403).json({ message: 'You do not have permission to delete this message' });
    }

    await Message.deleteOne({ _id: messageId });

    // Real-time broadcast
    emitSocketEvent(projectId, 'message:deleted', { messageId, projectId });

    res.status(200).json({
      message: 'Message deleted successfully',
      messageId,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark all unread messages in a project as read by the current user
 * @route   POST /api/projects/:projectId/messages/read
 */
const markMessagesAsRead = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    const result = await Message.updateMany(
      {
        project: projectId,
        sender: { $ne: req.user._id },
        'readBy.user': { $ne: req.user._id },
      },
      {
        $push: {
          readBy: {
            user: req.user._id,
            readAt: new Date(),
          },
        },
      }
    );

    emitSocketEvent(projectId, 'message:read', {
      projectId,
      userId: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: 'Messages marked as read',
      markedCount: result.modifiedCount || 0,
      modifiedCount: result.modifiedCount || 0,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get unread message count for a project
 * @route   GET /api/projects/:projectId/messages/unread-count
 */
const getUnreadCount = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    const count = await Message.countDocuments({
      project: projectId,
      sender: { $ne: req.user._id },
      'readBy.user': { $ne: req.user._id },
    });

    res.status(200).json({ unreadCount: count, count });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMessages,
  sendMessage,
  updateMessage,
  deleteMessage,
  markMessagesAsRead,
  getUnreadCount,
};
