# Vue Migration Phase 0, Clusters 3–6 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Phase 0 by lifting the lineup, plus-minus court, reports and shared-helper logic out of the `BHSSoccerApp` prototype into `src/domain/`, leaving the legacy app running unchanged.

**Architecture:** Identical to clusters 1–2. Each extracted function becomes a pure export taking its data as parameters; `src/main.ts` publishes the module as a `window` namespace; the prototype method shrinks to a delegation.

**Tech Stack:** TypeScript (`strict: false`), Vitest, Vite. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-05-vue-migration-design.md`

**Predecessor:** `docs/superpowers/plans/2026-09-05-vue-migration-phase-0-clusters-1-2.md`, which proved the mechanism over three modules and 56 new tests. **Read its "The shim pattern, used by every task" section before starting** — this plan does not restate it.

## Global Constraints

Unchanged from the predecessor plan, and they still bind:

- **No Vue.** Not a dependency, not a component, not a build change.
- **No behavioural change.** Where extraction reveals a bug, record it in the commit message and leave it alone.
- **No redesign.** The UI is untouched.
- `tsconfig.json` stays loose — `strict: false`, `noImplicitAny: false`. Do not tighten it, and **do not raise `lib` to reach newer array methods** — `.at()` is unavailable, so index from `length - 1`. This cost a failed typecheck in the predecessor.
- Extracted functions are side-effect free: no DOM, no `localStorage`, no Supabase, no `this`.
- Conventional Commits.
- Four gates on every commit: `npm test`, `npm run typecheck`, `npm run build`, `node --check` on every edited classic script.

## What the classifier says, and what it missed

Every candidate below was read before this plan was written, rather than trusted from the spec's inventory. The exclusions are therefore known, not guessed. Baseline entering this plan: **1,740 tests across 89 files.**

| Cluster | Module | Extract | Leave behind, and why |
| --- | --- | --- | --- |
| 3 | `domain/lineup.ts` | 15 methods | `applySavedLineup` mutates app state; `setLineupFormation`, `pickLineupPlayer`, `tapLineupSlot`, `toggleLineupBench`, `resetLineup` all mutate **and** re-render |
| 4 | `domain/plus-minus-court.ts` | 17 methods | `pmLoadPositions`/`pmSavePositions` touch `localStorage`; `pmArm`, `pmApplyFormation`, `setPlusMinusSort` mutate and re-render; `pmSortedRows` needs a read before deciding (see Task 2) |
| 5 | `domain/round-robin.ts`, `season.ts`, `progress.ts`, `report.ts`, `recording-numbers.ts` | 16 methods | `useShirtNumbersAsRecording` and `clearRecordingNumberDrafts` mutate and re-render; `seasonSortedRows` needs a read (see Task 3) |
| 6 | `domain/roster.ts`, `csv.ts`, `upsert.ts` | 10 methods | `matrixPlayerOptions` returns `<option>` markup |

**The `.at()` gotcha and the fake-window fix-up are the two known costs.** In clusters 1–2 the fix-up touched 16 test files. Expect similar here; Task 5 folds in the shared helper that stops it growing.

## A note on the blast radius

The predecessor over-predicted which legacy tests would break — 7 of 13 for one module, 7 of 8 for another. The reliable procedure, used in every task below, is: make the shim, run the full suite, patch exactly the files that fail. Do not patch by prediction.

---

### Task 1: `domain/lineup.ts`

The biggest single module in Phase 0 by method count, and the best covered — `src/data/lineup.test.ts` is 898 lines.

**Files:**
- Create: `src/domain/lineup.ts`, `src/domain/lineup.test.ts`
- Modify: `public/js/views/lineup.view.js`, `src/main.ts`
- Modify: whichever tests the suite reports failing

**Interfaces:**
- Consumes: the shim pattern (predecessor plan).
- Produces:
  ```ts
  export interface LineupSlot { slot: string; x: number; y: number }
  export interface DropTarget {
    playerId: string; fromSlot?: string; overSlot?: string; overSquad?: boolean;
  }

  export function lineupFormations(): Record<string, LineupSlot[]>;
  export function lineupSlots(formation: string): LineupSlot[];
  export function lineupSquad(players: any[], teamId: string): any[];
  export function assignLineupSlot(assignments: Record<string, string>, slot: string, playerId: string): Record<string, string>;
  export function clearLineupSlot(assignments: Record<string, string>, slot: string): Record<string, string>;
  export function lineupStarters(assignments: Record<string, string>, squad: any[], formation: string): any[];
  export function lineupBench(assignments: Record<string, string>, squad: any[], formation: string): any[];
  export function lineupRowsForSave(assignments: Record<string, string>, squad: any[], formation: string): any[];
  export function resolveLineupDrop(drop: DropTarget): { action: string; slot?: string };
  export function applyLineupDrop(assignments: Record<string, string>, drop: any): Record<string, string>;
  export function lineupCopySources(schedule: any[], currentId: string): any[];
  export function lineupShortName(p: any): string;
  export function lineupGrade(p: any): string;
  export function fixturesWithoutLineup(schedule: any[], lineups: any[]): any[];
  export function lineupCardDensity(starters: any[], bench: any[]): string;
  ```
  Confirm each signature against the source before writing it — the parameter each method needs is whatever `this.*` it currently reads.

- [ ] **Step 1: Read the source before extracting**

Run: `sed -n '37,200p;300,360p;570,760p' public/js/views/lineup.view.js`

Note for each of the 15 methods exactly which `this.*` it reads. `assignLineupSlot` and `clearLineupSlot` are flagged pure but take a slot map — decide whether they mutate the map in place or return a new one, and **preserve whichever the original does**; changing it is a behavioural change.

- [ ] **Step 2: Write `src/domain/lineup.test.ts`**

Port the cases from `src/data/lineup.test.ts`, which already covers formation slot geometry (every formation has 11 slots, unique slot names, coordinates within 0–100), drop resolution, and grading. Import the module directly; no `?raw`, no fake window. Cover at minimum:

- every formation returns exactly 11 slots, with unique names and x/y within 0–100
- `resolveLineupDrop` for each case: onto an empty slot, onto an occupied slot, from a slot back to the squad list, and a drop on nothing
- `lineupStarters` and `lineupBench` partition the squad without overlap
- `lineupGrade` and `lineupShortName` for a normal name, a single word, and a missing value
- `lineupCardDensity` at its thresholds

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/domain/lineup.test.ts`
Expected: FAIL — `Failed to resolve import "./lineup"`.

- [ ] **Step 4: Write `src/domain/lineup.ts`**

Move the 15 bodies verbatim, substituting the parameters identified in Step 1. Keep every explanatory comment. Do not touch the six excluded methods.

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run src/domain/lineup.test.ts`

- [ ] **Step 6: Publish the namespace and shim the view**

In `src/main.ts`, beside the existing three:

```ts
import * as lineupDomain from './domain/lineup';
// ...
/** Formation geometry, drag-and-drop resolution and squad partitioning. */
(window as any).lineupDomain = lineupDomain;
```

Then replace each of the 15 bodies with a delegation, passing the app state the module now needs. The six excluded methods keep their logic and call the module where it helps — for example `resetLineup` keeps its assignment and `renderCurrentView()` call.

- [ ] **Step 7: Verify the classic script parses**

Run: `node --check public/js/views/lineup.view.js`
Expected: no output.

- [ ] **Step 8: Run the suite, then patch exactly what fails**

```bash
npx vitest run 2>&1 | grep -E "^ *(FAIL|Test Files|Tests) " | sed 's/>.*//' | sort -u
```

For each failing file, add `import * as lineupDomain from '../domain/lineup';` after its last `?raw` import and `(globalThis as any).lineupDomain = lineupDomain;` immediately after its fake-window anchor — either `(globalThis as any).window = globalThis as any;` or `const w = globalThis as any;`.

- [ ] **Step 9: Run all four gates**

```bash
npm test
npm run typecheck
npm run build
node --check public/js/views/lineup.view.js
```

- [ ] **Step 10: Commit**

```bash
git add src/domain/lineup.ts src/domain/lineup.test.ts src/main.ts public/js/views/lineup.view.js src/data/
git commit -m "refactor: extract lineup geometry and drop resolution

Fifteen of lineup.view.js's twenty-one candidates were genuinely pure.
applySavedLineup mutates app state, and setLineupFormation,
pickLineupPlayer, tapLineupSlot, toggleLineupBench and resetLineup all
mutate and re-render, so they keep their bodies and call the module.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `domain/plus-minus-court.ts`

Named apart from the existing `src/data/plus-minus.ts`, which is the event-replay engine. This is the pitch-and-positions logic from the view. Covered by `plus-minus-gestures.test.ts` (2,039 lines) and `plus-minus-touch.test.ts` (318).

**Files:**
- Create: `src/domain/plus-minus-court.ts`, `src/domain/plus-minus-court.test.ts`
- Modify: `public/js/views/plusminus.view.js`, `src/main.ts`, whichever tests fail

**Interfaces:**
- Produces:
  ```ts
  export interface TapContext { armed: string | null; fingers: number; rightClick: boolean; onPitch: boolean }
  export interface DropContext {
    playerId: string; wasOn: boolean; overPitch: boolean; overBench: boolean;
    onCount: number; overPlayerId?: string;
  }

  export function pmClock(events: any[]): any;
  export function pmStats(events: any[], squad: any[]): any;
  export function pmOnPitch(events: any[]): string[];
  export function pmClockRunning(events: any[]): boolean;
  export function pmClockEverStarted(events: any[]): boolean;
  export function pmResolveTap(ctx: TapContext): { kind: string; [k: string]: any };
  export function pmPosKey(matchId: string, fixture: string): string;
  export function pmPosVersion(): number;
  export function pmClampPosition(x: number, y: number): { x: number; y: number };
  export function pmSetPosition(positions: any, playerId: string, x: number, y: number): any;
  export function pmPerRow(count: number): number;
  export function pmSpreadSlot(slot: number, ...rest: any[]): { x: number; y: number };
  export function pmPositionFor(positions: any, playerId: string, index: number, total: number): { x: number; y: number };
  export function pmMaxOnPitch(): number;
  export function pmResolveDrop(ctx: DropContext): { action: string; [k: string]: any };
  export function pmStartersFromLineup(lineup: any): string[];
  export function pmColumns(): any[];
  ```
  Confirm every signature against the source; several of these read more `this.*` than their names suggest.

- [ ] **Step 1: Resolve the `pmSortedRows` question first**

Run: `sed -n '999,1030p' public/js/views/plusminus.view.js`

It was flagged as touching a render path. If the flag is a call to a genuine rendering helper, leave it in the view and say so in the commit message. If the match is incidental — a local variable or a comment — extract it as `pmSortedRows(stats, squad, sortKey, reversed)` and add it to the interface list above. Decide before writing the test, because it changes what the test covers.

- [ ] **Step 2: Read the source**

Run: `sed -n '53,110p;300,360p;405,560p;640,680p;960,1030p' public/js/views/plusminus.view.js`

Record which `this.*` each method reads. `pmPosKey` reads `this._pmMatchId` and `this._pmMatchFixture`; it takes both as parameters.

- [ ] **Step 3: Write `src/domain/plus-minus-court.test.ts`**

Port from `plus-minus-gestures.test.ts`, whose `pmResolveTap` cases are the model — one finger on the pitch, two fingers, three fingers, a right click, and each of those off the pitch. Cover at minimum:

- `pmResolveTap` for all five contexts, on and off the pitch
- `pmResolveDrop` onto the pitch when a place is free, onto a full pitch, onto the bench, and onto another player
- `pmClampPosition` at each boundary and beyond it
- `pmPerRow` and `pmSpreadSlot` for a squad of 1, 7 and 11
- `pmClockRunning` versus `pmClockEverStarted` for a clock never started, running, and paused — this distinction matters because statistics may only be recorded while the clock is actually running, not merely started

- [ ] **Step 4: Run it and watch it fail**

Run: `npx vitest run src/domain/plus-minus-court.test.ts`

- [ ] **Step 5: Write the module, then run the test to green**

Move the bodies verbatim with the parameter substitutions from Step 2.

- [ ] **Step 6: Publish the namespace and shim the view**

```ts
import * as plusMinusCourt from './domain/plus-minus-court';
// ...
/** The pitch, its positions and the gesture decisions. Distinct from
 *  data/plus-minus.ts, which replays the event log. */
(window as any).plusMinusCourt = plusMinusCourt;
```

`pmLoadPositions` and `pmSavePositions` keep their `localStorage` access and call `pmPosKey`/`pmPosVersion` through the module.

- [ ] **Step 7: Run the suite, patch exactly what fails, run all four gates, commit**

```bash
node --check public/js/views/plusminus.view.js
npm test && npm run typecheck && npm run build
git add src/domain/plus-minus-court.ts src/domain/plus-minus-court.test.ts src/main.ts public/js/views/plusminus.view.js src/data/
git commit -m "refactor: extract the plus/minus pitch and gesture logic

Named apart from data/plus-minus.ts, which replays the event log; this
is the court. pmLoadPositions and pmSavePositions keep their
localStorage access, and pmArm, pmApplyFormation and setPlusMinusSort
keep their mutate-and-redraw bodies.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The reports group

Five small modules, done together because each is a handful of functions with the same shape and they share no state. One commit.

**Files:**
- Create: `src/domain/round-robin.ts`, `season.ts`, `progress.ts`, `report.ts`, `recording-numbers.ts` and a `.test.ts` for each
- Modify: the five corresponding views, `src/main.ts`, whichever tests fail

**Interfaces:**
```ts
// round-robin.ts — from views/roundrobin.view.js
export function roundRobinPlayers(squad: any[]): any[];
export function roundRobinPlayed(logs: any[], drillId: string): Set<string>;
export function buildRoundRobin(players: any[], played: Set<string>): any[];
export function roundRobinCsv(pairings: any[]): string;

// season.ts — from views/season.view.js
export function seasonEsc(v: any): string;
export function seasonFullMatchMinutes(settings: any): number;
export function seasonColumns(): any[];

// progress.ts — from views/progress.view.js
export function progressLowerIsBetter(measure: string): boolean;
export function progressSeries(rows: any[], playerId: string): any[];
export function progressBlocksFor(series: any[], measure: string): any[];
export function buildProgressReport(rows: any[], players: any[]): any;

// report.ts — from views/report.view.js
export function reportStandardSeconds(bands: any[]): number | null;
export function buildSquadReport(players: any[], stats: any): any;

// recording-numbers.ts — from views/recording-numbers.view.js
export function proposeRecordingNumbers(roster: any[], start: number): any[];
export function suggestedNumberStart(roster: any[]): number;
export function rosterForNumbering(players: any[], teamId: string): any[];
```

- [ ] **Step 1: Resolve the `seasonSortedRows` question**

Run: `sed -n '999,1030p' public/js/views/season.view.js` — adjust the range to wherever `seasonSortedRows` sits; find it with `grep -n "seasonSortedRows" public/js/views/season.view.js`.

It was flagged as touching a render path. Apply the same judgement as Task 2 Step 1: extract it if the flag is incidental, leave it if it genuinely renders. Say which in the commit message.

- [ ] **Step 2: Recording numbers — read the rules before writing the test**

Recording numbers are assigned by the coach in a block per squad and must never be changed automatically, so `proposeRecordingNumbers` proposes and never applies. The test must assert that it returns proposals without mutating the roster it was given, and `suggestedNumberStart` must not renumber anyone already numbered.

- [ ] **Step 3: For each of the five modules, in order: write the test, watch it fail, write the module, watch it pass**

Take them one at a time — `round-robin`, `season`, `progress`, `report`, `recording-numbers` — rather than writing five modules and then five tests. Each is small enough that the whole cycle is a few minutes.

Coverage worth having in each:
- **round-robin:** every player is paired; nobody is paired with themselves; an odd squad leaves exactly one bye; a pairing already in `played` is not repeated; the CSV has one row per pairing
- **season:** `seasonFullMatchMinutes` for the default and for an overridden setting; `seasonEsc` on a string containing `<`, `&` and a quote
- **progress:** `progressLowerIsBetter` for a timed and a counted measure; `progressSeries` ordering; `progressBlocksFor` at a band boundary
- **report:** `reportStandardSeconds` with no bands, one band and several; `buildSquadReport` with a player who has no results
- **recording-numbers:** the two rules from Step 2, plus `rosterForNumbering` scoping to the active team

- [ ] **Step 4: Publish all five namespaces and shim all five views**

```ts
import * as roundRobinDomain from './domain/round-robin';
import * as seasonDomain from './domain/season';
import * as progressDomain from './domain/progress';
import * as reportDomain from './domain/report';
import * as recordingNumbersDomain from './domain/recording-numbers';
// ...
(window as any).roundRobinDomain = roundRobinDomain;
(window as any).seasonDomain = seasonDomain;
(window as any).progressDomain = progressDomain;
(window as any).reportDomain = reportDomain;
(window as any).recordingNumbersDomain = recordingNumbersDomain;
```

- [ ] **Step 5: Check every edited script parses, run the suite, patch what fails, run all four gates, commit**

```bash
for f in roundrobin season progress report recording-numbers; do node --check public/js/views/$f.view.js || echo "FAILED: $f"; done
npm test && npm run typecheck && npm run build
git add src/domain/ src/main.ts public/js/views/ src/data/
git commit -m "refactor: extract the reports group into src/domain/

Round robin, season, progress, squad report and recording numbers.
proposeRecordingNumbers proposes and never applies: numbers are assigned
by the coach in a block per squad and must not change on their own.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `domain/roster.ts`, `csv.ts` and `upsert.ts`

The shared helpers. `upsertByKey` is 76 lines and is used across the import path, so it is the most consequential function in this task despite the small method count.

**Files:**
- Create: `src/domain/roster.ts`, `csv.ts`, `upsert.ts` and a `.test.ts` for each
- Modify: `public/js/views/roster.view.js`, `public/js/admin.js`, `public/js/app.core.js`, `src/main.ts`, whichever tests fail

**Interfaces:**
```ts
// roster.ts — from views/roster.view.js
export function comparePlayers(a: any, b: any, by: string, reversed: boolean): number;
export function sortedPlayers(players: any[], by: string, reversed: boolean): any[];

// csv.ts — from admin.js
export function parseCsvText(text: string): string[][];
export function pickColumn(headers: string[], candidates: string[]): number;
export function compareMatrixPlayers(a: any, b: any): number;

// upsert.ts — from app.core.js
export function upsertByKey(existing: any[], incoming: any[], key: string | ((row: any) => string)): any[];
export function upsertByName(existing: any[], incoming: any[]): any[];
export function upsertByDateTime(existing: any[], incoming: any[]): any[];
export function photoOrPlaceholder(player: any): string;
export function activeTeamLabel(teams: any[], schools: any[], activeTeamId: string): { team: string; school: string };
```

- [ ] **Step 1: Read `upsertByKey` in full before anything else**

Run: `grep -n "upsertByKey" public/js/app.core.js` then read all 76 lines.

It is the import path's merge rule, so its edge cases are the ones that matter: a duplicate key in the incoming rows, a row already soft-deleted, and a key that is a function rather than a string. Understand all three before writing the test.

- [ ] **Step 2: `csv.ts` — write the test, watch it fail, write the module, watch it pass**

`parseCsvText` is 43 lines and handles quoting, so cover: a quoted field containing a comma, a quoted field containing an escaped quote, a trailing newline, a blank line mid-file, and CRLF line endings.

`pickColumn` resolves a header by candidate names — cover an exact match, a case-mismatched match, and no match at all.

- [ ] **Step 3: `upsert.ts` — same cycle**

Cover the three edge cases from Step 1, plus `activeTeamLabel` when the active team id matches nothing, which must not throw.

- [ ] **Step 4: `roster.ts` — same cycle**

`comparePlayers` shares the unnumbered-sinks-in-both-directions rule with the matrix comparators; assert it here too rather than assuming it.

- [ ] **Step 5: Publish, shim all three files, check they parse**

```ts
import * as rosterDomain from './domain/roster';
import * as csvDomain from './domain/csv';
import * as upsertDomain from './domain/upsert';
// ...
(window as any).rosterDomain = rosterDomain;
(window as any).csvDomain = csvDomain;
(window as any).upsertDomain = upsertDomain;
```

```bash
node --check public/js/views/roster.view.js
node --check public/js/admin.js
node --check public/js/app.core.js
```

`app.core.js` defines the class every other view extends, so a syntax error there takes the whole app down rather than one screen. Check it before running anything else.

- [ ] **Step 6: Run the suite, patch what fails, run all four gates, commit**

```bash
npm test && npm run typecheck && npm run build
git add src/domain/ src/main.ts public/js/ src/data/
git commit -m "refactor: extract the roster, CSV and upsert helpers

Completes Phase 0. upsertByKey is the import path's merge rule and the
most consequential of these; its duplicate-key, soft-delete and
function-key cases are now covered directly.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Close out Phase 0

Documentation and the two pieces of tooling debt the work exposed. Not optional: the next phase reads `CLAUDE.md` to find its way around, and it is currently wrong in ways that would mislead.

**Files:**
- Create: `src/domain/test-globals.ts`
- Modify: `check_syntax.ps1`, `CLAUDE.md`

- [ ] **Step 1: Add the shared test helper**

Sixteen test files in clusters 1–2 gained a hand-written namespace assignment, and this plan adds more. Collapse them:

```ts
/**
 * Install every src/domain/ namespace on the global object.
 *
 * The classic scripts under public/js/ reach extracted logic through window.
 * Tests that evaluate those scripts through ?raw build a window by hand, so
 * each one needs the namespaces too. Calling this beats sixteen copies of the
 * same three lines, and means a new domain module is wired into every test at
 * once.
 */
import * as scheduleDomain from './schedule';
import * as matrixDomain from './matrix';
import * as matrixSessionDomain from './matrix-session';
import * as lineupDomain from './lineup';
import * as plusMinusCourt from './plus-minus-court';
import * as roundRobinDomain from './round-robin';
import * as seasonDomain from './season';
import * as progressDomain from './progress';
import * as reportDomain from './report';
import * as recordingNumbersDomain from './recording-numbers';
import * as rosterDomain from './roster';
import * as csvDomain from './csv';
import * as upsertDomain from './upsert';

export function installDomainGlobals(target: any = globalThis): void {
  Object.assign(target, {
    scheduleDomain, matrixDomain, matrixSessionDomain, lineupDomain,
    plusMinusCourt, roundRobinDomain, seasonDomain, progressDomain,
    reportDomain, recordingNumbersDomain, rosterDomain, csvDomain, upsertDomain
  });
}
```

Do **not** rewrite the existing test files to use it in this task — that is a large mechanical diff with no behavioural benefit, and those files are retired as their views are replaced in phases 2 through 6. Use it in tests written from here on.

- [ ] **Step 2: Fix the syntax gate**

`check_syntax.ps1` holds a hardcoded list of 11 paths and there are 22 files under `public/js/`. It silently skipped `matrix-session.view.js` while that file was being edited in clusters 1–2. Replace the list with a glob:

```powershell
$files = Get-ChildItem -Path 'public\js' -Recurse -Filter '*.js' | ForEach-Object { $_.FullName }
```

Keep the existing per-file `node --check` loop and the "All modules passed syntax check!" summary.

- [ ] **Step 3: Verify the gate now sees every file**

Run: `powershell -File check_syntax.ps1`
Expected: 22 `OK:` lines, not 11.

- [ ] **Step 4: Correct `CLAUDE.md`**

Three things in it are now wrong or missing:

- It claims **"80 tests"**. The count is whatever `npm test` reports at this point — over 1,700.
- It omits ten view files: `lineup`, `plusminus`, `season`, `report`, `progress`, `roundrobin`, `recording-numbers`, `matrix-session`, `thoughts`, `help`.
- It says nothing about `src/domain/`. Add a short section: the modules are framework-free and side-effect free, they are published on `window` by `src/main.ts` for the classic scripts, and tests import them directly rather than through `?raw`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/test-globals.ts check_syntax.ps1 CLAUDE.md
git commit -m "chore: close out Phase 0 — test helper, syntax gate, docs

check_syntax.ps1 listed 11 of the 22 files under public/js and silently
skipped matrix-session.view.js while it was being edited; it now globs.
CLAUDE.md claimed 80 tests, omitted ten view files and had no mention of
src/domain/.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Definition of done for Phase 0

- Every function in the four tables above is either extracted or explicitly excluded with a recorded reason.
- `npm test`, `npm run typecheck`, `npm run build` and `check_syntax.ps1` all pass, with the test count never below 1,740.
- `npm run dev` still serves an app that behaves as it did before Phase 0 began.
- `CLAUDE.md` describes the repository as it actually is.

Phase 1 — the Vue foundation — then starts against a codebase whose logic is tested independently of the UI about to be replaced. Its first blocker is already known: **`src/components/` is a permission-denied ghost directory** held by a running `node` process, and it must be cleared before anything can be scaffolded there.
