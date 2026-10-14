const express = require('express');
const router = express.Router();
const {
  getMyInvitations,
  acceptInvitation,
  declineInvitation,
} = require('../controllers/invitationController');
const { protect } = require('../middleware/authMiddleware');
const validateObjectId = require('../middleware/validateObjectId');

router.get('/my', protect, getMyInvitations);
router.post('/:id/accept', protect, validateObjectId, acceptInvitation);
router.post('/:id/decline', protect, validateObjectId, declineInvitation);

module.exports = router;
