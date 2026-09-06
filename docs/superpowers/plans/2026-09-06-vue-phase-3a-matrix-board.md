# Vue Migration Phase 3a — The Matrix Board

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Competitive Matrix's read surfaces — the overall board, the per-exercise leaderboard with threshold emphasis, the results panel, and a player's breakdown.

**Architecture:** Unchanged. `domain/matrix.ts` and `domain/matrix-session.ts` already hold the rows, comparators and sort state from Phase 0; the components are templates over them. One new domain module for the threshold reading.

**Spec:** `docs/superpowers/specs/2026-09-06-vue-phase-3-player-ratings-design.md`

**Baseline:** 2,247 tests across 120 files, four gates green, at commit `e1fcc08`.

## Scope

3a is the read surfaces plus deleting a bad result. **The session grid and the weights and standards editors are 3b** — they are the hard part, and building them against a board that already renders results correctly is the point of the split.

## Global Constraints

- **`index.html`, `public/js/` and `app.js` are not touched.**
- **Pass the resolved organization or team to every client call.** The ten `schoolId` parameters are now required, so a bare call fails typecheck — but `window.supabaseService` in untypechecked code still bypasses that, so do not route through it.
- **No `'bhs'`, `Beaumont` or `Cougars` literal.**
- **The threshold emphasis is additive.** Highlighting who fell below a standard must not remove or disable any sort. This was the condition on approving the change, and a test asserts it.
- **Do not tune bands to spread scores.** A bunched threshold result is the good outcome.
- `typescript` stays 5.x; `.at()` unavailable; `tsconfig` stays loose.
- Conventional Commits. Four gates, **checked by real exit code** — a piped `tail` returns tail's status, and an unhandled rejection exits non-zero while every test passes.

---

### Task 1: `domain/matrix-threshold.ts`

How a row reads against a standard. Pure, so the emphasis is decided in one tested place rather than in a template.

**Files:** Create `src/domain/matrix-threshold.ts` and its test.

**Interfaces:**
```ts
export type BandStanding = 'met' | 'below' | 'missed' | 'none';

/** Whether a measure is scored against a standard rather than against team-mates. */
export function isThresholdMeasure(measure: string): boolean;

/** How one leaderboard row read against the standard. */
export function bandStanding(row: { earned: number; available: number; attempts: number }): BandStanding;

/** How many fell short, for the summary line. */
export function belowStandard(rows: any[]): any[];
```

- [ ] **Step 1: Write the failing test**

The four standings, and why each matters:

- `met` — earned equals available. The player made the tightest band. **Seventeen of nineteen here is the good outcome.**
- `below` — earned above zero but under available. They met a looser band. **This is the signal.**
- `missed` — attempted, earned nothing. Met no band at all.
- `none` — no attempt recorded. Not the same as failing, and must not be counted as falling short.

Cover: each standing; that `none` is excluded from `belowStandard`; that `isThresholdMeasure` is true only for `time_bands` and false for `time_low` (fast *is* competitive — it ranks players against each other); and that a row with zero available does not divide by anything.

- [ ] **Step 2: Run it, watch it fail, write the module, watch it pass**

- [ ] **Step 3: Gates and commit**

---

### Task 2: The matrix store

**Files:** Create `src/stores/matrix.ts` and its test.

- [ ] **Step 1: Read what feeds the board**

```bash
grep -n "matrixStats\|matrix_standings\|fetchTeamExercisePoints\|fetchMatrixLogs" src/data/supabase.ts | head
sed -n '367,420p' public/js/app.core.js
```

The board reads `player.matrixStats`, which `syncFromSupabase` left-joins from the `matrix_standings` view onto the roster — **a player with no results must still appear at 0/0/0 rather than vanishing.** The per-exercise figures come from `fetchTeamExercisePoints(teamId)`.

- [ ] **Step 2: Write the failing test, then the store**

```ts
// state
players, exercisePoints, logs, loading, loadError, loadedTeamId
boardSort: { by, reversed }; exerciseSort: { by, reversed }; exerciseFilter
// getters
boardRows, leaderboard, exercises, belowStandardCount
// actions
load(teamId), setBoardSort(by), setExerciseSort(by), setExerciseFilter(id), removeResult(id, teamId)
```

The sort actions delegate to `nextSortState` from `domain/matrix.ts` and keep only the assignment, as Phase 0 established.

Cover: a player with no results still appears; the board sorts every way; the leaderboard filters to one drill; and `removeResult` reloads rather than patching, because points are derived in Postgres and a local edit would show a rank the database does not agree with.

- [ ] **Step 3: Gates and commit**

---

### Task 3: The board and the leaderboard

**Files:** Create `src/views/MatrixView.vue`, `src/components/matrix/MatrixBoard.vue`, `ExerciseLeaderboard.vue`, and tests. Modify the router.

- [ ] **Step 1: Build the board, test-first**

Cover: every player renders including one with no results; each column sorts and reverses; the arrow shows the **direction in force**, not merely that a column is sorted; an unranked player sinks in both directions; the bar tracks points against the leader rather than share.

- [ ] **Step 2: Build the leaderboard, test-first**

Columns differ by measure — wins/draws/losses for a head-to-head or small-sided drill, a best count or a best time otherwise — because showing all of them fills the table with columns that are always zero.

**The threshold emphasis, for `time_bands` only:**

- a summary line naming how many fell below the standard, and how many were measured
- those rows marked, so they can be found without scanning
- **every sort still present and working** — asserted directly, since it was the condition on this change
- when nobody fell short, the summary says so rather than disappearing; that is the good outcome and worth stating

For a competitive measure none of this appears, and the presentation is unchanged.

- [ ] **Step 3: Point `/matrix` at the view, run the gates, commit**

The route already guards on `canAccessRatings()`. Add a test that a player sees the board but no coach controls, and that a guest is redirected.

---

### Task 4: The results panel and a player's breakdown

**Files:** Create `src/components/matrix/ResultsPanel.vue`, `PlayerBreakdownModal.vue`, and tests.

- [ ] **Step 1: Read what the panel is for**

```bash
sed -n '164,225p' public/js/views/matrix.view.js
sed -n '954,1020p' public/js/views/matrix-session.view.js
```

Points are derived rather than stored, and the argument for that is that correcting a mis-entered result re-derives every rank. **That argument only holds if there is somewhere to correct it** — otherwise a typo needs the SQL editor. This panel is that somewhere, which is why it is not optional.

- [ ] **Step 2: Build both, test-first**

The panel is coach-only, and a guest or player must not have its controls in the document. Deleting asks first and names the result. The breakdown phrases a result for the exercise it was in — a time is not a count.

- [ ] **Step 3: Gates and commit**

---

### Task 5: Close out 3a

- [ ] **Step 1: Confirm the legacy app is untouched**

```bash
git diff --stat e1fcc08..HEAD -- index.html public/js app.js
```

- [ ] **Step 2: Update `CLAUDE.md`** — six of seven views live, and what 3b still owes.

- [ ] **Step 3: Commit**

## Definition of done

- The board renders every player on the active team, sortable every way, including those with no results.
- A `time_bands` exercise says how many fell below the standard and marks them, **without losing a single sort**.
- A coach can delete a wrong result and the board re-derives after a reload.
- A player sees the board and no coach controls; a guest is redirected.
- Four gates green by exit code; `git diff` shows no change to the legacy app.
