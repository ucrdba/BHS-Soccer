# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A single-page web app for high-school and club soccer programs — Beaumont High School (CA) is the first organization, **not the only one**: a public roster/schedule hub plus a coach-only command center (Anson Dorrance "Competitive Matrix" player ranking, practice planner, canvas tactical diagrammer, XLSX import/export).

Vue 3 with `<script setup>`, Vue Router and Pinia, built by Vite. Backend is Supabase (Postgres + Auth + RLS), which is the source of truth — there is no local seed data and no localStorage fallback: when Supabase is not configured the app runs empty rather than inventing content.

`walkthrough.md` and `implementation_plan.md` are the original product spec and verification notes. They are still broadly accurate about *features* and predate every refactor since — do not trust them for file layout.

**The app was rebuilt from a framework-free original**, and that history explains several things in here. `docs/superpowers/specs/2026-09-05-vue-migration-design.md` and the plans beside it record the seven phases; the legacy application was deleted in Phase 7. Nothing under `public/js/` exists any more, and neither does `app.js`. If you find a reference to either, it is stale.

## Commands

```bash
npm run dev        # vite dev server, opens browser
npm run build      # vue-tsc (typecheck) + vite build -> dist/
npm run typecheck  # vue-tsc --noEmit over src/, components included
npm test           # vitest — 2,521 tests, config in vitest.config.mts
npm run preview    # serve dist/
```

Verification is three gates, and each covers a different slice:

- `npm test` — Vitest (2,521 tests across 142 files), including Vue component and database tests.
- `npm run typecheck` — `vue-tsc --noEmit`, which checks a single-file component's script block **and its template**.
- `npm run build` — **mandatory**, and the only check that exercises real module resolution. Typecheck and tests can both pass while an import is unresolvable at bundle time.

**Check the exit code, not the output.** Vitest can print "11 passed" and still exit 1 — an unhandled promise rejection in a component does exactly that. `npm test > /dev/null 2>&1; echo "EXIT=$?"` is the reliable form, and a green-looking run that exits non-zero has found a real bug.

### Database tests

`src/data/testdb/` runs SQL against a **real Postgres**, because constraints, partial indexes and triggers cannot be proved by asserting on a file's text. `setupDb()` builds a uniquely-named scratch database, applies `src/data/testdb/prelude.sql` and then `Resouces/SQL/demo/demo_schema.sql`, and `withDb()` wraps each test in a transaction that is always rolled back — so a migration can be applied inside a test without leaking into the next one.

The connection resolves as `TEST_DATABASE_URL` → a gitignored `.env.test` at the repo root → `postgres://postgres:postgres@localhost:5432/postgres`. **`hasTestDb()` returns false when nothing answers and the suites `describe.skipIf` off it**, so a machine with no Postgres still runs everything else rather than reporting a wall of red.

`src/data/testdb/supabase-client.test.ts` goes further and tests `src/data/supabase.ts` against a **full local Supabase stack** — PostgREST and GoTrue, not just Postgres. It needs `supabase start` (see `docs/runbooks/2026-09-05-local-supabase-stack.md`) and skips when the stack is not answering.

The two are separate databases: the harness uses the standalone Postgres on **5432**, and the CLI stack runs its own on **54322** behind the API on **54321**.

**The harness connects as the `postgres` superuser, which skips every privilege check**, so a test on `withDb`'s connection cannot see a function a visitor is not allowed to execute. A visitor's statement has to be tried from a separate connection, as `authenticated`, with `request.jwt.claim.sub` set: `demo-accounts.test.ts` does this, after the demo's account locks passed every test and would still have refused every profile edit on Supabase. It cannot share the build's transaction either — PL/pgSQL checks a nested call's permission once per transaction, so a role switched to after the build is never checked.

## Layout

| Location | Holds |
| --- | --- |
| `index.html` | The only entry document. Mounts `#vue-app`, loads `src/vue-main.ts`, the fonts and the two CDN libraries. `data-ground="paper"` on `<html>` so the first paint has tokens. |
| `src/vue-main.ts`, `src/App.vue` | The app shell. |
| `src/router/index.ts` | Seven nav routes plus `/admin` and `/quiz`, and the nav list itself. |
| `src/views/*.vue` | One per route. The seven nav routes, `/admin`, `/quiz`, and the three touchline tools (`LineupView`, `LiveMatchView`, `SeasonReportView`), which resolve their subject from the route and render a screen inside `components/layout/ToolScreen.vue`. |
| `src/components/` | `admin`, `auth`, `coaches`, `home`, `layout`, `matrix`, `planner`, `roster`, `schedule`, `ui`. |
| `src/stores/` | Pinia: `auth`, `coaches`, `lineup`, `matrix`, `organization`, `planner`, `plus-minus`, `roster`, `schedule`, `session`, `thoughts`. |
| `src/domain/` | 34 framework-free modules. Its own section below. |
| `src/diagram/` | The canvas tactical board. Its own section below. |
| `src/data/`, `src/auth.ts`, `src/auth/permissions.ts` | Supabase client, Supabase Auth, RBAC. |
| `src/content/help.ts` | The handbook — 700 lines of authored HTML. |

**Routes are real URLs**, which is why `vercel.json` carries a rewrite: `createWebHistory` needs unknown paths served `index.html`, Vite's dev server does that and Vercel does not. The rewrite excludes anything with a file extension, so `version.json` still answers with itself. `src/deploy-config.test.ts` holds this — it is the kind of thing that only breaks once deployed.

**`XLSX` and `JSZip` are CDN globals**, declared in `src/globals.d.ts` and loaded by `index.html`. `ImportExportModal.vue` reports their absence rather than throwing, so a slow CDN is a message and not a crash.

**`window.supabaseService` is the one global the app publishes**, from `src/vue-main.ts`, because `src/auth.ts` reads it off `window` in fifteen places. That is a leftover from the framework-free original; remove the assignment and every auth call silently degrades to a guest.

The title in `index.html` is deliberately neutral. The organization store sets `document.title` from the active organization, the same place the colours come from — see the multi-organization rule below.

## The rules that are not guessable from the code

This is the part of the file that matters. Each of these has been got wrong at least once, and none of them is visible from a signature.

### The site is not Beaumont-only

Club coaches use this. Beaumont is the first organization and the most visible one, and much of the seed data says "Beaumont High School Cougars", but the product is multi-tenant: `schools` holds organizations distinguished by a `kind` of `school` or `club`.

- **Never hardcode `'bhs'`, `Beaumont` or `Cougars` in new work.** Resolve the organization from the active team or the signed-in profile.
- **Never restrict sign-up to a school email domain.** Club coaches and their players use personal addresses.
- **Anything that renders a name, mascot, colours or a record reads them from the `schools` row.** A club has its own.

### A statistic may only be recorded while the clock is RUNNING

Not merely started. Enforced in `stores/plus-minus.ts`, in `append()` and **nowhere else** — every gesture arrives through that one door, and a guard repeated per gesture is a guard that drifts. The gated kinds are a constant there, so a new clock-stamped statistic joins the rule rather than sidestepping it.

Every plus/minus event is stamped with the match clock, and playing time and goal difference are *derived from those stamps*. An event recorded during a stoppage is attributed to whoever was on the pitch at a minute that has already passed; before kick-off everything stamps at 0:00 and every player finishes credited with zero minutes. The counters go up and the sheet looks right either way, which is why this needs a guard rather than care. Substitutions and starting the clock stay outside the rule.

**Team goals are inside it**, and were the one statistic that escaped until the demo made it visible. `goal_for` and `goal_against` move the differential of *every* player on the pitch, so one tapped while the clock is stopped credits whoever is on at that point in the log — and `endPeriod` leaves the clock stopped, so half-time is exactly when that happens: the eleven who came on are credited for a goal the eleven who went off were on for.

### Low-minute players are the audience for the reports, not noise in them

Held by the season report, the plus/minus sheet, the squad report and the progress chart alike — each asserts the inclusion rather than assuming it. NFHS rules allow unlimited substitution and re-entry, so much of the roster finishes any fixture well under a full match, and a coach reads these views to decide who to give more minutes to. **Filtering out the fringe players removes exactly the players the decision is about, invisibly.** Show the minutes beside the rate instead.

### A match is not ninety minutes

High school is 80, club age groups vary. `teams.match_minutes` holds it and `seasonFullMatchMinutes` reads it. Nothing may hardcode a length, and one organization can field teams playing different ones.

The column arrived late: `0034_team_match_minutes.sql` created it, after this file had described it for months while no migration made it and both team selects omitted it — so every team fell through the 80-minute fallback in `src/data/season-stats.ts`, including the clubs that do not play 80. Null still means "nobody has said", which is when that fallback is right. Two things follow: **a column the app reads must be named in `fetchTeamsForViewer` and `fetchAllTeams`**, which select explicitly and map by hand (`src/data/team-columns.test.ts` fails if `match_minutes` slips out of either), and **the admin Teams section is where it is set** — `updateTeam` writes a team's name, season and match length, and leaves the length null when the field is blank, because null is what keeps the fallback honest.

### `time_bands` is a standard, not a ranking

Four of the five Matrix measures — `head_to_head`, `win_loss`, `count_high` and `time_low` — rank players against each other. **`time_bands` does not: it is a match-readiness standard.** The board reports how many fell below it and marks them, rather than treating a bunched result as a problem — a squad that all clears the standard is the good outcome, and tuning the bands to spread them out defeats the point. The emphasis is strictly **additive**: it must never narrow the table or disable a sort. See `src/domain/matrix-threshold.ts`.

The measure also decides which parser applies, and both directions bite. **`time_bands` is entered as mm:ss** — reading `"4:30"` with `parseFloat` gives 4, which fits under every standard and awards full marks for a time nobody ran. **`time_low` is entered as decimal seconds** — a sprint of 4.85, which `parseTimeToSeconds` refuses outright, so reading it as mm:ss would drop every sprint on the sheet. `domain/session-entry.ts` holds the distinction.

### The session grid competes with paper

A coach with a clipboard and a stopwatch enters twenty-five times one-handed, so being marginally slower loses the user. Three behaviours exist for that and have tests pinning them: **Enter moves to the next entry field** rather than submitting, **it moves in the order shown rather than the roster order** (they differ after a sort), and **typing a value marks the player present**, because a recorded time outranks whatever the dropdown said. A rebuild that walks the players array instead of the rendered rows passes every other test and fails the second of these.

**A W/D/L sheet fills in one press.** A small-sided session is two sides of the same squad, so twenty-five dropdowns is the paper-beats-screen problem in its purest form: the grid offers Won/Drew/Lost above it, and the coach sets the squad then flips the side that won. `fillBlankOutcomes` fills **blanks only** — a result already chosen is the coach's, so a press late in entry cannot wipe the rows already done — and skips anyone not marked here, since an outcome implies attendance and filling an absent row would credit them for a game they did not play. The control appears only for `win_loss`: there is no sensible squad-wide Cooper's distance.

**The date box is filled, never blank.** It started empty and nothing set it, so a coach who entered twenty-five results and pressed Save was refused with "Pick the date this session happened" — for a field at the top of a sheet they had scrolled past, which reads as the button doing nothing rather than as a refusal. A new session now opens on today (local time: `toISOString()` is UTC, and an evening session west of Greenwich would open on tomorrow) and a recorded one opens on **its own** date. The second matters more than the convenience: reopening to a blank box means the coach retypes it, and typing today *moves* the session — every result in it is re-attributed to a day it did not happen on, and `not_entered` then charges whoever joined the squad in between. `startingSessionDate` in `domain/session-entry.ts` holds both, and `session.openExisting` reads the history when the store does not already hold the session, because `SessionEntryView` opens that screen straight from a URL and never loads it.

### Recording numbers are assigned by the coach, in a block

`team_players.recording_number` is unique per team, and that shapes both ends of the feature.

**They are proposed, never assigned.** `proposeRecordingNumbers` fills a draft the coach accepts; nothing renumbers a squad on its own, because the numbers are what the paper sheets carry all season and both the Matrix board and the session grid are read against those sheets.

**A swap needs a clearing pass.** Writing one side of an exchange first hits the unique index even though the final state is legal, so `planNumberWrites` clears anything whose number is being taken before setting anything — and returns only the rows that changed. A duplicate is refused *before* any write starts, since the database would otherwise stop halfway and leave the squad part-renumbered.

Note the roster sorts on the **shirt** number while the Matrix board and session grid sort on the **recording** number. They are different numbers.

### The quiz is marked from the database, never from a key

`domain/quiz.ts` reads the correct letter from the `quiz_answers` row flagged `is_correct`, falling back to `correct_option` for a question whose options are still columns. **Nothing anywhere holds an answer key.** The original hardcoded `['B','A','A','B','C']` in the view, so editing a question silently broke the marking — a player answering correctly was told they were wrong, and the attempt was recorded that way. `quiz.test.ts` gives a question the opposite stored answer and expects the marking to follow.

A question with **no** stored correct answer marks nothing right, not even the option the player picked: defaulting to A would quietly award or deny a point on a half-written question.

**A question may name the daily message it tests.** `fetchTeamQuiz` only asks such a question while that message is the team's active one, which stops last week's questions testing a focus nobody remembers — and means deleting a daily message quietly shortens the quiz. `DailyThought.vue` says so before deleting one.

### An export invents nothing, and an import previews before it writes

The original export shipped a hardcoded sample quiz question, a fabricated match result, two made-up user profiles and Beaumont's name, code, mascot and city as defaults. **An export is a backup**, so re-importing one injected all of that. An empty table now exports an empty sheet with its headers, which is what tells a coach the table is empty. The eleven tables are defined once in `domain/workbook.ts` — the original wrote the list out three times and they had drifted.

**The import describes what it would change and applies on a second, informed press.** The original applied as it read, so a misread column was discovered after it had overwritten a season.

**And a team is never guessed.** A spreadsheet names a team as text and the database holds uuids; a row written against the wrong team is a player on a squad they never played for, in `team_players`, where minutes, ratings and recording numbers live. Unrecognised names are put to the coach to map, and applying is refused while any are unmapped.

**`MatrixLogs` is export-only** — there is no import branch for it, so a full restore silently omitted Matrix history until the preview started saying so. The **Profiles** sheet exports with its headers and no rows, because no service method reads an organization's profiles; the screen says so rather than letting an empty sheet read as "no users".

### Practice plans — four traps in the storage shape

`practice_plans` predates most of the conventions here, and each of these is a failure the app has actually hit. `domain/plan-row.ts` and `stores/planner.ts` exist largely to hold them.

- **`saveFullPracticePlan` upserts and never deletes.** A drill removed locally is still a row and returns on the next reload. Removing one means calling `deletePracticePlanItem` for its id as well.
- **A plan is rows, not a record.** There is no plans table: a plan is whatever rows share a `name`, so grouping is client-side. Older rows carry the plan name in a `[Plan: X]` prefix inside `coach_notes`, which the grouping reads out and strips.
- **Plan rows carry ids that belong to a team.** Merging another team's plans into the picker let a coach load one, which copied that team's row ids into the working plan — and the next edit upserted on those ids under the new team, *moving* the other team's rows. An empty team must show an empty picker. Never merge.
- **`saveFullPracticePlan` returns `{ success }`, not `{ ok }`**, and `savePracticePlanItem` returns the row or `null`. Reading `res.ok` on either is always `undefined`, so every successful save reports as a failure.

A fifth is not the table's fault but bites the same way: a newly added drill must be written with `savePracticePlanItem`, because that is what returns its id. Added through the full-plan save it has none, so the *next* save inserts a second copy — visible only after a reload.

### A setup store must not return plain helper functions

`createTestingPinia` with `stubActions` replaces *every* function a store returns, so a helper that looks like a getter hands a component test `undefined`. `stores/lineup.ts` carries a comment about this after the lineup modal fell over on it, and `stores/plus-minus.ts` hit it a second time. **Pure functions of a prop belong in the component**, calling `src/domain/` directly.

Two more test-side traps worth knowing: `vi.clearAllMocks()` clears calls but **not** implementations, so a `mockResolvedValue` set before a mount helper that re-sets defaults is overwritten — put defaults in `beforeEach` or set overrides after mounting. And `ref()` deep-wraps array items in reactive proxies, so rolling back by object identity (`arr.filter(x => x !== item)`) silently matches nothing; match on a field.

## `src/domain/` — the extracted logic

Thirty-four framework-free modules: no DOM, no `localStorage`, no Supabase, no `this`. That is the whole point — they can be tested without booting the app, and their tests import them directly.

They arrived in two waves. **Thirteen were cut off the original's `BHSSoccerApp` prototype** during Phase 0 — `schedule`, `matrix`, `matrix-session`, `lineup`, `plus-minus-court`, `round-robin`, `season`, `progress`, `report`, `recording-numbers`, `roster`, `csv` and `upsert` — and the rest were added by the rebuild as it needed them: `season-record`, `theme`, `roster-view`, `schedule-view`, `help-search`, the four table read mappings (`schedule-row`, `player-row`, `coach-row`, `matrix-standings`), the Matrix's five (`matrix-threshold`, `matrix-breakdown`, `time`, `band-score`, `session-entry`), the planner's four (`practice-plan`, `plan-row`, `drill-time`, `plan-print`), and the admin's three (`quiz`, `workbook`, `import-plan`).

That history is worth knowing for one reason: the thirteen used to be published on `window` so the classic scripts could reach them, and their tests were agreement tests that loaded a legacy script with `?raw` and checked both implementations matched. Phase 7 deleted the scripts and gave the seven modules that had **only** that coverage — `csv`, `upsert`, `progress`, `report`, `roster`, `round-robin`, `season` — direct tests instead. There is no `window` namespace and no `test-globals.ts` any more.

`band-score.ts` is the only scoring the browser does at all; everything else comes from Postgres. It duplicates `SupabaseService.factorForTime` on purpose, so a coach sees what each time earns as it is typed, and its test runs both over the same inputs — two readings of "the tightest band it fits" that disagree would show one number and store another.

`time.ts` deserves a note, because a second implementation of it is the easy mistake: `parseTimeToSeconds` treats `.` as `:`, so `"4.30"` is four minutes thirty and not four-point-three, and it **refuses** a single-digit seconds field because `"4:5"` could be `4:05` or `4:50`. `src/data/supabase.ts` has its own copy that must agree, and `time.test.ts` runs both over the same inputs to prove it.

`src/data/plus-minus.ts` (event replay) and `src/data/season-stats.ts` predate this directory and stay where they are. `domain/plus-minus-court.ts` is deliberately separate from the replay engine — one is the pitch, the other is the arithmetic.

## `src/diagram/` — the tactical board

Six modules holding what was one 1,021-line class.

| Module | Holds |
| --- | --- |
| `draw.ts` | `drawPitch`, `drawPath`, `drawElement`, `renderBoard` — functions of a context |
| `geometry.ts` | Pointer position, hit testing, the coarse-pointer radius |
| `frames.ts` | Keyframes, propagation, renumbering, interpolation |
| `serialize.ts` | The `diagram_data` blob, read and written |
| `board.ts` | The engine: a canvas, and one `onChange` callback |
| `raster.ts` | A stored diagram as a PNG, for the printed plan |

Three things before touching any of it.

**`diagram_data` is stored, unversioned and irreplaceable.** Every drill in `drills_bank` and every plan row may carry one, and there is no migration path or validation. A reader that expects a subtly different shape orphans every diagram a coach has drawn, and *nothing on screen would say so* — the board just opens empty.

`src/diagram/legacy/diagrammer.legacy.js` therefore survived the deletion of the original app, as a **test fixture**. Four tests build a diagram on it, export with it, and hand the blob to both loaders to compare. It is a golden master for a format still in the database: if the two disagree, the stored blobs agree with the legacy one. Do not edit it to match a change in `src/diagram/`, and do not delete it. `src/diagram/legacy/README.md` says the same thing next to the file.

Its redundancy is deliberate: `elements` and `drawings` are written alongside the keyframes even though frame 0 holds the same thing, which is what lets a reader that knows nothing about keyframes still open the diagram. A pre-keyframe blob — `elements` and `drawings`, no `keyframes` — is a real shape in the library and must keep loading.

**Coordinates are canvas pixels.** A resize that does not rescale everything by the same factor slides every player relative to the pitch: a diagram that still renders, still saves, and no longer means what it did. `board.resize()` rescales every keyframe, not just the visible one, and `raster.ts` renders at the board's native 800×480 for the same reason.

**`node-canvas` is not installed**, so `getContext('2d')` returns null under jsdom and no test here asserts on a pixel. The drawing tests use a recording stub — evidence a routine ran and branched correctly, not that it looks right. `raster.ts` returns null rather than throwing when there is no context, so the print path drops the diagrams and still prints the plan.

## Data flow

Postgres is the source of truth. Every mutation writes through `supabaseService` and a reload repopulates state; nothing is cached to disk.

Supabase rows are **snake_case** (`class_year`, `matrix_stats`, `coach_notes`, `diagram_data`); app state is **camelCase**. There is no ORM — every field is hand-mapped, on read in the store and on write in each `upsert*` method of `src/data/supabase.ts`. Adding a column means editing both sides. Soft deletes are a repo-wide convention: rows carry `is_deleted` and readers filter on it.

Credentials resolve in order: `window.ENV_SUPABASE_URL` / `ENV_SUPABASE_ANON_KEY` → `localStorage['bhs_supabase_url' / 'bhs_supabase_anon_key']` (settable from the admin panel via `setCredentials`) → a hardcoded project URL and anon key in the file. If none produce a valid client, every service method returns `null` — so "nothing loaded from the DB" is usually an unconfigured client, not a query bug.

**Ten service methods default `schoolId` to `'bhs'`, and calling one without an argument is a multi-tenant bug that will not announce itself.** `getSchoolUuid`, `fetchPendingApprovals`, `fetchPlayers`, `fetchSoccerCategories`, `fetchDrillsBank`, `upsertDrillBankItem`, `fetchSchool`, `upsertSchool`, `fetchCoaches` and `upsertCoach` all fall through `requireOrg`, which warns and returns `'bhs'`. A club coach calling one bare is silently served Beaumont's data. **Always pass the resolved organization.** Where a team-scoped equivalent exists — `fetchTeamRoster(teamId)` for the roster — prefer it: it has no default to fall through.

Removing the defaults is worth doing and is not small, since it wants its own commit rather than being folded into a view.

Two methods worth knowing about individually:

- **`deleteCoach` returns nothing at all** — it logs its error and falls off the end, so success and failure are indistinguishable from the return value. The store reloads and checks whether the row survived rather than reporting a success it cannot verify.
- **`fetchSchool` and `upsertSchool` key on `schools.code`**, not the uuid. Passing a uuid matches no row, silently. `SchoolProfileSection.vue` names its prop `schoolCode` for exactly this reason. `upsertSchool` also fills a blank name, mascot and city with Beaumont's, which is why the profile form refuses to send one.

### Teams

`schools` holds organizations. `teams` belong to a school; `team_players` is the membership and carries everything that varies by team (number, position, season stats, ratings), so `players` is pure identity and one person can appear on a school team and a club team with separate statistics. `unique (school_id, player_id)` on the membership enforces one team per organization, and a composite foreign key to `teams (id, school_id)` stops that column drifting from its team's.

The active team is a per-device preference in `localStorage` under `bhs_active_team_id`, resolved by `resolveActiveTeam` in `src/data/team-scope.ts` — and only honoured while the viewer still has access, so a coach removed from a team stops seeing it. Writes are team-scoped through `public.is_team_coach()`; reads stay public, with one exception: since `0029`, `daily_thoughts` is readable only by the team's own players, its coaches and admins, through `public.is_team_member()` — the coach's message is for the squad. Re-running `0015` or section 6 of `supabase_migration_auth.sql` restores the public read; re-apply `0029` after either.

### Drill categories belong to an organization

Since `supabase/migrations/0027_scope_soccer_categories.sql`. Before it, `soccer_categories` had no `school_id` at all — `supabase_schema.sql` declares one, but production never had it, which is why `demo_schema.sql` drops it explicitly — and `name` was globally `UNIQUE` with the upsert conflicting on it. Every organization shared one list, a club coach was shown Beaumont's categories, and two clubs could not both have a "Possession": the second save updated the first's row.

Three things about that migration are worth knowing:

- **It copies every existing category into every organization** rather than backfilling them to Beaumont. Nothing records who created a row, so backfilling would silently take away a category a club had added and open every club's editor empty.
- **The unique index covers retired rows too.** The partial index reads better, but PostgREST cannot upsert against one and every save would fail with `42P10`. The full index also gives the better behaviour: re-adding a retired category revives it instead of leaving a second row beside an invisible first.
- **It must be applied before the client that reads it.** PostgREST answers `42703` for a column that is not there, so an unmigrated database shows every category list as empty.

**Every category method takes the organization** — `fetchSoccerCategories`, `upsertSoccerCategory`, `fetchCategoryUsage`, `renameSoccerCategory`, `mergeSoccerCategory` and `retagDrills`. The last three matter most: they work by **name**, so unscoped, merging a club's "Warmup" re-tagged Beaumont's drills and retired their category of that name. `fetchDrillsBank` was fixed in the same change and for the same reason.

`drills_bank.category` is still free TEXT rather than a foreign key, which is why `CategoriesSection.vue` shows names no category row has as their own group — the drift is visible rather than silent, and each can be adopted or merged.

**A drill's name is unique per organization, since `0033_scope_drill_names.sql`** — the same fix, for the same reason. `upsertDrillBankItem` conflicted on `name` alone, which needed an index no migration created: production had one from before the migrations, so saving a drill worked there and answered `42P10` on any database built from them, the demo included. Two organizations can now both keep a "Rondo 4v2"; before, the second save overwrote the first's row.

### Auth & RBAC

`src/auth.ts` exports a singleton `AuthManager` over **real Supabase Auth** (`auth.users`), joined to a `public.profiles` row holding `role`, `status`, `school_id`, `player_id`. Roles: `guest` / `player` / `coach` / `admin`. The guards — `auth.isCoach()`, `auth.isAdmin()`, `auth.canAccessRatings()`, `auth.isLoggedIn()` — all additionally require `status === 'active'`; signup lands in a pending-approval state that a coach or admin clears via `approveProfile`/`rejectProfile`.

These client-side guards are **UI affordances only. Real enforcement lives in the RLS policies** in `supabase_migration_auth.sql`; a new privileged operation needs a policy there, not just an `isCoach()` check.

**`/admin` is gated coach-or-admin, with each section gated individually.** Guarding the route on `can_access_admin_dashboard` is the obvious design and is wrong: `schema_roles.sql` grants that to `admin` alone, while the categories, the unassigned players and the quiz bank are a coach's. And the permission fails closed when `fetchRoles()` returns null — the client unconfigured, or `roles` unreadable — which would lock a real admin out of the panel they would visit to diagnose exactly that, so `AdminView` says so rather than rendering nothing.

### SQL files

Applied by hand in the Supabase SQL editor, in this order:

1. `supabase_schema.sql` — the 14 original tables with UUID PKs.
2. `schema_roles.sql` — `roles` with JSONB granular permissions.
3. `seed_data.sql` — BHS demo data.
4. `supabase_migration_auth.sql` — **supersedes** the RLS story in the first two (it says so explicitly; they are historical provisioning scripts). Adds the `handle_new_user`/`handle_user_confirmed` triggers, `SECURITY DEFINER` helpers (`current_profile_role()`, `current_profile_school_id()`) that avoid RLS self-recursion, a column-guard trigger blocking self-service role/status escalation, and per-table policies. Its first step **deletes all `public.profiles` rows** to re-link the table to `auth.users`.
5. `supabase/migrations/0005_multi_team_schema.sql` — teams, memberships, team-scoped RLS.
6. `supabase/migrations/0008_schedule_real_date.sql` — `match_on`/`kickoff_time` derived by a trigger.
7. `supabase/migrations/0009_weighted_matrix_scoring.sql` — drill weights, `measure`, the `matrix_session*` tables, the rewritten `matrix_standings`.
8. …through `supabase/migrations/0034_team_match_minutes.sql`.

Prefer adding a new dated migration over editing an already-applied script.

**`supabase_schema.sql` does not describe the live database. Verify columns against the running database before writing SQL or code that depends on them.** The drift is not confined to the RLS story item 4 supersedes:

| Declared in `supabase_schema.sql` | Actually |
| --- | --- |
| `drills_bank.points INT DEFAULT 3` | **does not exist** (added by `0009`) |
| `drills_bank.duration TEXT NOT NULL` | **does not exist** |
| `soccer_categories.school_id` | **did not exist** until `0027` added it |
| `players.class_year TEXT NOT NULL` | exists, and `0005` did *not* drop it — unlike `number`/`position` |

Each cost a failed migration or a rendering bug. Two habits avoid it:

- A `select` naming a column returns PostgREST `42703` when it is missing, so probing one column at a time distinguishes "absent" from "empty table":
  `curl -s "$URL/rest/v1/drills_bank?select=points&limit=1" -H "apikey: $KEY"`
- A `select *` on any row lists the columns that really exist — though it says nothing about nullability or defaults.

Migrations that add a column should prefer `add column if not exists` over `alter column`, so they are correct against both the live database and the declared schema. And **test a migration by running it** against `src/data/testdb/` rather than by reading it: `0027`'s own copy step failed on the unique index it had not dropped yet, and only Postgres said so.

The Supabase SQL editor may run as a role that is a **member** of `postgres` without defaulting to it. `ALTER TABLE` and `CREATE POLICY` check ownership rather than privilege, so they fail with `42501: must be owner of table …` even when the privilege is reachable. `set role postgres;` immediately after `begin;` fixes it.

### The demo database

The demo site builds `main` like production and differs only by its Vercel
variables (`VITE_DEMO_MODE=true`, the demo project's `VITE_SUPABASE_*`,
`VITE_DEMO_PASSWORD`). Its database — Supabase project `nzelhvipofeqoteewvhg` —
is **rebuilt from `main`'s migrations every night and on every migration push**
by `.github/workflows/demo-rebuild.yml`, then given the sample program and nine
fixed accounts. Runbook: `docs/runbooks/2026-09-11-demo-rebuild-runbook.md`.

Three things follow for anyone writing a migration:

- **A migration must apply to an empty database.** One that inserts data by a
  production UUID or a Beaumont name aborts the rebuild. Put the data change in
  its own file and add it to `SKIP` in `scripts/demo-rebuild-lib.mjs`, or add
  the single statement to `CUTS`.
- **A column added to production by hand breaks the demo.** The rebuilt database
  lacks it, and the app's saves fail there with `42703`. Record it in a
  migration with `add column if not exists`, as `0032` did.
- **Demo SQL is never a migration.** It lives in `Resouces/SQL/demo/`, refuses a
  database containing `bhs` or `lfc`, and must never be copied into
  `supabase/migrations/`. Never set `VITE_DEMO_MODE` on the production project.

## Conventions

- **Component styles are scoped and style against the ground tokens in `index.css`** — `--ground`, `--surface`, `--surface-deep`, `--ink`, `--ink-muted`, `--ink-soft`, `--rule`, `--rule-strong`, `--live`, `--mark`, `--heading-face`, `--shadow-md` — never a literal colour. The same names are defined for three grounds (`paper`, `pitch`, `ledger`) under `data-ground` on `<html>`, which the router sets from `meta.ground` (`src/router/ground.ts`). The organization's colours arrive as `--org-primary` / `--org-secondary` (raw, for stroke) and `--org-mark-paper` / `--org-mark-dark` (after the 3:1 contrast guard in `domain/theme.ts`); `--mark` reads the right one per ground. The one fill on the paper ground is the home page's band, which uses `--org-band` (the primary guarded to 4.5:1 against its white text, else the dark navy) — see `docs/superpowers/specs/2026-09-10-home-hero-design.md`. The `--bhs-*` aliases are gone as of phase 5; `src/design-tokens.test.ts` walks every component and fails on one. `src/design-tokens.test.ts` guards all of this, including that no component style hardcodes a white.
- **Routes carry `meta.chrome: 'tool'`** to render without the header, nav and footer; the touchline and session screens draw their own bars. Spec: `docs/superpowers/specs/2026-09-07-mobile-restyle-design.md`.
- `tsconfig.json` is deliberately loose (`strict: false`, `noImplicitAny: false`) so the ported code type-checks without a rewrite. Don't tighten it as a side effect of another change.
- **`typescript` is pinned to 5.x on purpose — do not upgrade to 7.** TypeScript 7 is the native Go rewrite and exports only `.` and `./unstable/*`; `vue-tsc` resolves `typescript/lib/tsc`, which that layout does not have, so it dies with `ERR_PACKAGE_PATH_NOT_EXPORTED` and cannot run at all. Without it nothing type-checks a `.vue` file's script block or its templates. Deferred until `vue-tsc` supports TypeScript 7, not abandoned.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `refactor:`).
