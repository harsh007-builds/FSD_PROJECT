const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const validateObjectId = require('../middleware/validateObjectId');
const { getActivities, getProjectActivities } = require('../controllers/activityController');

router.get('/', protect, getActivities);
router.get('/project/:projectId', protect, getProjectActivities);

module.exports = router;
