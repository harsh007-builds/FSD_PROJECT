const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false, // Don't return password by default
    },
    avatarInitials: {
      type: String,
    },
    notificationPreferences: {
      taskAssigned: { type: Boolean, default: true },
      taskStatusChanged: { type: Boolean, default: true },
      projectInvitations: { type: Boolean, default: true },
      membershipChanges: { type: Boolean, default: true },
      deadlineReminders: { type: Boolean, default: true },
      emailDeadlineReminders: { type: Boolean, default: true },
      emailReminders24h: { type: Boolean, default: true },
      emailReminders1h: { type: Boolean, default: true },
      emailRemindersAtDeadline: { type: Boolean, default: true },
      emailRemindersOverdue: { type: Boolean, default: true },
    },
    savedTaskFilters: [{
      name: { type: String, required: true },
      filters: {
        status: String,
        priority: String,
        projectId: String,
        sortBy: String,
        sortOrder: String,
      },
      createdAt: { type: Date, default: Date.now },
    }],
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  
  // Set avatar initials automatically if not provided
  if (!this.avatarInitials && this.name) {
    const parts = this.name.split(' ');
    let initials = parts[0][0];
    if (parts.length > 1) {
      initials += parts[parts.length - 1][0];
    }
    this.avatarInitials = initials.toUpperCase();
  }
});

// Method to compare entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
