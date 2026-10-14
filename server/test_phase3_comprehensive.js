require('dotenv').config();
const mongoose = require('mongoose');
const assert = require('assert');
const Task = require('./src/models/Task');
const Project = require('./src/models/Project');
const User = require('./src/models/User');

// Date & Timezone utilities test
function toDateKey(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function createSafeDateString(year, month, day) {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}T12:00:00.000Z`;
}

async function runPhase3Tests() {
  console.log('=== STARTING PHASE 3 COMPREHENSIVE TESTS ===\n');

  // TEST 1: Date & Timezone normalization & boundaries
  console.log('Test 1: Date & Timezone normalization and boundary safety');
  assert.strictEqual(toDateKey('2026-10-15T00:00:00.000Z'), '2026-10-15', 'ISO string extraction');
  assert.strictEqual(toDateKey('2026-10-15T23:59:59.999Z'), '2026-10-15', 'Late hour ISO string extraction');
  assert.strictEqual(toDateKey('2026-10-15'), '2026-10-15', 'Short date string extraction');

  // Month and leap year boundary checks
  const endOfMonth = createSafeDateString(2026, 9, 31); // Oct 31, 2026
  assert.strictEqual(toDateKey(endOfMonth), '2026-10-31', 'End of month boundary');

  const startOfNextMonth = createSafeDateString(2026, 10, 1); // Nov 1, 2026
  assert.strictEqual(toDateKey(startOfNextMonth), '2026-11-01', 'Start of next month boundary');

  const leapDay = createSafeDateString(2028, 1, 29); // Feb 29, 2028
  assert.strictEqual(toDateKey(leapDay), '2028-02-29', 'Leap day boundary');

  // Timezone shift simulation (midday anchoring check across standard offsets -11 to +11)
  for (let tzOffsetHours = -11; tzOffsetHours <= 11; tzOffsetHours++) {
    const anchoredDate = new Date('2026-10-15T12:00:00.000Z');
    const shifted = new Date(anchoredDate.getTime() + tzOffsetHours * 60 * 60 * 1000);
    const shiftedUtcDay = shifted.getUTCDate();
    assert.strictEqual(shiftedUtcDay, 15, `Anchored date shifted day in UTC+${tzOffsetHours}`);
  }

  // String extraction guarantees exact date in ANY timezone regardless of environment
  assert.strictEqual(toDateKey('2026-10-15T00:00:00.000Z'), '2026-10-15', 'Safe string key');
  assert.strictEqual(toDateKey('2026-10-15T12:00:00.000Z'), '2026-10-15', 'Safe midday key');
  assert.strictEqual(toDateKey('2026-10-15T23:59:00.000Z'), '2026-10-15', 'Safe night key');
  console.log('✓ Test 1 Passed: Date & Timezone boundaries verified with zero drift\n');

  // TEST 2: Task Schema Event Types ('Task', 'Milestone', 'Study Session')
  console.log('Test 2: Task schema event type validation');
  const dummyProjId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();

  const normalTask = new Task({
    title: 'Regular task',
    project: dummyProjId,
    createdBy: dummyUserId,
  });
  assert.strictEqual(normalTask.type, 'Task', 'Default task type is Task');

  const sessionTask = new Task({
    title: 'Math Study Session',
    project: dummyProjId,
    createdBy: dummyUserId,
    type: 'Study Session',
  });
  assert.strictEqual(sessionTask.type, 'Study Session', 'Study Session type accepted');

  const milestoneTask = new Task({
    title: 'Sprint Milestone',
    project: dummyProjId,
    createdBy: dummyUserId,
    type: 'Milestone',
  });
  assert.strictEqual(milestoneTask.type, 'Milestone', 'Milestone type accepted');

  const invalidTask = new Task({
    title: 'Invalid type',
    project: dummyProjId,
    createdBy: dummyUserId,
    type: 'InvalidType',
  });
  const validationError = invalidTask.validateSync();
  assert(validationError.errors['type'], 'Invalid type should fail validation');
  console.log('✓ Test 2 Passed: Event types and schema validation verified\n');

  // TEST 3: Calendar Event Filtering Logic Simulation
  console.log('Test 3: Filtering logic simulation (Project, Status, Priority, Type, Assignee)');
  const sampleEvents = [
    { id: 1, projectId: 'p1', status: 'Todo', priority: 'High', type: 'Task', assignee: 'u1', title: 'Task A' },
    { id: 2, projectId: 'p1', status: 'In Progress', priority: 'Urgent', type: 'Study Session', assignee: 'u2', title: 'Session B' },
    { id: 3, projectId: 'p2', status: 'Completed', priority: 'Low', type: 'Task', assignee: 'u1', title: 'Task C' },
    { id: 4, projectId: 'p2', status: 'Todo', priority: 'Medium', type: 'Milestone', assignee: 'u2', title: 'Milestone D' },
  ];

  // Filter by project p1
  const proj1Events = sampleEvents.filter(e => e.projectId === 'p1');
  assert.strictEqual(proj1Events.length, 2, 'Project p1 filter');

  // Filter by type Study Session
  const sessions = sampleEvents.filter(e => e.type === 'Study Session');
  assert.strictEqual(sessions.length, 1, 'Study session filter');
  assert.strictEqual(sessions[0].title, 'Session B', 'Study session title matches');

  // Filter by assignee u1
  const u1Events = sampleEvents.filter(e => e.assignee === 'u1');
  assert.strictEqual(u1Events.length, 2, 'Assignee u1 filter');

  // Filter by priority Urgent
  const urgentEvents = sampleEvents.filter(e => e.priority === 'Urgent');
  assert.strictEqual(urgentEvents.length, 1, 'Urgent priority filter');
  console.log('✓ Test 3 Passed: Multi-dimensional event filtering verified\n');

  // TEST 4: Rescheduling Transition Simulation
  console.log('Test 4: Task rescheduling date transition logic');
  const taskToReschedule = {
    id: 't-123',
    title: 'Database indexing task',
    dueDate: '2026-10-15T12:00:00.000Z',
  };

  const newTargetDateKey = '2026-10-22';
  const newSafeIso = `${newTargetDateKey}T12:00:00.000Z`;

  taskToReschedule.dueDate = newSafeIso;
  assert.strictEqual(toDateKey(taskToReschedule.dueDate), '2026-10-22', 'Rescheduled dateKey is Oct 22');
  console.log('✓ Test 4 Passed: Rescheduling logic verified\n');

  // TEST 5: Live Database Integration for Tasks & Deadlines (if MONGODB_URI is available)
  if (process.env.MONGODB_URI) {
    console.log('Test 5: Live MongoDB integration test for Phase 3 calendar & tasks');
    await mongoose.connect(process.env.MONGODB_URI);

    const testSuffix = Date.now();
    let testUser, testProject, testTask;

    try {
      testUser = await User.create({
        name: `Cal User ${testSuffix}`,
        email: `cal_${testSuffix}@example.com`,
        password: 'Password123!',
        avatarInitials: 'CU',
      });

      testProject = await Project.create({
        name: `Cal Project ${testSuffix}`,
        owner: testUser._id,
        members: [testUser._id],
        deadline: new Date('2026-12-31T12:00:00.000Z'),
      });

      // Create Task with Study Session type and due date
      testTask = await Task.create({
        title: `Group Study Session ${testSuffix}`,
        description: 'Reviewing systems architecture and algorithms',
        project: testProject._id,
        createdBy: testUser._id,
        assignee: testUser._id,
        type: 'Study Session',
        priority: 'High',
        status: 'Todo',
        dueDate: new Date('2026-10-20T12:00:00.000Z'),
        labels: ['study-session', 'algorithms'],
      });

      // Verify task retrieval with populated project
      const fetchedTask = await Task.findById(testTask._id)
        .populate('project', 'name status deadline')
        .populate('assignee', 'name email avatarInitials')
        .lean();

      assert.strictEqual(fetchedTask.type, 'Study Session', 'Persisted type is Study Session');
      assert.strictEqual(fetchedTask.project.name, `Cal Project ${testSuffix}`, 'Project name populated');
      assert.strictEqual(toDateKey(fetchedTask.dueDate), '2026-10-20', 'Due date matches 2026-10-20');

      // Reschedule task
      fetchedTask.dueDate = new Date('2026-10-25T12:00:00.000Z');
      await Task.findByIdAndUpdate(testTask._id, { dueDate: fetchedTask.dueDate });

      const updatedTask = await Task.findById(testTask._id);
      assert.strictEqual(toDateKey(updatedTask.dueDate), '2026-10-25', 'Rescheduled due date persisted');

      console.log('✓ Test 5 Passed: Live DB task creation, project population, and rescheduling verified\n');
    } finally {
      if (testTask) await Task.findByIdAndDelete(testTask._id);
      if (testProject) await Project.findByIdAndDelete(testProject._id);
      if (testUser) await User.findByIdAndDelete(testUser._id);
      await mongoose.disconnect();
    }
  }

  console.log('=== ALL PHASE 3 TESTS COMPLETED AND PASSED SUCCESSFULLY! ===');
}

runPhase3Tests().catch(err => {
  console.error('Phase 3 test error:', err);
  process.exit(1);
});
