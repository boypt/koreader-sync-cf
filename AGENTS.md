# AGENTS.md

KOReader Progress Sync backend on Cloudflare Workers + D1. Single-file Worker; no monorepo, tests, lint, CI, or lockfile.

**Stack:** plain JS (not TS), Wrangler 4, D1. Scripts use `bunx` (Bun), not npm/npx.

## Layout

| Path | Role |
|------|------|
| `src/index.js` | Sole entry - all routes, auth, DB, web UI (inline HTML) |
| `wrangler.toml` | Worker name, `main`, D1 binding |
| `migrations/001_create_tables.sql` | D1 schema (`users`, `documents`) |
| `migrations/002_add_metadata_columns.sql` | Adds `filename`, `title`, `authors` to `documents` |
| `migrations/003_create_sync_log.sql` | `sync_log` table for sync history |
| `migrations/004_create_sessions.sql` | `sessions` table for web UI auth |
| `package.json` | `dev` / `deploy` only |

## Commands

```bash
bun install                          # or npm i — wrangler + workers-types
bun run dev                          # wrangler dev -c wrangler.toml
bun run deploy                       # wrangler deploy -c wrangler.toml

# D1 (database_id not in wrangler.toml until created/bound)
bunx wrangler d1 create kosync
bunx wrangler d1 migrations apply kosync --local
bunx wrangler d1 migrations apply kosync --remote
```

No test/lint/typecheck scripts. Verify with `bun run dev` + HTTP against routes below.

## Architecture (non-obvious)

- **Binding:** `env.KOSYNC_DB` → D1 `kosync`, `migrations_dir = "migrations"`.
- **Auth:** headers `x-auth-user` + `x-auth-key` (KOReader). Compared to `users.password` as stored — clients typically send a hash; server does not hash.
- **Env flags** (Workers vars; parsed via `getEnvBool` → only lowercase `"true"` is true):
  - `OPEN_REGISTRATIONS` — default **true**; `false` → 403 on `POST /users/create`
  - `RECEIVE_RANDOM_DEVICE_ID` — default **false**; when true, GET progress returns a random `device_id` (forces client resync)
- **Paths:** trailing slashes stripped before match.
- **Schema:** `users(username PK, password)`; `documents` PK `(username, document)`, FK to users.

### Web UI (inline HTML in `src/index.js`)

- **Frontend libs** (CDN, `//` protocol-relative URLs, not stored in project):
  - **PicoCSS v2** - base styling, `data-theme="auto"` follows system light/dark; user toggle via `localStorage` key `kosync-theme`
  - **blueimp-md5** - login page hashes password client-side (`md5(password)`) before sending to `/web/login`
  - **Simple-DataTables** - sortable/searchable/paginated tables for Documents and History
  - **Day.js** + relativeTime plugin - `dayjs(ts*1000).fromNow()` for Last Sync column; falls back to `toLocaleString()` for dates > 30 days
  - **Chart.js v4** - loaded but **not initialized**; `<canvas id="statsChart">` in a hidden `<section class="chart-section">` for future stats charts
- **HTML constants:** `LOGIN_PAGE_HTML` and `DASHBOARD_HTML` are JS template literals in `src/index.js` - note escaped backticks/quotes in onclick handlers
- **Progress bars** use PicoCSS native `<progress value="x" max="100">` element (not custom spans) - PicoCSS styles it via `--pico-progress-color`
- **MD5 document IDs:** `displayTitle()` truncates 32-char hex hashes to first 8 chars + `…` when no title/filename exists

### Web UI routes

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/web` | Login page |
| `POST` | `/web/login` | Body `{username, password}` (password is MD5). Sets session cookie. |
| `GET` | `/web/dashboard` | Dashboard (requires session) |
| `GET` | `/web/logout` | Clear session, redirect to `/web` |
| `GET` | `/web/api/documents` | JSON list of user's documents |
| `GET` | `/web/api/documents/:document/history` | JSON sync history for a document |
| `GET` | `/web/api/timeline` | JSON global timeline (last 100 events) |

Session cookies: `HttpOnly; SameSite=Lax; Path=/web; Max-Age=86400`; `Secure` added on HTTPS.

### Routes (must stay KOReader-compatible)

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/users/create` | body `{username,password}` → 201 / 409 / 403 if regs closed |
| `GET` | `/users/auth` | auth headers; 200 `{authorized:"OK"}`; bad key 401; unknown user **403** |
| `PUT` | `/syncs/progress` | auth + body `document,progress,percentage,device,device_id`; bad body → **500** (not 400) |
| `GET` | `/syncs/progress/:document` | URL-decoded doc id; no row → **200** `{username}` only |
| `GET` | `/healthstatus` | `{message:"healthy"}` |
| other | | plain `404` text, not JSON |

`INSERT OR REPLACE` on progress upsert; `timestamp` = unix seconds server-side.

## Gotchas

- Do **not** “fix” plaintext password storage, 500-on-bad-PUT, or username-only empty progress without checking KOReader client expectations — response shapes/status codes are protocol surface.
- Do **not** rename D1 binding `KOSYNC_DB` or table/column names without a migration + client impact check.
- `wrangler.toml` has no `database_id` — local/remote D1 must be created and id filled (or deploy button flow) before remote works.
- `@cloudflare/workers-types` is present but code is **`.js`** with no `tsconfig` — don’t assume TypeScript build.
- Root `.gitignore` is mostly a Python template leftover; project-specific ignore is mainly `data/db.json` (legacy).
- README deploy badge points at upstream `boypt/koreader-sync-cf`.
- Web UI HTML is inside JS template literals - backticks and `${}` in inline JS/CSS must be escaped (`\\'`, `\\\``); editing HTML requires care with escaping.
- PicoCSS v2 CSS variables differ from v1 - use `--pico-primary`, `--pico-muted-color`, `--pico-muted-border-color` etc., not `--pico-color-*` prefixes.
- Chart.js is loaded via CDN but intentionally not initialized - do not assume `Chart` is undefined; the `<canvas>` exists but `display:none`.

## When changing behavior

1. Prefer edits only in `src/index.js` + `migrations/` as needed.
2. Keep JSON field names and status codes aligned with existing handlers.
3. Smoke-test: create user → auth → PUT progress → GET progress → healthcheck.
4. Web UI smoke-test: apply migrations → GET /web (login renders) → POST /web/login → GET /web/dashboard (tables render, no console errors).
