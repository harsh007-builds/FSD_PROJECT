const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    uploader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Resource title is required'],
      trim: true,
      maxlength: 150,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    type: {
      type: String,
      enum: ['file', 'link'],
      required: true,
      default: 'file',
    },
    category: {
      type: String,
      enum: ['Document', 'Image', 'Code', 'Video/Audio', 'Link', 'Other'],
      default: 'Document',
      index: true,
    },
    // File metadata (when type === 'file')
    file: {
      storageProvider: {
        type: String,
        enum: ['gridfs', 's3', 'cloudinary', 'local'],
        default: 'gridfs',
      },
      fileId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
      },
      key: {
        type: String,
      },
      originalName: {
        type: String,
      },
      mimeType: {
        type: String,
      },
      size: {
        type: Number, // in bytes
        default: 0,
      },
      checksum: {
        type: String,
      },
    },
    // Link metadata (when type === 'link')
    url: {
      type: String,
      trim: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Compound indexes for rapid project-level lookups and sorting
resourceSchema.index({ project: 1, createdAt: -1 });
resourceSchema.index({ project: 1, category: 1 });
resourceSchema.index({ project: 1, type: 1 });
resourceSchema.index({ title: 'text', description: 'text', tags: 'text' });

const Resource = mongoose.model('Resource', resourceSchema);

module.exports = Resource;
