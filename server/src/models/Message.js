const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: [true, 'Message content cannot be empty'],
      trim: true,
      minlength: [1, 'Message content cannot be empty'],
      maxlength: [4000, 'Message cannot exceed 4000 characters'],
    },
    // Optional parent message reference for replies / threads
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
      index: true,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    // Tracking read receipts per member
    readBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // Optional light attachments (e.g. referencing uploaded project resources or images)
    attachments: [
      {
        name: { type: String, trim: true },
        url: { type: String, trim: true },
        fileType: { type: String, trim: true },
        fileSize: { type: Number, default: 0 },
      },
    ],
    pinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for rapid chronological queries & cursor pagination
messageSchema.index({ project: 1, createdAt: -1 });
messageSchema.index({ project: 1, _id: -1 });
messageSchema.index({ project: 1, 'readBy.user': 1 });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
