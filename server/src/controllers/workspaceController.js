const Project = require('../models/Project');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const Invitation = require('../models/Invitation');

// @desc    Get complete workspace data for a project with enriched roles and member workloads
// @route   GET /api/projects/:id/workspace
// @access  Private (Project Members only)
const getProjectWorkspace = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const userId = req.user._id;

    // 1. Fetch Project
    const projectDoc = await Project.findById(projectId);
    if (!projectDoc) {
      res.status(404);
      throw new Error('Project not found');
    }

    // 2. Verify Authorization & Caller Role
    const callerRole = projectDoc.getUserRole(userId);
    if (!callerRole) {
      res.status(403);
      throw new Error('Not authorized to access this project workspace');
    }

    // 3. Fetch Project populated
    const project = await Project.findById(projectId)
      .populate('owner', 'name email avatarInitials')
      .populate('members', 'name email avatarInitials')
      .lean();

    // 4. Fetch Tasks and Calculate Statistics
    const tasks = await Task.find({ project: projectId })
      .populate('assignee', 'name email avatarInitials')
      .sort({ createdAt: -1 })
      .lean();

    let totalTasks = tasks.length;
    let completed = 0;
    let inProgress = 0;
    let todo = 0;
    let backlog = 0;
    let review = 0;
    let overdue = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcomingDeadlines = [];
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    // Map to accumulate assigned workload per member
    const memberWorkloads = {};
    (project.members || []).forEach(m => {
      memberWorkloads[m._id.toString()] = {
        totalAssigned: 0,
        completedTasks: 0,
        pendingTasks: 0,
        overdueTasks: 0,
        highPriorityTasks: 0,
      };
    });

    tasks.forEach(t => {
      if (t.status === 'Completed') completed++;
      else if (t.status === 'In Progress') inProgress++;
      else if (t.status === 'Todo') todo++;
      else if (t.status === 'Backlog') backlog++;
      else if (t.status === 'Review') review++;

      const isOverdue = t.dueDate && t.status !== 'Completed' && new Date(t.dueDate).setHours(0,0,0,0) < today.getTime();
      if (isOverdue) {
        overdue++;
      }

      if (t.dueDate && t.status !== 'Completed') {
        const due = new Date(t.dueDate);
        due.setHours(0, 0, 0, 0);
        if (due.getTime() >= today.getTime() && due.getTime() <= sevenDaysFromNow.getTime()) {
          upcomingDeadlines.push(t);
        }
      }

      // Track member workload
      if (t.assignee && t.assignee._id) {
        const aId = t.assignee._id.toString();
        if (!memberWorkloads[aId]) {
          memberWorkloads[aId] = {
            totalAssigned: 0,
            completedTasks: 0,
            pendingTasks: 0,
            overdueTasks: 0,
            highPriorityTasks: 0,
          };
        }
        memberWorkloads[aId].totalAssigned++;
        if (t.status === 'Completed') {
          memberWorkloads[aId].completedTasks++;
        } else {
          memberWorkloads[aId].pendingTasks++;
        }
        if (isOverdue) {
          memberWorkloads[aId].overdueTasks++;
        }
        if (t.priority === 'High' || t.priority === 'Urgent') {
          memberWorkloads[aId].highPriorityTasks++;
        }
      }
    });

    const progress = totalTasks === 0 ? 0 : Math.round((completed / totalTasks) * 100);
    upcomingDeadlines.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    // 5. Enrich Members with Roles and Workload
    const enrichedMembers = (project.members || []).map(m => {
      const mId = m._id.toString();
      const role = projectDoc.getUserRole(mId);
      const roleEntry = (project.memberRoles || []).find(r => r.user?.toString() === mId || r.user?._id?.toString() === mId);
      const workloadStats = memberWorkloads[mId] || {
        totalAssigned: 0,
        completedTasks: 0,
        pendingTasks: 0,
        overdueTasks: 0,
        highPriorityTasks: 0,
      };

      const completionRate = workloadStats.totalAssigned > 0 
        ? Math.round((workloadStats.completedTasks / workloadStats.totalAssigned) * 100) 
        : 0;

      return {
        ...m,
        role: role || 'Member',
        joinedAt: roleEntry ? roleEntry.joinedAt : project.createdAt,
        workload: {
          ...workloadStats,
          completionRate,
        },
      };
    });

    // 6. Fetch Recent Activity
    const recentActivity = await Activity.find({ project: projectId })
      .populate('user', 'name email avatarInitials')
      .populate('targetUser', 'name email avatarInitials')
      .populate('project', 'name')
      .populate('task', 'title')
      .sort({ createdAt: -1 })
      .limit(15)
      .lean();

    // 7. Fetch Pending Invitations for Owners and Admins
    let pendingInvitations = [];
    if (callerRole === 'Owner' || callerRole === 'Admin') {
      // Auto-expire
      await Invitation.updateMany(
        {
          project: projectId,
          status: 'Pending',
          expiresAt: { $lt: new Date() },
        },
        { $set: { status: 'Expired' } }
      );

      pendingInvitations = await Invitation.find({
        project: projectId,
        status: 'Pending',
      })
        .populate('sender', 'name email avatarInitials')
        .populate('recipient', 'name email avatarInitials')
        .sort({ createdAt: -1 })
        .lean();
    }

    // 8. Return response
    res.status(200).json({
      project: {
        ...project,
        members: enrichedMembers,
      },
      callerRole,
      stats: {
        totalTasks,
        completed,
        inProgress,
        todo,
        backlog,
        review,
        overdue,
        progress,
      },
      upcomingDeadlines: upcomingDeadlines.slice(0, 5),
      recentActivity,
      pendingInvitations,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProjectWorkspace,
};
