const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const Resource = require('../models/Resource');

// Helper to escape regex special characters
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Helper: Get all project IDs accessible by the user
const getAccessibleProjects = async (userId) => {
  return await Project.find({
    $or: [
      { owner: userId },
      { members: userId },
      { 'memberRoles.user': userId },
    ],
  }).select('_id name description status progress deadline owner members memberRoles');
};

// URL regex pattern to extract links from task descriptions
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

// @desc    Global search across accessible projects, tasks, and indexed resources
// @route   GET /api/search
// @access  Private
const globalSearch = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const q = (req.query.q || '').trim();
    const type = req.query.type || 'all'; // 'all' | 'projects' | 'tasks' | 'resources'
    const status = req.query.status;
    const priority = req.query.priority;
    const assignee = req.query.assignee;
    const targetProjectId = req.query.projectId;
    const sortBy = req.query.sortBy || 'relevance';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    // 1. Determine accessible projects
    const accessibleProjects = await getAccessibleProjects(userId);
    const accessibleProjectIds = accessibleProjects.map(p => p._id);

    // If a specific project was requested, ensure user is authorized
    let projectScopeIds = accessibleProjectIds;
    if (targetProjectId) {
      const isAuthorized = accessibleProjectIds.some(id => id.toString() === targetProjectId.toString());
      if (!isAuthorized) {
        return res.status(403).json({ message: 'Not authorized to search in this project' });
      }
      projectScopeIds = [targetProjectId];
    }

    if (projectScopeIds.length === 0) {
      return res.status(200).json({
        query: q,
        total: 0,
        page,
        limit,
        totalPages: 0,
        counts: { projects: 0, tasks: 0, resources: 0, total: 0 },
        grouped: { projects: [], tasks: [], resources: [] },
        results: [],
      });
    }

    const regex = q ? new RegExp(escapeRegex(q), 'i') : null;

    // 2. Search Projects (if type is 'all' or 'projects')
    let matchedProjects = [];
    if (type === 'all' || type === 'projects') {
      const projectQuery = { _id: { $in: projectScopeIds } };
      if (regex) {
        projectQuery.$or = [{ name: regex }, { description: regex }];
      }
      if (status) {
        projectQuery.status = status;
      }

      matchedProjects = await Project.find(projectQuery)
        .populate('owner', 'name email avatarInitials')
        .populate('members', 'name email avatarInitials')
        .sort(sortBy === 'name' ? { name: sortOrder } : { updatedAt: -1 })
        .lean();
    }

    // 3. Search Tasks (if type is 'all' or 'tasks' or 'resources')
    let matchedTasks = [];
    if (type === 'all' || type === 'tasks' || type === 'resources') {
      const taskQuery = { project: { $in: projectScopeIds } };

      if (regex) {
        taskQuery.$or = [
          { title: regex },
          { description: regex },
          { labels: regex },
        ];
      }

      if (status) {
        taskQuery.status = status;
      }
      if (priority) {
        taskQuery.priority = priority;
      }
      if (assignee) {
        if (assignee === 'me') {
          taskQuery.assignee = userId;
        } else if (assignee === 'unassigned') {
          taskQuery.assignee = null;
        } else {
          taskQuery.assignee = assignee;
        }
      }

      // Build task sort
      let taskSort = { createdAt: -1 };
      if (sortBy === 'dueDate') {
        taskSort = { dueDate: sortOrder, createdAt: -1 };
      } else if (sortBy === 'priority') {
        taskSort = { priority: sortOrder, createdAt: -1 };
      } else if (sortBy === 'name' || sortBy === 'title') {
        taskSort = { title: sortOrder };
      } else if (sortBy === 'createdAt') {
        taskSort = { createdAt: sortOrder };
      }

      matchedTasks = await Task.find(taskQuery)
        .populate('project', 'name status deadline')
        .populate('assignee', 'name email avatarInitials')
        .populate('createdBy', 'name email avatarInitials')
        .sort(taskSort)
        .lean();
    }

    // 4. Query Resources collection + fallback to task embedded URLs
    let matchedResources = [];
    if (type === 'all' || type === 'resources') {
      const resourceQuery = { project: { $in: projectScopeIds } };
      if (q && q.trim()) {
        resourceQuery.$or = [
          { title: { $regex: regex } },
          { description: { $regex: regex } },
          { tags: { $regex: regex } },
          { 'file.originalName': { $regex: regex } },
          { url: { $regex: regex } },
        ];
      }

      const dbResources = await Resource.find(resourceQuery)
        .populate('project', 'name status deadline')
        .populate('uploader', 'name email avatarInitials')
        .sort({ createdAt: -1 })
        .lean();

      matchedResources = dbResources.map(r => ({
        ...r,
        type: 'resource',
        url: r.url || `/api/projects/${r.project?._id || r.project}/resources/${r._id}/download`,
      }));

      for (const t of matchedTasks) {
        if (t.description) {
          const urls = t.description.match(URL_REGEX);
          if (urls) {
            urls.forEach(url => {
              if (!q || regex.test(url) || regex.test(t.title)) {
                matchedResources.push({
                  _id: `${t._id}_${encodeURIComponent(url)}`,
                  title: `Link from ${t.title}`,
                  url,
                  category: 'Link',
                  task: {
                    _id: t._id,
                    title: t.title,
                    status: t.status,
                    priority: t.priority,
                  },
                  project: t.project,
                  createdAt: t.createdAt,
                  type: 'resource',
                });
              }
            });
          }
        }
      }
    }

    // 5. Build Unified Results List
    const taggedProjects = matchedProjects.map(p => ({ ...p, resultType: 'project' }));
    const taggedTasks = matchedTasks.map(t => ({ ...t, resultType: 'task' }));
    const taggedResources = matchedResources.map(r => ({ ...r, resultType: 'resource' }));

    let combinedResults = [];
    if (type === 'projects') {
      combinedResults = taggedProjects;
    } else if (type === 'tasks') {
      combinedResults = taggedTasks;
    } else if (type === 'resources') {
      combinedResults = taggedResources;
    } else {
      // 'all': interleave or concatenate
      combinedResults = [...taggedProjects, ...taggedTasks, ...taggedResources];
    }

    // Total counts
    const counts = {
      projects: taggedProjects.length,
      tasks: taggedTasks.length,
      resources: taggedResources.length,
      total: taggedProjects.length + taggedTasks.length + taggedResources.length,
    };

    // Pagination over selected result set
    const total = combinedResults.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedResults = combinedResults.slice(startIndex, startIndex + limit);

    res.status(200).json({
      query: q,
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
      counts,
      grouped: {
        projects: taggedProjects.slice(0, 10),
        tasks: taggedTasks.slice(0, 20),
        resources: taggedResources.slice(0, 10),
      },
      results: paginatedResults,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user's tasks across all accessible projects (My Tasks)
// @route   GET /api/search/my-tasks or GET /api/tasks/my-tasks
// @access  Private
const getMyTasks = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const accessibleProjects = await getAccessibleProjects(userId);
    const accessibleProjectIds = accessibleProjects.map(p => p._id);

    const {
      status,
      priority,
      projectId,
      dateRange, // 'today' | 'upcoming' | 'overdue' | 'all'
      q,
      sortBy = 'dueDate',
      sortOrder = 'asc',
      page = 1,
      limit = 20,
    } = req.query;

    const query = {
      assignee: userId,
      project: { $in: accessibleProjectIds },
    };

    if (projectId && accessibleProjectIds.some(id => id.toString() === projectId.toString())) {
      query.project = projectId;
    }

    if (status) {
      query.status = status;
    }

    if (priority) {
      query.priority = priority;
    }

    if (q && q.trim()) {
      const regex = new RegExp(escapeRegex(q.trim()), 'i');
      query.$or = [{ title: regex }, { description: regex }, { labels: regex }];
    }

    // Date range filter
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (dateRange === 'today') {
      query.dueDate = { $gte: startOfToday, $lte: endOfToday };
    } else if (dateRange === 'overdue') {
      query.dueDate = { $lt: startOfToday };
      query.status = { $ne: 'Completed' };
    } else if (dateRange === 'upcoming') {
      query.dueDate = { $gt: endOfToday };
    }

    // Sort definition
    const order = sortOrder === 'desc' ? -1 : 1;
    let sort = {};
    if (sortBy === 'dueDate') {
      sort = { dueDate: order, createdAt: -1 };
    } else if (sortBy === 'priority') {
      sort = { priority: order, createdAt: -1 };
    } else if (sortBy === 'title') {
      sort = { title: order };
    } else {
      sort = { createdAt: order };
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 50);
    const skip = (pageNum - 1) * limitNum;

    const total = await Task.countDocuments(query);
    const tasks = await Task.find(query)
      .populate('project', 'name status deadline')
      .populate('assignee', 'name email avatarInitials')
      .populate('createdBy', 'name email avatarInitials')
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Summary counts for My Tasks
    const [totalAssigned, completedCount, overdueCount, todayCount] = await Promise.all([
      Task.countDocuments({ assignee: userId, project: { $in: accessibleProjectIds } }),
      Task.countDocuments({ assignee: userId, project: { $in: accessibleProjectIds }, status: 'Completed' }),
      Task.countDocuments({ assignee: userId, project: { $in: accessibleProjectIds }, status: { $ne: 'Completed' }, dueDate: { $lt: startOfToday } }),
      Task.countDocuments({ assignee: userId, project: { $in: accessibleProjectIds }, dueDate: { $gte: startOfToday, $lte: endOfToday } }),
    ]);

    res.status(200).json({
      tasks,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      hasMore: pageNum * limitNum < total,
      summary: {
        totalAssigned,
        completedCount,
        overdueCount,
        todayCount,
        pendingCount: totalAssigned - completedCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's saved task filters
// @route   GET /api/search/saved-filters
// @access  Private
const getSavedFilters = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('savedTaskFilters').lean();
    res.status(200).json(user?.savedTaskFilters || []);
  } catch (error) {
    next(error);
  }
};

// @desc    Save a custom task filter preset
// @route   POST /api/search/saved-filters
// @access  Private
const createSavedFilter = async (req, res, next) => {
  try {
    const { name, filters } = req.body;
    if (!name || !name.trim()) {
      res.status(400);
      throw new Error('Filter preset name is required');
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $push: {
          savedTaskFilters: {
            name: name.trim(),
            filters: filters || {},
            createdAt: new Date(),
          },
        },
      },
      { new: true, runValidators: true }
    ).select('savedTaskFilters');

    if (!updatedUser) {
      res.status(404);
      throw new Error('User not found');
    }

    res.status(201).json(updatedUser.savedTaskFilters);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a saved filter preset
// @route   DELETE /api/search/saved-filters/:id
// @access  Private
const deleteSavedFilter = async (req, res, next) => {
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $pull: {
          savedTaskFilters: { _id: req.params.id },
        },
      },
      { new: true }
    ).select('savedTaskFilters');

    if (!updatedUser) {
      res.status(404);
      throw new Error('User not found');
    }

    res.status(200).json(updatedUser.savedTaskFilters);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  globalSearch,
  getMyTasks,
  getSavedFilters,
  createSavedFilter,
  deleteSavedFilter,
};
