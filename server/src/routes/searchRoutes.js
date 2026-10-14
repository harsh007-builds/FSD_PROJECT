const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const validateObjectId = require('../middleware/validateObjectId');
const {
  globalSearch,
  getMyTasks,
  getSavedFilters,
  createSavedFilter,
  deleteSavedFilter,
} = require('../controllers/searchController');

// Global search
router.get('/', protect, globalSearch);

// My Tasks view
router.get('/my-tasks', protect, getMyTasks);

// Saved filter presets
router.route('/saved-filters')
  .get(protect, getSavedFilters)
  .post(protect, createSavedFilter);

router.delete('/saved-filters/:id', protect, validateObjectId, deleteSavedFilter);

module.exports = router;
