const API_URL = 'http://localhost:5000/api';

async function testAPI() {
  try {
    console.log('--- Testing Projects ---');
    // 1. Create Project
    const createProjectRes = await fetch(`${API_URL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Project', progress: 50 })
    });
    console.log('Create Project Status:', createProjectRes.status);
    const project = await createProjectRes.json();
    console.log('Project ID:', project._id);

    // 2. Get Projects
    const getProjectsRes = await fetch(`${API_URL}/projects`);
    console.log('Get Projects Status:', getProjectsRes.status);
    
    // 3. Update Project
    const updateProjectRes = await fetch(`${API_URL}/projects/${project._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Project', progress: 75 })
    });
    console.log('Update Project Status:', updateProjectRes.status);

    console.log('\n--- Testing Tasks ---');
    // 4. Create Task
    const createTaskRes = await fetch(`${API_URL}/projects/${project._id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Task', priority: 'High' })
    });
    console.log('Create Task Status:', createTaskRes.status);
    const task = await createTaskRes.json();
    console.log('Task ID:', task._id);

    // 5. Get Tasks for Project
    const getTasksRes = await fetch(`${API_URL}/projects/${project._id}/tasks`);
    console.log('Get Tasks Status:', getTasksRes.status);

    // 6. Update Task Status
    const updateTaskStatusRes = await fetch(`${API_URL}/tasks/${task._id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' })
    });
    console.log('Update Task Status Status:', updateTaskStatusRes.status);

    console.log('\n--- Cleanup ---');
    // 7. Delete Task
    const deleteTaskRes = await fetch(`${API_URL}/tasks/${task._id}`, {
      method: 'DELETE'
    });
    console.log('Delete Task Status:', deleteTaskRes.status);

    // 8. Delete Project
    const deleteProjectRes = await fetch(`${API_URL}/projects/${project._id}`, {
      method: 'DELETE'
    });
    console.log('Delete Project Status:', deleteProjectRes.status);

    console.log('\nAll tests completed.');
  } catch (err) {
    console.error('Test failed', err);
  }
}

testAPI();
