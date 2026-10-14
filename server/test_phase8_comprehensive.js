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

async function runPhase8Tests() {
  console.log('====================================================');
  console.log('STUDYSYNC PHASE 8: COMPREHENSIVE AUTOMATED TEST SUITE');
  console.log('Project Chat and Persistent Discussions Testing');
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
    console.log('1. Setting up Test Users & Authentications...');
    
    // User Alpha (Project Owner)
    const userAlphaRes = await request('/auth/register', {
      method: 'POST',
      body: {
        name: `Alpha Tester ${ts}`,
        email: `alpha_${ts}@test.com`,
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
        name: `Beta Tester ${ts}`,
        email: `beta_${ts}@test.com`,
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
        email: `charlie_${ts}@test.com`,
        password: 'Password123!',
      },
    });
    assert.strictEqual(userCharlieRes.status, 201, 'Charlie registered');
    const charlieToken = userCharlieRes.data.token;
    const charlieId = (userCharlieRes.data._id || userCharlieRes.data.id || userCharlieRes.data.user?._id)?.toString();
    const charlieHeaders = { Authorization: `Bearer ${charlieToken}` };

    pass('Registered Alpha (Owner), Beta (Member), and Charlie (Outsider)');

    // 2. Setup Project & Add Beta as Member
    console.log('\n2. Creating Project and Memberships...');
    const projRes = await request('/projects', {
      method: 'POST',
      headers: alphaHeaders,
      body: {
        name: `Phase 8 Chat Project ${ts}`,
        description: 'Testing project chat and discussions',
      },
    });
    assert.strictEqual(projRes.status, 201, 'Project created');
    const projectId = projRes.data._id || projRes.data.project?._id;
    assert.ok(projectId, 'Project ID exists');

    // Add Beta as Member
    const addMemberRes = await request(`/projects/${projectId}/members`, {
      method: 'POST',
      headers: alphaHeaders,
      body: {
        email: `beta_${ts}@test.com`,
        role: 'Member',
      },
    });
    assert.ok([200, 201].includes(addMemberRes.status), `Beta added to project (status: ${addMemberRes.status})`);
    pass(`Created Project "${projectId}" and added Beta as project member`);

    // 3. Authorization & Project Membership Security
    console.log('\n3. Enforcing Project Membership & Access Permissions...');
    
    // Charlie tries to list messages -> 403
    const outsiderGetRes = await request(`/projects/${projectId}/messages`, {
      method: 'GET',
      headers: charlieHeaders,
    });
    assert.strictEqual(outsiderGetRes.status, 403, 'Non-member forbidden from reading messages');
    pass('Outsider blocked from reading project messages (HTTP 403)');

    // Charlie tries to send message -> 403
    const outsiderSendRes = await request(`/projects/${projectId}/messages`, {
      method: 'POST',
      headers: charlieHeaders,
      body: { content: 'I should not be able to send this' },
    });
    assert.strictEqual(outsiderSendRes.status, 403, 'Non-member forbidden from sending messages');
    pass('Outsider blocked from sending project messages (HTTP 403)');

    // Charlie tries to mark read -> 403
    const outsiderReadRes = await request(`/projects/${projectId}/messages/read`, {
      method: 'POST',
      headers: charlieHeaders,
    });
    assert.strictEqual(outsiderReadRes.status, 403, 'Non-member forbidden from marking read');
    pass('Outsider blocked from marking read (HTTP 403)');

    // Charlie tries to get unread count -> 403
    const outsiderUnreadRes = await request(`/projects/${projectId}/messages/unread-count`, {
      method: 'GET',
      headers: charlieHeaders,
    });
    assert.strictEqual(outsiderUnreadRes.status, 403, 'Non-member forbidden from unread count');
    pass('Outsider blocked from unread count (HTTP 403)');

    // 4. Message Validation and Content Limits
    console.log('\n4. Validating Message Content Constraints & Length Limits...');

    // Empty message
    const emptyMsgRes = await request(`/projects/${projectId}/messages`, {
      method: 'POST',
      headers: alphaHeaders,
      body: { content: '    ' },
    });
    assert.strictEqual(emptyMsgRes.status, 400, 'Blank message rejected');
    pass('Empty / whitespace-only message rejected (HTTP 400)');

    // Excessively long message (> 4000 characters)
    const longContent = 'A'.repeat(4001);
    const longMsgRes = await request(`/projects/${projectId}/messages`, {
      method: 'POST',
      headers: alphaHeaders,
      body: { content: longContent },
    });
    assert.strictEqual(longMsgRes.status, 400, 'Over 4000 char message rejected');
    pass('Exceedingly long message (>4000 chars) rejected (HTTP 400)');

    // 5. Sending Messages and Basic Persistence
    console.log('\n5. Testing Persistent Message Creation and Sender Profiles...');
    const msg1Content = 'Welcome team to the StudySync Phase 8 discussion!';
    const sendRes1 = await request(`/projects/${projectId}/messages`, {
      method: 'POST',
      headers: alphaHeaders,
      body: { content: msg1Content },
    });
    assert.strictEqual(sendRes1.status, 201, 'Alpha message sent');
    const msg1 = sendRes1.data.message || sendRes1.data;
    assert.ok(msg1?._id, 'Message ID returned');
    assert.strictEqual(msg1.content, msg1Content);
    assert.strictEqual(msg1.sender?.name, `Alpha Tester ${ts}`);
    assert.ok(msg1.readBy?.some(r => (r.user?._id || r.user)?.toString() === alphaId), 'Sender auto-marked as read');
    pass('Message successfully created and persisted with sender profile');

    // 6. Threaded Discussions & Replies
    console.log('\n6. Testing Replies & Threaded References...');
    const replyContent = 'Excited to be working on this phase!';
    const replyRes = await request(`/projects/${projectId}/messages`, {
      method: 'POST',
      headers: betaHeaders,
      body: {
        content: replyContent,
        replyTo: msg1._id,
      },
    });
    assert.strictEqual(replyRes.status, 201, 'Reply sent');
    const replyMsg = replyRes.data.message || replyRes.data;
    assert.ok(replyMsg.replyTo, 'Reply reference exists');
    assert.strictEqual(replyMsg.replyTo._id, msg1._id);
    assert.strictEqual(replyMsg.replyTo.content, msg1Content);
    pass('Reply created with populated parent message context');

    // 7. Unread Count and Read Tracking
    console.log('\n7. Testing Read Receipts & Unread Tracking...');
    // Beta sent a reply. Alpha should have 1 unread message.
    const alphaUnreadRes = await request(`/projects/${projectId}/messages/unread-count`, {
      method: 'GET',
      headers: alphaHeaders,
    });
    assert.strictEqual(alphaUnreadRes.status, 200);
    assert.strictEqual(alphaUnreadRes.data.unreadCount, 1, 'Alpha has 1 unread message from Beta');
    pass('Accurate unread message count calculated for project members');

    // Alpha marks messages as read
    const markReadRes = await request(`/projects/${projectId}/messages/read`, {
      method: 'POST',
      headers: alphaHeaders,
    });
    assert.strictEqual(markReadRes.status, 200);
    assert.ok(markReadRes.data.markedCount >= 1, 'Marked messages as read');

    // Alpha checks unread count again -> should be 0
    const alphaUnreadRes2 = await request(`/projects/${projectId}/messages/unread-count`, {
      method: 'GET',
      headers: alphaHeaders,
    });
    assert.strictEqual(alphaUnreadRes2.data.unreadCount, 0, 'Unread count is now 0');
    pass('Marking messages as read updates read receipts and resets unread count to 0');

    // 8. Message Editing (Author Permissions)
    console.log('\n8. Testing Message Editing Permissions...');
    const updatedContent = 'Welcome team to StudySync discussions (edited)!';
    
    // Beta tries to edit Alpha's message -> 403
    const unauthorizedEdit = await request(`/projects/${projectId}/messages/${msg1._id}`, {
      method: 'PATCH',
      headers: betaHeaders,
      body: { content: 'Hacked by Beta' },
    });
    assert.strictEqual(unauthorizedEdit.status, 403, 'Non-author cannot edit message');
    pass('Non-author prevented from editing another user’s message (HTTP 403)');

    // Alpha edits their own message -> 200
    const authorizedEdit = await request(`/projects/${projectId}/messages/${msg1._id}`, {
      method: 'PATCH',
      headers: alphaHeaders,
      body: { content: updatedContent },
    });
    assert.strictEqual(authorizedEdit.status, 200, 'Author edited message');
    const updatedMsg = authorizedEdit.data.message || authorizedEdit.data;
    assert.strictEqual(updatedMsg.content, updatedContent);
    assert.strictEqual(updatedMsg.isEdited, true);
    assert.ok(updatedMsg.editedAt, 'editedAt timestamp recorded');
    pass('Author successfully edited message with isEdited flag and editedAt timestamp');

    // 9. Message Deletion & Moderation Permissions
    console.log('\n9. Testing Deletion & Moderation Permissions...');
    
    // Beta creates a message to be moderated
    const spamMsgRes = await request(`/projects/${projectId}/messages`, {
      method: 'POST',
      headers: betaHeaders,
      body: { content: 'This message should be removed by admin.' },
    });
    const spamMsg = spamMsgRes.data.message || spamMsgRes.data;
    const spamMsgId = spamMsg._id;

    // Charlie tries to delete spamMsg -> 403
    const charlieDelete = await request(`/projects/${projectId}/messages/${spamMsgId}`, {
      method: 'DELETE',
      headers: charlieHeaders,
    });
    assert.strictEqual(charlieDelete.status, 403, 'Outsider cannot delete');
    pass('Outsider blocked from deleting messages (HTTP 403)');

    // Beta tries to delete Alpha's original message -> 403
    const betaDeleteAlphaMsg = await request(`/projects/${projectId}/messages/${msg1._id}`, {
      method: 'DELETE',
      headers: betaHeaders,
    });
    assert.strictEqual(betaDeleteAlphaMsg.status, 403, 'Regular member cannot delete owner message');
    pass('Regular member blocked from deleting another member’s message (HTTP 403)');

    // Alpha (Owner/Admin) deletes Beta's spam message -> 200 (Moderation)
    const adminDeleteRes = await request(`/projects/${projectId}/messages/${spamMsgId}`, {
      method: 'DELETE',
      headers: alphaHeaders,
    });
    assert.strictEqual(adminDeleteRes.status, 200, 'Owner can delete member message');
    pass('Project Owner successfully moderated/deleted member message');

    // Beta deletes their own reply -> 200
    const authorDeleteRes = await request(`/projects/${projectId}/messages/${replyMsg._id}`, {
      method: 'DELETE',
      headers: betaHeaders,
    });
    assert.strictEqual(authorDeleteRes.status, 200, 'Author can delete own message');
    pass('Author successfully deleted their own message');

    // 10. Cursor Pagination and History Slicing
    console.log('\n10. Testing Incremental Cursor-Based Pagination & Ordering...');
    
    // Seed 12 sequential messages
    const createdMsgIds = [];
    for (let i = 1; i <= 12; i++) {
      const res = await request(`/projects/${projectId}/messages`, {
        method: 'POST',
        headers: alphaHeaders,
        body: { content: `Pagination Test Message #${i.toString().padStart(2, '0')}` },
      });
      const cMsg = res.data.message || res.data;
      createdMsgIds.push(cMsg._id);
    }

    // Fetch initial page with limit=5
    const page1Res = await request(`/projects/${projectId}/messages?limit=5`, {
      method: 'GET',
      headers: alphaHeaders,
    });
    assert.strictEqual(page1Res.status, 200);
    assert.strictEqual(page1Res.data.messages.length, 5);
    assert.strictEqual(page1Res.data.hasMore, true, 'hasMore is true');
    // Chronological order: newest 5, but sorted oldest to newest for chat
    const page1First = page1Res.data.messages[0];
    const page1Last = page1Res.data.messages[4];
    assert.ok(page1First.content.includes('#08'), `First in page 1 is #08 (got: ${page1First.content})`);
    assert.ok(page1Last.content.includes('#12'), `Last in page 1 is #12 (got: ${page1Last.content})`);
    pass('Initial page returns latest slice ordered chronologically with hasMore flag');

    // Fetch earlier page before earliest message of page 1
    const earliestId = page1First._id;
    const page2Res = await request(`/projects/${projectId}/messages?limit=5&before=${earliestId}`, {
      method: 'GET',
      headers: alphaHeaders,
    });
    assert.strictEqual(page2Res.status, 200);
    assert.strictEqual(page2Res.data.messages.length, 5);
    const page2First = page2Res.data.messages[0];
    const page2Last = page2Res.data.messages[4];
    assert.ok(page2First.content.includes('#03'), `First in page 2 is #03 (got: ${page2First.content})`);
    assert.ok(page2Last.content.includes('#07'), `Last in page 2 is #07 (got: ${page2Last.content})`);
    pass('Cursor-based incremental load ("before") successfully retrieved earlier message slice');

    // 11. Search Filtering
    console.log('\n11. Testing Discussion Content Search Filtering...');
    const searchMsgRes = await request(`/projects/${projectId}/messages`, {
      method: 'POST',
      headers: alphaHeaders,
      body: { content: 'UniqueKeyword_StudySyncChatSearch_992' },
    });
    assert.strictEqual(searchMsgRes.status, 201);

    const searchRes = await request(`/projects/${projectId}/messages?search=StudySyncChatSearch_992`, {
      method: 'GET',
      headers: alphaHeaders,
    });
    assert.strictEqual(searchRes.status, 200);
    assert.strictEqual(searchRes.data.messages.length, 1);
    assert.ok(searchRes.data.messages[0].content.includes('UniqueKeyword_StudySyncChatSearch_992'));
    pass('Search query successfully filtered discussion messages by text');

    console.log('\n====================================================');
    console.log(`ALL PHASE 8 TESTS PASSED: ${passedCount} passed, ${failedCount} failed.`);
    console.log('====================================================\n');
  } catch (error) {
    fail('Test suite crashed unexpectedly', error);
    console.error('\n' + error.stack);
    process.exit(1);
  }
}

runPhase8Tests();
