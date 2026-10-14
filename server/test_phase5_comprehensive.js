const API = 'http://localhost:5000/api';

async function req(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, ok: res.ok, data };
}

async function runPhase5Tests() {
  console.log('=== STARTING STUDYSYNC PHASE 5 COMPREHENSIVE TESTS ===\n');
  const timestamp = Date.now();

  try {
    // 1. Create test users
    console.log('1. Registering Test Users...');
    const userAEmail = `user_a_${timestamp}@example.com`;
    const userBEmail = `user_b_${timestamp}@example.com`;
    const userCEmail = `user_c_${timestamp}@example.com`;

    const regA = await req('POST', '/auth/register', {
      name: 'User Alpha',
      email: userAEmail,
      password: 'password123',
    });
    if (!regA.ok) throw new Error(`User A registration failed: ${JSON.stringify(regA.data)}`);
    const tokenA = regA.data.token;
    const userAId = regA.data._id;

    const regB = await req('POST', '/auth/register', {
      name: 'User Beta',
      email: userBEmail,
      password: 'password123',
    });
    if (!regB.ok) throw new Error(`User B registration failed: ${JSON.stringify(regB.data)}`);
    const tokenB = regB.data.token;
    const userBId = regB.data._id;

    const regC = await req('POST', '/auth/register', {
      name: 'User Charlie (Outsider)',
      email: userCEmail,
      password: 'password123',
    });
    if (!regC.ok) throw new Error(`User C registration failed: ${JSON.stringify(regC.data)}`);
    const tokenC = regC.data.token;

    console.log('✔ Test users registered successfully.\n');

    // 2. Create Project by User A
    console.log('2. Creating Project by User A...');
    const projRes = await req('POST', '/projects', {
      name: `Phase 5 Project ${timestamp}`,
      description: 'Testing Notifications & Activity'
    }, tokenA);
    if (!projRes.ok) throw new Error(`Project creation failed: ${JSON.stringify(projRes.data)}`);
    const projectId = projRes.data._id;
    console.log(`✔ Project created: ${projRes.data.name} (${projectId})\n`);

    // 3. User A invites User B (triggers notification & activity)
    console.log('3. User A inviting User B...');
    const inviteRes = await req('POST', `/projects/${projectId}/invitations`, {
      email: userBEmail,
      role: 'Member'
    }, tokenA);
    if (!inviteRes.ok) throw new Error(`Invite failed: ${JSON.stringify(inviteRes.data)}`);
    const inviteId = inviteRes.data._id || inviteRes.data.invitation?._id;
    console.log(`✔ Invitation sent (ID: ${inviteId})\n`);

    // 4. Verify User B received notification and unread count is 1
    console.log('4. Verifying User B notifications...');
    const notifsB1 = await req('GET', '/notifications', null, tokenB);
    const countB1 = await req('GET', '/notifications/unread-count', null, tokenB);
    console.log(`   User B notifications count: ${notifsB1.data.length}, unread: ${countB1.data.count}`);
    if (countB1.data.count < 1 || notifsB1.data.length < 1) {
      throw new Error('User B did not receive project invitation notification');
    }
    const inviteNotif = notifsB1.data.find(n => n.type === 'project_invitation');
    if (!inviteNotif || !inviteNotif.invitation) {
      throw new Error('Notification missing project_invitation type or invitation ref');
    }
    console.log('✔ Invitation notification verified with invitation link.\n');

    // 5. User B accepts the invitation
    console.log('5. User B accepting invitation...');
    const acceptRes = await req('POST', `/invitations/${inviteId}/accept`, {}, tokenB);
    if (!acceptRes.ok) throw new Error(`Accept failed: ${JSON.stringify(acceptRes.data)}`);
    console.log('✔ User B accepted invitation.\n');

    // 6. Verify User A received invitation_accepted notification
    console.log('6. Verifying User A received acceptance notification...');
    const notifsA1 = await req('GET', '/notifications', null, tokenA);
    const acceptNotif = notifsA1.data.find(n => n.type === 'invitation_accepted');
    if (!acceptNotif) {
      throw new Error('User A did not receive invitation_accepted notification');
    }
    console.log(`✔ User A received acceptance notification: "${acceptNotif.message}"\n`);

    // 7. Test Task Assignment Notification
    console.log('7. Testing Task Assignment Notification...');
    const taskRes = await req('POST', `/projects/${projectId}/tasks`, {
      title: 'Complete Phase 5 Spec',
      description: 'Implement notification center and paginated activity',
      assignee: userBId,
      priority: 'High',
      status: 'Todo',
      dueDate: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    }, tokenA);
    if (!taskRes.ok) throw new Error(`Task creation failed: ${JSON.stringify(taskRes.data)}`);
    const taskId = taskRes.data._id;
    console.log(`✔ Task created and assigned to User B (ID: ${taskId})`);

    const matchTask = (n, id) => n.task?._id?.toString() === id.toString() || n.task?.toString() === id.toString();

    const notifsB2 = await req('GET', '/notifications', null, tokenB);
    const taskAssignedNotif = notifsB2.data.find(n => n.type === 'task_assigned' && matchTask(n, taskId));
    if (!taskAssignedNotif) {
      console.log('Notifs found for B:', JSON.stringify(notifsB2.data));
      throw new Error('User B did not receive task_assigned notification');
    }
    console.log(`✔ User B received task_assigned notification: "${taskAssignedNotif.message}"\n`);

    // 8. Test Task Reassignment: User A reassigns task to User A (themselves)
    console.log('8. Testing Task Reassignment...');
    const reassignRes = await req('PUT', `/tasks/${taskId}`, {
      assignee: userAId
    }, tokenA);
    if (!reassignRes.ok) throw new Error(`Reassignment failed: ${JSON.stringify(reassignRes.data)}`);

    const notifsB3 = await req('GET', '/notifications', null, tokenB);
    const reassignedNotif = notifsB3.data.find(n => n.type === 'task_reassigned' && matchTask(n, taskId));
    if (!reassignedNotif) {
      throw new Error('User B was not notified about task reassignment');
    }
    console.log(`✔ User B received task_reassigned notification: "${reassignedNotif.message}"\n`);

    // Reassign back to User B
    await req('PUT', `/tasks/${taskId}`, { assignee: userBId }, tokenA);

    // 9. Test Task Status Changes
    console.log('9. Testing Task Status Changes...');
    // User A changes status to In Progress
    const statusProgRes = await req('PATCH', `/tasks/${taskId}/status`, { status: 'In Progress' }, tokenA);
    if (!statusProgRes.ok) throw new Error(`Status change failed: ${JSON.stringify(statusProgRes.data)}`);

    const notifsB4 = await req('GET', '/notifications', null, tokenB);
    const statusNotif = notifsB4.data.find(n => n.type === 'task_status_changed' && matchTask(n, taskId));
    if (!statusNotif) {
      throw new Error('User B was not notified about status change to In Progress');
    }
    console.log(`✔ User B received status change notification: "${statusNotif.message}"`);

    // User A completes task
    const statusCompRes = await req('PATCH', `/tasks/${taskId}/status`, { status: 'Completed' }, tokenA);
    if (!statusCompRes.ok) throw new Error(`Status completion failed: ${JSON.stringify(statusCompRes.data)}`);

    const notifsB5 = await req('GET', '/notifications', null, tokenB);
    const completedNotif = notifsB5.data.find(n => n.type === 'task_completed' && matchTask(n, taskId));
    if (!completedNotif) {
      throw new Error('User B was not notified about task completion');
    }
    console.log(`✔ User B received task_completed notification: "${completedNotif.message}"\n`);

    // 10. Test Notification Marking as Read (Single and All)
    console.log('10. Testing Mark As Read (Single & All)...');
    const targetNotifId = notifsB5.data[0]._id;
    const markSingleRes = await req('PATCH', `/notifications/${targetNotifId}/read`, {}, tokenB);
    if (!markSingleRes.ok || !markSingleRes.data.read) {
      throw new Error('Failed to mark single notification as read');
    }
    console.log('✔ Marked single notification as read.');

    const markAllRes = await req('PATCH', '/notifications/read-all', {}, tokenB);
    if (!markAllRes.ok) throw new Error('Failed to mark all as read');
    const countAfterReadAll = await req('GET', '/notifications/unread-count', null, tokenB);
    if (countAfterReadAll.data.count !== 0) {
      throw new Error(`Expected unread count 0, got ${countAfterReadAll.data.count}`);
    }
    console.log('✔ Marked all notifications as read (unread count is 0).\n');

    // 11. Test Notification Dismissal (Single & Clear All Read)
    console.log('11. Testing Notification Dismissal...');
    const notifToDelete = notifsB5.data[0]._id;
    const delSingleRes = await req('DELETE', `/notifications/${notifToDelete}`, null, tokenB);
    if (!delSingleRes.ok) throw new Error('Failed to dismiss single notification');
    const notifsAfterDeleteOne = await req('GET', '/notifications', null, tokenB);
    if (notifsAfterDeleteOne.data.some(n => n._id === notifToDelete)) {
      throw new Error('Notification still present after single dismissal');
    }
    console.log('✔ Successfully dismissed single notification.');

    // Clear all read
    const clearRes = await req('DELETE', '/notifications', null, tokenB);
    if (!clearRes.ok) throw new Error('Failed to clear read notifications');
    console.log(`✔ Cleared all read notifications (deleted: ${clearRes.data.deletedCount}).`);
    const notifsAfterClear = await req('GET', '/notifications', null, tokenB);
    if (notifsAfterClear.data.length !== 0) {
      throw new Error(`Expected 0 notifications after clearing read, got ${notifsAfterClear.data.length}`);
    }
    console.log('✔ Notification dismissal verified.\n');

    // 12. Test Configurable Notification Preferences
    console.log('12. Testing Configurable Notification Preferences...');
    const initialPrefs = await req('GET', '/notifications/preferences', null, tokenB);
    console.log('   Initial preferences:', initialPrefs.data);

    // Disable taskAssigned preferences for User B
    const updatedPrefs = await req('PATCH', '/notifications/preferences', { taskAssigned: false }, tokenB);
    if (!updatedPrefs.ok || updatedPrefs.data.taskAssigned !== false) {
      throw new Error('Failed to update notification preferences');
    }
    console.log('✔ Successfully disabled taskAssigned preference for User B.');

    // User A creates a task assigned to User B
    const taskPrefRes = await req('POST', `/projects/${projectId}/tasks`, {
      title: 'Task for Suppressed Notification',
      assignee: userBId,
      priority: 'Low',
      status: 'Todo',
    }, tokenA);
    const suppressedTaskId = taskPrefRes.data._id;

    // Check that User B did NOT receive notification due to preference
    const notifsBSuppressed = await req('GET', '/notifications', null, tokenB);
    const suppressedNotif = notifsBSuppressed.data.find(n => matchTask(n, suppressedTaskId));
    if (suppressedNotif) {
      throw new Error('Notification was sent even though taskAssigned was disabled in preferences!');
    }
    console.log('✔ Preference suppression confirmed: no notification was created when disabled.\n');

    // Re-enable taskAssigned
    await req('PATCH', '/notifications/preferences', { taskAssigned: true }, tokenB);

    // 13. Test Deadline Reminders (Within 24h & Deduplication)
    console.log('13. Testing Deadline Reminders Engine...');
    const taskApproaching = await req('POST', `/projects/${projectId}/tasks`, {
      title: 'Urgent Deadline Task',
      assignee: userBId,
      priority: 'Urgent',
      status: 'In Progress',
      dueDate: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
    }, tokenA);

    // Trigger deadline sweep
    const sweepRes = await req('POST', '/notifications/check-deadlines', {}, tokenA);
    console.log(`   Deadline sweep result: checked ${sweepRes.data.tasksChecked}, sent ${sweepRes.data.remindersSent}`);

    // Verify User B received deadline approaching reminder
    const notifsBDeadline = await req('GET', '/notifications', null, tokenB);
    const deadlineNotif = notifsBDeadline.data.find(n => n.type === 'task_deadline_approaching' && matchTask(n, taskApproaching.data._id));
    if (!deadlineNotif) {
      throw new Error('User B did not receive task_deadline_approaching notification');
    }
    console.log(`✔ User B received deadline reminder: "${deadlineNotif.message}"`);

    // Verify Deduplication on immediate second sweep (should send 0 duplicate reminders)
    const sweepRes2 = await req('POST', '/notifications/check-deadlines', {}, tokenA);
    if (sweepRes2.data.remindersSent !== 0) {
      throw new Error(`Deduplication failed! Sent ${sweepRes2.data.remindersSent} duplicate reminders on second sweep.`);
    }
    console.log('✔ Duplicate prevention verified: second sweep sent 0 duplicate reminders.\n');

    // 14. Test Project Activity Timeline & Pagination
    console.log('14. Testing Project Activity Timeline & Pagination...');
    const actResPage1 = await req('GET', `/projects/${projectId}/activities?page=1&limit=3`, null, tokenA);
    if (!actResPage1.ok) throw new Error(`Activities page 1 failed: ${JSON.stringify(actResPage1.data)}`);
    console.log(`   Project activities page 1: total=${actResPage1.data.total}, page=${actResPage1.data.page}, totalPages=${actResPage1.data.totalPages}, count=${actResPage1.data.activities.length}`);
    if (!actResPage1.data.activities || actResPage1.data.activities.length !== 3) {
      throw new Error(`Expected page 1 to return 3 activities, got ${actResPage1.data.activities.length}`);
    }
    if (actResPage1.data.total < 5) {
      throw new Error(`Expected at least 5 activities recorded for project, got ${actResPage1.data.total}`);
    }

    const actResPage2 = await req('GET', `/projects/${projectId}/activities?page=2&limit=3`, null, tokenA);
    if (!actResPage2.ok || actResPage2.data.activities.length < 1) {
      throw new Error('Expected page 2 to return activities');
    }
    if (actResPage1.data.activities[0]._id === actResPage2.data.activities[0]._id) {
      throw new Error('Pagination returned duplicate items across pages');
    }
    console.log('✔ Project activity pagination verified.');

    // 15. Test Activity Access Authorization
    console.log('\n15. Testing Activity Access Authorization...');
    const unauthActRes = await req('GET', `/projects/${projectId}/activities`, null, tokenC);
    if (unauthActRes.status === 403) {
      console.log('✔ Access denied (403 Forbidden) for non-project member verified.');
    } else {
      throw new Error(`Expected 403 Forbidden for outsider, got status ${unauthActRes.status}`);
    }

    console.log('\n======================================================');
    console.log('🎉 ALL PHASE 5 BACKEND TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('======================================================\n');
  } catch (error) {
    console.error('❌ Phase 5 Test Failed:', error.message);
    process.exit(1);
  }
}

runPhase5Tests();
