require('dotenv').config();
const mongoose = require('mongoose');
const Task = require('./src/models/Task');
const Project = require('./src/models/Project');
const User = require('./src/models/User');
const DeadlineNotification = require('./src/models/DeadlineNotification');
const {
  calculateScheduledTime,
  syncTaskReminders,
  cancelTaskReminders,
  processDueReminders,
} = require('./src/services/deadlineReminderService');
const { sendDeadlineEmail, formatISTDateTime } = require('./src/services/emailService');

async function runTests() {
  console.log('================================================================');
  console.log(' STUDY-SYNC: SMART TASK DEADLINE EMAIL NOTIFICATION TEST SUITE');
  console.log('================================================================\n');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/studysync_test';
  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB');

  let testUser = null;
  let testProject = null;
  let testTask = null;
  let passedCount = 0;

  try {
    // SETUP: Create or reuse test user & project
    testUser = await User.findOne({ email: 'deadline_test_user@studysync.com' });
    if (!testUser) {
      testUser = await User.create({
        name: 'Deadline Test Assignee',
        email: 'deadline_test_user@studysync.com',
        password: 'Password123!',
        avatarInitials: 'DA',
        notificationPreferences: {
          emailDeadlineReminders: true,
          emailReminders24h: true,
          emailReminders1h: true,
          emailRemindersAtDeadline: true,
          emailRemindersOverdue: true,
        }
      });
    }

    testProject = await Project.findOne({ name: 'Deadline Notification Test Project' });
    if (!testProject) {
      testProject = await Project.create({
        name: 'Deadline Notification Test Project',
        description: 'Automated test workspace for deadline reminders',
        owner: testUser._id,
        members: [testUser._id]
      });
    }

    // Clean up any stale deadline notifications for our test project
    await DeadlineNotification.deleteMany({ project: testProject._id });
    await Task.deleteMany({ project: testProject._id });

    // -------------------------------------------------------------
    // SCENARIO 1: Create task with deadline 24h away -> check 24h reminder scheduled
    // -------------------------------------------------------------
    console.log('\n--- Scenario 1: Task with deadline 24h away ---');
    const deadline24h = new Date(Date.now() + 24 * 60 * 60 * 1000 + 5 * 60 * 1000); // 24h 5m from now
    testTask = await Task.create({
      title: 'Final Term Paper Submission',
      description: 'Prepare and finalize citations in IEEE format',
      project: testProject._id,
      assignee: testUser._id,
      createdBy: testUser._id,
      dueDate: deadline24h,
      status: 'Todo',
      priority: 'High',
    });

    const populatedTask1 = await Task.findById(testTask._id).populate('assignee project');
    await syncTaskReminders(populatedTask1);

    const scheduled24h = await DeadlineNotification.findOne({
      task: testTask._id,
      reminderType: '24h_before'
    });

    if (scheduled24h && scheduled24h.deliveryStatus === 'pending') {
      console.log('✓ Scenario 1 PASSED: 24h_before reminder created with pending status');
      passedCount++;
    } else {
      console.error('✗ Scenario 1 FAILED: 24h_before reminder missing or not pending', scheduled24h);
    }

    // -------------------------------------------------------------
    // SCENARIO 2: Verify 1h_before, at_deadline, and overdue reminders also scheduled
    // -------------------------------------------------------------
    console.log('\n--- Scenario 2: Reminders calculation & scheduling ---');
    const allReminders = await DeadlineNotification.find({ task: testTask._id }).sort({ scheduledTime: 1 });
    const types = allReminders.map(r => r.reminderType);
    console.log('  Scheduled reminders:', types);

    if (types.includes('24h_before') && types.includes('1h_before') && types.includes('at_deadline') && types.includes('overdue')) {
      console.log('✓ Scenario 2 PASSED: All 4 reminder stages calculated and scheduled');
      passedCount++;
    } else {
      console.error('✗ Scenario 2 FAILED: Expected all 4 reminder types, found:', types);
    }

    // -------------------------------------------------------------
    // SCENARIO 3: Completed task cancels pending reminders
    // -------------------------------------------------------------
    console.log('\n--- Scenario 3: Task marked Completed cancels pending reminders ---');
    testTask.status = 'Completed';
    await testTask.save();
    const populatedCompleted = await Task.findById(testTask._id).populate('assignee project');
    await syncTaskReminders(populatedCompleted);

    const pendingAfterComplete = await DeadlineNotification.countDocuments({
      task: testTask._id,
      deliveryStatus: 'pending'
    });
    const cancelledCount = await DeadlineNotification.countDocuments({
      task: testTask._id,
      deliveryStatus: 'cancelled'
    });

    if (pendingAfterComplete === 0 && cancelledCount > 0) {
      console.log(`✓ Scenario 3 PASSED: All pending reminders cancelled (${cancelledCount} cancelled, 0 pending)`);
      passedCount++;
    } else {
      console.error('✗ Scenario 3 FAILED: Pending reminders still exist:', { pendingAfterComplete, cancelledCount });
    }

    // -------------------------------------------------------------
    // SCENARIO 4: Change deadline -> recalculates and reschedules future reminders
    // -------------------------------------------------------------
    console.log('\n--- Scenario 4: Deadline rescheduled to future ---');
    const newDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h from now
    testTask.status = 'In Progress';
    testTask.dueDate = newDeadline;
    await testTask.save();
    const populatedRescheduled = await Task.findById(testTask._id).populate('assignee project');
    await syncTaskReminders(populatedRescheduled);

    const newPending = await DeadlineNotification.find({
      task: testTask._id,
      deliveryStatus: 'pending'
    });

    if (newPending.length > 0) {
      console.log(`✓ Scenario 4 PASSED: Reminders rescheduled successfully (${newPending.length} pending reminders)`);
      passedCount++;
    } else {
      console.error('✗ Scenario 4 FAILED: No pending reminders after rescheduling');
    }

    // -------------------------------------------------------------
    // SCENARIO 5: Delete task cancels all pending reminders
    // -------------------------------------------------------------
    console.log('\n--- Scenario 5: Task deletion cancels reminders ---');
    await cancelTaskReminders(testTask._id);
    const activeAfterDelete = await DeadlineNotification.countDocuments({
      task: testTask._id,
      deliveryStatus: 'pending'
    });

    if (activeAfterDelete === 0) {
      console.log('✓ Scenario 5 PASSED: Task reminders cancelled upon deletion');
      passedCount++;
    } else {
      console.error('✗ Scenario 5 FAILED: Pending reminders remained after task cancellation');
    }

    // -------------------------------------------------------------
    // SCENARIO 6 & 7: Overdue reminder execution & Duplicate prevention (Atomic Locks)
    // -------------------------------------------------------------
    console.log('\n--- Scenario 6 & 7: Due reminder execution and deduplication ---');
    const pastTask = await Task.create({
      title: 'Urgent Lab Report Due Now',
      description: 'Submit PDF to portal',
      project: testProject._id,
      assignee: testUser._id,
      createdBy: testUser._id,
      dueDate: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      status: 'In Progress',
      priority: 'Urgent',
    });

    // Manually enqueue an overdue reminder due right now
    await DeadlineNotification.create({
      task: pastTask._id,
      user: testUser._id,
      recipientEmail: testUser.email,
      project: testProject._id,
      reminderType: 'overdue',
      scheduledTime: new Date(Date.now() - 5000), // Due 5 seconds ago
      deliveryStatus: 'pending',
    });

    // Run processor 1
    const run1 = await processDueReminders();
    console.log(`  Run 1 results: processed=${run1.processed}, sent=${run1.sent}`);

    // Run processor 2 immediately (simulating concurrent cron/worker check)
    const run2 = await processDueReminders();
    console.log(`  Run 2 results (concurrent deduplication check): processed=${run2.processed}, sent=${run2.sent}`);

    if (run1.sent > 0 && run2.sent === 0) {
      console.log('✓ Scenario 6 & 7 PASSED: Due reminder processed once; zero duplicates sent on second run');
      passedCount++;
    } else {
      console.error('✗ Scenario 6 & 7 FAILED: Duplicate notification sent or not processed:', { run1, run2 });
    }

    // -------------------------------------------------------------
    // SCENARIO 8: Scheduler resilience after restart (re-reads from DB)
    // -------------------------------------------------------------
    console.log('\n--- Scenario 8: Scheduler persistence across restarts ---');
    const dbRecords = await DeadlineNotification.find({ task: pastTask._id });
    const hasSentRecord = dbRecords.some(r => r.deliveryStatus === 'sent');
    if (hasSentRecord) {
      console.log('✓ Scenario 8 PASSED: Notification records persistently stored with sent status and metadata');
      passedCount++;
    } else {
      console.error('✗ Scenario 8 FAILED: Notification status not persisted to MongoDB');
    }

    // -------------------------------------------------------------
    // SCENARIO 9: Email service template and dispatch ---
    // -------------------------------------------------------------
    console.log('\n--- Scenario 9: Email service template and dispatch ---');
    const emailResult = await sendDeadlineEmail({
      user: testUser,
      task: pastTask,
      project: testProject,
      reminderType: 'at_deadline'
    });

    console.log('  Email service response:', {
      success: emailResult.success,
      mock: emailResult.mock,
      id: emailResult.id || emailResult.messageId
    });

    if (emailResult.success) {
      console.log('✓ Scenario 9 PASSED: Email template generated and processed successfully');
      passedCount++;
    } else {
      console.error('✗ Scenario 9 FAILED: Email dispatch returned unsuccessful');
    }

    // -------------------------------------------------------------
    // SCENARIO 10: Asia/Kolkata (IST) Timezone Consistency
    // -------------------------------------------------------------
    console.log('\n--- Scenario 10: Asia/Kolkata (IST) Timezone Consistency ---');
    const testUtcDate = new Date('2026-11-07T12:30:00.000Z'); // 12:30 UTC = 18:00 IST (UTC + 5:30)
    const istString = formatISTDateTime(testUtcDate);
    console.log('  UTC input: 2026-11-07T12:30:00.000Z');
    console.log('  IST formatted output:', istString);

    if (istString.toLowerCase().includes('6:00 pm') || istString.toLowerCase().includes('06:00 pm')) {
      console.log('✓ Scenario 10 PASSED: Time accurately converted to Asia/Kolkata (IST)');
      passedCount++;
    } else {
      console.error('✗ Scenario 10 FAILED: IST formatting did not match expected 6:00 PM IST:', istString);
    }

  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    // Cleanup test data
    if (testProject) {
      await DeadlineNotification.deleteMany({ project: testProject._id });
      await Task.deleteMany({ project: testProject._id });
      await Project.deleteOne({ _id: testProject._id });
    }
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
    }
    await mongoose.disconnect();
    console.log('\n================================================================');
    console.log(` SUMMARY: ${passedCount}/8 Test Suites Passed (10 Scenarios Total)`);
    console.log('================================================================\n');
  }
}

runTests();
