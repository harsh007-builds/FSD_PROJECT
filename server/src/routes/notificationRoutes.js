const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const validateObjectId = require('../middleware/validateObjectId');
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllReadNotifications,
  getPreferences,
  updatePreferences,
  checkDeadlineReminders,
  triggerProcessDeadlines,
  sendTestEmail,
  getDeadlineHistory,
} = require('../controllers/notificationController');

// Middleware that allows either a valid CRON_SECRET or user JWT
const cronOrProtect = (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers['x-cron-secret'] || req.query.secret;
  if (secret && provided === secret) {
    return next();
  }
  return protect(req, res, next);
};

// Collection routes
router.route('/')
  .get(protect, getNotifications)
  .delete(protect, clearAllReadNotifications);

router.get('/unread-count', protect, getUnreadCount);

// Preferences routes
router.route('/preferences')
  .get(protect, getPreferences)
  .patch(protect, updatePreferences);

// Deadline reminder background sweep / cron triggers
router.post('/check-deadlines', protect, checkDeadlineReminders);
router.post('/process-deadlines', cronOrProtect, triggerProcessDeadlines);

// Live test email trigger
router.post('/test-email', protect, sendTestEmail);

// Audit history for deadline reminders
router.get('/deadline-history', protect, getDeadlineHistory);

// Read all
router.patch('/read-all', protect, markAllAsRead);

// Item routes
router.patch('/:id/read', protect, validateObjectId, markAsRead);
router.delete('/:id', protect, validateObjectId, deleteNotification);

module.exports = router;
