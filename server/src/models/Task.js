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
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
