# KOReader Progress Sync (Cloudflare Workers)

A Cloudflare Workers-based backend for KOReader Progress Sync, with metadata support, sync history, and a web dashboard.

[![Deploy to Cloudflare](https://img.shields.io/badge/Deploy%21to-Cloudflare-blue)](https://deploy.workers.cloudflare.com/?url=https://github.com/boypt/koreader-sync-cf)

## Features

- **KOReader API** — Full compatibility with KOReader's Progress Sync plugin
- **Book Metadata** — Stores `filename`, `title`, and `authors` sent by the KOReader client (optional, enabled via `send_metadata`)
- **Sync History** — Every sync event is recorded in `sync_log` for complete history tracking
- **Web Dashboard** — Browser-based UI at `/web` to view documents, sync history, and reading statistics
- **Statistics Charts** — Device activity and per-book reading duration charts powered by Chart.js
- **Theme Support** — Auto/light/dark theme via PicoCSS v2 with a dropdown selector

## Contents

- `src/index.js` — Worker entrypoint (all routes, auth, DB, web UI)
- `wrangler.toml` — Cloudflare Workers configuration
- `package.json` — dev/deploy scripts
- `migrations/001_create_tables.sql` — Core schema (users, documents)
- `migrations/002_add_metadata_columns.sql` — Adds metadata columns to documents
- `migrations/003_create_sync_log.sql` — Sync history table
- `migrations/004_create_sessions.sql` — Web UI session table

## Deploy

[![Deploy to Cloudflare](https://img.shields.io/badge/Deploy%21to-Cloudflare-blue)](https://deploy.workers.cloudflare.com/?url=https://github.com/boypt/koreader-sync-cf)

Or deploy manually:

1. Create a D1 database: `bunx wrangler d1 create kosync`
2. Add the `database_id` to `wrangler.toml`
3. Apply migrations: `bunx wrangler d1 migrations apply kosync --remote`
4. Deploy: `bun run deploy`

## Local Development

```bash
bun install                    # or npm i
bunx wrangler d1 migrations apply kosync --local
bun run dev                    # starts at http://localhost:8787
```

## Configuration (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `OPEN_REGISTRATIONS` | `true` | Allow new user registrations. Set `false` to disable. |
| `RECEIVE_RANDOM_DEVICE_ID` | `false` | Return a random `device_id` on GET to force client resync. Useful for single-device sync with cleaning tools. |

## API Routes

### KOReader API (existing, unchanged)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/users/create` | Register. Body: `{username, password}` |
| `GET` | `/users/auth` | Auth via headers `x-auth-user`, `x-auth-key` |
| `PUT` | `/syncs/progress` | Push progress. Body: `{document, progress, percentage, device, device_id, metadata?}` |
| `GET` | `/syncs/progress/:document` | Pull progress for a document |
| `GET` | `/healthstatus` | Returns `{"message":"healthy"}` |

The `metadata` field is optional. When present, it should be:
```json
{
  "filename": "book.pdf",
  "title": "Book Title",
  "authors": "Author Name"
}
```

> **Note:** Book metadata support requires KOReader 2026.07 "Sailing Walrus" or later.

### Web UI (new)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/web` | Login page |
| `POST` | `/web/login` | Login. Body: `{username, password}`. Returns `{ok: true/false}`. Sets session cookie. |
| `GET` | `/web/dashboard` | Dashboard with document list, document history modal, reading duration table, and statistics charts |
| `GET` | `/web/logout` | Clear session, redirect to `/web` |
| `GET` | `/web/api/documents` | JSON list of documents (requires session) |
| `GET` | `/web/api/documents/:document/history` | JSON sync history for a document (requires session) |
| `GET` | `/web/api/reading-stats` | JSON reading duration stats per document (requires session) |
| `GET` | `/web/api/device-stats` | JSON sync count and duration per device (requires session) |

Session cookies are `HttpOnly; SameSite=Lax; Path=/web; Max-Age=2592000` (30 days). The `Secure` flag is added automatically on HTTPS connections.

## Notes

- Passwords are stored as plaintext (KOReader client sends MD5 hash — this is the protocol surface, do not change)
- PUT with missing required fields returns `500 Unknown server error` (KOReader client protocol, do not change)
- D1/SQLite does not enforce FOREIGN KEY constraints by default
- The project uses plain JavaScript (no TypeScript) with PicoCSS v2, Simple-DataTables, Day.js, and Chart.js v4 loaded via CDN

## License

This repository follows the LICENSE file included in the project root.