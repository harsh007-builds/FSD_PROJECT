#!/usr/bin/env node
/**
 * StudySync - Standalone Deadline Reminders Cron Processor
 * 
 * Designed for execution as a recurring Render Cron Job or manual CLI script.
 * Runs once, processes due reminders, logs metrics, and exits cleanly.
 * Does NOT start the Express server or Socket.IO listener.
 * 
 * Usage:
 *   node scripts/processDeadlineReminders.js           # Production Cron mode
 *   node scripts/processDeadlineReminders.js --test    # Test verification mode (instant delivery check)
 *   node scripts/processDeadlineReminders.js --verbose # Verbose logging
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Task = require('../src/models/Task');
const User = require('../src/models/User');
const Project = require('../src/models/Project');
const DeadlineNotification = require('../src/models/DeadlineNotification');
const {
  processDueReminders,
  syncAllActiveTasks,
  syncTaskReminders,
} = require('../src/services/deadlineReminderService');
const { sendDeadlineEmail, formatISTDateTime } = require('../src/services/emailService');

// Parse CLI arguments
const args = process.argv.slice(2);
const isTestMode = args.includes('--test') || process.env.TEST_MODE === 'true';
const isVerbose = args.includes('--verbose') || process.env.VERBOSE === 'true';
const targetEmailArg = args.find(a => a.startsWith('--to='))?.split('=')[1];

// Asia/Kolkata (IST) Timezone Formatter
function formatIST(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(new Date(date)) + ' (IST)';
  } catch {
    return new Date(date).toISOString();
  }
}

async function runTestVerification(targetEmail) {
  console.log('\n[TEST MODE] Initiating Instant Deadline Email Verification...');

  // Locate or create test user
  let recipient = null;
  if (targetEmail) {
    recipient = await User.findOne({ email: targetEmail.toLowerCase().trim() });
    if (!recipient) {
      console.log(`  Target user not found for ${targetEmail}. Using direct dispatch test...`);
    }
  }

  if (!recipient) {
    recipient = await User.findOne({ 'notificationPreferences.emailDeadlineReminders': { $ne: false } });
  }

  const emailToUse = targetEmail || recipient?.email || 'test@example.com';
  const nameToUse = recipient?.name || 'StudySync User';

  console.log(`  Recipient: ${nameToUse} <${emailToUse}>`);

  // Create temporary in-memory test objects
  const dummyProject = {
    _id: new mongoose.Types.ObjectId(),
    name: 'StudySync Deadline Test Suite',
  };

  const dummyTask = {
    _id: new mongoose.Types.ObjectId(),
    title: 'Verify StudySync Email Notifications via Render Cron',
    description: 'This test email confirms that your standalone Render Cron Job processor is functioning and communicating with Resend.',
    dueDate: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    status: 'In Progress',
    priority: 'High',
  };

  console.log(`  Dispatching sample reminder via Resend...`);
  const result = await sendDeadlineEmail({
    to: emailToUse,
    recipientName: nameToUse,
    taskTitle: dummyTask.title,
    taskDescription: dummyTask.description,
    projectName: dummyProject.name,
    dueDate: dummyTask.dueDate,
    status: dummyTask.status,
    priority: dummyTask.priority,
    reminderType: '1h_before',
    taskId: dummyTask._id,
    projectId: dummyProject._id,
  });

  console.log('\n================================================================');
  console.log(' TEST VERIFICATION RESULT');
  console.log('================================================================');
  if (result.success) {
    if (result.mock) {
      console.log('✓ TEST STATUS: SUCCESS (Development Mock Mode)');
      console.log('  Reason: RESEND_API_KEY is not set or in test mode.');
      console.log('  Mock Message ID:', result.id);
      console.log('  Action: Configure RESEND_API_KEY in Render to send live emails.');
    } else {
      console.log('✓ TEST STATUS: SUCCESS (Live Resend Delivery)');
      console.log('  Resend Message ID:', result.id);
      console.log('  Recipient:', result.to);
      console.log('  Subject:', result.subject);
    }
  } else {
    console.error('✗ TEST STATUS: FAILED', result);
  }
  console.log('================================================================\n');

  return result;
}

async function main() {
  const startTime = Date.now();
  console.log('================================================================');
  console.log(' STUDY-SYNC: STANDALONE DEADLINE REMINDER CRON PROCESSOR');
  console.log(` Execution Started at: ${formatIST()}`);
  console.log(` Mode: ${isTestMode ? 'Test Verification' : 'Production Cron Sweep'}`);
  console.log('================================================================\n');

  // 1. Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('[FATAL] MONGODB_URI environment variable is missing.');
    process.exit(1);
  }

  try {
    console.log('[DB] Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log(`[DB] Connected successfully to host: ${mongoose.connection.host}`);
  } catch (dbErr) {
    console.error('[DB FATAL] Could not connect to MongoDB:', dbErr.message);
    process.exit(1);
  }

  try {
    // If running with --test flag, execute the instant verification flow
    if (isTestMode) {
      await runTestVerification(targetEmailArg);
    }

    // 2. Synchronize active tasks to ensure new/updated tasks have reminder schedules
    console.log('[SYNC] Scanning database for active tasks to schedule missing reminders...');
    await syncAllActiveTasks();

    // 3. Inspect pending reminders
    const now = new Date();
    const totalPendingCount = await DeadlineNotification.countDocuments({ deliveryStatus: 'pending' });
    const dueCount = await DeadlineNotification.countDocuments({
      deliveryStatus: 'pending',
      scheduledTime: { $lte: now },
    });

    console.log(`[QUEUE] Current pending reminders in DB: ${totalPendingCount}`);
    console.log(`[QUEUE] Reminders currently due (<= ${formatIST(now)}): ${dueCount}`);

    // 4. Process all due reminders atomically
    console.log('[PROCESS] Executing atomic deadline reminder processing cycle...');
    const result = await processDueReminders();

    const durationMs = Date.now() - startTime;
    console.log('\n================================================================');
    console.log(' CRON EXECUTION SUMMARY');
    console.log('================================================================');
    console.log(` Total Reminders Processed : ${result.processed}`);
    console.log(` Emails Dispatched         : ${result.sent}`);
    console.log(` Reminders Skipped/Cancelled: ${result.skipped}`);
    console.log(` Errors Encountered        : ${result.errors}`);
    console.log(` Execution Duration        : ${durationMs}ms`);
    console.log(` Finished at               : ${formatIST()}`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('[CRON ERROR] Unhandled exception during execution:', err);
    process.exitCode = 1;
  } finally {
    try {
      console.log('[DB] Disconnecting cleanly from MongoDB...');
      await mongoose.disconnect();
      console.log('[DB] Disconnected.');
    } catch (discErr) {
      console.error('[DB] Error during disconnect:', discErr.message);
    }
  }
}

// Execute standalone script
main().then(() => {
  process.exit(process.exitCode || 0);
}).catch((fatalErr) => {
  console.error('[FATAL PROCESS ERROR]', fatalErr);
  process.exit(1);
});
