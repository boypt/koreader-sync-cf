const JSON_RESPONSE = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

const HTML_RESPONSE = (html) => new Response(html, {
  status: 200,
  headers: { 'Content-Type': 'text/html; charset=utf-8' }
});

function getEnvBool(env, key, fallback = false) {
  const v = env[key];
  if (v === undefined) return fallback;
  return String(v).toLowerCase() === 'true';
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

function randomDeviceId() {
  if (crypto && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').toUpperCase();
  }
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function generateSessionToken() {
  if (crypto && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

async function getSessionUser(db, request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session_token=([^;]+)/);
  if (!match) return null;
  const token = match[1];
  const res = await db.prepare(
    `SELECT s.username FROM sessions s
     INNER JOIN users u ON s.username = u.username
     WHERE s.token = ? AND s.created_at > unixepoch() - 86400`
  ).bind(token).all();
  if (res.results && res.results.length) return res.results[0].username;
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  return null;
}

const LOGIN_PAGE_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KOReader Sync - Login</title>
<link rel="stylesheet" href="//cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
<script src="//cdn.jsdelivr.net/npm/blueimp-md5@2.19.0/js/md5.min.js"></script>
<style>
  .login-card { max-width: 360px; margin: 10vh auto; }
  .login-card h1 { text-align: center; }
  .error-msg { color: var(--pico-color-red-500, #d32f2f); text-align: center; margin-bottom: 1rem; display: none; }
  .theme-toggle { position: absolute; top: 1rem; right: 1rem; padding: 0.38rem; font-size: 0.85rem; margin: 0; }
</style>
</head>
<body>
<div class="login-card">
  <button onclick="toggleTheme()" class="outline theme-toggle">&#9681;</button>
  <h1>KOReader Sync</h1>
  <div class="error-msg" id="error"></div>
  <form id="loginForm">
    <label for="username">Username
      <input type="text" id="username" name="username" required autocomplete="username">
    </label>
    <label for="password">Password
      <input type="password" id="password" name="password" required autocomplete="current-password">
    </label>
    <button type="submit">Login</button>
  </form>
</div>
<script>
var STORAGE_KEY = 'kosync-theme';
function applyStoredTheme() {
  var t = localStorage.getItem(STORAGE_KEY);
  if (t) document.documentElement.setAttribute('data-theme', t);
}
function toggleTheme() {
  var cur = document.documentElement.getAttribute('data-theme') || 'auto';
  var next = cur === 'light' ? 'dark' : cur === 'dark' ? 'auto' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(STORAGE_KEY, next);
}
applyStoredTheme();
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  var errorEl = document.getElementById('error');
  errorEl.style.display = 'none';
  var res = await fetch('/web/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: document.getElementById('username').value,
      password: md5(document.getElementById('password').value)
    })
  });
  var data = await res.json();
  if (data.ok) {
    window.location.href = '/web/dashboard';
  } else {
    errorEl.textContent = data.error || 'Login failed';
    errorEl.style.display = 'block';
  }
});
</script>
</body>
</html>`;

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KOReader Sync - Dashboard</title>
<link rel="stylesheet" href="//cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
<link rel="stylesheet" href="//cdn.jsdelivr.net/npm/simple-datatables@latest/dist/style.css">
<style>
  .dashboard-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; }
  .table-wrapper { overflow-x: auto; }
  .progress-inline { width: 80px; vertical-align: middle; margin-right: 0.5rem; }
  .empty { text-align: center; color: var(--pico-color-muted, #999); padding: 2rem; }
  .doc-row { cursor: pointer; }
  .doc-row.active { background: var(--pico-color-primary-background-muted, #e8f0fe); }
  .chart-section { display: none; }
</style>
</head>
<body>
<header class="dashboard-header">
  <h1>KOReader Sync</h1>
  <div>
    <button onclick="toggleTheme()" class="outline" style="padding:0.38rem;font-size:0.85rem">&#9681;</button>
    <button onclick="logout()" class="outline" style="margin:1rem;padding:0.38rem;font-size:0.85rem">Logout</button>
  </div>
</header>
<main class="container">
  <section>
    <h2>Documents</h2>
    <div class="table-wrapper">
      <div id="documentsContent"><div class="empty">Loading...</div></div>
    </div>
  </section>
  <section>
    <h2>Document History</h2>
    <div class="table-wrapper">
      <div id="historyContent"><div class="empty">Select a document to view history</div></div>
    </div>
  </section>
  <section>
    <h2>Reading Duration</h2>
    <div id="timelineContent"><div class="empty">Loading...</div></div>
  </section>
  <section class="chart-section">
    <h2>Statistics</h2>
    <canvas id="statsChart"></canvas>
  </section>
</main>
<script src="//cdn.jsdelivr.net/npm/simple-datatables@latest/dist/umd/simple-datatables.js"></script>
<script src="//cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script src="//cdn.jsdelivr.net/npm/dayjs@1.11.13/dayjs.min.js"></script>
<script src="//cdn.jsdelivr.net/npm/dayjs@1.11.13/plugin/relativeTime.js"></script>
<script>
dayjs.extend(dayjs_plugin_relativeTime);
var STORAGE_KEY = 'kosync-theme';
function applyStoredTheme() {
  var t = localStorage.getItem(STORAGE_KEY);
  if (t) document.documentElement.setAttribute('data-theme', t);
}
function toggleTheme() {
  var cur = document.documentElement.getAttribute('data-theme') || 'auto';
  var next = cur === 'light' ? 'dark' : cur === 'dark' ? 'auto' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(STORAGE_KEY, next);
}
applyStoredTheme();

async function apiFetch(path) {
  var res = await fetch(path);
  if (res.status === 401) { window.location.href = '/web'; return null; }
  return res.json();
}

function logout() {
  window.location.href = '/web/logout';
}

function formatTime(ts) {
  if (!ts) return '';
  return dayjs(ts * 1000).format('YYYY-MM-DD HH:mm:ss');
}

function relativeTime(ts) {
  if (!ts) return '';
  return '<span title="' + formatTime(ts) + '">' + dayjs(ts * 1000).fromNow() + '</span>';
}

function renderProgressBar(pct) {
  var val = Math.round((pct || 0) * 100);
  return '<progress class="progress-inline" value="' + val + '" max="100"></progress> ' + val + '%';
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function displayTitle(item) {
  var title = item.title || item.filename || item.document || '';
  if (!item.title && !item.filename && item.document && /^[0-9a-f]{32}$/i.test(item.document)) {
    title = item.document.substring(0, 8) + '…';
  }
  return title;
}

var documentsData = [];
var activeDocId = null;
var docsTable = null;
var histTable = null;
var statsTable = null;

function renderDocuments() {
  var el = document.getElementById('documentsContent');
  if (!documentsData.length) { el.innerHTML = '<div class="empty">No documents yet</div>'; return; }
  var html = '<table id="docsTable" class="table">';
  html += '<thead><tr>';
  html += '<th>Title</th>';
  html += '<th>Authors</th>';
  html += '<th>Progress</th>';
  html += '<th>Device</th>';
  html += '<th>Last Sync</th>';
  html += '</tr></thead><tbody>';
  documentsData.forEach(function(doc) {
    var title = displayTitle(doc);
    var authors = doc.authors || '';
    var active = activeDocId === doc.document ? ' active' : '';
    html += '<tr class="doc-row' + active + '" onclick="loadHistory(\\'' + encodeURIComponent(doc.document) + '\\', this)">';
    html += '<td>' + escapeHtml(title) + '</td>';
    html += '<td>' + escapeHtml(authors) + '</td>';
    html += '<td>' + renderProgressBar(doc.percentage) + '</td>';
    html += '<td>' + escapeHtml(doc.device || '') + '</td>';
    html += '<td data-order="' + (doc.timestamp || 0) + '">' + relativeTime(doc.timestamp) + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
  if (docsTable) docsTable.destroy();
  docsTable = new simpleDatatables.DataTable('#docsTable', {
    searchable: true,
    fixedHeight: false,
    perPage: 10,
    perPageSelect: [10, 25, 50]
  });
}

async function loadDocuments() {
  var data = await apiFetch('/web/api/documents');
  documentsData = data || [];
  renderDocuments();
}

async function loadHistory(docEncoded, rowEl) {
  activeDocId = decodeURIComponent(docEncoded);
  var rows = document.querySelectorAll('.doc-row');
  for (var i = 0; i < rows.length; i++) rows[i].classList.remove('active');
  if (rowEl) rowEl.classList.add('active');
  var data = await apiFetch('/web/api/documents/' + docEncoded + '/history');
  var el = document.getElementById('historyContent');
  if (!data || !data.length) { el.innerHTML = '<div class="empty">No history for this document</div>'; return; }
  var html = '<table id="histTable" class="table">';
  html += '<thead><tr>';
  html += '<th>Progress</th>';
  html += '<th>Device</th>';
  html += '<th>Device ID</th>';
  html += '<th>Timestamp</th>';
  html += '<th>Created At</th>';
  html += '</tr></thead><tbody>';
  data.forEach(function(entry) {
    html += '<tr>';
    html += '<td>' + renderProgressBar(entry.percentage) + '</td>';
    html += '<td>' + escapeHtml(entry.device || '') + '</td>';
    html += '<td>' + escapeHtml(entry.device_id || '') + '</td>';
    html += '<td data-order="' + (entry.timestamp || 0) + '">' + relativeTime(entry.timestamp) + '</td>';
    html += '<td data-order="' + (entry.created_at || 0) + '">' + relativeTime(entry.created_at) + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
  if (histTable) histTable.destroy();
  histTable = new simpleDatatables.DataTable('#histTable', {
    searchable: true,
    fixedHeight: false,
    perPage: 10,
    perPageSelect: [10, 25, 50]
  });
}

function formatDuration(secs) {
  if (!secs || secs < 0) return '—';
  var days = Math.floor(secs / 86400);
  var hours = Math.floor((secs % 86400) / 3600);
  var minutes = Math.floor((secs % 3600) / 60);
  var parts = [];
  if (days > 0) parts.push(days + 'd');
  if (hours > 0) parts.push(hours + 'h');
  if (minutes > 0 || parts.length === 0) parts.push(minutes + 'm');
  return parts.join(' ');
}

async function loadReadingStats() {
  var data = await apiFetch('/web/api/reading-stats');
  var el = document.getElementById('timelineContent');
  if (!data || !data.length) { el.innerHTML = '<div class="empty">No reading data yet</div>'; return; }
  var html = '<table id="readingStatsTable" class="table">';
  html += '<thead><tr>';
  html += '<th>Title</th>';
  html += '<th>Authors</th>';
  html += '<th>First Sync</th>';
  html += '<th>Last Sync</th>';
  html += '<th>Duration</th>';
  html += '<th>Latest Progress</th>';
  html += '<th>Events</th>';
  html += '</tr></thead><tbody>';
  data.forEach(function(item) {
    var title = item.display_title || '';
    if (/^[0-9a-f]{32}$/i.test(title)) {
      title = title.substring(0, 8) + '…';
    }
    html += '<tr>';
    html += '<td>' + escapeHtml(title) + '</td>';
    html += '<td>' + escapeHtml(item.authors || '') + '</td>';
    html += '<td data-order="' + (item.first_sync || 0) + '">' + relativeTime(item.first_sync) + '</td>';
    html += '<td data-order="' + (item.last_sync || 0) + '">' + relativeTime(item.last_sync) + '</td>';
    html += '<td data-order="' + (item.duration_seconds || 0) + '"><span title="' + (item.duration_seconds || 0) + ' seconds">' + formatDuration(item.duration_seconds) + '</span></td>';
    html += '<td>' + renderProgressBar(item.latest_percentage) + '</td>';
    html += '<td>' + escapeHtml(String(item.event_count || 0)) + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
  if (statsTable) statsTable.destroy();
  statsTable = new simpleDatatables.DataTable('#readingStatsTable', {
    searchable: true,
    fixedHeight: false,
    perPage: 10,
    perPageSelect: [10, 25, 50]
  });
}

loadDocuments();
loadReadingStats();
</script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '');
    const method = request.method.toUpperCase();

    const authUser = request.headers.get('x-auth-user');
    const authKey = request.headers.get('x-auth-key');

    const db = env.KOSYNC_DB;

    const isSecure = url.protocol === 'https:';
    const cookieSecure = isSecure ? '; Secure' : '';

    // POST /users/create
    if (method === 'POST' && pathname === '/users/create') {
      const openRegs = getEnvBool(env, 'OPEN_REGISTRATIONS', true);
      if (!openRegs) return JSON_RESPONSE(403, 'This server is currently not accepting new registrations.');

      const body = await parseJson(request);
      if (!body || !body.username || !body.password) return JSON_RESPONSE(400, { message: 'Invalid request' });

      const existing = await db.prepare('SELECT username FROM users WHERE username = ?').bind(body.username).all();
      if (existing.results && existing.results.length) {
        return JSON_RESPONSE(409, 'Username is already registered.');
      }

      await db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').bind(body.username, body.password).run();
      return JSON_RESPONSE(201, { username: body.username });
    }

    // GET /users/auth
    if (method === 'GET' && pathname === '/users/auth') {
      if (!authUser || !authKey) return JSON_RESPONSE(401, { message: 'Unauthorized' });

      const found = await db.prepare('SELECT username FROM users WHERE username = ? AND password = ?').bind(authUser, authKey).all();
      if (found.results && found.results.length) {
        return JSON_RESPONSE(200, { authorized: 'OK' });
      }

      const exists = await db.prepare('SELECT username FROM users WHERE username = ?').bind(authUser).all();
      if (exists.results && exists.results.length) {
        return JSON_RESPONSE(401, { message: 'Unauthorized' });
      }
      return JSON_RESPONSE(403, { message: 'Forbidden' });
    }

    // PUT /syncs/progress
    if (method === 'PUT' && pathname === '/syncs/progress') {
      if (!authUser || !authKey) return JSON_RESPONSE(401, { message: 'Unauthorized' });

      const body = await parseJson(request);
      if (!body || !body.document || body.progress === undefined || body.percentage === undefined || !body.device || !body.device_id) {
        return JSON_RESPONSE(500, 'Unknown server error');
      }

      const authCheck = await db.prepare('SELECT username FROM users WHERE username = ? AND password = ?').bind(authUser, authKey).all();
      if (!authCheck.results || !authCheck.results.length) return JSON_RESPONSE(401, { message: 'Unauthorized' });

      const filename = body.metadata?.filename ?? null;
      const title = body.metadata?.title ?? null;
      const authors = body.metadata?.authors ?? null;
      const timestamp = Math.floor(Date.now() / 1000);

      await db.batch([
        db.prepare(`INSERT INTO sync_log
          (username, document, progress, percentage, device, device_id, timestamp, filename, title, authors)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(authUser, body.document, body.progress, body.percentage, body.device, body.device_id, timestamp, filename, title, authors),
        db.prepare(`INSERT OR REPLACE INTO documents
          (username, document, progress, percentage, device, device_id, timestamp, filename, title, authors)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(authUser, body.document, body.progress, body.percentage, body.device, body.device_id, timestamp, filename, title, authors)
      ]);

      return JSON_RESPONSE(200, { document: body.document, timestamp });
    }

    // GET /syncs/progress/:document
    const progressMatch = pathname.match(/^\/syncs\/progress\/(.+)$/);
    if (method === 'GET' && progressMatch) {
      const document = decodeURIComponent(progressMatch[1]);
      if (!authUser || !authKey) return JSON_RESPONSE(401, { message: 'Unauthorized' });
      if (!document) return JSON_RESPONSE(500, 'Unknown server error');

      const existsUser = await db.prepare('SELECT username FROM users WHERE username = ?').bind(authUser).all();
      if (!existsUser.results || !existsUser.results.length) return JSON_RESPONSE(403, { message: 'Forbidden' });

      const authCheck = await db.prepare('SELECT username FROM users WHERE username = ? AND password = ?').bind(authUser, authKey).all();
      if (!authCheck.results || !authCheck.results.length) return JSON_RESPONSE(401, { message: 'Unauthorized' });

      const res = await db.prepare('SELECT * FROM documents WHERE username = ? AND document = ?').bind(authUser, document).all();
      if (res.results && res.results.length) {
        const row = res.results[0];
        const rrdi = getEnvBool(env, 'RECEIVE_RANDOM_DEVICE_ID', false);
        const device_id = rrdi ? randomDeviceId() : row.device_id;
        const response = {
          username: authUser,
          document: row.document,
          progress: row.progress,
          percentage: row.percentage,
          device: row.device,
          device_id,
          timestamp: row.timestamp
        };
        if (row.filename || row.title || row.authors) {
          response.metadata = {
            filename: row.filename,
            title: row.title,
            authors: row.authors
          };
        }
        return JSON_RESPONSE(200, response);
      }

      return JSON_RESPONSE(200, {
        username: authUser,
      });
    }

    // GET /healthstatus
    if (method === 'GET' && pathname === '/healthstatus') {
      return JSON_RESPONSE(200, { message: 'healthy' });
    }

    // Web routes

    // GET /web/api/documents/:document/history
    const docHistoryMatch = pathname.match(/^\/web\/api\/documents\/(.+)\/history$/);
    if (method === 'GET' && docHistoryMatch) {
      const sessionUser = await getSessionUser(db, request);
      if (!sessionUser) return JSON_RESPONSE(401, { error: 'Unauthorized' });
      const document = decodeURIComponent(docHistoryMatch[1]);
      const res = await db.prepare(
        'SELECT * FROM sync_log WHERE username = ? AND document = ? ORDER BY created_at DESC'
      ).bind(sessionUser, document).all();
      return JSON_RESPONSE(200, res.results || []);
    }

    // GET /web/api/documents
    if (method === 'GET' && pathname === '/web/api/documents') {
      const sessionUser = await getSessionUser(db, request);
      if (!sessionUser) return JSON_RESPONSE(401, { error: 'Unauthorized' });
      const res = await db.prepare(
        'SELECT document, progress, percentage, device, device_id, timestamp, filename, title, authors FROM documents WHERE username = ? ORDER BY timestamp DESC'
      ).bind(sessionUser).all();
      return JSON_RESPONSE(200, res.results || []);
    }

    // GET /web/api/timeline
    if (method === 'GET' && pathname === '/web/api/timeline') {
      const sessionUser = await getSessionUser(db, request);
      if (!sessionUser) return JSON_RESPONSE(401, { error: 'Unauthorized' });
      const res = await db.prepare(
        'SELECT * FROM sync_log WHERE username = ? ORDER BY created_at DESC LIMIT 100'
      ).bind(sessionUser).all();
      return JSON_RESPONSE(200, res.results || []);
    }

    // GET /web/api/reading-stats
    if (method === 'GET' && pathname === '/web/api/reading-stats') {
      const sessionUser = await getSessionUser(db, request);
      if (!sessionUser) return JSON_RESPONSE(401, { error: 'Unauthorized' });
      const res = await db.prepare(`
        SELECT
          COALESCE(NULLIF(title, ''), NULLIF(filename, ''), document) AS display_title,
          MIN(timestamp) AS first_sync,
          MAX(timestamp) AS last_sync,
          (MAX(timestamp) - MIN(timestamp)) AS duration_seconds,
          COUNT(*) AS event_count,
          MAX(authors) AS authors,
          (SELECT percentage FROM sync_log s2
             WHERE s2.username = sync_log.username
               AND s2.document = sync_log.document
               AND COALESCE(NULLIF(s2.title, ''), NULLIF(s2.filename, ''), s2.document) = COALESCE(NULLIF(sync_log.title, ''), NULLIF(sync_log.filename, ''), sync_log.document)
             ORDER BY s2.timestamp DESC LIMIT 1) AS latest_percentage
        FROM sync_log
        WHERE username = ?
        GROUP BY COALESCE(NULLIF(title, ''), NULLIF(filename, ''), document)
        ORDER BY duration_seconds DESC
      `).bind(sessionUser).all();
      return JSON_RESPONSE(200, res.results || []);
    }

    // GET / -> redirect to /web
    if (method === 'GET' && pathname === '') {
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/web' }
      });
    }

    // GET /web
    if (method === 'GET' && pathname === '/web') {
      return HTML_RESPONSE(LOGIN_PAGE_HTML);
    }

    // POST /web/login
    if (method === 'POST' && pathname === '/web/login') {
      const body = await parseJson(request);
      if (!body || !body.username || !body.password) {
        return JSON_RESPONSE(400, { ok: false, error: 'Invalid request' });
      }
      const found = await db.prepare(
        'SELECT username FROM users WHERE username = ? AND password = ?'
      ).bind(body.username, body.password).all();
      if (!found.results || !found.results.length) {
        return JSON_RESPONSE(401, { ok: false, error: 'Invalid credentials' });
      }
      const token = generateSessionToken();
      await db.prepare(
        'INSERT INTO sessions (token, username) VALUES (?, ?)'
      ).bind(token, body.username).run();
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `session_token=${token}; HttpOnly; SameSite=Lax; Path=/web; Max-Age=86400${cookieSecure}`
        }
      });
    }

    // GET /web/logout
    if (method === 'GET' && pathname === '/web/logout') {
      const cookie = request.headers.get('Cookie') || '';
      const match = cookie.match(/session_token=([^;]+)/);
      if (match) {
        await db.prepare('DELETE FROM sessions WHERE token = ?').bind(match[1]).run();
      }
      return new Response(null, {
        status: 302,
        headers: {
          'Location': '/web',
          'Set-Cookie': `session_token=; HttpOnly; SameSite=Lax; Path=/web; Max-Age=0${cookieSecure}`
        }
      });
    }

    // GET /web/dashboard
    if (method === 'GET' && pathname === '/web/dashboard') {
      const sessionUser = await getSessionUser(db, request);
      if (!sessionUser) {
        return new Response(null, {
          status: 302,
          headers: { 'Location': '/web' }
        });
      }
      return HTML_RESPONSE(DASHBOARD_HTML);
    }

    return new Response('Not found', { status: 404 });
  }
};