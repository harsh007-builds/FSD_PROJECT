const express = require('express');
const router = express.Router({ mergeParams: true });
const { protect } = require('../middleware/authMiddleware');
const {
  getSessions,
  getSessionById,
  createSession,
  updateSession,
  updateTimer,
  toggleGoal,
  joinSession,
  deleteSession,
} = require('../controllers/sessionController');

// All session routes require authentication
router.use(protect);

router
  .route('/')
  .get(getSessions)
  .post(createSession);

router
  .route('/:sessionId')
  .get(getSessionById)
  .put(updateSession)
  .delete(deleteSession);

router.post('/:sessionId/timer', updateTimer);
router.patch('/:sessionId/goals/:goalId', toggleGoal);
router.post('/:sessionId/join', joinSession);

module.exports = router;
