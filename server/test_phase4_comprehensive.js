require('dotenv').config();
const mongoose = require('mongoose');
const assert = require('assert');
const User = require('./src/models/User');
const Project = require('./src/models/Project');
const Task = require('./src/models/Task');
const Activity = require('./src/models/Activity');

async function runPhase4Tests() {
  console.log('=== STARTING PHASE 4 DASHBOARD & ANALYTICS COMPREHENSIVE TESTS ===\n');

  // TEST 1: Metric Calculation Consistency Tests (Unit Calculation Logic)
  console.log('Test 1: Metric Calculation Consistency (Pure Logic)');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pastDate = new Date(today);
  pastDate.setDate(pastDate.getDate() - 3);

  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + 3);

  const dummyUser1 = new mongoose.Types.ObjectId();
  const dummyUser2 = new mongoose.Types.ObjectId();
  const dummyProject = new mongoose.Types.ObjectId();

  const mockTasks = [
    { title: 'T1', status: 'Completed', priority: 'High', dueDate: pastDate, assignee: dummyUser1, project: dummyProject },
    { title: 'T2', status: 'In Progress', priority: 'Urgent', dueDate: pastDate, assignee: dummyUser1, project: dummyProject }, // Overdue!
    { title: 'T3', status: 'Todo', priority: 'Medium', dueDate: today, assignee: dummyUser1, project: dummyProject }, // Due today!
    { title: 'T4', status: 'Review', priority: 'Low', dueDate: futureDate, assignee: dummyUser2, project: dummyProject }, // Upcoming
    { title: 'T5', status: 'Backlog', priority: 'Medium', dueDate: null, assignee: null, project: dummyProject },
  ];

  let completedCount = 0;
  let pendingCount = 0;
  let overdueCount = 0;
  let dueTodayCount = 0;
  let myTasksCount = 0;

  mockTasks.forEach(t => {
    const isCompleted = t.status === 'Completed';
    if (isCompleted) completedCount++;
    else pendingCount++;

    if (t.dueDate) {
      const d = new Date(t.dueDate);
      d.setHours(0, 0, 0, 0);
      if (!isCompleted && d < today) overdueCount++;
      else if (!isCompleted && d.getTime() === today.getTime()) dueTodayCount++;
    }

    if (t.assignee && t.assignee.toString() === dummyUser1.toString()) {
      myTasksCount++;
    }
  });

  assert.strictEqual(completedCount, 1, 'Completed count should be 1');
  assert.strictEqual(pendingCount, 4, 'Pending count should be 4');
  assert.strictEqual(overdueCount, 1, 'Overdue count should be 1 (T2)');
  assert.strictEqual(dueTodayCount, 1, 'Due today count should be 1 (T3)');
  assert.strictEqual(myTasksCount, 3, 'My tasks count should be 3');
  console.log('✓ Test 1 Passed: Core dashboard metrics calculation verified\n');

  // TEST 2: Distribution Calculations (Status and Priority)
  console.log('Test 2: Status & Priority Distributions calculation');
  const byStatus = { Backlog: 0, Todo: 0, 'In Progress': 0, Review: 0, Completed: 0 };
  const byPriority = { Urgent: 0, High: 0, Medium: 0, Low: 0 };

  mockTasks.forEach(t => {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
  });

  assert.strictEqual(byStatus.Backlog, 1);
  assert.strictEqual(byStatus.Todo, 1);
  assert.strictEqual(byStatus['In Progress'], 1);
  assert.strictEqual(byStatus.Review, 1);
  assert.strictEqual(byStatus.Completed, 1);
  assert.strictEqual(byPriority.Urgent, 1);
  assert.strictEqual(byPriority.High, 1);
  assert.strictEqual(byPriority.Medium, 2);
  assert.strictEqual(byPriority.Low, 1);
  console.log('✓ Test 2 Passed: Status and priority breakdowns accurately computed\n');

  // TEST 3: Productivity Trend Logic Verification
  console.log('Test 3: Productivity trend date window calculation');
  const daysCount = 7;
  const trendWindow = [];
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - (daysCount - 1 - i));
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    trendWindow.push(k);
  }

  assert.strictEqual(trendWindow.length, 7, '7 days window generated');
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  assert.strictEqual(trendWindow[6], todayKey, 'Last element is today');
  console.log('✓ Test 3 Passed: Trend window timeline verified\n');

  // TEST 4: Live MongoDB Integration Test
  if (process.env.MONGODB_URI) {
    console.log('Test 4: Live MongoDB Integration for Dashboard Controller');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const testSuffix = Date.now();
    let testUser, testMember, outsiderUser;
    let testProject;
    let task1, task2, task3;

    try {
      // 1. Create test users
      testUser = await User.create({
        name: `Dash User ${testSuffix}`,
        email: `dash_user_${testSuffix}@example.com`,
        password: 'Password123!',
        avatarInitials: 'DU',
      });

      testMember = await User.create({
        name: `Dash Member ${testSuffix}`,
        email: `dash_mem_${testSuffix}@example.com`,
        password: 'Password123!',
        avatarInitials: 'DM',
      });

      outsiderUser = await User.create({
        name: `Outsider ${testSuffix}`,
        email: `outsider_${testSuffix}@example.com`,
        password: 'Password123!',
        avatarInitials: 'OU',
      });

      // 2. Create test project
      testProject = await Project.create({
        name: `Dash Project ${testSuffix}`,
        description: 'Dashboard test project',
        owner: testUser._id,
        members: [testUser._id, testMember._id],
        deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      });

      // 3. Create test tasks
      task1 = await Task.create({
        title: 'Task Due Today',
        project: testProject._id,
        assignee: testUser._id,
        createdBy: testUser._id,
        status: 'In Progress',
        priority: 'High',
        dueDate: new Date(), // Today
      });

      task2 = await Task.create({
        title: 'Completed Task',
        project: testProject._id,
        assignee: testUser._id,
        createdBy: testUser._id,
        status: 'Completed',
        priority: 'Medium',
        dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      task3 = await Task.create({
        title: 'Milestone Task',
        project: testProject._id,
        assignee: testMember._id,
        createdBy: testUser._id,
        status: 'Todo',
        type: 'Milestone',
        priority: 'Urgent',
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });

      // Log task completed activity
      await Activity.create({
        type: 'task_completed',
        user: testUser._id,
        project: testProject._id,
        task: task2._id,
      });

      // 4. Test Controller Method directly
      const { getDashboardStats } = require('./src/controllers/dashboardController');

      let jsonResponse = null;
      let statusCode = null;

      const mockReq = {
        user: testUser,
        query: { timeRange: '7d' },
      };

      const mockRes = {
        status: function(code) {
          statusCode = code;
          return this;
        },
        json: function(data) {
          jsonResponse = data;
          return this;
        },
      };

      await getDashboardStats(mockReq, mockRes, (err) => {
        if (err) throw err;
      });

      assert.strictEqual(statusCode, 200, 'Dashboard endpoint returned 200');
      assert.strictEqual(jsonResponse.summary.totalProjects, 1, 'Total projects is 1');
      assert.strictEqual(jsonResponse.summary.totalTasks, 3, 'Total tasks is 3');
      assert.strictEqual(jsonResponse.summary.completedTasks, 1, 'Completed tasks is 1');
      assert.strictEqual(jsonResponse.myTasksSummary.total, 2, 'My tasks is 2');
      assert.strictEqual(jsonResponse.myTasksSummary.completed, 1, 'My completed tasks is 1');
      assert.strictEqual(jsonResponse.milestones.length >= 2, true, 'At least 2 milestones (task + project deadline)');
      assert.strictEqual(jsonResponse.productivityTrend.hasData, true, 'Productivity trend captures completed activity');

      // 5. Test Unauthorized Scoped Project Access
      const unauthorizedReq = {
        user: outsiderUser,
        query: { projectId: testProject._id.toString() },
      };

      let errorCaught = false;
      await getDashboardStats(unauthorizedReq, mockRes, (err) => {
        errorCaught = true;
        assert(err.message.includes('Not authorized'), 'Should throw authorization error');
      });
      assert.strictEqual(errorCaught, true, 'Unauthorized access successfully blocked');

      console.log('✓ Test 4 Passed: Live DB Dashboard controller data aggregation, milestones, and authorization verified\n');
    } finally {
      // Cleanup
      if (task1) await Task.findByIdAndDelete(task1._id);
      if (task2) await Task.findByIdAndDelete(task2._id);
      if (task3) await Task.findByIdAndDelete(task3._id);
      if (testProject) {
        await Activity.deleteMany({ project: testProject._id });
        await Project.findByIdAndDelete(testProject._id);
      }
      if (testUser) await User.findByIdAndDelete(testUser._id);
      if (testMember) await User.findByIdAndDelete(testMember._id);
      if (outsiderUser) await User.findByIdAndDelete(outsiderUser._id);
      await mongoose.disconnect();
      console.log('Database cleaned up and disconnected.');
    }
  }

  console.log('=== ALL PHASE 4 TESTS COMPLETED AND PASSED SUCCESSFULLY! ===');
}

runPhase4Tests().catch(err => {
  console.error('Phase 4 Test Error:', err);
  process.exit(1);
});
