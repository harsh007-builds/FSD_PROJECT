const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Task must belong to a project'],
      index: true, // Indexed because we frequently query tasks by project
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
    },
    type: {
      type: String,
      enum: ['Task', 'Milestone', 'Study Session'],
      default: 'Task',
    },
    status: {
      type: String,
      enum: ['Backlog', 'Todo', 'In Progress', 'Review', 'Completed'],
      default: 'Todo',
    },
    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    dueDate: {
      type: Date,
    },
    labels: [{
      type: String,
      trim: true,
    }],
    order: {
      type: Number,
      default: 0,
    },
    comments: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        text: {
          type: String,
          required: [true, 'Comment text is required'],
          trim: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

taskSchema.index({ project: 1, status: 1 });
taskSchema.index({ project: 1, assignee: 1 });
taskSchema.index({ project: 1, dueDate: 1 });
taskSchema.index({ title: 'text', description: 'text', labels: 'text' });
taskSchema.index({ assignee: 1, status: 1 });

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
