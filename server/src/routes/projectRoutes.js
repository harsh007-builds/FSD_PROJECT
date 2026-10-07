const express = require('express');
const router = express.Router();
const {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  addMember
} = require('../controllers/projectController');
const {
  getTasks,
  createTask
} = require('../controllers/taskController');
const { getProjectWorkspace } = require('../controllers/workspaceController');
const validateObjectId = require('../middleware/validateObjectId');
const { protect } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, getProjects)
  .post(protect, createProject);

router.route('/:id')
  .get(protect, validateObjectId, getProjectById)
  .put(protect, validateObjectId, updateProject)
  .delete(protect, validateObjectId, deleteProject);

router.route('/:id/members')
  .post(protect, validateObjectId, addMember);

router.route('/:id/workspace')
  .get(protect, validateObjectId, getProjectWorkspace);

// Nested routes for tasks belonging to a project
router.route('/:projectId/tasks')
  .get(protect, validateObjectId, getTasks)
  .post(protect, validateObjectId, createTask);

module.exports = router;
