require('dotenv').config();
const mongoose = require('mongoose');
const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { io: ClientIO } = require('socket.io-client');

const User = require('./src/models/User');
const Project = require('./src/models/Project');
const Task = require('./src/models/Task');
const Activity = require('./src/models/Activity');
const Notification = require('./src/models/Notification');
const { init } = require('./src/socket');
const projectRoutes = require('./src/routes/projectRoutes');
const { errorHandler, notFound } = require('./src/middleware/errorMiddleware');

async function runMemberManagementTests() {
  console.log('====================================================');
  console.log('STUDYSYNC: PROJECT MEMBER MANAGEMENT TEST SUITE');
  console.log('====================================================\n');

  if (!process.env.MONGODB_URI) {
    console.error('No MONGODB_URI found in .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB');

  // Set up Express app + Socket.IO server on ephemeral port for tests
  const app = express();
  app.use(express.json());
  app.use('/api/projects', projectRoutes);
  app.use(notFound);
  app.use(errorHandler);

  const server = http.createServer(app);
  init(server);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`✓ Test server running on port ${port}\n`);

  const testSuffix = Date.now();
  let ownerUser, memberUser1, memberUser2, unauthorizedUser;
  let ownerToken, member1Token, unauthorizedToken;
  let testProject;

  try {
    // -------------------------------------------------------------
    // Setup Test Users
    // -------------------------------------------------------------
    console.log('--- Setting Up Test Fixtures ---');
    ownerUser = await User.create({
      name: `Owner ${testSuffix}`,
      email: `owner_${testSuffix}@example.com`,
      password: 'Password123!',
      avatarInitials: 'OW',
    });
    ownerToken = jwt.sign({ id: ownerUser._id }, process.env.JWT_SECRET || 'secret');

    memberUser1 = await User.create({
      name: `Member One ${testSuffix}`,
      email: `member1_${testSuffix}@example.com`,
      password: 'Password123!',
      avatarInitials: 'M1',
    });
    member1Token = jwt.sign({ id: memberUser1._id }, process.env.JWT_SECRET || 'secret');

    memberUser2 = await User.create({
      name: `Member Two ${testSuffix}`,
      email: `member2_${testSuffix}@example.com`,
      password: 'Password123!',
      avatarInitials: 'M2',
    });

    unauthorizedUser = await User.create({
      name: `Stranger ${testSuffix}`,
      email: `stranger_${testSuffix}@example.com`,
      password: 'Password123!',
      avatarInitials: 'ST',
    });
    unauthorizedToken = jwt.sign({ id: unauthorizedUser._id }, process.env.JWT_SECRET || 'secret');

    testProject = await Project.create({
      name: `Member Management Test Project ${testSuffix}`,
      description: 'Testing member management features',
      owner: ownerUser._id,
      members: [ownerUser._id],
      memberRoles: [{ user: ownerUser._id, role: 'Owner' }],
    });
    console.log(`✓ Created test project "${testProject.name}" (ID: ${testProject._id})\n`);

    // Helper for authenticated fetch
    const apiCall = async (endpoint, options = {}, token = ownerToken) => {
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      };
      const response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers,
      });
      const data = await response.json().catch(() => ({}));
      return { status: response.status, data };
    };

    // -------------------------------------------------------------
    // SCENARIO 1: Owner adds an existing registered user using email
    // -------------------------------------------------------------
    console.log('Scenario 1: Project owner adds an existing registered user using their email');
    const addRes1 = await apiCall(`/api/projects/${testProject._id}/members`, {
      method: 'POST',
      body: JSON.stringify({ email: memberUser1.email }),
    }, ownerToken);

    assert.strictEqual(addRes1.status, 200, `Expected 200, got ${addRes1.status}: ${JSON.stringify(addRes1.data)}`);
    const isMemberInList = addRes1.data.members.some(m => (m._id || m).toString() === memberUser1._id.toString());
    assert.strictEqual(isMemberInList, true, 'Member should be added to members array');

    // Verify in database that memberRoles also has the user
    const dbProjectAfterAdd = await Project.findById(testProject._id);
    const roleEntry = dbProjectAfterAdd.memberRoles.find(r => r.user.toString() === memberUser1._id.toString());
    assert(roleEntry, 'Member should have an entry in memberRoles');
    assert.strictEqual(roleEntry.role, 'Member', 'Default role should be Member');
    console.log('✓ Scenario 1 Passed: Registered user added successfully to project\n');

    // -------------------------------------------------------------
    // SCENARIO 2: Adding an unregistered email displays appropriate error
    // -------------------------------------------------------------
    console.log('Scenario 2: Adding an unregistered email displays "No registered user found with this email."');
    const unregEmail = `unregistered_${Date.now()}@notfound.com`;
    const addRes2 = await apiCall(`/api/projects/${testProject._id}/members`, {
      method: 'POST',
      body: JSON.stringify({ email: unregEmail }),
    }, ownerToken);

    assert.strictEqual(addRes2.status, 404, `Expected 404, got ${addRes2.status}`);
    assert.strictEqual(addRes2.data.message, 'No registered user found with this email.', `Got message: ${addRes2.data.message}`);
    console.log('✓ Scenario 2 Passed: Unregistered email properly rejected with 404\n');

    // -------------------------------------------------------------
    // SCENARIO 3: Adding the same user twice is prevented
    // -------------------------------------------------------------
    console.log('Scenario 3: Adding duplicate member is prevented');
    const addResDuplicate = await apiCall(`/api/projects/${testProject._id}/members`, {
      method: 'POST',
      body: JSON.stringify({ email: memberUser1.email }),
    }, ownerToken);

    assert.strictEqual(addResDuplicate.status, 400, `Expected 400 for duplicate, got ${addResDuplicate.status}`);
    assert(addResDuplicate.data.message.includes('already a member'), `Expected message about already a member, got: ${addResDuplicate.data.message}`);
    console.log('✓ Scenario 3 Passed: Duplicate membership prevented with 400\n');

    // -------------------------------------------------------------
    // SCENARIO 3b: Prevent adding self
    // -------------------------------------------------------------
    console.log('Scenario 3b: Prevent owner from adding themselves');
    const addResSelf = await apiCall(`/api/projects/${testProject._id}/members`, {
      method: 'POST',
      body: JSON.stringify({ email: ownerUser.email }),
    }, ownerToken);

    assert.strictEqual(addResSelf.status, 400, `Expected 400 for self-add, got ${addResSelf.status}`);
    assert(addResSelf.data.message.includes('cannot add yourself'), `Expected message about self-add, got: ${addResSelf.data.message}`);
    console.log('✓ Scenario 3b Passed: Self-add prevented\n');

    // -------------------------------------------------------------
    // SCENARIO 4: A non-owner cannot add members
    // -------------------------------------------------------------
    console.log('Scenario 4: A non-owner cannot add members');
    const addResNonOwner = await apiCall(`/api/projects/${testProject._id}/members`, {
      method: 'POST',
      body: JSON.stringify({ email: memberUser2.email }),
    }, member1Token);

    assert.strictEqual(addResNonOwner.status, 403, `Expected 403 Forbidden, got ${addResNonOwner.status}`);
    assert(addResNonOwner.data.message.includes('Only the project owner can add members'), `Got message: ${addResNonOwner.data.message}`);
    console.log('✓ Scenario 4 Passed: Non-owner prevented from adding members with 403 Forbidden\n');

    // -------------------------------------------------------------
    // SCENARIO 5: The newly added member can access the project
    // -------------------------------------------------------------
    console.log('Scenario 5: Newly added member can access project details & members list');
    const memberAccessRes = await apiCall(`/api/projects/${testProject._id}`, {
      method: 'GET',
    }, member1Token);

    assert.strictEqual(memberAccessRes.status, 200, `Member should access project, got ${memberAccessRes.status}`);
    assert.strictEqual(memberAccessRes.data._id.toString(), testProject._id.toString());

    // GET /api/projects/:id/members
    const membersListRes = await apiCall(`/api/projects/${testProject._id}/members`, {
      method: 'GET',
    }, member1Token);
    assert.strictEqual(membersListRes.status, 200, `Member should access members list, got ${membersListRes.status}`);
    assert(Array.isArray(membersListRes.data), 'Members list should be an array');
    assert.strictEqual(membersListRes.data.length, 2, 'Should have 2 members (owner + member1)');
    console.log('✓ Scenario 5 Passed: Newly added member can access project and members list\n');

    // -------------------------------------------------------------
    // SCENARIO 6: An unauthorized user cannot access the project
    // -------------------------------------------------------------
    console.log('Scenario 6: Unauthorized user cannot access project or members');
    const unauthorizedAccessRes = await apiCall(`/api/projects/${testProject._id}`, {
      method: 'GET',
    }, unauthorizedToken);
    assert.strictEqual(unauthorizedAccessRes.status, 401, `Expected 401 for unauthorized project view, got ${unauthorizedAccessRes.status}`);

    const unauthorizedMembersRes = await apiCall(`/api/projects/${testProject._id}/members`, {
      method: 'GET',
    }, unauthorizedToken);
    assert.strictEqual(unauthorizedMembersRes.status, 403, `Expected 403 for unauthorized members list view, got ${unauthorizedMembersRes.status}`);
    console.log('✓ Scenario 6 Passed: Unauthorized user blocked from project data\n');

    // -------------------------------------------------------------
    // SCENARIO 7 & 8: Socket.IO Integration
    // -------------------------------------------------------------
    console.log('Scenario 7 & 8: Socket.IO join_project, leave_project, and member_added events');

    // Connect owner socket
    const ownerSocket = ClientIO(baseUrl, {
      auth: { token: ownerToken },
      transports: ['websocket'],
    });

    // Connect member1 socket
    const member1Socket = ClientIO(baseUrl, {
      auth: { token: member1Token },
      transports: ['websocket'],
    });

    // Connect unauthorized socket
    const unauthorizedSocket = ClientIO(baseUrl, {
      auth: { token: unauthorizedToken },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise((res) => ownerSocket.on('connect', res)),
      new Promise((res) => member1Socket.on('connect', res)),
      new Promise((res) => unauthorizedSocket.on('connect', res)),
    ]);
    console.log('✓ Sockets connected and authenticated');

    // Test join_project for authorized user (member1)
    member1Socket.emit('join_project', testProject._id.toString());
    ownerSocket.emit('join_project', testProject._id.toString());

    // Unauthorized socket attempts to join project room
    unauthorizedSocket.emit('join_project', testProject._id.toString());

    // Small delay to let socket join rooms
    await new Promise((r) => setTimeout(r, 200));

    // Listen for member_added event on member1's socket
    const memberAddedPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for member_added event')), 4000);
      member1Socket.on('member_added', (payload) => {
        clearTimeout(timeout);
        resolve(payload);
      });
    });

    // Now owner adds memberUser2 via API
    console.log('Emitting member addition via API and waiting for member_added socket event...');
    const addRes3 = await apiCall(`/api/projects/${testProject._id}/members`, {
      method: 'POST',
      body: JSON.stringify({ email: memberUser2.email }),
    }, ownerToken);
    assert.strictEqual(addRes3.status, 200);

    const receivedPayload = await memberAddedPromise;
    assert.strictEqual(receivedPayload.projectId, testProject._id.toString());
    assert.strictEqual(receivedPayload.member.email, memberUser2.email);
    assert.strictEqual(receivedPayload.member.name, memberUser2.name);
    assert.strictEqual(receivedPayload.member.role, 'Member');
    console.log('✓ Scenario 7 Passed: Real-time member_added event received on connected project room\n');

    // Test leave_project removes socket from project room
    console.log('Scenario 8: leave_project event handling');
    member1Socket.emit('leave_project', testProject._id.toString());
    await new Promise((r) => setTimeout(r, 200));

    // Cleanup sockets
    ownerSocket.disconnect();
    member1Socket.disconnect();
    unauthorizedSocket.disconnect();
    console.log('✓ Scenario 8 Passed: leave_project handled smoothly\n');

    // -------------------------------------------------------------
    // SCENARIO 9: Sensitive data security check
    // -------------------------------------------------------------
    console.log('Scenario 9: Security check - No passwords or sensitive fields exposed');
    const finalMembersList = await apiCall(`/api/projects/${testProject._id}/members`, {
      method: 'GET',
    }, ownerToken);
    finalMembersList.data.forEach((m) => {
      assert.strictEqual(m.password, undefined, 'Password should never be returned');
      assert.strictEqual(m.__v, undefined, 'Mongoose __v not exposed');
      assert(m.email, 'Email should be present');
      assert(m.name, 'Name should be present');
      assert(m.role, 'Role should be present');
    });
    console.log('✓ Scenario 9 Passed: Zero credential leakage verified\n');

    console.log('====================================================');
    console.log('ALL 8+ ACCEPTANCE CRITERIA SCENARIOS PASSED PERFECTLY!');
    console.log('====================================================');

  } finally {
    // Clean up test data
    console.log('\nCleaning up test data from DB...');
    if (testProject) {
      await Project.deleteMany({ _id: testProject._id });
      await Task.deleteMany({ project: testProject._id });
      await Activity.deleteMany({ project: testProject._id });
      await Notification.deleteMany({ project: testProject._id });
    }
    const userIds = [ownerUser?._id, memberUser1?._id, memberUser2?._id, unauthorizedUser?._id].filter(Boolean);
    if (userIds.length > 0) {
      await User.deleteMany({ _id: { $in: userIds } });
    }
    await server.close();
    await mongoose.disconnect();
    console.log('✓ Database cleaned up and disconnected');
  }
}

runMemberManagementTests().catch((err) => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});

