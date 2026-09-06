# Vue Migration Phase 4a — The Practice Planner

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Coach Planner route — a practice session as a timeline of drills, saved under a name, reloadable, printable, with the organization's drill library behind it.

**Architecture:** Unchanged. Every client method exists. Three new domain modules hold the arithmetic and the two table mappings; a store owns the plan; the components are templates over them.

**Spec:** `docs/superpowers/specs/2026-09-06-vue-phase-4-planner-design.md`

**Baseline:** 2,502 tests across 133 files, four gates green, at commit `1af3c90`.

## Scope

4a is the planner. **The tactical board is 4b** — the planner is usable without a diagram, which is how most sessions are written, and proving it first means the board attaches to a screen that already works.

Not in this phase, however much of `planner.view.js` they occupy: the quiz, the daily thoughts, the school profile forms, the round robin. See the spec's scoping table.

## Global Constraints

- **`index.html`, `public/js/` and `app.js` are not touched.**
- **Pass the resolved organization or team to every client call.** `fetchPracticePlans` refuses a non-uuid outright, and the drills bank is school-scoped.
- **No `'bhs'`, `Beaumont` or `Cougars` literal.**
- **Do not write a second time formatter.** `format24hTo12h` is already in `domain/schedule-view.ts`. Its inverse is not, and belongs beside it.
- `typescript` stays 5.x; `.at()` unavailable; `tsconfig` stays loose.
- Conventional Commits. Four gates, **checked by real exit code**.

## Three traps in the existing data path

These are not hypotheticals; each is visible in the code and each would be reproduced by a faithful-looking rebuild.

**1. `saveFullPracticePlan` upserts and never deletes.** It writes the rows it is given. A drill removed from the array locally is still a row in `practice_plans`, so the next reload brings it back. The legacy planner handles this by calling `deletePracticePlanItem(drill.id)` separately on delete — miss that and a deleted drill is immortal.

**2. A plan is rows, not a record.** `practice_plans` holds one row per drill, and the plan is whatever rows share a `name`. There is no plans table. Grouping is client-side, and some older rows carry the plan name in a `[Plan: X]` prefix inside `coach_notes` instead, which the grouping has to strip.

**3. Plan rows carry ids that belong to a team.** `app.core.js` has a long comment about this: merging another team's plans into the picker let a coach load one, which copied that team's `practice_plans` row ids into the working plan, and the next edit upserted on those ids **with the new team's id** — silently moving the other team's rows. An empty team must produce an empty plan list. Never merge.

**4. `saveFullPracticePlan` returns `{ success }`, not `{ ok }`.** It predates the newer methods. Reading `res.ok` on it is always `undefined`, which is falsy, so every successful save would report as a failure.

---

### Task 1: `domain/practice-plan.ts` — the plan, as data

**Files:** Create `src/domain/practice-plan.ts` and its test. Add `format12hTo24h` to `src/domain/schedule-view.ts` beside its inverse, with tests.

**Interfaces:**
```ts
export interface PlanItem {
  id?: string;
  name: string;
  time: string;        // "4:00 PM - 4:20 PM"
  duration: string;    // "20 min"
  coachNotes: string;
  diagramImage?: string | null;
  diagramData?: any;
}

export interface SavedPlan { id: string; name: string; date: string; drills: PlanItem[] }

/** practice_plans rows into the named plans a coach picks from. */
export function groupPracticePlans(rows: any[]): SavedPlan[];

/** Total session length, as "95 min (1 hr 35 min)". */
export function totalSessionTime(items: PlanItem[]): string;

/** Reflow every slot from the first drill's start plus the durations. */
export function recalculateTimeline(items: PlanItem[]): PlanItem[];

/** Move one drill, and say where the selection went. */
export function moveItem(items: PlanItem[], from: number, to: number):
  { items: PlanItem[]; selected: (was: number) => number };
```

- [x] **Step 1: Write the failing test**

`groupPracticePlans` — rows sharing a `name` become one plan; a `[Plan: Warmups] real notes` prefix in `coach_notes` sets the plan name and is **stripped from the notes** (or the note reads as its own metadata); the drill name falls back through `drill` → `name` → a label; `diagram_image` and `diagram_data` map to camelCase; the plan's date comes from `created_at`.

`totalSessionTime` — sums the leading integer of each `duration`, and says `95 min (1 hr 35 min)` past the hour. A drill with no parseable duration contributes nothing rather than `NaN`.

`recalculateTimeline` — **this is the one that matters.** The printed plan is read on a touchline against a watch, so a timeline whose third drill starts before the second ends is worse than no times. Cover: each drill starts when the previous ends; the first drill's start is taken from its existing slot; **4:00 PM defaults** when there is none; a drill with no duration is 20 minutes; past midnight it wraps rather than reaching 25:00.

`moveItem` — the moved drill lands at the target index, and the **selection follows**: moving the selected drill moves the selection with it, and moving another drill past it shifts it by one. That arithmetic is four branches in the legacy handler and is exactly the kind of thing that silently selects the wrong row.

- [x] **Step 2: Run it, watch it fail, write the module, watch it pass**

- [x] **Step 3: Gates and commit**

---

### Task 2: `domain/plan-row.ts` — the table mapping

Separate from Task 1 because it is the write side, and because the two traps above live here.

**Files:** Create `src/domain/plan-row.ts` and its test.

**Interfaces:**
```ts
/** The rows saveFullPracticePlan takes, for one named plan. */
export function toPlanRows(planName: string, items: PlanItem[], teamId: string): any[];

/** Which stored ids are no longer in the plan, and must be soft-deleted. */
export function removedItemIds(before: PlanItem[], after: PlanItem[]): string[];
```

- [x] **Step 1: Write the failing test**

- The row shape matches what the client sends today: `drill`, `time_slot`, `duration`, `coach_notes`, `diagram_image`, `diagram_data`.
- **An id is sent only when it is a real uuid.** A locally generated `p_1724…` must insert, not fail an update against nothing.
- `removedItemIds` returns ids present before and absent after, and **only real uuids** — an unsaved drill the coach added and removed has no row to delete.
- It returns nothing for a reorder: the same drills in a different order have lost nobody.

- [x] **Step 2: Run it, watch it fail, write the module, watch it pass**

- [x] **Step 3: Gates and commit**

---

### Task 3: The planner store

**Files:** Create `src/stores/planner.ts` and its test.

State: `items`, `savedPlans`, `drillsBank`, `activePlanName`, `selectedIndex`, `loading`, `loadError`, `saveError`.

Actions: `load(teamId, schoolId)`, `addDrill(item)`, `editDrill(index, item)`, `removeDrill(index)`, `move(from, to)`, `savePlan(name)`, `loadPlan(planId)`, `renamePlan(planId, name)`, `deletePlan(planId)`, `copyToTeam(planName, teamId)`, `loadDrillsBank(schoolId)`.

- [x] **Step 1: Write the failing test**

- **Removing a drill soft-deletes its row**, and only when it has a real uuid. Trap 1.
- **Saving after a removal does not resurrect it** — assert `deletePracticePlanItem` was called before or alongside the save.
- **A reorder writes the whole plan.** The order *is* the plan, and a coach who drags two drills and closes the tab has otherwise changed nothing.
- **Every mutation recalculates the timeline** before it writes.
- **`res.success` is what a save reports on**, not `res.ok`. Trap 4 — assert a successful save is reported as success.
- **A team with no plan rows produces an empty picker.** Trap 3: assert `savedPlans` is replaced, never merged, when the team changes.
- **Loading a plan sets `activePlanName`** — the "Copy to team" control is gated on it matching a real saved plan, because `copyPracticePlan` matches on the name.
- **A failed read is reported**, not rendered as an empty plan.

- [x] **Step 2: Run it, watch it fail, write the store, watch it pass**

- [x] **Step 3: Gates and commit**

---

### Task 4: `PlannerView.vue` — the timeline

**Files:** Create `src/views/PlannerView.vue` and its test. Point the `/planner` route at it, replacing the placeholder.

- [x] **Step 1: Write the failing test**

- The route is **coach-only**; a player or guest is redirected, as `/matrix` already is.
- Every drill shows its slot, duration, name and notes, and the header shows the total session time and the drill count.
- **Selecting a drill** marks it, and the selection survives a reorder — that is what Task 1's `moveItem` is for.
- **Reordering has a keyboard path.** Move-up and move-down buttons, and the first drill's up button is disabled rather than a no-op. Drag stays, but the buttons are what make the screen usable on a phone and with a keyboard — neither of which the legacy planner supports.
- An empty timeline says how to fill it, naming the two controls.
- **No `onclick="app.…"` strings**: this is a component, and that boundary is what nothing checks in the legacy app.

- [x] **Step 2: Build it, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 5: The drill modals and the library

**Files:** `src/components/planner/DrillFormModal.vue`, `src/components/planner/DrillsBankModal.vue`, and tests.

- [x] **Step 1: Write the failing tests**

The start/end/duration arithmetic is the substance here, and it is three-way: typing a start and an end fills the duration; picking a duration fills the end; typing an end recomputes the duration. Cover:

- A duration picked from the list fills the end time from the start.
- An end before the start rolls over midnight rather than going negative.
- A duration that is not one of the presets selects "custom" rather than silently picking the nearest.
- The slot is stored as the 12-hour display string, because that is what the printed plan and the timeline both read.

And the library:

- Drills are read for the **organization**, and the modal says so when there is none.
- Adding from the library copies the drill's name, duration and notes into the plan, and its diagram along with them.
- A drill's default duration is used when it has one.

- [x] **Step 2: Build both, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 6: Saved plans, and copy to team

**Files:** `src/components/planner/SavePlanModal.vue`, `src/components/planner/LoadPlanModal.vue`, tests, and the wiring in `PlannerView`.

- [x] **Step 1: Write the failing tests**

- Saving under a name replaces that name's rows and shows the plan as active.
- Loading a plan replaces the timeline and sets `activePlanName`.
- **Copy to team is disabled until a real saved plan is active**, with a title saying why — `copyPracticePlan` matches on the name, and the default heading names a plan no write path ever stores, so the control failed for every coach who had not just loaded one.
- Renaming and deleting a plan ask before they act and report the client's error.
- The team list offered for a copy is **the teams the coach may write to**, not every team: `teamsCoachedBy()` exists precisely so the control does not always fail.

- [x] **Step 2: Build and wire, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 7: Print and download

**Files:** `src/domain/plan-print.ts` and its test; a control in `PlannerView`.

- [ ] **Step 1: Write the failing test**

The document is built as a string and handed to the browser's own print dialog — no PDF library, which is a dependency for a worse result.

- Every drill appears, in order, with its slot and duration.
- The plan's name and the total session time head the document.
- Coach notes keep their line breaks; a plan with none does not print an empty block.
- **A drill's name is escaped**, since it is coach-entered text going into a document.
- Diagram steps are left as a slot the caller fills — rasterizing them needs a canvas, which is 4b's.

- [ ] **Step 2: Run it, watch it fail, write the module, watch it pass**

- [ ] **Step 3: Gates and commit**

---

### Task 8: Close out 4a

- [ ] **Step 1: Confirm the legacy app is untouched**

```bash
git diff --stat 1af3c90..HEAD -- index.html public/js app.js
```

- [ ] **Step 2: Check the round trip by hand.** A plan saved in the Vue planner must open in the legacy one and the reverse — they share `practice_plans`, and the grouping and the row mapping are the two places that can drift.

- [ ] **Step 3: Update `CLAUDE.md`** — the planner route is real, what 4b owes.

- [ ] **Step 4: Commit**

## Definition of done

- A coach builds a session, saves it under a name, and reloads it another day.
- Removing a drill removes it from Postgres too, and it stays gone after a reload.
- The timeline's times are always contiguous, after every add, edit, delete and reorder.
- A drill can be reordered from the keyboard, not only by dragging.
- Copy to team is offered only when it can work, and only for teams the coach may write to.
- The printed plan carries every drill in order.
- Four gates green by exit code; `git diff` shows no change to the legacy app.
