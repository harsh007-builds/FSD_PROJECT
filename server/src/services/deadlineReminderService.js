const Task = require('../models/Task');
const User = require('../models/User');
const Project = require('../models/Project');
const DeadlineNotification = require('../models/DeadlineNotification');
const { sendDeadlineEmail } = require('./emailService');

let schedulerInterval = null;
let isProcessing = false;
let testModeConfig = {
  enabled: false,
  offsetMinutes: {
    '24h_before': 24 * 60,
    '1h_before': 60,
    'at_deadline': 0,
    'overdue': -15, // 15 mins after deadline
  },
};

/**
 * Configure test mode intervals (only for testing/development)
 */
function setTestMode(config = {}) {
  testModeConfig = {
    ...testModeConfig,
    ...config,
  };
}

/**
 * Compute scheduled time for each reminder type
 */
function calculateScheduledTime(dueDate, reminderType) {
  const due = new Date(dueDate).getTime();
  
  if (testModeConfig.enabled && testModeConfig.offsetMinutes) {
    const minutes = testModeConfig.offsetMinutes[reminderType] ?? 0;
    return new Date(due - minutes * 60 * 1000);
  }

  switch (reminderType) {
    case '24h_before':
      return new Date(due - 24 * 60 * 60 * 1000);
    case '1h_before':
      return new Date(due - 60 * 60 * 1000);
    case 'at_deadline':
      return new Date(due);
    case 'overdue':
      // 15 minutes after deadline to allow a brief grace period
      return new Date(due + 15 * 60 * 1000);
    default:
      return new Date(due);
  }
}

/**
 * Synchronize reminder schedules for a given task
 * Called on task creation, update, deadline change, or assignee change
 */
async function syncTaskReminders(taskInput) {
  try {
    if (!taskInput) return;
    const taskId = taskInput._id || taskInput.id || taskInput;
    
    // Always fetch task with full assignee, createdBy, and project.owner populated
    const task = await Task.findById(taskId)
      .populate('assignee')
      .populate('createdBy')
      .populate({
        path: 'project',
        populate: { path: 'owner' },
      });

    if (!task) {
      // Task was deleted -> cancel all pending reminders
      await cancelTaskReminders(taskId);
      return { status: 'deleted' };
    }

    // If task is completed -> cancel all pending reminders
    if (task.status === 'Completed') {
      await cancelTaskReminders(taskId);
      return { status: 'completed' };
    }

    // If no deadline -> cancel pending reminders
    if (!task.dueDate) {
      await cancelTaskReminders(taskId);
      return { status: 'no_due_date' };
    }

    // Resolve recipient user: explicit assignee -> task creator -> project owner
    const recipientUser = (task.assignee && task.assignee.email)
      ? task.assignee
      : (task.createdBy && task.createdBy.email)
        ? task.createdBy
        : (task.project?.owner && task.project.owner.email)
          ? task.project.owner
          : null;

    if (!recipientUser || !recipientUser.email) {
      await cancelTaskReminders(taskId);
      return { status: 'no_recipient' };
    }

    const now = Date.now();
    const reminderTypes = ['24h_before', '1h_before', 'at_deadline', 'overdue'];

    for (const reminderType of reminderTypes) {
      const scheduledTime = calculateScheduledTime(task.dueDate, reminderType);
      const isOverdueType = reminderType === 'overdue';
      const isAtDeadlineType = reminderType === 'at_deadline';

      // Find existing notification record for this task and reminder type
      const existing = await DeadlineNotification.findOne({
        task: task._id,
        reminderType,
      });

      // Detect if existing was only a simulated development mock that was never delivered via Resend
      const isMockPlaceholder = Boolean(existing && existing.resendId && existing.resendId.startsWith('mock_resend_'));

      // If scheduled time is in the past:
      if (scheduledTime.getTime() <= now) {
        if (!existing || isMockPlaceholder) {
          // If task deadline has arrived or passed, schedule overdue or at_deadline immediately
          if ((isOverdueType || isAtDeadlineType) && new Date(task.dueDate).getTime() <= now) {
            if (existing) {
              existing.scheduledTime = new Date(now);
              existing.deliveryStatus = 'pending';
              existing.user = recipientUser._id;
              existing.recipientEmail = recipientUser.email;
              existing.sentTime = null;
              existing.resendId = null;
              existing.errorDetails = null;
              await existing.save();
            } else {
              await DeadlineNotification.create({
                task: task._id,
                user: recipientUser._id,
                project: task.project?._id || task.project,
                reminderType,
                scheduledTime: new Date(now),
                deliveryStatus: 'pending',
                recipientEmail: recipientUser.email,
                metadata: {
                  taskTitle: task.title,
                  projectName: task.project?.name,
                  dueDate: task.dueDate,
                  status: task.status,
                  priority: task.priority,
                },
              });
            }
          }
          continue;
        } else {
          continue;
        }
      }

      // Scheduled time is in the future
      if (!existing) {
        try {
          await DeadlineNotification.create({
            task: task._id,
            user: recipientUser._id,
            project: task.project?._id || task.project,
            reminderType,
            scheduledTime,
            deliveryStatus: 'pending',
            recipientEmail: recipientUser.email,
            metadata: {
              taskTitle: task.title,
              projectName: task.project?.name,
              dueDate: task.dueDate,
              status: task.status,
              priority: task.priority,
            },
          });
        } catch (dupErr) {
          // Duplicate key caught safely
        }
      } else {
        // Recalculate future reminder if deadline, assignee changed, or restoring a mock placeholder
        if (existing.deliveryStatus === 'pending' || existing.deliveryStatus === 'cancelled' || isMockPlaceholder) {
          existing.scheduledTime = scheduledTime;
          existing.deliveryStatus = 'pending';
          existing.user = recipientUser._id;
          existing.recipientEmail = recipientUser.email;
          if (isMockPlaceholder) {
            existing.sentTime = null;
            existing.resendId = null;
            existing.errorDetails = null;
          }
          existing.metadata = {
            taskTitle: task.title,
            projectName: task.project?.name,
            dueDate: task.dueDate,
            status: task.status,
            priority: task.priority,
          };
          await existing.save();
        }
      }
    }

    return { status: 'synced', recipient: recipientUser.email };
  } catch (err) {
    console.error(`[DeadlineReminderService] Error syncing task ${taskInput?._id || taskInput}:`, err.message);
    return { status: 'error', error: err.message };
  }
}

/**
 * Cancel all pending reminders for a task
 */
async function cancelTaskReminders(taskId) {
  try {
    await DeadlineNotification.updateMany(
      {
        task: taskId,
        deliveryStatus: { $in: ['pending', 'processing'] },
      },
      {
        $set: { deliveryStatus: 'cancelled' },
      }
    );
  } catch (err) {
    console.error(`[DeadlineReminderService] Error cancelling reminders for task ${taskId}:`, err.message);
  }
}

/**
 * Core processor: finds all due pending reminders and dispatches emails + in-app socket alerts
 */
async function processDueReminders() {
  if (isProcessing) return { processed: 0, sent: 0, skipped: 0, errors: 0 };
  isProcessing = true;

  let processedCount = 0;
  let sentCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let lastError = null;

  try {
    const now = new Date();

    // Query pending notifications scheduled on or before now
    const dueReminders = await DeadlineNotification.find({
      deliveryStatus: 'pending',
      scheduledTime: { $lte: now },
    })
      .limit(50)
      .lean();

    for (const item of dueReminders) {
      // Atomic lock: claim reminder by moving to 'processing'
      const lockedReminder = await DeadlineNotification.findOneAndUpdate(
        { _id: item._id, deliveryStatus: 'pending' },
        { $set: { deliveryStatus: 'processing' } },
        { returnDocument: 'after' }
      );

      if (!lockedReminder) {
        // Acquired by another worker instance
        continue;
      }

      try {
        // Fetch current task status from DB with fallback user population
        const task = await Task.findById(lockedReminder.task)
          .populate('project', 'name')
          .populate('assignee', 'name email notificationPreferences')
          .populate('createdBy', 'name email notificationPreferences')
          .populate({
            path: 'project',
            populate: { path: 'owner', select: 'name email notificationPreferences' },
          });

        // Validation 1: Task was deleted
        if (!task) {
          lockedReminder.deliveryStatus = 'cancelled';
          lockedReminder.errorDetails = 'Task no longer exists';
          await lockedReminder.save();
          skippedCount++;
          continue;
        }

        // Validation 2: Task completed
        if (task.status === 'Completed') {
          lockedReminder.deliveryStatus = 'cancelled';
          lockedReminder.errorDetails = 'Task completed prior to delivery';
          await lockedReminder.save();
          skippedCount++;
          continue;
        }

        // Validation 3: Target user resolution (assignee -> createdBy -> project.owner)
        const assignee = (task.assignee && task.assignee.email)
          ? task.assignee
          : (task.createdBy && task.createdBy.email)
            ? task.createdBy
            : (task.project?.owner && task.project.owner.email)
              ? task.project.owner
              : null;

        if (!assignee || !assignee.email) {
          lockedReminder.deliveryStatus = 'cancelled';
          lockedReminder.errorDetails = 'Task has no assigned user or creator email';
          await lockedReminder.save();
          skippedCount++;
          continue;
        }

        // Validation 4: User disabled email reminders in preferences
        const prefs = assignee.notificationPreferences || {};
        if (prefs.emailDeadlineReminders === false || prefs.deadlineReminders === false) {
          lockedReminder.deliveryStatus = 'cancelled';
          lockedReminder.errorDetails = 'User disabled deadline email reminders';
          await lockedReminder.save();
          skippedCount++;
          continue;
        }

        // Check granular reminder preference if set
        if (lockedReminder.reminderType === '24h_before' && prefs.emailReminders24h === false) {
          lockedReminder.deliveryStatus = 'cancelled';
          lockedReminder.errorDetails = 'User disabled 24h reminders';
          await lockedReminder.save();
          skippedCount++;
          continue;
        }
        if (lockedReminder.reminderType === '1h_before' && prefs.emailReminders1h === false) {
          lockedReminder.deliveryStatus = 'cancelled';
          lockedReminder.errorDetails = 'User disabled 1h reminders';
          await lockedReminder.save();
          skippedCount++;
          continue;
        }
        if (lockedReminder.reminderType === 'at_deadline' && prefs.emailRemindersAtDeadline === false) {
          lockedReminder.deliveryStatus = 'cancelled';
          lockedReminder.errorDetails = 'User disabled at-deadline reminders';
          await lockedReminder.save();
          skippedCount++;
          continue;
        }
        if (lockedReminder.reminderType === 'overdue' && prefs.emailRemindersOverdue === false) {
          lockedReminder.deliveryStatus = 'cancelled';
          lockedReminder.errorDetails = 'User disabled overdue reminders';
          await lockedReminder.save();
          skippedCount++;
          continue;
        }

        // Send Email via Resend
        const emailResult = await sendDeadlineEmail({
          to: assignee.email,
          recipientName: assignee.name,
          taskTitle: task.title,
          taskDescription: task.description,
          projectName: task.project?.name,
          dueDate: task.dueDate,
          status: task.status,
          priority: task.priority,
          reminderType: lockedReminder.reminderType,
          taskId: task._id,
          projectId: task.project?._id || task.project,
        });

        // Update database record as successfully sent
        lockedReminder.deliveryStatus = 'sent';
        lockedReminder.sentTime = new Date();
        lockedReminder.resendId = emailResult.id;
        lockedReminder.subject = emailResult.subject;
        lockedReminder.errorDetails = null;
        await lockedReminder.save();

        // Socket.IO + In-App notification integration
        try {
          const { createNotification } = require('../controllers/notificationController');
          const inAppType = lockedReminder.reminderType === 'overdue' 
            ? 'task_overdue' 
            : 'task_deadline_approaching';

          let inAppMsg = `Reminder: Task "${task.title}" is due soon.`;
          if (lockedReminder.reminderType === '24h_before') inAppMsg = `Reminder: Task "${task.title}" is due in 24 hours.`;
          if (lockedReminder.reminderType === '1h_before') inAppMsg = `Urgent: Task "${task.title}" is due in 1 hour!`;
          if (lockedReminder.reminderType === 'at_deadline') inAppMsg = `Deadline reached for task "${task.title}".`;
          if (lockedReminder.reminderType === 'overdue') inAppMsg = `Urgent: Task "${task.title}" is overdue!`;

          await createNotification({
            type: inAppType,
            recipientId: assignee._id,
            projectId: task.project?._id || task.project,
            taskId: task._id,
            message: inAppMsg,
            meta: {
              dueDate: task.dueDate,
              reminderType: lockedReminder.reminderType,
              emailSent: true,
            },
          });
        } catch (notifErr) {
          console.error('[DeadlineReminderService] In-app notification creation error:', notifErr.message);
        }

        processedCount++;
        sentCount++;
      } catch (itemErr) {
        errorCount++;
        processedCount++;
        lastError = itemErr.message;
        lockedReminder.retryCount = (lockedReminder.retryCount || 0) + 1;
        lockedReminder.errorDetails = itemErr.message;
        
        if (lockedReminder.retryCount >= 3) {
          lockedReminder.deliveryStatus = 'failed';
        } else {
          // Re-queue with exponential backoff (e.g., retry in 5 minutes)
          lockedReminder.deliveryStatus = 'pending';
          lockedReminder.scheduledTime = new Date(Date.now() + 5 * 60 * 1000);
        }
        await lockedReminder.save();
      }
    }
  } catch (err) {
    console.error('[DeadlineReminderService] Fatal loop error:', err);
    lastError = err.message;
  } finally {
    isProcessing = false;
  }

  return {
    processed: processedCount,
    sent: sentCount,
    skipped: skippedCount,
    errors: errorCount,
    lastError: lastError || null,
  };
}

/**
 * Scan all active tasks in database and schedule missing reminders
 * Ensures full resilience after server restarts or database restore
 */
async function syncAllActiveTasks() {
  const stats = {
    totalActiveTasks: 0,
    syncedTasks: 0,
    skippedNoRecipient: 0,
  };

  try {
    const tasks = await Task.find({
      status: { $ne: 'Completed' },
      dueDate: { $exists: true, $ne: null },
    })
      .populate('assignee', 'name email notificationPreferences')
      .populate('createdBy', 'name email notificationPreferences')
      .populate({
        path: 'project',
        select: 'name owner',
        populate: { path: 'owner', select: 'name email notificationPreferences' },
      });

    stats.totalActiveTasks = tasks.length;

    for (const task of tasks) {
      const res = await syncTaskReminders(task);
      if (res?.status === 'no_recipient') {
        stats.skippedNoRecipient++;
      } else {
        stats.syncedTasks++;
      }
    }
  } catch (err) {
    console.error('[DeadlineReminderService] Error syncing all active tasks:', err.message);
  }

  return stats;
}

/**
 * Starts the persistent background scheduler
 */
function startScheduler(intervalMs = 60000) {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  console.log(`[DeadlineReminderService] Background scheduler started (polling every ${intervalMs / 1000}s)`);

  // Initial sync & check on startup
  syncAllActiveTasks().then(() => {
    processDueReminders();
  });

  schedulerInterval = setInterval(async () => {
    await processDueReminders();
  }, intervalMs);

  return schedulerInterval;
}

/**
 * Stop background scheduler
 */
function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[DeadlineReminderService] Background scheduler stopped');
  }
}

module.exports = {
  syncTaskReminders,
  cancelTaskReminders,
  processDueReminders,
  syncAllActiveTasks,
  startScheduler,
  stopScheduler,
  calculateScheduledTime,
  setTestMode,
};
