# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A single-page web app for the Beaumont High School (CA) Cougars soccer program: public roster/schedule hub plus a coach-only command center (Anson Dorrance "Competitive Matrix" player ranking, practice planner, canvas tactical diagrammer, XLSX import/export). No framework — plain classes rendering HTML template strings into `#mainAppContainer`. Backend is Supabase (Postgres + Auth + RLS); the app degrades to a localStorage-only mode when Supabase is not configured.

`walkthrough.md` and `implementation_plan.md` are the original product spec and verification notes. They are still broadly accurate about *features*, but predate the refactors below — do not trust them for file layout.

## Commands

```bash
npm run dev        # vite dev server on :3000, opens browser
npm run build      # tsc (typecheck) + vite build -> dist/
npm run typecheck  # tsc --noEmit over src/ only
npm run preview    # serve dist/

powershell -File check_syntax.ps1   # node --check every js/*.js file
```

There is no test framework. `check_syntax.ps1` (a parse check over the JS files the browser actually loads) plus loading the page and watching the console is the whole verification story — the manual scenarios at the bottom of `implementation_plan.md` are the acceptance criteria.

**Node version caveat:** the installed Node here is v14, but `vite@8` requires `^20.19 || >=22.12` and the `typescript@7` binary also fails to launch on v14. `npm run dev/build/typecheck` will not run until Node is upgraded. To eyeball the app without Vite, serve the repo root statically (`npx serve .`) — `index.html` needs no build step (see below).

## The three parallel copies of the app — read this first

The same application exists three times, and only one of them actually runs:

| Location | Status |
| --- | --- |
| `app.js` (6.3k lines) | Legacy monolith. **Dead** — not referenced by `index.html`. Kept only as the source the split scripts cut from. |
| `js/*.js`, `js/views/*.js` | **What the browser actually loads.** `index.html` lists them as ordered classic `<script>` tags. |
| `src/*.ts`, `src/views/*.ts` | In-progress TypeScript port (branch `feat/typescript`). Checked by `tsc --noEmit` only; **nothing loads it at runtime yet.** |

Consequences worth respecting:

- **A change made only in `src/` has no effect in the browser.** Until an ES-module entry point exists, a behavior fix generally has to be made in `js/`, then mirrored into `src/` if that module has already been ported.
- `src/` is not a complete port. Still JS-only: `js/views/planner.view.js` (2.4k lines — planner, print/PDF, drills library, daily thoughts, quiz), `js/admin.js` (admin panel, diagnostics, import/export), and `supabaseClient.js`.
- `src/app.core.ts` ends with a **"Pending migration"** `export interface BHSSoccerApp` block declaring the still-JS methods so the TS side type-checks on its own. Delete a line from it when that method lands as a real `src/` module. Same idea in `src/globals.d.ts`, which ambient-declares `window.supabaseService` (from `supabaseClient.js`) and the CDN UMD globals `XLSX` / `JSZip`.
- `npm run build` is currently **broken as a deployment artifact**: `index.html`'s scripts are classic, not `type="module"`, so Vite passes them through untouched and copies neither `js/` nor `supabaseClient.js` into `dist/`. `dist/index.html` bundles the CSS correctly but its script `src` paths 404. Fixing this means giving `src/` a real module entry point and switching `index.html` to `<script type="module">`.
- The root `*.ps1` scripts (`split_app.ps1`, `patch_commas.ps1`, `fix_boundary.ps1`, `find_methods.ps1`) are one-off tooling from the `app.js` → `js/` split. They are not part of the build, and re-running them would overwrite hand-edits.

## Runtime architecture

Everything hangs off one class, `BHSSoccerApp`, assembled across files at load time in this order:

1. `js/data.js` — `DEFAULT_BHS_DATA` seed object (school, players, schedule, drillsBank, coaches, dailyThoughts, soccerCategories).
2. `js/diagrammer.js` — the `SoccerTacticalBoard` canvas class.
3. `js/app.core.js` — defines `BHSSoccerApp`: constructor, `init()`, `loadData()`/`saveData()`, `syncFromSupabase()`, `switchView()`/`renderCurrentView()`.
4. `js/views/*.js`, `js/admin.js`, `js/utils.js` — each does `Object.assign(BHSSoccerApp.prototype, { ... })` to bolt methods on. **Script order in `index.html` matters**: the class must exist before any prototype extension runs.
5. `js/utils.js` also boots the app — `initApp()` sets `window.app = new BHSSoccerApp()` on DOM ready.

The TypeScript port mirrors this exactly: `src/app.core.ts` exports the class, and each view module pairs its `Object.assign(BHSSoccerApp.prototype, {...})` with a `declare module '../app.core' { interface BHSSoccerApp { ... } }` augmentation. When adding a method to a ported module, add both the implementation and the interface signature, and type the receiver as `methodName(this: BHSSoccerApp)`.

**Views are wired to the DOM through the global `app` plus inline handlers.** `index.html` (1.2k lines of markup and modals) is full of `onclick="app.openPlayerModal(...)"`, and the rendered template strings contain more of the same. Renaming a prototype method means grepping `index.html` and every view's template strings; nothing checks that boundary.

`renderCurrentView()` in `app.core` is the router — a plain if/else over `this.currentView` (`home`/`roster`/`schedule`/`matrix`/`planner`/`coaches`) that swaps `innerHTML` and then calls `attachDynamicListeners()`. The `planner` branch additionally re-initializes the canvas diagrammer on a `setTimeout` once the HTML has landed.

### Data flow

`DEFAULT_BHS_DATA` → `localStorage['bhs_soccer_app_data']` (loaded in the constructor, written back by `saveData()` after every mutation) → optionally overwritten by `syncFromSupabase()` during `init()` when `window.supabaseService.isConfigured()`.

Supabase rows are **snake_case** (`class_year`, `matrix_stats`, `coach_notes`, `diagram_data`); app state is **camelCase**. There is no ORM — every field is hand-mapped, on read in `syncFromSupabase()` and on write in each `upsert*` method of `supabaseClient.js`. Adding a column means editing both sides. Soft deletes are a repo-wide convention: rows carry `is_deleted` and readers filter on it.

`supabaseClient.js` exposes a single `SupabaseService` instance as `window.supabaseService`. Credentials resolve in order: `window.ENV_SUPABASE_URL` / `ENV_SUPABASE_ANON_KEY` → `localStorage['bhs_supabase_url' / 'bhs_supabase_anon_key']` (settable at runtime from the admin panel via `setCredentials`) → a hardcoded project URL and anon key in the file. If none produce a valid client, every service method returns `null` and callers silently fall back to localStorage data — so "nothing loaded from the DB" is usually an unconfigured client, not a query bug.

### Auth & RBAC

`auth.js` / `src/auth.ts` export a singleton `AuthManager` (`auth`) over **real Supabase Auth** (`auth.users`), joined to a `public.profiles` row holding `role`, `status`, `school_id`, `player_id`. Roles: `guest` / `player` / `coach` / `admin`. The guards used throughout the views — `auth.isCoach()`, `auth.isAdmin()`, `auth.canAccessRatings()`, `auth.isLoggedIn()` — all additionally require `status === 'active'`; signup lands in a pending-approval state that a coach or admin clears via `approveProfile`/`rejectProfile`. `auth.subscribe()` re-renders the current view on any auth change.

These client-side guards are UI affordances only. **Real enforcement lives in the RLS policies** in `supabase_migration_auth.sql`; a new privileged operation needs a policy there, not just an `isCoach()` check.

### SQL files

Applied by hand in the Supabase SQL editor, in this order:

1. `supabase_schema.sql` — 14 tables (schools, profiles, players, schedule, drills_bank, practice_plans, matrix_logs, coaches, daily_thoughts, quiz_questions, quiz_attempts, player_answers, soccer_categories) with UUID PKs.
2. `schema_roles.sql` — `roles` table with JSONB granular permissions.
3. `seed_data.sql` — BHS demo data.
4. `supabase_migration_auth.sql` — **supersedes** the RLS story in the first two files (it says so explicitly; they are left as historical provisioning scripts). Adds the `handle_new_user`/`handle_user_confirmed` triggers, `SECURITY DEFINER` helpers (`current_profile_role()`, etc.) that avoid RLS self-recursion, a column-guard trigger blocking self-service role/status escalation, and per-table read/write policies. Its first step **deletes all `public.profiles` rows** to re-link the table to `auth.users`.

Prefer adding a new dated migration file over editing an already-applied script.

### Diagrammer

`SoccerTacticalBoard` is a canvas engine (players/cones/balls/arrows, freehand drawing, pitch types, undo/redo, keyframes for movement steps). Two instances live on the app: `app.diagrammer` for the practice planner board and `app.masterDiagrammer` for the master drills library modal. Diagrams serialize to a `diagramData` blob stored on drills and practice-plan items; the print/PDF path in `planner.view.js` rasterizes each keyframe through `generateDiagramStepDataUrl()`.

### Import/export

`js/admin.js` implements an 11-table XLSX import/export engine on the CDN globals `XLSX` (SheetJS) and `JSZip` — single workbook, per-table files, or a zipped package. `Resouces/CSV/` (note the spelling) holds reference exports and templates matching those table shapes.

## Conventions

- Views return HTML **strings** built from template literals with inline `style="..."`; shared design tokens are CSS custom properties in `index.css` (`--bhs-cyan-accent`, `--text-muted`, …), with component styles in `styles.css`.
- `tsconfig.json` is deliberately loose (`strict: false`, `noImplicitAny: false`) so the ported JS type-checks without a rewrite. Don't tighten it as a side effect of another change.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `refactor:`).
