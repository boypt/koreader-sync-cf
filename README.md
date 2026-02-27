# Koreader Position Sync (Cloudflare Workers)

A small Cloudflare Workers-based backend for synchronizing KOReader reading positions.

This repository provides a lightweight API intended to store and retrieve reading positions
for KOReader clients. It is designed to be deployed to Cloudflare Workers using `wrangler` or
via the Cloudflare dashboard.

[![Deploy to Cloudflare](https://img.shields.io/badge/Deploy%21to-Cloudflare-blue)](https://deploy.workers.cloudflare.com/?url=https://github.com/boypt/koreader-sync-cf)

## Contents

- `src/index.js` — Worker entrypoint
- `wrangler.toml` — Cloudflare Workers configuration
- `migrations/001_create_tables.sql` — Example schema for the backing store (if used)

## Quick overview

This project implements basic endpoints to save and fetch reading positions. It's intended
to be small and easy to run inside Cloudflare Workers (KV, D1, or external DBs may be used
as needed).

## Deploy options

1) One-click (Cloudflare dashboard)

- Click the button below to create a new Worker from this repository in your Cloudflare account:

[![Deploy to Cloudflare](https://img.shields.io/badge/Deploy%21to-Cloudflare-blue)](https://deploy.workers.cloudflare.com/?url=https://github.com/boypt/koreader-sync-cf)

2) CLI (wrangler)

Prerequisites:
- Node.js and `npm`
- `wrangler` (Cloudflare CLI). Install with `npm install -g wrangler` or run via `npx`.
- A Cloudflare account and an API token with `Workers` permissions.

Basic steps:

```bash
# install deps
npm install

# authenticate wrangler (if not already):
npx wrangler login

# publish the Worker
npx wrangler publish
```

`wrangler.toml` in this repository contains the configuration used for publishing. Adjust
environment variables and bindings in the file before publishing if necessary.

## Configuration & environment

- `wrangler.toml` contains the Worker name and account bindings.
- If you use a database (D1, Cloudflare KV, or external DB), configure credentials via
	environment variables and bind them in `wrangler.toml`.
- If you plan to run migrations, see `migrations/001_create_tables.sql` as an example schema.

## Local development

You can test locally with `wrangler dev`:

```bash
npx wrangler dev src/index.js
```

This opens a local preview of the Worker and forwards requests to `src/index.js`.

## License

This repository follows the LICENSE file included in the project root.

