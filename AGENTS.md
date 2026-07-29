# AGENTS.md

KOReader Progress Sync backend on Cloudflare Workers + D1. Single-file Worker; no monorepo, tests, lint, CI, or lockfile.

**Stack:** plain JS (not TS), Wrangler 4, D1. Scripts use `bunx` (Bun), not npm/npx.

## Layout

| Path | Role |
|------|------|
| `src/index.js` | Sole entry — all routes, auth, DB |
| `wrangler.toml` | Worker name, `main`, D1 binding |
| `migrations/001_create_tables.sql` | D1 schema (`users`, `documents`) |
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

## When changing behavior

1. Prefer edits only in `src/index.js` + `migrations/` as needed.
2. Keep JSON field names and status codes aligned with existing handlers.
3. Smoke-test: create user → auth → PUT progress → GET progress → healthcheck.
