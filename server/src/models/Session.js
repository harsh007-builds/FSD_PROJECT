const mongoose = require('mongoose');

const sessionGoalSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { _id: true }
);

const sessionSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project reference is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Session title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    agenda: {
      type: String,
      default: '',
      maxlength: [5000, 'Agenda cannot exceed 5000 characters'],
    },
    startTime: {
      type: Date,
      required: [true, 'Start time is required'],
      index: true,
    },
    duration: {
      type: Number,
      required: [true, 'Duration in minutes is required'],
      min: [5, 'Duration must be at least 5 minutes'],
      max: [720, 'Duration cannot exceed 12 hours (720 minutes)'],
      default: 60,
    },
    status: {
      type: String,
      enum: ['Scheduled', 'In Progress', 'Completed', 'Cancelled'],
      default: 'Scheduled',
      index: true,
    },
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    goals: [sessionGoalSchema],
    timerConfig: {
      mode: {
        type: String,
        enum: ['pomodoro', 'countdown', 'stopwatch'],
        default: 'pomodoro',
      },
      workInterval: {
        type: Number,
        default: 25,
      },
      breakInterval: {
        type: Number,
        default: 5,
      },
      longBreakInterval: {
        type: Number,
        default: 15,
      },
      cycles: {
        type: Number,
        default: 4,
      },
    },
    timerState: {
      status: {
        type: String,
        enum: ['idle', 'running', 'paused', 'finished'],
        default: 'idle',
      },
      phase: {
        type: String,
        enum: ['work', 'break', 'long_break'],
        default: 'work',
      },
      currentCycle: {
        type: Number,
        default: 1,
      },
      startedAt: {
        type: Date,
      },
      pausedAt: {
        type: Date,
      },
      remainingSeconds: {
        type: Number,
        default: 1500, // 25 mins
      },
      targetEndTime: {
        type: Date,
      },
    },
    linkedTasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task',
      },
    ],
    linkedNotes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Note',
      },
    ],
    linkedResources: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Resource',
      },
    ],
    startedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    summaryNotes: {
      type: String,
      default: '',
      maxlength: [5000, 'Summary notes cannot exceed 5000 characters'],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
sessionSchema.index({ project: 1, status: 1, startTime: 1 });
sessionSchema.index({ project: 1, host: 1 });

module.exports = mongoose.model('Session', sessionSchema);
