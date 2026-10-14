const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'project_created',
        'project_updated',
        'member_added',
        'member_removed',
        'role_updated',
        'ownership_transferred',
        'invitation_sent',
        'invitation_accepted',
        'invitation_declined',
        'task_created',
        'task_assigned',
        'task_reassigned',
        'task_status_changed',
        'task_completed',
        'task_deleted',
        'project_deleted',
        'resource_created',
        'resource_uploaded',
        'resource_updated',
        'resource_deleted',
        'note_created',
        'note_updated',
        'note_deleted',
        'note_restored',
        'session_created',
        'session_updated',
        'session_started',
        'session_completed',
        'session_cancelled',
      ],
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
    },
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resource',
    },
    note: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Note',
    },
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
    },
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

activitySchema.index({ project: 1, createdAt: -1 });
activitySchema.index({ user: 1, createdAt: -1 });

const Activity = mongoose.model('Activity', activitySchema);

module.exports = Activity;
