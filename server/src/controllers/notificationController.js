const Notification = require('../models/Notification');
const User = require('../models/User');
const Task = require('../models/Task');

// Map notification types to user preference keys
const TYPE_TO_PREFERENCE_MAP = {
  task_assigned: 'taskAssigned',
  task_reassigned: 'taskAssigned',
  task_status_changed: 'taskStatusChanged',
  task_completed: 'taskStatusChanged',
  project_invitation: 'projectInvitations',
  invitation_accepted: 'projectInvitations',
  invitation_declined: 'projectInvitations',
  role_changed: 'membershipChanges',
  ownership_transferred: 'membershipChanges',
  member_removed: 'membershipChanges',
  added_to_project: 'membershipChanges',
  member_left: 'membershipChanges',
  task_deadline_approaching: 'deadlineReminders',
  task_overdue: 'deadlineReminders',
};

// @desc    Get notifications for current user
// @route   GET /api/notifications
const getNotifications = async (req, res, next) => {
  try {
    const filter = { recipient: req.user._id };

    if (req.query.unread === 'true') {
      filter.read = false;
    }

    if (req.query.type) {
      filter.type = req.query.type;
    }

    const limit = parseInt(req.query.limit, 10) || 50;

    const notifications = await Notification.find(filter)
      .populate('sender', 'name email avatarInitials')
      .populate('project', 'name')
      .populate('task', 'title status dueDate priority')
      .populate('invitation', 'role status')
      .sort({ createdAt: -1 })
      .limit(limit)
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

// @desc    Delete/dismiss a single notification
// @route   DELETE /api/notifications/:id
const deleteNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      res.status(404);
      throw new Error('Notification not found');
    }

    if (notification.recipient.toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error('Not authorized to dismiss this notification');
    }

    await Notification.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Notification dismissed successfully', id: req.params.id });
  } catch (error) {
    next(error);
  }
};

// @desc    Clear all read notifications (or all if ?all=true)
// @route   DELETE /api/notifications
const clearAllReadNotifications = async (req, res, next) => {
  try {
    const filter = { recipient: req.user._id };
    if (req.query.all !== 'true') {
      filter.read = true;
    }

    const result = await Notification.deleteMany(filter);
    res.status(200).json({ message: 'Notifications cleared successfully', deletedCount: result.deletedCount });
  } catch (error) {
    next(error);
  }
};

// @desc    Get notification preferences for current user
// @route   GET /api/notifications/preferences
const getPreferences = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('notificationPreferences');
    const defaultPrefs = {
      taskAssigned: true,
      taskStatusChanged: true,
      projectInvitations: true,
      membershipChanges: true,
      deadlineReminders: true,
    };
    const preferences = { ...defaultPrefs, ...(user?.notificationPreferences?.toObject() || user?.notificationPreferences || {}) };
    res.status(200).json(preferences);
  } catch (error) {
    next(error);
  }
};

// @desc    Update notification preferences for current user
// @route   PATCH /api/notifications/preferences
const updatePreferences = async (req, res, next) => {
  try {
    const allowedKeys = ['taskAssigned', 'taskStatusChanged', 'projectInvitations', 'membershipChanges', 'deadlineReminders'];
    const update = {};
    for (const key of allowedKeys) {
      if (typeof req.body[key] === 'boolean') {
        update[`notificationPreferences.${key}`] = req.body[key];
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: update },
      { new: true }
    ).select('notificationPreferences');

    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    const defaultPrefs = {
      taskAssigned: true,
      taskStatusChanged: true,
      projectInvitations: true,
      membershipChanges: true,
      deadlineReminders: true,
    };
    const preferences = { ...defaultPrefs, ...(user.notificationPreferences?.toObject() || user.notificationPreferences || {}) };
    res.status(200).json(preferences);
  } catch (error) {
    next(error);
  }
};

// @desc    Check upcoming task deadlines and overdue tasks, generating reminders
// @route   POST /api/notifications/check-deadlines
const checkDeadlineReminders = async (req, res, next) => {
  try {
    const now = new Date();
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const past48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Find non-completed tasks with dueDate
    const tasks = await Task.find({
      status: { $ne: 'Completed' },
      dueDate: { $exists: true, $ne: null, $gte: past48h, $lte: next24h },
      assignee: { $exists: true, $ne: null }
    }).populate('project', 'name');

    let remindersSent = 0;

    for (const task of tasks) {
      const dueTime = new Date(task.dueDate).getTime();
      const diffHours = (dueTime - now.getTime()) / (1000 * 60 * 60);

      let notifType;
      let message;

      if (diffHours >= 0 && diffHours <= 24) {
        notifType = 'task_deadline_approaching';
        const hoursRemaining = Math.max(1, Math.round(diffHours));
        message = `Reminder: Task "${task.title}" is due in ${hoursRemaining} hour${hoursRemaining === 1 ? '' : 's'}.`;
      } else if (diffHours < 0 && diffHours >= -48) {
        notifType = 'task_overdue';
        message = `Urgent: Task "${task.title}" is overdue!`;
      }

      if (notifType) {
        const created = await createNotification({
          type: notifType,
          recipientId: task.assignee,
          projectId: task.project?._id || task.project,
          taskId: task._id,
          message,
          meta: { dueDate: task.dueDate }
        });
        if (created) remindersSent++;
      }
    }

    res.status(200).json({ tasksChecked: tasks.length, remindersSent });
  } catch (error) {
    next(error);
  }
};

// Helper: create notification (called from controllers or internal routines)
const createNotification = async ({
  type,
  recipientId,
  senderId,
  projectId,
  taskId,
  invitationId,
  message,
  meta,
}) => {
  try {
    if (!recipientId || !type || !message) return null;

    // 1. Self-suppression: Don't notify yourself
    if (senderId && recipientId.toString() === senderId.toString()) {
      return null;
    }

    // 2. Check recipient preferences
    const prefKey = TYPE_TO_PREFERENCE_MAP[type];
    if (prefKey) {
      const recipient = await User.findById(recipientId).select('notificationPreferences').lean();
      if (recipient?.notificationPreferences && recipient.notificationPreferences[prefKey] === false) {
        return null; // Suppressed by user preference
      }
    }

    // 3. Deduplication check
    // For deadline reminders, prevent duplicate in last 24h. For other events, prevent duplicate in last 5 min.
    const cooldownMs = (type === 'task_deadline_approaching' || type === 'task_overdue') 
      ? 24 * 60 * 60 * 1000 
      : 5 * 60 * 1000;
    const cooldownDate = new Date(Date.now() - cooldownMs);

    const dupQuery = {
      recipient: recipientId,
      type,
      createdAt: { $gte: cooldownDate },
    };
    if (projectId) dupQuery.project = projectId;
    if (taskId) dupQuery.task = taskId;
    if (invitationId) dupQuery.invitation = invitationId;

    const existing = await Notification.findOne(dupQuery);
    if (existing) {
      return null; // Duplicate prevented
    }

    // 4. Create and persist
    const notification = await Notification.create({
      type,
      recipient: recipientId,
      sender: senderId || undefined,
      project: projectId || undefined,
      task: taskId || undefined,
      invitation: invitationId || undefined,
      message,
      meta,
    });

    // 5. Populate for response and real-time emit
    const populated = await Notification.findById(notification._id)
      .populate('sender', 'name email avatarInitials')
      .populate('project', 'name')
      .populate('task', 'title status dueDate priority')
      .populate('invitation', 'role status')
      .lean();

    // 6. Real-time Socket.IO emission
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      io.to(`user_${recipientId}`).emit('notification:new', populated);
    } catch (socketErr) {
      // Socket not active or unit test environment
    }

    return populated;
  } catch (err) {
    console.error('Failed to create notification:', err.message);
    return null;
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllReadNotifications,
  getPreferences,
  updatePreferences,
  checkDeadlineReminders,
  createNotification,
};
