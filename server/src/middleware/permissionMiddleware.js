const Project = require('../models/Project');

/**
 * Middleware to require a minimum project role ('Owner' | 'Admin' | 'Member')
 * Sets req.project and req.userRole on success
 */
const requireProjectRole = (minRole = 'Member') => {
  return async (req, res, next) => {
    try {
      const projectId = req.params.id || req.params.projectId;
      if (!projectId) {
        res.status(400);
        return next(new Error('Project ID is required'));
      }

      const project = await Project.findById(projectId);
      if (!project) {
        res.status(404);
        return next(new Error('Project not found'));
      }

      const userRole = project.getUserRole(req.user._id);
      if (!userRole) {
        res.status(403);
        return next(new Error('Access denied. You are not a member of this project.'));
      }

      const hasSufficientRole = project.hasPermission(req.user._id, minRole);
      if (!hasSufficientRole) {
        res.status(403);
        return next(new Error(`Permission denied. Requires ${minRole} role or higher.`));
      }

      req.project = project;
      req.userRole = userRole;
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  requireProjectRole,
};
