# Vue Migration Phase 2b — Schedule, Coaching Staff and Help

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Phase 2 — the three remaining public views, with full create, edit and delete on the Schedule and the Coaching Staff.

**Architecture:** Unchanged from 2a. Row mappings and view logic go to `src/domain/`; a Pinia store per screen; components compute nothing; `BaseModal` carries every dialog.

**Spec:** `docs/superpowers/specs/2026-09-05-vue-phase-2-public-views-design.md`

**Predecessor:** `docs/superpowers/plans/2026-09-05-vue-phase-2a-auth-and-roster.md`, which proved the pattern on auth and the Roster.

**Baseline:** 2,088 tests across 108 files (14 of them against a real Postgres), four gates green, at commit `2a466cb`.

## Global Constraints

Unchanged from 2a, and still binding:

- **`index.html`, `public/js/` and `app.js` are not touched.**
- **Never call a client method that defaults `schoolId` to `'bhs'`.** This phase touches the coach path, where the literal is especially thick: `fetchCoaches`, `upsertCoach`, `populateCoachSchoolDropdown(selectId, selectedCode = 'bhs')` and `addCoach`'s `data.schoolCode || 'bhs'` all carry it. Resolve the organization from the active team.
- **Never hardcode branding.** No `Beaumont`, `Cougars` or `'bhs'` literal in any file this plan adds.
- **`schedule.location` is `NOT NULL`.** The database test suite found this. The match form must require it, or the write fails at Postgres with a constraint error the coach cannot act on.
- `typescript` stays at 5.x; `.at()` unavailable; `tsconfig` stays loose.
- Conventional Commits. Five gates now: `npm test`, `npm run typecheck`, `npm run build`, `check_syntax.ps1`, and the database suite within `npm test`.
- **Check real exit codes** — piping to `tail` returns tail's status.

## What the survey found

**`openAddCoachModal` is defined twice in `planner.view.js`**, at lines 580 and 826, inside one `Object.assign`. The second wins, so the first is dead code — and editing it would silently do nothing. It is the only duplicate across all 22 classic scripts. Not fixed here (that file is Phase 4), but recorded so the Vue version does not inherit the confusion.

**`renderCoachesView` is more separable than feared.** It reads `this.data.coaches`, `activeTeamLabel()` and `photoOrPlaceholder()` — the latter two already extracted. Cutting it out does not require understanding the planner.

**Help is 725 lines of content and about 200 of behaviour.** `helpSections()` is a nested data structure; `initHelpView()` is the index, search and highlighting.

---

### Task 1: `domain/schedule-view.ts` and `domain/coach-row.ts`

**Files:** Create both, plus a `.test.ts` for each.

- [ ] **Step 1: Read the date helpers before porting them**

Run: `sed -n '23,62p;169,200p' public/js/views/schedule.view.js`

Three functions convert between what a coach sees and what the database stores: `displayMatchDate` renders, `formatIsoToDisplayDate` turns an `<input type="date">` value into the `MON D YYYY` the text column holds, and `formatDisplayDateToIso` reverses it to populate the input. **The stored format matters**: `parse_match_date()` in the schema reads `MON D YYYY`, and anything else stores a fixture whose `match_on` is null — which then sorts and filters as though it had no date at all.

- [ ] **Step 2: Write the failing tests, then the modules**

```ts
// domain/schedule-view.ts
export function displayMatchDate(value: string): string;
export function formatIsoToDisplayDate(iso: string): string;   // 2026-09-04 -> SEP 4 2026
export function formatDisplayDateToIso(display: string): string; // SEP 4 2026 -> 2026-09-04
export function matchDirectionsUrl(match: any): string | null;

// domain/coach-row.ts
export interface Coach { id, name, level, bio, photo, email, schoolId }
export function toCoach(row: any): Coach;
export function toCoaches(rows: any[] | null | undefined): Coach[];
```

Cover the round trip explicitly — `formatDisplayDateToIso(formatIsoToDisplayDate(x)) === x` — and a value neither can read returning something the caller can detect rather than a wrong date.

- [ ] **Step 3: Gates and commit**

---

### Task 2: The Schedule

**Files:** Create `src/stores/schedule.ts` additions, `src/views/ScheduleView.vue` + test, `src/components/schedule/MatchFormModal.vue`. Modify `src/router/index.ts`.

The schedule store already exists from Phase 1 and holds the fixtures, next match, state and record. It gains the writes.

- [ ] **Step 1: Read the write paths**

Run: `sed -n '242,320p;365,389p' public/js/views/schedule.view.js`

Note that `upsertMatch(teamId, match)` **refuses a fixture with no valid team** and returns `null` rather than `{ok, error}` — deliberately, because `admin.js` does `return !!(await upsertMatch(...))`. A caller that ignores the return reports success over a refusal.

- [ ] **Step 2: Add the store actions, test-first**

```ts
addMatch(f, teamId): Promise<WriteResult>
updateMatch(id, f, teamId): Promise<WriteResult>
removeMatch(id, teamId): Promise<WriteResult>
```

Same rules as the roster: never write without a team, reload rather than patch, surface a null return as failure. **Require `location`** — the form validates it, because the database will reject a blank one with a message no coach can act on.

- [ ] **Step 3: Build the view and the form modal, test-first**

Cover: fixtures render in date order; results show a score; a guest sees no write control **in the document**; a coach sees add, edit and delete; the directions link appears only when there is an address; loading and empty are distinguished; the heading names the organization from the store.

- [ ] **Step 4: Point the route at it, run the gates, commit**

---

### Task 3: Coaching Staff

**Files:** Create `src/stores/coaches.ts` + test, `src/views/CoachesView.vue` + test, `src/components/coaches/CoachFormModal.vue`. Modify the router.

- [ ] **Step 1: Read what is being cut out**

Run: `sed -n '530,580p;826,930p' public/js/views/planner.view.js`

Take `renderCoachesView`, `addCoach`, `deleteCoach` and the edit modal. **Leave the `'bhs'` fallbacks behind** — resolve the school from the active team instead. Do not port `populateCoachSchoolDropdown`: a coach belongs to the active organization, and offering a dropdown of every school invites putting them in the wrong one.

- [ ] **Step 2: Approving and rejecting pending accounts**

`auth.approveUserAccess(userId)` and `auth.rejectUserAccess(userId)` exist, and `supabaseService.fetchPendingApprovals(schoolId)` lists them — **that one defaults to `'bhs'`, so pass the resolved id**. This is the screen where a signup in its pending state gets cleared, so it belongs here rather than in the admin panel.

A test must assert a non-coach cannot see or reach either control.

- [ ] **Step 3: Build, route, gates, commit**

---

### Task 4: Help

**Files:** Create `src/content/help.ts`, `src/views/HelpView.vue` + test. Modify the router.

- [ ] **Step 1: Move the content, not the markup**

`helpSections()` at `public/js/views/help.view.js:89` is 725 lines returning a nested structure built with `helpPath()`, `helpNote()`, `helpWarn()` and `helpTable()` — helpers that emit HTML strings.

**Port the data, replace the helpers with components.** A section becomes a typed object; `helpNote` becomes a `<HelpNote>` component. Content that is currently an HTML string in a data structure becomes structured data a template renders, so the file stays editable by someone who is not changing code.

Check `src/data/help-content.test.ts` and `help-coverage.test.ts` first — they already assert things about this content, and what they assert should survive.

- [ ] **Step 2: The index and the search**

`initHelpView()` wires the section index, the search box and match highlighting after `innerHTML` lands. In Vue none of that needs a timeout: the index is a computed over the sections, and search is a filter. Cover an empty query showing everything, a query matching nothing saying so, and case-insensitive matching.

- [ ] **Step 3: Build, route, gates, commit**

---

### Task 5: Close out Phase 2

- [ ] **Step 1: Confirm the legacy app is untouched**

```bash
git diff --stat 2a466cb..HEAD -- index.html public/js app.js
```

- [ ] **Step 2: Record the findings in `CLAUDE.md`**

The duplicate `openAddCoachModal`, and that four of the seven nav views are now Vue while three remain placeholders.

- [ ] **Step 3: Commit**

## Definition of done

- All four public views render in the Vue app, themed by organization.
- A coach can create, edit and delete a fixture and a staff member, and each change survives a reload.
- A guest sees no write control in the document, asserted rather than hidden.
- Five gates green; `git diff` shows no change to the legacy app.
