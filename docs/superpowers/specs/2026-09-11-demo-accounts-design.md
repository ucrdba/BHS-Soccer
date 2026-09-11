# Demo accounts and a nightly rebuild

**Status:** approved design, ready for an implementation plan
**Date:** 2026-09-11
**Supersedes:** the demo-site parts of `2026-09-04-browser-testing-and-demo-site-design.md`
(self-serve accounts, the visitor cap, the 48-hour expiry, deploying from a `demo`
branch), and the signup hook in `2026-09-05-demo-seed-data-design.md`. That spec's
**template content** still stands, with the two changes in §5.4.

## 1. The problem

The demo is a second Supabase project with its own database, deployed from its own
`demo` branch. Keeping it in step with production has failed on both fronts:

- **The code.** `demo` split from `main` on 2026-09-04 and is now 250 commits behind.
  A dry run of merging `main` into it hits four real conflicts, because the demo's
  warning and credential handling were hooked into the framework-free app that `main`
  has since deleted.
- **The database.** The demo runbook's standing rule is *"Every migration is applied
  twice, by hand, forever."* Nothing does the second application. The generator
  (`npm run demo:schema`) only rebuilds a from-scratch file; the running demo database
  gets whatever someone remembers to paste into its SQL editor.

And the visitor machinery is half built: `demo_seed.sql` holds the cloning code but no
sample program, and the 48-hour sweep (`demo_expire.sql`) was never written.

## 2. What was decided

| Question | Decision |
| --- | --- |
| One shared database, or keep the demo separate? | **Separate**, rebuilt every night from the current migrations (§3 says why not shared) |
| How many accounts? | **Nine fixed accounts**, `demo1@demo.invalid` … `demo9@demo.invalid` — no self-serve signup |
| What can they do? | demo1–demo7 **coaches**, demo8 a **player**, demo9 an **admin** |
| Shared program or one each? | **One copy of the sample program per account**; visitors never see each other's edits |
| How does a visitor get in? | **Pick an account** on the demo's sign-in screen; one click, no typing |
| How often is it restored? | **Every night**, and whenever a migration or the demo SQL changes on `main` |
| How many codebases? | **One — `main`.** Both Vercel projects build it; the `demo` branch is deleted |

## 3. Why the demo users are not in the production database

Putting demo1–demo9 into production, flagged as demo, was the first idea. It would
remove the second database entirely. It was rejected on evidence found while
designing, not on principle:

- **Any signed-in coach can read every profile**, across every organization.
  `profiles_select` (last defined in `supabase/migrations/0001_tighten_profiles_select.sql`)
  checks the role, not the organization. The declared schema gives `profiles` an
  `email` column.
- **Any coach or admin can write any organization's row and drill bank.**
  `supabase_migration_auth.sql` creates `<table>_write` policies in a loop that check
  only `current_profile_role() in ('coach','admin')`. Later migrations narrowed many
  tables to `is_team_coach(team_id)`, but not `schools` (0026 says so in a comment)
  and not `drills_bank` (0009 says so). `players`, `schedule`, `coaches` and
  `quiz_questions` showed no replacement under the original names and need checking.

Demo logins are public by design. In production they would hand both gaps to anyone
who reads the sign-in screen, next to real players who are minors — and the nightly
restore would be deleting production rows, protected only by a filter.

Both gaps are production bugs regardless of the demo, and are separate tasks:
*Scope profile reads to the coach's own organization* and *Scope write policies to the
writer's own organization*. Once they land, demo users in production become far less
risky and the question can be reopened; the restore deleting production rows would
remain the main objection.

## 4. One codebase on `main`

Demo mode is already a build-time switch rather than a code branch, so the demo needs
no branch of its own. Both Vercel projects build the same commit of `main`:

| | Production (`bhs-soccer`) | Demo (`bhs-soccer-demo`) |
| --- | --- | --- |
| Address | bhssoccer.org | bhs-soccer-demo.vercel.app |
| Database | `arsigevpgpbqluqbnhjr` | `nzelhvipofeqoteewvhg` |
| `VITE_DEMO_MODE` | not set | `true` |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | not set — the hardcoded production project | the demo project |
| `VITE_DEMO_PASSWORD` | not set | the shared demo password |

### 4.1 Brought over from the `demo` branch

Each with its test, rewritten where it hooked into the old app:

- **`src/data/credentials.ts`** — adds the build-time `VITE_SUPABASE_*` step to
  credential resolution, below `window.ENV` and above the `localStorage` override.
  Production sets no `VITE_` variable, so it resolves exactly as today.
- **`src/data/anon-key.ts`** — accepts Supabase's `sb_publishable_…` key format, which
  the demo project uses.
- **`src/demo.ts`** — demo mode is on only when `VITE_DEMO_MODE` is exactly `'true'`;
  every other value, including unset, fails closed. The expiry setting is removed.
- These three touch `src/data/supabase.ts`, which conflicts with `main` (the `report()`
  failure funnel landed there since). `main`'s structure wins and the credential step is
  reapplied on top.

### 4.2 The warning

`src/components/layout/DemoNotice.vue`, mounted in `src/App.vue` above the header, only
in demo mode. Not dismissible and with no close control: a visitor who hides it can
spend an hour believing the roster is real. Styled with the ground tokens — the warning
stripe the load-error box already uses — and no literal white (`src/design-tokens.test.ts`).

> Demo site. Everything here is made up, and it's restored every night. Change anything
> you like.

No time of day: GitHub schedules in UTC, so any stated hour would be wrong for half the
year.

### 4.3 The account picker

In demo mode, `src/components/auth/AuthModal.vue` replaces its sign-in form with nine
buttons, each saying what that role sees:

- **Coach 1 … Coach 7** — the full command centre: Matrix, planner, diagrams, lineup,
  live match.
- **Player** — the squad's side: the daily thought and the quiz.
- **Admin** — the organization profile, colours, logo, photo, import and export.

One click signs in as `demoN@demo.invalid` with `VITE_DEMO_PASSWORD`. Registration is
hidden, and sign-ups are turned off on the demo project too (§8), because the published
key could otherwise call sign-up directly. The password is in the demo's JavaScript and must be treated as public; that is
acceptable only because the demo database holds nothing real and the accounts are
locked (§6.2).

### 4.4 Not brought over

- `public/js/admin.js` and the `src/main.ts` hook — the deleted framework-free app. The
  component replaces the hook.
- `demo_auth_open.sql`'s self-serve signup, `demo_new_org`, the visitor cap and the
  48-hour sweep — replaced by the fixed accounts. `demo_auth_open.sql` stays in the repo
  only because the test harness loads it by default; taking it out of the harness is a
  separate tidy-up.
- `scripts/build-demo-schema.mjs` — the rebuild reads the migrations directly (§5.3), so
  there is no generated file to maintain. `Resouces/SQL/demo/demo_schema.sql` stays as
  the test harness's frozen baseline, which the migration tests rely on (they assert a
  column is absent *before* its migration).

## 5. The nightly rebuild

### 5.1 When it runs

`.github/workflows/demo-rebuild.yml`, the repository's first workflow:

- **Nightly** at `0 10 * * *` (10:00 UTC — 3 am Pacific in summer, 2 am in winter).
- **On push to `main`** touching `supabase/migrations/**`, `Resouces/SQL/demo/**`,
  `scripts/demo-rebuild.mjs` or the workflow itself — so a migration reaches the demo
  the moment it lands, and the demo's code and schema are never a day apart.
- **By hand** — `workflow_dispatch`, the "Run workflow" button.
- `concurrency: demo-rebuild` so two runs never overlap; `permissions: contents: read`.

Two repository secrets, never in the code:

| Secret | Value |
| --- | --- |
| `DEMO_DATABASE_URL` | the demo project's **Session pooler** connection string (port 5432). Not the direct connection — GitHub's runners are IPv4-only and Supabase's direct connection is IPv6 unless the paid add-on is bought. Not the transaction pooler (6543), which does not support what the rebuild does. |
| `DEMO_PROJECT_REF` | `nzelhvipofeqoteewvhg` |

### 5.2 The accounts are created once, and kept

The nine sign-in accounts live in Supabase's `auth.users`, which the rebuild never
drops or rewrites. Writing directly into `auth.users` depends on GoTrue's internal
layout (the `auth.identities` table, for one), which Supabase changes between
versions; creating users through the Admin API does not.

So `scripts/demo-create-accounts.mjs` creates them **once**, run locally at setup with
the demo project's service-role key from a local, git-ignored `.env` — never stored in
GitHub. It creates any of `demo1…demo9@demo.invalid` that is missing, already
confirmed, with the shared password. Re-running it is harmless.

The rebuild looks the nine up by email and **fails loudly if any is missing**.

### 5.3 What `scripts/demo-rebuild.mjs` does

Node, using the `pg` package the database tests already use. Everything after the
guards runs in **one transaction**: if any step fails it all rolls back and last night's
demo stays up, never half-built.

1. **Refuse the wrong database — three independent checks, before anything is deleted:**
   - the connection string must contain `DEMO_PROJECT_REF`;
   - it must **not** contain production's ref, `arsigevpgpbqluqbnhjr` (already public in
     `src/data/supabase.ts`), whatever the other secret says;
   - no organization with code `bhs` or `lfc` may exist — the guard `demo_seed.sql`
     already uses.
2. **Wipe.** Drop the `public` schema with everything in it and recreate it with
   Supabase's standard grants (`anon`, `authenticated`, `service_role`, default
   privileges). `auth.users` and Supabase's other schemas are untouched.
3. **Schema from today's migrations.** Apply `supabase_schema.sql`, `schema_roles.sql` and
   `supabase_migration_auth.sql`, then every file in `supabase/migrations/` in number
   order, read fresh on each run. Each file's own `begin;` / `commit;` lines are stripped,
   as the migration tests already do. The demo generator's three rules come across
   with it — a rehearsal on a fresh Postgres on 2026-09-11 applied every file only with
   all three in place:
   - **Skip** three files, with the generator's reasons:
     - `0006_move_club_teams_to_legends_fc.sql` — data; moves teams named by production UUIDs.
     - `0007_assign_coaches_to_club_teams.sql` — data, and it raises when its coach is absent.
     - `0012_set_drill_weights.sql` — data; weights on Beaumont's drills.
   - **Cut** one statement from `0005_multi_team_schema.sql`: the insert of Beaumont's
     Varsity team by its literal school UUID, which is a foreign-key violation (`23503`)
     on an empty database and aborts the migration. The cut must match exactly once, so
     an edit to 0005 fails the rebuild loudly rather than silently doing nothing.
   - **Reconcile** straight after `supabase_schema.sql`: drop `drills_bank.duration` and
     `soccer_categories.school_id`, which the provisioning script declares and production
     never had (0027 later adds `soccer_categories.school_id` back, deliberately). Without
     the first, 0009's self-check insert fails on `duration`'s `NOT NULL`.
   Production also has columns **no migration creates**, added by hand. A read of one
   production row per publicly readable table on 2026-09-11 found `practice_plans.drill`
   (the planner writes it on every save) and `soccer_categories.display_order` and
   `active`. A new migration records them with `add column if not exists` — a no-op on
   production, and what makes a database built from migrations match it. Nine tables had
   no readable row (`daily_thoughts`, `stat_events`, `profiles` among them), so the first
   demo run ends with a smoke check that saves one of everything (§8).
4. **The sample program** — `Resouces/SQL/demo/demo_seed.sql` (§5.4).
5. **Nine copies** — `demo_clone_org` once per account (§5.5).
6. **Link the accounts** — `Resouces/SQL/demo/demo_accounts.sql` (§5.6).
7. **Lock the accounts** — the same file (§6.2).
8. **Tell the API.** `notify pgrst, 'reload schema'`, delivered on commit, so Supabase's
   REST API serves the rebuilt tables rather than its cached picture of the old ones.

### 5.4 The sample program

`demo_seed.sql` today holds the production guard, the clone manifest, the deep clone and
a signup hook, **but no content**. The content is the largest piece of this work.

It is **Riverside High School Hawks**, exactly as `2026-09-05-demo-seed-data-design.md`
§"The template's content" describes: a Varsity and a JV team, 38 players with recording
numbers assigned as a contiguous block per squad, a part-played season with results,
plus/minus for four matches with real rotation and low-minute players, Matrix sessions
and head-to-head history, 12 drills of which 3 carry `diagram_data` **captured from the
real board's serialize output**, two practice plans, three daily thoughts (one active),
and a quiz with answers and attempts.

One correction to that spec's Matrix drills: the database allows **five** measures
(`head_to_head`, `win_loss`, `count_high`, `time_low`, `time_bands`), so the template has
one Matrix drill per measure. The match-readiness bands (`drill_time_bands`) belong to the
**`time_bands`** drill — the standard — not to `time_low`, which ranks a sprint relatively.

Two changes to that spec:

- **Every date is relative to the rebuild.** A nightly rebuild runs for months; seeded
  with fixed September dates, the "half-played season" would be entirely in the past by
  December. The seed takes an *as of* date — the rebuild's date in Pacific time — and
  places the completed fixtures (10 Varsity, 7 JV) in the weeks before it and the
  upcoming ones (6 and 5) in the weeks after. Plus/minus, Matrix sessions, attempts and
  thoughts follow the same rule. The text columns `match_date` / `match_time` are still
  what the seed writes; migration 0008's trigger derives the rest.
- **Drill categories belong to an organization now.** Migration 0027 gave
  `soccer_categories` a `school_id`, so the template carries its own categories and the
  clone manifest gains `soccer_categories` (scoped by `school_id`). The seed spec's note
  that categories are global and must not be cloned no longer holds.

The template organization stays in the database as the clone source. No account belongs
to it; it is marked in a small demo-only `demo_orgs` table (`kind` `'template'` or
`'account'`, and `account_no` 1–9). `demo_seed.sql` creates that table itself, first,
because `demo_auth_open.sql` — which used to — is no longer applied, and the seed must
record the template before anything clones it.

### 5.5 Nine copies

`demo_clone_org` already exists and reads each table's columns from the catalog at run
time, so a migration that adds a column is cloned without an edit. It runs nine times.
Each copy keeps the name **Riverside High School**, so each visitor's program reads
naturally, with codes `demo1` … `demo9`. The template's code is `demo-template`.
(Production's public read rules mean a list of all organizations, such as the admin's,
will show the other copies. That is honest about how the product works and harmless
here.)

### 5.6 Linking the accounts

`demo_accounts.sql` writes each profile directly rather than relying on the sign-up
trigger, which is production's and would attach a new user to `'bhs'` as a pending
guest:

- **demo1–demo7** — role `coach`, status `active`, their copy's `school_id`, and a
  `team_coaches` row for both teams in their copy.
- **demo8** — role `player`, status `active`, `player_id` set to a Varsity player in its
  copy, so the active daily thought and the quiz are theirs.
- **demo9** — role `admin`, status `active`, its copy's `school_id`.

## 6. Safety, and what happens when it fails

### 6.1 Production stays out of reach

Three separate things, any one of which would stop an accident:

- **Nothing real is in the demo.** Its logins are public for that reason.
- **Demo SQL never becomes a migration.** Everything demo-only lives in
  `Resouces/SQL/demo/` and must never be copied into `supabase/migrations/`, which is
  production's. Every demo SQL file refuses to run on a database containing `bhs` or
  `lfc`, and the rebuild adds the two connection checks in §5.3.
- **The demo code is inert on production.** It switches on only with
  `VITE_DEMO_MODE=true`, which production's Vercel project never sets.

### 6.2 Visitors cannot lock each other out

- **Sign-in.** A demo-only trigger on `auth.users` refuses any change to a demo
  account's password or email, so a visitor calling Supabase's auth API from the
  browser console cannot lock out the next one.
- **Profiles.** A demo-only trigger on `public.profiles` refuses changes to the nine
  demo profiles' `role`, `status`, `school_id`, `player_id` and `is_deleted`.
  Production's `profiles_update` lets any admin edit any profile, so without it demo9
  could demote or remove the other eight.
- Both triggers let the rebuild itself through: it sets `demo.rebuilding = 'on'` with
  `set local`, which the triggers check.

### 6.3 Accepted until production is fixed

Production's write rules let a coach of any organization edit organization rows and
drill banks (and possibly fixtures, players, coaches and quiz questions — §3). In the
demo, that means one visitor could rename or recolour another visitor's copy. **No
demo-only guard is added for this.** The demo is meant to behave exactly as production
does; the fix belongs in production, and the demo inherits it the night after it lands.
Until then the nightly restore bounds any damage to a day.

### 6.4 When something fails

- **The rebuild fails.** The transaction rolls back and yesterday's demo stays up. The
  run shows red in GitHub, and GitHub emails the person who owns the workflow.
- **A migration cannot run on the demo** — typically a data change aimed at Beaumont's
  rows. The run fails naming the file. The fix is to add it to the skip list with its
  reason, as for 0006, 0007 and 0012.
- **An account is missing** from `auth.users`. The run fails naming it; re-run
  `scripts/demo-create-accounts.mjs`.
- **Order of migrations.** Production keeps its rule of applying a migration before the
  code that needs it. The demo gets the migration when it lands on `main`, which is
  never later than the code that needs it, since both arrive in the same push.

## 7. Testing

### 7.1 Database tests

Real Postgres through `src/data/testdb/`. The rebuild builds its SQL with one exported
function; the tests run that same SQL in a scratch database (`setupDb([])`, prelude only),
so the tests and the rebuild cannot disagree. The test inserts nine stand-in
`auth.users` rows first, as the accounts script would have created them.

- **It runs cleanly, and twice.** A second run leaves exactly nine accounts linked to
  nine copies, not eighteen.
- **Each copy is separate.** No row of one copy references a row of another; each
  profile points at its own copy with the right role; demo8's `player_id` is a Varsity
  player in its copy; each copy's row counts equal the template's.
- **The season is always half-played.** The seed is built *as of* a date in September,
  December and June, and each time some fixtures are completed with scores and some are
  still to come.
- **The locks hold.** A change to a demo account's password or email is refused; demo9
  cannot change demo1's role or status; the rebuild itself can still reset them.
- **The guards refuse production.** A database containing `bhs` or `lfc` is refused
  before anything is dropped; a connection string containing production's ref is refused
  even when `DEMO_PROJECT_REF` is wrong.
- **The skip list cannot go stale.** Every entry names a migration that exists.
- **The clone manifest covers categories.** `soccer_categories` is cloned per copy.

### 7.2 App tests

- The `demo` branch's tests for credentials, the key format and the flag, carried over.
- `DemoNotice` renders only when the flag is exactly `'true'`, with the text above and
  no close control.
- `AuthModal` in demo mode shows nine buttons labelled by role; Coach 3 signs in as
  `demo3@demo.invalid` with the build's password; registration is hidden. With the flag
  off, every existing sign-in test passes unchanged.

All three gates, judged by exit code, as everywhere in this repository.

## 8. The order of the work, and going live

The work is done on a feature branch; `main` is touched only by the merge.

1. The demo code onto `main` (§4).
2. The migration recording production's hand-added columns (§5.3), tested against Postgres.
3. The sample program — the largest piece (§5.4).
3. The accounts, the links and the locks (§5.2, §5.6, §6.2).
4. The rebuild script and the workflow (§5.1, §5.3).
5. Documentation: a new demo runbook replacing the "applied twice, by hand" rule; a
   CLAUDE.md note that the demo database is rebuilt from `main`'s migrations nightly and
   on every migration push, that `VITE_DEMO_MODE` must never be set on production, and
   that demo SQL lives in `Resouces/SQL/demo/`; "superseded" notes at the top of the two
   older demo specs.

Going live, in this order, all by the owner:

1. **Merge.** Production is unaffected — no flag, no migration.
2. **Turn off sign-ups on the demo project** (Authentication → "Allow new users to sign
   up"). The account script uses the admin API, which still works; visitors only sign in.
3. **Create the accounts once**: run `scripts/demo-create-accounts.mjs` locally with the
   demo project's service-role key and the shared password.
4. **GitHub**: add `DEMO_DATABASE_URL` (Session pooler) and `DEMO_PROJECT_REF`.
5. **Vercel, the `bhs-soccer-demo` project**: add `VITE_DEMO_PASSWORD`, remove
   `VITE_DEMO_EXPIRY_HOURS`, and switch its production branch to `main`.
6. **Run the workflow once by hand.** Sign in as Coach 1, Player and Admin; the band, the
   Matrix and the quiz should all have data.
7. **Delete the `demo` branch**, locally and on GitHub.

## 9. Out of scope

- Fixing production's cross-organization read and write rules (§3) — the two separate
  tasks.
- Removing `demo_auth_open.sql` from the test harness's default file list.
- Photo uploads for the demo organizations; the copies show the colour band.
