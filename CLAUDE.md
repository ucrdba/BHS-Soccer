# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A single-page web app for high-school and club soccer programs — Beaumont High School (CA) is the first organization, not the only one: public roster/schedule hub plus a coach-only command center (Anson Dorrance "Competitive Matrix" player ranking, practice planner, canvas tactical diagrammer, XLSX import/export).

**It is mid-migration to Vue.** The app that ships is still the framework-free one — plain classes rendering HTML template strings into `#mainAppContainer` — and a Vue rebuild is being built alongside it. See "Two apps, two entry points" below, and `docs/superpowers/specs/2026-09-05-vue-migration-design.md` for the strategy and its phases. Backend is Supabase (Postgres + Auth + RLS), which is the source of truth: `loadData()` returns empty collections, `saveData()` is a no-op, and `syncFromSupabase()` populates app state from Postgres on boot. When Supabase is not configured, the app runs with empty data rather than falling back to localStorage.

`walkthrough.md` and `implementation_plan.md` are the original product spec and verification notes. They are still broadly accurate about *features*, but predate the refactors below — do not trust them for file layout.

## Commands

```bash
npm run dev        # vite dev server, opens browser
npm run build      # vue-tsc (typecheck) + vite build -> dist/ (both entry points)
npm run typecheck  # vue-tsc --noEmit over src/ only (components included)
npm test           # vitest — 2,711 tests, config in vitest.config.mts
npm run preview    # serve dist/

powershell -File check_syntax.ps1   # node --check every file under public/js/ (22 of them)
```

Verification is a four-part story, and each part covers a different slice of the code:

- `npm test` — Vitest unit tests (2,711 tests across 140 files), including Vue component and database tests.
- `npm run typecheck` — `vue-tsc --noEmit` over `src/` **only**, single-file components included; it does not see `public/js/`.
- `node --check <file>` (or `check_syntax.ps1`, which runs it over every file under `public/js/`) — the syntax gate for the classic scripts, since typecheck doesn't reach them.
- `npm run build` — **mandatory**, and the only check that exercises real module resolution. `npm run typecheck` and `npm test` can both pass while an import is unresolvable at bundle time; only a real build catches that.

### Database tests

`src/data/testdb/` runs SQL against a **real Postgres**, because constraints, partial indexes and triggers cannot be proved by asserting on a file's text. `setupDb()` builds a uniquely-named scratch database, applies `src/data/testdb/prelude.sql` and then `Resouces/SQL/demo/demo_schema.sql`, and `withDb()` wraps each test in a transaction that is always rolled back.

The connection resolves as `TEST_DATABASE_URL` → a gitignored `.env.test` at the repo root → `postgres://postgres:postgres@localhost:5432/postgres`. **`hasTestDb()` returns false when nothing answers, and the suites `describe.skipIf` off it**, so a machine with no Postgres still runs everything else rather than reporting a wall of red.

`src/data/testdb/supabase-client.test.ts` goes further and tests `src/data/supabase.ts` itself against a **full local Supabase stack** — PostgREST and GoTrue, not just Postgres. It needs `supabase start` (see `docs/runbooks/2026-09-05-local-supabase-stack.md`) and skips when the stack is not answering.

Note the two are separate databases: the harness uses the standalone Postgres on **5432**, and the CLI stack runs its own on **54322** behind the API on **54321**.

`npm run dev` serves the app correctly — do not serve the repo root statically. `index.html` loads `./src/main.ts` as an ES module (no browser executes a `.ts` file directly), and everything under `./js/*` resolves only through Vite's `publicDir` mapping to `public/js/`. Use `npm run dev` to run the app locally.

## Two apps, two entry points — read this first

There are **two HTML entry points**, and `npm run build` emits both:

| Entry | App |
| --- | --- |
| `index.html` | The **legacy** app, and the one Vercel serves at the root. Loads `src/main.ts` plus 22 classic scripts from `./js/*`. |
| `app.html` | The **Vue rebuild**, in progress. Loads `src/vue-main.ts` → `src/App.vue`. Reachable at `/app.html`. **All seven nav views are real there** — Home, Roster, Schedule, Player Ratings, Coach Planner, Coaching Staff and Help — plus sign-in. |

They never share a document. Cutover is Phase 7 of the migration, when `app.html` becomes `index.html` and the legacy files are deleted.

**Player Ratings is complete in the Vue app** — Phase 3a built the board, the
per-exercise leaderboard, the logged-results panel and the player breakdown;
Phase 3b added the write paths: the session grid, the weights and standards
editors, and session history.

**The Coach Planner is complete apart from its tactical board.** Phase 4a
built the timeline, the drill form, the organization's drill library, saved
plans (save, load, rename, delete, copy to another team) and the printed
document. **Phase 4b still owes the diagrammer** — the canvas engine port and
the board component — so a drill can carry a diagram through the Vue app but
cannot yet be drawn there. Phases 5 and 6 own the match tools and the admin
panel; the quiz, the daily thoughts and the school profile forms still live
only in the legacy app.

The session grid is the one screen where being marginally slower loses the
user, because what it competes with is paper: a coach with a clipboard and a
stopwatch entering twenty-five times, one hand on the number pad. Three
behaviours exist for that and have tests holding them in place — **Enter moves
to the next entry field** rather than submitting, **it moves in the order shown
rather than the roster order** (they differ after a sort), and **typing a value
marks the player present**, because a recorded time outranks whatever the
dropdown said. A rebuild that walks the players array instead of the rendered
rows passes every other test and fails the second of these.

One distinction in that screen is worth stating outright, because it is not
obvious from the data and a later tidy-up would quietly erase it. Four of the
five measures — `head_to_head`, `win_loss`, `count_high` and `time_low` — rank
players against each other. **`time_bands` does not: it is a match-readiness
standard**, so the board reports how many fell below it and marks them, rather
than treating a bunched result as a problem. That emphasis is strictly
additive; it must never narrow the table or disable a sort. See
`src/domain/matrix-threshold.ts` and the tests that pin exactly this.

| Location | Status |
| --- | --- |
| `app.js` (6.3k lines) | Legacy monolith. **Dead** — not referenced by anything. Kept only as the source the split scripts cut from. |
| `public/js/*.js`, `public/js/views/*.js` | **What the legacy app loads**, via Vite's `publicDir` (referenced from `index.html` as `./js/*`). |
| `src/domain/*.ts` | Framework-free logic, shared by both apps. See its own section below. |
| `src/data/`, `src/auth.ts`, `src/auth/permissions.ts` | Supabase client, real Supabase Auth and RBAC. Shared by both apps. |
| `src/main.ts` | The **legacy** entry. Installs `window.auth`, `window.authReady`, `window.can`, `window.supabaseService` and the domain namespaces the classic scripts read. |
| `src/vue-main.ts`, `src/App.vue`, `src/views/*.vue`, `src/components/`, `src/stores/`, `src/router/` | The **Vue** app. Imports the shared modules directly. It publishes exactly one global, `window.supabaseService`, because `src/auth.ts` reads it off `window` in fifteen places — remove that line and every auth call silently degrades to a guest. |
| `src/content/help.ts` | The handbook, 700 lines of authored HTML, moved verbatim out of `help.view.js`. Shared. |

Because `src/domain/`, `src/data/` and `src/auth.ts` are shared, a change there affects **both** apps — and only `npm run build` plus the full suite proves it.

**Owed at cutover:** `createWebHistory` needs the server to serve `app.html` for unknown paths. Vite's dev server does this; Vercel does not, and no rewrite is configured yet because nothing points at `/app.html`. Until Phase 7 adds one, a direct visit to `/roster` on the deployed site 404s.

Consequences worth respecting:

- `src/` is not a complete port of the UI. The 22 files under `public/js/` still own every screen: as well as `views/planner.view.js` (2.3k+ lines — planner, print/PDF, drills library, daily thoughts, quiz, coaches view, school profile forms) and `admin.js` (admin panel, diagnostics, import/export), there are `views/` files for `lineup`, `plusminus`, `matrix-session`, `season`, `report`, `progress`, `roundrobin`, `recording-numbers`, `thoughts`, `help`, `teamswitcher`, `home`, `roster`, `schedule`, `matrix` and `coaches`. `auth.js` and `supabaseClient.js` are **deleted** — real auth is `src/auth.ts`, the client is `src/data/supabase.ts`.
- `src/app.core.ts` ends with a **"Pending migration"** `export interface BHSSoccerApp` block declaring the still-JS methods so the TS side type-checks on its own. Delete a line from it when that method lands as a real `src/` module. Same idea in `src/globals.d.ts`, which ambient-declares `window.supabaseService`'s shape and the CDN UMD globals `XLSX` / `JSZip`.
- `src/app.core.ts`, `src/data.ts`, and `src/utils.ts` are dormant — not part of the module graph `src/main.ts` builds, and not referenced by `index.html`. They still carry the pre-migration seed logic (`DEFAULT_BHS_DATA`, the localStorage read/write cycle) that `public/js/app.core.js` already had stripped out. They must be ported to match the live behavior before anything wires them into the module graph in Phase 2 — do not activate them as-is.
- `npm run build` **works**: `vue-tsc` typechecks `src/`, then Vite bundles both entry points and copies `public/` (including `public/js/`) into `dist/` via `publicDir`. `npm run build` is the only check that exercises real module resolution, and is mandatory before merging any change that touches imports.
- The root `*.ps1` scripts (`split_app.ps1`, `patch_commas.ps1`, `fix_boundary.ps1`, `find_methods.ps1`) are one-off tooling from the `app.js` → `js/` split. They are not part of the build, and re-running them would overwrite hand-edits.

## `src/domain/` — the extracted logic

Thirty-one framework-free modules, in two groups.

**Thirteen were cut off the `BHSSoccerApp` prototype** — `schedule`, `matrix`,
`matrix-session`, `lineup`, `plus-minus-court`, `round-robin`, `season`,
`progress`, `report`, `recording-numbers`, `roster`, `csv` and `upsert`. These
are the ones both apps use, so `src/main.ts` publishes each on `window` (see
below) and the legacy prototype method is a one-line delegation.

**Eighteen were added by the Vue rebuild** as it needed them, and are imported
directly rather than published: `season-record`, `theme` (an organization's
branding), `roster-view` (the position filters), `schedule-view`, `help-search`,
the four table read mappings `schedule-row`, `player-row`, `coach-row` and
`matrix-standings`, the five the Matrix needed — `matrix-threshold` (which
measures are standards rather than rankings), `matrix-breakdown` (how a result
reads in words), `time`, `band-score` (what a time earns) and `session-entry`
(the grid's state) — and the four the planner needed: `practice-plan`,
`plan-row`, `drill-time` and `plan-print`. (`format12hTo24h` was added to the
existing `schedule-view` rather than to a module of its own, so it sits beside
its inverse.)

`band-score.ts` is the only scoring the browser does at all; everything else
comes from Postgres. It duplicates `SupabaseService.factorForTime` on purpose,
so a coach sees what each time earns as it is typed, and its test runs both
over the same inputs — two readings of "the tightest band it fits" that
disagree would show one number and store another.

`time.ts` deserves a note, because a second implementation of it is the easy
mistake: `parseTimeToSeconds` treats `.` as `:`, so `"4.30"` is four minutes
thirty and not four-point-three, and it **refuses** a single-digit seconds
field because `"4:5"` could be either `4:05` or `4:50`. `src/data/supabase.ts`
has its own copy that must agree, and `time.test.ts` runs both over the same
inputs to prove it.

The measure decides which parser applies, and both directions bite.
**`time_bands` is entered as mm:ss** — `parseFloat("4:30")` is 4, which fits
under every standard and awards full marks for a time nobody ran. **`time_low`
is entered as decimal seconds** — a sprint of 4.85, which `parseTimeToSeconds`
refuses outright, so reading it as mm:ss would drop every sprint on the sheet.
`domain/session-entry.ts` holds that distinction, and the legacy grid draws the
same one with its input types.

`src/domain/test-globals.ts` sits alongside them but is a test helper, not a
domain module.

They are **side-effect free** — no DOM, no `localStorage`, no Supabase, no
`this` — which is the whole point: they can be tested without booting the app,
and Phase 1 of the Vue migration can import them directly.

`public/js/` cannot import, so `src/main.ts` publishes the thirteen shared
modules as `window` namespaces (`window.scheduleDomain`, `window.matrixDomain`,
…). This is the same mechanism `window.plusMinus` already used for the
plus/minus replay engine. Extracting more logic out of `public/js/` means
adding both the import and the `window` assignment in `main.ts`; only
`npm run build` catches a missed one. A module only the Vue app uses needs
neither — publish one on `window` only when a classic script actually reads
it.

Two things follow from that:

- **Tests for domain modules import them directly** — no `?raw`, no
  `new Function`, no hand-built `window`. New tests should be written this way.
- **Legacy tests that evaluate a shimmed classic script need the namespaces.**
  `src/domain/test-globals.ts` exports `installDomainGlobals()`, which puts them
  all on the global object in one call. Use it rather than importing and
  assigning each one.

`src/data/plus-minus.ts` (event replay) and `src/data/season-stats.ts` predate
this directory and stay where they are; `domain/plus-minus-court.ts` is
deliberately separate from the replay engine — one is the pitch, the other is
the arithmetic.

Not everything moved. Methods that mutate app state and re-render, touch
`localStorage`, or build HTML stayed in their views, and the commit messages on
the `refactor:` commits record which and why.

## Runtime architecture

Everything hangs off one class, `BHSSoccerApp`, assembled across files at load time in this order:

1. `public/js/data.js` — dead weight now; `loadData()` in `app.core.js` no longer references it. (The dormant `src/data.ts` still mirrors its old seed-object shape — see the Phase 2 note above.)
2. `public/js/diagrammer.js` — the `SoccerTacticalBoard` canvas class.
3. `public/js/app.core.js` — defines `BHSSoccerApp`: constructor, `init()`, `loadData()`/`saveData()`, `syncFromSupabase()`, `switchView()`/`renderCurrentView()`.
4. `public/js/views/*.js`, `public/js/admin.js`, `public/js/utils.js` — each does `Object.assign(BHSSoccerApp.prototype, { ... })` to bolt methods on. **Script order in `index.html` matters**: the class must exist before any prototype extension runs.
5. `public/js/utils.js` also boots the app — `initApp()` sets `window.app = new BHSSoccerApp()` on DOM ready, after awaiting `window.authReady` from `src/main.ts`.

The dormant `src/app.core.ts` mirrors the pre-migration shape of this file (see the Phase 2 note above) but is not part of the live module graph; `src/main.ts` is the actual TypeScript entry point, and it only wires up auth (`src/auth.ts`), RBAC (`src/auth/permissions.ts`), and the Supabase client (`src/data/supabase.ts`) as globals for `public/js/` to consume.

**Views are wired to the DOM through the global `app` plus inline handlers.** `index.html` (1.2k lines of markup and modals) is full of `onclick="app.openPlayerModal(...)"`, and the rendered template strings contain more of the same. Renaming a prototype method means grepping `index.html` and every view's template strings; nothing checks that boundary.

`renderCurrentView()` in `app.core` is the router — a plain if/else over `this.currentView` (`home`/`roster`/`schedule`/`matrix`/`planner`/`coaches`) that swaps `innerHTML` and then calls `attachDynamicListeners()`. The `planner` branch additionally re-initializes the canvas diagrammer on a `setTimeout` once the HTML has landed.

### Data flow

Postgres is the source of truth. `loadData()` in `app.core.js` returns empty collections (no seed object, no `localStorage` read); `saveData()` is an intentional no-op — every mutation already writes through `window.supabaseService`, and a reload repopulates state. `syncFromSupabase()` populates `this.data` from Postgres during `init()` when `window.supabaseService.isConfigured()`.

Supabase rows are **snake_case** (`class_year`, `matrix_stats`, `coach_notes`, `diagram_data`); app state is **camelCase**. There is no ORM — every field is hand-mapped, on read in `syncFromSupabase()` and on write in each `upsert*` method of `src/data/supabase.ts`. Adding a column means editing both sides. Soft deletes are a repo-wide convention: rows carry `is_deleted` and readers filter on it.

`src/data/supabase.ts` exports a single `SupabaseService` instance that `src/main.ts` assigns to `window.supabaseService`. Credentials resolve in order: `window.ENV_SUPABASE_URL` / `ENV_SUPABASE_ANON_KEY` → `localStorage['bhs_supabase_url' / 'bhs_supabase_anon_key']` (settable at runtime from the admin panel via `setCredentials`) → a hardcoded project URL and anon key in the file. If none produce a valid client, every service method returns `null` — so "nothing loaded from the DB" is usually an unconfigured client, not a query bug.

**Ten of its methods default `schoolId` to `'bhs'`, and calling one without an argument is a multi-tenant bug that will not announce itself.** `getSchoolUuid`, `fetchPendingApprovals`, `fetchPlayers`, `fetchSoccerCategories`, `fetchDrillsBank`, `upsertDrillBankItem`, `fetchSchool`, `upsertSchool`, `fetchCoaches` and `upsertCoach` all declare `schoolId: string = 'bhs'`. A club coach calling any of them bare is silently served Beaumont's data, and the default makes it invisible at the call site. **Always pass the resolved organization id.** Where a team-scoped equivalent exists — `fetchTeamRoster(teamId)` for the roster — prefer it: it has no default to fall through.

Removing the defaults is worth doing and is not a small change: both apps call these, so it wants its own commit rather than being folded into a view.

**Three places this has already bitten**, all found while building Phase 2:

- `public/js/app.core.js:523` calls `fetchCoaches('bhs')` outright, so a club coach's Coaching Staff screen shows Beaumont's staff. Still live in the legacy app.
- `src/auth.ts`'s `getPendingApprovals()` called `fetchPendingApprovals()` bare, showing a club admin Beaumont's pending signups. Fixed — it now takes an organization, optional only so the legacy admin panel keeps working.
- Every `fetchPlayers` call site, which is why the Vue roster uses `fetchTeamRoster(teamId)` instead.

## Duplicated and dead code worth knowing about

- **`openAddCoachModal` is defined twice in `planner.view.js`**, at lines 580 and 826, inside one `Object.assign`. The second wins, so the first is dead — and editing it does nothing. It is the only duplicate across all 22 classic scripts.
- **`checkEmail` in `src/auth/email-typo.ts` never ran.** It was imported into `src/auth.ts` and never called, while `coaches.view.js` branched on a `res.emailSuggestion` that `RegisterResult` never carries. A tested 161-line module wired to nothing. The Vue sign-up flow now calls it properly; the legacy path is still dead.
- **`deleteCoach` in `src/data/supabase.ts` returns nothing at all** — it logs its error and falls off the end, so success and failure are indistinguishable from the return value. The Vue store reloads and checks whether the row survived rather than reporting a success it cannot verify.

### Practice plans — four traps in the storage shape

`practice_plans` predates most of the conventions elsewhere in this file, and
each of these is a failure the app has actually hit. `src/domain/plan-row.ts`
and `src/stores/planner.ts` exist largely to hold them.

- **`saveFullPracticePlan` upserts and never deletes.** A drill removed from
  the plan locally is still a row, and returns on the next reload. Removing
  one means calling `deletePracticePlanItem` for its id as well.
- **A plan is rows, not a record.** There is no plans table: a plan is
  whatever rows share a `name`, so grouping is client-side. Older rows carry
  the plan name in a `[Plan: X]` prefix inside `coach_notes`, which the
  grouping reads out and strips.
- **Plan rows carry ids that belong to a team.** Merging another team's plans
  into the picker let a coach load one, which copied that team's row ids into
  the working plan — and the next edit upserted on those ids under the new
  team, *moving* the other team's rows. An empty team must show an empty
  picker. Never merge.
- **`saveFullPracticePlan` returns `{ success }`, not `{ ok }`**, and
  `savePracticePlanItem` returns the row or `null`. Reading `res.ok` on either
  is always `undefined`, so every successful save reports as a failure.

A fifth is not the table's fault but bites the same way: a newly added drill
must be written with `savePracticePlanItem`, because that is what returns its
id. Added through the full-plan save it has none, so the *next* save inserts a
second copy — visible only after a reload.

### Teams

`schools` holds organizations — a school or a club, distinguished by `kind`. `teams` belong to a school; `team_players` is the membership and carries everything that varies by team (number, position, season stats, ratings), so `players` is pure identity and one person can appear on a school team and a club team with separate statistics. `unique (school_id, player_id)` on the membership enforces one team per organization, and a composite foreign key to `teams (id, school_id)` stops that column drifting from its team's.

The active team is a per-device preference in `localStorage` under `bhs_active_team_id`, resolved by `resolveActiveTeam` in `src/data/team-scope.ts`. Writes are team-scoped through `public.is_team_coach()`; reads stay public. Phase 2 surfaces — practice plans, drills, daily thoughts, quiz, categories, and the `coaches` display table — are still school-scoped.

### Auth & RBAC

`src/auth.ts` exports a singleton `AuthManager` (`auth`) over **real Supabase Auth** (`auth.users`), joined to a `public.profiles` row holding `role`, `status`, `school_id`, `player_id`. `src/main.ts` assigns it to `window.auth` and exposes `window.authReady` (a promise `app.core.js` awaits before rendering) and `window.can` (RBAC helper from `src/auth/permissions.ts`). Roles: `guest` / `player` / `coach` / `admin`. The guards used throughout the views — `auth.isCoach()`, `auth.isAdmin()`, `auth.canAccessRatings()`, `auth.isLoggedIn()` — all additionally require `status === 'active'`; signup lands in a pending-approval state that a coach or admin clears via `approveProfile`/`rejectProfile`. `auth.subscribe()` re-renders the current view on any auth change.

These client-side guards are UI affordances only. **Real enforcement lives in the RLS policies** in `supabase_migration_auth.sql`; a new privileged operation needs a policy there, not just an `isCoach()` check.

### SQL files

Applied by hand in the Supabase SQL editor, in this order:

1. `supabase_schema.sql` — 14 tables (schools, profiles, players, schedule, drills_bank, practice_plans, matrix_logs, coaches, daily_thoughts, quiz_questions, quiz_attempts, player_answers, soccer_categories) with UUID PKs.
2. `schema_roles.sql` — `roles` table with JSONB granular permissions.
3. `seed_data.sql` — BHS demo data.
4. `supabase_migration_auth.sql` — **supersedes** the RLS story in the first two files (it says so explicitly; they are left as historical provisioning scripts). Adds the `handle_new_user`/`handle_user_confirmed` triggers, `SECURITY DEFINER` helpers (`current_profile_role()`, etc.) that avoid RLS self-recursion, a column-guard trigger blocking self-service role/status escalation, and per-table read/write policies. Its first step **deletes all `public.profiles` rows** to re-link the table to `auth.users`.
5. `supabase/migrations/0005_multi_team_schema.sql` — teams, memberships, team-scoped RLS, and the `current_profile_role()` status fix.
6. `supabase/migrations/0008_schedule_real_date.sql` — `match_on`/`kickoff_time` derived from the text columns by a trigger.
7. `supabase/migrations/0009_weighted_matrix_scoring.sql` — drill weights, `measure`, the two `matrix_session*` tables, and the rewritten `matrix_standings`.

Prefer adding a new dated migration file over editing an already-applied script.

**`supabase_schema.sql` does not describe the live database. Verify columns against the running database before writing SQL or code that depends on them.** It is a historical provisioning script, and the drift is not confined to the RLS story item 4 already supersedes — three columns have been found wrong so far:

| Declared in `supabase_schema.sql` | Actually |
| --- | --- |
| `drills_bank.points INT DEFAULT 3` | **does not exist** (added by `0009`) |
| `drills_bank.duration TEXT NOT NULL` | **does not exist** |
| `players.class_year TEXT NOT NULL` | exists, and `0005` did *not* drop it — unlike `number`/`position` |

Each cost a failed migration or a rendering bug. Two habits avoid it:

- A `select` naming a column returns PostgREST `42703` when it is missing, so probing one column at a time distinguishes "absent" from "empty table":
  `curl -s "$URL/rest/v1/drills_bank?select=points&limit=1" -H "apikey: $KEY"`
- A `select *` on any row lists the columns that really exist. Note this tells you nothing about nullability or defaults — `class_year` was found by reading `0005`'s drop list, not by listing columns.

Migrations that add a column should therefore prefer `add column if not exists` over `alter column`, so they are correct against both the live database and the declared schema.

The Supabase SQL editor may run as a role that is a **member** of `postgres` without defaulting to it. `ALTER TABLE` and `CREATE POLICY` check ownership rather than privilege, so they fail with `42501: must be owner of table …` even when the privilege is reachable. `set role postgres;` immediately after `begin;` fixes it — see the top of `0009`.

### Diagrammer

`SoccerTacticalBoard` is a canvas engine (players/cones/balls/arrows, freehand drawing, pitch types, undo/redo, keyframes for movement steps). Two instances live on the app: `app.diagrammer` for the practice planner board and `app.masterDiagrammer` for the master drills library modal. Diagrams serialize to a `diagramData` blob stored on drills and practice-plan items; the print/PDF path in `planner.view.js` rasterizes each keyframe through `generateDiagramStepDataUrl()`.

### Import/export

`public/js/admin.js` implements an 11-table XLSX import/export engine on the CDN globals `XLSX` (SheetJS) and `JSZip` — single workbook, per-table files, or a zipped package. `Resouces/CSV/` (note the spelling) holds reference exports and templates matching those table shapes.

## Conventions

- Views return HTML **strings** built from template literals with inline `style="..."`; shared design tokens are CSS custom properties in `index.css` (`--bhs-cyan-accent`, `--text-muted`, …), with component styles in `styles.css`.
- `tsconfig.json` is deliberately loose (`strict: false`, `noImplicitAny: false`) so the ported JS type-checks without a rewrite. Don't tighten it as a side effect of another change.
- **`typescript` is pinned to 5.x on purpose — do not upgrade it to 7.** TypeScript 7 is the native Go rewrite and exports only `.` and `./unstable/*`; `vue-tsc` resolves `typescript/lib/tsc`, which that layout does not have, so it dies with `ERR_PACKAGE_PATH_NOT_EXPORTED` and cannot run at all. Without it nothing type-checks a `.vue` file's script block or its templates. The upgrade is deferred until `vue-tsc` supports TypeScript 7, not abandoned.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `refactor:`).
