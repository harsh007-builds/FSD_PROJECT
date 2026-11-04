const fetch = globalThis.fetch;

async function testAll() {
  const endpoint = 'http://localhost:5000/api/internal/process-deadline-reminders';

  console.log('--- Test 1: No secret (expected 401) ---');
  let res = await fetch(endpoint, { method: 'POST' });
  console.log('Status:', res.status, await res.json());

  console.log('\n--- Test 2: Wrong secret (expected 401) ---');
  res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'x-cron-secret': 'wrong_secret_xyz' }
  });
  console.log('Status:', res.status, await res.json());

  console.log('\n--- Test 3: Valid x-cron-secret (expected 200) ---');
  res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'x-cron-secret': 'studysync_cron_secret_key_2026' }
  });
  console.log('Status:', res.status, await res.json());

  console.log('\n--- Test 4: Secret with whitespace and quotes (expected 200) ---');
  res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'x-cron-secret': '  "studysync_cron_secret_key_2026"  ' }
  });
  console.log('Status:', res.status, await res.json());

  console.log('\n--- Test 5: Authorization Bearer (expected 200) ---');
  res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer studysync_cron_secret_key_2026' }
  });
  console.log('Status:', res.status, await res.json());

  console.log('\n--- Test 6: Query param ?secret=... (expected 200) ---');
  res = await fetch(`${endpoint}?secret=studysync_cron_secret_key_2026`, {
    method: 'POST'
  });
  console.log('Status:', res.status, await res.json());
}

testAll().catch(console.error);
