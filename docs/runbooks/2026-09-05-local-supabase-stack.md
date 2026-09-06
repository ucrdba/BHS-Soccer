# Running Supabase locally

**Date:** 2026-09-05
**Why:** `src/data/testdb/` tests SQL against a bare Postgres, which cannot exercise `src/data/supabase.ts`. That client speaks HTTP to **PostgREST** (queries) and **GoTrue** (auth), so proving it sends the right thing needs the whole stack — and the Supabase CLI only runs it in containers.

This is the largest untested seam in the Vue migration: every write in the app goes through that client, and nothing currently verifies that what it sends matches what the schema expects.

## What you need

| | Status on this machine |
| --- | --- |
| WSL 2 | ✅ installed, Ubuntu, default version 2 |
| Hardware virtualization | ✅ enabled |
| winget | ✅ 1.29.290 |
| Supabase CLI | ✅ 2.111.0 |
| Docker Desktop | ⬅ **the only missing piece** |

## 1. Install Docker Desktop

```powershell
winget install --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
```

Then:

1. **Launch Docker Desktop once from the Start menu.** The installer does not start it, and the CLI cannot talk to a daemon that has never run.
2. Accept the licence, and choose the **WSL 2 backend** when offered — it is the default and the faster option given WSL 2 is already here.
3. **A sign-out or reboot is usually required** so your account picks up the `docker-users` group. If `docker version` reports the client but not the server, that is what it is telling you.

Verify:

```powershell
docker version          # both Client and Server sections must appear
docker run --rm hello-world
```

## 2. Initialize the project

The repo has `supabase/migrations/` but **no `supabase/config.toml`** — it has never been initialized locally, and `supabase start` needs one.

```bash
supabase init
```

Answer no to generating VS Code settings unless you want them. This writes `supabase/config.toml` and leaves the existing migrations alone.

## 3. Start the stack

```bash
supabase start
```

First run pulls several GB of images and takes a while. When it finishes it prints the values you need:

```
         API URL: http://127.0.0.1:54321
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
         anon key: eyJ...
  service_role key: eyJ...
```

Note that the **local Postgres is on 54322**, not 5432 — the 5432 instance is the separate local server `src/data/testdb/` already uses. They do not conflict, and they are not the same database.

## 4. Apply the schema

```bash
supabase db reset
```

This drops the local database and replays everything in `supabase/migrations/` in order. **Check what it produces before trusting it:** those migrations were written against a database that already had `supabase_schema.sql` applied by hand, so a replay from empty may not reproduce the live shape. If it does not, apply `Resouces/SQL/demo/demo_schema.sql` instead, which is the self-contained one the `testdb` harness already uses:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f Resouces/SQL/demo/demo_schema.sql
```

## 5. Point the app at it

Credentials resolve in this order (`src/data/supabase.ts:35`):

1. `window.ENV_SUPABASE_URL` / `window.ENV_SUPABASE_ANON_KEY`
2. `localStorage['bhs_supabase_url']` / `localStorage['bhs_supabase_anon_key']`
3. a hardcoded cloud project

So in the browser console on `/app.html`, with the values `supabase start` printed:

```js
localStorage.setItem('bhs_supabase_url', 'http://127.0.0.1:54321');
localStorage.setItem('bhs_supabase_anon_key', '<the anon key>');
location.reload();
```

To go back to the cloud project, remove both keys and reload.

**Never commit the local anon key as a default.** It is harmless in itself, but a committed default is one somebody's deployment eventually picks up.

## 6. What this then makes testable

With the stack running, a test can point `supabaseService` at `127.0.0.1:54321` and assert what the app has so far only been able to assume:

- that `upsertTeamMembership` writes the columns the schema expects, rather than silently no-op'ing on a mismatch
- that a write refused by RLS is reported to the caller rather than swallowed
- that `fetchTeamRoster`'s nested `players(...)` join returns the shape `toPlayer` maps
- that a coach's writes are scoped by `is_team_coach()` and another organization's are refused
- that signing up really does land in the pending-approval state the UI describes

Those are the assertions the migration is currently missing.

## Stopping

```bash
supabase stop           # leaves the data
supabase stop --no-backup   # discards it
```

Docker Desktop can be set not to start with Windows, in its settings, if you would rather run it only when needed.

## If it will not start

- **`docker: command not found`** after installing — Docker Desktop has not been launched, or the shell predates the PATH change. Open a new terminal.
- **"cannot connect to the Docker daemon"** — the daemon is not running. Launch Docker Desktop and wait for the whale icon to stop animating.
- **A port is already in use** — something else holds 54321–54327. `supabase stop` then `supabase start` usually clears a stale set of containers.
- **WSL 2 errors** — `wsl --update`, then restart Docker Desktop.
