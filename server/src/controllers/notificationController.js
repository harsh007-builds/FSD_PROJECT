const Notification = require('../models/Notification');
const Project = require('../models/Project');

// @desc    Get notifications for current user
// @route   GET /api/notifications
const getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .populate('sender', 'name email avatarInitials')
      .populate('project', 'name')
      .populate('task', 'title')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    res.status(200).json(notifications);
  } catch (error) {
    next(error);
  }
};

// @desc    Get unread notification count
// @route   GET /api/notifications/unread-count
const getUnreadCount = async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.user._id, read: false });
    res.status(200).json({ count });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark notification as read
// @route   PATCH /api/notifications/:id/read
const markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      res.status(404);
      throw new Error('Notification not found');
    }

    if (notification.recipient.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error('Not authorized');
    }

    notification.read = true;
    await notification.save();
    res.status(200).json(notification);
  } catch (error) {
    next(error);
  }
};

// @desc    Mark all notifications as read
// @route   PATCH /api/notifications/read-all
const markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, read: false },
      { $set: { read: true } }
    );
    res.status(200).json({ message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
};

// Helper: create notification (called from other controllers)
const createNotification = async ({ type, recipientId, senderId, projectId, taskId, message }) => {
  try {
    // Don't notify yourself
    if (recipientId && senderId && recipientId.toString() === senderId.toString()) return;

    await Notification.create({
      type,
      recipient: recipientId,
      sender: senderId,
      project: projectId,
      task: taskId,
      message,
    });
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  createNotification,
};
