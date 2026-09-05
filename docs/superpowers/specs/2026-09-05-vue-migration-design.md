# Vue Migration — Strategy, and Phase 0 in Detail

**Status:** approved in outline, ready for an implementation plan for Phase 0
**Date:** 2026-09-05
**Branch:** `feature/convertToVue`
**Scope note:** this document settles the *strategy* for the whole migration and
specifies *Phase 0* to implementation depth. Phases 1–7 each get their own spec
when their turn comes; the phase table below is not a substitute for them.

## Problem

The application renders itself by building HTML strings and assigning them to
`innerHTML`. One class, `BHSSoccerApp`, is assembled at load time across
nineteen files, each of which bolts methods on with
`Object.assign(BHSSoccerApp.prototype, { ... })`. Views are wired to the DOM
through a global `app` and inline `onclick="app.method(...)"` attributes spread
across a 1,578-line `index.html` and the rendered template strings themselves.

Three consequences drove the decision to move to Vue.

**Structure.** Renaming a prototype method means grepping `index.html` and every
view's template strings, and nothing checks that boundary. The largest view file
is 2,344 lines; the admin panel is 3,323.

**Reactivity.** Every screen update is a manual `innerHTML` swap followed by
`attachDynamicListeners()`. State changes do not propagate; the code re-renders
whole views by hand. The planner has to re-initialise its canvas on a
`setTimeout` because it must wait for its own markup to land in the document.

**Velocity.** New features are slow to build because each one must be threaded
through all three of those mechanisms.

## The shape of what exists

Measured on 2026-09-05, at commit `a8e56b8`.

| Layer | Size | Role |
| --- | --- | --- |
| `public/js/*.js`, `public/js/views/*.js` | ~16,000 lines across 22 files | The live UI |
| `index.html` | 1,578 lines | Markup, 36 modals, inline handlers |
| `src/data/supabase.ts` | 3,891 lines | All reads and writes, hand-mapped |
| `public/js/diagrammer.js` | 1,021 lines | Canvas tactical board |
| `public/js/admin.js` | 3,323 lines | Admin panel, XLSX import/export |
| Test suite | 86 files, 1,684 tests, all passing in 38s | — |

The application's real structure is **seven navigation views and thirty-six
modals**. The navigation is Home, Roster & Bios, Schedule & Results, Player
Ratings, Coach Planner, Coaching Staff, and Help. The heavy features — plus/minus
match tracking, the lineup board, the season and progress reports, the round
robin, recording numbers, matrix session entry — are all modals, not menu items.
Nothing in the app touches the URL; view state lives in `this.currentView`.

### What the 405 prototype methods actually do

Every method defined across `public/js/` was classified by what its body touches.
This inventory is the basis for the whole migration, and for Phase 0 in
particular.

| Kind | Methods | Lines | Fate |
| --- | --- | --- | --- |
| **Pure** — no DOM, no I/O | 135 | 1,801 | Extracted in Phase 0 |
| **I/O** — Supabase plus logic | 67 | 2,074 | Logic core extracted; the I/O becomes services |
| **DOM** — imperative manipulation | 127 | 3,690 | Deleted; Vue reactivity replaces it |
| **Render** — HTML template strings | 76 | 5,018 | Deleted; Vue templates replace it |

The important number is in the last two rows: **8,708 of the roughly 16,000
lines are not ported at all.** They exist only because the app has no framework.
The migration's true payload is the 1,801 lines of pure logic, plus the logic
cores buried inside the 2,074 I/O lines.

### What the test suite is really testing

Of the 86 test files, 64 load `public/js/*.js` as raw text through Vite's `?raw`
import and evaluate it with `new Function` against a hand-built fake `window`.
On first inspection that suggests a Vue rewrite would invalidate three-quarters
of the coverage. It does not, and the distinction matters enough to state
precisely:

- **22 files** never touch `public/js` at all, and survive untouched.
- **About 28 files** load `public/js` but assert on *logic*, not markup —
  `pmResolveTap({ armed: null, fingers: 2, rightClick: false, onPitch: true })`,
  `matrixBoardRows()`, the lineup slot geometry. These test pure functions that
  merely happen to live on a prototype.
- **36 files** assert on markup, through `toContain('<div')`, `querySelector` or
  `innerHTML`. These genuinely need rewriting against components.

The second group is the reason Phase 0 exists. That coverage is the most
valuable thing in the repository — `plus-minus-gestures.test.ts` alone is 2,039
lines — and it is portable, but only if the logic it covers is lifted out of the
prototype before the prototype is deleted.

## Decisions taken

**Rebuild in parallel and cut over once, rather than strangling the legacy app.**
The Vue application is built alongside the existing one, reusing the
framework-free TypeScript that already exists: `src/data/supabase.ts`,
`auth.ts`, `auth/permissions.ts`, `data/plus-minus.ts`, `data/season-stats.ts`,
`data/team-scope.ts`, `data/repo.ts` and `data/store.ts`. The legacy app keeps
running untouched until cutover, and is then deleted.

*Rejected: the strangler pattern*, in which a Vue shell wraps unported legacy
views and they are replaced one at a time. Its central benefit is that the app
stays shippable throughout, which is worth very little here because the app is
not yet deployed to real users. Its costs are real: months of two coexisting
paradigms, bridge code written only to be thrown away, and — because a redesign
is in scope — a long period in which half the application is redesigned and half
is not.

*Rejected: a parallel rebuild deployed behind a per-view route flag.* This adds
deployment complexity to buy a safety net that a pre-launch application does not
need.

**Extract the logic before writing any Vue.** This is Phase 0, and it is the
mitigation for the one serious risk in a parallel rebuild, which is quietly
losing behaviour baked into 16,000 lines. Extraction preserves that behaviour in
tested, framework-free form *while the legacy app is still running and still
green*, and leaves the eventual Vue components thin — presentation over a tested
core. It also converts about 28 test files from legacy-coupled to permanent.

**The screens are redesigned, not ported faithfully.** Since the app is
pre-launch, the conversion is the moment to improve the UI rather than reproduce
inline-styled markup in a new framework. The consequence, accepted knowingly, is
that visual regressions cannot be distinguished from intentional change, so
correctness is defended by the extracted logic and its tests rather than by
comparing screenshots.

**Vue Router gives real URLs to the seven navigation views only.** `/roster`,
`/schedule`, `/matrix` and the rest become bookmarkable, and the browser's back
button works. The 36 modals stay as component state, exactly as they are today.

*Rejected: routing the major modals too*, as `/matrix/session/:id` and the like.
Deep-linkable match tracking is attractive, but it is a design problem of its own
— what a refresh mid-match should do, what a stale link should show — and it can
be added later without redoing this work.

*Rejected: no router at all.* State would still be lost on refresh and the back
button would still do nothing, which is one of the complaints motivating the
migration.

**The canvas diagrammer stays imperative.** `SoccerTacticalBoard` is 1,021 lines
of canvas drawing, undo/redo and keyframes. Canvas does not benefit from
reactivity, so it is wrapped in a thin Vue component that owns the element and
delegates to it, rather than being rewritten.

**The menu keeps its current seven items.** The migration is not the moment to
reorganise the information architecture.

## Phases

Each phase gets its own spec and implementation plan. Only Phase 0 is specified
in this document.

| # | Phase | Rationale for its position |
| --- | --- | --- |
| 0 | **Logic extraction** into `src/domain/` | De-risks everything downstream; legacy stays green |
| 1 | **Foundation** — Vue, Router, Pinia, app shell, nav, auth, Home end to end | Proves the stack and the new design language on one screen |
| 2 | **Public views** — Roster, Schedule, Coaching Staff, Help | Read-mostly and lower risk; the redesign settles here |
| 3 | **Player Ratings** — matrix, session entry, weights, standings | First heavy coach surface |
| 4 | **Planner and diagrammer** | Largest single chunk: 2,344 lines plus the canvas |
| 5 | **Match tools** — plus/minus, lineup, season, progress, squad, round robin, recording numbers | The modal-heavy cluster |
| 6 | **Admin** — panel, XLSX import/export, diagnostics | 3,323 lines, mostly logic |
| 7 | **Retire the legacy** — delete `app.js`, `public/js/`, the dormant `src/` duplicates, and rewrite `CLAUDE.md` | Cleanup and documentation |

---

# Phase 0 — Logic Extraction

## What it builds

A new `src/domain/` directory of framework-free, side-effect-free modules holding
the logic currently trapped in prototype methods, each covered by a test that
imports it directly. `src/data/` keeps its present job of Supabase access.

| Module | Extracted from | Contents |
| --- | --- | --- |
| `domain/schedule.ts` | `utils.js` | `parseMatchDateTime`, `matchDateTime`, `getNextMatch`, `scheduleState`, `lastPlayedMatch`, `getNextMatchCountdown` |
| `domain/matrix.ts` | `views/matrix.view.js` | `matrixBoardRows`, `compareBoardRows`, `exerciseLeaderboard`, `compareExerciseRows`, `exercisesWithResults`, the sort helpers |
| `domain/matrix-session.ts` | `views/matrix-session.view.js` | band rows, `defaultSessionAttendance`, `compareSessionPlayers`, `sessionDrillOptions`, `isTimedExercise` |
| `domain/lineup.ts` | `views/lineup.view.js` | 21 methods: `lineupFormations`, `lineupSlots`, `lineupSquad`, `resolveLineupDrop`, `lineupStarters`, `lineupBench`, `lineupGrade`, `lineupCardDensity` |
| `domain/plus-minus-court.ts` | `views/plusminus.view.js` | 24 methods: clock predicates, `pmResolveTap`, `pmResolveDrop`, position storage and clamping, `pmApplyFormation`, `pmSpreadSlot`, `pmColumns`, `pmSortedRows` |
| `domain/round-robin.ts` | `views/roundrobin.view.js` | `buildRoundRobin`, `roundRobinPlayers`, `roundRobinPlayed`, `roundRobinCsv` |
| `domain/season.ts` | `views/season.view.js` | `seasonColumns`, `seasonSortedRows`, `seasonFullMatchMinutes` |
| `domain/progress.ts` | `views/progress.view.js` | `progressSeries`, `progressBlocksFor`, `buildProgressReport`, `progressLowerIsBetter` |
| `domain/report.ts` | `views/report.view.js` | `buildSquadReport`, `reportStandardSeconds` |
| `domain/recording-numbers.ts` | `views/recording-numbers.view.js` | `proposeRecordingNumbers`, `suggestedNumberStart`, `useShirtNumbersAsRecording`, `rosterForNumbering` |
| `domain/roster.ts` | `views/roster.view.js` | `comparePlayers`, `sortedPlayers` |
| `domain/csv.ts` | `admin.js` | `parseCsvText`, `pickColumn`, `compareMatrixPlayers` |
| `domain/upsert.ts` | `app.core.js` | `upsertByKey` (76 lines), `upsertByName`, `upsertByDateTime` |

`domain/plus-minus-court.ts` is deliberately named apart from the existing
`src/data/plus-minus.ts`, which is the event-replay engine. The new module is the
pitch-and-positions logic from the view. They are different concerns, and merging
them would be a mistake.

## How the app keeps running during extraction

The classic scripts under `public/js/` cannot import ES modules, so extracted
logic reaches them the way the replay engine already does. `src/main.ts` already
assigns `plusMinus`, `seasonStats` and `plusMinusImport` onto `window` for
exactly this reason, and the comment there states the rationale: the logic lives
in a module because it is worth testing directly, and `public/js/` cannot import.

Each extraction therefore follows one shape:

1. Write the pure function in `src/domain/x.ts`.
2. Publish its namespace on `window` from `src/main.ts`.
3. Replace the prototype method body with a one-line delegation to that global.

The running application's behaviour is unchanged. The logic simply moves
somewhere it can be tested and, later, imported by a Vue component.

## Testing

The tests for this logic already exist, so Phase 0 is test-driven by
construction. For each cluster, in this order:

1. Move the test to `src/domain/x.test.ts` and rewrite its imports to load the
   module directly, deleting the `?raw` import, the `new Function` evaluation and
   the hand-built fake `window`.
2. Watch it fail, because the module does not exist yet.
3. Extract until it passes.
4. Replace the prototype body with the delegation, and confirm the remaining
   legacy tests still pass.

The test ends in its permanent form, decoupled from the file it was born against.
Tests that assert on markup are **not** touched in this phase; they belong to the
legacy views and are retired with them in phases 2 through 6.

## Sequencing

Clusters are done best-tested-first, so the pattern is proven on the safest
ground before it reaches the hardest code.

1. `schedule` — covered by `schedule-date`, `next-match`, `schedule-display`
2. `matrix` and `matrix-session`
3. `lineup` — `lineup.test.ts` is 898 lines
4. `plus-minus-court` — `plus-minus-gestures.test.ts` is 2,039 lines
5. `round-robin`, `season`, `progress`, `report`, `recording-numbers`
6. `roster`, `csv`, `upsert`

## Verification

- `npm test` passes at every commit, never below the current 1,684 tests.
- `npm run typecheck` passes.
- `npm run build` passes. It is the only check that exercises real module
  resolution, and `main.ts` gains a new export in almost every commit here.
- `node --check` over every file under `public/js/`, via `check_syntax.ps1`,
  since typecheck does not reach the classic scripts and every commit edits them.
- The application still runs under `npm run dev` with no behavioural change.

## Non-goals

**No Vue.** Not a dependency, not a component, not a build change. Phase 0 ends
with the same application running, differently organised underneath.

**No redesign.** The UI is untouched.

**No new behaviour.** Where extraction reveals a bug, it is recorded and left
alone. Fixing it in the same commit would make the "no behavioural change"
verification meaningless.

**The DOM and render methods are not ported.** Those 8,708 lines are deleted in
later phases. Any effort spent tidying them now is wasted.

## Known risks

**The classification is an inventory, not a contract.** It was produced by
pattern-matching method bodies, and it has false positives: `showAlertModal`,
`initApp` and `closeNavMenu` all landed in the pure bucket but touch the DOM.
Every method is read before it is extracted.

**Some pure methods mutate `this`.** `setBoardSort`, `assignLineupSlot`,
`resetLineup` and others compute a result and then store it on the app instance.
Extraction splits each into a pure calculation in `src/domain/` and a one-line
assignment left behind in the view, rather than moving the mutation into the
module.

**`src/components/` is currently unusable.** The directory survives as a
permission-denied ghost from an earlier deletion, held by a running `node`
process. It blocks nothing in Phase 0, which writes only to `src/domain/`, but it
must be cleared before Phase 1 scaffolds components there.
