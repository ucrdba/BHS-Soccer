# Vue Migration Phase 5b — Plus/Minus

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The live match recorder — the pitch, the clock, the taps that record a plus or a minus, the substitutions, and the undo.

**Architecture:** Unchanged. `domain/plus-minus-court.ts` (19 exports) holds the clock predicates, the gestures, the positions and the sort; `data/plus-minus.ts` (12) is the replay engine that derives every figure from the event log. `openStatMatch`, `appendStatEvent`, `undoStatEvent` and `fetchStatEvents` already exist. **This is a store and a component over tested modules.**

**Spec:** `docs/superpowers/specs/2026-09-06-vue-phase-5-match-tools-design.md`

**Baseline:** 2,997 tests across 153 files, four gates green, at commit `b7029d5`.

## Why this one is on its own

It is the only live-input surface in the application, and **the only one where a mistake is silent.**

Every other error in this migration shows up as a screen that looks wrong. Here the counters go up, the sheet reads correctly, and the minutes are wrong — found weeks later, if at all, when a season report disagrees with what the coach remembers of the game.

## The rule the phase turns on

**A statistic may only be recorded while the clock is RUNNING.** Not "has been started" — running.

Every plus/minus event is stamped with the match clock, and playing time and goal difference are **derived from those stamps** rather than stored as counters. So:

- **Before kick-off**, everything stamps at 0:00, and since minutes come from substitutions measured against the clock, every player finishes the match credited with zero.
- **While merely paused** — half time, an injury, any stoppage — an event stamps at a minute that has already passed, and lands against whoever was on the pitch *then* rather than the players actually involved.

Neither says so at the time.

**The gate belongs at the single point where an event is appended**, not in each gesture handler. The tap, the long press, the two-finger press and the right click all arrive through one door, and a guard repeated four times is a guard that drifts.

Two things stay outside the rule:

- **Substitutions are not clock-dependent** and must keep working before kick-off, because arranging the starting shape is how a coach begins.
- **Starting the clock** cannot be gated on the clock running, or the guard deadlocks.

The refusal is worded differently for the two cases, because "start the clock" and "the clock is stopped" are different situations to a coach — `pmClockEverStarted` exists for exactly that, and reads the event log rather than the clock base, since the base is zero both before kick-off and after a reset.

## Global Constraints

- **`index.html`, `public/js/` and `app.js` are not touched.** The legacy tracker keeps working, and is the fallback for a coach mid-season.
- **The clock guard lives at the append point.** One door.
- **Eleven on the pitch, enforced at the same door.** A twelfth is wrong however they got on, and the minutes and goal difference of everyone on the pitch are quietly wrong afterwards.
- **Never filter out a low-minute player**, here or in anything this feeds.
- **No `'bhs'`, `Beaumont` or `Cougars` literal.**
- `typescript` stays 5.x; `.at()` unavailable; `tsconfig` stays loose.
- Conventional Commits. Four gates, **checked by real exit code**.

---

### Task 1: The plus/minus store

**Files:** Create `src/stores/plus-minus.ts` and its test.

State: `events`, `matchId`, `statMatchId`, `clockBase`, `runningSince`, `period`, `positions`, `armed`, `notice`, `sortKey`.

Actions: `open(teamId, schoolId, matchId, label)`, `append(kind, playerId)`, `undo()`, `toggleClock()`, `setClock(seconds)`, `endPeriod()`, `arm(kind)`, `teamGoal(mine)`, `movePlayer(playerId, toPitch)`, `seedFromLineup(lineup)`.

- [x] **Step 1: Write the failing test — the guard first**

- **A plus before kick-off is refused**, and the message says to start the clock and *why* — that everything stamps at 0:00 and nobody is credited any minutes.
- **A plus while the clock is stopped is refused**, with the other wording.
- **A minus is refused in both cases too.** Same door.
- **A substitution is NOT refused** before kick-off. Arranging the starting shape is how a coach begins.
- **`clock_start` is not refused**, or nothing could ever start.
- A plus **is** recorded once the clock is running.
- The notice **clears** on the next successful record: leaving "start the clock" on screen after it has been started reads as the refusal still standing.
- **A twelfth player is refused**, and a player already on is a no-op rather than a duplicate `on`.
- Events are stamped with the clock and the current period.
- **A failed write rolls the event back off the screen.** The board must not show a plus the database refused.
- **Undo restores the clock.** Undoing a `clock_start` stops the clock at that stamp; undoing a `clock_stop` starts it again — the clock is derived from those events, so leaving them out of step makes it count from nothing.
- Undo with nothing to undo says so rather than throwing.

- [x] **Step 2: Run it, watch it fail, write the store, watch it pass**

- [x] **Step 3: Gates and commit**

---

### Task 2: `PlusMinusModal.vue` — the pitch and the clock

**Files:** Create `src/components/schedule/PlusMinusModal.vue` and its test.

- [ ] **Step 1: Write the failing test**

- The clock reads as `mm:ss` and starts, stops and resets.
- **A plus and a minus are both reachable without a gesture.** Two-finger and right-click are the fast paths, but a coach on a phone with one hand, or anyone using a keyboard, needs a plain control — the same reasoning as the planner's move buttons and the lineup's tap-to-place.
- **The refusal is on screen**, not in an `alert`, and it names which of the two situations it is.
- A player on the pitch shows their running plus, minus and net.
- Sending a player on and off works, and the eleventh is the last one accepted.
- **The board is coach-only** and absent from anyone else's document.

- [ ] **Step 2: Build it, watch the tests pass**

- [ ] **Step 3: Gates and commit**

---

### Task 3: The table, and wiring into `ScheduleView`

**Files:** `src/components/schedule/PlusMinusTable.vue` and its test; edit `ScheduleView`.

- [ ] **Step 1: Write the failing tests**

- Every column sorts, using `pmColumns` and `pmSortedRows`.
- **Minutes are on the row**, beside plus and minus — the same rule as the season report, for the same reason.
- **Every player in the squad has a row**, including one who has not been on.
- A fixture offers Plus/Minus, coach-only, and opening it opens the tracked session for that fixture.

- [ ] **Step 2: Build and wire, watch the tests pass**

- [ ] **Step 3: Gates and commit**

---

### Task 4: Close out 5b

- [ ] **Step 1: Confirm the legacy app is untouched**

```bash
git diff --stat 2fc2b0a..HEAD -- index.html public/js app.js
```

- [ ] **Step 2: Update `CLAUDE.md`** — what 5c still owes.

- [ ] **Step 3: Commit**

## Definition of done

- A plus or a minus **cannot** be recorded while the clock is stopped, from any gesture, and the refusal says which situation it is.
- A substitution works before kick-off.
- A twelfth player is refused.
- An event the database rejects does not stay on the board.
- Undoing a clock event leaves the clock consistent.
- Every figure on the board is replayed from the event log rather than counted.
- Four gates green by exit code; `git diff` shows no change to the legacy app.
