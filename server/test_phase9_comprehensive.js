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

async function runPhase9Tests() {
  console.log('====================================================');
  console.log('STUDYSYNC PHASE 9: COMPREHENSIVE AUTOMATED TEST SUITE');
  console.log('Shared Study Notes & Optimistic Concurrency Testing');
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
        name: `Alpha Notes ${ts}`,
        email: `alpha_notes_${ts}@test.com`,
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
        name: `Beta Notes ${ts}`,
        email: `beta_notes_${ts}@test.com`,
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
        email: `charlie_notes_${ts}@test.com`,
        password: 'Password123!',
      },
    });
    assert.strictEqual(userCharlieRes.status, 201, 'Charlie registered');
    const charlieToken = userCharlieRes.data.token;
    const charlieHeaders = { Authorization: `Bearer ${charlieToken}` };

    pass('Registered Alpha (Owner), Beta (Member), and Charlie (Outsider)');

    // 2. Setup Project & Add Beta as Member
    console.log('\n2. Creating Project and Memberships...');
    const projRes = await request('/projects', {
      method: 'POST',
      headers: alphaHeaders,
      body: {
        name: `Phase 9 Notes Project ${ts}`,
        description: 'Testing shared study notes and revisions',
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
        email: `beta_notes_${ts}@test.com`,
        role: 'Member',
      },
    });
    assert.ok([200, 201].includes(addMemberRes.status), 'Beta added to project');
    pass(`Created Project "${projectId}" and added Beta as project member`);

    // 3. Authorization & Project Membership Security
    console.log('\n3. Enforcing Project Membership & Access Permissions...');
    
    // Charlie tries to list notes -> 403
    const outsiderGetRes = await request(`/projects/${projectId}/notes`, {
      method: 'GET',
      headers: charlieHeaders,
    });
    assert.strictEqual(outsiderGetRes.status, 403, 'Non-member forbidden from reading notes');
    pass('Outsider blocked from listing project notes (HTTP 403)');

    // Charlie tries to create note -> 403
    const outsiderCreateRes = await request(`/projects/${projectId}/notes`, {
      method: 'POST',
      headers: charlieHeaders,
      body: { title: 'Outsider Note', content: 'Secret info' },
    });
    assert.strictEqual(outsiderCreateRes.status, 403, 'Non-member forbidden from creating notes');
    pass('Outsider blocked from creating notes (HTTP 403)');

    // 4. Server-Side Validation and Constraints
    console.log('\n4. Validating Note Constraints & Length Limits...');

    // Blank title
    const emptyTitleRes = await request(`/projects/${projectId}/notes`, {
      method: 'POST',
      headers: alphaHeaders,
      body: { title: '   ', content: 'Some content' },
    });
    assert.strictEqual(emptyTitleRes.status, 400, 'Empty title rejected');
    pass('Blank note title rejected (HTTP 400)');

    // Exceedingly long title (> 200 chars)
    const longTitleRes = await request(`/projects/${projectId}/notes`, {
      method: 'POST',
      headers: alphaHeaders,
      body: { title: 'T'.repeat(201), content: 'Some content' },
    });
    assert.strictEqual(longTitleRes.status, 400, 'Title > 200 chars rejected');
    pass('Overlong note title (>200 chars) rejected (HTTP 400)');

    // Exceedingly long content (> 50,000 chars)
    const longContentRes = await request(`/projects/${projectId}/notes`, {
      method: 'POST',
      headers: alphaHeaders,
      body: { title: 'Valid Title', content: 'C'.repeat(50001) },
    });
    assert.strictEqual(longContentRes.status, 400, 'Content > 50,000 chars rejected');
    pass('Overlong note content (>50,000 chars) rejected (HTTP 400)');

    // 5. Creating Valid Note and Initial Revision
    console.log('\n5. Creating Persistent Note with Versioning & Metadata...');
    const createRes = await request(`/projects/${projectId}/notes`, {
      method: 'POST',
      headers: alphaHeaders,
      body: {
        title: 'Quantum Computing Lecture Notes',
        content: '# Introduction to Qubits\n\nQuantum superposition allows qubits to represent 0 and 1 simultaneously.',
        category: 'Lecture',
        tags: ['quantum', 'physics', 'computing'],
        color: 'purple',
        isPinned: true,
      },
    });
    assert.strictEqual(createRes.status, 201, 'Note created');
    const note1 = createRes.data;
    assert.ok(note1._id, 'Note has valid _id');
    assert.strictEqual(note1.title, 'Quantum Computing Lecture Notes');
    assert.strictEqual(note1.category, 'Lecture');
    assert.strictEqual(note1.version, 1, 'Initial version is 1');
    assert.strictEqual(note1.isPinned, true, 'isPinned is true');
    assert.strictEqual(note1.creator?.name, `Alpha Notes ${ts}`);
    assert.strictEqual(note1.lastEditor?.name, `Alpha Notes ${ts}`);
    assert.ok(Array.isArray(note1.revisions), 'Revisions array exists');
    assert.strictEqual(note1.revisions.length, 1, 'Initial revision recorded');
    assert.strictEqual(note1.revisions[0].version, 1);
    pass('Note created with v1 initial revision and populated creator profile');

    // 6. Reload Persistence and Single Note Fetching
    console.log('\n6. Testing Reload Persistence & Single Note Fetching...');
    const getSingleRes = await request(`/projects/${projectId}/notes/${note1._id}`, {
      method: 'GET',
      headers: betaHeaders,
    });
    assert.strictEqual(getSingleRes.status, 200, 'Beta fetched note');
    assert.strictEqual(getSingleRes.data._id, note1._id);
    assert.strictEqual(getSingleRes.data.content, note1.content);
    assert.strictEqual(getSingleRes.data.revisions.length, 1);
    pass('Persisted note retrieved with full content and revision metadata');

    // 7. Optimistic Concurrency & Edit Conflict Prevention
    console.log('\n7. Testing Optimistic Concurrency & Conflict Protection...');

    // Beta updates note first (from v1 -> v2)
    const betaEditRes = await request(`/projects/${projectId}/notes/${note1._id}`, {
      method: 'PUT',
      headers: betaHeaders,
      body: {
        title: 'Quantum Computing Lecture Notes (Beta Updated)',
        content: '# Intro to Qubits\n\nBeta added explanation of Bell states and entanglement.',
        expectedVersion: 1,
        changeSummary: 'Added Bell states section',
      },
    });
    assert.strictEqual(betaEditRes.status, 200, 'Beta update succeeded');
    const noteV2 = betaEditRes.data;
    assert.strictEqual(noteV2.version, 2, 'Version incremented to 2');
    assert.strictEqual(noteV2.lastEditor?.name, `Beta Notes ${ts}`);
    assert.strictEqual(noteV2.revisions.length, 2, 'Snapshot of v1 saved into revisions');
    pass('Member Beta successfully updated note to v2 with revision snapshot');

    // Alpha attempts to save using outdated expectedVersion: 1 -> MUST BE REJECTED WITH 409 CONFLICT!
    const alphaStaleEditRes = await request(`/projects/${projectId}/notes/${note1._id}`, {
      method: 'PUT',
      headers: alphaHeaders,
      body: {
        title: 'Quantum Computing Lecture Notes (Alpha Overwrite Attempt)',
        content: '# Overwrite content',
        expectedVersion: 1, // Stale version!
      },
    });
    assert.strictEqual(alphaStaleEditRes.status, 409, 'Conflict detected on stale version');
    assert.strictEqual(alphaStaleEditRes.data.code, 'CONCURRENCY_CONFLICT');
    assert.strictEqual(alphaStaleEditRes.data.currentVersion, 2);
    assert.strictEqual(alphaStaleEditRes.data.expectedVersion, 1);
    pass('Stale edit rejected with HTTP 409 CONCURRENCY_CONFLICT to prevent silent data loss');

    // Alpha resolves conflict by updating against current expectedVersion: 2
    const alphaResolvedEditRes = await request(`/projects/${projectId}/notes/${note1._id}`, {
      method: 'PUT',
      headers: alphaHeaders,
      body: {
        title: 'Quantum Computing Lecture Notes (Merged)',
        content: '# Comprehensive Notes\n\nMerged Bell states and Grover algorithm.',
        expectedVersion: 2,
        changeSummary: 'Merged Grover algorithm',
      },
    });
    assert.strictEqual(alphaResolvedEditRes.status, 200, 'Resolved update accepted');
    const noteV3 = alphaResolvedEditRes.data;
    assert.strictEqual(noteV3.version, 3, 'Version incremented to 3');
    assert.strictEqual(noteV3.revisions.length, 3, 'Revisions grew to 3');
    pass('Conflict resolved and updated to v3 with complete revision trail');

    // 8. Revision History & Restore Capability
    console.log('\n8. Testing Revision History & Restore Capability...');
    
    // Restore back to revision 1 (original Alpha state)
    const restoreRes = await request(`/projects/${projectId}/notes/${note1._id}/restore/1`, {
      method: 'POST',
      headers: alphaHeaders,
    });
    assert.strictEqual(restoreRes.status, 200, 'Revision 1 restored');
    const restoredNote = restoreRes.data.note;
    assert.strictEqual(restoredNote.title, 'Quantum Computing Lecture Notes', 'Title restored to v1');
    assert.ok(restoredNote.content.includes('superposition allows qubits'), 'Content restored to v1');
    assert.strictEqual(restoredNote.version, 4, 'Version incremented to 4 upon restore');
    pass('Successfully restored note back to v1 revision content, incrementing version to v4');

    // 9. Search, Category Filtering, and Sorting
    console.log('\n9. Testing Search, Category Filtering, and Sorting...');

    // Create 2 additional notes with different categories and tags
    await request(`/projects/${projectId}/notes`, {
      method: 'POST',
      headers: alphaHeaders,
      body: {
        title: 'Algorithms Research Summary',
        content: 'Analysis of Dijkstra and A* graph search algorithms.',
        category: 'Research',
        tags: ['algorithms', 'graphs'],
      },
    });

    await request(`/projects/${projectId}/notes`, {
      method: 'POST',
      headers: alphaHeaders,
      body: {
        title: 'Weekly Standup Brainstorm',
        content: 'Brainstorming frontend optimizations and Vite cache strategies.',
        category: 'Brainstorm',
        tags: ['frontend', 'vite'],
      },
    });

    // Filter by category: 'Research'
    const catRes = await request(`/projects/${projectId}/notes?category=Research`, {
      method: 'GET',
      headers: alphaHeaders,
    });
    assert.strictEqual(catRes.status, 200);
    assert.strictEqual(catRes.data.notes.length, 1);
    assert.strictEqual(catRes.data.notes[0].title, 'Algorithms Research Summary');
    pass('Category filtering correctly filtered notes');

    // Search query matching content keyword "Dijkstra"
    const searchRes = await request(`/projects/${projectId}/notes?search=Dijkstra`, {
      method: 'GET',
      headers: alphaHeaders,
    });
    assert.strictEqual(searchRes.status, 200);
    assert.strictEqual(searchRes.data.notes.length, 1);
    assert.strictEqual(searchRes.data.notes[0].title, 'Algorithms Research Summary');
    pass('Search query correctly matched text within note content');

    // 10. Deletion & Moderation Permissions
    console.log('\n10. Testing Deletion & Moderation Permissions...');

    // Beta creates a temporary note
    const betaNoteRes = await request(`/projects/${projectId}/notes`, {
      method: 'POST',
      headers: betaHeaders,
      body: {
        title: 'Beta Scratchpad Note',
        content: 'To be deleted',
      },
    });
    const betaNoteId = betaNoteRes.data._id;

    // Charlie tries to delete Beta's note -> 403
    const charlieDelete = await request(`/projects/${projectId}/notes/${betaNoteId}`, {
      method: 'DELETE',
      headers: charlieHeaders,
    });
    assert.strictEqual(charlieDelete.status, 403, 'Outsider cannot delete note');
    pass('Outsider blocked from deleting notes (HTTP 403)');

    // Beta tries to delete Alpha's note1 -> 403
    const betaDeleteAlpha = await request(`/projects/${projectId}/notes/${note1._id}`, {
      method: 'DELETE',
      headers: betaHeaders,
    });
    assert.strictEqual(betaDeleteAlpha.status, 403, 'Regular member cannot delete creator note');
    pass('Regular member blocked from deleting another member’s note (HTTP 403)');

    // Alpha (Project Owner) deletes Beta's note -> 200 (Moderation)
    const adminDeleteRes = await request(`/projects/${projectId}/notes/${betaNoteId}`, {
      method: 'DELETE',
      headers: alphaHeaders,
    });
    assert.strictEqual(adminDeleteRes.status, 200, 'Owner can delete note');
    pass('Project Owner successfully moderated/deleted note');

    // Alpha deletes note1 -> 200
    const authorDeleteRes = await request(`/projects/${projectId}/notes/${note1._id}`, {
      method: 'DELETE',
      headers: alphaHeaders,
    });
    assert.strictEqual(authorDeleteRes.status, 200, 'Creator can delete own note');
    pass('Creator successfully deleted note');

    console.log('\n====================================================');
    console.log(`ALL PHASE 9 TESTS PASSED: ${passedCount} passed, ${failedCount} failed.`);
    console.log('====================================================\n');
  } catch (error) {
    fail('Test suite crashed unexpectedly', error);
    console.error('\n' + error.stack);
    process.exit(1);
  }
}

runPhase9Tests();
