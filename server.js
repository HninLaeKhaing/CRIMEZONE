'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'report-photos');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const CATEGORIES = new Set([
  'Streetlight outage',
  'Harassment',
  'Unsafe area',
  'Traffic issue',
  'Public safety',
  'Other',
]);
const SEVERITIES = new Set(['Low', 'Medium', 'High', 'Critical']);
const STATUSES = new Set(['pending', 'under_review', 'actioned', 'dismissed']);
const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.mp4', 'video/mp4'],
  ['.webp', 'image/webp'],
]);

if (ADMIN_PASSWORD.length < 16) {
  throw new Error('Set ADMIN_PASSWORD to a unique password of at least 16 characters before starting the server.');
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const adminPasswordSalt = crypto.randomBytes(16);
const adminPasswordDigest = crypto.scryptSync(ADMIN_PASSWORD, adminPasswordSalt, 64);
const sessions = new Map();
const loginAttempts = new Map();
const reportAttempts = new Map();
const flagAttempts = new Map();
const database = new DatabaseSync(process.env.DATABASE_PATH || path.join(DATA_DIR, 'crimezone.sqlite'));

database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reference TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    incident_date TEXT NOT NULL,
    incident_time TEXT NOT NULL,
    location TEXT NOT NULL,
    description TEXT NOT NULL,
    privacy INTEGER NOT NULL DEFAULT 1,
    photo_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    flag_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS report_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports(created_at DESC);
  CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status);
  CREATE INDEX IF NOT EXISTS report_activity_created_at_idx ON report_activity(created_at DESC);
`);

function setSecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(value));
}

function sendText(response, status, value) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end(value);
}

function sendFile(response, filePath) {
  const contentType = CONTENT_TYPES.get(path.extname(filePath).toLowerCase());
  if (!contentType) {
    sendText(response, 404, 'Not found');
    return;
  }

  if (path.extname(filePath).toLowerCase() === '.html') {
    let html = fs.readFileSync(filePath, 'utf8');
    if (!html.includes('safety-chatbot.css')) {
      html = html.replace('</head>', '  <link rel="stylesheet" href="/safety-chatbot.css" />\n</head>');
    }
    if (!html.includes('safety-chatbot.js')) {
      html = html.replace('</body>', '  <script src="/safety-chatbot.js" defer></script>\n</body>');
    }
    response.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type': contentType,
    });
    response.end(html);
    return;
  }

  response.writeHead(200, {
    'Cache-Control': 'no-cache',
    'Content-Type': contentType,
  });
  fs.createReadStream(filePath).pipe(response);
}

function readBody(request, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) tooLarge = true;
      else if (!tooLarge) chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        return;
      }
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', reject);
  });
}

async function readJson(request, limit) {
  const body = await readBody(request, limit);
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 });
  }
}

function requireJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('Request body must be a JSON object.'), { status: 400 });
  }
  return value;
}

function safeCompareText(first, second) {
  const firstHash = crypto.createHash('sha256').update(first).digest();
  const secondHash = crypto.createHash('sha256').update(second).digest();
  return crypto.timingSafeEqual(firstHash, secondHash);
}

function getCookie(request, name) {
  const cookieHeader = request.headers.cookie || '';
  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) {
      return item.slice(separator + 1).trim();
    }
  }
  return '';
}

function getSession(request) {
  const token = getCookie(request, 'cz_admin_session');
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { token, session };
}

function requireAdmin(request, response) {
  const authenticated = getSession(request);
  if (!authenticated) {
    sendJson(response, 401, { error: 'Admin authentication required.' });
    return null;
  }
  return authenticated;
}

function requireSameOrigin(request, response) {
  const origin = request.headers.origin;
  let matchesHost = false;
  try {
    matchesHost = Boolean(origin) && new URL(origin).host === request.headers.host;
  } catch {
    matchesHost = false;
  }
  if (!matchesHost) {
    sendJson(response, 403, { error: 'Request origin was not accepted.' });
    return false;
  }
  return true;
}

function recordActivity(reportId, action, actor, timestamp = new Date().toISOString()) {
  database.prepare(
    'INSERT INTO report_activity (report_id, action, actor, created_at) VALUES (?, ?, ?, ?)',
  ).run(reportId, action, actor, timestamp);
}

function parsePhoto(dataUrl) {
  if (!dataUrl) return null;
  if (typeof dataUrl !== 'string') {
    throw Object.assign(new Error('Photo must be an encoded image.'), { status: 400 });
  }

  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) {
    throw Object.assign(new Error('Photo must be a JPEG, PNG, or WebP image.'), { status: 400 });
  }

  const content = Buffer.from(match[2], 'base64');
  if (content.length > MAX_PHOTO_BYTES) {
    throw Object.assign(new Error('Photo must be 2 MB or smaller.'), { status: 413 });
  }

  const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
  return { content, fileName: `${crypto.randomUUID()}.${extension}` };
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function createReport(body) {
  requireJsonObject(body);
  const category = String(body.category || '');
  const severity = String(body.severity || '');
  const incidentDate = String(body.date || '');
  const incidentTime = String(body.time || '');
  const location = String(body.location || '').trim();
  const description = String(body.description || '').trim();
  const privacy = body.privacy === true;

  if (!CATEGORIES.has(category) || !SEVERITIES.has(severity)) {
    throw Object.assign(new Error('Choose a valid incident category and severity.'), { status: 400 });
  }
  if (!validDate(incidentDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(incidentTime)) {
    throw Object.assign(new Error('Enter a valid incident date and time.'), { status: 400 });
  }
  if (!location || location.length > 300 || description.length > 3000) {
    throw Object.assign(new Error('Location is required (up to 300 characters); description is limited to 3,000 characters.'), { status: 400 });
  }

  const photo = parsePhoto(body.photo);
  const id = crypto.randomUUID();
  const reference = `CZ-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const timestamp = new Date().toISOString();
  const photoName = photo ? photo.fileName : null;

  if (photo) fs.writeFileSync(path.join(UPLOAD_DIR, photo.fileName), photo.content, { flag: 'wx' });
  try {
    database.exec('BEGIN');
    database.prepare(`
      INSERT INTO reports (
        id, reference, category, severity, incident_date, incident_time,
        location, description, privacy, photo_name, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(id, reference, category, severity, incidentDate, incidentTime, location, description,
      privacy ? 1 : 0, photoName, timestamp, timestamp);
    recordActivity(id, 'Report submitted for moderation', 'reporter', timestamp);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    if (photo) fs.rmSync(path.join(UPLOAD_DIR, photo.fileName), { force: true });
    throw error;
  }

  return { reference, status: 'pending' };
}

function getOverview() {
  const counts = database.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'under_review' THEN 1 ELSE 0 END) AS underReview,
      SUM(CASE WHEN status = 'actioned' THEN 1 ELSE 0 END) AS actioned,
      SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) AS dismissed,
      SUM(CASE WHEN flag_count > 0 THEN 1 ELSE 0 END) AS flagged
    FROM reports
  `).get();
  const categories = database.prepare(`
    SELECT category, COUNT(*) AS count
    FROM reports
    GROUP BY category
    ORDER BY count DESC, category ASC
  `).all();
  const recentReports = database.prepare(`
    SELECT id, reference, category, severity, incident_date AS date, incident_time AS time,
      location, description, privacy, photo_name AS hasPhoto, status, flag_count AS flags,
      created_at AS createdAt, updated_at AS updatedAt
    FROM reports
    ORDER BY created_at DESC
    LIMIT 12
  `).all();
  const recentActivity = database.prepare(`
    SELECT a.action, a.actor, a.created_at AS createdAt, r.reference, r.category
    FROM report_activity a
    JOIN reports r ON r.id = a.report_id
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT 8
  `).all();

  return {
    counts: Object.fromEntries(
      Object.entries(counts).map(([key, value]) => [key, Number(value || 0)]),
    ),
    categories,
    recentReports,
    recentActivity,
    sources: [
      { name: 'Community submissions', status: 'connected', detail: 'Local SQLite report store' },
      { name: 'Official crime data', status: 'not_configured', detail: 'No server-side admin data feed configured' },
      { name: 'Map tiles', status: 'external', detail: 'OpenStreetMap tiles' },
    ],
  };
}

function servePublicFile(request, response, pathname) {
  if (pathname.startsWith('/admin')) {
    sendText(response, 404, 'Not found');
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendText(response, 400, 'Invalid path');
    return;
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.slice(1);
  const filePath = path.resolve(ROOT, relativePath);
  if (!filePath.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(response, 404, 'Not found');
    return;
  }
  if (['server.js', 'package.json', 'package-lock.json'].includes(path.basename(filePath))
      || filePath.startsWith(`${DATA_DIR}${path.sep}`)) {
    sendText(response, 404, 'Not found');
    return;
  }
  sendFile(response, filePath);
}

async function handleApi(request, response, url) {
  const { pathname } = url;

  if (request.method === 'POST' && pathname === '/api/reports') {
    if (!requireSameOrigin(request, response)) return;
    const clientIp = request.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const attempt = reportAttempts.get(clientIp) || { count: 0, resetAt: now + 60 * 60 * 1000 };
    if (attempt.resetAt <= now) {
      attempt.count = 0;
      attempt.resetAt = now + 60 * 60 * 1000;
    }
    if (attempt.count >= 20) {
      sendJson(response, 429, { error: 'Too many reports were submitted from this connection. Try again later.' });
      return;
    }
    attempt.count += 1;
    reportAttempts.set(clientIp, attempt);
    const body = await readJson(request);
    const report = createReport(body);
    sendJson(response, 201, report);
    return;
  }

  const flagMatch = /^\/api\/reports\/([A-Z0-9-]+)\/flag$/.exec(pathname);
  if (request.method === 'POST' && flagMatch) {
    if (!requireSameOrigin(request, response)) return;
    const clientIp = request.socket.remoteAddress || 'unknown';
    const flagKey = `${clientIp}:${flagMatch[1]}`;
    if ((flagAttempts.get(flagKey) || 0) > Date.now()) {
      sendJson(response, 409, { error: 'This report has already been flagged from this connection.' });
      return;
    }
    flagAttempts.delete(flagKey);
    const report = database.prepare('SELECT id FROM reports WHERE reference = ?').get(flagMatch[1]);
    if (!report) {
      sendJson(response, 404, { error: 'Report reference was not found.' });
      return;
    }
    const timestamp = new Date().toISOString();
    database.exec('BEGIN');
    try {
      database.prepare('UPDATE reports SET flag_count = flag_count + 1, updated_at = ? WHERE id = ?')
        .run(timestamp, report.id);
      recordActivity(report.id, 'Report flagged for review', 'reporter', timestamp);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    flagAttempts.set(flagKey, Date.now() + 24 * 60 * 60 * 1000);
    sendJson(response, 200, { flagged: true });
    return;
  }

  const statusMatch = /^\/api\/reports\/([A-Z0-9-]+)$/.exec(pathname);
  if (request.method === 'GET' && statusMatch) {
    const report = database.prepare(
      'SELECT reference, status, created_at AS createdAt FROM reports WHERE reference = ?',
    ).get(statusMatch[1]);
    if (!report) {
      sendJson(response, 404, { error: 'Report reference was not found.' });
      return;
    }
    sendJson(response, 200, report);
    return;
  }

  if (request.method === 'POST' && pathname === '/api/admin/login') {
    if (!requireSameOrigin(request, response)) return;
    const clientIp = request.socket.remoteAddress || 'unknown';
    const attempt = loginAttempts.get(clientIp) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
    if (attempt.resetAt <= Date.now()) {
      attempt.count = 0;
      attempt.resetAt = Date.now() + 15 * 60 * 1000;
    }
    if (attempt.count >= 5) {
      sendJson(response, 429, { error: 'Too many sign-in attempts. Try again in 15 minutes.' });
      return;
    }

    const body = requireJsonObject(await readJson(request, 8 * 1024));
    const username = String(body.username || '');
    const password = String(body.password || '');
    const candidateDigest = crypto.scryptSync(password, adminPasswordSalt, 64);
    const isValid = safeCompareText(username, ADMIN_USERNAME)
      && crypto.timingSafeEqual(candidateDigest, adminPasswordDigest);
    if (!isValid) {
      attempt.count += 1;
      loginAttempts.set(clientIp, attempt);
      sendJson(response, 401, { error: 'Invalid administrator username or password.' });
      return;
    }

    loginAttempts.delete(clientIp);
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SESSION_TTL_MS;
    sessions.set(token, { username: ADMIN_USERNAME, expiresAt });
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    response.setHeader('Set-Cookie',
      `cz_admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`);
    sendJson(response, 200, { authenticated: true });
    return;
  }

  if (request.method === 'GET' && pathname === '/api/admin/session') {
    const authenticated = requireAdmin(request, response);
    if (!authenticated) return;
    sendJson(response, 200, { username: authenticated.session.username });
    return;
  }

  if (request.method === 'POST' && pathname === '/api/admin/logout') {
    if (!requireSameOrigin(request, response)) return;
    const authenticated = getSession(request);
    if (authenticated) sessions.delete(authenticated.token);
    response.setHeader('Set-Cookie',
      'cz_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    sendJson(response, 200, { loggedOut: true });
    return;
  }

  if (pathname === '/api/admin/overview' && request.method === 'GET') {
    const authenticated = requireAdmin(request, response);
    if (!authenticated) return;
    sendJson(response, 200, { username: authenticated.session.username, ...getOverview() });
    return;
  }

  const adminStatusMatch = /^\/api\/admin\/reports\/([0-9a-f-]+)\/status$/.exec(pathname);
  if (adminStatusMatch && request.method === 'PATCH') {
    const authenticated = requireAdmin(request, response);
    if (!authenticated) return;
    if (!requireSameOrigin(request, response)) return;
    const body = requireJsonObject(await readJson(request, 8 * 1024));
    if (!STATUSES.has(body.status)) {
      sendJson(response, 400, { error: 'Choose a valid moderation status.' });
      return;
    }
    const report = database.prepare('SELECT id, reference FROM reports WHERE id = ?').get(adminStatusMatch[1]);
    if (!report) {
      sendJson(response, 404, { error: 'Report was not found.' });
      return;
    }
    const timestamp = new Date().toISOString();
    const labels = {
      pending: 'Returned to pending review',
      under_review: 'Review started',
      actioned: 'Action recorded',
      dismissed: 'Report dismissed',
    };
    database.exec('BEGIN');
    try {
      database.prepare('UPDATE reports SET status = ?, updated_at = ? WHERE id = ?')
        .run(body.status, timestamp, report.id);
      recordActivity(report.id, labels[body.status], authenticated.session.username, timestamp);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    sendJson(response, 200, { reference: report.reference, status: body.status });
    return;
  }

  const photoMatch = /^\/api\/admin\/reports\/([0-9a-f-]+)\/photo$/.exec(pathname);
  if (photoMatch && request.method === 'GET') {
    const authenticated = requireAdmin(request, response);
    if (!authenticated) return;
    const report = database.prepare('SELECT photo_name FROM reports WHERE id = ?').get(photoMatch[1]);
    if (!report || !report.photo_name) {
      sendText(response, 404, 'Photo not found');
      return;
    }
    const filePath = path.join(UPLOAD_DIR, path.basename(report.photo_name));
    if (!fs.existsSync(filePath)) {
      sendText(response, 404, 'Photo not found');
      return;
    }
    sendFile(response, filePath);
    return;
  }

  sendJson(response, 404, { error: 'API route not found.' });
}

async function handleRequest(request, response) {
  setSecurityHeaders(response);
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

    if (url.pathname === '/admin') {
      const authenticated = getSession(request);
      if (!authenticated) {
        response.writeHead(302, { 'Cache-Control': 'no-store', Location: '/admin/login' });
        response.end();
        return;
      }
      sendFile(response, path.join(ROOT, 'admin', 'dashboard.html'));
      return;
    }
    if (url.pathname === '/admin/login') {
      sendFile(response, path.join(ROOT, 'admin', 'login.html'));
      return;
    }
    if (url.pathname.startsWith('/admin/assets/')) {
      const asset = path.basename(url.pathname);
      if (!['admin.css', 'admin.js', 'login.js'].includes(asset)) {
        sendText(response, 404, 'Not found');
        return;
      }
      sendFile(response, path.join(ROOT, 'admin', asset));
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendText(response, 405, 'Method not allowed');
      return;
    }
    servePublicFile(request, response, url.pathname);
  } catch (error) {
    if (response.headersSent || response.destroyed) return;
    const status = Number(error.status) || 500;
    if (status >= 500) console.error('Request failed:', error);
    sendJson(response, status, { error: status >= 500 ? 'A server error occurred.' : error.message });
  }
}

const server = http.createServer((request, response) => {
  handleRequest(request, response);
});

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
  for (const [ip, attempt] of loginAttempts) {
    if (attempt.resetAt <= now) loginAttempts.delete(ip);
  }
  for (const [ip, attempt] of reportAttempts) {
    if (attempt.resetAt <= now) reportAttempts.delete(ip);
  }
  for (const [key, expiresAt] of flagAttempts) {
    if (expiresAt <= now) flagAttempts.delete(key);
  }
}, 60_000).unref();

server.listen(PORT, HOST, () => {
  console.log(`CrimeZone server listening at http://localhost:${PORT}`);
  console.log(`Admin portal: http://localhost:${PORT}/admin`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      database.close();
      process.exit(0);
    });
  });
}
