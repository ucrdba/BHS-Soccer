# The demo database: rebuilt every night

The demo site (bhs-soccer-demo.vercel.app) runs `main`'s code against its own
Supabase project, `nzelhvipofeqoteewvhg`. A GitHub Actions job rebuilds that
database from `main`'s migrations every night and whenever a migration lands.
Visitors pick one of nine accounts; their changes last until the next rebuild.

Design: `docs/superpowers/specs/2026-09-11-demo-accounts-design.md`.

## Setting it up, once

1. **Check that production has migration 0027 before applying anything else.**
   Probe the one column it adds:
   `curl -s "$URL/rest/v1/soccer_categories?select=school_id&limit=1" -H "apikey: $ANON_KEY"`.
   An answer with code `42703` means the column is missing: apply
   `supabase/migrations/0027_scope_soccer_categories.sql` first (CLAUDE.md,
   "Drill categories belong to an organization"), because the app on `main`
   reads that column and shows every category list empty without it.
2. **Merge** the work to `main`. Production is unaffected: it sets no `VITE_`
   variable and runs no demo SQL.
3. **Create the nine sign-in accounts.** In `.env` (gitignored; see
   `.env.example`) set `DEMO_SUPABASE_URL`, `DEMO_SERVICE_ROLE_KEY` and
   `DEMO_PASSWORD`, then:

       node scripts/demo-create-accounts.mjs            # dry run
       node scripts/demo-create-accounts.mjs --confirm

4. **GitHub → Settings → Secrets and variables → Actions**, add:
   - `DEMO_DATABASE_URL` — in the **demo** project: Connect → **Session pooler**
     (port 5432). Not the direct connection (IPv6 only, which GitHub's runners
     cannot reach) and not the transaction pooler (6543).
   - `DEMO_PROJECT_REF` — `nzelhvipofeqoteewvhg`.
5. **Vercel → `bhs-soccer-demo` → Settings**:
   - Environment variables: add `VITE_DEMO_PASSWORD` (the same password),
     remove `VITE_DEMO_EXPIRY_HOURS`. Keep `VITE_DEMO_MODE=true`,
     `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   - Git: set the production branch to `main`.
6. **Run it once by hand**: GitHub → Actions → *Rebuild the demo database* →
   Run workflow. Then do the smoke check below.
7. **Delete the `demo` branch**, locally and on GitHub. Nothing deploys from it
   any more.

## Smoke check after the first run

Sign in on the demo as **Coach 1**, **Player** and **Admin** in turn and do one
of everything. Watch the notice box: a `42703` ("column does not exist") means
production has a column no migration creates — the rebuilt demo lacks it.

- Planner: open a plan, move a drill, save.
- Live match: start the clock, record a substitution, stop the clock.
- Matrix: record a 1v1 result and a session result.
- Player: read the daily thought, take the quiz.
- Admin: open the organization profile, change the colour, save.

If one fails with `42703`, record the column in a new migration with
`add column if not exists` (as `0032_record_hand_added_columns.sql` did for
three), apply it to production (a no-op there), and let the rebuild pick it up.

## When the rebuild fails

The run shows red in GitHub, and GitHub emails whoever owns the workflow. The
database is untouched: the whole rebuild is one transaction.

The log names the failing step. The usual causes:

- **A migration cannot run on an empty database** — typically a data change
  aimed at Beaumont's rows, by name or by UUID. Add it to `SKIP` in
  `scripts/demo-rebuild-lib.mjs` with its reason, or, if only one statement in
  an otherwise structural file is the problem, to `CUTS`.
- **`the sign-in account demoN@demo.invalid is missing`** — re-run
  `scripts/demo-create-accounts.mjs --confirm`.
- **`REFUSING TO REBUILD`** — the target looked like production. Check the two
  secrets. Nothing was dropped.

To test a fix before merging, run the rebuild locally against a scratch
database — see Task 10, Step 8 of `docs/superpowers/plans/2026-09-11-demo-accounts.md`.

## Changing the shared password

The demo accounts are locked against password changes, so lift the lock first.
In the demo project's SQL editor:

    alter table auth.users disable trigger demo_lock_auth_users;

Then set the new password on the nine accounts through the Supabase dashboard
(Authentication → Users), change `VITE_DEMO_PASSWORD` in Vercel and redeploy,
and run the workflow — the rebuild recreates the trigger, enabled.

## Rules that keep production safe

- Demo SQL lives in `Resouces/SQL/demo/`. It never goes in `supabase/migrations/`.
- Never set `VITE_DEMO_MODE` on the production Vercel project.
- Every demo SQL file refuses a database containing `bhs` or `lfc`, and the
  rebuild refuses any address containing production's ref.
