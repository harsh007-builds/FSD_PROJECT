const mongoose = require('mongoose');

const deadlineNotificationSchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      index: true,
    },
    reminderType: {
      type: String,
      enum: ['24h_before', '1h_before', 'at_deadline', 'overdue'],
      required: true,
    },
    scheduledTime: {
      type: Date,
      required: true,
      index: true,
    },
    sentTime: {
      type: Date,
    },
    deliveryStatus: {
      type: String,
      enum: ['pending', 'processing', 'sent', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    errorDetails: {
      type: String,
    },
    recipientEmail: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
    },
    resendId: {
      type: String,
    },
    metadata: {
      taskTitle: String,
      projectName: String,
      dueDate: Date,
      status: String,
      priority: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index ensuring only one reminder of a given type exists per task
deadlineNotificationSchema.index({ task: 1, reminderType: 1 }, { unique: true });
deadlineNotificationSchema.index({ deliveryStatus: 1, scheduledTime: 1 });

const DeadlineNotification = mongoose.model('DeadlineNotification', deadlineNotificationSchema);

module.exports = DeadlineNotification;
