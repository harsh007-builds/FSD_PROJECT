const Project = require('../models/Project');
const Task = require('../models/Task');
const Activity = require('../models/Activity');

// Formats Date to YYYY-MM-DD key in local-safe format
const toDateKey = (date) => {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// @desc    Get complete dashboard analytics and statistics
// @route   GET /api/dashboard/stats
// @access  Private
const getDashboardStats = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { projectId: filterProjectId, timeRange = '7d' } = req.query;

    // 1. Fetch all projects accessible to the user
    const userProjects = await Project.find({
      $or: [{ owner: userId }, { members: userId }],
    })
      .populate('owner', 'name email avatarInitials')
      .populate('members', 'name email avatarInitials')
      .lean();

    // Validate project filter if provided
    let scopedProjects = userProjects;
    if (filterProjectId && filterProjectId !== 'all') {
      const match = userProjects.find(p => p._id.toString() === filterProjectId);
      if (!match) {
        res.status(403);
        throw new Error('Not authorized to access this project or project does not exist');
      }
      scopedProjects = [match];
    }

    const projectIds = scopedProjects.map(p => p._id);

    // 2. Fetch all tasks within scoped projects
    const tasks = await Task.find({ project: { $in: projectIds } })
      .populate('project', 'name deadline status')
      .populate('assignee', 'name email avatarInitials')
      .populate('createdBy', 'name email avatarInitials')
      .sort({ createdAt: -1 })
      .lean();

    // Midnight timestamps for comparison
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    // 3. Status and Priority Distributions
    const byStatus = {
      Backlog: 0,
      Todo: 0,
      'In Progress': 0,
      Review: 0,
      Completed: 0,
    };

    const byPriority = {
      Urgent: 0,
      High: 0,
      Medium: 0,
      Low: 0,
    };

    let totalTasks = tasks.length;
    let completedTasks = 0;
    let pendingTasks = 0;
    let overdueTasks = 0;
    let dueTodayTasks = 0;
    let upcomingTasks = 0;

    // My Tasks accumulators
    let myTasksTotal = 0;
    let myTasksCompleted = 0;
    let myTasksPending = 0;
    let myTasksOverdue = 0;
    let myTasksDueToday = 0;

    // Workload aggregation per member
    const memberWorkloadMap = {};
    scopedProjects.forEach(p => {
      (p.members || []).forEach(m => {
        const mId = m._id.toString();
        if (!memberWorkloadMap[mId]) {
          memberWorkloadMap[mId] = {
            user: m,
            totalAssigned: 0,
            completed: 0,
            pending: 0,
            overdue: 0,
          };
        }
      });
      if (p.owner && !memberWorkloadMap[p.owner._id.toString()]) {
        memberWorkloadMap[p.owner._id.toString()] = {
          user: p.owner,
          totalAssigned: 0,
          completed: 0,
          pending: 0,
          overdue: 0,
        };
      }
    });

    // Milestone list
    const milestones = [];

    // Add project deadline milestones
    scopedProjects.forEach(p => {
      if (p.deadline) {
        const dl = new Date(p.deadline);
        dl.setHours(0, 0, 0, 0);
        milestones.push({
          id: `proj-${p._id}`,
          title: `${p.name} Final Deadline`,
          dueDate: p.deadline,
          dateKey: toDateKey(p.deadline),
          type: 'Project Milestone',
          projectName: p.name,
          projectId: p._id,
          isCompleted: p.status === 'Completed',
          isOverdue: p.status !== 'Completed' && dl < today,
        });
      }
    });

    tasks.forEach(t => {
      // By Status
      if (byStatus[t.status] !== undefined) byStatus[t.status]++;
      else byStatus[t.status] = 1;

      // By Priority
      if (byPriority[t.priority] !== undefined) byPriority[t.priority]++;
      else byPriority[t.priority] = 1;

      const isCompleted = t.status === 'Completed';
      if (isCompleted) completedTasks++;
      else pendingTasks++;

      // Due date checks
      if (t.dueDate) {
        const due = new Date(t.dueDate);
        due.setHours(0, 0, 0, 0);

        if (!isCompleted && due < today) {
          overdueTasks++;
        } else if (!isCompleted && due.getTime() === today.getTime()) {
          dueTodayTasks++;
        } else if (!isCompleted && due.getTime() > today.getTime() && due <= weekFromNow) {
          upcomingTasks++;
        }
      }

      // Check task milestones
      if (t.type === 'Milestone' || (t.labels || []).includes('milestone')) {
        const due = t.dueDate ? new Date(t.dueDate) : null;
        if (due) due.setHours(0, 0, 0, 0);
        milestones.push({
          id: t._id,
          title: t.title,
          dueDate: t.dueDate,
          dateKey: t.dueDate ? toDateKey(t.dueDate) : null,
          type: 'Task Milestone',
          projectName: t.project?.name || 'Project',
          projectId: t.project?._id || t.project,
          priority: t.priority,
          isCompleted: isCompleted,
          isOverdue: due && !isCompleted && due < today,
        });
      }

      // Assignee checks
      if (t.assignee && t.assignee._id) {
        const aId = t.assignee._id.toString();
        const isMe = aId === userId.toString();

        if (isMe) {
          myTasksTotal++;
          if (isCompleted) myTasksCompleted++;
          else {
            myTasksPending++;
            if (t.dueDate) {
              const due = new Date(t.dueDate);
              due.setHours(0, 0, 0, 0);
              if (due < today) myTasksOverdue++;
              else if (due.getTime() === today.getTime()) myTasksDueToday++;
            }
          }
        }

        // Aggregate member workload
        if (!memberWorkloadMap[aId]) {
          memberWorkloadMap[aId] = {
            user: t.assignee,
            totalAssigned: 0,
            completed: 0,
            pending: 0,
            overdue: 0,
          };
        }
        memberWorkloadMap[aId].totalAssigned++;
        if (isCompleted) memberWorkloadMap[aId].completed++;
        else {
          memberWorkloadMap[aId].pending++;
          if (t.dueDate && new Date(t.dueDate).setHours(0, 0, 0, 0) < today.getTime()) {
            memberWorkloadMap[aId].overdue++;
          }
        }
      }
    });

    // Sort milestones chronologically
    milestones.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });

    // Format workload list
    const memberWorkloads = Object.values(memberWorkloadMap).map(w => ({
      ...w,
      completionRate: w.totalAssigned > 0 ? Math.round((w.completed / w.totalAssigned) * 100) : 0,
    })).sort((a, b) => b.totalAssigned - a.totalAssigned);

    // 4. Productivity Trends from Actual History
    // Parse time range days: '7d' -> 7, '14d' -> 14, '30d' -> 30
    let daysCount = 7;
    if (timeRange === '14d') daysCount = 14;
    else if (timeRange === '30d') daysCount = 30;

    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (daysCount - 1));

    // Fetch actual activity events within the date range
    const activities = await Activity.find({
      project: { $in: projectIds },
      createdAt: { $gte: startDate },
      type: { $in: ['task_completed', 'task_created'] },
    }).lean();

    // Map counts per day
    const trendMap = {};
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const k = toDateKey(d);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      trendMap[k] = { date: k, label, completed: 0, created: 0 };
    }

    // Accumulate actual activity completions
    activities.forEach(a => {
      const k = toDateKey(a.createdAt);
      if (trendMap[k]) {
        if (a.type === 'task_completed') trendMap[k].completed++;
        if (a.type === 'task_created') trendMap[k].created++;
      }
    });

    // Fallback: Also check task updatedAt/createdAt for completed tasks to ensure accuracy
    tasks.forEach(t => {
      if (t.status === 'Completed' && t.updatedAt && new Date(t.updatedAt) >= startDate) {
        const k = toDateKey(t.updatedAt);
        if (trendMap[k] && trendMap[k].completed === 0) {
          trendMap[k].completed++;
        }
      }
      if (t.createdAt && new Date(t.createdAt) >= startDate) {
        const k = toDateKey(t.createdAt);
        if (trendMap[k] && trendMap[k].created === 0) {
          trendMap[k].created++;
        }
      }
    });

    const productivityTrend = Object.values(trendMap);
    const totalTrendCompleted = productivityTrend.reduce((sum, item) => sum + item.completed, 0);
    const totalTrendCreated = productivityTrend.reduce((sum, item) => sum + item.created, 0);
    const hasProductivityData = totalTrendCompleted > 0 || totalTrendCreated > 0;

    // 5. Recent Activity (Latest 15 events)
    const recentActivities = await Activity.find({ project: { $in: projectIds } })
      .populate('user', 'name email avatarInitials')
      .populate('targetUser', 'name email avatarInitials')
      .populate('project', 'name')
      .populate('task', 'title')
      .sort({ createdAt: -1 })
      .limit(15)
      .lean();

    // 6. Project progress summaries
    const projectSummaries = scopedProjects.map(p => {
      const pTasks = tasks.filter(t => (t.project?._id || t.project).toString() === p._id.toString());
      const pTotal = pTasks.length;
      const pCompleted = pTasks.filter(t => t.status === 'Completed').length;
      const pProgress = pTotal > 0 ? Math.round((pCompleted / pTotal) * 100) : 0;
      return {
        id: p._id,
        name: p.name,
        description: p.description,
        status: p.status,
        deadline: p.deadline,
        membersCount: (p.members || []).length,
        members: p.members || [],
        owner: p.owner,
        totalTasks: pTotal,
        completedTasks: pCompleted,
        progress: pProgress,
      };
    });

    res.status(200).json({
      summary: {
        totalProjects: scopedProjects.length,
        activeProjects: scopedProjects.filter(p => p.status === 'Active').length,
        completedProjects: scopedProjects.filter(p => p.status === 'Completed').length,
        totalTasks,
        completedTasks,
        pendingTasks,
        overdueTasks,
        dueTodayTasks,
        upcomingTasks,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      },
      myTasksSummary: {
        total: myTasksTotal,
        completed: myTasksCompleted,
        pending: myTasksPending,
        overdue: myTasksOverdue,
        dueToday: myTasksDueToday,
        completionRate: myTasksTotal > 0 ? Math.round((myTasksCompleted / myTasksTotal) * 100) : 0,
      },
      byStatus,
      byPriority,
      productivityTrend: {
        days: productivityTrend,
        hasData: hasProductivityData,
        totalCompleted: totalTrendCompleted,
        totalCreated: totalTrendCreated,
      },
      milestones: milestones.slice(0, 10),
      memberWorkloads: memberWorkloads.slice(0, 8),
      recentActivities,
      projectSummaries,
      filter: {
        projectId: filterProjectId || 'all',
        timeRange,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardStats,
};
