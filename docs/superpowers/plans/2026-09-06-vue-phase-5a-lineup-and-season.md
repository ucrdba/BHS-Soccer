# Vue Migration Phase 5a — The Lineup and the Season Report

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The two tools that hang off Schedule — a fixture's lineup, and the season table.

**Architecture:** Unchanged, and unusually light. `domain/lineup.ts` (18 exports), `domain/season.ts` (4) and `data/season-stats.ts` (11) already hold the logic, tested, from Phase 0. `fetchLineup`, `saveLineup`, `fetchTeamLineups` and `fetchSeasonStats` already exist. **The components are templates.**

**Spec:** `docs/superpowers/specs/2026-09-06-vue-phase-5-match-tools-design.md`

**Baseline:** 2,924 tests across 149 files, four gates green, at commit `2fc2b0a`.

## Scope

5a is the lineup and the season report. **Plus/Minus is 5b** — it is the only live-input surface in the app and the only one where a mistake is silent, so it gets its own plan. The reports and utilities are 5c.

Neither of these gets a URL. They open from Schedule, which is where the legacy app launches them and where a coach looks.

## Global Constraints

- **`index.html`, `public/js/` and `app.js` are not touched.**
- **A match is not ninety minutes.** High school is 80, clubs vary, and `teams.match_minutes` holds it. `seasonFullMatchMinutes(teams, activeTeamId)` reads it and both stats modules already normalise against it. **No constant may be hardcoded**, and one organization can field teams playing different lengths.
- **Never filter out a low-minute player.** Unlimited substitution means much of the roster finishes under a full match, and those are the players a coach is reading the table to make a decision about. Show the minutes beside the rate instead.
- **Pass the resolved organization or team to every client call.** `saveLineup` needs both — it refuses without either.
- **No `'bhs'`, `Beaumont` or `Cougars` literal.**
- `typescript` stays 5.x; `.at()` unavailable; `tsconfig` stays loose.
- Conventional Commits. Four gates, **checked by real exit code**.

---

### Task 1: The lineup store

**Files:** Create `src/stores/lineup.ts` and its test.

State: `formation`, `assignments` (slot → playerId), `notes`, `matchId`, `loading`, `loadError`, `saveError`, `fixturesMissing`.

Actions: `load(teamId, matchId)`, `place(playerId, slot)`, `clear(slot)`, `drop(target)`, `setFormation(name)`, `save(teamId, schoolId, matchId)`, `loadIndex(teamId)`.

- [x] **Step 1: Write the failing test**

- **Changing the formation keeps the players it can.** A 4-4-2 to 4-3-3 move is one slot changing, not a lineup thrown away — a coach adjusting shape mid-thought loses ten placements otherwise.
- A player dropped onto an occupied slot swaps with whoever was there, rather than one of them vanishing.
- A player already placed elsewhere is **moved**, not duplicated: `resolveLineupDrop` decides this and the store must not second-guess it.
- **Both ids reach `saveLineup`.** It refuses without a team *and* an organization, so a bare call silently saves nothing.
- A failed read is reported rather than shown as an empty pitch.
- `loadIndex` drives "fixtures with no lineup yet", which is the reason the list exists.

- [x] **Step 2: Run it, watch it fail, write the store, watch it pass**

- [x] **Step 3: Gates and commit**

---

### Task 2: `LineupModal.vue`

**Files:** Create `src/components/schedule/LineupModal.vue` and its test.

- [x] **Step 1: Write the failing test**

- Every slot of the chosen formation is on the pitch, and the squad not yet placed is on the bench.
- Placing from the bench, moving on the pitch, and clearing a slot all work **by click as well as by drag**. Drag-only is the legacy planner's mistake repeated: a coach setting a lineup on a phone at the touchline cannot drag reliably, and a keyboard cannot drag at all.
- The card size adapts to the squad — `lineupCardDensity` exists because a 25-player bench at full size does not fit a phone.
- A player's grade shows beside their name, and **a player with no rating shows as unrated rather than as zero**.
- Saving sends the formation, the slots and the notes; a refusal is reported in the database's words.
- The modal is coach-only.

- [x] **Step 2: Build it, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 3: `SeasonReportModal.vue`

**Files:** Create `src/components/schedule/SeasonReportModal.vue` and its test.

- [x] **Step 1: Write the failing test**

- Every column sorts, and sorting reverses on a second click.
- **The minutes are on the row, beside every rate.** That is what lets a coach read a noisy figure as noisy, and it is the alternative to hiding the player.
- **A player with three minutes is in the table.** Assert the absence of any filter — this is the rule the report exists to serve, and the kind a later tidy-up removes for looking untidy.
- **Rates are normalised against `teams.match_minutes`.** Assert that a team stating 80 produces a different figure from one stating 90, and that neither is a hardcoded constant.
- A team that has stated no length falls back, and the fallback is a fallback rather than a fact about the sport.
- A failed read is reported.

- [x] **Step 2: Build it, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 4: Wire both into `ScheduleView`

**Files:** Edit `src/views/ScheduleView.vue` and its test.

- [x] **Step 1: Write the failing tests**

- A fixture offers a lineup; the header offers the season report and a lineup with no fixture attached.
- **A fixture with no lineup yet is marked**, because that is the whole point of the index.
- Both controls are coach-only and **absent** from a player's document, not hidden.
- Saving a lineup re-reads the index, so the mark clears.

- [x] **Step 2: Wire it, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 5: Close out 5a

- [x] **Step 1: Confirm the legacy app is untouched**

```bash
git diff --stat 2fc2b0a..HEAD -- index.html public/js app.js
```

- [x] **Step 2: Update `CLAUDE.md`** — what 5b and 5c still owe.

- [x] **Step 3: Commit**

## Definition of done

- A coach sets a lineup for a fixture, saves it, and it is there on reload.
- Changing formation keeps the players that still have a slot.
- The lineup can be set entirely by clicking — no drag required.
- The season table sorts every way, shows minutes beside every rate, and includes every player who took part.
- Rates use the team's own match length, and nothing hardcodes ninety.
- Four gates green by exit code; `git diff` shows no change to the legacy app.
