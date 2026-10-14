const express = require('express');
const router = express.Router({ mergeParams: true });
const { protect } = require('../middleware/authMiddleware');
const { handleSingleUpload } = require('../middleware/uploadMiddleware');
const {
  getResources,
  createResource,
  getResourceById,
  downloadResource,
  previewResource,
  updateResource,
  deleteResource,
} = require('../controllers/resourceController');

// All resource routes require authentication
router.use(protect);

router
  .route('/')
  .get(getResources)
  .post(handleSingleUpload('file'), createResource);

router
  .route('/:resourceId')
  .get(getResourceById)
  .patch(updateResource)
  .delete(deleteResource);

router.get('/:resourceId/download', downloadResource);
router.get('/:resourceId/preview', previewResource);

module.exports = router;
