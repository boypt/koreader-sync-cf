# AGENTS.md

KOReader Progress Sync backend on Cloudflare Workers + D1. Single-file Worker; no monorepo, tests, lint, or CI.

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
| `migrations/005_add_accept_backward_progress.sql` | Adds `accept_backward_progress` to `users` (per-user backward-sync toggle, default 1) |
| `package.json` | `dev` / `deploy` only |

## Commands

```bash
bun install                          # or npm i — wrangler + workers-types
bun run dev                          # wrangler dev -c wrangler.toml
bun run deploy                       # D1 migrations --remote, then wrangler deploy

# D1 migrations (now also run automatically before every `bun run deploy`)
bunx wrangler d1 migrations apply kosync --local
bunx wrangler d1 migrations apply kosync --remote
```

No test/lint/typecheck scripts. Verify with `bun run dev` + HTTP against routes below.

### Local test accounts (in local D1; plaintext is what you enter in web login)

| Username | Password |
|----------|----------|
| `demo` | `demo` |
| `tester` | `secret` |
| `testuser` | `testpass` |
| `user2` | `testpass` |

## Architecture (non-obvious)

- **Binding:** `env.KOSYNC_DB` → D1 `kosync`, `migrations_dir = "migrations"`.
- **Auth:** headers `x-auth-user` + `x-auth-key` (KOReader). Compared to `users.password` as stored — clients send an **MD5 hash** of the password; server compares directly (no server-side hashing). Web login page also hashes client-side with MD5 before sending.
- **Env flags** (Workers vars; parsed via `getEnvBool` → only lowercase `"true"` is true):
  - `OPEN_REGISTRATIONS` — default **true**; `false` → 403 on `POST /users/create`
  - `RECEIVE_RANDOM_DEVICE_ID` — default **false**; when true, GET progress returns a random `device_id` (forces client resync)
- **Daily cleanup:** a Cloudflare Cron Trigger (`[triggers] crons = ["0 3 * * *"]` in `wrangler.toml`) invokes the `scheduled` export daily, which globally deletes `sync_log`/`documents` older than 1 year and `sessions` older than 1 month. There is no manual maintenance endpoint/UI.
- **Paths:** trailing slashes stripped before match.
- **Schema:** `users(username PK, password, accept_backward_progress)` — `password` stores MD5 hashes, not plaintext; `accept_backward_progress` INTEGER default 1 (accept backward progress); `documents` PK `(username, document)`, FK to users.

### Web UI (inline HTML in `src/index.js`)

- **Frontend libs** (CDN, `//` protocol-relative URLs, not stored in project):
  - **PicoCSS v2** - base styling, `data-theme="auto"` follows system light/dark; user selects theme via `<select>` dropdown (auto/light/dark), persisted in `localStorage` key `kosync-theme`
  - **blueimp-md5** - login page hashes password client-side (`md5(password)`) before sending to `/web/login`
  - **Simple-DataTables** - sortable/searchable/paginated tables for Documents, History, and Reading Duration
  - **Day.js** + relativeTime plugin - `dayjs(ts*1000).fromNow()` for all time columns; exact time shown on hover via `<span title="...">`; `formatTime()` uses `dayjs().format('YYYY-MM-DD HH:mm:ss')` as the tooltip text
  - **Chart.js v4** - used for Statistics charts: device activity (bar chart) and top books by reading duration (horizontal bar chart)
- **Dashboard layout:** Glass-morphism sticky header (brand mark "K" + title + theme dropdown + sync-settings gear + logout + password change) → single-column Library panel → modal for document history detail → Reading Duration panel → Statistics charts panel (device + books side-by-side desktop, stacked mobile)
- **Document history modal:** Clicking a document row opens a centered modal overlay with the history table; close via × button, backdrop click, or Escape key
- **HTML constants:** `LOGIN_PAGE_HTML` and `DASHBOARD_HTML` are JS template literals in `src/index.js` - note escaped backticks/quotes in onclick handlers
- **Progress bars** use PicoCSS native `<progress value="x" max="100">` element (not custom spans) - PicoCSS styles it via `--pico-progress-color`
- **MD5 document IDs:** `displayTitle()` truncates 32-char hex hashes to first 8 chars + `…` when no title/filename exists
- **Device IDs in history table:** Device column displays friendly retail name only, with full Device ID shown on hover via `title` attribute; empty device records display `(Pulled)`
- **Device retail names:** `deviceRetailName()` maps KOReader device model names (e.g., `KindlePaperWhite5`) to friendly retail names (e.g., "Kindle Paperwhite 5") — used in charts and history tables

### Web UI routes

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/web` | Login page |
| `POST` | `/web/login` | Body `{username, password}` (password is MD5). Sets session cookie. |
| `GET` | `/web/dashboard` | Dashboard (requires session) |
| `GET` | `/web/logout` | Clear session, redirect to `/web` |
| `GET` | `/web/api/documents` | JSON list of user's documents |
| `GET` | `/web/api/documents/:document/history` | JSON sync history for a document |
| `GET` | `/web/api/reading-stats` | JSON reading duration stats per document |
| `GET` | `/web/api/device-stats` | JSON sync count and duration per device |
| `GET` | `/web/api/timeline` | JSON recent sync log (last 100 entries) |
| `GET` | `/web/api/settings` | JSON user sync settings `{accept_backward_progress: bool}` |
| `POST` | `/web/api/change-password` | Body `{password}` (MD5 hash). Changes user password. |
| `POST` | `/web/api/settings` | Body `{accept_backward_progress: bool}`. Saves per-user sync settings (Settings modal / ⚙ gear button). |

Session cookies: `HttpOnly; SameSite=Lax; Path=/web; Max-Age=2592000`; `Secure` added on HTTPS. Expired sessions (30 days) are cleaned up on any session access.

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

**Backward progress guard:** each user has `users.accept_backward_progress` (default 1 = accept). When 0, a `PUT /syncs/progress` whose progress is behind the stored `documents` row (backward if the numeric `percentage` or the numeric `progress` is lower; non-numeric values are ignored) is rejected: nothing is written to `documents` **or** `sync_log` (a sync_log row would corrupt reading stats' latest percentage / fin_by estimate), and the response is `200 {document, timestamp:<stored>}` so KOReader clients are unaffected.

## Gotchas

- Do **not** “fix” MD5 password storage, 500-on-bad-PUT, or username-only empty progress without checking KOReader client expectations — response shapes/status codes are protocol surface. Passwords are stored as MD5 hashes (clients send hashes; server compares directly) — this is intentional for KOReader protocol compatibility.
- Do **not** rename D1 binding `KOSYNC_DB` or table/column names without a migration + client impact check.
- `wrangler.toml` has no `database_id` (kept out of the repo intentionally — others may fork/use it). Wrangler 4.x resolves the remote D1 database by `database_name`, so remote commands work as-is after `bunx wrangler d1 create kosync`.
- `@cloudflare/workers-types` is present but code is **`.js`** with no `tsconfig` — don’t assume TypeScript build.
- Root `.gitignore` is mostly a Python template leftover; project-specific ignore is mainly `data/db.json` (legacy).
- README deploy badge points at upstream `boypt/koreader-sync-cf`.
- Web UI HTML is inside JS template literals - backticks and `${}` in inline JS/CSS must be escaped (`\\'`, `\\\``); editing HTML requires care with escaping.
- **Escape rule for template literals:** When adding JS code (e.g., Chart.js tooltip callbacks) inside `LOGIN_PAGE_HTML` or `DASHBOARD_HTML`, use `\\n` for newlines, not `\n`. The template literal itself provides one level of escaping.
- PicoCSS v2 CSS variables differ from v1 - use `--pico-primary`, `--pico-muted-color`, `--pico-muted-border-color` etc., not `--pico-color-*` prefixes.
- Chart.js is loaded via CDN and used for Statistics charts (device activity bar chart + top books by duration horizontal bar chart) — themes are read from `--pico-primary` via `getComputedStyle`.
- Simple-DataTables reads `data-order` (not `data-sort`) on `<td>` for custom sort values - use `data-order` with raw timestamp for time columns that display relative time.

## When changing behavior

1. Prefer edits only in `src/index.js` + `migrations/` as needed.
2. Keep JSON field names and status codes aligned with existing handlers.
3. Smoke-test: create user → auth → PUT progress → GET progress → healthcheck.
4. Web UI smoke-test: apply migrations → GET /web (login renders) → POST /web/login → GET /web/dashboard (tables, charts, modal render; no console errors).
