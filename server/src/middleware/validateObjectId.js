const mongoose = require('mongoose');

// Middleware to validate MongoDB ObjectId
const validateObjectId = (req, res, next) => {
  const idsToCheck = [req.params.id, req.params.projectId].filter(Boolean);

  for (const id of idsToCheck) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ID format: ${id}`,
        error: 'Invalid ObjectId',
      });
    }
  }

  next();
};

module.exports = validateObjectId;
