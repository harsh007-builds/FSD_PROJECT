const mongoose = require('mongoose');

const noteRevisionSchema = new mongoose.Schema(
  {
    version: {
      type: Number,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      default: 'General',
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    editedAt: {
      type: Date,
      default: Date.now,
    },
    changeSummary: {
      type: String,
      default: '',
    },
  },
  { _id: true }
);

const noteSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project reference is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Note title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    content: {
      type: String,
      default: '',
      maxlength: [50000, 'Note content cannot exceed 50,000 characters'],
    },
    category: {
      type: String,
      enum: ['General', 'Lecture', 'Meeting', 'Brainstorm', 'Research', 'Summary', 'Code'],
      default: 'General',
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: 50,
      },
    ],
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastEditor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    color: {
      type: String,
      default: 'blue',
      enum: ['blue', 'purple', 'emerald', 'amber', 'rose', 'indigo', 'cyan', 'slate'],
    },
    revisions: [noteRevisionSchema],
  },
  {
    timestamps: true,
  }
);

// Compound indexes for sorting and lookup
noteSchema.index({ project: 1, isPinned: -1, updatedAt: -1 });
noteSchema.index({ project: 1, category: 1 });
noteSchema.index({ title: 'text', content: 'text', tags: 'text' });

module.exports = mongoose.model('Note', noteSchema);
