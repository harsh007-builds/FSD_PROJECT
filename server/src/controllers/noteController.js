const mongoose = require('mongoose');
const Note = require('../models/Note');
const Project = require('../models/Project');
const { logActivity } = require('./activityController');

/**
 * Verify if a user is a member or owner of the project
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

  const memberEntry = (project.membersList || []).find(
    (m) => m.user && m.user.toString() === userIdStr
  );
  const role = memberEntry ? memberEntry.role : 'Member';

  return { isAuthorized: true, role, project };
};

// Safe regex helper
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Safely broadcast an event to the project's socket room
 */
const emitSocketEvent = (projectId, event, data) => {
  try {
    const { getIO } = require('../socket');
    const io = getIO();
    if (io && projectId) {
      io.to(`project_${projectId}`).emit(event, data);
    }
  } catch (err) {
    // Socket not initialized or non-socket environment
  }
};

/**
 * @desc    Get all notes for a project with search, category filtering & sorting
 * @route   GET /api/projects/:projectId/notes
 */
const getNotes = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    if (!isAuthorized) {
      return res.status(403).json({ message: 'Not authorized to view notes in this project' });
    }

    const {
      search,
      category,
      tag,
      pinned,
      sortBy = 'updatedAt',
      sortOrder = 'desc',
      page = 1,
      limit = 50,
    } = req.query;

    const filter = { project: projectId };

    // Search query matching title, content, or tags
    if (search && search.trim()) {
      const reg = new RegExp(escapeRegex(search.trim()), 'i');
      filter.$or = [
        { title: reg },
        { content: reg },
        { tags: { $in: [reg] } },
      ];
    }

    // Category filter
    if (category && category !== 'All') {
      filter.category = category;
    }

    // Tag filter
    if (tag && tag.trim()) {
      filter.tags = tag.trim();
    }

    // Pinned filter
    if (pinned !== undefined) {
      filter.isPinned = pinned === 'true';
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    // Sorting definition (pinned notes always prioritized first)
    const order = sortOrder === 'asc' ? 1 : -1;
    const sort = { isPinned: -1 };
    if (sortBy === 'title') {
      sort.title = order;
    } else if (sortBy === 'createdAt') {
      sort.createdAt = order;
    } else if (sortBy === 'version') {
      sort.version = order;
    } else {
      sort.updatedAt = order;
    }

    const [notes, total, distinctCategories, distinctTags] = await Promise.all([
      Note.find(filter)
        .select('-revisions.content') // Exclude full revision history content in list view for performance
        .populate('creator', 'name email avatarInitials')
        .populate('lastEditor', 'name email avatarInitials')
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Note.countDocuments(filter),
      Note.distinct('category', { project: projectId }),
      Note.distinct('tags', { project: projectId }),
    ]);

    res.status(200).json({
      notes,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      hasMore: pageNum * limitNum < total,
      categories: distinctCategories.filter(Boolean),
      tags: distinctTags.filter(Boolean),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single note by ID with full revision history
 * @route   GET /api/projects/:projectId/notes/:noteId
 */
const getNoteById = async (req, res, next) => {
  try {
    const { projectId, noteId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    if (!mongoose.Types.ObjectId.isValid(noteId)) {
      return res.status(400).json({ message: 'Invalid note ID format' });
    }

    const note = await Note.findOne({ _id: noteId, project: projectId })
      .populate('creator', 'name email avatarInitials')
      .populate('lastEditor', 'name email avatarInitials')
      .populate('revisions.editedBy', 'name email avatarInitials')
      .lean();

    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    res.status(200).json(note);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new study note in the project
 * @route   POST /api/projects/:projectId/notes
 */
const createNote = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    const {
      title,
      content = '',
      category = 'General',
      tags = [],
      isPinned = false,
      color = 'blue',
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Note title is required' });
    }

    if (title.trim().length > 200) {
      return res.status(400).json({ message: 'Note title cannot exceed 200 characters' });
    }

    if (content && content.length > 50000) {
      return res.status(400).json({ message: 'Note content cannot exceed 50,000 characters' });
    }

    // Clean tags array
    const cleanTags = Array.isArray(tags)
      ? tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20)
      : [];

    const note = await Note.create({
      project: projectId,
      title: title.trim(),
      content: content || '',
      category: category || 'General',
      tags: cleanTags,
      isPinned: Boolean(isPinned),
      color: color || 'blue',
      creator: req.user._id,
      lastEditor: req.user._id,
      version: 1,
      revisions: [
        {
          version: 1,
          title: title.trim(),
          content: content || '',
          category: category || 'General',
          tags: cleanTags,
          editedBy: req.user._id,
          editedAt: new Date(),
          changeSummary: 'Initial note creation',
        },
      ],
    });

    const populated = await Note.findById(note._id)
      .populate('creator', 'name email avatarInitials')
      .populate('lastEditor', 'name email avatarInitials')
      .populate('revisions.editedBy', 'name email avatarInitials')
      .lean();

    // Log activity
    logActivity({
      type: 'note_created',
      userId: req.user._id,
      projectId,
      noteId: note._id,
      meta: {
        noteTitle: note.title,
        category: note.category,
      },
    });

    // Real-time broadcast
    emitSocketEvent(projectId, 'note:created', populated);

    res.status(201).json(populated);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a note with optimistic concurrency version check & revision capture
 * @route   PUT /api/projects/:projectId/notes/:noteId
 */
const updateNote = async (req, res, next) => {
  try {
    const { projectId, noteId } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    if (!mongoose.Types.ObjectId.isValid(noteId)) {
      return res.status(400).json({ message: 'Invalid note ID format' });
    }

    const note = await Note.findOne({ _id: noteId, project: projectId });
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    const {
      title,
      content,
      category,
      tags,
      isPinned,
      color,
      changeSummary,
      expectedVersion,
      force = false,
    } = req.body;

    // Optimistic Concurrency Check:
    // If client supplied expectedVersion and not forcing, ensure versions match
    if (expectedVersion !== undefined && !force && note.version !== Number(expectedVersion)) {
      const populatedCurrent = await Note.findById(note._id)
        .populate('creator', 'name email avatarInitials')
        .populate('lastEditor', 'name email avatarInitials')
        .lean();

      return res.status(409).json({
        code: 'CONCURRENCY_CONFLICT',
        message: 'This note was modified by another editor. Please review the updated content before overwriting.',
        currentVersion: note.version,
        expectedVersion: Number(expectedVersion),
        serverNote: populatedCurrent,
      });
    }

    // Validation
    if (title !== undefined) {
      if (!title || !title.trim()) {
        return res.status(400).json({ message: 'Note title cannot be blank' });
      }
      if (title.trim().length > 200) {
        return res.status(400).json({ message: 'Note title cannot exceed 200 characters' });
      }
    }

    if (content !== undefined && content.length > 50000) {
      return res.status(400).json({ message: 'Note content cannot exceed 50,000 characters' });
    }

    // Snapshot existing version before applying updates into revisions
    const previousSnapshot = {
      version: note.version,
      title: note.title,
      content: note.content,
      category: note.category,
      tags: note.tags,
      editedBy: note.lastEditor,
      editedAt: note.updatedAt || new Date(),
      changeSummary: changeSummary || 'Edited note content',
    };

    // Keep up to 20 most recent revisions to prevent document bloating
    note.revisions.unshift(previousSnapshot);
    if (note.revisions.length > 20) {
      note.revisions = note.revisions.slice(0, 20);
    }

    // Apply updates
    if (title !== undefined) note.title = title.trim();
    if (content !== undefined) note.content = content;
    if (category !== undefined) note.category = category;
    if (tags !== undefined && Array.isArray(tags)) {
      note.tags = tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
    }
    if (isPinned !== undefined) note.isPinned = Boolean(isPinned);
    if (color !== undefined) note.color = color;

    // Increment version & record editor
    note.version += 1;
    note.lastEditor = req.user._id;

    await note.save();

    const populated = await Note.findById(note._id)
      .populate('creator', 'name email avatarInitials')
      .populate('lastEditor', 'name email avatarInitials')
      .populate('revisions.editedBy', 'name email avatarInitials')
      .lean();

    // Log activity
    logActivity({
      type: 'note_updated',
      userId: req.user._id,
      projectId,
      noteId: note._id,
      meta: {
        noteTitle: note.title,
        version: note.version,
      },
    });

    // Real-time broadcast
    emitSocketEvent(projectId, 'note:updated', populated);

    res.status(200).json(populated);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a study note
 * @route   DELETE /api/projects/:projectId/notes/:noteId
 */
const deleteNote = async (req, res, next) => {
  try {
    const { projectId, noteId } = req.params;
    const { isAuthorized, role, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    if (!mongoose.Types.ObjectId.isValid(noteId)) {
      return res.status(400).json({ message: 'Invalid note ID format' });
    }

    const note = await Note.findOne({ _id: noteId, project: projectId });
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    // Permissions: Creator, Owner, or Admin
    const isCreator = note.creator.toString() === req.user._id.toString();
    const canModerate = role === 'Owner' || role === 'Admin';

    if (!isCreator && !canModerate) {
      return res.status(403).json({
        message: 'You do not have permission to delete this note. Only the creator or project admins can delete it.',
      });
    }

    const deletedTitle = note.title;
    await Note.deleteOne({ _id: noteId });

    // Log activity
    logActivity({
      type: 'note_deleted',
      userId: req.user._id,
      projectId,
      meta: {
        noteTitle: deletedTitle,
      },
    });

    // Real-time broadcast
    emitSocketEvent(projectId, 'note:deleted', { noteId, projectId });

    res.status(200).json({
      message: 'Note deleted successfully',
      noteId,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Restore a previous revision of a note
 * @route   POST /api/projects/:projectId/notes/:noteId/restore/:revisionVersion
 */
const restoreRevision = async (req, res, next) => {
  try {
    const { projectId, noteId, revisionVersion } = req.params;
    const { isAuthorized, project } = await verifyProjectMembership(projectId, req.user._id);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isAuthorized) return res.status(403).json({ message: 'Not authorized' });

    if (!mongoose.Types.ObjectId.isValid(noteId)) {
      return res.status(400).json({ message: 'Invalid note ID format' });
    }

    const note = await Note.findOne({ _id: noteId, project: projectId });
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    const targetVersion = parseInt(revisionVersion, 10);
    const revision = note.revisions.find((r) => r.version === targetVersion);

    if (!revision) {
      return res.status(404).json({
        message: `Revision version ${revisionVersion} not found in this note's history`,
      });
    }

    // Save current state as revision before restoring
    note.revisions.unshift({
      version: note.version,
      title: note.title,
      content: note.content,
      category: note.category,
      tags: note.tags,
      editedBy: note.lastEditor,
      editedAt: note.updatedAt || new Date(),
      changeSummary: `State before restoring to v${targetVersion}`,
    });

    // Restore fields from revision
    note.title = revision.title;
    note.content = revision.content;
    note.category = revision.category || note.category;
    note.tags = revision.tags || note.tags;
    note.version += 1;
    note.lastEditor = req.user._id;

    await note.save();

    const populated = await Note.findById(note._id)
      .populate('creator', 'name email avatarInitials')
      .populate('lastEditor', 'name email avatarInitials')
      .populate('revisions.editedBy', 'name email avatarInitials')
      .lean();

    // Log activity
    logActivity({
      type: 'note_restored',
      userId: req.user._id,
      projectId,
      noteId: note._id,
      meta: {
        noteTitle: note.title,
        version: targetVersion,
        restoredVersion: note.version,
      },
    });

    // Broadcast
    emitSocketEvent(projectId, 'note:updated', populated);

    res.status(200).json({
      message: `Note successfully restored to revision v${targetVersion}`,
      note: populated,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
  restoreRevision,
};
