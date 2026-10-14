const express = require('express');
const router = express.Router();
const {
  getAllTasks,
  getTaskById,
  updateTask,
  updateTaskStatus,
  deleteTask,
  addComment,
  deleteComment,
} = require('../controllers/taskController');
const validateObjectId = require('../middleware/validateObjectId');
const { protect } = require('../middleware/authMiddleware');
const { getMyTasks } = require('../controllers/searchController');

// My Tasks view
router.get('/my-tasks', protect, getMyTasks);

// Get all tasks
router.route('/')
  .get(protect, getAllTasks);

// Tasks without projectId in the URL (for by-ID operations)
router.route('/:id')
  .get(protect, validateObjectId, getTaskById)
  .put(protect, validateObjectId, updateTask)
  .delete(protect, validateObjectId, deleteTask);

router.route('/:id/status')
  .patch(protect, validateObjectId, updateTaskStatus)
  .put(protect, validateObjectId, updateTaskStatus);

// Comments architecture
router.route('/:id/comments')
  .post(protect, validateObjectId, addComment);

router.route('/:id/comments/:commentId')
  .delete(protect, validateObjectId, deleteComment);

module.exports = router;
