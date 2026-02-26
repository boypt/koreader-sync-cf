Cloudflare Worker port of koreader-sync

Files added:
- wrangler.toml — Worker config and D1 binding.
- src/index.js — Worker HTTP handler using D1 via `env.KOSYNC_DB`.
- migrations/001_create_tables.sql — SQL to create `users` and `documents` tables.

Quick deploy steps:

1. Install Wrangler: `npm install -g wrangler`
2. Create a D1 database in Cloudflare dashboard and note the database name.
3. Update `wrangler.toml` if you need to change the binding name or project name.
4. Bind the D1 database in your Cloudflare account to the `KOSYNC_DB` binding.
5. Apply the migration (using `wrangler d1` CLI):

```bash
# create a migration in your project if needed, or apply the SQL via D1 tooling
wrangler d1 migrations apply --database kosync migrations/001_create_tables.sql
```

6. Publish the worker:

```bash
wrangler publish
```

Notes:
- The Worker reads env vars `OPEN_REGISTRATIONS` and `RECEIVE_RANDOM_DEVICE_ID` from the environment.
- The D1 binding name used in code is `KOSYNC_DB`.
