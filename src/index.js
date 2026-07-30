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
     WHERE s.token = ? AND s.created_at > unixepoch() - 2592000`
  ).bind(token).all();
  if (res.results && res.results.length) return res.results[0].username;
  await db.prepare('DELETE FROM sessions WHERE created_at < unixepoch() - 2592000').run();
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
  :root {
    --dash-radius: 0.75rem;
    --dash-gap: 1.25rem;
    --dash-nav-h: 3.75rem;
  }

  body {
    min-height: 100vh;
    margin: 0;
    background:
      radial-gradient(1200px 500px at 10% -10%, color-mix(in srgb, var(--pico-primary) 14%, transparent), transparent 60%),
      radial-gradient(900px 420px at 100% 0%, color-mix(in srgb, var(--pico-primary) 8%, transparent), transparent 55%),
      var(--pico-background-color);
  }

  /* —— Top bar —— */
  .dash-nav {
    position: sticky;
    top: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: var(--dash-nav-h);
    padding: 0.65rem 1.25rem;
    border-bottom: 1px solid var(--pico-muted-border-color);
    background: color-mix(in srgb, var(--pico-background-color) 82%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .dash-brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }
  .dash-mark {
    flex-shrink: 0;
    width: 2.25rem;
    height: 2.25rem;
    display: grid;
    place-items: center;
    border-radius: 0.55rem;
    background: var(--pico-primary);
    color: var(--pico-primary-inverse, #fff);
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    box-shadow: 0 6px 16px color-mix(in srgb, var(--pico-primary) 35%, transparent);
  }
  .dash-brand-text { min-width: 0; }
  .dash-brand-text strong {
    display: block;
    font-size: 1.05rem;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }
  .dash-brand-text span {
    display: block;
    font-size: 0.75rem;
    color: var(--pico-muted-color);
    line-height: 1.3;
  }
  .dash-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .dash-actions select {
    appearance: none;
    -webkit-appearance: none;
    background-image: none;
  }
  .dash-actions button {
    margin: 0;
    width: auto;
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
  }

  /* —— Page shell —— */
  .dash-main {
    width: min(1280px, 100%);
    margin: 0 auto;
    padding: 1.5rem 1.25rem 2.5rem;
  }
  .dash-intro {
    margin-bottom: 1.25rem;
  }
  .dash-intro h1 {
    margin: 0 0 0.25rem;
    font-size: clamp(1.35rem, 2.5vw, 1.75rem);
    letter-spacing: -0.03em;
    line-height: 1.2;
  }
  .dash-intro p {
    margin: 0;
    color: var(--pico-muted-color);
    font-size: 0.95rem;
  }

  /* —— Library workspace —— */
  .dash-workspace {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--dash-gap);
    align-items: start;
    margin-bottom: var(--dash-gap);
  }

  .panel {
    background: var(--pico-card-background-color, var(--pico-background-color));
    border: 1px solid var(--pico-muted-border-color);
    border-radius: var(--dash-radius);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--pico-color) 4%, transparent);
    overflow: hidden;
    min-width: 0;
  }
  .panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1rem 1.15rem 0.85rem;
    border-bottom: 1px solid var(--pico-muted-border-color);
    background: color-mix(in srgb, var(--pico-card-sectioning-background-color, var(--pico-background-color)) 70%, transparent);
  }
  .panel-header h2 {
    margin: 0;
    font-size: 1.05rem;
    letter-spacing: -0.02em;
    line-height: 1.25;
  }
  .panel-kicker {
    display: block;
    margin-bottom: 0.2rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--pico-primary);
  }
  .panel-hint {
    margin: 0.2rem 0 0;
    font-size: 0.8rem;
    color: var(--pico-muted-color);
    line-height: 1.35;
  }
  .panel-body {
    padding: 0.85rem 1rem 1rem;
  }
  .panel-body .table-wrapper {
    margin: 0;
  }

  .panel-insights .panel-header {
    align-items: center;
  }

  /* —— History modal —— */
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.4);
    display: none;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  }
  .modal-overlay:not([hidden]) {
    display: flex;
  }
  .modal-panel {
    background: var(--pico-card-background-color, var(--pico-background-color));
    border: 1px solid var(--pico-muted-border-color);
    border-radius: var(--dash-radius);
    width: min(90vw, 800px);
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
    min-width: 0;
    overflow: hidden;
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem 1.15rem 0.85rem;
    border-bottom: 1px solid var(--pico-muted-border-color);
    background: color-mix(in srgb, var(--pico-card-sectioning-background-color, var(--pico-background-color)) 70%, transparent);
  }
  .modal-header h2 {
    margin: 0;
    font-size: 1.05rem;
    letter-spacing: -0.02em;
    line-height: 1.25;
  }
  .modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--pico-muted-color);
    padding: 0 0.25rem;
    line-height: 1;
    border-radius: 0.35rem;
    margin: 0;
    width: auto;
    flex-shrink: 0;
  }
  .modal-close:hover {
    color: var(--pico-color);
    background: color-mix(in srgb, var(--pico-muted-border-color) 30%, transparent);
  }
  .modal-body {
    padding: 0.85rem 1rem 1rem;
    overflow: auto;
    flex: 1;
    min-height: 0;
  }

  /* —— Tables & rows —— */
  .table-wrapper { overflow-x: auto; }
  .progress-inline {
    width: 80px;
    vertical-align: middle;
    margin-right: 0.5rem;
  }
  table.table { margin-bottom: 0; }
  .doc-row { cursor: pointer; transition: background 0.15s ease; }
  .doc-row:hover { background: color-mix(in srgb, var(--pico-primary) 6%, transparent); }
  .doc-row.active {
    background: color-mix(in srgb, var(--pico-primary) 12%, transparent);
    box-shadow: inset 3px 0 0 var(--pico-primary);
  }

  /* —— Empty / loading states —— */
  .empty {
    text-align: center;
    color: var(--pico-muted-color);
    padding: 2.5rem 1.25rem;
    border: 1px dashed var(--pico-muted-border-color);
    border-radius: calc(var(--dash-radius) - 0.15rem);
    background: color-mix(in srgb, var(--pico-muted-border-color) 18%, transparent);
    font-size: 0.95rem;
    line-height: 1.5;
  }
  .empty-title {
    display: block;
    margin-bottom: 0.35rem;
    font-weight: 600;
    color: var(--pico-color);
  }
  .empty-sub {
    display: block;
    font-size: 0.85rem;
    color: var(--pico-muted-color);
  }

  /* —— Charts —— */
  .dash-main > .panel + .panel {
    margin-top: var(--dash-gap);
  }
  .charts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--dash-gap);
    align-items: stretch;
  }
  .chart-card {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }
  .chart-card h3 {
    margin: 0;
    font-size: 0.95rem;
    letter-spacing: -0.01em;
    line-height: 1.3;
  }
  .chart-host {
    flex: 1;
    min-height: 280px;
  }
  .chart-canvas-wrap {
    position: relative;
    width: 100%;
    height: 280px;
  }
  .chart-host .empty {
    height: 100%;
    min-height: 280px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
  }

  /* —— DataTables controls sizing —— */
  .datatable-top input,
  .datatable-top select {
    max-width: 220px;
    font-size: 0.85rem;
    padding: 0.35rem 0.65rem;
    height: auto;
    margin-bottom: 0;
    border-radius: var(--pico-border-radius);
  }

  /* —— DataTables mobile —— */
  @media (max-width: 576px) {
    .datatable-top > nav,
    .datatable-top > div {
      float: none !important;
      width: 100%;
      margin: 0 0 0.5rem;
    }
    .datatable-top > nav:last-child,
    .datatable-top > div:last-child {
      margin-bottom: 0;
    }
  }

  /* —— Responsive layout —— */
  @media (max-width: 992px) {
    .charts-grid {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 576px) {
    .dash-nav { padding: 0.55rem 0.85rem; }
    .dash-brand-text span { display: none; }
    .dash-main { padding: 1rem 0.85rem 2rem; }
    .panel-header { padding: 0.85rem 0.9rem; }
    .panel-body { padding: 0.65rem 0.75rem 0.85rem; }
    .dash-actions button:not(.btn-icon) {
      padding: 0.4rem 0.55rem;
      font-size: 0.8rem;
    }
    .modal-panel {
      width: 95vw;
      max-height: 90vh;
    }
  }
</style>
</head>
<body>
<header class="dash-nav">
  <div class="dash-brand">
    <div class="dash-mark" aria-hidden="true">K</div>
    <div class="dash-brand-text">
      <strong>KOReader Sync</strong>
      <span>Progress across your devices</span>
    </div>
  </div>
  <div class="dash-actions">
    <select id="themeSelect" onchange="setTheme(this.value)" class="outline secondary" style="width:auto;margin:0;padding:0.4rem 0.65rem;font-size:0.85rem;height:auto;cursor:pointer">
      <option value="auto">&#9788; Auto</option>
      <option value="light">&#9788; Light</option>
      <option value="dark">&#9790; Dark</option>
    </select>
    <button type="button" onclick="logout()" class="outline secondary">Logout</button>
  </div>
</header>

<main class="dash-main">
  <div class="dash-intro">
    <h1>Your library</h1>
    <p>Select a document to inspect its sync history. Reading duration sits below for the longer view.</p>
  </div>

  <div class="dash-workspace">
    <section class="panel panel-library" aria-labelledby="docs-heading">
      <div class="panel-header">
        <div>
          <span class="panel-kicker">Library</span>
          <h2 id="docs-heading">Documents</h2>
          <p class="panel-hint">Click a row to view sync history</p>
        </div>
      </div>
      <div class="panel-body">
        <div class="table-wrapper">
          <div id="documentsContent">
            <div class="empty">
              <span class="empty-title">Loading documents…</span>
              <span class="empty-sub">Fetching your synced library</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>

  <section class="panel panel-insights" aria-labelledby="stats-heading">
    <div class="panel-header">
      <div>
        <span class="panel-kicker">Insights</span>
        <h2 id="stats-heading">Reading duration</h2>
        <p class="panel-hint">Time span from first to last sync, per document</p>
      </div>
    </div>
    <div class="panel-body">
      <div class="table-wrapper">
        <div id="timelineContent">
          <div class="empty">
            <span class="empty-title">Loading reading stats…</span>
            <span class="empty-sub">Crunching durations and event counts</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="panel panel-charts" aria-labelledby="charts-heading">
    <div class="panel-header">
      <div>
        <span class="panel-kicker">Statistics</span>
        <h2 id="charts-heading">Charts</h2>
        <p class="panel-hint">Device sync counts and per-book reading time</p>
      </div>
    </div>
    <div class="panel-body">
      <div class="charts-grid">
        <div class="chart-card">
          <h3>Device activity</h3>
          <div id="deviceChartHost" class="chart-host">
            <div class="empty">
              <span class="empty-title">Loading device stats…</span>
              <span class="empty-sub">Counting syncs per device</span>
            </div>
          </div>
        </div>
        <div class="chart-card">
          <h3>Top books by duration</h3>
          <div id="booksChartHost" class="chart-host">
            <div class="empty">
              <span class="empty-title">Loading book stats…</span>
              <span class="empty-sub">Ranking reading time</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <div id="historyModal" class="modal-overlay" hidden>
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-header">
        <div>
          <span class="panel-kicker">Detail</span>
          <h2 id="modalTitle">Document history</h2>
        </div>
        <button type="button" class="modal-close" onclick="closeHistoryModal()" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="table-wrapper">
          <div id="historyContent">
            <div class="empty">
              <span class="empty-title">Loading history…</span>
              <span class="empty-sub">Fetching sync events for this document</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</main>
<script src="//cdn.jsdelivr.net/npm/simple-datatables@latest/dist/umd/simple-datatables.js"></script>
<script src="//cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script src="//cdn.jsdelivr.net/npm/dayjs@1.11.13/dayjs.min.js"></script>
<script src="//cdn.jsdelivr.net/npm/dayjs@1.11.13/plugin/relativeTime.js"></script>
<script>
dayjs.extend(dayjs_plugin_relativeTime);
var STORAGE_KEY = 'kosync-theme';
function applyStoredTheme() {
  var t = localStorage.getItem(STORAGE_KEY) || 'auto';
  document.documentElement.setAttribute('data-theme', t);
  var sel = document.getElementById('themeSelect');
  if (sel) sel.value = t;
}
function setTheme(val) {
  document.documentElement.setAttribute('data-theme', val);
  localStorage.setItem(STORAGE_KEY, val);
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
  var modalTitle = 'Document history';
  for (var d = 0; d < documentsData.length; d++) {
    if (documentsData[d].document === activeDocId) {
      modalTitle = displayTitle(documentsData[d]) || modalTitle;
      break;
    }
  }
  document.getElementById('modalTitle').textContent = modalTitle;
  var rows = document.querySelectorAll('.doc-row');
  for (var i = 0; i < rows.length; i++) rows[i].classList.remove('active');
  if (rowEl) rowEl.classList.add('active');
  var el = document.getElementById('historyContent');
  el.innerHTML = '<div class="empty"><span class="empty-title">Loading history…</span><span class="empty-sub">Fetching sync events for this document</span></div>';
  document.getElementById('historyModal').removeAttribute('hidden');
  var data = await apiFetch('/web/api/documents/' + docEncoded + '/history');
  if (!data || !data.length) {
    el.innerHTML = '<div class="empty">No history for this document</div>';
    return;
  }
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
    html += '<td>' + (entry.device_id ? '<span title="' + escapeHtml(entry.device_id) + '">' + escapeHtml(entry.device_id.substring(0, 4)) + '…</span>' : '') + '</td>';
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

function closeHistoryModal() {
  document.getElementById('historyModal').setAttribute('hidden', '');
}

document.getElementById('historyModal').addEventListener('click', function(e) {
  if (e.target === this) closeHistoryModal();
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeHistoryModal();
});

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

async function loadCharts() {
  var deviceHost = document.getElementById('deviceChartHost');
  var booksHost = document.getElementById('booksChartHost');
  var deviceData = await apiFetch('/web/api/device-stats');
  var readingData = await apiFetch('/web/api/reading-stats');

  var styles = getComputedStyle(document.documentElement);
  var primary = (styles.getPropertyValue('--pico-primary') || '').trim() || '#0172ad';
  var muted = (styles.getPropertyValue('--pico-muted-color') || '').trim() || '#999';
  var gridColor = (styles.getPropertyValue('--pico-muted-border-color') || '').trim() || 'rgba(0,0,0,0.1)';
  var textColor = (styles.getPropertyValue('--pico-color') || '').trim() || '#373c44';

  Chart.defaults.responsive = true;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.color = muted;
  Chart.defaults.borderColor = gridColor;
  Chart.defaults.font.family = styles.fontFamily || 'system-ui, sans-serif';

  if (!deviceData || !deviceData.length) {
    deviceHost.innerHTML = '<div class="empty"><span class="empty-title">No device data yet</span><span class="empty-sub">Sync from a device to see activity here</span></div>';
  } else {
    deviceHost.innerHTML = '<div class="chart-canvas-wrap"><canvas id="deviceChart"></canvas></div>';
    var deviceLabels = deviceData.map(function(d) {
      var name = d.device || 'Unknown';
      var id = d.device_id || '';
      if (id && id.length > 10) id = id.substring(0, 8) + '…';
      return id ? (name + ' (' + id + ')') : name;
    });
    var deviceCounts = deviceData.map(function(d) { return d.sync_count || 0; });
    new Chart(document.getElementById('deviceChart'), {
      type: 'bar',
      data: {
        labels: deviceLabels,
        datasets: [{
          label: 'Syncs',
          data: deviceCounts,
          backgroundColor: primary,
          borderColor: primary,
          borderRadius: 6,
          maxBarThickness: 48
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) { return (ctx.parsed.y || 0) + ' syncs'; }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: muted, maxRotation: 45, minRotation: 0 },
            grid: { display: false },
            border: { color: gridColor }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: muted,
              precision: 0
            },
            grid: { color: gridColor },
            border: { color: gridColor },
            title: {
              display: true,
              text: 'Sync count',
              color: muted
            }
          }
        }
      }
    });
  }

  var books = (readingData || []).slice().filter(function(item) {
    return (item.duration_seconds || 0) > 0;
  }).sort(function(a, b) {
    return (b.duration_seconds || 0) - (a.duration_seconds || 0);
  }).slice(0, 10);

  if (!books.length) {
    booksHost.innerHTML = '<div class="empty"><span class="empty-title">No reading duration yet</span><span class="empty-sub">Duration appears after multiple syncs on a book</span></div>';
  } else {
    booksHost.innerHTML = '<div class="chart-canvas-wrap"><canvas id="booksChart"></canvas></div>';
    var bookLabels = books.map(function(item) {
      var title = item.display_title || 'Untitled';
      if (/^[0-9a-f]{32}$/i.test(title)) {
        title = title.substring(0, 8) + '…';
      }
      if (title.length > 36) title = title.substring(0, 34) + '…';
      return title;
    });
    var bookDurations = books.map(function(item) { return item.duration_seconds || 0; });
    new Chart(document.getElementById('booksChart'), {
      type: 'bar',
      data: {
        labels: bookLabels,
        datasets: [{
          label: 'Duration',
          data: bookDurations,
          backgroundColor: primary,
          borderColor: primary,
          borderRadius: 6,
          maxBarThickness: 28
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                return formatDuration(ctx.parsed.x || 0);
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              color: muted,
              callback: function(value) { return formatDuration(value); }
            },
            grid: { color: gridColor },
            border: { color: gridColor },
            title: {
              display: true,
              text: 'Reading duration',
              color: muted
            }
          },
          y: {
            ticks: { color: textColor },
            grid: { display: false },
            border: { color: gridColor }
          }
        }
      }
    });
  }
}

loadDocuments();
loadReadingStats();
loadCharts();
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

    // GET /web/api/device-stats
    if (method === 'GET' && pathname === '/web/api/device-stats') {
      const sessionUser = await getSessionUser(db, request);
      if (!sessionUser) return JSON_RESPONSE(401, { error: 'Unauthorized' });
      const res = await db.prepare(`
        SELECT
          device,
          device_id,
          COUNT(*) AS sync_count,
          (MAX(timestamp) - MIN(timestamp)) AS total_duration_seconds
        FROM sync_log
        WHERE username = ?
        GROUP BY device, device_id
        ORDER BY sync_count DESC
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
          'Set-Cookie': `session_token=${token}; HttpOnly; SameSite=Lax; Path=/web; Max-Age=2592000${cookieSecure}`
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