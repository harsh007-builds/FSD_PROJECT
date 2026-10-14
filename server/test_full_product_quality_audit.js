const assert = require('assert');

const BASE_URL = 'http://localhost:5000/api';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { ...options.headers };
  
  if (options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return {
    status: response.status,
    headers: response.headers,
    data,
  };
}

async function runMasterQualityAudit() {
  console.log('================================================================');
  console.log('STUDYSYNC PHASE 11: FULL-PRODUCT QUALITY & INTEGRATION AUDIT');
  console.log('Complete End-to-End SaaS Feature & Security Pass');
  console.log('================================================================\n');

  const ts = Date.now();
  let passedCount = 0;
  let failedCount = 0;

  function pass(msg) {
    passedCount++;
    console.log(`  [PASS] ${msg}`);
  }

  function fail(msg, err) {
    failedCount++;
    console.error(`  [FAIL] ${msg}`);
    if (err) console.error('         Error details:', err);
  }

  try {
    // -------------------------------------------------------------
    // AUDIT 1: AUTHENTICATION, REGISTRATION & PROTECTED ROUTES
    // -------------------------------------------------------------
    console.log('1. Auditing Authentication, JWT Tokens & Route Guards...');

    // Unauthorized access should return 401
    const unauthProjects = await request('/projects', { method: 'GET' });
    assert.strictEqual(unauthProjects.status, 401, 'Unauthorized request rejected');
    pass('Unauthenticated request to protected route denied with HTTP 401');

    // Register User Alpha (Owner)
    const alphaReg = await request('/auth/register', {
      method: 'POST',
      body: {
        name: `Audit Owner ${ts}`,
        email: `audit_owner_${ts}@test.com`,
        password: 'Password123!',
      },
    });
    assert.strictEqual(alphaReg.status, 201, 'Alpha registered');
    const alphaToken = alphaReg.data.token;
    const alphaId = (alphaReg.data._id || alphaReg.data.id || alphaReg.data.user?._id)?.toString();
    const alphaHeaders = { Authorization: `Bearer ${alphaToken}` };

    // Register User Beta (Teammate)
    const betaReg = await request('/auth/register', {
      method: 'POST',
      body: {
        name: `Audit Member ${ts}`,
        email: `audit_member_${ts}@test.com`,
        password: 'Password123!',
      },
    });
    assert.strictEqual(betaReg.status, 201, 'Beta registered');
    const betaToken = betaReg.data.token;
    const betaId = (betaReg.data._id || betaReg.data.id || betaReg.data.user?._id)?.toString();
    const betaHeaders = { Authorization: `Bearer ${betaToken}` };

    // Register User Charlie (Outsider)
    const charlieReg = await request('/auth/register', {
      method: 'POST',
      body: {
        name: `Audit Outsider ${ts}`,
        email: `audit_outsider_${ts}@test.com`,
        password: 'Password123!',
      },
    });
    assert.strictEqual(charlieReg.status, 201, 'Charlie registered');
    const charlieToken = charlieReg.data.token;
    const charlieHeaders = { Authorization: `Bearer ${charlieToken}` };

    // Login test
    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: { email: `audit_owner_${ts}@test.com`, password: 'Password123!' },
    });
    assert.strictEqual(loginRes.status, 200, 'Login succeeded');
    assert.ok(loginRes.data.token, 'JWT token returned on login');
    pass('User registration, login, and JWT credential generation verified');

    // -------------------------------------------------------------
    // AUDIT 2: PROJECT CRUD & WORKSPACE INTEGRATION
    // -------------------------------------------------------------
    console.log('\n2. Auditing Project Management & Lifecycle...');
    const projRes = await request('/projects', {
      method: 'POST',
      headers: alphaHeaders,
      body: {
        name: `Master Audit Project ${ts}`,
        description: 'End-to-end full-stack integration project',
        deadline: new Date(Date.now() + 86400000 * 14).toISOString(),
      },
    });
    assert.strictEqual(projRes.status, 201, 'Project created');
    const projectId = (projRes.data._id || projRes.data.project?._id)?.toString();

    // Add Beta as Member
    const addBetaRes = await request(`/projects/${projectId}/members`, {
      method: 'POST',
      headers: alphaHeaders,
      body: { email: `audit_member_${ts}@test.com`, role: 'Member' },
    });
    assert.ok([200, 201].includes(addBetaRes.status), 'Beta added to project');
    pass('Project created, initialized with deadline, and member added');

    // Archive toggle
    const archiveRes = await request(`/projects/${projectId}/archive`, {
      method: 'PATCH',
      headers: alphaHeaders,
    });
    assert.strictEqual(archiveRes.status, 200);
    assert.strictEqual(archiveRes.data.status, 'Archived');

    // Unarchive
    const unarchiveRes = await request(`/projects/${projectId}/archive`, {
      method: 'PATCH',
      headers: alphaHeaders,
    });
    assert.strictEqual(unarchiveRes.status, 200);
    assert.strictEqual(unarchiveRes.data.status, 'Active');
    pass('Project archive and unarchive state transitions verified');

    // -------------------------------------------------------------
    // AUDIT 3: KANBAN BOARD & TASK MANAGEMENT PERSISTENCE
    // -------------------------------------------------------------
    console.log('\n3. Auditing Kanban Board Status Persistence & Task Movement...');
    
    // Create task in Backlog
    const taskCreateRes = await request(`/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: alphaHeaders,
      body: {
        title: 'Master Architecture Review',
        description: 'Review system schemas and end-to-end data pipeline',
        projectId,
        status: 'Backlog',
        priority: 'High',
        assignee: betaId,
        dueDate: new Date(Date.now() + 86400000 * 3).toISOString(),
      },
    });
    assert.strictEqual(taskCreateRes.status, 201);
    const taskId = taskCreateRes.data._id || taskCreateRes.data.task?._id || taskCreateRes.data.id;
    assert.ok(taskId, 'Task ID returned');

    // Kanban Movement: Backlog -> In Progress -> Review -> Completed
    const statuses = ['In Progress', 'Review', 'Completed'];
    for (const nextStatus of statuses) {
      const moveRes = await request(`/tasks/${taskId}`, {
        method: 'PUT',
        headers: betaHeaders,
        body: { status: nextStatus },
      });
      assert.strictEqual(moveRes.status, 200);
      assert.strictEqual((moveRes.data.status || moveRes.data.task?.status), nextStatus);
    }
    pass('Task successfully traversed Kanban columns with persistence to MongoDB');

    // -------------------------------------------------------------
    // AUDIT 4: DASHBOARD & WORKSPACE CALCULATIONS
    // -------------------------------------------------------------
    console.log('\n4. Auditing Analytics & Dashboard Calculations...');
    const dashRes = await request(`/dashboard/stats?projectId=${projectId}`, {
      method: 'GET',
      headers: alphaHeaders,
    });
    assert.strictEqual(dashRes.status, 200);
    assert.strictEqual(dashRes.data.summary?.totalTasks >= 1, true);
    assert.strictEqual(dashRes.data.summary?.completedTasks >= 1, true);
    assert.strictEqual(dashRes.data.summary?.completionRate, 100, 'Calculated completion rate is 100% for completed tasks');
    pass('Dashboard metrics and project progress computed accurately from live database data');

    // -------------------------------------------------------------
    // AUDIT 5: NOTIFICATIONS & ACTIVITY AUDIT TIMELINE
    // -------------------------------------------------------------
    console.log('\n5. Auditing Notification Center & Activity Feed...');
    const notifsRes = await request('/notifications', {
      method: 'GET',
      headers: betaHeaders,
    });
    assert.strictEqual(notifsRes.status, 200);
    assert.ok(Array.isArray(notifsRes.data), 'Notifications is array');

    const actRes = await request(`/activities?projectId=${projectId}`, {
      method: 'GET',
      headers: alphaHeaders,
    });
    assert.strictEqual(actRes.status, 200);
    assert.ok(Array.isArray(actRes.data) || Array.isArray(actRes.data.activities));
    pass('Notifications and project activity timeline verified');

    // -------------------------------------------------------------
    // AUDIT 6: GLOBAL SEARCH ACROSS ENTITIES
    // -------------------------------------------------------------
    console.log('\n6. Auditing Global Cross-Project Search...');
    const searchRes = await request('/search?q=Master', {
      method: 'GET',
      headers: alphaHeaders,
    });
    assert.strictEqual(searchRes.status, 200);
    assert.ok(searchRes.data.counts?.total >= 1, 'Search found matching project/task records');
    pass('Unified global search returned matched and grouped results');

    // -------------------------------------------------------------
    // AUDIT 7: PROJECT RESOURCES & REPOSITORY LINKS
    // -------------------------------------------------------------
    console.log('\n7. Auditing Project Learning Resources...');
    const linkRes = await request(`/projects/${projectId}/resources`, {
      method: 'POST',
      headers: alphaHeaders,
      body: {
        title: 'System Architecture Specification',
        type: 'link',
        url: 'https://developer.mozilla.org/en-US/docs/Web/API',
        category: 'Link',
        tags: ['spec', 'docs'],
      },
    });
    assert.strictEqual(linkRes.status, 201);
    const resourceId = linkRes.data._id;
    assert.ok(resourceId, 'Resource created');
    pass('Project learning resource link created and validated');

    // -------------------------------------------------------------
    // AUDIT 8: PERSISTENT PROJECT DISCUSSIONS & CHAT
    // -------------------------------------------------------------
    console.log('\n8. Auditing Project Discussions & Threaded Replies...');
    const msgRes = await request(`/projects/${projectId}/messages`, {
      method: 'POST',
      headers: alphaHeaders,
      body: { content: 'Auditing Phase 11 chat persistence' },
    });
    assert.strictEqual(msgRes.status, 201);
    const msgId = msgRes.data._id || msgRes.data.message?._id;

    // Beta replies to msg
    const replyRes = await request(`/projects/${projectId}/messages`, {
      method: 'POST',
      headers: betaHeaders,
      body: { content: 'Acknowledged by Beta', replyTo: msgId },
    });
    assert.strictEqual(replyRes.status, 201);
    pass('Persistent chat message and threaded reply created and linked');

    // -------------------------------------------------------------
    // AUDIT 9: SHARED STUDY NOTES & OPTIMISTIC CONCURRENCY
    // -------------------------------------------------------------
    console.log('\n9. Auditing Shared Study Notes & Version Conflict Protection...');
    const noteRes = await request(`/projects/${projectId}/notes`, {
      method: 'POST',
      headers: alphaHeaders,
      body: {
        title: 'Full Product Architecture Notes',
        content: '# StudySync Tech Stack\n\nMongoDB, Express, React, Node.js, Socket.IO.',
        category: 'Summary',
        tags: ['architecture', 'notes'],
      },
    });
    assert.strictEqual(noteRes.status, 201);
    const noteId = noteRes.data._id;
    assert.strictEqual(noteRes.data.version, 1);

    // Beta updates note -> v2
    const noteV2Res = await request(`/projects/${projectId}/notes/${noteId}`, {
      method: 'PUT',
      headers: betaHeaders,
      body: {
        title: 'Full Product Architecture Notes (Updated)',
        content: '# StudySync Tech Stack (Updated)\n\nAdded concurrency protection.',
        expectedVersion: 1,
      },
    });
    assert.strictEqual(noteV2Res.status, 200);
    assert.strictEqual(noteV2Res.data.version, 2);

    // Stale edit with expectedVersion: 1 must return 409 Conflict
    const staleNoteRes = await request(`/projects/${projectId}/notes/${noteId}`, {
      method: 'PUT',
      headers: alphaHeaders,
      body: {
        title: 'Stale Overwrite Attempt',
        expectedVersion: 1,
      },
    });
    assert.strictEqual(staleNoteRes.status, 409, 'Conflict detected on stale version');
    pass('Shared note creation, version increment, and HTTP 409 conflict protection verified');

    // -------------------------------------------------------------
    // AUDIT 10: STUDY ROOMS, GOALS & SYNCHRONIZED TIMERS
    // -------------------------------------------------------------
    console.log('\n10. Auditing Study Rooms, Focus Timers & Learning Goals...');
    const sessionRes = await request(`/projects/${projectId}/sessions`, {
      method: 'POST',
      headers: alphaHeaders,
      body: {
        title: 'Product Review Focus Session',
        startTime: new Date(Date.now() + 7200000).toISOString(),
        duration: 45,
        goals: ['Verify test results', 'Confirm zero mock data'],
        timerConfig: { mode: 'pomodoro', workInterval: 25, breakInterval: 5 },
      },
    });
    assert.strictEqual(sessionRes.status, 201);
    const sessionId = sessionRes.data._id;

    // Start timer -> auto In Progress
    const timerStart = await request(`/projects/${projectId}/sessions/${sessionId}/timer`, {
      method: 'POST',
      headers: alphaHeaders,
      body: { action: 'start' },
    });
    assert.strictEqual(timerStart.status, 200);
    assert.strictEqual(timerStart.data.status, 'In Progress');
    assert.ok(timerStart.data.timerState.targetEndTime);

    // Toggle goal
    const goalId = sessionRes.data.goals[0]._id;
    const goalToggle = await request(`/projects/${projectId}/sessions/${sessionId}/goals/${goalId}`, {
      method: 'PATCH',
      headers: betaHeaders,
    });
    assert.strictEqual(goalToggle.status, 200);
    assert.strictEqual(goalToggle.data.goal.completed, true);
    pass('Study room focus timer started and checklist goal completed');

    // -------------------------------------------------------------
    // AUDIT 11: ACCESS CONTROL & OUTSIDER ISOLATION
    // -------------------------------------------------------------
    console.log('\n11. Auditing Authorization Boundaries & Non-Member Isolation...');
    
    // Charlie (outsider) checks
    const outsiderTests = [
      { name: 'GET Notes', url: `/projects/${projectId}/notes` },
      { name: 'GET Messages', url: `/projects/${projectId}/messages` },
      { name: 'GET Sessions', url: `/projects/${projectId}/sessions` },
      { name: 'GET Resources', url: `/projects/${projectId}/resources` },
    ];

    for (const test of outsiderTests) {
      const res = await request(test.url, {
        method: 'GET',
        headers: charlieHeaders,
      });
      assert.strictEqual(res.status, 403, `Charlie blocked from ${test.name}`);
    }
    pass('All private project APIs strictly enforce authorization (HTTP 403 Forbidden for non-members)');

    console.log('\n================================================================');
    console.log(`FULL-PRODUCT AUDIT COMPLETED: ${passedCount} passed, ${failedCount} failed.`);
    console.log('================================================================\n');
  } catch (err) {
    fail('Audit suite crashed unexpectedly', err);
    console.error(err.stack);
    process.exit(1);
  }
}

runMasterQualityAudit();
