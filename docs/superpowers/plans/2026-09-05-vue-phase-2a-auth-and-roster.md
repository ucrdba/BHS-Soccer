# Vue Migration Phase 2a — Auth, BaseModal and the Roster

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Vue app signable-into, establish the modal component every later screen reuses, and deliver the Roster with full create, edit and delete.

**Architecture:** A shared `BaseModal` owns focus, Escape and the backdrop. Auth is a modal over the existing `AuthManager`, not new authentication. The roster is a Pinia store over a tested `src/domain/` row mapping, rendered by components that compute nothing.

**Tech Stack:** Vue 3 `<script setup>`, Pinia, Vue Router, Vitest, `@vue/test-utils`, `@pinia/testing`.

**Spec:** `docs/superpowers/specs/2026-09-05-vue-phase-2-public-views-design.md`

**Baseline:** 1,994 tests across 100 files, four gates green, at commit `0588823`.

## Scope of this plan

The spec covers auth plus four views. **This plan covers auth, `BaseModal`, and the Roster.** Schedule, Coaching Staff and Help follow in a second plan once the modal and write patterns are proven on one screen — the write path in particular is the first time this migration touches Postgres, and it should be established once, carefully, rather than three times in parallel.

## Global Constraints

- **`index.html`, `public/js/` and `app.js` are not touched.** If a task seems to need it, stop and report.
- **Never call a client method that defaults `schoolId` to `'bhs'`.** `fetchPlayers`, `fetchCoaches`, `fetchSchool`, `fetchPendingApprovals`, `upsertCoach` and five others declare `schoolId: string = 'bhs'`. Calling one without an argument silently serves Beaumont's data to a club coach. **Always pass the resolved id.** For the roster, use `fetchTeamRoster(teamId)`, which has no such default.
- **Never hardcode branding.** No `Beaumont`, `Cougars` or `'bhs'` literal in any file this plan adds.
- `tsconfig.json` stays loose. `.at()` is unavailable; index from `length - 1`.
- **`typescript` stays at 5.x.** `vue-tsc` cannot run against 7.
- Conventional Commits. Four gates on every commit: `npm test`, `npm run typecheck`, `npm run build`, `check_syntax.ps1`.
- **Check real exit codes** — piping to `tail` returns tail's status, which masked a failing typecheck once already.

---

### Task 1: `BaseModal`

Seven modals in this phase, thirty-six in the app. Built once, here.

**Files:** Create `src/components/ui/BaseModal.vue`, `src/components/ui/BaseModal.test.ts`

**Interfaces:**
```ts
// props
{ open: boolean; title: string; labelledBy?: string }
// emits
{ close: [] }
// slots
default, footer
```

- [ ] **Step 1: Write the failing test**

```ts
/**
 * The modal every screen reuses.
 *
 * A dialog that cannot be dismissed with Escape, or that lets Tab wander onto
 * the page behind it, is a dialog somebody gets stuck in -- and this app is
 * used one-handed on a touchline.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import BaseModal from './BaseModal.vue';

const mountModal = (props = {}, slots = {}) => mount(BaseModal, {
  props: { open: true, title: 'Edit player', ...props },
  slots: { default: '<button id="a">A</button><button id="b">B</button>', ...slots },
  attachTo: document.body
});

describe('BaseModal', () => {
  it('renders nothing when closed', () => {
    expect(mountModal({ open: false }).find('[data-modal]').exists()).toBe(false);
  });

  it('shows the title and the slotted content when open', () => {
    const w = mountModal();
    expect(w.text()).toContain('Edit player');
    expect(w.find('#a').exists()).toBe(true);
  });

  it('is a dialog, and says what names it', () => {
    const w = mountModal();
    const dialog = w.find('[data-modal]');
    expect(dialog.attributes('role')).toBe('dialog');
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(dialog.attributes('aria-label')).toBe('Edit player');
  });

  it('closes on Escape', async () => {
    const w = mountModal();
    await w.find('[data-modal]').trigger('keydown', { key: 'Escape' });
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('closes on a backdrop click but not on a click inside', async () => {
    const w = mountModal();
    await w.find('[data-modal-panel]').trigger('click');
    expect(w.emitted('close')).toBeUndefined();

    await w.find('[data-modal-backdrop]').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('closes from the close button', async () => {
    const w = mountModal();
    await w.find('[data-modal-close]').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('locks the page behind it, and unlocks on close', async () => {
    const w = mountModal();
    expect(document.body.style.overflow).toBe('hidden');
    await w.setProps({ open: false });
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('unlocks when unmounted while still open', () => {
    // Otherwise a route change with a modal open leaves the page unscrollable.
    const w = mountModal();
    w.unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
```

- [ ] **Step 2: Run it, watch it fail, write the component, watch it pass**

Focus management: move focus into the panel when it opens, and restore it to the previously focused element on close. Trap Tab within the panel.

- [ ] **Step 3: Run all four gates and commit**

---

### Task 2: Auth

The Vue app cannot sign in. Everything coach-facing in this and every later phase depends on this task.

**Files:**
- Create: `src/components/auth/AuthModal.vue`, `AuthModal.test.ts`
- Modify: `src/components/layout/AppHeader.vue` (replace the logged no-op), `src/stores/auth.ts` (add the actions)

**Interfaces:**
```ts
// stores/auth.ts gains:
async function login(email: string, password: string): Promise<LoginResult>;
async function register(f: { name: string; email: string; password: string; role: string; acceptTypedEmail?: boolean }): Promise<RegisterResult>;
async function logout(): Promise<void>;
```

These wrap `auth.loginUser`, `auth.registerUser` and `auth.logout` from `src/auth.ts` and call `sync()` afterwards. **Do not reimplement authentication** — `src/auth.ts` is real Supabase Auth.

- [ ] **Step 1: Read the flow being ported**

Run: `sed -n '30,175p' public/js/views/coaches.view.js`

Note the three tabs, and that `registerUser` can come back with `emailSuggestion` — a near-miss for a common provider — or `requiresVerification`.

- [ ] **Step 2: Write the failing test**

Cover:
- the three tabs, and switching between them
- a successful sign-in closes the modal and reveals the guarded nav items
- a failed sign-in shows the message **inline** and leaves the modal open
- a sign-in that returns `isPendingVerification` opens the verify tab with the address filled in
- registration offering a typo suggestion shows **both** options, and "use what I typed" re-submits with `acceptTypedEmail: true`
- registration requiring verification opens the verify tab
- no `window.alert` is called anywhere in the flow — assert it with a spy, since replacing the blocking alert is a stated goal

The email suggestion is **offered, never enforced**: an unfamiliar domain is ordinary for a club coach, and someone may genuinely own an address one character from Gmail. The test must assert that keeping the typed address is an equally reachable path, not a buried one.

- [ ] **Step 3: Write the store actions and the component**

- [ ] **Step 4: Wire the header**

Replace the `console.info` no-op in `AppHeader.vue`. Guest opens the modal; a signed-in user gets a menu with **Sign Out** calling `authStore.logout()`.

- [ ] **Step 5: Verify by hand, then run the gates and commit**

`npm run dev`, open `/app.html`, sign in with a real account. The three guarded nav items must appear, and signing out must remove them. This is the first task whose success cannot be proven by tests alone.

---

### Task 3: `domain/player-row.ts`

The roster's read mapping, as `schedule-row.ts` established.

**Files:** Create `src/domain/player-row.ts`, `src/domain/player-row.test.ts`

**Interfaces:**
```ts
export interface Player {
  id: string; membershipId: string;
  name: string; firstName: string; lastName: string;
  classYear: string; height: string; photo: string;
  number: number | null; recordingNumber: number | null;
  position: string; seasonStats: any; ratings: any;
}
export function toPlayer(row: any): Player;
export function toRoster(rows: any[] | null | undefined): Player[];
```

- [ ] **Step 1: Read the mapping being ported**

Run: `sed -n '345,366p' public/js/app.core.js`

Three things there are not obvious and must survive:

- the row is a `team_players` membership with the person nested under `players`, so `id` comes from `m.players.id` while `membershipId` is `m.id`
- `name` is maintained by a database trigger from the two parts; the parts come along for the editor, which edits them rather than the whole
- `recordingNumber` is the **paper-sheet** number, distinct from the shirt `number`
- the mapping ends `.filter(p => p.id)` — a membership whose join produced no person is dropped rather than rendered as a blank card

- [ ] **Step 2: Write the failing test, then the module, then watch it pass**

Cover each of the four points above, plus `toRoster(null)` returning `[]` — `fetchTeamRoster` returns null on failure, which is not an empty squad.

- [ ] **Step 3: Gates and commit**

---

### Task 4: `domain/roster-view.ts` — sorting and filtering

`sortRoster` and `filterRoster` in `roster.view.js` mutate state and re-render. The decision is extractable; the assignment is not.

**Files:** Create `src/domain/roster-view.ts`, `src/domain/roster-view.test.ts`

- [ ] **Step 1: Read what the filters actually are**

Run: `sed -n '102,150p' public/js/views/roster.view.js`

Do not guess the filter names from the buttons — read them. `comparePlayers` and `sortedPlayers` are already in `src/domain/roster.ts` from Phase 0 and are reused, not rewritten.

- [ ] **Step 2: Write the failing test, then the module**

```ts
export function filterRoster(players: Player[], filter: string): Player[];
export function rosterFilters(players: Player[]): { key: string; label: string; count: number }[];
```

`rosterFilters` returning counts is new: a filter button that leads to an empty list is worth knowing about before it is pressed. Cover a filter matching nothing, an unknown filter name returning everyone rather than nobody, and case-insensitive position matching.

- [ ] **Step 3: Gates and commit**

---

### Task 5: The roster store

**Files:** Create `src/stores/roster.ts`, `src/stores/roster.test.ts`

```ts
// state
players: Player[]; loading: boolean; loadError: string | null; loadedTeamId: string | null;
sortBy: 'number' | 'name'; filter: string;
// getters
visible: Player[];            // sorted then filtered
filters: { key, label, count }[];
// actions
load(teamId), addPlayer(f), updatePlayer(id, f), removePlayer(id), addExistingPlayer(playerId)
```

- [ ] **Step 1: Read the four write paths before writing any of them**

Run: `sed -n '167,300p;351,439p' public/js/views/roster.view.js`

These are the first Postgres writes in the Vue app. For each, note **which client method it calls and what it passes**, particularly the school or team id — and note that `upsertPlayer(schoolId, player)` takes a school while the roster is fetched by team.

- [ ] **Step 2: Write the failing test**

Beyond the happy paths, cover:

- a write that returns null is surfaced as an error, **not** swallowed — `upsertPlayer` returns `null` for failure and a truthy object for success, so a caller that ignores the return reports success over a silent loss
- a write is never attempted without a resolved team id
- after a successful write the store reloads rather than patching local state, so what is on screen is what is in Postgres

- [ ] **Step 3: Write the store, watch it pass, run the gates, commit**

---

### Task 6: The Roster view

**Files:**
- Create: `src/views/RosterView.vue`, `RosterView.test.ts`
- Create: `src/components/roster/PlayerCard.vue`, `PlayerDetailModal.vue`, `PlayerFormModal.vue`
- Modify: `src/router/index.ts` (swap the placeholder for the real view)

- [ ] **Step 1: Write the failing view test**

Cover:
- every player on the active team renders
- the sort control reorders, and the filter narrows
- a guest sees **no** add, edit or delete control
- a coach sees all three
- clicking a card opens the detail modal
- an empty roster says so, and says something different while still loading
- the heading names the organization from the store, with no hardcoded name
- **no Phase 5 buttons** — assert the absence of lineup, plus/minus, season-report and recording-number controls, which the spec omits rather than stubs

- [ ] **Step 2: Build the components**

`PlayerCard` is presentational — props in, events out, no store access. The photo falls back to a placeholder the way `photoOrPlaceholder` does in `app.core.js`; read it rather than inventing a second placeholder.

- [ ] **Step 3: Point the route at the real view**

In `src/router/index.ts`, replace the roster placeholder with `RosterView`.

- [ ] **Step 4: Verify against the legacy app by hand**

Run `npm run dev`, open `/` and `/app.html#/roster` side by side. The same players, in the same order, under the same organization name. Then, signed in as a coach: add a player, reload, and confirm it is still there. **A write that does not survive a reload never reached Postgres**, and that is the failure this phase exists to avoid.

- [ ] **Step 5: Run all four gates and commit**

---

### Task 7: Close out 2a

- [ ] **Step 1: Confirm the legacy app is untouched**

```bash
git diff --stat 0588823..HEAD -- index.html public/js app.js
```

Expected: no output.

- [ ] **Step 2: Record what the survey found**

Add to `CLAUDE.md`, under the Supabase section: **ten client methods default `schoolId` to `'bhs'`** — `getSchoolUuid`, `fetchPendingApprovals`, `fetchPlayers`, `fetchSoccerCategories`, `fetchDrillsBank`, `upsertDrillBankItem`, `fetchSchool`, `upsertSchool`, `fetchCoaches`, `upsertCoach`. Calling one without an argument silently serves Beaumont's data to a club coach. Note that removing the defaults is worth doing but touches code both apps share, so it wants its own change rather than being folded into a view.

- [ ] **Step 3: Commit**

## Definition of done

- A coach can sign in through the Vue app, and the guarded nav items appear.
- The Roster renders the active team's squad, sorted and filtered, themed by organization.
- A coach can add, edit and delete a player, and the change survives a reload.
- A guest sees no write control, and a test asserts it rather than the UI merely hiding it.
- All four gates green; `git diff` shows no change to the legacy app.
