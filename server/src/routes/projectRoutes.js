const express = require('express');
const router = express.Router();
const {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  archiveProject,
  addMember,
  removeMember,
  leaveProject,
  updateMemberRole,
  transferOwnership,
} = require('../controllers/projectController');
const {
  inviteUserToProject,
  getProjectInvitations,
  cancelInvitation,
} = require('../controllers/invitationController');
const {
  getTasks,
  createTask
} = require('../controllers/taskController');
const { getProjectActivities } = require('../controllers/activityController');
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

router.route('/:id/archive')
  .patch(protect, validateObjectId, archiveProject);

router.route('/:id/members')
  .post(protect, validateObjectId, addMember);

router.route('/:id/members/:userId')
  .delete(protect, validateObjectId, removeMember);

router.route('/:id/members/:userId/role')
  .patch(protect, validateObjectId, updateMemberRole);

router.route('/:id/transfer-ownership')
  .post(protect, validateObjectId, transferOwnership);

router.route('/:id/invitations')
  .get(protect, validateObjectId, getProjectInvitations)
  .post(protect, validateObjectId, inviteUserToProject);

router.route('/:id/invitations/:inviteId')
  .delete(protect, validateObjectId, cancelInvitation);

router.route('/:id/leave')
  .post(protect, validateObjectId, leaveProject);

router.route('/:id/workspace')
  .get(protect, validateObjectId, getProjectWorkspace);

router.route('/:id/activities')
  .get(protect, validateObjectId, getProjectActivities);

const resourceRoutes = require('./resourceRoutes');

// Nested routes for tasks belonging to a project
router.route('/:projectId/tasks')
  .get(protect, validateObjectId, getTasks)
  .post(protect, validateObjectId, createTask);

// Nested routes for project resources & files
router.use('/:projectId/resources', resourceRoutes);

const messageRoutes = require('./messageRoutes');

// Nested routes for project messages & discussions
router.use('/:projectId/messages', messageRoutes);

const noteRoutes = require('./noteRoutes');

// Nested routes for project study notes
router.use('/:projectId/notes', noteRoutes);

const sessionRoutes = require('./sessionRoutes');

// Nested routes for project study sessions & rooms
router.use('/:projectId/sessions', sessionRoutes);

module.exports = router;


