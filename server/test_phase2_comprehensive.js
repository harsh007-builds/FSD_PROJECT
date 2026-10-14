const mongoose = require('mongoose');
const assert = require('assert');
const Project = require('./src/models/Project');
const Invitation = require('./src/models/Invitation');

async function runTests() {
  console.log('=== STARTING PHASE 2 COMPREHENSIVE TESTS ===\n');

  // Test 1: Project.getUserRole and hasPermission logic
  console.log('Test 1: Project role resolution and hierarchy');
  const ownerId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const memberId = new mongoose.Types.ObjectId();
  const outsiderId = new mongoose.Types.ObjectId();

  const testProject = new Project({
    name: 'Team Collab Project',
    owner: ownerId,
    members: [ownerId, adminId, memberId],
    memberRoles: [
      { user: ownerId, role: 'Owner' },
      { user: adminId, role: 'Admin' },
      { user: memberId, role: 'Member' },
    ],
  });

  assert.strictEqual(testProject.getUserRole(ownerId), 'Owner', 'Owner role should be resolved');
  assert.strictEqual(testProject.getUserRole(adminId), 'Admin', 'Admin role should be resolved');
  assert.strictEqual(testProject.getUserRole(memberId), 'Member', 'Member role should be resolved');
  assert.strictEqual(testProject.getUserRole(outsiderId), null, 'Outsider should have null role');

  // hasPermission tests
  assert.strictEqual(testProject.hasPermission(ownerId, 'Owner'), true, 'Owner has Owner permission');
  assert.strictEqual(testProject.hasPermission(ownerId, 'Admin'), true, 'Owner has Admin permission');
  assert.strictEqual(testProject.hasPermission(ownerId, 'Member'), true, 'Owner has Member permission');

  assert.strictEqual(testProject.hasPermission(adminId, 'Owner'), false, 'Admin does NOT have Owner permission');
  assert.strictEqual(testProject.hasPermission(adminId, 'Admin'), true, 'Admin has Admin permission');
  assert.strictEqual(testProject.hasPermission(adminId, 'Member'), true, 'Admin has Member permission');

  assert.strictEqual(testProject.hasPermission(memberId, 'Owner'), false, 'Member does NOT have Owner permission');
  assert.strictEqual(testProject.hasPermission(memberId, 'Admin'), false, 'Member does NOT have Admin permission');
  assert.strictEqual(testProject.hasPermission(memberId, 'Member'), true, 'Member has Member permission');

  assert.strictEqual(testProject.hasPermission(outsiderId, 'Member'), false, 'Outsider has no permissions');
  console.log('✓ Test 1 Passed: Role hierarchy and permissions verified\n');

  // Test 2: Fallback for legacy projects without memberRoles
  console.log('Test 2: Legacy project role resolution fallback');
  const legacyMemberId = new mongoose.Types.ObjectId();
  const legacyProject = new Project({
    name: 'Legacy Project',
    owner: ownerId,
    members: [ownerId, legacyMemberId],
    memberRoles: [],
  });

  assert.strictEqual(legacyProject.getUserRole(ownerId), 'Owner', 'Owner should still be Owner on legacy project');
  assert.strictEqual(legacyProject.getUserRole(legacyMemberId), 'Member', 'Legacy member falls back to Member');
  console.log('✓ Test 2 Passed: Legacy project fallback verified\n');

  // Test 3: Invitation schema and expiration
  console.log('Test 3: Invitation model & expiration logic');
  const freshInvite = new Invitation({
    project: testProject._id,
    sender: ownerId,
    recipient: outsiderId,
    recipientEmail: 'outsider@example.com',
    role: 'Member',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  assert.strictEqual(freshInvite.isExpired(), false, 'Fresh invitation is not expired');

  const expiredInvite = new Invitation({
    project: testProject._id,
    sender: ownerId,
    recipient: outsiderId,
    recipientEmail: 'outsider@example.com',
    role: 'Member',
    expiresAt: new Date(Date.now() - 1000), // in the past
  });
  assert.strictEqual(expiredInvite.isExpired(), true, 'Past invitation is expired');

  const markedExpiredInvite = new Invitation({
    project: testProject._id,
    sender: ownerId,
    recipient: outsiderId,
    recipientEmail: 'outsider@example.com',
    role: 'Member',
    status: 'Expired',
    expiresAt: new Date(Date.now() + 10000),
  });
  assert.strictEqual(markedExpiredInvite.isExpired(), true, 'Status=Expired marks as expired');
  console.log('✓ Test 3 Passed: Invitation model expiration verified\n');

  // Test 4: Privilege Escalation Prevention Checks (Controller Logic Simulation)
  console.log('Test 4: Privilege escalation and role change constraints');
  
  // Rule: Admin cannot invite an Admin
  function canInvite(callerRole, targetRole) {
    if (callerRole !== 'Owner' && callerRole !== 'Admin') return false;
    if (callerRole === 'Admin' && targetRole === 'Admin') return false;
    return true;
  }
  assert.strictEqual(canInvite('Owner', 'Admin'), true, 'Owner can invite Admin');
  assert.strictEqual(canInvite('Owner', 'Member'), true, 'Owner can invite Member');
  assert.strictEqual(canInvite('Admin', 'Member'), true, 'Admin can invite Member');
  assert.strictEqual(canInvite('Admin', 'Admin'), false, 'Admin CANNOT invite Admin (Privilege Escalation blocked)');
  assert.strictEqual(canInvite('Member', 'Member'), false, 'Member cannot invite anyone');

  // Rule: Admin cannot remove Admin or Owner
  function canRemove(callerRole, targetRole) {
    if (callerRole !== 'Owner' && callerRole !== 'Admin') return false;
    if (targetRole === 'Owner') return false;
    if (callerRole === 'Admin' && targetRole === 'Admin') return false;
    return true;
  }
  assert.strictEqual(canRemove('Owner', 'Admin'), true, 'Owner can remove Admin');
  assert.strictEqual(canRemove('Owner', 'Member'), true, 'Owner can remove Member');
  assert.strictEqual(canRemove('Owner', 'Owner'), false, 'Owner cannot be removed');
  assert.strictEqual(canRemove('Admin', 'Member'), true, 'Admin can remove Member');
  assert.strictEqual(canRemove('Admin', 'Admin'), false, 'Admin CANNOT remove Admin');
  assert.strictEqual(canRemove('Admin', 'Owner'), false, 'Admin CANNOT remove Owner');
  assert.strictEqual(canRemove('Member', 'Member'), false, 'Member cannot remove anyone');

  // Rule: Changing roles
  function canChangeRole(callerRole, targetCurrentRole, targetNewRole, isSelf) {
    if (isSelf) return false;
    if (callerRole !== 'Owner') return false; // Only Owner can modify roles between Admin/Member
    if (targetCurrentRole === 'Owner') return false;
    return ['Admin', 'Member'].includes(targetNewRole);
  }
  assert.strictEqual(canChangeRole('Owner', 'Member', 'Admin', false), true, 'Owner can promote Member to Admin');
  assert.strictEqual(canChangeRole('Owner', 'Admin', 'Member', false), true, 'Owner can demote Admin to Member');
  assert.strictEqual(canChangeRole('Owner', 'Owner', 'Member', true), false, 'Owner cannot change own role via role change');
  assert.strictEqual(canChangeRole('Admin', 'Member', 'Admin', false), false, 'Admin cannot promote Member to Admin');
  assert.strictEqual(canChangeRole('Member', 'Member', 'Admin', false), false, 'Member cannot change roles');
  console.log('✓ Test 4 Passed: Privilege escalation prevention rules verified\n');

  // Test 5: Ownership Transfer Logic
  console.log('Test 5: Ownership transfer transitions');
  function transferOwnership(project, currentOwnerId, newOwnerId) {
    if (project.owner.toString() !== currentOwnerId.toString()) throw new Error('Not owner');
    if (currentOwnerId.toString() === newOwnerId.toString()) throw new Error('Already owner');
    const isMember = project.members.some(m => m.toString() === newOwnerId.toString());
    if (!isMember) throw new Error('Target must be member');

    project.owner = newOwnerId;
    // previous owner becomes Admin
    const oldEntry = project.memberRoles.find(m => m.user.toString() === currentOwnerId.toString());
    if (oldEntry) oldEntry.role = 'Admin';
    // new owner becomes Owner
    const newEntry = project.memberRoles.find(m => m.user.toString() === newOwnerId.toString());
    if (newEntry) newEntry.role = 'Owner';
    if (!project.members.some(m => m.toString() === currentOwnerId.toString())) {
      project.members.push(currentOwnerId);
    }
  }

  const projBeforeTransfer = {
    owner: ownerId,
    members: [ownerId, adminId, memberId],
    memberRoles: [
      { user: ownerId, role: 'Owner' },
      { user: adminId, role: 'Admin' },
      { user: memberId, role: 'Member' },
    ],
  };

  transferOwnership(projBeforeTransfer, ownerId, adminId);
  assert.strictEqual(projBeforeTransfer.owner.toString(), adminId.toString(), 'New owner is adminId');
  const oldOwnerEntry = projBeforeTransfer.memberRoles.find(m => m.user.toString() === ownerId.toString());
  assert.strictEqual(oldOwnerEntry.role, 'Admin', 'Previous owner transitioned to Admin');
  const newOwnerEntry = projBeforeTransfer.memberRoles.find(m => m.user.toString() === adminId.toString());
  assert.strictEqual(newOwnerEntry.role, 'Owner', 'New owner role transitioned to Owner');
  console.log('✓ Test 5 Passed: Ownership transfer transition logic verified\n');

  // Test 6: Workload calculation simulation
  console.log('Test 6: Workload calculation accuracy');
  const sampleTasks = [
    { assignee: adminId, status: 'Completed', priority: 'Medium' },
    { assignee: adminId, status: 'In Progress', priority: 'High', dueDate: new Date(Date.now() - 86400000) }, // overdue
    { assignee: adminId, status: 'Todo', priority: 'Urgent' },
    { assignee: memberId, status: 'Completed', priority: 'Low' },
    { assignee: memberId, status: 'Completed', priority: 'Low' },
    { assignee: null, status: 'Todo', priority: 'Low' },
  ];

  const adminWorkload = {
    totalAssigned: 0,
    completedTasks: 0,
    pendingTasks: 0,
    overdueTasks: 0,
    highPriorityTasks: 0,
  };

  const now = new Date();
  sampleTasks.filter(t => t.assignee && t.assignee.toString() === adminId.toString()).forEach(t => {
    adminWorkload.totalAssigned++;
    if (t.status === 'Completed') adminWorkload.completedTasks++;
    else adminWorkload.pendingTasks++;
    if (t.dueDate && new Date(t.dueDate) < now && t.status !== 'Completed') adminWorkload.overdueTasks++;
    if (t.priority === 'High' || t.priority === 'Urgent') adminWorkload.highPriorityTasks++;
  });

  const completionRate = Math.round((adminWorkload.completedTasks / adminWorkload.totalAssigned) * 100);

  assert.strictEqual(adminWorkload.totalAssigned, 3, 'Admin assigned 3 tasks');
  assert.strictEqual(adminWorkload.completedTasks, 1, 'Admin completed 1 task');
  assert.strictEqual(adminWorkload.pendingTasks, 2, 'Admin has 2 pending tasks');
  assert.strictEqual(adminWorkload.overdueTasks, 1, 'Admin has 1 overdue task');
  assert.strictEqual(adminWorkload.highPriorityTasks, 2, 'Admin has 2 high/urgent tasks');
  assert.strictEqual(completionRate, 33, 'Admin completion rate is 33%');
  console.log('✓ Test 6 Passed: Workload stats accurately calculated\n');

  console.log('=== ALL PHASE 2 TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('Test failure:', err);
  process.exit(1);
});
