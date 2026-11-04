const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const DeadlineNotification = require('../models/DeadlineNotification');
const {
  processDueReminders,
  syncAllActiveTasks,
} = require('../services/deadlineReminderService');

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

// Constant-time string comparison to prevent timing attacks
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Middleware: Strictly verify CRON_SECRET
const verifyCronSecret = (req, res, next) => {
  const serverSecret = process.env.CRON_SECRET;
  if (!serverSecret) {
    console.error('[CRON ERROR] CRON_SECRET is not configured on the server');
    return res.status(500).json({
      error: 'CRON_SECRET is not configured on the server',
    });
  }

  // Extract secret from x-cron-secret header or Authorization: Bearer <token>
  let clientSecret = req.headers['x-cron-secret'];
  if (!clientSecret && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && (parts[0] === 'Bearer' || parts[0] === 'Token')) {
      clientSecret = parts[1];
    }
  }

  // Reject missing or non-matching secrets securely
  if (!clientSecret || !safeCompare(clientSecret, serverSecret)) {
    const callerIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.warn(`[CRON WARN] Unauthorized attempt to access internal cron endpoint from IP: ${callerIp} at ${formatIST()}`);
    return res.status(401).json({
      error: 'Unauthorized: Invalid or missing cron secret',
    });
  }

  next();
};

/**
 * @desc    Process all due task deadline email reminders (for external schedulers like cron-job.org)
 * @route   POST /api/internal/process-deadline-reminders
 * @access  Private (Guarded by CRON_SECRET)
 */
router.post('/process-deadline-reminders', verifyCronSecret, async (req, res, next) => {
  const startTime = Date.now();
  const startTimeIST = formatIST();
  const callerIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  console.log(`[EXTERNAL CRON TRIGGER] Request received from ${callerIp} at ${startTimeIST}`);

  try {
    // 1. Sync active tasks to ensure newly created/updated tasks have reminder schedules
    await syncAllActiveTasks();

    // 2. Count current pending and due reminders in the database
    const now = new Date();
    const totalPendingCount = await DeadlineNotification.countDocuments({ deliveryStatus: 'pending' });
    const dueCount = await DeadlineNotification.countDocuments({
      deliveryStatus: 'pending',
      scheduledTime: { $lte: now },
    });

    console.log(`[EXTERNAL CRON] Queue state: ${totalPendingCount} pending, ${dueCount} due now`);

    // 3. Process due reminders atomically (with distributed locks and deduplication)
    const result = await processDueReminders();
    const durationMs = Date.now() - startTime;
    const finishTimeIST = formatIST();

    console.log(`[EXTERNAL CRON FINISHED] Processed: ${result.processed}, Sent: ${result.sent}, Skipped: ${result.skipped}, Errors: ${result.errors} in ${durationMs}ms`);

    return res.status(200).json({
      success: true,
      message: 'Deadline reminder processing cycle completed successfully',
      timestamp: finishTimeIST,
      metrics: {
        scannedPending: totalPendingCount,
        dueCount,
        processed: result.processed,
        sent: result.sent,
        skipped: result.skipped,
        errors: result.errors,
        durationMs,
      },
    });
  } catch (error) {
    console.error('[EXTERNAL CRON ERROR] Failure during deadline sweep:', error);
    next(error);
  }
});

module.exports = router;
