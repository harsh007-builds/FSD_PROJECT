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

async function runPhase10Tests() {
  console.log('====================================================');
  console.log('STUDYSYNC PHASE 10: COMPREHENSIVE AUTOMATED TEST SUITE');
  console.log('Study Rooms, Learning Sessions & Focus Timer Testing');
  console.log('====================================================\n');

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
    // 1. Setup Users & Authentication
    console.log('1. Setting up Test Users (Alpha, Beta, Outsider Charlie)...');
    
    // User Alpha (Project Owner)
    const userAlphaRes = await request('/auth/register', {
      method: 'POST',
      body: {
        name: `Alpha Host ${ts}`,
        email: `alpha_host_${ts}@test.com`,
        password: 'Password123!',
      },
    });
    assert.strictEqual(userAlphaRes.status, 201, 'Alpha registered');
    const alphaToken = userAlphaRes.data.token;
    const alphaId = (userAlphaRes.data._id || userAlphaRes.data.id || userAlphaRes.data.user?._id)?.toString();
    const alphaHeaders = { Authorization: `Bearer ${alphaToken}` };

    // User Beta (Project Member)
    const userBetaRes = await request('/auth/register', {
      method: 'POST',
      body: {
        name: `Beta Student ${ts}`,
        email: `beta_student_${ts}@test.com`,
        password: 'Password123!',
      },
    });
    assert.strictEqual(userBetaRes.status, 201, 'Beta registered');
    const betaToken = userBetaRes.data.token;
    const betaId = (userBetaRes.data._id || userBetaRes.data.id || userBetaRes.data.user?._id)?.toString();
    const betaHeaders = { Authorization: `Bearer ${betaToken}` };

    // User Charlie (Outsider - non-member)
    const userCharlieRes = await request('/auth/register', {
      method: 'POST',
      body: {
        name: `Charlie Outsider ${ts}`,
        email: `charlie_out_${ts}@test.com`,
        password: 'Password123!',
      },
    });
    assert.strictEqual(userCharlieRes.status, 201, 'Charlie registered');
    const charlieToken = userCharlieRes.data.token;
    const charlieHeaders = { Authorization: `Bearer ${charlieToken}` };

    pass('Registered Alpha (Host), Beta (Member), and Charlie (Outsider)');

    // 2. Setup Project & Add Beta as Member
    console.log('\n2. Creating Project and Memberships...');
    const projRes = await request('/projects', {
      method: 'POST',
      headers: alphaHeaders,
      body: {
        name: `Phase 10 Study Project ${ts}`,
        description: 'Testing study rooms and sessions',
      },
    });
    assert.strictEqual(projRes.status, 201, 'Project created');
    const projectId = (projRes.data._id || projRes.data.project?._id)?.toString();
    assert.ok(projectId, 'Project ID exists');

    // Add Beta as Member
    const addMemberRes = await request(`/projects/${projectId}/members`, {
      method: 'POST',
      headers: alphaHeaders,
      body: {
        email: `beta_student_${ts}@test.com`,
        role: 'Member',
      },
    });
    assert.ok([200, 201].includes(addMemberRes.status), 'Beta added to project');
    pass(`Created Project "${projectId}" and added Beta as project member`);

    // 3. Authorization & Project Membership Security
    console.log('\n3. Enforcing Project Membership & Access Permissions...');
    
    // Charlie tries to list sessions -> 403
    const outsiderGetRes = await request(`/projects/${projectId}/sessions`, {
      method: 'GET',
      headers: charlieHeaders,
    });
    assert.strictEqual(outsiderGetRes.status, 403, 'Non-member forbidden from reading sessions');
    pass('Outsider blocked from listing project sessions (HTTP 403)');

    // Charlie tries to schedule session -> 403
    const outsiderCreateRes = await request(`/projects/${projectId}/sessions`, {
      method: 'POST',
      headers: charlieHeaders,
      body: { title: 'Unauthorized Session', startTime: new Date().toISOString() },
    });
    assert.strictEqual(outsiderCreateRes.status, 403, 'Non-member forbidden from creating sessions');
    pass('Outsider blocked from creating study sessions (HTTP 403)');

    // 4. Server-Side Validation and Constraints
    console.log('\n4. Validating Session Constraints & Input Parameters...');

    // Blank title
    const emptyTitleRes = await request(`/projects/${projectId}/sessions`, {
      method: 'POST',
      headers: alphaHeaders,
      body: { title: '   ', startTime: new Date().toISOString() },
    });
    assert.strictEqual(emptyTitleRes.status, 400, 'Blank title rejected');
    pass('Blank session title rejected (HTTP 400)');

    // Invalid start time
    const invalidTimeRes = await request(`/projects/${projectId}/sessions`, {
      method: 'POST',
      headers: alphaHeaders,
      body: { title: 'Valid Title', startTime: 'invalid-date-string' },
    });
    assert.strictEqual(invalidTimeRes.status, 400, 'Invalid start time rejected');
    pass('Invalid start time format rejected (HTTP 400)');

    // Invalid duration (< 5 or > 720 mins)
    const invalidDurationRes = await request(`/projects/${projectId}/sessions`, {
      method: 'POST',
      headers: alphaHeaders,
      body: { title: 'Valid Title', startTime: new Date().toISOString(), duration: 2 },
    });
    assert.strictEqual(invalidDurationRes.status, 400, 'Under 5 min duration rejected');
    pass('Invalid duration (< 5 mins) rejected (HTTP 400)');

    // 5. Creating Valid Study Session & Scheduling
    console.log('\n5. Scheduling Persistent Study Session with Goals & Timer Config...');
    const scheduledStart = new Date(Date.now() + 3600000).toISOString(); // 1 hour in future
    const createRes = await request(`/projects/${projectId}/sessions`, {
      method: 'POST',
      headers: alphaHeaders,
      body: {
        title: 'Algorithms Final Exam Study Session',
        agenda: 'Review divide-and-conquer, dynamic programming, and amortized analysis.',
        startTime: scheduledStart,
        duration: 90,
        goals: [
          'Master master-theorem recurrence relations',
          'Solve 3 DP memoization problems',
          'Review Dijkstra shortest paths proofs',
        ],
        participants: [alphaId, betaId],
        timerConfig: {
          mode: 'pomodoro',
          workInterval: 25,
          breakInterval: 5,
          cycles: 4,
        },
      },
    });
    assert.strictEqual(createRes.status, 201, 'Session created');
    const session1 = createRes.data;
    assert.ok(session1._id, 'Session has valid ID');
    assert.strictEqual(session1.title, 'Algorithms Final Exam Study Session');
    assert.strictEqual(session1.status, 'Scheduled');
    assert.strictEqual(session1.duration, 90);
    assert.strictEqual(session1.goals.length, 3);
    assert.strictEqual(session1.timerState?.remainingSeconds, 1500); // 25 mins in seconds
    assert.strictEqual(session1.host?.name, `Alpha Host ${ts}`);
    assert.strictEqual(session1.participants.length, 2);
    pass('Study session scheduled with Pomodoro timer config and learning goals');

    // 6. Session Details & Participant Join
    console.log('\n6. Fetching Session Details & Joining Session...');
    const getRes = await request(`/projects/${projectId}/sessions/${session1._id}`, {
      method: 'GET',
      headers: betaHeaders,
    });
    assert.strictEqual(getRes.status, 200, 'Beta fetched session');
    assert.strictEqual(getRes.data.title, session1.title);
    assert.strictEqual(getRes.data.goals.length, 3);

    // Beta joins session explicitly
    const joinRes = await request(`/projects/${projectId}/sessions/${session1._id}/join`, {
      method: 'POST',
      headers: betaHeaders,
    });
    assert.strictEqual(joinRes.status, 200, 'Join succeeded');
    assert.ok(joinRes.data.participants?.some(p => (p._id || p)?.toString() === betaId), 'Beta in participants list');
    pass('Participant joined session and verified in participants array');

    // 7. Focus Timer Operations & Server Drift-Free Anchor
    console.log('\n7. Testing Synchronized Focus Timer Controls...');

    // Start Timer
    const startTimerRes = await request(`/projects/${projectId}/sessions/${session1._id}/timer`, {
      method: 'POST',
      headers: alphaHeaders,
      body: { action: 'start' },
    });
    assert.strictEqual(startTimerRes.status, 200, 'Timer start succeeded');
    assert.strictEqual(startTimerRes.data.timerState.status, 'running');
    assert.strictEqual(startTimerRes.data.status, 'In Progress', 'Session auto-transitioned to In Progress');
    assert.ok(startTimerRes.data.timerState.targetEndTime, 'Server computed targetEndTime anchor');
    pass('Timer started with targetEndTime anchor and transitioned session to "In Progress"');

    // Pause Timer
    const pauseTimerRes = await request(`/projects/${projectId}/sessions/${session1._id}/timer`, {
      method: 'POST',
      headers: alphaHeaders,
      body: { action: 'pause' },
    });
    assert.strictEqual(pauseTimerRes.status, 200, 'Timer pause succeeded');
    assert.strictEqual(pauseTimerRes.data.timerState.status, 'paused');
    assert.ok(typeof pauseTimerRes.data.timerState.remainingSeconds === 'number');
    pass('Timer paused and remaining seconds accurately captured on server');

    // Skip to Next Phase (Break Phase)
    const nextPhaseRes = await request(`/projects/${projectId}/sessions/${session1._id}/timer`, {
      method: 'POST',
      headers: alphaHeaders,
      body: { action: 'next_phase' },
    });
    assert.strictEqual(nextPhaseRes.status, 200);
    assert.strictEqual(nextPhaseRes.data.timerState.phase, 'break');
    assert.strictEqual(nextPhaseRes.data.timerState.remainingSeconds, 300); // 5 mins break
    pass('Timer progressed to short break phase (300 seconds)');

    // Reset Timer
    const resetTimerRes = await request(`/projects/${projectId}/sessions/${session1._id}/timer`, {
      method: 'POST',
      headers: alphaHeaders,
      body: { action: 'reset', phase: 'work' },
    });
    assert.strictEqual(resetTimerRes.status, 200);
    assert.strictEqual(resetTimerRes.data.timerState.status, 'idle');
    assert.strictEqual(resetTimerRes.data.timerState.remainingSeconds, 1500); // 25 mins
    pass('Timer reset back to work interval');

    // 8. Learning Goals Checklist Tracking
    console.log('\n8. Testing Interactive Learning Goals Checklist...');
    const goal1Id = session1.goals[0]._id;

    // Beta completes goal 1
    const toggleRes = await request(`/projects/${projectId}/sessions/${session1._id}/goals/${goal1Id}`, {
      method: 'PATCH',
      headers: betaHeaders,
    });
    assert.strictEqual(toggleRes.status, 200);
    assert.strictEqual(toggleRes.data.goal.completed, true);
    assert.strictEqual(toggleRes.data.goal.completedBy, betaId);
    assert.ok(toggleRes.data.goal.completedAt, 'completedAt recorded');
    pass('Goal toggled to completed with timestamp and editor attribution');

    // 9. Time Zones & Timeframe Filtering
    console.log('\n9. Testing Date/Time Scheduling & Filter Aggregations...');
    
    // Create an explicit past completed session
    const pastStart = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
    const pastSessionRes = await request(`/projects/${projectId}/sessions`, {
      method: 'POST',
      headers: alphaHeaders,
      body: {
        title: 'Past Completed Review Session',
        startTime: pastStart,
        duration: 45,
      },
    });
    assert.strictEqual(pastSessionRes.status, 201);
    const pastSessionId = pastSessionRes.data._id;

    // Complete the past session
    await request(`/projects/${projectId}/sessions/${pastSessionId}`, {
      method: 'PUT',
      headers: alphaHeaders,
      body: {
        status: 'Completed',
        summaryNotes: 'All graph concepts reviewed thoroughly.',
      },
    });

    // Fetch with filter status=In Progress
    const activeRes = await request(`/projects/${projectId}/sessions?status=In Progress`, {
      method: 'GET',
      headers: alphaHeaders,
    });
    assert.strictEqual(activeRes.status, 200);
    assert.ok(activeRes.data.sessions.some(s => s._id === session1._id));
    pass('Filtered active/in-progress sessions correctly');

    // Fetch with filter status=Completed
    const completedRes = await request(`/projects/${projectId}/sessions?status=Completed`, {
      method: 'GET',
      headers: alphaHeaders,
    });
    assert.strictEqual(completedRes.status, 200);
    assert.ok(completedRes.data.sessions.some(s => s._id === pastSessionId));
    assert.strictEqual(completedRes.data.counts.completed >= 1, true);
    pass('Filtered completed sessions and verified aggregate counts');

    // 10. Deletion & Moderation Permissions
    console.log('\n10. Testing Deletion & Moderation Permissions...');

    // Charlie tries to delete session1 -> 403
    const charlieDel = await request(`/projects/${projectId}/sessions/${session1._id}`, {
      method: 'DELETE',
      headers: charlieHeaders,
    });
    assert.strictEqual(charlieDel.status, 403, 'Outsider cannot delete session');
    pass('Outsider blocked from deleting study sessions (HTTP 403)');

    // Regular member Beta cannot delete Alpha's session -> 403
    const betaDelAlpha = await request(`/projects/${projectId}/sessions/${session1._id}`, {
      method: 'DELETE',
      headers: betaHeaders,
    });
    assert.strictEqual(betaDelAlpha.status, 403, 'Member cannot delete host session');
    pass('Regular member blocked from deleting another member’s session (HTTP 403)');

    // Alpha (Host/Owner) deletes past session -> 200
    const alphaDel = await request(`/projects/${projectId}/sessions/${pastSessionId}`, {
      method: 'DELETE',
      headers: alphaHeaders,
    });
    assert.strictEqual(alphaDel.status, 200, 'Host deleted session');
    pass('Host successfully deleted study session');

    console.log('\n====================================================');
    console.log(`ALL PHASE 10 TESTS PASSED: ${passedCount} passed, ${failedCount} failed.`);
    console.log('====================================================\n');
  } catch (error) {
    fail('Test suite crashed unexpectedly', error);
    console.error('\n' + error.stack);
    process.exit(1);
  }
}

runPhase10Tests();
