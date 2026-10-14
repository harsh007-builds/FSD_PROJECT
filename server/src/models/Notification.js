const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'task_assigned',
        'task_reassigned',
        'task_status_changed',
        'task_deadline_approaching',
        'task_overdue',
        'task_completed',
        'project_updated',
        'project_invitation',
        'invitation_accepted',
        'invitation_declined',
        'role_changed',
        'ownership_transferred',
        'member_removed',
        'added_to_project',
        'member_left',
      ],
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
    },
    invitation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invitation',
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
    },
    message: {
      type: String,
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1, project: 1, task: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
