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
} = require('../controllers/notificationController');

// Collection routes
router.route('/')
  .get(protect, getNotifications)
  .delete(protect, clearAllReadNotifications);

router.get('/unread-count', protect, getUnreadCount);

// Preferences routes
router.route('/preferences')
  .get(protect, getPreferences)
  .patch(protect, updatePreferences);

// Deadline reminder sweep route
router.post('/check-deadlines', protect, checkDeadlineReminders);

// Read all
router.patch('/read-all', protect, markAllAsRead);

// Item routes
router.patch('/:id/read', protect, validateObjectId, markAsRead);
router.delete('/:id', protect, validateObjectId, deleteNotification);

module.exports = router;
