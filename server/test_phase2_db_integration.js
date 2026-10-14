require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Project = require('./src/models/Project');
const Invitation = require('./src/models/Invitation');
const Task = require('./src/models/Task');
const Activity = require('./src/models/Activity');
const Notification = require('./src/models/Notification');

async function runDbIntegrationTests() {
  console.log('=== STARTING DATABASE INTEGRATION TESTS FOR PHASE 2 ===\n');

  if (!process.env.MONGODB_URI) {
    console.error('No MONGODB_URI found in .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const testSuffix = Date.now();
  let ownerUser, adminUser, memberUser, inviteeUser;
  let project;

  try {
    // 1. Create test users
    console.log('1. Creating test users...');
    ownerUser = await User.create({
      name: `Owner Test ${testSuffix}`,
      email: `owner_${testSuffix}@example.com`,
      password: 'Password123!',
      avatarInitials: 'OT',
    });

    adminUser = await User.create({
      name: `Admin Test ${testSuffix}`,
      email: `admin_${testSuffix}@example.com`,
      password: 'Password123!',
      avatarInitials: 'AT',
    });

    memberUser = await User.create({
      name: `Member Test ${testSuffix}`,
      email: `member_${testSuffix}@example.com`,
      password: 'Password123!',
      avatarInitials: 'MT',
    });

    inviteeUser = await User.create({
      name: `Invitee Test ${testSuffix}`,
      email: `invitee_${testSuffix}@example.com`,
      password: 'Password123!',
      avatarInitials: 'IT',
    });
    console.log('✓ Users created');

    // 2. Create Project with Owner & Member
    console.log('2. Creating Project with memberRoles...');
    project = await Project.create({
      name: `Collab Project ${testSuffix}`,
      description: 'Testing Phase 2 Collaboration',
      owner: ownerUser._id,
      members: [ownerUser._id, memberUser._id],
      memberRoles: [
        { user: ownerUser._id, role: 'Owner' },
        { user: memberUser._id, role: 'Member' },
      ],
    });
    console.log('✓ Project created with id:', project._id);

    // 3. Promote memberUser to Admin
    console.log('3. Updating member role from Member to Admin...');
    const memberEntry = project.memberRoles.find(m => m.user.toString() === memberUser._id.toString());
    memberEntry.role = 'Admin';
    await project.save();
    
    const reloadedProject = await Project.findById(project._id);
    if (reloadedProject.getUserRole(memberUser._id) !== 'Admin') {
      throw new Error('Failed to update member role');
    }
    console.log('✓ Member promoted to Admin');

    // 4. Create in-app Invitation for inviteeUser
    console.log('4. Creating in-app invitation...');
    const invitation = await Invitation.create({
      project: project._id,
      sender: ownerUser._id,
      recipient: inviteeUser._id,
      recipientEmail: inviteeUser.email,
      role: 'Member',
      status: 'Pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    console.log('✓ Invitation created with id:', invitation._id);

    // 5. Query user invitations (getMyInvitations check)
    const userInvites = await Invitation.find({
      recipient: inviteeUser._id,
      status: 'Pending',
    });
    if (userInvites.length !== 1) {
      throw new Error('User pending invitations query failed');
    }
    console.log('✓ User can retrieve pending invitation');

    // 6. Accept invitation
    console.log('6. Accepting invitation...');
    invitation.status = 'Accepted';
    await invitation.save();

    reloadedProject.members.push(inviteeUser._id);
    reloadedProject.memberRoles.push({
      user: inviteeUser._id,
      role: invitation.role,
      joinedAt: new Date(),
    });
    await reloadedProject.save();

    const projectAfterAccept = await Project.findById(project._id);
    if (!projectAfterAccept.members.some(m => m.toString() === inviteeUser._id.toString())) {
      throw new Error('Invitee was not added to project members');
    }
    if (projectAfterAccept.getUserRole(inviteeUser._id) !== 'Member') {
      throw new Error('Invitee role is not Member');
    }
    console.log('✓ Invitation accepted, user added to project with role Member');

    // 7. Ownership Transfer
    console.log('7. Transferring ownership from ownerUser to memberUser...');
    projectAfterAccept.owner = memberUser._id;
    const oldOwnerRole = projectAfterAccept.memberRoles.find(m => m.user.toString() === ownerUser._id.toString());
    oldOwnerRole.role = 'Admin';
    const newOwnerRole = projectAfterAccept.memberRoles.find(m => m.user.toString() === memberUser._id.toString());
    newOwnerRole.role = 'Owner';
    await projectAfterAccept.save();

    const projectAfterTransfer = await Project.findById(project._id);
    if (projectAfterTransfer.owner.toString() !== memberUser._id.toString()) {
      throw new Error('Ownership transfer failed to update owner field');
    }
    if (projectAfterTransfer.getUserRole(memberUser._id) !== 'Owner') {
      throw new Error('New owner does not have Owner role');
    }
    if (projectAfterTransfer.getUserRole(ownerUser._id) !== 'Admin') {
      throw new Error('Old owner was not retained as Admin');
    }
    console.log('✓ Ownership transferred successfully. New Owner:', memberUser.name, ', Old Owner is Admin.');

    // 8. Remove member (inviteeUser removed)
    console.log('8. Removing member from project...');
    projectAfterTransfer.members = projectAfterTransfer.members.filter(m => m.toString() !== inviteeUser._id.toString());
    projectAfterTransfer.memberRoles = projectAfterTransfer.memberRoles.filter(m => m.user.toString() !== inviteeUser._id.toString());
    await projectAfterTransfer.save();

    const projectAfterRemoval = await Project.findById(project._id);
    if (projectAfterRemoval.members.some(m => m.toString() === inviteeUser._id.toString())) {
      throw new Error('Failed to remove member from project');
    }
    if (projectAfterRemoval.getUserRole(inviteeUser._id) !== null) {
      throw new Error('Removed member should have null role');
    }
    console.log('✓ Member removed successfully.');

    console.log('\n=== ALL DB INTEGRATION TESTS PASSED! ===');
  } finally {
    // Cleanup test data
    console.log('Cleaning up test data...');
    if (project) {
      await Project.findByIdAndDelete(project._id);
      await Invitation.deleteMany({ project: project._id });
    }
    if (ownerUser) await User.findByIdAndDelete(ownerUser._id);
    if (adminUser) await User.findByIdAndDelete(adminUser._id);
    if (memberUser) await User.findByIdAndDelete(memberUser._id);
    if (inviteeUser) await User.findByIdAndDelete(inviteeUser._id);
    await mongoose.disconnect();
    console.log('Disconnected & Cleaned up.');
  }
}

runDbIntegrationTests().catch(err => {
  console.error('DB Integration Test Failed:', err);
  process.exit(1);
});
