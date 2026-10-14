const express = require('express');
const router = express.Router({ mergeParams: true });
const { protect } = require('../middleware/authMiddleware');
const {
  getNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
  restoreRevision,
} = require('../controllers/noteController');

// All note routes require authentication
router.use(protect);

router
  .route('/')
  .get(getNotes)
  .post(createNote);

router
  .route('/:noteId')
  .get(getNoteById)
  .put(updateNote)
  .delete(deleteNote);

router.post('/:noteId/restore/:revisionVersion', restoreRevision);

module.exports = router;
