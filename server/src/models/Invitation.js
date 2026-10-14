const mongoose = require('mongoose');

const invitationSchema = new mongoose.Schema(
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
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipientEmail: {
      type: String,
      required: [true, 'Recipient email is required'],
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['Admin', 'Member'],
      default: 'Member',
    },
    status: {
      type: String,
      enum: ['Pending', 'Accepted', 'Declined', 'Cancelled', 'Expired'],
      default: 'Pending',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days validity
    },
  },
  {
    timestamps: true,
  }
);

invitationSchema.index({ project: 1, recipient: 1, status: 1 });
invitationSchema.index({ recipient: 1, status: 1 });

// Helper to check if invitation has expired
invitationSchema.methods.isExpired = function () {
  return this.status === 'Expired' || new Date() > new Date(this.expiresAt);
};

const Invitation = mongoose.model('Invitation', invitationSchema);

module.exports = Invitation;
