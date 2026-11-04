const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');

// Ensure dotenv is loaded even if this module is evaluated in different contexts
require('dotenv').config();
if (!process.env.CRON_SECRET) {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
}

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

/**
 * Strips whitespace and wrapping quotes (e.g., "my_secret" or 'my_secret')
 * that often get introduced during dashboard copy-pasting
 */
function cleanSecret(val) {
  if (typeof val !== 'string') return '';
  let cleaned = val.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

/**
 * Safely discovers and cleans the server secret from process.env
 * Handles variations in case, whitespace, or dashboard naming
 */
function getServerSecret() {
  // 1. Direct standard environment variable lookup
  if (process.env.CRON_SECRET) {
    const cleaned = cleanSecret(process.env.CRON_SECRET);
    if (cleaned.length > 0) return cleaned;
  }

  // 2. Fallback: Search all environment keys case-insensitively with quotes/spaces stripped
  for (const rawKey of Object.keys(process.env)) {
    const normalizedKey = rawKey.trim().replace(/^["']|["']$/g, '').toUpperCase();
    if (
      normalizedKey === 'CRON_SECRET' ||
      normalizedKey === 'CRON_SECRET_KEY' ||
      normalizedKey === 'RENDER_CRON_SECRET'
    ) {
      const cleaned = cleanSecret(process.env[rawKey]);
      if (cleaned.length > 0) {
        return cleaned;
      }
    }
  }

  return null;
}

/**
 * Constant-time comparison using SHA-256 fixed-length digests
 * Prevents timing attacks, prevents buffer length mismatches, and never crashes
 */
function safeCompare(clientStr, serverStr) {
  if (typeof clientStr !== 'string' || typeof serverStr !== 'string') return false;
  if (!clientStr || !serverStr) return false;
  const hashClient = crypto.createHash('sha256').update(clientStr).digest();
  const hashServer = crypto.createHash('sha256').update(serverStr).digest();
  return crypto.timingSafeEqual(hashClient, hashServer);
}

/**
 * Middleware: Strictly verify CRON_SECRET with safe diagnostic logging
 */
const verifyCronSecret = (req, res, next) => {
  const serverSecret = getServerSecret();
  const isConfigured = Boolean(serverSecret && serverSecret.length > 0);
  const secretLength = isConfigured ? serverSecret.length : 0;

  // Safe diagnostic log: reports ONLY existence and length, NEVER the secret value
  console.log(`[CRON DIAGNOSTIC] CRON_SECRET configured: ${isConfigured}, length: ${secretLength}`);

  if (!isConfigured) {
    console.error(`[CRON ERROR] CRON_SECRET is not configured or empty on the server at ${formatIST()}`);
    return res.status(500).json({
      error: 'CRON_SECRET is not configured on the server',
      diagnostic: {
        configured: false,
        length: 0,
        hint: 'Please ensure CRON_SECRET is defined in your Render environment variables and that the backend service has completed redeployment.',
      },
    });
  }

  // Extract client secret from various common header conventions
  let rawClientSecret =
    req.headers['x-cron-secret'] ||
    req.headers['x_cron_secret'] ||
    req.headers['cron-secret'] ||
    req.headers['cron_secret'];

  // Fallback: Check standard Authorization Bearer header
  if (!rawClientSecret && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && (parts[0] === 'Bearer' || parts[0] === 'Token')) {
      rawClientSecret = parts[1];
    }
  }

  // Fallback: Check query parameter (e.g., ?secret=...)
  if (!rawClientSecret && (req.query?.secret || req.query?.cron_secret)) {
    rawClientSecret = req.query.secret || req.query.cron_secret;
  }

  const clientSecret = cleanSecret(rawClientSecret);
  const isClientProvided = Boolean(clientSecret && clientSecret.length > 0);
  const clientLength = isClientProvided ? clientSecret.length : 0;

  // Safe diagnostic log for incoming client token
  console.log(`[CRON DIAGNOSTIC] Incoming client secret provided: ${isClientProvided}, length: ${clientLength}`);

  // Securely compare
  if (!isClientProvided || !safeCompare(clientSecret, serverSecret)) {
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
    // 1. Synchronize active tasks to ensure new/modified tasks have reminder schedules
    await syncAllActiveTasks();

    // 2. Inspect pending and due reminders in database
    const now = new Date();
    const totalPendingCount = await DeadlineNotification.countDocuments({ deliveryStatus: 'pending' });
    const dueCount = await DeadlineNotification.countDocuments({
      deliveryStatus: 'pending',
      scheduledTime: { $lte: now },
    });

    console.log(`[EXTERNAL CRON] Queue state: ${totalPendingCount} pending, ${dueCount} due now`);

    // 3. Process due reminders atomically (with atomic locking, idempotent checks, and failure tracking)
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
