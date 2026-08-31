# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A single-page web app for the Beaumont High School (CA) Cougars soccer program: public roster/schedule hub plus a coach-only command center (Anson Dorrance "Competitive Matrix" player ranking, practice planner, canvas tactical diagrammer, XLSX import/export). No framework — plain classes rendering HTML template strings into `#mainAppContainer`. Backend is Supabase (Postgres + Auth + RLS), which is the source of truth: `loadData()` returns empty collections, `saveData()` is a no-op, and `syncFromSupabase()` populates app state from Postgres on boot. When Supabase is not configured, the app runs with empty data rather than falling back to localStorage.

`walkthrough.md` and `implementation_plan.md` are the original product spec and verification notes. They are still broadly accurate about *features*, but predate the refactors below — do not trust them for file layout.

## Commands

```bash
npm run dev        # vite dev server, opens browser
npm run build      # tsc (typecheck) + vite build -> dist/
npm run typecheck  # tsc --noEmit over src/ only
npm test           # vitest — 80 tests, config in vitest.config.mts
npm run preview    # serve dist/

powershell -File check_syntax.ps1   # node --check every public/js/*.js file
```

Verification is a four-part story, and each part covers a different slice of the code:

- `npm test` — Vitest unit tests (80 tests).
- `npm run typecheck` — `tsc --noEmit` over `src/` **only**; it does not see `public/js/`.
- `node --check <file>` (or `check_syntax.ps1`, which runs it over every file under `public/js/`) — the syntax gate for the classic scripts, since typecheck doesn't reach them.
- `npm run build` — **mandatory**, and the only check that exercises real module resolution. `npm run typecheck` and `npm test` can both pass while an import is unresolvable at bundle time; only a real build catches that.

`npm run dev` serves the app correctly — do not serve the repo root statically. `index.html` loads `./src/main.ts` as an ES module (no browser executes a `.ts` file directly), and everything under `./js/*` resolves only through Vite's `publicDir` mapping to `public/js/`. Use `npm run dev` to run the app locally.

## The three parallel copies of the app — read this first

The same application exists three times, and only one of them actually runs:

| Location | Status |
| --- | --- |
| `app.js` (6.3k lines) | Legacy monolith. **Dead** — not referenced by `index.html`. Kept only as the source the split scripts cut from. |
| `public/js/*.js`, `public/js/views/*.js` | **What the browser actually loads**, via Vite's `publicDir` (referenced from `index.html` as `./js/*`). |
| `src/*.ts`, `src/views/*.ts` | Real Supabase Auth, RBAC, and the Supabase client are here (`src/auth.ts`, `src/data/supabase.ts`). `src/main.ts` is the module entry point `index.html` loads (`<script type="module" src="./src/main.ts">`); it installs `window.auth`, `window.authReady`, `window.can`, and `window.supabaseService`. |

Consequences worth respecting:

- `src/` is not a complete port of the UI. Still JS-only: `public/js/views/planner.view.js` (2.3k+ lines — planner, print/PDF, drills library, daily thoughts, quiz, coaches view, school profile forms), and `public/js/admin.js` (admin panel, diagnostics, import/export). `auth.js` and `supabaseClient.js` are **deleted** — real auth is `src/auth.ts`, the client is `src/data/supabase.ts`.
- `src/app.core.ts` ends with a **"Pending migration"** `export interface BHSSoccerApp` block declaring the still-JS methods so the TS side type-checks on its own. Delete a line from it when that method lands as a real `src/` module. Same idea in `src/globals.d.ts`, which ambient-declares `window.supabaseService`'s shape and the CDN UMD globals `XLSX` / `JSZip`.
- `src/app.core.ts`, `src/data.ts`, and `src/utils.ts` are dormant — not part of the module graph `src/main.ts` builds, and not referenced by `index.html`. They still carry the pre-migration seed logic (`DEFAULT_BHS_DATA`, the localStorage read/write cycle) that `public/js/app.core.js` already had stripped out. They must be ported to match the live behavior before anything wires them into the module graph in Phase 2 — do not activate them as-is.
- `npm run build` **works**: `tsc` typechecks `src/`, then Vite bundles `src/main.ts` and copies `public/` (including `public/js/`) into `dist/` via `publicDir`. `npm run build` is the only check that exercises real module resolution, and is mandatory before merging any change that touches imports.
- The root `*.ps1` scripts (`split_app.ps1`, `patch_commas.ps1`, `fix_boundary.ps1`, `find_methods.ps1`) are one-off tooling from the `app.js` → `js/` split. They are not part of the build, and re-running them would overwrite hand-edits.

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
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `refactor:`).
