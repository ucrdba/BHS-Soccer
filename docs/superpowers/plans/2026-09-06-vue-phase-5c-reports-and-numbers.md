# Vue Migration Phase 5c — The Reports and the Numbers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The four tools left in Phase 5 — the squad report and the progress chart on Player Ratings, the round robin on the Planner, and the recording numbers on the Roster.

**Architecture:** Unchanged. `domain/round-robin.ts` (8 exports), `domain/progress.ts` (5), `domain/recording-numbers.ts` (3) and `domain/report.ts` already hold most of it from Phase 0. **One extraction is still owed** — see Task 1.

**Spec:** `docs/superpowers/specs/2026-09-06-vue-phase-5-match-tools-design.md`

**Baseline:** 3,067 tests across 156 files, four gates green, at commit `87a25ea`.

## Scope

The last of the match tools. Each hangs off the screen it is launched from:

| Tool | From |
| --- | --- |
| Squad report | Player Ratings |
| Progress chart | Player Ratings |
| Round robin | Coach Planner |
| Recording numbers | Roster |

## Global Constraints

- **`index.html`, `public/js/` and `app.js` are not touched.**
- **Recording numbers are PROPOSED, never assigned.** The coach accepts a block; nothing renumbers a squad on its own. A number that moved by itself would disagree with every paper sheet already written, and both the Matrix board and the session grid are read against those sheets.
- **Never filter out a low-minute or low-attempt player.** Same rule as the season report, and it applies to the squad report and the progress chart in the same way.
- **A threshold is not a ranking.** `time_bands` measures whether a player is match-fit; the squad report must not present a bunched result as a problem or suggest tightening a standard.
- **No `'bhs'`, `Beaumont` or `Cougars` literal.**
- **No charting library.** `domain/progress.ts` produces the series; an SVG polyline draws it. A dependency for a handful of line series would be the printed plan's PDF decision repeated.
- `typescript` stays 5.x; `.at()` unavailable; `tsconfig` stays loose.
- Conventional Commits. Four gates, **checked by real exit code**.

---

### Task 1: `domain/recording-numbers.ts` — the write plan

Phase 0 extracted the *proposing*; the *writing* stayed in the view, and it is the part with a trap in it.

**`team_players.recording_number` carries a unique index per team.** Swapping two players' numbers by writing one at a time hits the constraint on the first write, even though the final state is legal. So anything whose number is being taken by somebody else is cleared to null first, and everything is set afterwards.

**Files:** Add to `src/domain/recording-numbers.ts` and its test.

```ts
export interface Assignment { playerId: string; name: string; current: number | null; value: number | null }

/** Numbers used more than once, so a save can be refused before it starts. */
export function duplicateNumbers(assignments: Assignment[]): number[];

/** The order writes must happen in to avoid a transient collision. */
export function planNumberWrites(assignments: Assignment[]): { playerId: string; value: number | null }[];
```

- [x] **Step 1: Write the failing test**

- **A straight swap clears both first.** Two players exchanging 7 and 8 produces four writes, not two, and the clears come first.
- **Nothing that is not changing is written.** A squad of 25 with two edits makes two writes, not fifty.
- A number nobody currently holds needs no clearing pass.
- `duplicateNumbers` finds a repeat, ignores nulls (several players may have no number), and returns them sorted so the message reads sensibly.
- A chain — A takes B's number, B takes C's — resolves without a collision.

- [x] **Step 2: Run it, watch it fail, write it, watch it pass**

- [x] **Step 3: Gates and commit**

---

### Task 2: `RecordingNumbersModal.vue`

**Files:** Create `src/components/roster/RecordingNumbersModal.vue` and its test; wire into `RosterView`.

- [x] **Step 1: Write the failing test**

- **Proposing fills the draft and writes nothing.** The coach sees the block and accepts it; the numbers are not in the database until they press save. This is the rule.
- The suggested start continues the squad's own block rather than jumping back to 1.
- **A duplicate is refused before any write happens**, naming the numbers — a half-written renumbering leaves the squad in a state the coach has to unpick by hand.
- A number that is not a whole number of 1 or more is refused, naming the player.
- **A partial failure names which players did not save**, not a count: a partial save is only recoverable if the coach knows what is missing.
- Saving re-reads the roster rather than patching it.
- The modal is coach-only.

- [x] **Step 2: Build it, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 3: `RoundRobinModal.vue`

**Files:** Create `src/components/planner/RoundRobinModal.vue` and its test; wire into `PlannerView`.

- [x] **Step 1: Write the failing test**

- Every player meets every other exactly once, across the rounds `buildRoundRobin` produces.
- An odd squad gives somebody a bye each round, and the bye moves.
- **A pairing already played is marked with its result**, so a coach running this over several sessions can see what is left.
- The CSV carries every round and is offered as a download.
- Players are labelled by recording number where they have one — the sheet is read beside the paper ones.

- [x] **Step 2: Build it, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 4: `SquadReportModal.vue` and `ProgressModal.vue`

**Files:** Both components and their tests; wire into `MatrixView`.

- [ ] **Step 1: Write the failing tests**

Squad report:

- Every player is in it, including one who has attempted nothing.
- A timed exercise is measured against **the tightest band**, and an exercise with no bands set for this squad is **not counted at all** rather than scored as universally failed.
- **Nothing suggests tightening a standard**, and a bunched result is not presented as a problem. Assert the absence.

Progress:

- A player's series for an exercise is oldest first, and **a missed session is left out rather than plotted as zero** — a session a player did not attend is not a result of nothing, and drawing it as one shows a collapse that never happened.
- **The trend is null below two readings.** One result is not a trend, and calling it "level" puts a verdict on a player who has done the exercise once.
- Direction follows the measure: faster is better for a time, higher for a count.
- The chart is an SVG polyline, drawn from the series. No library.
- **A player with one reading is still shown**, with no trend rather than being dropped.

- [ ] **Step 2: Build both, watch the tests pass**

- [ ] **Step 3: Gates and commit**

---

### Task 5: Close out Phase 5

- [ ] **Step 1: Confirm the legacy app is untouched**

```bash
git diff --stat 2fc2b0a..HEAD -- index.html public/js app.js
```

- [ ] **Step 2: Update `CLAUDE.md`** — Phase 5 done, what Phase 6 owes.

- [ ] **Step 3: Commit**

## Definition of done

- A coach proposes a block of recording numbers, sees them, and nothing is written until they save.
- A swap of two numbers saves without hitting the unique index.
- A duplicate is refused before anything is written, and a partial failure names who.
- The round robin pairs every player with every other once and marks what has been played.
- The squad report includes every player and proposes no change to any standard.
- The progress chart leaves missed sessions out and gives no trend for a single reading.
- Four gates green by exit code; `git diff` shows no change to the legacy app.
