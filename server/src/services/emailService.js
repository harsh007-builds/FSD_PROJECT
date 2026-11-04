const { Resend } = require('resend');

// Helper to format date in Asia/Kolkata (IST, UTC+5:30)
function formatISTDateTime(date) {
  if (!date) return 'Not set';
  const d = new Date(date);
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }) + ' (IST)';
}

// Map reminder type to subject line and visual metadata
const REMINDER_METADATA = {
  '24h_before': {
    subjectPrefix: 'Reminder: Your StudySync task is due in 24 hours',
    badgeText: 'DUE IN 24 HOURS',
    badgeBg: '#1e3a8a',
    badgeColor: '#60a5fa',
    headerGradient: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
    headline: 'Upcoming Deadline Alert',
    messageText: 'This is a friendly reminder that you have a task due in approximately 24 hours. Please review the details below and ensure everything is on track.',
  },
  '1h_before': {
    subjectPrefix: 'Urgent: Your StudySync task is due in 1 hour',
    badgeText: 'DUE IN 1 HOUR',
    badgeBg: '#78350f',
    badgeColor: '#fbbf24',
    headerGradient: 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
    headline: 'Urgent Deadline Warning',
    messageText: 'Your task deadline is fast approaching in less than 1 hour! Please wrap up your changes or update your task status in StudySync.',
  },
  'at_deadline': {
    subjectPrefix: 'Deadline reached: Complete your StudySync task',
    badgeText: 'DEADLINE REACHED',
    badgeBg: '#7c2d12',
    badgeColor: '#fb923c',
    headerGradient: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
    headline: 'Task Deadline Has Arrived',
    messageText: 'The scheduled deadline for this task has just passed. If you have already finished it, please mark the task as Completed in your workspace.',
  },
  'overdue': {
    subjectPrefix: 'Overdue Task Alert – StudySync',
    badgeText: 'TASK OVERDUE',
    badgeBg: '#881337',
    badgeColor: '#f43f5e',
    headerGradient: 'linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)',
    headline: 'Action Required: Task Overdue',
    messageText: 'This task is past its deadline and is currently marked incomplete. Please review your progress and coordinate with your project team.',
  },
};

/**
 * Builds clean, responsive, dark-mode branded HTML email template for StudySync
 */
function buildDeadlineEmailHtml({
  recipientName,
  taskTitle,
  taskDescription,
  projectName,
  dueDate,
  status,
  priority,
  reminderType,
  frontendUrl,
  taskId,
  projectId,
}) {
  const meta = REMINDER_METADATA[reminderType] || REMINDER_METADATA['24h_before'];
  const formattedDeadlineIST = formatISTDateTime(dueDate);
  const taskUrl = projectId 
    ? `${frontendUrl}/projects/${projectId}?task=${taskId}` 
    : `${frontendUrl}/tasks`;

  const priorityColor = 
    priority === 'Urgent' ? '#ef4444' :
    priority === 'High' ? '#f97316' :
    priority === 'Medium' ? '#eab308' : '#3b82f6';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${meta.subjectPrefix}: ${taskTitle}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0b0f19;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #0b0f19;
      padding: 30px 10px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #111827;
      border: 1px solid #1f2937;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4);
    }
    .brand-header {
      padding: 24px 32px 18px;
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
      text-align: left;
    }
    .brand-title {
      font-size: 20px;
      font-weight: 800;
      color: #ffffff;
      text-decoration: none;
      letter-spacing: -0.5px;
    }
    .brand-accent {
      color: #3b82f6;
    }
    .banner {
      padding: 28px 32px;
      background: ${meta.headerGradient};
      color: #ffffff;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      background-color: rgba(0, 0, 0, 0.3);
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      border-radius: 9999px;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
      text-transform: uppercase;
    }
    .headline {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      line-height: 1.25;
      color: #ffffff;
    }
    .content {
      padding: 32px;
      background-color: #111827;
    }
    .salutation {
      font-size: 15px;
      color: #cbd5e1;
      margin-top: 0;
      margin-bottom: 12px;
    }
    .message-text {
      font-size: 14px;
      line-height: 1.6;
      color: #94a3b8;
      margin-top: 0;
      margin-bottom: 24px;
    }
    .card {
      background-color: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 28px;
    }
    .task-title {
      font-size: 17px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 8px 0;
    }
    .task-desc {
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.5;
      margin: 0 0 16px 0;
    }
    .detail-row {
      display: flex;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .detail-label {
      width: 110px;
      color: #64748b;
      font-weight: 600;
    }
    .detail-value {
      color: #e2e8f0;
      font-weight: 500;
    }
    .btn-container {
      text-align: center;
      margin: 30px 0 10px;
    }
    .btn {
      display: inline-block;
      background-color: #2563eb;
      color: #ffffff !important;
      font-size: 14px;
      font-weight: 700;
      padding: 12px 28px;
      border-radius: 10px;
      text-decoration: none;
      box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.4);
    }
    .footer {
      padding: 24px 32px;
      background-color: #0b0f19;
      border-top: 1px solid #1e293b;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      line-height: 1.5;
    }
    .footer a {
      color: #3b82f6;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <!-- BRAND HEADER -->
      <div class="brand-header">
        <a href="${frontendUrl}" class="brand-title">
          Study<span class="brand-accent">Sync</span>
        </a>
      </div>

      <!-- REMINDER BANNER -->
      <div class="banner">
        <span class="badge">${meta.badgeText}</span>
        <h1 class="headline">${meta.headline}</h1>
      </div>

      <!-- CONTENT -->
      <div class="content">
        <p class="salutation">Hello ${recipientName || 'there'},</p>
        <p class="message-text">${meta.messageText}</p>

        <!-- TASK DETAILS CARD -->
        <div class="card">
          <h2 class="task-title">${taskTitle}</h2>
          ${taskDescription ? `<p class="task-desc">${taskDescription}</p>` : ''}

          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 6px 0; color: #64748b; width: 110px; font-weight: 600;">Project:</td>
              <td style="padding: 6px 0; color: #ffffff; font-weight: 600;">📁 ${projectName || 'General Workspace'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Deadline:</td>
              <td style="padding: 6px 0; color: #f87171; font-weight: 700;">⏰ ${formattedDeadlineIST}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Status:</td>
              <td style="padding: 6px 0; color: #e2e8f0;">
                <span style="display: inline-block; padding: 2px 8px; border-radius: 6px; background-color: #1e293b; font-size: 11px;">
                  ${status || 'Todo'}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Priority:</td>
              <td style="padding: 6px 0; color: ${priorityColor}; font-weight: 600;">
                ${priority || 'Medium'}
              </td>
            </tr>
          </table>
        </div>

        <!-- ACTION BUTTON -->
        <div class="btn-container">
          <a href="${taskUrl}" class="btn" target="_blank">
            Open Task in StudySync →
          </a>
        </div>
      </div>

      <!-- FOOTER -->
      <div class="footer">
        <p style="margin: 0 0 6px 0;">
          You received this email because you are assigned to this task in StudySync with deadline alerts enabled.
        </p>
        <p style="margin: 0;">
          © ${new Date().getFullYear()} StudySync. Real-Time Collaborative Study & Project Workspace.
          <br>
          <a href="${frontendUrl}">Visit Dashboard</a> • Timezone: Asia/Kolkata (IST)
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Send deadline reminder email via Resend API
 */
async function sendDeadlineEmail({
  to,
  recipientName,
  taskTitle,
  taskDescription,
  projectName,
  dueDate,
  status,
  priority,
  reminderType,
  taskId,
  projectId,
  user,
  task,
  project,
}) {
  if (user) {
    to = to || user.email;
    recipientName = recipientName || user.name;
  }
  if (task) {
    taskTitle = taskTitle || task.title || task.task;
    taskDescription = taskDescription || task.description;
    dueDate = dueDate || task.dueDate;
    status = status || task.status;
    priority = priority || task.priority;
    taskId = taskId || task._id || task.id;
  }
  if (project) {
    projectName = projectName || project.name;
    projectId = projectId || project._id || project.id;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || 'StudySync <onboarding@resend.dev>';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const meta = REMINDER_METADATA[reminderType] || REMINDER_METADATA['24h_before'];
  const subject = `${meta.subjectPrefix}: "${taskTitle}"`;

  const html = buildDeadlineEmailHtml({
    recipientName,
    taskTitle,
    taskDescription,
    projectName,
    dueDate,
    status,
    priority,
    reminderType,
    frontendUrl,
    taskId,
    projectId,
  });

  // Mock / Safe development mode when no RESEND_API_KEY is supplied
  if (!apiKey || apiKey === 'test' || apiKey === 'mock') {
    const mockId = `mock_resend_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.log(`[EmailService MOCK] Sending to: ${to} | Subject: "${subject}" | MockID: ${mockId}`);
    return {
      success: true,
      id: mockId,
      mock: true,
      to,
      subject,
    };
  }

  // Live Resend API call
  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: fromEmail,
      to: [to],
      subject,
      html,
    });

    if (result.error) {
      throw new Error(result.error.message || JSON.stringify(result.error));
    }

    console.log(`[EmailService LIVE] Email dispatched to ${to} via Resend. Message ID: ${result.data?.id}`);
    return {
      success: true,
      id: result.data?.id,
      mock: false,
      to,
      subject,
    };
  } catch (error) {
    console.error(`[EmailService ERROR] Failed to send email via Resend to ${to}:`, error.message);
    throw error;
  }
}

module.exports = {
  sendDeadlineEmail,
  buildDeadlineEmailHtml,
  formatISTDateTime,
  REMINDER_METADATA,
};
