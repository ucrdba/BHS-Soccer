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
2. **Merge** the work to `main`, **then apply
   `supabase/migrations/0032_record_hand_added_columns.sql` to production** in
   the SQL editor. It is a no-op there — its header says so — but it keeps the
   two in step. Production is otherwise unaffected: it sets no `VITE_` variable
   and runs no demo SQL.

   Merging starts the workflow, because it watches its own file. Until the
   GitHub secrets in step 6 exist it fails at once with
   "DEMO_DATABASE_URL is not set." That is expected; nothing is touched.
3. **Put production's sign-up functions back on the demo project.** Until its
   first rebuild the demo still carries the old self-serve setup, whose
   sign-up trigger refuses new accounts once its visitor cap is reached
   (`DEMO_FULL`) and gives each account a program of its own. In the **demo**
   project's SQL editor, run the `handle_new_user()` definition from
   `supabase/migrations/0013_signup_without_email_confirmation.sql` and the
   `handle_user_confirmed()` definition from `supabase_migration_auth.sql` —
   the Rollback that `Resouces/SQL/demo/demo_auth_open.sql` describes at its
   end. Just the two `create or replace function` statements: the first
   rebuild replaces everything else. If the editor answers
   `42501: must be owner`, put `set role postgres;` on the line before.
4. **Turn off sign-ups on the demo project**: in the **demo** project,
   Authentication settings → turn off "Allow new users to sign up". Hiding the
   register tab in the app is not enough, since the published key can call
   sign-up directly. The account script uses the admin API, which still works;
   visitors only ever sign in.
5. **Create the nine sign-in accounts.** In `.env` (gitignored; see
   `.env.example`) set `DEMO_SUPABASE_URL`, `DEMO_SERVICE_ROLE_KEY` and
   `DEMO_PASSWORD`, then:

       node scripts/demo-create-accounts.mjs            # dry run
       node scripts/demo-create-accounts.mjs --confirm

   Every run ends by signing in to each of the nine with `DEMO_PASSWORD`, one
   line per account, and fails if any cannot. An account that cannot was
   registered by someone else or with another password — an old visitor of the
   self-serve demo, say — and the sign-in picker cannot open it either: delete
   it in Supabase → Authentication → Users and run the script again. (If the
   reason it prints is a rate limit, wait a few minutes instead.)
6. **GitHub → Settings → Secrets and variables → Actions**, add:
   - `DEMO_DATABASE_URL` — in the **demo** project: Connect → **Session pooler**
     (port 5432). Not the direct connection (IPv6 only, which GitHub's runners
     cannot reach) and not the transaction pooler (6543). The runner reads the
     string as a URL, so if the database password contains `#`, `/`, `?`, `@`
     or `:`, percent-encode it: `%23`, `%2F`, `%3F`, `%40`, `%3A`.
   - `DEMO_PROJECT_REF` — `nzelhvipofeqoteewvhg`.
7. **Vercel → `bhs-soccer-demo` → Settings**:
   - Environment variables: add `VITE_DEMO_PASSWORD` (the same password),
     remove `VITE_DEMO_EXPIRY_HOURS`. Keep `VITE_DEMO_MODE=true`,
     `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   - Git: set the production branch to `main`.
8. **Run it once by hand**: GitHub → Actions → *Rebuild the demo database* →
   Run workflow. Then do the smoke check below.
9. **Delete the `demo` branch**, locally and on GitHub. Nothing deploys from it
   any more.

## Smoke check after the first run

Sign in on the demo with **all nine** buttons in turn; each should open. Then,
as **Coach 1**, **Player** and **Admin**, do one of everything. Watch the
notice box: a `42703` ("column does not exist") means production has a column
no migration creates — the rebuilt demo lacks it.

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
  `scripts/demo-create-accounts.mjs --confirm`, then run the workflow.
- **`REFUSING TO REBUILD`** — the target looked like production. Check the two
  secrets first. Nothing was dropped.

  If both secrets are right, a school coded `bhs` or `lfc` has got into the
  demo. The demo refuses creating one, so this should not happen; if it has,
  run this in the demo project's SQL editor, then run the workflow:

      update public.schools set code = 'renamed-' || left(id::text, 8) where code in ('bhs', 'lfc');

- **`must be owner of table users`** (`42501`) — the rebuild re-creates its
  triggers on `auth.users`, and Supabase refused it. Nothing was changed and
  the previous demo stands. This needs a code change, not a retry.

To test a fix before merging, run the rebuild locally against a scratch
database — see Task 10, Step 8 of `docs/superpowers/plans/2026-09-11-demo-accounts.md`.

## Changing the shared password

The demo accounts are locked against password changes, and disabling the
trigger needs ownership of `auth.users`, which Supabase's `postgres` role does
not have. So the lock is replaced with one that lets everything through, and
the rebuild puts the real one back:

1. In the demo project's SQL editor:

       create or replace function public.demo_lock_auth_users() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$ begin return new; end $$;

2. Put the new password in `.env` as `DEMO_PASSWORD`, then:

       node scripts/demo-create-accounts.mjs --reset-passwords --confirm

   It sets the password on the nine and checks that each signs in with it.
3. Vercel → `bhs-soccer-demo` → `VITE_DEMO_PASSWORD` → the new password →
   redeploy.
4. Run the workflow. The rebuild re-creates the real lock.

Between 1 and 4 the lock is off for everyone, so do them together.

## Re-creating or deleting a demo account, after the first rebuild

- **Re-creating a missing one** needs only the script with `--confirm`, then
  the workflow. A new account has no copy until the next rebuild, and the
  profile lock leaves it alone until then; the rebuild builds it and locks it.
- **Deleting one** is refused by the profile lock: deleting the user deletes
  its profile. Replace the lock with a pass-through in the demo SQL editor,

      create or replace function public.demo_lock_profiles() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$ begin return case when tg_op = 'DELETE' then old else new end; end $$;

  delete the user in Authentication → Users, re-create it with the script, and
  run the workflow, which puts the lock back. The rebuild fails naming any of
  the nine that is missing, and the lock is off for everyone until it runs, so
  do these together.

## The schedule

The repository is public, so GitHub pauses scheduled workflows after 60 days
without repository activity. If the Actions tab says the schedule is disabled,
enable it there. Any push resets the clock.

## Rules that keep production safe

- Demo SQL lives in `Resouces/SQL/demo/`. It never goes in `supabase/migrations/`.
- Never set `VITE_DEMO_MODE` on the production Vercel project.
- Every demo SQL file refuses a database containing `bhs` or `lfc`, and the
  rebuild refuses any address containing production's ref. The demo refuses a
  visitor a school with either code, so the rebuild's guard cannot be tripped
  from inside it.
