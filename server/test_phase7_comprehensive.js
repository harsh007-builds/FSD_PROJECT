const assert = require('assert');

const BASE_URL = 'http://localhost:5000/api';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { ...options.headers };
  
  // Only set application/json if body is not FormData/Buffer
  if (options.body && !(options.body instanceof Buffer) && !headers['Content-Type']?.includes('multipart/form-data')) {
    headers['Content-Type'] = 'application/json';
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
    data = await response.arrayBuffer();
  }

  return {
    status: response.status,
    headers: response.headers,
    data,
  };
}

// Multipart form-data builder for Node.js fetch testing
function buildMultipart(fields, fileField) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const crlf = '\r\n';
  const chunks = [];

  for (const [key, val] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="${key}"${crlf}${crlf}` +
      `${val}${crlf}`
    ));
  }

  if (fileField) {
    chunks.push(Buffer.from(
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"${crlf}` +
      `Content-Type: ${fileField.contentType}${crlf}${crlf}`
    ));
    chunks.push(fileField.buffer);
    chunks.push(Buffer.from(crlf));
  }

  chunks.push(Buffer.from(`--${boundary}--${crlf}`));
  const body = Buffer.concat(chunks);
  const contentType = `multipart/form-data; boundary=${boundary}`;

  return { body, contentType };
}

async function runTests() {
  console.log('=== STARTING STUDYSYNC PHASE 7 COMPREHENSIVE TESTS ===\n');
  const timestamp = Date.now();

  try {
    // 1. REGISTER USERS
    console.log('1. Registering Test Users (Alpha, Beta, Outsider Charlie)...');
    const userA_res = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'User Alpha',
        email: `alpha_${timestamp}@example.com`,
        password: 'Password123!',
      }),
    });
    assert.strictEqual(userA_res.status, 201, 'User Alpha registration failed');
    const tokenA = userA_res.data.token;
    const userA_Id = userA_res.data._id;

    const userB_res = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'User Beta',
        email: `beta_${timestamp}@example.com`,
        password: 'Password123!',
      }),
    });
    assert.strictEqual(userB_res.status, 201, 'User Beta registration failed');
    const tokenB = userB_res.data.token;
    const userB_Id = userB_res.data._id;

    const userC_res = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Charlie Outsider',
        email: `charlie_${timestamp}@example.com`,
        password: 'Password123!',
      }),
    });
    assert.strictEqual(userC_res.status, 201, 'Charlie registration failed');
    const tokenC = userC_res.data.token;
    console.log('✔ Users registered successfully.\n');

    // 2. CREATE PROJECT AND ADD MEMBER
    console.log('2. Setting up Project and Team Membership...');
    const proj_res = await request('/projects', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        name: `Phase 7 Project ${timestamp}`,
        description: 'Testing Resources and Cloud File Storage',
      }),
    });
    assert.strictEqual(proj_res.status, 201, 'Project creation failed');
    const projectId = proj_res.data.id || proj_res.data._id;

    // Add User Beta as member
    const addMember_res = await request(`/projects/${projectId}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ email: `beta_${timestamp}@example.com` }),
    });
    assert.strictEqual(addMember_res.status, 200, 'Adding member failed');
    console.log(`✔ Project created (${projectId}) and User Beta joined.\n`);

    // 3. UPLOAD FILE RESOURCES (DOC, IMAGE, CODE)
    console.log('3. Uploading Supported Files through Storage Provider...');
    
    // File 1: Text / Markdown Document
    const docBuffer = Buffer.from('# StudySync Syllabus\nComprehensive learning roadmap for semester.');
    const docUpload = buildMultipart(
      { title: 'Semester Syllabus', description: 'Complete course outline', category: 'Document', tags: 'syllabus, roadmap' },
      { name: 'file', filename: 'syllabus.md', contentType: 'text/markdown', buffer: docBuffer }
    );
    const doc_res = await request(`/projects/${projectId}/resources`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': docUpload.contentType,
      },
      body: docUpload.body,
    });
    assert.strictEqual(doc_res.status, 201, `Doc upload failed: ${JSON.stringify(doc_res.data)}`);
    assert.strictEqual(doc_res.data.title, 'Semester Syllabus');
    assert.strictEqual(doc_res.data.category, 'Document');
    assert.strictEqual(doc_res.data.file.originalName, 'syllabus.md');
    assert.strictEqual(doc_res.data.file.storageProvider, 'gridfs');
    assert.strictEqual(doc_res.data.file.size, docBuffer.length);
    const docResourceId = doc_res.data._id;
    console.log(`✔ Uploaded Document: "${doc_res.data.title}" (ID: ${docResourceId})`);

    // File 2: Binary Image (PNG)
    // Minimal 1x1 PNG buffer
    const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const imgUpload = buildMultipart(
      { title: 'Architecture Diagram', description: 'System design diagram', tags: 'diagram, design' },
      { name: 'file', filename: 'architecture.png', contentType: 'image/png', buffer: pngBuffer }
    );
    const img_res = await request(`/projects/${projectId}/resources`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'Content-Type': imgUpload.contentType,
      },
      body: imgUpload.body,
    });
    assert.strictEqual(img_res.status, 201, `Image upload failed: ${JSON.stringify(img_res.data)}`);
    assert.strictEqual(img_res.data.category, 'Image');
    assert.strictEqual(img_res.data.file.mimeType, 'image/png');
    assert.strictEqual(img_res.data.uploader._id, userB_Id);
    const imgResourceId = img_res.data._id;
    console.log(`✔ Uploaded Image by User Beta: "${img_res.data.title}" (ID: ${imgResourceId})`);

    // 4. CREATE LINK RESOURCE
    console.log('\n4. Creating Categorized Resource Link...');
    const link_res = await request(`/projects/${projectId}/resources`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        title: 'MDN Web Docs Reference',
        url: 'https://developer.mozilla.org/en-US/',
        description: 'Official web documentation & guides',
        category: 'Link',
        type: 'link',
        tags: ['documentation', 'javascript', 'reference'],
      }),
    });
    assert.strictEqual(link_res.status, 201, `Link creation failed: ${JSON.stringify(link_res.data)}`);
    assert.strictEqual(link_res.data.type, 'link');
    assert.strictEqual(link_res.data.url, 'https://developer.mozilla.org/en-US/');
    const linkResourceId = link_res.data._id;
    console.log(`✔ Created Link Resource: "${link_res.data.title}" (ID: ${linkResourceId})\n`);

    // 5. SEARCH & FILTER RESOURCES
    console.log('5. Testing Resource Search, Category Filtering, and Pagination...');
    
    // Category filter: Image
    const cat_res = await request(`/projects/${projectId}/resources?category=Image`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.strictEqual(cat_res.status, 200);
    assert.strictEqual(cat_res.data.resources.length, 1);
    assert.strictEqual(cat_res.data.resources[0].title, 'Architecture Diagram');
    console.log('✔ Filter by category=Image verified.');

    // Keyword search: "Syllabus"
    const search_res = await request(`/projects/${projectId}/resources?search=Syllabus`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.strictEqual(search_res.status, 200);
    assert.strictEqual(search_res.data.resources.length, 1);
    assert.strictEqual(search_res.data.resources[0]._id, docResourceId);
    console.log('✔ Keyword search verified.');

    // Category summary aggregation
    const all_res = await request(`/projects/${projectId}/resources`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.strictEqual(all_res.data.total, 3);
    assert.strictEqual(all_res.data.categories.Document, 1);
    assert.strictEqual(all_res.data.categories.Image, 1);
    assert.strictEqual(all_res.data.categories.Link, 1);
    console.log('✔ Aggregated category counts verified: total=3 (Doc: 1, Img: 1, Link: 1).\n');

    // 6. AUTHORIZED FILE DOWNLOAD
    console.log('6. Testing Authorized File Downloads...');
    const dl_res = await request(`/projects/${projectId}/resources/${imgResourceId}/download`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.strictEqual(dl_res.status, 200);
    assert.strictEqual(dl_res.headers.get('content-type'), 'image/png');
    assert(dl_res.headers.get('content-disposition').includes('attachment'));
    const downloadedPng = Buffer.from(dl_res.data);
    assert.deepStrictEqual(downloadedPng, pngBuffer, 'Downloaded binary does not match original buffer');
    console.log('✔ Binary integrity verified for downloaded image.');

    const dl_doc_res = await request(`/projects/${projectId}/resources/${docResourceId}/download`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.strictEqual(dl_doc_res.status, 200);
    const downloadedDoc = Buffer.from(dl_doc_res.data).toString('utf-8');
    assert.strictEqual(downloadedDoc, docBuffer.toString('utf-8'));
    console.log('✔ User Beta downloaded syllabus.md with 100% content match.\n');

    // 7. AUTHORIZED FILE PREVIEW & RANGE REQUESTS
    console.log('7. Testing Inline Previews and HTTP Range Requests...');
    const prev_res = await request(`/projects/${projectId}/resources/${docResourceId}/preview`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.strictEqual(prev_res.status, 200);
    assert(prev_res.headers.get('content-disposition').includes('inline'));

    // Range request (bytes=0-15)
    const range_res = await request(`/projects/${projectId}/resources/${docResourceId}/preview`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        Range: 'bytes=0-15',
      },
    });
    assert.strictEqual(range_res.status, 206, 'Range request should return 206 Partial Content');
    assert(range_res.headers.get('content-range').startsWith('bytes 0-15/'));
    const chunk = Buffer.from(range_res.data).toString('utf-8');
    assert.strictEqual(chunk, '# StudySync Syll');
    console.log(`✔ Range request 206 Partial Content verified: "${chunk}".\n`);

    // 8. UPDATE / RENAME / CATEGORIZE
    console.log('8. Testing Resource Metadata Updates...');
    const update_res = await request(`/projects/${projectId}/resources/${docResourceId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        title: 'Master Study Roadmap 2026',
        description: 'Updated comprehensive roadmap',
        category: 'Document',
        tags: 'roadmap, 2026, certified',
      }),
    });
    assert.strictEqual(update_res.status, 200);
    assert.strictEqual(update_res.data.title, 'Master Study Roadmap 2026');
    assert(update_res.data.tags.includes('certified'));
    console.log('✔ Resource renamed and tags updated.\n');

    // 9. FILE TYPE & SIZE VALIDATION (SECURITY)
    console.log('9. Testing Security Constraints & File Validation...');

    // Attempt to upload dangerous executable (.exe)
    const exeBuffer = Buffer.from('MZ...executable binary payload');
    const exeUpload = buildMultipart(
      { title: 'Dangerous Executable' },
      { name: 'file', filename: 'malware.exe', contentType: 'application/x-msdownload', buffer: exeBuffer }
    );
    const exe_res = await request(`/projects/${projectId}/resources`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': exeUpload.contentType,
      },
      body: exeUpload.body,
    });
    assert.strictEqual(exe_res.status, 400, 'Executable upload must be rejected with 400');
    assert(exe_res.data.message.includes('blocked for security reasons'));
    console.log('✔ Dangerous executable upload blocked with 400 Bad Request.');

    // Attempt to upload shell script (.sh)
    const shBuffer = Buffer.from('#!/bin/bash\nrm -rf /');
    const shUpload = buildMultipart(
      { title: 'Dangerous Shell Script' },
      { name: 'file', filename: 'exploit.sh', contentType: 'application/x-sh', buffer: shBuffer }
    );
    const sh_res = await request(`/projects/${projectId}/resources`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': shUpload.contentType,
      },
      body: shUpload.body,
    });
    assert.strictEqual(sh_res.status, 400, 'Shell script upload must be rejected with 400');
    console.log('✔ Dangerous script upload blocked with 400 Bad Request.');

    // Attempt to upload invalid link without http(s)
    const badLink_res = await request(`/projects/${projectId}/resources`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        type: 'link',
        title: 'Bad Link',
        url: 'javascript:alert(1)',
      }),
    });
    assert.strictEqual(badLink_res.status, 400, 'Non-http URL must be rejected');
    console.log('✔ Unsafe protocol link rejected with 400 Bad Request.\n');

    // 10. ACCESS AUTHORIZATION ISOLATION (OUTSIDER CHARLIE)
    console.log('10. Testing Access Control & Permission Enforcement...');
    
    // Charlie tries to list project resources
    const charlieList = await request(`/projects/${projectId}/resources`, {
      headers: { Authorization: `Bearer ${tokenC}` },
    });
    assert.strictEqual(charlieList.status, 403, 'Unauthorized user must receive 403');
    console.log('✔ Outsider blocked from listing resources (403 Forbidden).');

    // Charlie tries to download file
    const charlieDownload = await request(`/projects/${projectId}/resources/${docResourceId}/download`, {
      headers: { Authorization: `Bearer ${tokenC}` },
    });
    assert.strictEqual(charlieDownload.status, 403, 'Unauthorized download must return 403');
    console.log('✔ Outsider blocked from downloading file (403 Forbidden).');

    // Charlie tries to delete file
    const charlieDelete = await request(`/projects/${projectId}/resources/${docResourceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenC}` },
    });
    assert.strictEqual(charlieDelete.status, 403, 'Unauthorized delete must return 403');
    console.log('✔ Outsider blocked from deleting resource (403 Forbidden).');

    // Member Beta tries to delete Alpha's uploaded resource
    const betaDeleteAlpha = await request(`/projects/${projectId}/resources/${docResourceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.strictEqual(betaDeleteAlpha.status, 403, 'Non-admin member cannot delete other user resource');
    console.log('✔ Member prevented from deleting another member resource (403 Forbidden).\n');

    // 11. ACTIVITY TIMELINE AUDIT
    console.log('11. Verifying Activity Timeline Recording...');
    const act_res = await request(`/activities?projectId=${projectId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.strictEqual(act_res.status, 200);
    const activities = Array.isArray(act_res.data) ? act_res.data : act_res.data.activities;
    const types = activities.map(a => a.type);
    assert(types.includes('resource_uploaded'), 'resource_uploaded activity missing');
    assert(types.includes('resource_created'), 'resource_created activity missing');
    assert(types.includes('resource_updated'), 'resource_updated activity missing');
    console.log(`✔ Activity timeline contains: ${types.filter(t => t.startsWith('resource_')).join(', ')}.\n`);

    // 12. RESOURCE DELETION & STORAGE CLEANUP
    console.log('12. Testing Resource Deletion and Storage Cleanup...');
    // User Beta deletes their own image resource
    const del_res = await request(`/projects/${projectId}/resources/${imgResourceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.strictEqual(del_res.status, 200);
    console.log('✔ Resource deleted by uploader.');

    // Confirm deletion in database
    const verifyDel = await request(`/projects/${projectId}/resources/${imgResourceId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.strictEqual(verifyDel.status, 404, 'Deleted resource must return 404');

    // Confirm file stream returns 404
    const verifyStream = await request(`/projects/${projectId}/resources/${imgResourceId}/download`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.strictEqual(verifyStream.status, 404, 'Download of deleted resource must return 404');
    console.log('✔ Verified resource and storage stream removed cleanly.');

    console.log('\n======================================================');
    console.log('🎉 ALL PHASE 7 BACKEND TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ PHASE 7 TEST FAILED:', err);
    process.exit(1);
  }
}

runTests();
