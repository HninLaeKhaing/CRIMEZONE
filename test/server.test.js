'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

async function getAvailablePort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test server exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.status === 200) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error('Test server did not start in time.');
}

test('protects admin data and records report review actions', async (t) => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crimezone-admin-test-'));
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root,
    env: {
      ...process.env,
      ADMIN_USERNAME: 'test-admin',
      ADMIN_PASSWORD: 'TestOnlyPassword#2026',
      DATABASE_PATH: path.join(testDir, 'crimezone.sqlite'),
      PORT: String(port),
    },
    stdio: 'ignore',
  });

  t.after(async () => {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  await waitForServer(`${baseUrl}/admin/login`, child);

  const pages = [
    '/',
    '/crime-map.html',
    '/safe-route.html',
    '/emergency-sos.html',
    '/report-incident.html',
    '/login.html',
    '/admin/login',
  ];
  for (const page of pages) {
    const response = await fetch(`${baseUrl}${page}`);
    assert.equal(response.status, 200, `${page} should load`);
    const html = await response.text();
    assert.match(html, /(?:\/|\.\.\/|\.\/)?safety-chatbot\.css/, `${page} should include chatbot styles`);
    assert.match(html, /(?:\/|\.\.\/|\.\/)?safety-chatbot\.js/, `${page} should include chatbot behavior`);
  }
  const chatbotScript = await fetch(`${baseUrl}/safety-chatbot.js`);
  assert.equal(chatbotScript.status, 200);
  assert.match(await chatbotScript.text(), /CrimeZone Safety Guide/);
  const chatbotStyles = await fetch(`${baseUrl}/safety-chatbot.css`);
  assert.equal(chatbotStyles.status, 200);
  const chatbotIcon = await fetch(`${baseUrl}/Neon%20Shielded%20Woman%20App%20Icon.png`);
  assert.equal(chatbotIcon.status, 200);
  assert.match(chatbotIcon.headers.get('content-type'), /image\/png/);
  const appVideo = await fetch(`${baseUrl}/app.mp4`, { headers: { Range: 'bytes=0-15' } });
  assert.equal(appVideo.status, 200);
  assert.match(appVideo.headers.get('content-type'), /video\/mp4/);
  for (const asset of ['hero-section-image.png', 'phone-icon-image.png']) {
    const response = await fetch(`${baseUrl}/${encodeURIComponent(asset)}`);
    assert.equal(response.status, 200, `${asset} should load`);
    assert.match(response.headers.get('content-type'), /image\/png/);
  }

  const protectedPage = await fetch(`${baseUrl}/admin`, { redirect: 'manual' });
  assert.equal(protectedPage.status, 302);
  assert.equal(protectedPage.headers.get('location'), '/admin/login');
  assert.equal((await fetch(`${baseUrl}/admin/dashboard.html`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/admin/overview`)).status, 401);

  const wrongLogin = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { Origin: baseUrl, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test-admin', password: 'wrong-password' }),
  });
  assert.equal(wrongLogin.status, 401);

  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { Origin: baseUrl, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test-admin', password: 'TestOnlyPassword#2026' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
  const adminPage = await fetch(`${baseUrl}/admin`, { headers: { Cookie: cookie } });
  assert.equal(adminPage.status, 200);
  assert.match(await adminPage.text(), /\/safety-chatbot\.js/);

  const reportResponse = await fetch(`${baseUrl}/api/reports`, {
    method: 'POST',
    headers: { Origin: baseUrl, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'Streetlight outage',
      severity: 'Medium',
      date: new Date().toISOString().slice(0, 10),
      time: '18:30',
      location: 'Test location',
      description: 'Temporary automated test report',
      privacy: true,
      photo: null,
    }),
  });
  assert.equal(reportResponse.status, 201);
  const report = await reportResponse.json();
  assert.equal(report.status, 'pending');

  const overviewResponse = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { Cookie: cookie },
  });
  assert.equal(overviewResponse.status, 200);
  const overview = await overviewResponse.json();
  assert.equal(overview.counts.total, 1);
  assert.equal(overview.counts.pending, 1);
  assert.equal(overview.categories[0].category, 'Streetlight outage');
  assert.equal(overview.recentReports[0].privacy, 1);

  const flagResponse = await fetch(`${baseUrl}/api/reports/${report.reference}/flag`, {
    method: 'POST',
    headers: { Origin: baseUrl, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(flagResponse.status, 200);
  const duplicateFlag = await fetch(`${baseUrl}/api/reports/${report.reference}/flag`, {
    method: 'POST',
    headers: { Origin: baseUrl, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(duplicateFlag.status, 409);

  const statusResponse = await fetch(
    `${baseUrl}/api/admin/reports/${overview.recentReports[0].id}/status`,
    {
      method: 'PATCH',
      headers: { Origin: baseUrl, Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'under_review' }),
    },
  );
  assert.equal(statusResponse.status, 200);

  const updated = await (await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { Cookie: cookie },
  })).json();
  assert.equal(updated.counts.pending, 0);
  assert.equal(updated.counts.underReview, 1);
  assert.equal(updated.counts.flagged, 1);
  assert.equal(updated.recentActivity[0].action, 'Review started');

  const logout = await fetch(`${baseUrl}/api/admin/logout`, {
    method: 'POST',
    headers: { Origin: baseUrl, Cookie: cookie, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { Cookie: cookie },
  })).status, 401);
});
