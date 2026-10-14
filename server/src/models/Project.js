const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      minlength: [3, 'Project name must be at least 3 characters long'],
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Active', 'On Hold', 'Completed', 'Archived'],
      default: 'Active',
    },
    startDate: {
      type: Date,
    },
    deadline: {
      type: Date,
    },
    progress: {
      type: Number,
      default: 0,
      min: [0, 'Progress cannot be less than 0'],
      max: [100, 'Progress cannot exceed 100'],
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    members: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    memberRoles: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      role: {
        type: String,
        enum: ['Owner', 'Admin', 'Member'],
        default: 'Member',
      },
      joinedAt: {
        type: Date,
        default: Date.now,
      }
    }]
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

projectSchema.index({ members: 1 });
projectSchema.index({ 'memberRoles.user': 1 });
projectSchema.index({ name: 'text', description: 'text' });
projectSchema.index({ owner: 1, name: 1 });

// Helper to determine a user's role in the project
projectSchema.methods.getUserRole = function (userId) {
  if (!userId) return null;
  const uId = userId._id ? userId._id.toString() : userId.toString();
  
  if (this.owner && (this.owner._id ? this.owner._id.toString() : this.owner.toString()) === uId) {
    return 'Owner';
  }

  if (Array.isArray(this.memberRoles)) {
    const entry = this.memberRoles.find(m => {
      const entryId = m.user?._id ? m.user._id.toString() : m.user?.toString();
      return entryId === uId;
    });
    if (entry && entry.role) return entry.role;
  }

  // Fallback: If in members array, default to 'Member'
  const isMember = Array.isArray(this.members) && this.members.some(m => {
    const memberId = m._id ? m._id.toString() : m.toString();
    return memberId === uId;
  });

  return isMember ? 'Member' : null;
};

// Helper to verify if user has minimum required role
projectSchema.methods.hasPermission = function (userId, requiredRole = 'Member') {
  const role = this.getUserRole(userId);
  if (!role) return false;
  if (role === 'Owner') return true;
  if (requiredRole === 'Admin') return role === 'Admin';
  if (requiredRole === 'Member') return role === 'Admin' || role === 'Member';
  return false;
};

const Project = mongoose.model('Project', projectSchema);

module.exports = Project;
