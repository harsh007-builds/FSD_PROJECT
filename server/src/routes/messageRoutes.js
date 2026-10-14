const express = require('express');
const router = express.Router({ mergeParams: true });
const { protect } = require('../middleware/authMiddleware');
const {
  getMessages,
  sendMessage,
  updateMessage,
  deleteMessage,
  markMessagesAsRead,
  getUnreadCount,
} = require('../controllers/messageController');

// All message routes require authentication
router.use(protect);

router
  .route('/')
  .get(getMessages)
  .post(sendMessage);

router.post('/read', markMessagesAsRead);
router.get('/unread-count', getUnreadCount);

router
  .route('/:messageId')
  .patch(updateMessage)
  .delete(deleteMessage);

module.exports = router;
