# Koreader Position Sync (Cloudflare Workers)

A small Cloudflare Workers-based backend for synchronizing KOReader reading positions.

This repository provides a lightweight API intended to store and retrieve reading positions
for KOReader clients. It is designed to be deployed to Cloudflare Workers using `wrangler` or
via the Cloudflare dashboard.

Repository: https://github.com/boypt/koreader-sync-cf

![Deploy to Cloudflare Workers](https://img.shields.io/badge/Deploy%20to-Cloudflare%20Workers-orange)

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

[![Deploy to Cloudflare](https://img.shields.io/badge/Deploy%20to-Cloudflare-blue)](https://dash.cloudflare.com/?to=/:account/workers/new&template=https://github.com/boypt/koreader-sync-cf)

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

3) CI / GitHub Actions (recommended for automatic deploys)

Create a GitHub Actions workflow that runs `wrangler publish` on push to your main branch.
Set the following repository secrets: `CF_API_TOKEN` and `CF_ACCOUNT_ID`.

Example `.github/workflows/deploy.yml` snippet:

```yaml
name: Deploy to Cloudflare Workers

on:
	push:
		branches: [ main ]

jobs:
	deploy:
		runs-on: ubuntu-latest
		steps:
			- uses: actions/checkout@v4
			- name: Install Node.js
				uses: actions/setup-node@v4
				with:
					node-version: '18'
			- name: Install dependencies
				run: npm ci
			- name: Publish to Cloudflare
				env:
					CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
					CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
				run: npx wrangler publish --api-token "$CF_API_TOKEN"
```

Note: adjust the workflow to your project structure and test steps. You can also use the
official [cloudflare/wrangler-action] for publishing.

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

## Usage

The API is small and documented inline in `src/index.js`. Typical operations:
- POST /position — save or update a reading position
- GET /position?user=...&book=... — fetch latest position for a user/book

Adjust endpoints and authentication according to your needs.

## Contributing

Contributions are welcome. Please open issues or pull requests against the GitHub repository:
https://github.com/boypt/koreader-sync-cf

## License

This repository follows the LICENSE file included in the project root.

