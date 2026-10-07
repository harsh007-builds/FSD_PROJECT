const express = require('express');
const router = express.Router();
const {
  getAllTasks,
  getTaskById,
  updateTask,
  updateTaskStatus,
  deleteTask,
} = require('../controllers/taskController');
const validateObjectId = require('../middleware/validateObjectId');
const { protect } = require('../middleware/authMiddleware');

// Get all tasks (might not be used much if we get by project, but protected anyway)
router.route('/')
  .get(protect, getAllTasks);

// Tasks without projectId in the URL (for by-ID operations)
router.route('/:id')
  .get(protect, validateObjectId, getTaskById)
  .put(protect, validateObjectId, updateTask)
  .delete(protect, validateObjectId, deleteTask);

router.route('/:id/status')
  .patch(protect, validateObjectId, updateTaskStatus)
  .put(protect, validateObjectId, updateTaskStatus); // Support PUT as requested in phase instructions

module.exports = router;
