# Vue Migration Phase 3b — The Session Grid, Weights and Standards

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The write surfaces of the Competitive Matrix — recording a whole squad's session in one pass, editing what each exercise is worth, editing the standards a squad is held to, and correcting or removing a past session.

**Architecture:** Unchanged. Every client method this needs already exists on `SupabaseService` — `fetchTimeBands`, `saveTimeBands`, `fetchDrillsForWeighting`, `updateDrillWeights`, `fetchMatrixSessions`, `saveMatrixSession`, `fetchMatrixSessionResults`, `deleteMatrixSession`, `findPlayerOnTeam` — and each is already validated and documented. **No schema change and no new client method.** What is missing is entirely in the browser: three domain modules and five components.

**Spec:** `docs/superpowers/specs/2026-09-06-vue-phase-3-player-ratings-design.md`

**Baseline:** 2,364 tests across 127 files, four gates green, at commit `f227cce`.

## Scope

Phase 3a made the board readable. 3b makes it writable, and closes the last reason a coach still has to open the legacy app for ratings.

| Piece | Component |
| --- | --- |
| Session grid | `SessionModal.vue` — the squad, one exercise, one pass |
| Attendance and keyboard | inside the grid, driven by `domain/session-entry.ts` |
| Live band feedback | `domain/band-score.ts`, shown as the time is typed |
| Weights and measures | `WeightsModal.vue` |
| Standards | `BandsEditor.vue`, inside the weights modal |
| History | `SessionHistory.vue` — edit and delete |

## Global Constraints

- **`index.html`, `public/js/` and `app.js` are not touched.** The legacy session grid keeps working throughout; it is the fallback if this one is slower.
- **Pass the resolved organization or team to every client call.** `fetchDrillsForWeighting` returns `null` on a bare call rather than serving Beaumont's library — a silently empty exercise picker, which is exactly the failure Phase 3a hit.
- **No `'bhs'`, `Beaumont` or `Cougars` literal.**
- **Do not tune bands to spread scores.** A bunched threshold result is the good outcome. Nothing in this phase may present one as a problem or suggest tightening a standard.
- **Recording numbers are displayed, never assigned.** They are set by the coach in a block per squad, and the paper sheets already carry them.
- **Do not write a second time parser.** `domain/time.ts` is the one, and `time.test.ts` proves it agrees with the client's copy. `"4.30"` is four minutes thirty; `"4:5"` is refused.
- `typescript` stays 5.x; `.at()` unavailable; `tsconfig` stays loose.
- Conventional Commits. Four gates, **checked by real exit code** — a piped `tail` returns tail's status, and an unhandled rejection exits non-zero while every test passes.

## The thing this screen has to beat

**Paper.** A coach with a clipboard and a stopwatch enters twenty-five times in a row, one hand on the number pad and the other holding the sheet. Everything else in this migration can be marginally slower without anyone minding; this cannot. Three behaviours in the legacy grid exist for that reason and are requirements, not nice-to-haves:

1. **Enter moves to the next field.** Not submit, not nothing. Reaching for the mouse between every player is the slow part.
2. **Tab order follows the screen, not the roster.** The grid sorts, and after sorting by name the two orders differ. Tabbing has to follow what the eye follows.
3. **Typing a value marks the player present.** A recorded time is evidence of attendance and outranks whatever the dropdown said. Clearing it puts the row back to the measure's default.

---

### Task 1: `domain/band-score.ts` — what a time earns

The live feedback beside a banded row, and the one piece of scoring the browser does at all.

**Files:** Create `src/domain/band-score.ts` and its test.

**Interfaces:**
```ts
export interface Band { max_seconds: number | string; factor: number | string }

/** What a time earns: the tightest band it still fits under, or 0. */
export function factorForTime(seconds: any, bands: Band[]): number;

/** What to show beside the input as a time is typed. */
export function bandFeedback(raw: string, bands: Band[]):
  { text: string; tone: 'good' | 'none' | 'bad' | 'empty' };
```

- [x] **Step 1: Write the failing test**

`factorForTime` must **agree with `SupabaseService.factorForTime`**, the same way `time.ts` agrees with the client's parser — that is what "tightest band it still fits under" means, and a second reading of it would hand a player marks for a time they did not run. Include an agreement `describe` that runs the same inputs through both, as `time.test.ts` does.

Cover: a time under the tightest band earns that band's factor, not the loosest one it also fits; a time over every band earns 0; a time exactly on a threshold is **inside** it (`<=`); bands arriving unsorted still resolve to the tightest; a non-numeric input earns 0.

`bandFeedback` is what makes it visible while typing:

- empty input → `{ text: '', tone: 'empty' }` — nothing typed yet is not an error.
- unparseable → `mm:ss?` and `bad`. **Named, not silent**: `"4:5"` is refused by the parser, and a coach who types it needs to know before saving twenty-five rows.
- earns something → `earns 0.5`, `good`.
- fits no band → `no band`, `none` — distinct from `bad`. The time was read fine; it simply met no standard, which is a real result and not a typo.

- [x] **Step 2: Run it, watch it fail, write the module, watch it pass**

- [x] **Step 3: Gates and commit** — all four, by exit code.

---

### Task 2: `domain/session-entry.ts` — the grid's state, without the DOM

The legacy grid keeps its state **in the DOM** and reads it back with `getElementById` — `collectSessionResults`, `readBandRows`, `captureBandDrafts`. That is why sorting has to capture drafts first, and why `captureBandDrafts` carries a comment warning that calling it after a state change silently undoes an added row. In Vue the state is the state; the ordering, the defaults and the shaping are what remain.

**Files:** Create `src/domain/session-entry.ts` and its test.

**Interfaces:**
```ts
export type Attendance = 'present' | 'excused' | 'unexcused';

export interface EntryRow {
  playerId: string;
  attendance: Attendance;
  /** As typed. Parsed on the way out, not on every keystroke. */
  value: string;
  outcome: string;
}

/** A fresh grid for this squad and this measure. */
export function blankEntries(players: any[], measure: string): Record<string, EntryRow>;

/** Rows a saved session prefills, over a blank grid. */
export function entriesFromResults(players: any[], results: any[], measure: string): Record<string, EntryRow>;

/** What typing into or clearing a value does to attendance. */
export function attendanceAfterInput(value: string, measure: string): Attendance;

/** The payload saveMatrixSession takes. */
export function toSessionResults(
  players: any[], entries: Record<string, EntryRow>, measure: string
): { playerId: string; attendance: Attendance; rawValue: number | null; outcome: string | null }[];

/** Which players are present with nothing recorded — the save guard, named. */
export function presentWithoutResult(
  players: any[], entries: Record<string, EntryRow>, measure: string
): any[];
```

- [ ] **Step 1: Write the failing test**

The behaviours, each with its reason:

- **A timed test starts every player at no-show.** Running it is the whole point, so no time means they did not run. Starting them at "here" would have the coach turning twenty-five dropdowns the wrong way to record the two who were missing. Everything else starts at present. (`defaultSessionAttendance` in `domain/matrix-session.ts` already decides this — call it, do not restate it.)
- **A typed value marks the row present, unconditionally.** Clearing it returns the row to the measure's default, so a mistyped entry deleted again does not leave somebody present with nothing against them.
- **Clearing a row sets it excused, not no-show.** An excused row is in neither the earned nor the available column, so undoing a coach's own typo costs the player nothing. No-show scores 0 of the weight — a penalty for the typo.
- **`time_bands` parses as mm:ss; everything else as a number.** `parseFloat("4:30")` is `4`, which lands under every standard and hands out full marks for a time nobody ran. Use `parseTimeToSeconds` for `time_bands`.
- **A non-present row carries neither a value nor an outcome**, whatever is still in the box.
- **`presentWithoutResult` names the players**, so the component can say who rather than echoing the client's `"<uuid> is marked present but has no result"`. The client keeps its guard; this is so the message is readable.
- Deleted players are excluded, on both `is_deleted` and `isDeleted` — Supabase rows and app state spell it differently.

- [ ] **Step 2: Run it, watch it fail, write the module, watch it pass**

- [ ] **Step 3: Gates and commit**

---

### Task 3: The session store

**Files:** Create `src/stores/session.ts` and its test.

State: `sessions`, `results`, `bands`, `drills`, `editingId`, `loading`, `saveError`.

Actions: `loadHistory(teamId)`, `loadDrills(schoolId)`, `openNew(drillId, teamId)`, `openExisting(sessionId, teamId)`, `loadBands(drillId, teamId)`, `save(teamId, session, results)`, `remove(sessionId)`.

- [ ] **Step 1: Write the failing test**

- **`loadBands` is called for a `time_bands` drill and nothing else.** Bands are per `(drill_id, team_id)`; fetching them for a `win_loss` drill is a wasted round trip whose empty result would then read as "no standards set".
- **Both ids are threaded.** `loadDrills` needs the organization (the drill library is school-scoped); everything else needs the team. A bare `fetchDrillsForWeighting()` returns `null`, and the picker is then silently empty — the Phase 3a failure, repeated.
- **`save` reloads rather than patching.** Points are derived in Postgres; nothing moves until a re-read, and a locally patched row would show a number the database does not hold.
- **A failed save leaves `editingId` alone.** Clearing it would turn the coach's retry into a second session for the same day, doubling everyone's `available`.
- **A successful save clears `editingId`.** Leaving it set makes the next "record a session" overwrite the one just edited.
- **`remove` reloads too**, and reports the client's error rather than a generic one.

- [ ] **Step 2: Run it, watch it fail, write the store, watch it pass**

- [ ] **Step 3: Gates and commit**

---

### Task 4: `SessionModal.vue` — the grid

The screen this phase exists for.

**Files:** Create `src/components/matrix/SessionModal.vue` and its test.

Layout, in the order a coach reads it: exercise and date; a jump box; the grid — recording number, name, attendance, the entry field for this measure, and for `time_bands` what the time earns; then Save.

- [ ] **Step 1: Write the failing test, keyboard first**

The three speed requirements above are tests, not prose:

- **Enter moves focus to the next entry field** and does not submit the form. Assert on focus, and assert the submit handler did not fire.
- **The order is the rendered order.** Sort by name, then assert Enter walks the grid in the sorted order rather than the roster's. This is the assertion that catches a rebuild that reads the roster array instead of the rows.
- **Past the last field, Enter moves to Save** — not back to the top, which would overwrite the first entry with the next keystroke.
- **Typing a value flips the row to present**; clearing it returns it to the measure's default.
- **Sorting mid-entry keeps what was typed.** In the legacy grid this needed an explicit capture because the values lived in the DOM; here it should be free, and the test is what stops a later refactor reintroducing DOM-held state.
- **The jump box scrolls and focuses; it does not filter.** A session is entered for the whole squad, and hiding the rest makes it easy to save with players left out. Assert the row count is unchanged after a jump.
- **A player found on the team but not in this session's list says so** rather than failing silently.
- **A `time_bands` row shows what the time earns as it is typed**, including `no band` for a time that met none.
- **Save is disabled for the duration of the request.** A double-click would write two sessions and double everyone's `available`. Assert it is re-enabled on the failure path too, or a refused save strands the coach.
- **Present with nothing recorded is refused, naming the players.**

- [ ] **Step 2: Build it, watch the tests pass**

- [ ] **Step 3: Gates and commit**

---

### Task 5: `WeightsModal.vue` and `BandsEditor.vue`

What each exercise is worth, what kind of thing it measures, and the standards for a banded one.

**Files:** Create both components and their tests.

- [ ] **Step 1: Write the failing tests**

- **Changing a measure to `time_bands` reveals the bands editor** for that drill and nothing else.
- **A drill always has at least one band row.** Removing the last one leaves an empty pair of boxes rather than a section with no way back in.
- **A blank row is skipped, not rejected.** An untouched empty row is how the editor always looks; refusing to save because of one would be unusable.
- **Saving replaces a squad's bands rather than merging.** Editing 4:30 to 4:25 must change the standard, not leave both — the looser one would then be the one that pays out. The client already does this; the test states it so the UI does not work around it.
- **Bands are per squad.** Assert the active team is passed. A JV standard is not a Varsity standard.
- **A bad time or factor is named in words** before anything is deleted, so a typo in the third row cannot leave the squad with no standards at all.
- **Nothing suggests tightening a band.** No "scores are bunched" hint, no spread warning. Assert the absence — this is the coach's stated position and the kind of "helpful" addition that gets added later by someone who has not read it.

- [ ] **Step 2: Build both, watch the tests pass**

- [ ] **Step 3: Gates and commit**

---

### Task 6: `SessionHistory.vue`, and wiring it all into `MatrixView`

**Files:** Create `src/components/matrix/SessionHistory.vue` and its test; edit `src/views/MatrixView.vue` and its test.

- [ ] **Step 1: Write the failing tests**

- **Newest first**, and a session whose drill has since been deleted renders a label rather than `undefined`.
- **Edit reopens the grid prefilled** from `fetchMatrixSessionResults`, with the same session id, so saving upserts rather than inserting a second session for the same day.
- **Delete asks first, and says what it costs**: every result in the session goes with it and the standings are re-scored.
- **All of it is coach-only and absent from a player's document**, the same as the results panel — assert absence, not `display: none`.
- **`MatrixView` gains one "Record a session" control and one "Weights and standards" control**, both coach-only, and the board re-reads after either modal saves.

- [ ] **Step 2: Build and wire, watch the tests pass**

- [ ] **Step 3: Gates and commit**

---

### Task 7: Close out Phase 3

- [ ] **Step 1: Confirm the legacy app is untouched**

```bash
git diff --stat e1fcc08..HEAD -- index.html public/js app.js
```

- [ ] **Step 2: Retire what the rebuild replaced.** The spec notes twenty-four legacy-coupled test files under `src/data/` touching the matrix and session grid, and that they are retired as their views are replaced. **Retire only what the new tests now cover**, and say in the commit message which assertion moved where. Anything covered there and not here is a regression, not a stale test.

- [ ] **Step 3: Update `CLAUDE.md`** — all seven nav views bar the planner, what Phase 4 owes, and the domain module count.

- [ ] **Step 4: Commit**

## Definition of done

- A coach records a whole squad's session from the keyboard, without reaching for the mouse between players.
- Enter walks the grid in the order it is displayed in, including after a sort, and stops at Save.
- A `time_bands` row says what the time earns as it is typed, and says `no band` rather than nothing when it meets none.
- Weights, measures and per-squad standards are all editable, and saving standards replaces rather than merges.
- A past session can be edited or deleted, and the board re-derives after either.
- Nothing in the UI proposes tightening a standard to spread scores.
- Four gates green by exit code; `git diff` shows no change to the legacy app.
