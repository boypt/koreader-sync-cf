const JSON_RESPONSE = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' }
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '');
    const method = request.method.toUpperCase();

    // Helper to read auth headers
    const authUser = request.headers.get('x-auth-user');
    const authKey = request.headers.get('x-auth-key');

    const db = env.KOSYNC_DB;

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

      const timestamp = Math.floor(Date.now() / 1000);
      await db.prepare(`INSERT OR REPLACE INTO documents
        (username, document, progress, percentage, device, device_id, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(authUser, body.document, body.progress, body.percentage, body.device, body.device_id, timestamp).run();

      return JSON_RESPONSE(200, { document: body.document, timestamp });
    }

    // GET /syncs/progress/:document
    const match = pathname.match(/^\/syncs\/progress\/(.+)$/);
    if (method === 'GET' && match) {
      const document = decodeURIComponent(match[1]);
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
        return JSON_RESPONSE(200, {
          username: authUser,
          document: row.document,
          progress: row.progress,
          percentage: row.percentage,
          device: row.device,
          device_id,
          timestamp: row.timestamp
        });
      } else {
        return JSON_RESPONSE(200, {
          username: authUser,
        });
      }

      return new Response(null, { status: 404 });
    }

    // GET /healthstatus
    if (method === 'GET' && pathname === '/healthstatus') {
      return JSON_RESPONSE(200, { message: 'healthy' });
    }

    return new Response('Not found', { status: 404 });
  }
};
