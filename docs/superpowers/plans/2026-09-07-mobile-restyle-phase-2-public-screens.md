# Mobile Restyle Phase 2 — Public Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle Home, Schedule, Roster and the player detail to the canvas's paper-ground screens (1a·1, 1a·2, 1a·3), add the short countdown and the result word the canvas shows, and close the two accessibility and guard items parked from phase 1.

**Architecture:** Phase 1 left every view rendering on the paper ground through the temporary `--bhs-*` aliases. This phase rewrites the three public views' templates and scoped styles against the ground tokens directly (no alias names in files this phase touches), adds three small framework-free domain functions the templates need (`shortCountdown`, `matchOutcome`, `skillBars`), and keeps every store, route and `data-*` test hook the views already have. No new routes; the coach's tools stay modals until phase 3.

**Tech Stack:** Vue 3 `<script setup>`, Pinia, Vitest 4 + @vue/test-utils under jsdom, `vue-tsc`, Vite 8.

**Spec:** `docs/superpowers/specs/2026-09-07-mobile-restyle-design.md` (§5.1 Paper ground, §5.4 Dialogs, §6 Widths, §8 Testing, phase 2 of §9). The canvas is `qlaudDesignSpec/soccer-program-mobile.dc.html`; the three screens are the `1a` option (Home, Schedule, Roster).

**Baseline entering this plan:** commit `962f32e` on `feature/convertToVue`, 129 test files, 2,365 tests passing, 2 skipped, three gates green.

## Global Constraints

- **Three gates on every commit, checked by exit code:** `npm test`, `npm run typecheck`, `npm run build`. In bash: `npm test > /dev/null 2>&1; echo "EXIT=$?"`. The suite takes about 80 seconds.
- **Files this phase rewrites use the ground tokens only:** `--ground`, `--surface`, `--surface-deep`, `--ink`, `--ink-muted`, `--ink-soft`, `--rule`, `--rule-strong`, `--live`, `--mark`, `--heading-face`, `--font-heading`, `--font-body`, `--space-*`, `--radius-*`, `--shadow-md`, `--color-success/warning/danger`, and the helpers `.kicker`, `.tnum`, `.sr-only`, `.btn`, `.btn--go`. **No `--bhs-*` name, no `--text-muted`, no literal colour** in a file this plan rewrites. (Files it does not touch keep their aliases until phase 5.)
- **Organization colours are stroke only.** On paper, `--mark` appears in the crest keyline (phase 1) and nowhere else in these screens; the canvas uses the Classical accent (`--rule-strong` / `--live`) for kickers, rules and links.
- **Never hardcode a school, mascot, colour or 'bhs'.** Every name, mascot and figure comes from a store.
- **Every `data-*` hook the existing tests use is kept** unless the task says which test changes and why. The hooks: Home `data-countdown-unit` (replaced by `data-countdown`, Task 5), `data-daily-thought`, `data-thought-*`; Schedule `data-fixture`, `data-directions`, `data-score`, `data-fixture-lineup`, `data-fixture-pm`, `data-match-edit`, `data-match-remove`, `data-lineup-missing`, `data-add-match`, `data-open-lineup`, `data-open-season`, `data-empty`, `data-load-error`, `data-notice`; Roster `data-filter-chip`, `data-sort-number`, `data-sort-name`, `data-player-open`, `data-player-edit`, `data-player-remove`, `data-add-player`, `data-open-numbers`, `data-empty`, `data-empty-filter`, `data-load-error`, `data-notice`; player detail `data-season-stat`.
- **Empty, loading and refused states keep their present wording.** The Home tests pin "coming soon", "add them from", "season complete", the last opponent's name; the Schedule and Roster tests pin "No fixtures yet", "No players on this team yet" and the load-error text.
- **Low-minute players, recording numbers and the clock gate are untouched** — none of these screens carry them, and nothing here may add a filter that hides a player.
- `tsconfig.json` stays loose; `typescript` stays on 5.x. `.at()` is unavailable at this `lib` target.
- Conventional Commits, one commit per task, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Git prints CRLF warnings on this machine; they are not errors.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/design-tokens.test.ts` (modify) | The white guard's pattern, extracted to a constant and tested against fixture strings. |
| `src/components/layout/AppNav.vue` (modify) | Escape closes the More sheet; focus moves into it on open and back to the toggle on close. |
| `src/components/layout/AppHeader.vue` (modify) | The record's accessible name on a real group, not a bare span. |
| `src/components/ui/BaseModal.vue` (modify) | A visible focus ring on the panel's fallback focus. |
| `src/domain/schedule.ts` (modify) | `shortCountdown`. |
| `src/domain/season-record.ts` (modify) | `parseScore`, extracted from `seasonRecord` and reused by it. |
| `src/domain/schedule-view.ts` (modify) | `matchOutcome`, the result word. |
| `src/domain/player-skills.ts` (create) | `skillBars`: the four ratings as bars. |
| `src/components/home/DailyThought.vue` (modify) | The message as the canvas card; controls unchanged. |
| `src/views/HomeView.vue` (rewrite template + styles) | Canvas 1a·1. |
| `src/views/ScheduleView.vue` (rewrite template + styles) | Canvas 1a·2. |
| `src/components/roster/PlayerCard.vue` (rewrite) | A hairline row on a phone, a card on a desk. |
| `src/views/RosterView.vue` (rewrite template + styles) | Canvas 1a·3. |
| `src/components/roster/PlayerDetailModal.vue` (rewrite) | The canvas bio with skill bars. |
| `src/components/roster/PlayerDetailModal.test.ts` (create) | First tests for the detail. |
| The five view/component test files (modify) | Where a hook or a figure changes. |

---

### Task 1: The white guard catches shorthand and alpha hex

Parked from phase 1's final review: the guard's regex misses `border: 1px dashed white` (no colon directly before `white`) and `#ffffffaa` (a word boundary cannot fall between two hex digits). Four more phases of scoped CSS are coming; the guard has to hold.

**Files:**
- Modify: `src/design-tokens.test.ts:115-123` (the `component styles` describe)

**Interfaces:**
- Produces: `WHITE_LITERAL`, a `RegExp` constant in the test file. Nothing else consumes it.

- [ ] **Step 1: Write the failing pattern tests**

In `src/design-tokens.test.ts`, replace the `describe('component styles', …)` block with:

```ts
/**
 * A white literal in a style block, in any of the shapes CSS allows.
 *
 * `\b` is not enough on its own: it cannot fall between two hex digits, so
 * `#ffffffaa` slips past `#ffffff\b`, and `white` in a shorthand such as
 * `1px dashed white` has no colon before it. The lookarounds keep
 * `white-space` and custom-property names out.
 */
const WHITE_LITERAL =
  /#fff(?:fff)?(?:[0-9a-f]{2})?\b|(?<![\w-])white\b(?!-)|rgba?\(\s*255\s*,?\s*255\s*,?\s*255/i;

describe('the white guard pattern', () => {
  const caught = [
    'color: #fff;', 'color: #FFF;', 'color:#ffffff;', 'border-color: #ffffffaa;',
    'color: white;', 'border: 1px dashed white;', 'background: rgb(255 255 255 / 0.1);',
    'background: rgba(255,255,255,.5);'
  ];
  const allowed = [
    'white-space: nowrap;', 'color: var(--white-ish);', 'color: #fffbe6;',
    'background: #ffd700;', 'content: "whiteboard";', 'color: var(--ink);'
  ];

  for (const s of caught) {
    it(`catches ${s}`, () => { expect(WHITE_LITERAL.test(s)).toBe(true); });
  }
  for (const s of allowed) {
    it(`allows ${s}`, () => { expect(WHITE_LITERAL.test(s)).toBe(false); });
  }
});

describe('component styles', () => {
  const files = vueFiles(join(process.cwd(), 'src'));

  it('set no hardcoded white — the ground is not always dark any more', () => {
    const offenders = files.filter(f => WHITE_LITERAL.test(styleOf(f)));
    expect(offenders.map(f => f.replace(process.cwd(), '')), 'use var(--ink) or a color-mix of it').toEqual([]);
  });
});
```

Note `"whiteboard"` is allowed because `\b` after `white` fails before `b`. `#fffbe6` is allowed because after `#fff` the optional groups cannot make a boundary land before `b`.

- [ ] **Step 2: Run it to verify the new cases fail**

Run: `npx vitest run src/design-tokens.test.ts`
Expected: the `catches border: 1px dashed white;` and `catches border-color: #ffffffaa;` cases fail against the old pattern only if you kept it; with the new constant in place they pass. If the file-walk case now lists a component, that component has a shorthand white the old pattern missed: fix it to `var(--ink)` in the same task and name it in the commit body.

- [ ] **Step 3: Run the focused test and the three gates**

Run: `npx vitest run src/design-tokens.test.ts` → PASS. Then the three gates by exit code.

- [ ] **Step 4: Commit**

```bash
git add src/design-tokens.test.ts
git commit -m "test: the white guard catches shorthand white and alpha hex

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Keyboard and focus in the shell

Parked from phase 1: the More sheet has no Escape and no focus management, the header's record puts `aria-label` on a bare `<span>` (ignored by most assistive tech), and `index.css` sets `:focus { outline: none }` so `BaseModal`'s fallback focus on its panel shows no ring.

**Files:**
- Modify: `src/components/layout/AppNav.vue`, `src/components/layout/AppNav.test.ts`
- Modify: `src/components/layout/AppHeader.vue:103`, `src/components/layout/AppHeader.test.ts`
- Modify: `src/components/ui/BaseModal.vue` (styles only)

- [ ] **Step 1: Write the failing nav tests**

Append to `describe('AppNav', …)` in `src/components/layout/AppNav.test.ts`:

```ts
  it('closes the sheet on Escape', async () => {
    const w = mountAs({ isCoach: true, canAccessRatings: true, isGuest: false });
    await w.find('[data-nav-toggle]').trigger('click');
    expect(w.find('[data-nav-drawer]').classes()).toContain('is-open');
    await w.find('[data-nav-drawer]').trigger('keydown', { key: 'Escape' });
    expect(w.find('[data-nav-drawer]').classes()).not.toContain('is-open');
  });

  it('moves focus into the sheet on open and back to the toggle on close', async () => {
    // Mounted with attachTo so document.activeElement follows .focus().
    const live = mount(AppNav, {
      attachTo: document.body,
      global: {
        plugins: [createTestingPinia({
          createSpy: vi.fn, stubActions: false,
          initialState: { auth: { isCoach: true, isAdmin: false, canAccessRatings: true, isGuest: false, isLoggedIn: true, role: 'coach', user: null } }
        })],
        stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } }
      }
    });

    await live.find('[data-nav-toggle]').trigger('click');
    await live.vm.$nextTick();
    expect(document.activeElement).toBe(live.find('[data-nav-sheet-item]').element);

    await live.find('[data-nav-drawer]').trigger('keydown', { key: 'Escape' });
    await live.vm.$nextTick();
    expect(document.activeElement).toBe(live.find('[data-nav-toggle]').element);
    live.unmount();
  });
```

- [ ] **Step 2: Write the failing header test**

Append to `describe('AppHeader', …)` in `src/components/layout/AppHeader.test.ts`:

```ts
  it('names the record for assistive tech on a real group', () => {
    const w = mountWith({ loadedTeamId: 't1', matches: [{ status: 'COMPLETED', score: '2-0' }] });
    const record = w.find('[data-season-record]');
    expect(record.attributes('role')).toBe('group');
    expect(record.attributes('aria-label')).toBe('Season record');
  });
```

- [ ] **Step 3: Run both test files to verify the new cases fail**

Run: `npx vitest run src/components/layout/AppNav.test.ts src/components/layout/AppHeader.test.ts`
Expected: the three new cases fail (no Escape handling, focus stays on the toggle, no `role`).

- [ ] **Step 4: Implement in AppNav.vue**

In the `<script setup>` block, replace `toggleSheet` and `closeSheet` with:

```ts
import { ref, computed, nextTick } from 'vue';
```

(replacing the existing `import { ref, computed } from 'vue';`), and:

```ts
const toggleEl = ref<HTMLButtonElement | null>(null);
const sheetEl = ref<HTMLElement | null>(null);

/**
 * Opening the sheet moves focus into it; closing it gives focus back to the
 * toggle. Without this a keyboard user opens the sheet and is still standing
 * on the More tab with the links somewhere behind them.
 */
async function toggleSheet(): Promise<void> {
  sheetOpen.value = !sheetOpen.value;
  await nextTick();
  if (sheetOpen.value) {
    sheetEl.value?.querySelector<HTMLElement>('[data-nav-sheet-item]')?.focus();
  } else {
    toggleEl.value?.focus();
  }
}

/** A sheet left open over the page it just navigated to reads as a bug. */
function closeSheet(): void {
  sheetOpen.value = false;
}

/** Escape closes the sheet and returns focus, the way a dialog does. */
async function onSheetKeydown(e: KeyboardEvent): Promise<void> {
  if (e.key !== 'Escape') return;
  closeSheet();
  await nextTick();
  toggleEl.value?.focus();
}
```

In the template, add `ref="toggleEl"` to the More `<button>`, and on the sheet `<div>` add `ref="sheetEl"` and `@keydown="onSheetKeydown"`. Nothing else in the template changes.

- [ ] **Step 5: Implement in AppHeader.vue and BaseModal.vue**

In `AppHeader.vue`, change the record element from `<span v-if="showRecord" class="record tnum" data-season-record aria-label="Season record">` to:

```html
<span v-if="showRecord" class="record tnum" data-season-record role="group" aria-label="Season record">
```

In `BaseModal.vue`'s `<style scoped>`, after the `.modal__panel--wide` rule, add:

```css
/* index.css clears :focus so :focus-visible can own the ring; the panel is
   focused programmatically when a dialog has no control, and must show one. */
.modal__panel:focus { outline: 2px solid var(--live); outline-offset: -2px; }
```

- [ ] **Step 6: Run the tests to verify they pass, then the three gates**

Run: `npx vitest run src/components/layout/AppNav.test.ts src/components/layout/AppHeader.test.ts src/components/ui/BaseModal.test.ts` → PASS. Three gates exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/AppNav.vue src/components/layout/AppNav.test.ts src/components/layout/AppHeader.vue src/components/layout/AppHeader.test.ts src/components/ui/BaseModal.vue
git commit -m "fix: keyboard and focus in the shell

Escape closes the More sheet and focus follows it in and out; the record
is a named group; a dialog focused on its panel shows a ring.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Three domain functions the screens need

Framework-free, tested on their own: the countdown as one figure, the result word for a completed fixture, and the four ratings as bars.

**Files:**
- Modify: `src/domain/schedule.ts`, `src/domain/schedule.test.ts`
- Modify: `src/domain/season-record.ts`, `src/domain/season-record.test.ts`
- Modify: `src/domain/schedule-view.ts`, `src/domain/schedule-view.test.ts`
- Create: `src/domain/player-skills.ts`, `src/domain/player-skills.test.ts`

**Interfaces:**
- Produces: `shortCountdown(c: Countdown | null): string`; `lastCompletedMatch(schedule: any[]): any | null`; `parseScore(score: unknown): { goalsFor: number; goalsAgainst: number } | null`; `matchOutcome(m: any): 'won' | 'drawn' | 'lost' | null`; `SKILLS: readonly string[]`; `skillBars(ratings: unknown): { key: string; name: string; value: number; pct: number }[]`.

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/schedule.test.ts`:

```ts
import { shortCountdown } from './schedule';

describe('shortCountdown', () => {
  it('reads days and hours when a day or more remains', () => {
    expect(shortCountdown({ days: '03', hours: '04', mins: '12' })).toBe('3d 04h');
    expect(shortCountdown({ days: '12', hours: '00', mins: '00' })).toBe('12d 00h');
  });

  it('reads hours and minutes inside a day', () => {
    expect(shortCountdown({ days: '00', hours: '04', mins: '12' })).toBe('04h 12m');
  });

  it('reads minutes inside an hour, and zero as zero minutes', () => {
    expect(shortCountdown({ days: '00', hours: '00', mins: '12' })).toBe('12m');
    expect(shortCountdown({ days: '00', hours: '00', mins: '00' })).toBe('0m');
  });

  it('is empty when there is nothing to count down to', () => {
    expect(shortCountdown(null)).toBe('');
  });
});

describe('lastCompletedMatch', () => {
  const m = (over: any) => ({ id: 'x', status: 'COMPLETED', score: '1 - 0', date: 'AUG 21 2026', matchOn: '2026-08-21', ...over });

  it('is the most recent completed fixture, not the most recent dated one', () => {
    // lastPlayedMatch answers "what was the latest fixture on the calendar",
    // which includes next week. A result is only a completed fixture.
    const done = m({ id: 'done' });
    const next = m({ id: 'next', status: 'SCHEDULED', score: null, date: 'SEP 4 2026', matchOn: '2026-09-04' });
    expect(lastCompletedMatch([next, done])?.id).toBe('done');
  });

  it('prefers the later of two completed fixtures', () => {
    const early = m({ id: 'early', date: 'AUG 7 2026', matchOn: '2026-08-07' });
    const late = m({ id: 'late' });
    expect(lastCompletedMatch([early, late])?.id).toBe('late');
  });

  it('is null with nothing completed', () => {
    expect(lastCompletedMatch([m({ status: 'SCHEDULED' })])).toBeNull();
    expect(lastCompletedMatch([])).toBeNull();
  });
});
```

(`schedule.test.ts` already has a multi-line import from `./schedule`; add `shortCountdown` and `lastCompletedMatch` to it rather than a second import line.)

Append to `src/domain/season-record.test.ts`:

```ts
import { parseScore } from './season-record';

describe('parseScore', () => {
  it('reads the two numbers whatever the separator', () => {
    expect(parseScore('3 - 1')).toEqual({ goalsFor: 3, goalsAgainst: 1 });
    expect(parseScore('3–1')).toEqual({ goalsFor: 3, goalsAgainst: 1 });
    expect(parseScore('0:2')).toEqual({ goalsFor: 0, goalsAgainst: 2 });
  });

  it('strips a leading team name rather than one organization\'s', () => {
    expect(parseScore('Legends 2-2')).toEqual({ goalsFor: 2, goalsAgainst: 2 });
  });

  it('refuses anything that does not yield two numbers', () => {
    expect(parseScore('W')).toBeNull();
    expect(parseScore('3')).toBeNull();
    expect(parseScore('')).toBeNull();
    expect(parseScore(null)).toBeNull();
  });
});
```

Append to `src/domain/schedule-view.test.ts`:

```ts
import { matchOutcome } from './schedule-view';

describe('matchOutcome', () => {
  it('reads the word from the score of a completed fixture', () => {
    expect(matchOutcome({ status: 'COMPLETED', score: '3 - 1' })).toBe('won');
    expect(matchOutcome({ status: 'COMPLETED', score: '1 - 1' })).toBe('drawn');
    expect(matchOutcome({ status: 'COMPLETED', score: '0 - 2' })).toBe('lost');
  });

  it('says nothing for a fixture not yet played or with no readable score', () => {
    expect(matchOutcome({ status: 'SCHEDULED', score: null })).toBeNull();
    expect(matchOutcome({ status: 'COMPLETED', score: 'W' })).toBeNull();
    expect(matchOutcome(null)).toBeNull();
  });
});
```

Create `src/domain/player-skills.test.ts`:

```ts
/**
 * The four skill ratings as bars.
 *
 * Ratings are stored per membership as a loose object; the bio shows the four
 * the program rates, in a fixed order, and only those actually set. A missing
 * rating is not a zero — a bar at nothing would read as a judgement.
 */
import { describe, it, expect } from 'vitest';
import { skillBars, SKILLS } from './player-skills';

describe('skillBars', () => {
  it('returns the four skills in order with a percentage of ten', () => {
    expect(skillBars({ technical: 8, tactical: 7, physical: 9, mental: 7 })).toEqual([
      { key: 'technical', name: 'Technical', value: 8, pct: 80 },
      { key: 'tactical', name: 'Tactical', value: 7, pct: 70 },
      { key: 'physical', name: 'Physical', value: 9, pct: 90 },
      { key: 'mental', name: 'Mental', value: 7, pct: 70 }
    ]);
  });

  it('leaves out a rating that is not set, and ignores keys it does not know', () => {
    expect(skillBars({ technical: 6, speed: 9 })).toEqual([
      { key: 'technical', name: 'Technical', value: 6, pct: 60 }
    ]);
  });

  it('reads a number typed as text and clamps to the scale', () => {
    expect(skillBars({ mental: '7' })[0].value).toBe(7);
    expect(skillBars({ mental: 14 })[0]).toEqual({ key: 'mental', name: 'Mental', value: 10, pct: 100 });
    expect(skillBars({ mental: -2 })[0].value).toBe(0);
  });

  it('is empty for nothing', () => {
    expect(skillBars(null)).toEqual([]);
    expect(skillBars({})).toEqual([]);
    expect(skillBars({ technical: 'lots' })).toEqual([]);
  });

  it('names the four the program rates', () => {
    expect(SKILLS).toEqual(['technical', 'tactical', 'physical', 'mental']);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/domain/schedule.test.ts src/domain/season-record.test.ts src/domain/schedule-view.test.ts src/domain/player-skills.test.ts`
Expected: FAIL — the four functions are not exported.

- [ ] **Step 3: Implement**

Append to `src/domain/schedule.ts`:

```ts
/**
 * The countdown as one figure: "3d 04h", "04h 12m" inside a day, "12m"
 * inside an hour. The canvas shows a single figure beside the kick-off time
 * rather than three boxes, because a parent glancing at a phone wants one
 * number.
 */
export function shortCountdown(c: Countdown | null): string {
  if (!c) return '';
  const days = Number(c.days) || 0;
  const hours = Number(c.hours) || 0;
  const mins = Number(c.mins) || 0;
  const two = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${two(hours)}h`;
  if (hours > 0) return `${two(hours)}h ${two(mins)}m`;
  return `${mins}m`;
}

/**
 * The most recent completed fixture, or null.
 *
 * Not `lastPlayedMatch`: that is the latest fixture on the calendar, which
 * includes next week's, and is what the "stale schedule" state wants. A
 * result is only ever a completed fixture.
 */
export function lastCompletedMatch(schedule: any[]): any | null {
  const done = (schedule || [])
    .filter(m => m && m.status === 'COMPLETED')
    .map(m => ({ m, t: matchDateTime(m) }))
    .filter(x => x.t)
    .sort((a, b) => (b.t as Date).getTime() - (a.t as Date).getTime());
  return done.length ? done[0].m : null;
}
```

In `src/domain/season-record.ts`, add above `seasonRecord`:

```ts
/**
 * The two numbers in a score, or null.
 *
 * Scores are free text a coach typed. A leading team name is stripped —
 * any name, not one organization's — and any separator is accepted. Anything
 * that does not yield two numbers is refused rather than guessed: a fictional
 * result in the record is worse than a missing one.
 */
export function parseScore(score: unknown): { goalsFor: number; goalsAgainst: number } | null {
  const raw = String(score ?? '')
    .replace(/^[^\d]*/, '')
    .replace(/[–—\-:]/g, ' ');
  const nums = raw.match(/\d+/g);
  if (!nums || nums.length < 2) return null;
  const goalsFor = parseInt(nums[0], 10);
  const goalsAgainst = parseInt(nums[1], 10);
  if (!Number.isFinite(goalsFor) || !Number.isFinite(goalsAgainst)) return null;
  return { goalsFor, goalsAgainst };
}
```

and replace the body of the `completed.forEach` in `seasonRecord` with:

```ts
  completed.forEach(m => {
    const parsed = parseScore(m.score);
    if (!parsed) return;
    const { goalsFor: gf, goalsAgainst: ga } = parsed;

    gamesPlayed++;
    goalsFor += gf;
    goalsAgainst += ga;
    if (ga === 0) cleanSheets++;
    if (gf > ga) wins++;
    else if (gf === ga) draws++;
    else losses++;
  });
```

Append to `src/domain/schedule-view.ts` (and add `import { parseScore } from './season-record';` at the top):

```ts
export type Outcome = 'won' | 'drawn' | 'lost';

/**
 * The word for a completed fixture's result.
 *
 * The word, not a colour, carries the outcome on the schedule (spec §18):
 * "Won 3–1" reads in sunlight and to a screen reader. Nothing for a fixture
 * not yet played or whose score does not parse.
 */
export function matchOutcome(m: any): Outcome | null {
  if (!m || m.status !== 'COMPLETED') return null;
  const parsed = parseScore(m.score);
  if (!parsed) return null;
  if (parsed.goalsFor > parsed.goalsAgainst) return 'won';
  if (parsed.goalsFor === parsed.goalsAgainst) return 'drawn';
  return 'lost';
}
```

Create `src/domain/player-skills.ts`:

```ts
/**
 * The four skill ratings as bars for the bio.
 *
 * `team_players.ratings` is a loose object. The bio shows the four skills the
 * program rates, in a fixed order, out of ten. A rating that is not set is
 * left out rather than drawn at zero, because an empty bar reads as a
 * judgement the coach never made.
 */
export const SKILLS = ['technical', 'tactical', 'physical', 'mental'] as const;

const NAMES: Record<string, string> = {
  technical: 'Technical', tactical: 'Tactical', physical: 'Physical', mental: 'Mental'
};

export const SKILL_SCALE = 10;

export interface SkillBar {
  key: string;
  name: string;
  value: number;
  /** Whole percent of the scale, for the bar's width. */
  pct: number;
}

export function skillBars(ratings: unknown): SkillBar[] {
  if (!ratings || typeof ratings !== 'object') return [];
  const out: SkillBar[] = [];
  for (const key of SKILLS) {
    const raw = (ratings as Record<string, unknown>)[key];
    if (raw === null || raw === undefined || raw === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const value = Math.min(SKILL_SCALE, Math.max(0, n));
    out.push({ key, name: NAMES[key], value, pct: Math.round((value / SKILL_SCALE) * 100) });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass, then the three gates**

Run the four test files → PASS. `season-record.test.ts`'s existing cases still pass because `parseScore` is the same arithmetic moved. Three gates exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/domain/schedule.ts src/domain/schedule.test.ts src/domain/season-record.ts src/domain/season-record.test.ts src/domain/schedule-view.ts src/domain/schedule-view.test.ts src/domain/player-skills.ts src/domain/player-skills.test.ts
git commit -m "feat: the short countdown, the result word, and skill bars

Three framework-free functions the public screens need. parseScore is
lifted out of seasonRecord so the result word and the record cannot read
a score two different ways.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The coach's message as the canvas card

`DailyThought.vue` keeps every control and hook; the message itself becomes the bordered card with the accent rule from canvas 1a·1, and the styles move to the tokens.

**Files:**
- Modify: `src/components/home/DailyThought.vue` (the `active` block of the template, and all styles)

- [ ] **Step 1: Confirm the existing tests pass before touching anything**

Run: `npx vitest run src/components/home/DailyThought.test.ts src/views/HomeView.test.ts` → PASS. These are the tests that must still pass after; no new assertions are added because no behaviour changes.

- [ ] **Step 2: Rewrite the active-message markup**

Replace the `<template v-if="active">…</template>` block inside the section with:

```html
    <template v-if="active">
      <p class="thought__kicker kicker">
        <template v-if="active.coach_name">From {{ active.coach_name }}</template>
        <template v-else>Coach's message</template>
      </p>
      <h2 class="thought__h">{{ active.title || "Coach's message" }}</h2>
      <p class="thought__text" data-thought-text>{{ active.thoughts_text }}</p>
      <p v-if="active.coach_name" class="thought__by sr-only" data-thought-by>{{ active.coach_name }}</p>
    </template>
```

The coach's name moves up into the kicker as the canvas draws it; `data-thought-by` stays in the document (visually hidden) so its test still finds it.

- [ ] **Step 3: Replace the styles**

Replace the whole `<style scoped>` block with:

```css
.thought {
  margin: var(--space-6) var(--space-4) 0;
  padding: var(--space-4) var(--space-4) var(--space-6);
  border: 1px solid var(--rule);
  border-left: 2px solid var(--rule-strong);
  border-radius: var(--radius-md);
}

.thought__kicker { color: var(--ink-muted); }

.thought__h {
  margin: var(--space-2) 0 0;
  font-family: var(--heading-face);
  font-weight: 500;
  font-size: 21px;
  line-height: 1.2;
  color: var(--ink);
}

.thought__text {
  margin: var(--space-2) 0 0;
  color: var(--ink);
  font-size: 13.5px;
  line-height: 1.65;
  text-align: justify;
  hyphens: auto;
  white-space: pre-wrap;
}

.acts { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: var(--space-3); }

.sub {
  margin: var(--space-4) 0 var(--space-1);
  font-size: 9.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) 0;
  border-bottom: 1px solid var(--rule);
  font-size: 0.82rem;
}

.row__title { color: var(--ink); }
.row__acts { display: flex; flex-wrap: wrap; gap: var(--space-1); }

.form { margin-top: var(--space-3); }
.fld { display: block; margin-bottom: var(--space-2); }

.fld__label {
  display: block;
  margin-bottom: 4px;
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.inp {
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 14px;
}

.inp:focus-visible { border-color: var(--live); outline-offset: 0; }
.inp--wide { width: 100%; }

.note { margin: var(--space-2) 0 0; color: var(--ink-muted); font-size: 0.8rem; line-height: 1.5; }
.note--bad { color: var(--color-danger); }
.note--good { color: var(--live); }

.btn, .mini {
  min-height: 34px;
  padding: 0 var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font-family: var(--heading-face);
  font-size: 14px;
  cursor: pointer;
}

.mini { min-height: 30px; font-size: 13px; color: var(--ink-muted); }
.btn--go { border-color: var(--live); color: var(--live); }
.btn:hover, .mini:hover { background: color-mix(in srgb, var(--ink) 7%, transparent); }

@media (min-width: 768px) {
  .thought { max-width: 40rem; margin-inline: auto; }
}
```

- [ ] **Step 4: Run the tests and the three gates**

Run: `npx vitest run src/components/home/DailyThought.test.ts src/views/HomeView.test.ts src/design-tokens.test.ts` → PASS. Three gates exit 0. `grep -n -- '--bhs-\|--text-muted' src/components/home/DailyThought.vue` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/DailyThought.vue
git commit -m "feat: the coach's message as the canvas card

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Home

Canvas 1a·1. The shell's crest carries the organization, so the view's own hero goes. What remains: the next match, the countdown as one figure, the last result, the message, and the record strip.

**Files:**
- Modify: `src/views/HomeView.vue` (script additions, template and styles rewritten)
- Modify: `src/views/HomeView.test.ts` (the countdown case, one new case)

**Interfaces:**
- Consumes: `shortCountdown`, `lastCompletedMatch`, `matchOutcome` (Task 3); `schedule.matches`, `schedule.nextMatch`, `schedule.lastPlayed` (for the stale state's wording only), `schedule.record`, `schedule.state`; `displayDate` from `domain/schedule-view.ts`.
- Produces: hooks `data-countdown`, `data-next-fixture`, `data-last-result`.

- [ ] **Step 1: Change the countdown test and add the last-result case**

In `src/views/HomeView.test.ts`, replace the `counts down rather than reading all zeroes` case with:

```ts
  it('counts down as one figure rather than reading all zeroes', () => {
    // NOW is Sep 1 12:00; kick-off is Sep 4 18:00 — three days and six hours.
    const w = mountHome({ matches: [row()] });
    expect(w.find('[data-countdown]').text()).toBe('3d 06h');
  });
```

Append to `describe('an upcoming fixture', …)`:

```ts
  it('shows the last result in words beside the score', () => {
    const w = mountHome({
      matches: [
        row({ id: 'p', match_date: 'AUG 21 2026', match_on: '2026-08-21', opponent: 'Millbrook',
              status: 'COMPLETED', score: '3 - 1', is_home: true }),
        row()
      ]
    });
    const last = w.find('[data-last-result]');
    expect(last.text()).toContain('Millbrook');
    expect(last.text()).toMatch(/won/i);
    expect(last.text()).toContain('3 - 1');
  });
```

- [ ] **Step 2: Run it to verify the two cases fail**

Run: `npx vitest run src/views/HomeView.test.ts`
Expected: the countdown case and the last-result case fail; everything else passes.

- [ ] **Step 3: Update the script**

In `src/views/HomeView.vue`'s `<script setup>`, change the imports and add two computeds:

```ts
import { nextMatchCountdown, shortCountdown, lastCompletedMatch } from '../domain/schedule';
import { displayDate, matchOutcome } from '../domain/schedule-view';
```

Replace the `countdown` computed with:

```ts
const countdown = computed(() => {
  // Referenced so the tick invalidates this.
  void now.value;
  return shortCountdown(nextMatchCountdown(schedule.matches));
});
```

Replace the `headline` computed with:

```ts
/** What the fixture block says when there is no next match. */
const noFixtureLine = computed(() => {
  if (schedule.state === 'empty') return 'Schedule coming soon';
  if (schedule.state === 'stale') return 'No upcoming fixtures';
  return 'Season complete';
});

/**
 * The most recent completed fixture with a readable score, in words.
 * Not `schedule.lastPlayed`: that is the latest fixture on the calendar,
 * which includes next week's. Only a result is a result.
 */
const lastResult = computed(() => {
  const m = lastCompletedMatch(schedule.matches);
  const outcome = matchOutcome(m);
  if (!m || !outcome) return null;
  const word = outcome === 'won' ? 'Won' : outcome === 'drawn' ? 'Drew' : 'Lost';
  return { opponent: m.opponent, side: m.isHome ? 'home' : 'away', word, score: m.score };
});
```

Keep `settled`, `now`, the timer and the team watch as they are.

- [ ] **Step 4: Rewrite the template**

```html
<template>
  <section class="home">
    <div class="fixture">
      <p v-if="schedule.loadError" class="refused" role="alert">{{ schedule.loadError }}</p>

      <template v-else-if="!settled">
        <p class="kicker">Next match</p>
        <p class="fixture__opp fixture__opp--quiet">Loading the schedule…</p>
      </template>

      <template v-else-if="schedule.nextMatch">
        <p class="kicker kicker--accent">Next match</p>
        <h1 class="fixture__opp" data-next-fixture>{{ schedule.nextMatch.opponent }}</h1>
        <p class="fixture__where">
          {{ schedule.nextMatch.isHome ? 'Home' : 'Away' }}
          <template v-if="schedule.nextMatch.location"> · {{ schedule.nextMatch.location }}</template>
        </p>
        <div class="when">
          <div>
            <p class="when__date tnum">{{ displayDate(schedule.nextMatch) }}</p>
            <p v-if="schedule.nextMatch.time" class="when__time tnum">Kick-off {{ schedule.nextMatch.time }}</p>
          </div>
          <div class="when__count">
            <p class="when__figure tnum" data-countdown>{{ countdown }}</p>
            <p class="when__label">to kick-off</p>
          </div>
        </div>
      </template>

      <template v-else>
        <p class="kicker">Next match</p>
        <h1 class="fixture__opp fixture__opp--quiet">{{ noFixtureLine }}</h1>
        <p v-if="schedule.state === 'empty'" class="fixture__where">
          No fixtures have been added yet.<template v-if="auth.isCoach"> Add them from the Schedule tab.</template>
        </p>
        <p v-else-if="schedule.state === 'stale'" class="fixture__where">
          <template v-if="schedule.lastPlayed">
            Last match: {{ schedule.lastPlayed.opponent }} on {{ schedule.lastPlayed.date }}.
          </template>
          <template v-if="auth.isCoach"> Add the next fixture, or record the result of the last one.</template>
          <template v-else> Check back soon for the next match.</template>
        </p>
        <p v-else class="fixture__where">
          All scheduled matches have been played. Final record: {{ schedule.record.recordText }}
        </p>
      </template>

      <div v-if="settled && lastResult" class="last" data-last-result>
        <p class="last__who">Last out · <em>{{ lastResult.opponent }}, {{ lastResult.side }}</em></p>
        <p class="last__score tnum">{{ lastResult.word }} {{ lastResult.score }}</p>
      </div>
    </div>

    <!-- Directly after the fixture: it is the coach speaking to the squad, and
         the squad reads this page first. -->
    <DailyThought :team-id="org.activeTeamId" :can-edit="canWriteThought" />

    <section v-if="settled && schedule.record.gamesPlayed > 0" class="stats tnum">
      <div class="stat">
        <span class="stat__value">{{ schedule.record.recordText }}</span>
        <span class="stat__label">Record (W&ndash;L&ndash;D)</span>
      </div>
      <div class="stat">
        <span class="stat__value">{{ schedule.record.gamesPlayed }}</span>
        <span class="stat__label">Played</span>
      </div>
      <div class="stat">
        <span class="stat__value">{{ schedule.record.goalsPerGame }}</span>
        <span class="stat__label">Goals / game</span>
      </div>
      <div class="stat">
        <span class="stat__value">{{ schedule.record.cleanSheets }}</span>
        <span class="stat__label">Clean sheets</span>
      </div>
    </section>
  </section>
</template>
```

**The organization line.** The test `shows the organization from the store` expects "Legends FC" and /lions/ in the Home view's own text, and the crest header is not mounted in that test. So the view keeps one organization line, as the first child of `.fixture`:

```html
      <p v-if="org.branding.name" class="home__org kicker tnum">
        {{ org.branding.name }}<template v-if="org.branding.mascot"> · {{ org.branding.mascot }}</template><template v-if="org.activeTeam"> · {{ org.activeTeam.name }}</template>
      </p>
```

On a phone the crest sits directly above and this line would repeat it, so the styles below hide it visually under 768px (it stays in the document for the test and for a screen reader) and show it above 768px as a caption over the fixture block.

- [ ] **Step 5: Replace the styles**

```css
.home { padding: 0 0 var(--space-8); }

.fixture { padding: var(--space-4); }

.home__org { margin-bottom: var(--space-3); }
@media (max-width: 767.98px) {
  .home__org { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
}

.kicker--accent { color: var(--rule-strong); }

.fixture__opp {
  margin-top: var(--space-2);
  font-family: var(--heading-face);
  font-weight: 400;
  font-size: 32px;
  line-height: 1.05;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.fixture__opp--quiet { font-size: 24px; color: var(--ink-muted); }

.fixture__where { margin-top: 4px; font-size: 13px; color: var(--ink-muted); }

.when {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--rule-strong);
}

.when__date { font-family: var(--heading-face); font-size: 23px; line-height: 1; color: var(--ink); }
.when__time { margin-top: 3px; font-size: 13px; color: var(--ink-muted); }
.when__count { text-align: right; }
.when__figure { font-family: var(--heading-face); font-size: 23px; line-height: 1; color: var(--rule-strong); }
.when__label { margin-top: 4px; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft); }

.last {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-6);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}

.last__who { font-size: 12px; color: var(--ink-muted); }
.last__who em { font-style: italic; }
.last__score { font-family: var(--heading-face); font-size: 17px; color: var(--ink); }

.refused {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-warning);
  border-left-width: 4px;
  border-radius: var(--radius-md);
  color: var(--ink);
  font-size: 0.9rem;
}

.stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0 var(--space-4);
  margin: var(--space-6) var(--space-4) 0;
  border-top: 1px solid var(--rule);
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--rule);
}

.stat__value { font-family: var(--heading-face); font-size: 20px; color: var(--ink); }
.stat__label { font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft); }

@media (min-width: 768px) {
  .fixture, .stats { max-width: 40rem; margin-inline: auto; }
  .fixture { padding: var(--space-8) var(--space-4) 0; }
  .stats { grid-template-columns: repeat(4, 1fr); }
}
```

- [ ] **Step 6: Run the tests and the three gates**

Run: `npx vitest run src/views/HomeView.test.ts src/design-tokens.test.ts` → PASS (the four states, the record, branding, loading and failure, the message). Three gates exit 0. `grep -n -- '--bhs-\|--text-muted\|#' src/views/HomeView.vue | grep -v '^.*<!--'` shows no alias and no colour literal (the `&ndash;` entity is text, not a colour).

- [ ] **Step 7: Look at it**

Start the dev server (`.claude/launch.json` has a `vite-dev` entry for the browser pane), open `/` at the mobile preset and compare with canvas 1a·1: kicker, opponent heading, side and venue, the date and kick-off on the left with the countdown figure on the right over a strong rule, the last result between hairlines, the message card, the record strip. Then desktop: the same in a 40rem measure. Fix spacing that is visibly off in this task.

- [ ] **Step 8: Commit**

```bash
git add src/views/HomeView.vue src/views/HomeView.test.ts
git commit -m "feat: Home on the paper ground

The next match with one countdown figure, the last result in words, the
message card and the record strip. The hero goes; the crest is the shell's.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Schedule

Canvas 1a·2. The next fixture is lifted into a bordered card; the rest are hairline rows; results carry the word as well as the score. Every coach control and every modal stays exactly as wired.

**Files:**
- Modify: `src/views/ScheduleView.vue` (script: two lines; template and styles rewritten)
- Modify: `src/views/ScheduleView.test.ts` (one new case)

**Interfaces:**
- Consumes: `matchOutcome` (Task 3), `displayDate`, `matchDirectionsUrl`, `schedule.nextMatch`.
- Produces: hooks `data-next-fixture`, `data-outcome`.

- [ ] **Step 1: Add the failing test**

Append to the first `describe` in `src/views/ScheduleView.test.ts` (the one that mounts a schedule with an upcoming and a completed fixture; use the file's own `mountSchedule` helper and `row` factory):

```ts
  it('lifts the next fixture into its own card and says the result in words', () => {
    const w = mountSchedule();
    const next = w.find('[data-next-fixture]');
    expect(next.exists()).toBe(true);
    expect(next.text()).toContain('Yucaipa');
    // The word carries the outcome; colour never does alone.
    expect(w.find('[data-outcome]').text()).toMatch(/won/i);
  });
```

If the helper's completed fixture has a different score or opponent than `3 - 1` against `Redlands`, read the top of the test file and adjust the two expectations to the fixtures it seeds. The `scores[0].text()` case already pins `'3 - 1'`, so `won` is right for that fixture.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/views/ScheduleView.test.ts`
Expected: the new case fails on `[data-next-fixture]`.

- [ ] **Step 3: Script changes**

Add `matchOutcome` to the import from `'../domain/schedule-view'`, and add after the `played` computed:

```ts
/** The upcoming fixtures other than the next one, which gets its own card. */
const later = computed(() =>
  schedule.nextMatch ? upcoming.value.filter(m => m.id !== schedule.nextMatch!.id) : upcoming.value);

function outcomeWord(m: Match): string {
  const o = matchOutcome(m);
  return o === 'won' ? 'Won' : o === 'drawn' ? 'Drawn' : o === 'lost' ? 'Lost' : '';
}
```

- [ ] **Step 4: Rewrite the template**

```html
<template>
  <section class="sched">
    <header class="sched__head">
      <div>
        <h1 class="sched__title">Schedule &amp; Results</h1>
        <p v-if="org.branding.name" class="sched__org kicker tnum">
          {{ org.branding.name }}<span v-if="org.activeTeam"> · {{ org.activeTeam.name }}</span>
        </p>
      </div>
      <div v-if="canEdit" class="sched__acts">
        <button type="button" class="btn btn--go" data-add-match @click="openAdd">Add fixture</button>
        <button type="button" class="btn" data-open-lineup @click="openLineup(null)">Lineup</button>
        <button type="button" class="btn" data-open-season @click="seasonOpen = true">Season report</button>
      </div>
    </header>

    <p v-if="notice" class="notice" role="status" data-notice>
      {{ notice }}
      <button type="button" class="notice__x" aria-label="Dismiss" @click="notice = null">&times;</button>
    </p>
    <p v-if="schedule.loadError" class="notice notice--bad" role="alert" data-load-error>
      {{ schedule.loadError }}
    </p>

    <p v-if="!settled" class="empty">Loading the schedule…</p>
    <p v-else-if="schedule.matches.length === 0" class="empty" data-empty>
      No fixtures yet.<template v-if="canEdit"> Add one to get started.</template>
    </p>

    <template v-else>
      <section v-if="upcoming.length" class="group">
        <p class="kicker kicker--accent">Upcoming</p>

        <article v-if="schedule.nextMatch" class="next" data-next-fixture data-fixture>
          <div class="next__top">
            <h2 class="next__opp">{{ schedule.nextMatch.opponent }}</h2>
            <span class="pill">{{ schedule.nextMatch.isHome ? 'Home' : 'Away' }}</span>
          </div>
          <p class="next__when tnum">
            {{ displayDate(schedule.nextMatch) }}<template v-if="schedule.nextMatch.time"> · {{ schedule.nextMatch.time }}</template><template v-if="schedule.nextMatch.location"> · {{ schedule.nextMatch.location }}</template>
          </p>
          <div class="next__links">
            <a v-if="matchDirectionsUrl(schedule.nextMatch)" class="textlink" data-directions
               :href="matchDirectionsUrl(schedule.nextMatch)!" target="_blank" rel="noopener">Directions</a>
            <template v-if="canEdit">
              <button type="button" class="textlink" data-match-edit @click="openEdit(schedule.nextMatch)">Edit</button>
              <button type="button" class="textlink" data-fixture-lineup @click="openLineup(schedule.nextMatch)">
                Lineup<span v-if="missingLineup.has(schedule.nextMatch.id)" class="dot" data-lineup-missing>•</span>
              </button>
              <button type="button" class="textlink" data-fixture-pm @click="openPlusMinus(schedule.nextMatch)">Live ±</button>
              <button type="button" class="textlink textlink--danger" data-match-remove @click="onRemove(schedule.nextMatch)">Delete</button>
            </template>
          </div>
        </article>

        <ul class="list">
          <li v-for="m in later" :key="m.id" class="row" data-fixture>
            <div class="row__main">
              <p class="row__opp">{{ m.opponent }}</p>
              <p class="row__when tnum">{{ displayDate(m) }}<template v-if="m.time"> · {{ m.time }}</template></p>
              <div v-if="canEdit || matchDirectionsUrl(m)" class="row__links">
                <a v-if="matchDirectionsUrl(m)" class="textlink" data-directions
                   :href="matchDirectionsUrl(m)!" target="_blank" rel="noopener">Directions</a>
                <template v-if="canEdit">
                  <button type="button" class="textlink" data-match-edit @click="openEdit(m)">Edit</button>
                  <button type="button" class="textlink" data-fixture-lineup @click="openLineup(m)">
                    Lineup<span v-if="missingLineup.has(m.id)" class="dot" data-lineup-missing>•</span>
                  </button>
                  <button type="button" class="textlink" data-fixture-pm @click="openPlusMinus(m)">Live ±</button>
                  <button type="button" class="textlink textlink--danger" data-match-remove @click="onRemove(m)">Delete</button>
                </template>
              </div>
            </div>
            <span class="row__side">{{ m.isHome ? 'Home' : 'Away' }}</span>
          </li>
        </ul>
      </section>

      <section v-if="played.length" class="group">
        <p class="kicker">
          Results
          <span v-if="schedule.record.gamesPlayed" class="tnum">· {{ schedule.record.recordText }}</span>
        </p>
        <ul class="list">
          <li v-for="m in played" :key="m.id" class="row" data-fixture>
            <div class="row__main">
              <p class="row__opp">{{ m.opponent }}</p>
              <p class="row__when tnum">{{ displayDate(m) }} · {{ m.isHome ? 'home' : 'away' }}</p>
              <div v-if="canEdit" class="row__links">
                <button type="button" class="textlink" data-match-edit @click="openEdit(m)">Edit</button>
                <button type="button" class="textlink" data-fixture-lineup @click="openLineup(m)">
                  Lineup<span v-if="missingLineup.has(m.id)" class="dot" data-lineup-missing>•</span>
                </button>
                <button type="button" class="textlink" data-fixture-pm @click="openPlusMinus(m)">Live ±</button>
                <button type="button" class="textlink textlink--danger" data-match-remove @click="onRemove(m)">Delete</button>
              </div>
            </div>
            <div class="row__result tnum">
              <p v-if="m.score" class="row__score" data-score>{{ m.score }}</p>
              <p v-if="outcomeWord(m)" class="row__word" data-outcome>{{ outcomeWord(m) }}</p>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <!-- The four modals, unchanged. -->
    <LineupModal
      v-if="canEdit"
      :open="lineupOpen" :match-id="lineupMatch?.id ?? null"
      :match-label="lineupMatch ? `${lineupMatch.opponent}` : ''"
      :team-id="org.activeTeamId" :school-id="schoolId" :players="roster.players"
      @close="lineupOpen = false" @saved="onLineupSaved" />

    <PlusMinusModal
      v-if="canEdit"
      :open="pmOpen" :match-id="pmMatch?.id ?? null"
      :match-label="pmMatch ? `${pmMatch.opponent}` : ''"
      :team-id="org.activeTeamId" :school-id="schoolId" :players="roster.players"
      @close="pmOpen = false" />

    <SeasonReportModal
      v-if="canEdit"
      :open="seasonOpen" :team-id="org.activeTeamId"
      :teams="org.teams" :players="roster.players"
      @close="seasonOpen = false" />

    <MatchFormModal
      v-if="canEdit"
      :open="formOpen" :match="editing" :busy="busy" :error="formError"
      @close="formOpen = false" @save="onSave" />
  </section>
</template>
```

Counting hooks against the tests: `data-fixture` appears on the next card and on every row, so the count of fixtures is unchanged; `data-fixture-lineup`, `data-fixture-pm`, `data-match-edit`, `data-match-remove` and `data-lineup-missing` appear once per fixture as before; `data-directions` appears once per away fixture with an address; `data-score` once per completed fixture with a score.

- [ ] **Step 5: Replace the styles**

```css
.sched { padding: var(--space-4) var(--space-4) var(--space-8); }

.sched__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--rule);
}

.sched__title { font-family: var(--heading-face); font-weight: 500; font-size: 24px; color: var(--ink); }
.sched__org { margin-top: var(--space-1); }
.sched__acts { display: flex; flex-wrap: wrap; gap: var(--space-2); }

.group { margin-top: var(--space-6); }
.group:first-child { margin-top: 0; }
.kicker--accent { color: var(--rule-strong); }

/* The next fixture, carried out of the list. */
.next {
  margin-top: var(--space-3);
  padding: var(--space-3) var(--space-3) var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
}

.next__top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); }
.next__opp { font-family: var(--heading-face); font-weight: 500; font-size: 21px; line-height: 1.1; color: var(--ink); }
.next__when { margin-top: 6px; font-size: 12.5px; color: var(--ink-muted); }
.next__links { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-3); margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--rule); }

.pill {
  padding: 3px 8px;
  border: 1px solid var(--rule);
  border-radius: 99px;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-muted);
  white-space: nowrap;
}

/* Text links, underlined in the accent, as the canvas draws them. */
.textlink {
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--live);
  background: none;
  color: var(--live);
  font: inherit;
  font-size: 11.5px;
  line-height: 1.6;
  text-decoration: none;
  cursor: pointer;
}
.textlink:hover, .textlink:focus-visible { color: var(--ink); border-bottom-color: var(--ink); }
.textlink--danger { color: var(--ink-muted); border-bottom-color: var(--rule); }
.textlink--danger:hover, .textlink--danger:focus-visible { color: var(--color-danger); border-bottom-color: var(--color-danger); }
.dot { margin-left: 3px; color: var(--color-warning); }

.list { margin: 0; padding: 0; list-style: none; }

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--rule);
}

.row__main { min-width: 0; }
.row__opp { font-size: 14.5px; color: var(--ink); }
.row__when { margin-top: 2px; font-size: 11.5px; color: var(--ink-muted); }
.row__links { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); margin-top: var(--space-1); }
.row__side { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft); white-space: nowrap; }
.row__result { text-align: right; }
.row__score { font-family: var(--heading-face); font-size: 16px; color: var(--ink); }
.row__word { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-muted); }

.empty { padding: var(--space-8) var(--space-3); color: var(--ink-muted); text-align: center; }

.notice {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule);
  border-left: 4px solid var(--live);
  border-radius: var(--radius-md);
  color: var(--ink);
  font-size: 0.85rem;
}
.notice--bad { border-left-color: var(--color-warning); }
.notice__x { border: 0; background: none; color: inherit; font-size: 1.2rem; line-height: 1; cursor: pointer; }

@media (min-width: 768px) {
  .sched { max-width: 64rem; margin: 0 auto; }
}
```

The `.btn` and `.btn--go` rules are deleted from this file: the global ones in `index.css` are the outlined buttons the canvas wants.

- [ ] **Step 6: Run the tests and the three gates**

Run: `npx vitest run src/views/ScheduleView.test.ts src/design-tokens.test.ts` → PASS. Three gates exit 0. `grep -n -- '--bhs-\|--text-muted' src/views/ScheduleView.vue` returns nothing.

- [ ] **Step 7: Look at it**

At the mobile preset, `/schedule` as a guest: the kicker, the next fixture card with Directions, the later fixtures as rows with Home/Away on the right, Results with the score over the word. Signed in as a coach: the text links under each fixture, Add fixture / Lineup / Season report under the title. Desktop: a 64rem measure.

- [ ] **Step 8: Commit**

```bash
git add src/views/ScheduleView.vue src/views/ScheduleView.test.ts
git commit -m "feat: Schedule on the paper ground

The next fixture in its own card, hairline rows, and the result in words
beside the score. The coach's controls become text links; the modals are
untouched.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Roster

Canvas 1a·3. Chips as pills, the sort as text, the squad as hairline rows on a phone and a card grid on a desk. The photo plate is the placeholder box the canvas draws when there is no photo.

**Files:**
- Modify: `src/components/roster/PlayerCard.vue` (rewrite)
- Modify: `src/views/RosterView.vue` (template and styles rewritten; script unchanged)

**Interfaces:**
- Consumes: `roster.filters` (`{ key, label, count }[]`), `roster.visible`, `roster.sortBy`, `roster.setSort`, `roster.setFilter`; `photoOrPlaceholder`, `lineupGrade`.
- Produces: the same hooks as today.

- [ ] **Step 1: Confirm the tests pass before touching anything**

Run: `npx vitest run src/views/RosterView.test.ts` → PASS. No hook changes in this task, so no test changes; the run after is the check.

- [ ] **Step 2: Rewrite `PlayerCard.vue`**

```vue
<script setup lang="ts">
/**
 * One player on the roster.
 *
 * A hairline row on a phone — number, plate, name, position — and a card on a
 * desk, by CSS alone. Presentational: props in, events out, no store access,
 * which is what lets the roster be tested by seeding a store and the card be
 * tested on its own.
 */
import { computed } from 'vue';
import { photoOrPlaceholder, PLAYER_SILHOUETTE, type Player } from '../../domain/player-row';
import { lineupGrade } from '../../domain/lineup';

const props = defineProps<{ player: Player; canEdit: boolean }>();
const emit = defineEmits<{ open: [Player]; edit: [Player]; remove: [Player] }>();

const photo = computed(() => photoOrPlaceholder(props.player.photo));
/** The silhouette is a placeholder, and the plate says so rather than showing it. */
const hasPhoto = computed(() => photo.value !== PLAYER_SILHOUETTE);
// The same shortening the printed team card uses, so a player reads the same
// on screen and on paper.
const grade = computed(() => lineupGrade(props.player));
</script>

<template>
  <article class="card">
    <button type="button" class="card__open" data-player-open @click="emit('open', player)">
      <span class="card__num tnum">{{ player.number ?? '—' }}</span>
      <span class="plate" :class="{ 'plate--empty': !hasPhoto }">
        <img v-if="hasPhoto" class="plate__img" :src="photo" :alt="''" loading="lazy" />
        <span v-else class="plate__label">Photo</span>
      </span>
      <span class="card__text">
        <span class="card__name">{{ player.name }}</span>
        <span class="card__meta">
          <template v-if="player.position">{{ player.position }}</template>
          <template v-else>Position not recorded</template>
          <span v-if="grade" class="card__grade">· {{ grade }}</span>
        </span>
      </span>
    </button>

    <div v-if="canEdit" class="card__admin">
      <button type="button" class="textlink" data-player-edit @click="emit('edit', player)">Edit</button>
      <button type="button" class="textlink textlink--danger" data-player-remove @click="emit('remove', player)">Remove</button>
    </div>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--rule);
}

.card__open {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.card__open:hover .card__name,
.card__open:focus-visible .card__name { color: var(--live); }

.card__num {
  width: 26px;
  flex: none;
  font-family: var(--heading-face);
  font-size: 16px;
  color: var(--ink-muted);
}

/* The plate: a photograph matted like a tipped-in plate, or the box that
   says one is missing. A missing photo is ordinary, not broken. */
.plate {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 30px;
  height: 30px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
  background: var(--surface-deep);
  overflow: hidden;
}

.plate__img { width: 100%; height: 100%; object-fit: cover; filter: sepia(0.22) saturate(0.82) contrast(1.05); }
.plate__label { display: none; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft); }

.card__text { display: flex; flex-direction: column; min-width: 0; }
.card__name { font-size: 13.5px; color: var(--ink); }
.card__meta { font-size: 11px; color: var(--ink-muted); }
.card__grade { color: var(--ink-soft); }

.card__admin { display: flex; gap: var(--space-3); flex: none; }

.textlink {
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--live);
  background: none;
  color: var(--live);
  font: inherit;
  font-size: 11.5px;
  line-height: 1.6;
  cursor: pointer;
}
.textlink:hover, .textlink:focus-visible { color: var(--ink); border-bottom-color: var(--ink); }
.textlink--danger { color: var(--ink-muted); border-bottom-color: var(--rule); }
.textlink--danger:hover, .textlink--danger:focus-visible { color: var(--color-danger); border-bottom-color: var(--color-danger); }

/* A card on a desk: the plate grows, the row becomes a column. */
@media (min-width: 768px) {
  .card {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
  }
  .card__open { flex-direction: column; align-items: flex-start; gap: var(--space-2); }
  .plate { width: 100%; height: 160px; }
  .plate__label { display: block; }
  .card__num { width: auto; }
  .card__name { font-size: 17px; font-family: var(--heading-face); }
}
</style>
```

- [ ] **Step 3: Rewrite the RosterView template**

Replace from `<template>` to `</template>` with:

```html
<template>
  <section class="roster">
    <header class="roster__head">
      <div class="roster__titles">
        <h1 class="roster__title">Roster &amp; Bios</h1>
        <p v-if="org.branding.name" class="roster__org kicker tnum">
          {{ org.branding.name }}<span v-if="org.activeTeam"> · {{ org.activeTeam.name }}</span>
        </p>
      </div>
      <div v-if="canEdit" class="roster__acts">
        <button type="button" class="btn" data-open-numbers @click="numbersOpen = true">Recording numbers</button>
        <button type="button" class="btn btn--go" data-add-player @click="openAdd">Add player</button>
      </div>
    </header>

    <p v-if="notice" class="notice" role="status" data-notice>
      {{ notice }}
      <button type="button" class="notice__x" aria-label="Dismiss" @click="notice = null">&times;</button>
    </p>
    <p v-if="roster.loadError" class="notice notice--bad" role="alert" data-load-error>
      {{ roster.loadError }}
    </p>

    <div class="controls">
      <div class="chips" role="group" aria-label="Filter by position">
        <button
          v-for="f in roster.filters" :key="f.key" type="button"
          class="chip" :class="{ 'is-on': roster.filter === f.key }"
          data-filter-chip
          @click="roster.setFilter(f.key)"
        >{{ f.label }} <span class="chip__n tnum">{{ f.count }}</span></button>
      </div>

      <div class="sort" role="group" aria-label="Sort">
        <span class="sort__label">Sort:</span>
        <button type="button" class="sort__opt" :class="{ 'is-on': roster.sortBy === 'number' }"
                data-sort-number @click="roster.setSort('number')">number</button>
        <span class="sort__sep" aria-hidden="true">·</span>
        <button type="button" class="sort__opt" :class="{ 'is-on': roster.sortBy === 'name' }"
                data-sort-name @click="roster.setSort('name')">name</button>
      </div>
    </div>

    <p v-if="!settled" class="empty">Loading the roster…</p>
    <p v-else-if="roster.players.length === 0" class="empty" data-empty>
      No players on this team yet.<template v-if="canEdit"> Add one to get started.</template>
    </p>
    <p v-else-if="roster.visible.length === 0" class="empty" data-empty-filter>
      No players in that position group.
    </p>

    <template v-else>
      <p class="kicker squad__kicker tnum">Squad · {{ roster.visible.length }} shown</p>
      <div class="grid">
        <PlayerCard
          v-for="p in roster.visible" :key="p.id"
          :player="p" :can-edit="canEdit"
          @open="detailFor = $event"
          @edit="openEdit"
          @remove="onRemove"
        />
      </div>
    </template>

    <PlayerDetailModal
      :open="detailFor !== null" :player="detailFor" @close="detailFor = null" />

    <PlayerFormModal
      v-if="canEdit"
      :open="formOpen" :player="editing" :busy="busy" :error="formError"
      @close="formOpen = false" @save="onSave" />

    <RecordingNumbersModal
      v-if="canEdit"
      :open="numbersOpen" :team-id="org.activeTeamId" :players="roster.players"
      @close="numbersOpen = false" />
  </section>
</template>
```

- [ ] **Step 4: Replace the RosterView styles**

```css
.roster { padding: var(--space-4) var(--space-4) var(--space-8); }

.roster__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--rule);
}

.roster__title { font-family: var(--heading-face); font-weight: 500; font-size: 24px; color: var(--ink); }
.roster__org { margin-top: var(--space-1); }
.roster__acts { display: flex; flex-wrap: wrap; gap: var(--space-2); }

.controls { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-3) 0; }

.chips { display: flex; flex-wrap: wrap; gap: 7px; }

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--rule);
  border-radius: 99px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.chip:hover { background: color-mix(in srgb, var(--ink) 7%, transparent); }
.chip.is-on {
  border-color: var(--live);
  color: var(--live);
  background: color-mix(in srgb, var(--live) 10%, transparent);
}
.chip__n { color: var(--ink-muted); }
.chip.is-on .chip__n { color: inherit; }

.sort { display: flex; align-items: baseline; gap: 6px; font-size: 11.5px; color: var(--ink-muted); }
.sort__opt { padding: 0; border: 0; background: none; color: var(--ink-muted); font: inherit; cursor: pointer; }
.sort__opt.is-on { color: var(--live); border-bottom: 1px solid var(--live); }
.sort__sep { color: var(--ink-soft); }

.squad__kicker { margin-top: var(--space-2); }
.grid { display: flex; flex-direction: column; }

.empty { padding: var(--space-8) var(--space-3); color: var(--ink-muted); text-align: center; }

.notice {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  margin: var(--space-3) 0 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule);
  border-left: 4px solid var(--live);
  border-radius: var(--radius-md);
  color: var(--ink);
  font-size: 0.85rem;
}
.notice--bad { border-left-color: var(--color-warning); }
.notice__x { border: 0; background: none; color: inherit; font-size: 1.2rem; line-height: 1; cursor: pointer; }

@media (min-width: 768px) {
  .roster { max-width: 64rem; margin: 0 auto; }
  .controls { flex-direction: row; justify-content: space-between; align-items: center; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: var(--space-3); }
}
```

The `.btn` and `.btn--go` rules are deleted; the global ones apply.

- [ ] **Step 5: Run the tests and the three gates**

Run: `npx vitest run src/views/RosterView.test.ts src/design-tokens.test.ts` → PASS. Three gates exit 0. `grep -n -- '--bhs-\|--text-muted' src/views/RosterView.vue src/components/roster/PlayerCard.vue` returns nothing.

- [ ] **Step 6: Look at it**

Mobile: chips as pills with the active one tinted, the sort as text, the squad kicker with the count, hairline rows with number, plate, name, position; a player with no shirt number shows an em dash and sorts last; a player with no photo shows the plate box. Desktop: a card grid with the tall plate.

- [ ] **Step 7: Commit**

```bash
git add src/views/RosterView.vue src/components/roster/PlayerCard.vue
git commit -m "feat: Roster on the paper ground

Pills, the sort as text, and the squad as hairline rows on a phone or a
card grid on a desk. A missing photo is a plate that says so.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The player detail

Canvas 1a·3's bio: photo plate, number and class year as a kicker, the name, position and height in italic, the season figures under a hairline, and the four skill bars. The detail stays a modal (spec §5.1).

**Files:**
- Modify: `src/components/roster/PlayerDetailModal.vue` (rewrite)
- Create: `src/components/roster/PlayerDetailModal.test.ts`

**Interfaces:**
- Consumes: `skillBars` (Task 3), `photoOrPlaceholder`, `PLAYER_SILHOUETTE`, `lineupGrade`, `BaseModal`.
- Produces: hooks `data-season-stat` (kept), `data-skill-bar`, `data-bio-kicker`.

- [ ] **Step 1: Write the failing test**

Create `src/components/roster/PlayerDetailModal.test.ts`:

```ts
/**
 * A player's bio, as anyone may see it.
 *
 * The four skill ratings are on the public bio (the functional specification
 * lists them there), shown as bars out of ten and only when set. A missing
 * value is left out, never drawn at zero.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PlayerDetailModal from './PlayerDetailModal.vue';

const PLAYER = {
  id: 'p1', membershipId: 'm1', name: 'Marcus Delgado', firstName: 'Marcus', lastName: 'Delgado',
  classYear: 'Senior', height: '5′ 11″', photo: '', number: 9, recordingNumber: 7,
  position: 'Striker', seasonStats: { goals: 11, assists: 6 },
  ratings: { technical: 8, tactical: 7, physical: 9, mental: 7 }
};

const mountWith = (player: any) => mount(PlayerDetailModal, { props: { open: true, player } });

describe('PlayerDetailModal', () => {
  it('reads number and class year as the kicker, and position and height under the name', () => {
    const w = mountWith(PLAYER);
    // The capitals are CSS; the text itself reads as typed.
    expect(w.find('[data-bio-kicker]').text().replace(/\s+/g, ' ')).toBe('No. 9 · Senior');
    expect(w.text()).toContain('Marcus Delgado');
    expect(w.text()).toContain('Striker');
    expect(w.text()).toContain('5′ 11″');
  });

  it('shows the season figures', () => {
    const w = mountWith(PLAYER);
    // Vue condenses the whitespace between the two spans, so read them apart.
    const stats = w.findAll('[data-season-stat]')
      .map(n => `${n.find('.figure__value').text()} ${n.find('.figure__label').text()}`);
    expect(stats).toEqual(['11 Goals', '6 Assists']);
  });

  it('draws the four skill ratings as bars out of ten', () => {
    const w = mountWith(PLAYER);
    const bars = w.findAll('[data-skill-bar]');
    expect(bars).toHaveLength(4);
    expect(bars[0].find('.skill__name').text()).toBe('Technical');
    expect(bars[0].find('.skill__value').text().replace(/\s+/g, ' ')).toBe('8 /10');
    expect(bars[0].find('[data-skill-fill]').attributes('style')).toContain('width: 80%');
  });

  it('leaves out ratings that are not set, and the section when none are', () => {
    expect(mountWith({ ...PLAYER, ratings: { mental: 6 } }).findAll('[data-skill-bar]')).toHaveLength(1);
    const none = mountWith({ ...PLAYER, ratings: {} });
    expect(none.findAll('[data-skill-bar]')).toHaveLength(0);
    expect(none.text()).not.toMatch(/skill ratings/i);
  });

  it('shows a plate that says the photo is missing, without a number if there is none', () => {
    const w = mountWith({ ...PLAYER, number: null, classYear: '' });
    expect(w.find('[data-photo-missing]').exists()).toBe(true);
    expect(w.find('[data-bio-kicker]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/roster/PlayerDetailModal.test.ts`
Expected: FAIL on the missing hooks.

- [ ] **Step 3: Rewrite the component**

```vue
<script setup lang="ts">
/**
 * A player's bio, as anyone may see it.
 *
 * Photo plate, number and class year, name, position and height, the season
 * figures, and the four skill ratings as bars. The ratings are on the public
 * bio because the functional specification puts them there; a rating that is
 * not set is left out rather than drawn at zero.
 */
import { computed } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { photoOrPlaceholder, PLAYER_SILHOUETTE, type Player } from '../../domain/player-row';
import { lineupGrade } from '../../domain/lineup';
import { skillBars } from '../../domain/player-skills';

const props = defineProps<{ open: boolean; player: Player | null }>();
const emit = defineEmits<{ close: [] }>();

const photo = computed(() => photoOrPlaceholder(props.player?.photo));
const hasPhoto = computed(() => photo.value !== PLAYER_SILHOUETTE);
const grade = computed(() => (props.player ? lineupGrade(props.player) : ''));

/** "NO. 9 · SENIOR", or whichever half exists; nothing when neither does. */
const kicker = computed(() => {
  const parts: string[] = [];
  if (props.player?.number != null) parts.push(`No. ${props.player.number}`);
  if (props.player?.classYear) parts.push(String(props.player.classYear));
  return parts.join(' · ');
});

const line = computed(() => {
  const parts: string[] = [];
  if (props.player?.position) parts.push(props.player.position);
  if (props.player?.height) parts.push(String(props.player.height));
  return parts.join(' · ');
});

/** Whatever season_stats holds, since it differs for a keeper. */
const stats = computed(() => {
  const s = props.player?.seasonStats || {};
  return Object.entries(s)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => ({
      // goalsAgainst -> Goals against
      label: k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()),
      value: String(v)
    }));
});

const skills = computed(() => skillBars(props.player?.ratings));
</script>

<template>
  <BaseModal :open="open" :title="player?.name || 'Player'" @close="emit('close')">
    <div v-if="player" class="bio">
      <div class="bio__top">
        <span class="plate" :class="{ 'plate--empty': !hasPhoto }">
          <img v-if="hasPhoto" class="plate__img" :src="photo" :alt="''" />
          <span v-else class="plate__label" data-photo-missing>Photo</span>
        </span>
        <div class="bio__text">
          <p v-if="kicker" class="kicker tnum" data-bio-kicker>{{ kicker }}</p>
          <p class="bio__name">{{ player.name }}</p>
          <p v-if="line" class="bio__line">{{ line }}<span v-if="grade" class="bio__grade"> · {{ grade }}</span></p>
        </div>
      </div>

      <ul v-if="stats.length" class="figures tnum">
        <li v-for="s in stats" :key="s.label" class="figure" data-season-stat>
          <span class="figure__value">{{ s.value }}</span>
          <span class="figure__label">{{ s.label }}</span>
        </li>
      </ul>

      <section v-if="skills.length" class="skills">
        <p class="kicker kicker--accent">Skill ratings</p>
        <div v-for="s in skills" :key="s.key" class="skill" data-skill-bar>
          <div class="skill__row">
            <span class="skill__name">{{ s.name }}</span>
            <span class="skill__value tnum">{{ s.value }} <span class="skill__of">/10</span></span>
          </div>
          <div class="skill__track"><div class="skill__fill" :style="{ width: s.pct + '%' }" data-skill-fill /></div>
        </div>
      </section>
    </div>
  </BaseModal>
</template>

<style scoped>
.bio__top { display: flex; gap: 14px; }

.plate {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 104px;
  height: 128px;
  border: 6px solid var(--surface);
  outline: 1px solid var(--rule);
  background: var(--surface-deep);
  overflow: hidden;
}
.plate__img { width: 100%; height: 100%; object-fit: cover; filter: sepia(0.22) saturate(0.82) contrast(1.05); }
.plate__label { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft); }

.bio__text { flex: 1; min-width: 0; }
.bio__name { margin-top: 6px; font-family: var(--heading-face); font-weight: 500; font-size: 27px; line-height: 1.1; color: var(--ink); }
.bio__line { margin-top: 3px; font-size: 13px; font-style: italic; color: var(--ink-muted); }
.bio__grade { font-style: normal; }

.figures {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin: var(--space-3) 0 0;
  padding: var(--space-3) 0 0;
  border-top: 1px solid var(--rule);
  list-style: none;
}
.figure { display: flex; flex-direction: column; }
.figure__value { font-family: var(--heading-face); font-size: 20px; color: var(--ink); }
.figure__label { font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft); }

.skills { margin-top: var(--space-6); }
.kicker--accent { color: var(--rule-strong); }
.skill { padding: var(--space-3) 0; border-bottom: 1px solid var(--rule); }
.skill__row { display: flex; align-items: baseline; justify-content: space-between; }
.skill__name { font-size: 13.5px; color: var(--ink); }
.skill__value { font-family: var(--heading-face); font-size: 15px; color: var(--ink); }
.skill__of { font-size: 11px; color: var(--ink-soft); }
.skill__track { height: 3px; margin-top: 7px; background: var(--rule); }
.skill__fill { height: 3px; background: var(--live); }
</style>
```

- [ ] **Step 4: Run the tests and the three gates**

Run: `npx vitest run src/components/roster/PlayerDetailModal.test.ts src/views/RosterView.test.ts src/design-tokens.test.ts` → PASS. Three gates exit 0.

- [ ] **Step 5: Look at it**

Open a player from the roster at the mobile preset: the plate on the left, the kicker, the name, the italic line, the figures, then the bars. A player with no photo shows the plate box; one with no ratings shows no bars section.

- [ ] **Step 6: Commit**

```bash
git add src/components/roster/PlayerDetailModal.vue src/components/roster/PlayerDetailModal.test.ts
git commit -m "feat: the player bio with the four skill bars

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The phase gate

**Files:**
- Modify: `docs/superpowers/specs/2026-09-07-mobile-restyle-design.md` (one line)

- [ ] **Step 1: Run the three gates for the whole phase**

```bash
npm test > /dev/null 2>&1; echo "TEST EXIT=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK EXIT=$?"
npm run build > /dev/null 2>&1; echo "BUILD EXIT=$?"
```

All three print `0`. Run `npm test 2>&1 | tail -6` once more and record the counts.

- [ ] **Step 2: Confirm the exit conditions**

- `grep -rn -- '--bhs-\|--text-muted' src/views/HomeView.vue src/views/ScheduleView.vue src/views/RosterView.vue src/components/roster/PlayerCard.vue src/components/roster/PlayerDetailModal.vue src/components/home/DailyThought.vue` returns nothing.
- At the mobile preset, `/`, `/schedule` and `/roster` each match their canvas screen in structure: the elements listed in Tasks 5–7's "Look at it" steps are all present and readable. Scroll each to the bottom: the footer sits above the bar.
- At desktop, each sits in its measure (40rem for Home, 64rem for Schedule and Roster) under the hairline top nav.
- Signed in as a coach (the controller signs in; the implementer does not enter credentials): the Schedule's text links and the Roster's Edit/Remove links appear and the modals still open.

- [ ] **Step 3: Note the phase in the spec**

In the spec's §9 list, change the line `2. **Public screens.** Home, Schedule, Roster, the player detail, and the short countdown.` to end with ` — done 2026-09-07; the result word and the skill bars landed with it, and the white guard and the More sheet's keyboard handling from phase 1's review.`

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-07-mobile-restyle-design.md
git commit -m "docs: phase 2 of the restyle is done

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review against the spec

- §5.1 Home: kicker, opponent heading, side and venue, date and kick-off left with the countdown figure right over a strong rule, "Last out" with the result word, the message card with the accent rule, the record strip, all four states with their present wording — Task 5 (and Task 4 for the card, Task 3 for `shortCountdown`).
- §5.1 Schedule: next fixture lifted into a bordered card with an outlined pill and Directions; Upcoming and Completed as hairline rows; the score over the word; coach controls as text links; the missing-lineup marker kept; "Add to calendar" left out — Task 6 (Task 3 for `matchOutcome`). The heading reads "Results", which the tests pin; the spec's "Completed" is a label choice with no rule behind it.
- §5.1 Roster: 34px pills with the active one tinted from the accent; "Sort: number ▾" as text; hairline rows with number (em dash when missing, sorted last by the store), plate, name, position or "Position not recorded"; the detail as a modal with plate, kicker, name, italic line, figures and the four bars — Tasks 7 and 8 (Task 3 for `skillBars`).
- §5.4 Dialogs: `BaseModal` already takes the ground's surface (phase 1); Task 2 adds the panel focus ring.
- §6 Widths: 40rem measure for Home, 64rem for the tables, `minmax(14rem, 1fr)` card grid on the roster above 768px — Tasks 5, 6, 7.
- §8 Testing: `shortCountdown` cases — Task 3; the Home countdown test changed and a last-result case added — Task 5; a Schedule case for the card and the word — Task 6; first tests for the detail — Task 8; the guard pattern tests — Task 1; nav keyboard and header group cases — Task 2.
- Phase 1's parked items assigned to phase 2: the guard regex (Task 1) and the More sheet's keyboard handling plus the `aria-label` span and the modal focus ring (Task 2).
- Out of scope, unchanged: the four modal tools, routes, stores, the Planner's hardcoded blue (phase 5), the `--bhs-*` aliases in untouched files.

Placeholder scan: every code step carries its code; Task 6 Step 1 tells the implementer how to reconcile the expectation with the helper's own fixtures rather than guessing. Type consistency: `shortCountdown(Countdown | null): string` (Task 3) is what Task 5 calls with `nextMatchCountdown(...)`, which returns `Countdown | null`; `matchOutcome(m): 'won'|'drawn'|'lost'|null` (Task 3) is read by `lastResult` in Task 5 and `outcomeWord` in Task 6; `skillBars(unknown): { key, name, value, pct }[]` (Task 3) is what Task 8's template iterates with `s.name`, `s.value`, `s.pct`; `PLAYER_SILHOUETTE` is an existing export of `player-row.ts` used by Tasks 7 and 8.
