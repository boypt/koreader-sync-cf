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
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KOReader Sync - Login</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #f0f2f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { background: #fff; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); width: 100%; max-width: 360px; }
  h1 { font-size: 1.5rem; margin-bottom: 1.5rem; text-align: center; color: #333; }
  label { display: block; margin-bottom: 0.5rem; font-weight: 500; color: #555; }
  input { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem; margin-bottom: 1rem; }
  input:focus { outline: none; border-color: #4a90d9; }
  button { width: 100%; padding: 0.75rem; background: #4a90d9; color: #fff; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; }
  button:hover { background: #3a7bc8; }
  .error { color: #d32f2f; margin-bottom: 1rem; text-align: center; display: none; }
</style>
</head>
<body>
<div class="card">
  <h1>KOReader Sync</h1>
  <div class="error" id="error"></div>
  <form id="loginForm">
    <label for="username">Username</label>
    <input type="text" id="username" name="username" required autocomplete="username">
    <label for="password">Password</label>
    <input type="password" id="password" name="password" required autocomplete="current-password">
    <button type="submit">Login</button>
  </form>
</div>
<script>
function md5(input) {
  var s = unescape(encodeURIComponent(input));
  function rl(v, n) { return (v << n) | (v >>> (32 - n)); }
  function au(x, y) {
    var x8 = x & 0x80000000, y8 = y & 0x80000000, x4 = x & 0x40000000, y4 = y & 0x40000000;
    var r = (x & 0x3FFFFFFF) + (y & 0x3FFFFFFF);
    if (x4 & y4) return r ^ 0x80000000 ^ x8 ^ y8;
    if (x4 | y4) { return (r & 0x40000000) ? (r ^ 0xC0000000 ^ x8 ^ y8) : (r ^ 0x40000000 ^ x8 ^ y8); }
    return r ^ x8 ^ y8;
  }
  function F(x,y,z){return (x&y)|((~x)&z);}
  function G(x,y,z){return (x&z)|(y&(~z));}
  function H(x,y,z){return x^y^z;}
  function I(x,y,z){return y^(x|(~z));}
  function FF(a,b,c,d,x,s,t){a=au(a,au(au(F(b,c,d),x),t));return au(rl(a,s),b);}
  function GG(a,b,c,d,x,s,t){a=au(a,au(au(G(b,c,d),x),t));return au(rl(a,s),b);}
  function HH(a,b,c,d,x,s,t){a=au(a,au(au(H(b,c,d),x),t));return au(rl(a,s),b);}
  function II(a,b,c,d,x,s,t){a=au(a,au(au(I(b,c,d),x),t));return au(rl(a,s),b);}
  function toWords(str) {
    var len = str.length, nW = (((len + 8) - ((len + 8) % 64)) / 64 + 1) * 16;
    var wa = new Array(nW).fill(0), wc, pos, count = 0;
    while (count < len) { wc = (count - count % 4) / 4; pos = (count % 4) * 8; wa[wc] |= (str.charCodeAt(count) << pos); count++; }
    wc = (count - count % 4) / 4; pos = (count % 4) * 8;
    wa[wc] |= (0x80 << pos); wa[nW - 2] = len << 3; wa[nW - 1] = len >>> 29;
    return wa;
  }
  function toHex(w) {
    var h = '0123456789abcdef', s = '';
    for (var i = 0; i <= 3; i++) { var b = (w >>> (i * 8)) & 255; s += h[(b >> 4) & 0xF] + h[b & 0xF]; }
    return s;
  }
  var x = toWords(s), a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
  for (var i = 0; i < x.length; i += 16) {
    var oa = a, ob = b, oc = c, od = d;
    a=FF(a,b,c,d,x[i],7,0xD76AA478);d=FF(d,a,b,c,x[i+1],12,0xE8C7B756);c=FF(c,d,a,b,x[i+2],17,0x242070DB);b=FF(b,c,d,a,x[i+3],22,0xC1BDCEEE);
    a=FF(a,b,c,d,x[i+4],7,0xF57C0FAF);d=FF(d,a,b,c,x[i+5],12,0x4787C62A);c=FF(c,d,a,b,x[i+6],17,0xA8304613);b=FF(b,c,d,a,x[i+7],22,0xFD469501);
    a=FF(a,b,c,d,x[i+8],7,0x698098D8);d=FF(d,a,b,c,x[i+9],12,0x8B44F7AF);c=FF(c,d,a,b,x[i+10],17,0xFFFF5BB1);b=FF(b,c,d,a,x[i+11],22,0x895CD7BE);
    a=FF(a,b,c,d,x[i+12],7,0x6B901122);d=FF(d,a,b,c,x[i+13],12,0xFD987193);c=FF(c,d,a,b,x[i+14],17,0xA679438E);b=FF(b,c,d,a,x[i+15],22,0x49B40821);
    a=GG(a,b,c,d,x[i+1],5,0xF61E2562);d=GG(d,a,b,c,x[i+6],9,0xC040B340);c=GG(c,d,a,b,x[i+11],14,0x265E5A51);b=GG(b,c,d,a,x[i],20,0xE9B6C7AA);
    a=GG(a,b,c,d,x[i+5],5,0xD62F105D);d=GG(d,a,b,c,x[i+10],9,0x2441453);c=GG(c,d,a,b,x[i+15],14,0xD8A1E681);b=GG(b,c,d,a,x[i+4],20,0xE7D3FBC8);
    a=GG(a,b,c,d,x[i+9],5,0x21E1CDE6);d=GG(d,a,b,c,x[i+14],9,0xC33707D6);c=GG(c,d,a,b,x[i+3],14,0xF4D50D87);b=GG(b,c,d,a,x[i+8],20,0x455A14ED);
    a=GG(a,b,c,d,x[i+13],5,0xA9E3E905);d=GG(d,a,b,c,x[i+2],9,0xFCEFA3F8);c=GG(c,d,a,b,x[i+7],14,0x676F02D9);b=GG(b,c,d,a,x[i+12],20,0x8D2A4C8A);
    a=HH(a,b,c,d,x[i+5],4,0xFFFA3942);d=HH(d,a,b,c,x[i+8],11,0x8771F681);c=HH(c,d,a,b,x[i+11],16,0x6D9D6122);b=HH(b,c,d,a,x[i+14],23,0xFDE5380C);
    a=HH(a,b,c,d,x[i+1],4,0xA4BEEA44);d=HH(d,a,b,c,x[i+4],11,0x4BDECFA9);c=HH(c,d,a,b,x[i+7],16,0xF6BB4B60);b=HH(b,c,d,a,x[i+10],23,0xBEBFBC70);
    a=HH(a,b,c,d,x[i+13],4,0x289B7EC6);d=HH(d,a,b,c,x[i],11,0xEAA127FA);c=HH(c,d,a,b,x[i+3],16,0xD4EF3085);b=HH(b,c,d,a,x[i+6],23,0x4881D05);
    a=HH(a,b,c,d,x[i+9],4,0xD9D4D039);d=HH(d,a,b,c,x[i+12],11,0xE6DB99E5);c=HH(c,d,a,b,x[i+15],16,0x1FA27CF8);b=HH(b,c,d,a,x[i+2],23,0xC4AC5665);
    a=II(a,b,c,d,x[i],6,0xF4292244);d=II(d,a,b,c,x[i+7],10,0x432AFF97);c=II(c,d,a,b,x[i+14],15,0xAB9423A7);b=II(b,c,d,a,x[i+5],21,0xFC93A039);
    a=II(a,b,c,d,x[i+12],6,0x655B59C3);d=II(d,a,b,c,x[i+3],10,0x8F0CCC92);c=II(c,d,a,b,x[i+10],15,0xFFEFF47D);b=II(b,c,d,a,x[i+1],21,0x85845DD1);
    a=II(a,b,c,d,x[i+8],6,0x6FA87E4F);d=II(d,a,b,c,x[i+15],10,0xFE2CE6E0);c=II(c,d,a,b,x[i+6],15,0xA3014314);b=II(b,c,d,a,x[i+13],21,0x4E0811A1);
    a=II(a,b,c,d,x[i+4],6,0xF7537E82);d=II(d,a,b,c,x[i+11],10,0xBD3AF235);c=II(c,d,a,b,x[i+2],15,0x2AD7D2BB);b=II(b,c,d,a,x[i+9],21,0xEB86D391);
    a=au(a,oa);b=au(b,ob);c=au(c,oc);d=au(d,od);
  }
  return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('error');
  errorEl.style.display = 'none';
  const res = await fetch('/web/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: document.getElementById('username').value,
      password: md5(document.getElementById('password').value)
    })
  });
  const data = await res.json();
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
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KOReader Sync - Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #f0f2f5; color: #333; }
  header { background: #4a90d9; color: #fff; padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center; }
  header h1 { font-size: 1.25rem; }
  header button { padding: 0.5rem 1rem; background: rgba(255,255,255,0.2); color: #fff; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; cursor: pointer; font-size: 0.875rem; }
  header button:hover { background: rgba(255,255,255,0.3); }
  main { padding: 1.5rem; max-width: 1200px; margin: 0 auto; }
  section { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); padding: 1.5rem; margin-bottom: 1.5rem; }
  section h2 { font-size: 1.1rem; margin-bottom: 1rem; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 0.75rem; border-bottom: 1px solid #eee; }
  th { font-weight: 600; color: #666; font-size: 0.875rem; }
  tr:hover { background: #f8f9fa; }
  .doc-row { cursor: pointer; }
  .doc-row.active { background: #e8f0fe; }
  .empty { text-align: center; color: #999; padding: 2rem; }
  .timeline-item { padding: 0.75rem 0; border-bottom: 1px solid #eee; }
  .timeline-item:last-child { border-bottom: none; }
  .timeline-meta { font-size: 0.875rem; color: #888; }
  .progress-bar { display: inline-block; width: 80px; height: 8px; background: #e0e0e0; border-radius: 4px; vertical-align: middle; margin-right: 0.5rem; }
  .progress-bar-fill { height: 100%; background: #4a90d9; border-radius: 4px; }
</style>
</head>
<body>
<header>
  <h1>KOReader Sync</h1>
  <button onclick="logout()">Logout</button>
</header>
<main>
  <section id="documents">
    <h2>Documents</h2>
    <div id="documentsContent"><div class="empty">Loading...</div></div>
  </section>
  <section id="history">
    <h2>Document History</h2>
    <div id="historyContent"><div class="empty">Select a document to view history</div></div>
  </section>
  <section id="timeline">
    <h2>Global Timeline</h2>
    <div id="timelineContent"><div class="empty">Loading...</div></div>
  </section>
</main>
<script>
async function apiFetch(path) {
  const res = await fetch(path);
  if (res.status === 401) { window.location.href = '/web'; return null; }
  return res.json();
}

function logout() {
  window.location.href = '/web/logout';
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleString();
}

function renderProgressBar(pct) {
  var val = Math.round((pct || 0) * 100);
  return '<span class="progress-bar"><span class="progress-bar-fill" style="width:' + val + '%"></span></span> ' + val + '%';
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadDocuments() {
  var data = await apiFetch('/web/api/documents');
  var el = document.getElementById('documentsContent');
  if (!data || !data.length) { el.innerHTML = '<div class="empty">No documents yet</div>'; return; }
  var html = '<table><thead><tr><th>Title</th><th>Authors</th><th>Progress</th><th>Device</th><th>Last Sync</th></tr></thead><tbody>';
  data.forEach(function(doc) {
    var title = doc.title || doc.filename || doc.document;
    var authors = doc.authors || '';
    html += '<tr class="doc-row" onclick="loadHistory(\\'' + encodeURIComponent(doc.document) + '\\', this)">';
    html += '<td>' + escapeHtml(title) + '</td>';
    html += '<td>' + escapeHtml(authors) + '</td>';
    html += '<td>' + renderProgressBar(doc.percentage) + '</td>';
    html += '<td>' + escapeHtml(doc.device || '') + '</td>';
    html += '<td>' + formatTime(doc.timestamp) + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

async function loadHistory(docEncoded, rowEl) {
  var rows = document.querySelectorAll('.doc-row');
  for (var i = 0; i < rows.length; i++) rows[i].classList.remove('active');
  if (rowEl) rowEl.classList.add('active');
  var data = await apiFetch('/web/api/documents/' + docEncoded + '/history');
  var el = document.getElementById('historyContent');
  if (!data || !data.length) { el.innerHTML = '<div class="empty">No history for this document</div>'; return; }
  var html = '';
  data.forEach(function(entry) {
    var title = entry.title || entry.filename || entry.document;
    html += '<div class="timeline-item">';
    html += '<div><strong>' + escapeHtml(title) + '</strong> &mdash; ' + renderProgressBar(entry.percentage) + '</div>';
    html += '<div class="timeline-meta">' + formatTime(entry.timestamp || entry.created_at) + ' &middot; ' + escapeHtml(entry.device || '') + '</div>';
    if (entry.authors) html += '<div class="timeline-meta">Authors: ' + escapeHtml(entry.authors) + '</div>';
    html += '</div>';
  });
  el.innerHTML = html;
}

async function loadTimeline() {
  var data = await apiFetch('/web/api/timeline');
  var el = document.getElementById('timelineContent');
  if (!data || !data.length) { el.innerHTML = '<div class="empty">No sync events yet</div>'; return; }
  var html = '';
  data.forEach(function(entry) {
    var title = entry.title || entry.filename || entry.document;
    html += '<div class="timeline-item">';
    html += '<div><strong>' + escapeHtml(title) + '</strong> &mdash; ' + renderProgressBar(entry.percentage) + '</div>';
    html += '<div class="timeline-meta">' + formatTime(entry.timestamp || entry.created_at) + ' &middot; ' + escapeHtml(entry.device || '') + '</div>';
    html += '</div>';
  });
  el.innerHTML = html;
}

loadDocuments();
loadTimeline();
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