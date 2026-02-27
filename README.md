# Koreader Position Sync (Cloudflare Workers)

A Cloudflare Workers-based backend for KOReader Progress Sync.

[![Deploy to Cloudflare](https://img.shields.io/badge/Deploy%21to-Cloudflare-blue)](https://deploy.workers.cloudflare.com/?url=https://github.com/boypt/koreader-sync-cf)

## Contents

- `src/index.js` — Worker entrypoint
- `wrangler.toml` — Cloudflare Workers configuration
- `migrations/001_create_tables.sql` — Example schema for the backing store (if used)

## Deploy options

- Click the button below to create a new Worker from this repository in your Cloudflare account:

[![Deploy to Cloudflare](https://img.shields.io/badge/Deploy%21to-Cloudflare-blue)](https://deploy.workers.cloudflare.com/?url=https://github.com/boypt/koreader-sync-cf)

`wrangler.toml` in this repository contains the configuration used for publishing. Adjust
environment variables and bindings in the file before publishing if necessary.

## Configuration (Optional)

- `RECEIVE_RANDOM_DEVICE_ID`: Default False.
Set it true to retrieve always a random device id to force a progress sync. This is usefull if you only sync your progress from one device and usually delete the *.sdr files with some cleaning tools.

- `OPEN_REGISTRATIONS`: Default True.
Enable/disable new registrations to the server. Useful if you want to run a private server for a few users, although it doesn't necessarily improve security by itself. Set to True (enabled) by default.

This opens a local preview of the Worker and forwards requests to `src/index.js`.

## License

This repository follows the LICENSE file included in the project root.

