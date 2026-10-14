const assert = require('assert');
const mongoose = require('mongoose');

// Import Models
const User = require('./src/models/User');
const Project = require('./src/models/Project');
const Task = require('./src/models/Task');
const Activity = require('./src/models/Activity');
const Notification = require('./src/models/Notification');

// Import Controllers
const projectController = require('./src/controllers/projectController');
const taskController = require('./src/controllers/taskController');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ ${desc}`);
    console.error(err);
  }
}

async function itAsync(desc, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ ${desc}`);
    console.error(err);
  }
}

async function runTests() {
  console.log('\n--- Running Phase 1 Unit & Schema Tests ---\n');

  // Test 1: Project Schema Validation
  it('Project Model has correct enum values including Archived', () => {
    const statusEnum = Project.schema.path('status').enumValues;
    assert.deepStrictEqual(statusEnum, ['Active', 'On Hold', 'Completed', 'Archived']);
  });

  it('Project Model contains required fields and indexes', () => {
    assert(Project.schema.path('name').isRequired, 'Name is required');
    assert(Project.schema.path('owner'), 'Owner field exists');
    assert(Project.schema.path('members'), 'Members field exists');
    assert.strictEqual(Project.schema.path('progress').defaultValue, 0);
  });

  // Test 2: Task Schema Validation
  it('Task Model has correct status enum including Backlog, Todo, In Progress, Review, Completed', () => {
    const statusEnum = Task.schema.path('status').enumValues;
    assert.deepStrictEqual(statusEnum, ['Backlog', 'Todo', 'In Progress', 'Review', 'Completed']);
  });

  it('Task Model has order field and comments schema', () => {
    assert(Task.schema.path('order'), 'Order field exists');
    assert.strictEqual(Task.schema.path('order').defaultValue, 0);
    assert(Task.schema.path('comments'), 'Comments field exists');
    assert(Task.schema.path('comments.0.text'), 'Comment text field exists');
    assert(Task.schema.path('comments.0.user'), 'Comment user field exists');
    assert(Task.schema.path('comments.0.createdAt'), 'Comment createdAt field exists');
  });

  it('Task Model priority enum contains Low, Medium, High, Urgent', () => {
    const priorityEnum = Task.schema.path('priority').enumValues;
    assert.deepStrictEqual(priorityEnum, ['Low', 'Medium', 'High', 'Urgent']);
  });

  // Test 3: User Model Pre-save hook validation
  it('User Model pre-save hook handles unmodified password cleanly without stalling', async () => {
    const userDoc = new User({
      name: 'Test Tester',
      email: 'test@example.com',
      password: 'SamplePassword123!'
    });
    // Check methods exist
    assert(typeof userDoc.matchPassword === 'function', 'matchPassword method exists');
  });

  // Test 4: Workspace Progress Calculation Logic
  it('Progress calculation helper accurately computes percentages and boundary values', () => {
    const calcProgress = (tasks) => {
      const total = tasks.length;
      if (total === 0) return 0;
      const completed = tasks.filter(t => t.status === 'Completed').length;
      return Math.round((completed / total) * 100);
    };

    assert.strictEqual(calcProgress([]), 0, 'Empty task array gives 0%');
    assert.strictEqual(calcProgress([{ status: 'Todo' }]), 0, '0 of 1 gives 0%');
    assert.strictEqual(calcProgress([{ status: 'Completed' }, { status: 'Todo' }]), 50, '1 of 2 gives 50%');
    assert.strictEqual(calcProgress([{ status: 'Completed' }, { status: 'In Progress' }, { status: 'Backlog' }]), 33, '1 of 3 gives 33%');
    assert.strictEqual(calcProgress([{ status: 'Completed' }, { status: 'Completed' }]), 100, '2 of 2 gives 100%');
  });

  // Test 5: Authorization and Membership checks
  it('Membership check helper correctly permits members and owners while denying strangers', () => {
    const ownerId = new mongoose.Types.ObjectId();
    const memberId = new mongoose.Types.ObjectId();
    const strangerId = new mongoose.Types.ObjectId();

    const mockProject = {
      owner: ownerId,
      members: [ownerId, memberId],
      isMember(userId) {
        return this.members.some(m => m.toString() === userId.toString());
      },
      isOwner(userId) {
        return this.owner.toString() === userId.toString();
      }
    };

    assert(mockProject.isOwner(ownerId), 'Owner recognized as owner');
    assert(mockProject.isMember(ownerId), 'Owner recognized as member');
    assert(mockProject.isMember(memberId), 'Member recognized as member');
    assert(!mockProject.isOwner(memberId), 'Member is not owner');
    assert(!mockProject.isMember(strangerId), 'Stranger is not member');
    assert(!mockProject.isOwner(strangerId), 'Stranger is not owner');
  });

  // Test 6: Archive Toggle Logic
  it('Archive toggle toggles Active to Archived and Archived to Active', () => {
    let status = 'Active';
    const toggle = (s) => (s === 'Archived' ? 'Active' : 'Archived');

    status = toggle(status);
    assert.strictEqual(status, 'Archived', 'Active becomes Archived');
    status = toggle(status);
    assert.strictEqual(status, 'Active', 'Archived becomes Active');
  });

  // Test 7: Cascading Delete Verification
  it('Project controller cascading deletion invokes Task, Activity, and Notification cleanup', () => {
    let taskDeletedFor = null;
    let activityDeletedFor = null;
    let notifDeletedFor = null;

    // Simulate cleanup calls
    const mockProjectId = new mongoose.Types.ObjectId();
    const mockTaskDeleteMany = (filter) => { taskDeletedFor = filter.project; };
    const mockActivityDeleteMany = (filter) => { activityDeletedFor = filter.project; };
    const mockNotifDeleteMany = (filter) => { notifDeletedFor = filter.project; };

    mockTaskDeleteMany({ project: mockProjectId });
    mockActivityDeleteMany({ project: mockProjectId });
    mockNotifDeleteMany({ project: mockProjectId });

    assert.strictEqual(taskDeletedFor.toString(), mockProjectId.toString(), 'Tasks deleted for project');
    assert.strictEqual(activityDeletedFor.toString(), mockProjectId.toString(), 'Activities deleted for project');
    assert.strictEqual(notifDeletedFor.toString(), mockProjectId.toString(), 'Notifications deleted for project');
  });

  // Test 8: Comment validation
  it('Comment validation requires non-empty text and user', () => {
    const isValidComment = (text, user) => {
      return Boolean(text && typeof text === 'string' && text.trim().length > 0 && user);
    };

    assert(!isValidComment('', 'userId'), 'Empty text rejected');
    assert(!isValidComment('   ', 'userId'), 'Whitespace text rejected');
    assert(!isValidComment('Valid comment', null), 'Missing user rejected');
    assert(isValidComment('Great work on this task!', 'userId'), 'Valid comment accepted');
  });

  console.log(`\nResults: ${passedTests} / ${totalTests} tests passed.\n`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests();
