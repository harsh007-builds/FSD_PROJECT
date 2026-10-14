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

async function runPhase6Tests() {
  console.log('=== STARTING STUDYSYNC PHASE 6 COMPREHENSIVE TESTS ===\n');
  const timestamp = Date.now();

  try {
    // 1. Register two isolated test users
    console.log('1. Registering Test Users...');
    const userAEmail = `search_a_${timestamp}@example.com`;
    const userBEmail = `search_b_${timestamp}@example.com`;
    const userCEmail = `search_outsider_${timestamp}@example.com`;

    const regA = await req('POST', '/auth/register', {
      name: 'Search Tester Alpha',
      email: userAEmail,
      password: 'password123',
    });
    const tokenA = regA.data.token;
    const userAId = regA.data._id;

    const regB = await req('POST', '/auth/register', {
      name: 'Search Tester Beta',
      email: userBEmail,
      password: 'password123',
    });
    const tokenB = regB.data.token;
    const userBId = regB.data._id;

    const regC = await req('POST', '/auth/register', {
      name: 'Outsider Charlie',
      email: userCEmail,
      password: 'password123',
    });
    const tokenC = regC.data.token;

    console.log('✔ Registered Users Alpha, Beta, and Outsider Charlie.\n');

    // 2. Setup Data:
    // Project 1: User Alpha (Owner) & User Beta (Member)
    // Project 2: User Alpha only
    // Project 3: Outsider Charlie only (Private)
    console.log('2. Setting up Projects and Tasks...');
    const proj1 = await req('POST', '/projects', {
      name: `Quantum Physics Research ${timestamp}`,
      description: 'Advanced study on quantum entanglement and photon dynamics',
    }, tokenA);
    const proj1Id = proj1.data._id;

    // Add User Beta as member to Project 1
    const invite = await req('POST', `/projects/${proj1Id}/invitations`, {
      email: userBEmail,
      role: 'Member'
    }, tokenA);
    await req('POST', `/invitations/${invite.data._id}/accept`, {}, tokenB);

    // Project 2 by Alpha
    const proj2 = await req('POST', '/projects', {
      name: `Neural Networks Deep Dive ${timestamp}`,
      description: 'Backpropagation and transformer attention mechanisms',
    }, tokenA);
    const proj2Id = proj2.data._id;

    // Project 3 by Outsider Charlie (Private)
    const proj3 = await req('POST', '/projects', {
      name: `Top Secret Project ${timestamp}`,
      description: 'Confidential research completely hidden from Alpha and Beta',
    }, tokenC);
    const proj3Id = proj3.data._id;

    // Create Tasks in Project 1:
    // Task 1: Assigned to Beta, High priority, In Progress, with URL resource in description
    const task1 = await req('POST', `/projects/${proj1Id}/tasks`, {
      title: 'Analyze Quantum Bell Inequalities',
      description: 'Check experiment data from https://arxiv.org/abs/quantum-bell-test and report findings',
      priority: 'High',
      status: 'In Progress',
      assignee: userBId,
      dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    }, tokenA);

    // Task 2: Assigned to Alpha, Urgent priority, Todo, with Figma link
    const task2 = await req('POST', `/projects/${proj1Id}/tasks`, {
      title: 'Design Quantum Circuit Simulation UI',
      description: 'Wireframes available at https://figma.com/file/quantum-circuit-designs',
      priority: 'Urgent',
      status: 'Todo',
      assignee: userAId,
      dueDate: new Date().toISOString(), // Today
    }, tokenA);

    // Task 3: Assigned to Beta in Project 1, Completed
    const task3 = await req('POST', `/projects/${proj1Id}/tasks`, {
      title: 'Setup Quantum Photodiode Sensors',
      description: 'Hardware calibration and voltage checks',
      priority: 'Medium',
      status: 'Completed',
      assignee: userBId,
    }, tokenA);

    // Task 4 in Project 2 (Alpha's private project)
    const task4 = await req('POST', `/projects/${proj2Id}/tasks`, {
      title: 'Implement Transformer Attention Heads',
      description: 'Multi-head dot-product attention in PyTorch',
      priority: 'High',
      status: 'Todo',
      assignee: userAId,
    }, tokenA);

    // Task 5 in Project 3 (Charlie's project)
    const task5 = await req('POST', `/projects/${proj3Id}/tasks`, {
      title: 'Classified Alien Propulsion Specs',
      description: 'Top secret zero-point energy telemetry data',
      priority: 'Urgent',
      status: 'In Progress',
    }, tokenC);

    console.log('✔ Projects and Tasks successfully created and populated.\n');

    // 3. Test Global Search: Basic Query Matching
    console.log('3. Testing Cross-Project Search for "Quantum"...');
    const searchRes1 = await req('GET', '/search?q=Quantum', null, tokenA);
    if (!searchRes1.ok) throw new Error(`Search failed: ${JSON.stringify(searchRes1.data)}`);

    console.log(`   Found ${searchRes1.data.counts.total} items (Projects: ${searchRes1.data.counts.projects}, Tasks: ${searchRes1.data.counts.tasks}, Resources: ${searchRes1.data.counts.resources})`);
    if (searchRes1.data.counts.projects < 1) throw new Error('Expected to find Quantum project in results');
    if (searchRes1.data.counts.tasks < 2) throw new Error('Expected to find Quantum tasks in results');
    if (searchRes1.data.counts.resources < 1) throw new Error('Expected to find indexed resource from Quantum tasks');
    console.log('✔ Query matching and grouping verified.\n');

    // 4. Test Authorization Isolation: User Beta searching for "Transformer"
    console.log('4. Testing Access Control Isolation...');
    // User Beta is only member of Project 1, NOT Project 2
    const searchResB = await req('GET', '/search?q=Transformer', null, tokenB);
    if (searchResB.data.counts.total !== 0) {
      throw new Error(`Authorization leak! User Beta was able to search/find Project 2 task: ${JSON.stringify(searchResB.data)}`);
    }
    console.log('✔ Access control verified: User Beta cannot see tasks from Project 2.');

    // User Alpha and Beta searching for "Classified"
    const searchResAlien = await req('GET', '/search?q=Classified', null, tokenA);
    if (searchResAlien.data.counts.total !== 0) {
      throw new Error('Authorization leak! Outsider Charlie\'s private task was returned to User Alpha.');
    }
    console.log('✔ Access control verified: Outsider private data is completely inaccessible.');

    // Unauthorized project scope check
    const unauthProjectSearch = await req('GET', `/search?projectId=${proj3Id}`, null, tokenA);
    if (unauthProjectSearch.status !== 403) {
      throw new Error(`Expected 403 Forbidden when searching unauthorized projectId, got ${unauthProjectSearch.status}`);
    }
    console.log('✔ 403 Forbidden verified when attempting to scope search to unauthorized project.\n');

    // 5. Test Filters: Status, Priority, Assignee
    console.log('5. Testing Search Filters (Status, Priority, Assignee)...');
    // Filter by status=Completed
    const filterStatus = await req('GET', '/search?q=Quantum&status=Completed', null, tokenA);
    if (filterStatus.data.counts.tasks !== 1 || filterStatus.data.grouped.tasks[0].title !== 'Setup Quantum Photodiode Sensors') {
      console.log('filterStatus result:', JSON.stringify(filterStatus.data));
      throw new Error('Status filter failed to isolate completed task');
    }
    console.log('✔ Status filter (Completed) verified.');

    // Filter by priority=Urgent
    const filterPriority = await req('GET', '/search?q=Quantum&priority=Urgent', null, tokenA);
    if (filterPriority.data.counts.tasks !== 1 || filterPriority.data.grouped.tasks[0].priority !== 'Urgent') {
      throw new Error('Priority filter failed');
    }
    console.log('✔ Priority filter (Urgent) verified.');

    // Filter by assignee=me for User Beta
    const filterAssigneeMe = await req('GET', '/search?assignee=me', null, tokenB);
    if (filterAssigneeMe.data.counts.tasks !== 2) {
      throw new Error(`Expected User Beta to have 2 assigned tasks, got ${filterAssigneeMe.data.counts.tasks}`);
    }
    console.log('✔ Assignee filter (me) verified.\n');

    // 6. Test Sorting and Pagination
    console.log('6. Testing Sorting and Pagination...');
    const page1 = await req('GET', '/search?type=tasks&limit=2&page=1&sortBy=title&sortOrder=asc', null, tokenA);
    const page2 = await req('GET', '/search?type=tasks&limit=2&page=2&sortBy=title&sortOrder=asc', null, tokenA);
    if (page1.data.results.length !== 2) throw new Error('Page 1 limit failed');
    if (page2.data.results.length < 1) throw new Error('Page 2 items missing');
    if (page1.data.results[0]._id === page2.data.results[0]._id) {
      throw new Error('Pagination returned duplicate records');
    }
    console.log(`✔ Pagination verified: Page 1 (${page1.data.results.length} items), Page 2 (${page2.data.results.length} items), Total Pages: ${page1.data.totalPages}.\n`);

    // 7. Test My Tasks View Endpoint
    console.log('7. Testing Personal "My Tasks" View...');
    const myTasksRes = await req('GET', '/tasks/my-tasks?dateRange=all', null, tokenB);
    if (!myTasksRes.ok) throw new Error(`My Tasks failed: ${JSON.stringify(myTasksRes.data)}`);
    console.log(`   User Beta My Tasks: total=${myTasksRes.data.total}, summary=`, myTasksRes.data.summary);
    if (myTasksRes.data.total !== 2) {
      throw new Error(`Expected 2 tasks in User Beta My Tasks, got ${myTasksRes.data.total}`);
    }
    if (myTasksRes.data.summary.completedCount !== 1 || myTasksRes.data.summary.pendingCount !== 1) {
      throw new Error('My Tasks summary counts mismatch');
    }
    console.log('✔ Personal My Tasks view verified.\n');

    // 8. Test Saved Filter Presets
    console.log('8. Testing Saved Filter Presets...');
    // Create saved filter
    const createFilterRes = await req('POST', '/search/saved-filters', {
      name: 'High Priority Active',
      filters: { status: 'In Progress', priority: 'High', sortBy: 'dueDate', sortOrder: 'asc' }
    }, tokenB);
    if (!createFilterRes.ok || createFilterRes.data.length < 1) {
      throw new Error('Failed to create saved filter');
    }
    const savedFilterId = createFilterRes.data[0]._id;
    console.log(`✔ Created saved filter preset: "${createFilterRes.data[0].name}" (ID: ${savedFilterId})`);

    // Fetch saved filters
    const getFiltersRes = await req('GET', '/search/saved-filters', null, tokenB);
    if (getFiltersRes.data.length !== 1 || getFiltersRes.data[0].name !== 'High Priority Active') {
      throw new Error('Saved filter fetch mismatch');
    }
    console.log('✔ Fetched saved filter presets.');

    // Delete saved filter
    const delFilterRes = await req('DELETE', `/search/saved-filters/${savedFilterId}`, null, tokenB);
    if (delFilterRes.data.length !== 0) {
      throw new Error('Failed to delete saved filter');
    }
    console.log('✔ Deleted saved filter preset.\n');

    console.log('======================================================');
    console.log('🎉 ALL PHASE 6 BACKEND TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('======================================================\n');
  } catch (error) {
    console.error('❌ Phase 6 Test Failed:', error.message);
    process.exit(1);
  }
}

runPhase6Tests();
