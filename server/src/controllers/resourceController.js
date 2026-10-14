const mongoose = require('mongoose');
const Resource = require('../models/Resource');
const Project = require('../models/Project');
const { uploadFile, getFileInfo, getDownloadStream, deleteFile } = require('../services/storageService');
const { detectCategory } = require('../middleware/uploadMiddleware');
const { logActivity } = require('./activityController');

/**
 * Helper to check project membership and determine user role.
 * @returns {Promise<{ isAuthorized: boolean, role: string|null, project: Object|null }>}
 */
const verifyProjectMembership = async (projectId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    return { isAuthorized: false, role: null, project: null };
  }

  const project = await Project.findById(projectId);
  if (!project) {
    return { isAuthorized: false, role: null, project: null };
  }

  const userIdStr = userId.toString();
  const isOwner = project.owner.toString() === userIdStr;

  if (isOwner) {
    return { isAuthorized: true, role: 'Owner', project };
  }

  const isMember = project.members.some((m) => m.toString() === userIdStr);
  if (!isMember) {
    return { isAuthorized: false, role: null, project };
  }

  // Check custom member role in membersList
  const memberEntry = (project.membersList || []).find(
    (m) => m.user && m.user.toString() === userIdStr
  );
  const role = memberEntry ? memberEntry.role : 'Member';

  return { isAuthorized: true, role, project };
};

// Safe regex helper to avoid ReDoS or syntax errors
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * @desc    Get all resources for a project with search, category filters, and pagination
 * @route   GET /api/projects/:projectId/resources
 */
const getResources = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    if (!isAuthorized) {
      return res.status(403).json({ message: 'Not authorized to access resources for this project' });
    }

    const {
      search,
      category,
      type,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
    } = req.query;

    const filter = { project: projectId };

    // Search query
    if (search && search.trim()) {
      const escaped = escapeRegex(search.trim());
      filter.$or = [
        { title: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } },
        { tags: { $regex: escaped, $options: 'i' } },
        { 'file.originalName': { $regex: escaped, $options: 'i' } },
        { url: { $regex: escaped, $options: 'i' } },
      ];
    }

    // Category filter
    if (category && category !== 'all') {
      filter.category = category;
    }

    // Type filter ('file' or 'link')
    if (type && ['file', 'link'].includes(type)) {
      filter.type = type;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Sorting definition
    let sortDef = { createdAt: -1 };
    const order = sortOrder === 'asc' ? 1 : -1;
    if (sortBy === 'title') {
      sortDef = { title: order };
    } else if (sortBy === 'size') {
      sortDef = { 'file.size': order };
    } else if (sortBy === 'category') {
      sortDef = { category: order };
    } else {
      sortDef = { createdAt: order };
    }

    const [resources, total, categoryCounts] = await Promise.all([
      Resource.find(filter)
        .populate('uploader', 'name email avatarInitials')
        .sort(sortDef)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Resource.countDocuments(filter),
      // Aggregate category counts for the project
      Resource.aggregate([
        { $match: { project: new mongoose.Types.ObjectId(projectId) } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
    ]);

    // Format category summary
    const categoriesMap = {
      all: 0,
      Document: 0,
      Image: 0,
      Code: 0,
      'Video/Audio': 0,
      Link: 0,
      Other: 0,
    };
    categoryCounts.forEach((c) => {
      if (c._id && categoriesMap[c._id] !== undefined) {
        categoriesMap[c._id] = c.count;
      }
      categoriesMap.all += c.count;
    });

    res.status(200).json({
      resources,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      hasMore: pageNum * limitNum < total,
      categories: categoriesMap,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Upload a new file or create an external resource link
 * @route   POST /api/projects/:projectId/resources
 */
const createResource = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    if (!isAuthorized) {
      return res.status(403).json({ message: 'Not authorized to add resources to this project' });
    }

    const {
      title,
      description = '',
      type = 'file',
      category: explicitCategory,
      url,
      tags = [],
    } = req.body;

    let parsedTags = [];
    if (Array.isArray(tags)) {
      parsedTags = tags.map((t) => String(t).trim()).filter(Boolean);
    } else if (typeof tags === 'string') {
      parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean);
    }

    // 1. LINK RESOURCE
    if (type === 'link') {
      if (!url || !url.trim()) {
        return res.status(400).json({ message: 'Valid resource URL is required for link resources' });
      }

      const trimmedUrl = url.trim();
      if (!/^https?:\/\//i.test(trimmedUrl)) {
        return res.status(400).json({ message: 'Resource URL must start with http:// or https://' });
      }

      const linkTitle = (title && title.trim()) || trimmedUrl;

      const resource = await Resource.create({
        project: projectId,
        uploader: req.user._id,
        title: linkTitle,
        description: description.trim(),
        type: 'link',
        category: explicitCategory || 'Link',
        url: trimmedUrl,
        tags: parsedTags,
      });

      const populated = await Resource.findById(resource._id)
        .populate('uploader', 'name email avatarInitials')
        .lean();

      // Activity logging
      await logActivity({
        type: 'resource_created',
        userId: req.user._id,
        projectId,
        resourceId: resource._id,
        meta: {
          resourceTitle: linkTitle,
          resourceType: 'link',
          category: resource.category,
        },
      });

      return res.status(201).json(populated);
    }

    // 2. FILE RESOURCE
    if (type === 'file') {
      if (!req.file) {
        return res.status(400).json({ message: 'No file provided for file resource' });
      }

      // Upload file to persistent GridFS storage
      const uploadResult = await uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        {
          projectId,
          uploaderId: req.user._id,
        }
      );

      const detectedCat = detectCategory(req.file.originalname, req.file.mimetype);
      const resourceCategory = explicitCategory || detectedCat;
      const fileTitle = (title && title.trim()) || req.file.originalname;

      const resource = await Resource.create({
        project: projectId,
        uploader: req.user._id,
        title: fileTitle,
        description: description.trim(),
        type: 'file',
        category: resourceCategory,
        file: {
          storageProvider: 'gridfs',
          fileId: uploadResult.fileId,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
          checksum: uploadResult.checksum,
        },
        tags: parsedTags,
      });

      const populated = await Resource.findById(resource._id)
        .populate('uploader', 'name email avatarInitials')
        .lean();

      // Activity logging
      await logActivity({
        type: 'resource_uploaded',
        userId: req.user._id,
        projectId,
        resourceId: resource._id,
        meta: {
          resourceTitle: fileTitle,
          resourceType: 'file',
          fileName: req.file.originalname,
          fileSize: req.file.size,
          category: resource.category,
        },
      });

      return res.status(201).json(populated);
    }

    return res.status(400).json({ message: 'Invalid resource type. Must be "file" or "link".' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single resource by ID
 * @route   GET /api/projects/:projectId/resources/:resourceId
 */
const getResourceById = async (req, res, next) => {
  try {
    const { projectId, resourceId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    const resource = await Resource.findOne({ _id: resourceId, project: projectId })
      .populate('uploader', 'name email avatarInitials')
      .lean();

    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    res.status(200).json(resource);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Download a file resource with authorized access
 * @route   GET /api/projects/:projectId/resources/:resourceId/download
 */
const downloadResource = async (req, res, next) => {
  try {
    const { projectId, resourceId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) {
      return res.status(403).json({ message: 'Not authorized to download resources from this project' });
    }

    const resource = await Resource.findOne({ _id: resourceId, project: projectId });
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    if (resource.type === 'link') {
      return res.redirect(resource.url);
    }

    if (!resource.file || !resource.file.fileId) {
      return res.status(404).json({ message: 'File attachment not found for this resource' });
    }

    const fileInfo = await getFileInfo(resource.file.fileId);
    if (!fileInfo) {
      return res.status(404).json({ message: 'File data missing in storage' });
    }

    const filename = resource.file.originalName || resource.title || 'downloaded_file';
    const mimeType = resource.file.mimeType || 'application/octet-stream';

    // Headers for forced attachment download
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader('Content-Length', fileInfo.length || resource.file.size);

    const downloadStream = getDownloadStream(resource.file.fileId);
    downloadStream.on('error', (err) => {
      console.error('GridFS stream error during download:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to stream file data' });
      }
    });

    downloadStream.pipe(res);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Preview a file resource inline (supporting range requests for PDF/video/audio)
 * @route   GET /api/projects/:projectId/resources/:resourceId/preview
 */
const previewResource = async (req, res, next) => {
  try {
    const { projectId, resourceId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) {
      return res.status(403).json({ message: 'Not authorized to preview resources from this project' });
    }

    const resource = await Resource.findOne({ _id: resourceId, project: projectId });
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    if (resource.type === 'link') {
      return res.status(200).json({ previewType: 'link', url: resource.url });
    }

    if (!resource.file || !resource.file.fileId) {
      return res.status(404).json({ message: 'File attachment not found' });
    }

    const fileInfo = await getFileInfo(resource.file.fileId);
    if (!fileInfo) {
      return res.status(404).json({ message: 'File data missing in storage' });
    }

    const totalSize = fileInfo.length;
    const mimeType = resource.file.mimeType || 'application/octet-stream';
    const filename = resource.file.originalName || resource.title;

    // Check for HTTP Range Header (useful for seeking audio/video and partial PDF loading)
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).send('Requested range not satisfiable');
      }

      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', chunkSize);
      res.setHeader('Content-Type', mimeType);

      const stream = getDownloadStream(resource.file.fileId, { start, end: end + 1 });
      stream.on('error', (err) => {
        if (!res.headersSent) res.status(500).json({ message: 'Stream error' });
      });
      return stream.pipe(res);
    }

    // Standard inline preview
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', totalSize);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    const stream = getDownloadStream(resource.file.fileId);
    stream.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ message: 'Stream error' });
    });
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update resource metadata (title, category, description, tags, link url)
 * @route   PATCH /api/projects/:projectId/resources/:resourceId
 */
const updateResource = async (req, res, next) => {
  try {
    const { projectId, resourceId } = req.params;
    const { isAuthorized, role, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    const resource = await Resource.findOne({ _id: resourceId, project: projectId });
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    // Check permission: Owner, Admin, or the uploader can edit
    const isOwnerOrAdmin = role === 'Owner' || role === 'Admin';
    const isUploader = resource.uploader.toString() === req.user._id.toString();

    if (!isOwnerOrAdmin && !isUploader) {
      return res.status(403).json({ message: 'You do not have permission to edit this resource' });
    }

    const { title, description, category, tags, url } = req.body;
    const oldTitle = resource.title;

    if (title !== undefined && title.trim()) {
      resource.title = title.trim();
    }
    if (description !== undefined) {
      resource.description = description.trim();
    }
    if (category && ['Document', 'Image', 'Code', 'Video/Audio', 'Link', 'Other'].includes(category)) {
      resource.category = category;
    }
    if (tags !== undefined) {
      if (Array.isArray(tags)) {
        resource.tags = tags.map((t) => String(t).trim()).filter(Boolean);
      } else if (typeof tags === 'string') {
        resource.tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
      }
    }
    if (resource.type === 'link' && url !== undefined && url.trim()) {
      const trimmedUrl = url.trim();
      if (!/^https?:\/\//i.test(trimmedUrl)) {
        return res.status(400).json({ message: 'Resource URL must start with http:// or https://' });
      }
      resource.url = trimmedUrl;
    }

    await resource.save();

    const populated = await Resource.findById(resource._id)
      .populate('uploader', 'name email avatarInitials')
      .lean();

    // Activity logging
    await logActivity({
      type: 'resource_updated',
      userId: req.user._id,
      projectId,
      resourceId: resource._id,
      meta: {
        resourceTitle: resource.title,
        oldTitle: oldTitle !== resource.title ? oldTitle : undefined,
        category: resource.category,
      },
    });

    res.status(200).json(populated);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a resource and its stored file
 * @route   DELETE /api/projects/:projectId/resources/:resourceId
 */
const deleteResource = async (req, res, next) => {
  try {
    const { projectId, resourceId } = req.params;
    const { isAuthorized, role, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    const resource = await Resource.findOne({ _id: resourceId, project: projectId });
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    // Check permission: Owner, Admin, or the uploader can delete
    const isOwnerOrAdmin = role === 'Owner' || role === 'Admin';
    const isUploader = resource.uploader.toString() === req.user._id.toString();

    if (!isOwnerOrAdmin && !isUploader) {
      return res.status(403).json({ message: 'You do not have permission to delete this resource' });
    }

    const resourceTitle = resource.title;
    const resourceCategory = resource.category;

    // Delete stored binary file from GridFS if it's a file
    if (resource.type === 'file' && resource.file && resource.file.fileId) {
      await deleteFile(resource.file.fileId);
    }

    await Resource.deleteOne({ _id: resourceId });

    // Activity logging
    await logActivity({
      type: 'resource_deleted',
      userId: req.user._id,
      projectId,
      meta: {
        resourceTitle,
        category: resourceCategory,
      },
    });

    res.status(200).json({
      message: 'Resource deleted successfully',
      id: resourceId,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getResources,
  createResource,
  getResourceById,
  downloadResource,
  previewResource,
  updateResource,
  deleteResource,
  verifyProjectMembership,
};
