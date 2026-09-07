# Mobile Restyle Phase 3 — Touchline Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the Lineup, the live plus/minus board and the season report from modals to full-screen routes on the dark grounds, matching canvas screens 1b·1, 1b·2 and 1b·3, and close the two items phase 2 parked.

**Architecture:** Each tool becomes a thin route view that resolves its subject from the route parameter and a screen component converted in place from the old modal. All three sit inside one shared `ToolScreen` layout that draws the top bar, the scrolling body and the footer bar, so the frame is defined once rather than three times. The shell already steps aside on a route whose meta says `chrome: 'tool'` (phase 1), and the ground already follows route meta, so the touchline screens get the navy ground and the report gets the ledger ground for free.

**Tech Stack:** Vue 3 `<script setup>`, Vue Router 5, Pinia, Vitest 4 with jsdom and `@vue/test-utils`, `vue-tsc`, Vite 8.

**Spec:** `docs/superpowers/specs/2026-09-07-mobile-restyle-design.md` (§3.4 tool chrome, §4 routes, §5.2 pitch ground, §5.3's season report paragraph, §6 widths, §8 testing, phase 3 of §9). The canvas is `qlaudDesignSpec/soccer-program-mobile.dc.html`; the screens are option `1b` (Lineup, Live plus/minus) plus the ledger table.

**Baseline entering this plan:** commit `6a0db6a` on `feature/convertToVue`, 132 test files, 2,418 tests passing, 2 skipped, three gates green.

## Global Constraints

- **Three gates on every commit, checked by exit code:** `npm test`, `npm run typecheck`, `npm run build`. In bash: `npm test > /dev/null 2>&1; echo "EXIT=$?"`. The suite takes about 80 seconds.
- **Files this phase rewrites use the ground tokens only:** `--ground`, `--surface`, `--surface-deep`, `--ink`, `--ink-muted`, `--ink-soft`, `--rule`, `--rule-strong`, `--live`, `--mark`, `--heading-face`, `--font-heading`, `--font-body`, `--font-display`, `--space-*`, `--radius-*`, `--shadow-md`, `--color-success/warning/danger`, plus the global `.kicker`, `.tnum`, `.sr-only`, `.btn`, `.btn--go`. **No `--bhs-*` name, no `--text-muted`, no literal colour**, with one exception stated in Task 4: the pitch's own green.
- **A statistic may only be recorded while the clock is RUNNING.** The guard lives in `stores/plus-minus.ts`'s `append()` and nowhere else. Nothing in this phase may add a second guard, weaken that one, or record an event around it. The screen renders the store's refusal; it does not decide it.
- **Low-minute players are never filtered.** The season report and the live sheet show every player in the squad, including one who has not been on. No minimum, no "others" row, no collapsing.
- **A match is not ninety minutes.** `seasonFullMatchMinutes(teams, teamId)` reads `teams.match_minutes`. Nothing may hardcode a length.
- **Never hardcode a school, mascot, colour or 'bhs'.**
- **Every `data-*` hook the existing tests use is kept.** Lineup: `data-formation`, `data-lineup-hint`, `data-lineup-pitch`, `data-lineup-bench`, `data-lineup-notes`, `data-lineup-save`, `data-lineup-error`, `data-slot`, `data-slot-name`, `data-slot-grade`, `data-slot-clear`, `data-bench-player`. Live: `data-pm-clock`, `data-pm-clock-toggle`, `data-pm-undo`, `data-pm-notice`, `data-pm-open-error`, `data-pm-score`, `data-pm-goal-for`, `data-pm-goal-against`, `data-pm-on-count`, `data-pm-empty-pitch`, `data-pm-player`, `data-pm-plus`, `data-pm-minus`, `data-pm-off`, `data-pm-bench`, `data-pm-score-for`, `data-pm-sort`, `data-pm-row`, `data-pm-cell`. Report: `data-season-sort`, `data-season-row`, `data-season-player`, `data-season-mins`, `data-season-netrate`, `data-season-empty`, `data-season-error`.
- `tsconfig.json` stays loose; `typescript` stays on 5.x. `.at()` is unavailable at this `lib` target.
- Conventional Commits, trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Git prints CRLF warnings on this machine; they are not errors.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/components/roster/PlayerDetailModal.vue` (modify) | One token swap: the parked contrast fix. |
| `src/domain/schedule.test.ts`, `src/domain/season-record.test.ts` (modify) | The three deferred edge cases. |
| `src/components/layout/ToolScreen.vue` (create) | The tool frame: top bar, scrolling body, footer bar. Used by all three screens. |
| `src/components/layout/ToolScreen.test.ts` (create) | Its tests. |
| `src/domain/match-lookup.ts`, `.test.ts` (create) | `matchById` — resolving a route parameter to a fixture, and saying when it cannot. |
| `src/router/index.ts` (modify) | Three routes with their grounds and `chrome: 'tool'`; `routeAllowed` for them. |
| `src/router/ground.test.ts`, `src/router/guards.test.ts` (modify) | Route and guard cases. |
| `src/components/schedule/LineupScreen.vue` (rename from `LineupModal.vue`) | Canvas 1b·1 on the pitch ground. |
| `src/views/LineupView.vue`, `.test.ts` (create) | Resolves the match, loads the roster, renders the screen. |
| `src/components/schedule/LiveMatchScreen.vue` (rename from `PlusMinusModal.vue`) | Canvas 1b·2 and 1b·3 on the pitch ground. |
| `src/views/LiveMatchView.vue`, `.test.ts` (create) | Same, for the live board. |
| `src/components/schedule/SeasonReportScreen.vue` (rename from `SeasonReportModal.vue`) | The ledger table, full screen. |
| `src/views/SeasonReportView.vue`, `.test.ts` (create) | Same, for the report. |
| `src/views/ScheduleView.vue` (modify) | Links instead of modal state, three times. |
| `src/views/ScheduleView.test.ts` (modify) | Asserts links rather than mounted modals. |
| `docs/superpowers/specs/…-design.md` (modify) | Phase 3 marked done. |

---

### Task 1: The two items phase 2 parked

Two unrelated leftovers, batched because each is a few lines and neither deserves its own review. The first is a contrast failure the phase 2 fix wave missed; the second is three edge cases its reviewer noted were safe but untested.

**Files:**
- Modify: `src/components/roster/PlayerDetailModal.vue` (the `.plate__label` rule)
- Modify: `src/domain/schedule.test.ts`, `src/domain/season-record.test.ts`

- [ ] **Step 1: Write the three failing-or-passing edge tests**

These pin behaviour that already exists; they will pass immediately, which is correct — the point is that a later change cannot alter them silently.

Append to `src/domain/schedule.test.ts`, inside the existing `describe('shortCountdown', …)`:

```ts
  it('reads a countdown whose parts are not numbers as zero rather than NaN', () => {
    // Countdown holds strings, and a malformed one must not print "NaNd".
    expect(shortCountdown({ days: 'abc', hours: 'xx', mins: 'zz' } as any)).toBe('0m');
    expect(shortCountdown({ days: '', hours: '', mins: '' } as any)).toBe('0m');
  });
```

and inside the existing `describe('lastCompletedMatch', …)`:

```ts
  it('ignores a completed fixture whose date cannot be read', () => {
    // An unparseable date sorts as no date at all; a result with no date
    // cannot be called the most recent one.
    const good = { id: 'good', status: 'COMPLETED', score: '1 - 0', date: 'AUG 21 2026', matchOn: '2026-08-21' };
    const undated = { id: 'undated', status: 'COMPLETED', score: '9 - 0', date: 'sometime', matchOn: null };
    expect(lastCompletedMatch([undated, good])?.id).toBe('good');
    expect(lastCompletedMatch([undated])).toBeNull();
  });
```

Append to `src/domain/season-record.test.ts`, inside the existing `describe('parseScore', …)`:

```ts
  it('reads the first two numbers and ignores any after them', () => {
    // "3 - 1 (aet 2)" and similar happen; the first two are the score.
    expect(parseScore('3 - 1 - 2')).toEqual({ goalsFor: 3, goalsAgainst: 1 });
  });

  it('does not read a leading minus as a negative goal count', () => {
    // Only digits are matched, so the sign is dropped rather than producing
    // a negative score, which no match has.
    expect(parseScore('-3 - 1')).toEqual({ goalsFor: 3, goalsAgainst: 1 });
  });
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/domain/schedule.test.ts src/domain/season-record.test.ts`
Expected: PASS. If any fails, the behaviour differs from what the phase 2 reviewer read; stop and report it rather than changing the implementation to suit the test.

- [ ] **Step 3: Fix the parked contrast failure**

In `src/components/roster/PlayerDetailModal.vue`, the `.plate__label` rule reads:

```css
.plate__label { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft); }
```

`--ink-soft` is `#9b9797`, which is 2.59:1 on the paper ground and below the readable floor for 10px text. Change that one declaration to `color: var(--ink-muted);`. Change nothing else in the file.

- [ ] **Step 4: Run the tests and the three gates**

Run: `npx vitest run src/components/roster/PlayerDetailModal.test.ts src/design-tokens.test.ts src/domain/schedule.test.ts src/domain/season-record.test.ts` → PASS. Then the three gates, each exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/roster/PlayerDetailModal.vue src/domain/schedule.test.ts src/domain/season-record.test.ts
git commit -m "fix: the bio plate's label reads, and three edges are pinned

The last of phase 2's low-contrast labels moves to --ink-muted, and the
three safe-but-untested edges its review noted get cases: a countdown of
non-numbers, a result whose date will not parse, and a score with a third
number or a leading minus.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The tool frame

Three screens share one shape: a top bar with a back link, a body that scrolls, and a footer bar pinned to the bottom. Defining it once is deliberate — phase 2's review flagged that `.textlink` and `.plate` had already been copied between components, and three touchline screens are exactly where that would happen again.

**Files:**
- Create: `src/components/layout/ToolScreen.vue`, `src/components/layout/ToolScreen.test.ts`

**Interfaces:**
- Produces: a component taking props `title: string`, `kicker?: string`, `backTo: RouteLocationRaw`, `backLabel?: string` (default `'Back'`), with slots `top-right`, default (the body) and `foot`. DOM hooks: `data-tool-screen`, `data-tool-back`, `data-tool-title`, `data-tool-kicker`, `data-tool-foot`.

- [ ] **Step 1: Write the failing test**

Create `src/components/layout/ToolScreen.test.ts`:

```ts
/**
 * The frame every touchline screen sits in.
 *
 * A tool route renders without the app's header and nav, so the screen has
 * to carry its own way back — a coach who cannot leave the live board is
 * stuck. The body scrolls between two fixed bars, which is what keeps the
 * clock and the event buttons on screen while the squad list moves.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ToolScreen from './ToolScreen.vue';

const RouterLinkStub = {
  props: ['to'],
  template: '<a :href="typeof to === \'string\' ? to : to.name"><slot /></a>'
};

function mountTool(props: Record<string, any> = {}, slots: Record<string, string> = {}) {
  return mount(ToolScreen, {
    props: { title: 'Lineup', backTo: { name: 'schedule' }, ...props },
    slots,
    global: { stubs: { RouterLink: RouterLinkStub } }
  });
}

describe('ToolScreen', () => {
  it('names the screen and offers a way back', () => {
    const w = mountTool();
    expect(w.find('[data-tool-title]').text()).toBe('Lineup');
    const back = w.find('[data-tool-back]');
    expect(back.exists()).toBe(true);
    expect(back.text()).toBe('Back');
  });

  it('takes a kicker above the title, and renders none when there is none', () => {
    expect(mountTool({ kicker: '2nd half · vs Cedar Ridge' }).find('[data-tool-kicker]').text())
      .toBe('2nd half · vs Cedar Ridge');
    expect(mountTool().find('[data-tool-kicker]').exists()).toBe(false);
  });

  it('lets the back link be named for where it goes', () => {
    expect(mountTool({ backLabel: 'Schedule' }).find('[data-tool-back]').text()).toBe('Schedule');
  });

  it('renders the body, the top-right control and the footer', () => {
    const w = mountTool({}, {
      default: '<p data-body>the squad</p>',
      'top-right': '<button data-control>4-3-3</button>',
      foot: '<button data-save>Save lineup</button>'
    });
    expect(w.find('[data-body]').text()).toBe('the squad');
    expect(w.find('[data-control]').exists()).toBe(true);
    expect(w.find('[data-tool-foot] [data-save]').exists()).toBe(true);
  });

  it('draws no footer bar at all when nothing is in it', () => {
    // An empty bar is a strip of surface taking room the squad list needs.
    expect(mountTool().find('[data-tool-foot]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/layout/ToolScreen.test.ts`
Expected: FAIL — the component does not exist.

- [ ] **Step 3: Create the component**

```vue
<script setup lang="ts">
/**
 * The frame a touchline screen sits in.
 *
 * A route marked `chrome: 'tool'` renders without the app's header and
 * navigation — a match clock does not want a masthead over it — so the
 * screen carries its own top bar, and with it the only way back. The body
 * scrolls between the two bars rather than the page scrolling, which keeps
 * the clock and the event buttons under a coach's thumb while the squad
 * list moves.
 *
 * One frame for all three screens on purpose: the same top bar written three
 * times drifts into three different top bars.
 */
import type { RouteLocationRaw } from 'vue-router';

withDefaults(defineProps<{
  title: string;
  /** A line above the title: the period, the fixture, the date. */
  kicker?: string;
  backTo: RouteLocationRaw;
  /** Name the destination when "Back" is vaguer than it could be. */
  backLabel?: string;
}>(), { backLabel: 'Back' });
</script>

<template>
  <section class="tool" data-tool-screen>
    <header class="tool__top">
      <RouterLink :to="backTo" class="tool__back" data-tool-back>{{ backLabel }}</RouterLink>
      <div class="tool__names">
        <p v-if="kicker" class="tool__kicker kicker" data-tool-kicker>{{ kicker }}</p>
        <h1 class="tool__title" data-tool-title>{{ title }}</h1>
      </div>
      <div class="tool__control">
        <slot name="top-right" />
      </div>
    </header>

    <div class="tool__body">
      <slot />
    </div>

    <footer v-if="$slots.foot" class="tool__foot" data-tool-foot>
      <slot name="foot" />
    </footer>
  </section>
</template>

<style scoped>
/*
 * A column the height of the viewport: the two bars keep their place and the
 * middle scrolls. `min-height: 0` on the body is what actually lets it
 * scroll inside a flex column — without it the body grows and the footer
 * leaves the screen.
 */
.tool {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: var(--ground);
  color: var(--ink);
}

.tool__top {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: none;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--rule);
}

.tool__back {
  flex: none;
  color: var(--live);
  font-size: 12.5px;
  text-decoration: none;
  border-bottom: 1px solid var(--live);
}

.tool__back:hover,
.tool__back:focus-visible { color: var(--ink); border-bottom-color: var(--ink); }

.tool__names { flex: 1; min-width: 0; }
.tool__kicker { color: var(--ink-muted); }

.tool__title {
  font-family: var(--heading-face);
  font-size: 19px;
  line-height: 1.15;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.tool__control { flex: none; }

.tool__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-3) var(--space-4);
}

.tool__foot {
  display: flex;
  gap: var(--space-2);
  flex: none;
  padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
  border-top: 1px solid var(--rule);
}

@media (min-width: 768px) {
  .tool { max-width: 64rem; margin: 0 auto; }
}
</style>
```

- [ ] **Step 4: Run the test to verify it passes, then the three gates**

Run: `npx vitest run src/components/layout/ToolScreen.test.ts` → PASS. Three gates exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/ToolScreen.vue src/components/layout/ToolScreen.test.ts
git commit -m "feat: the frame a touchline screen sits in

One top bar, one scrolling body and one footer bar, defined once so three
touchline screens cannot drift into three different frames.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The routes, and resolving a fixture from one

Three routes, their guards, their grounds, and the pure function each view uses to turn a route parameter into a fixture — including the case where it is not one, which is what a stale bookmark produces.

**Files:**
- Create: `src/domain/match-lookup.ts`, `src/domain/match-lookup.test.ts`
- Modify: `src/router/index.ts`, `src/router/ground.test.ts`, `src/router/guards.test.ts`

**Interfaces:**
- Produces: `matchById(matches: any[], id: string | null | undefined): any | null`; routes named `lineup`, `live`, `season-report`.

- [ ] **Step 1: Write the failing domain test**

Create `src/domain/match-lookup.test.ts`:

```ts
/**
 * Turning a route's fixture id into a fixture.
 *
 * A touchline screen can be reached from a bookmark, a shared link or a
 * reload, so the id in the URL is not guaranteed to name a fixture this team
 * still has. Answering "no" clearly is the point: the screen then says so
 * instead of rendering a board for a match that is not there.
 */
import { describe, it, expect } from 'vitest';
import { matchById } from './match-lookup';

const MATCHES = [
  { id: 'm1', opponent: 'Yucaipa' },
  { id: 'm2', opponent: 'Redlands' }
];

describe('matchById', () => {
  it('finds the fixture', () => {
    expect(matchById(MATCHES, 'm2').opponent).toBe('Redlands');
  });

  it('compares as text, since a route parameter is always a string', () => {
    expect(matchById([{ id: 7, opponent: 'Oakmont' }] as any, '7').opponent).toBe('Oakmont');
  });

  it('is null for an id this team does not have', () => {
    expect(matchById(MATCHES, 'gone')).toBeNull();
  });

  it('is null when there is no id, which is a lineup not tied to a fixture', () => {
    expect(matchById(MATCHES, null)).toBeNull();
    expect(matchById(MATCHES, undefined)).toBeNull();
    expect(matchById(MATCHES, '')).toBeNull();
  });

  it('is null before the schedule has loaded', () => {
    expect(matchById([], 'm1')).toBeNull();
    expect(matchById(null as any, 'm1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/domain/match-lookup.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module**

`src/domain/match-lookup.ts`:

```ts
/**
 * Turning a route's fixture id into a fixture.
 *
 * The touchline screens are real URLs, so one can be reached from a
 * bookmark, a shared link or a reload long after the fixture was deleted or
 * while the schedule is still loading. Both cases arrive here as "not
 * found", and the screens distinguish them by whether the schedule has
 * settled — this function only answers whether the id names a fixture in the
 * list it was given.
 */
export function matchById(matches: any[], id: string | null | undefined): any | null {
  if (!id) return null;
  return (matches || []).find(m => m && String(m.id) === String(id)) || null;
}
```

- [ ] **Step 4: Run the domain test, then write the failing router tests**

Run: `npx vitest run src/domain/match-lookup.test.ts` → PASS.

Add to `src/router/ground.test.ts`, inside `describe('the router', …)`:

```ts
  it('puts the touchline tools on the pitch and the report on the ledger', () => {
    const byName = new Map(router.getRoutes().map(r => [String(r.name || ''), r]));
    expect(byName.get('lineup')?.meta.ground).toBe('pitch');
    expect(byName.get('live')?.meta.ground).toBe('pitch');
    expect(byName.get('season-report')?.meta.ground).toBe('ledger');
  });

  it('marks all three as tool chrome, so the shell steps aside', () => {
    const byName = new Map(router.getRoutes().map(r => [String(r.name || ''), r]));
    for (const name of ['lineup', 'live', 'season-report']) {
      expect(byName.get(name)?.meta.chrome, name).toBe('tool');
    }
  });

  it('takes a lineup with or without a fixture', () => {
    const paths = router.getRoutes().map(r => r.path);
    expect(paths).toContain('/schedule/lineup/:matchId?');
    expect(paths).toContain('/schedule/:matchId/live');
    expect(paths).toContain('/schedule/report');
  });
```

Add to `src/router/guards.test.ts`, inside `describe('routeAllowed', …)`:

```ts
  it('keeps the touchline tools to coaches and admins', () => {
    for (const name of ['lineup', 'live', 'season-report']) {
      expect(routeAllowed(name, coach), name).toBe(true);
      expect(routeAllowed(name, admin), name).toBe(true);
      expect(routeAllowed(name, player), name).toBe(false);
      expect(routeAllowed(name, guest), name).toBe(false);
    }
  });
```

- [ ] **Step 5: Run them to verify they fail**

Run: `npx vitest run src/router/ground.test.ts src/router/guards.test.ts`
Expected: FAIL — the routes do not exist and `routeAllowed` allows the three unknown names.

- [ ] **Step 6: Register the routes and guard them**

In `src/router/index.ts`, add the three view imports beside the others:

```ts
import LineupView from '../views/LineupView.vue';
import LiveMatchView from '../views/LiveMatchView.vue';
import SeasonReportView from '../views/SeasonReportView.vue';
```

In `routeAllowed`, add before the `admin` line:

```ts
  // The touchline tools write to the match record, so they are a coach's.
  if (name === 'lineup' || name === 'live' || name === 'season-report') {
    return a.isCoach() || a.isAdmin();
  }
```

In the `routes` array, add the three after `/schedule` and **before** the catch-all. Order matters: `/schedule/lineup/:matchId?` is registered first so a lineup path is never read as a fixture id.

```ts
    // The touchline tools. `chrome: 'tool'` drops the header and nav — a
    // masthead over a match clock is in the way — and the ground makes them
    // navy. Registered before the catch-all, and the lineup before the live
    // board so `/schedule/lineup/...` is never read as a fixture id.
    { path: '/schedule/lineup/:matchId?', name: 'lineup', component: LineupView,
      meta: { ground: 'pitch', chrome: 'tool' } },
    { path: '/schedule/:matchId/live', name: 'live', component: LiveMatchView,
      meta: { ground: 'pitch', chrome: 'tool' } },
    { path: '/schedule/report', name: 'season-report', component: SeasonReportView,
      meta: { ground: 'ledger', chrome: 'tool' } },
```

The three views do not exist yet; Tasks 4, 5 and 6 create them. To keep this task's commit green, create each as a placeholder now and let the later tasks fill it in. Create all three with this shape, changing only the name in the two places marked:

`src/views/LineupView.vue`:

```vue
<script setup lang="ts">
/** Filled in by the restyle's phase 3, Task 4. */
</script>

<template>
  <p>Lineup</p>
</template>
```

`src/views/LiveMatchView.vue`:

```vue
<script setup lang="ts">
/** Filled in by the restyle's phase 3, Task 5. */
</script>

<template>
  <p>Live plus/minus</p>
</template>
```

`src/views/SeasonReportView.vue`:

```vue
<script setup lang="ts">
/** Filled in by the restyle's phase 3, Task 6. */
</script>

<template>
  <p>Season report</p>
</template>
```

- [ ] **Step 7: Run the tests and the three gates**

Run: `npx vitest run src/router/ground.test.ts src/router/guards.test.ts src/domain/match-lookup.test.ts src/App.test.ts` → PASS. Three gates exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/domain/match-lookup.ts src/domain/match-lookup.test.ts src/router/index.ts src/router/ground.test.ts src/router/guards.test.ts src/views/LineupView.vue src/views/LiveMatchView.vue src/views/SeasonReportView.vue
git commit -m "feat: three touchline routes, guarded and grounded

The lineup, the live board and the season report get real URLs on the dark
grounds, with the shell stepping aside. matchById turns a route parameter
into a fixture, or says it cannot. The views are placeholders until the
next three tasks.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The Lineup screen

Canvas 1b·1. The modal becomes a screen inside the tool frame on the pitch ground, and the Schedule links to it instead of opening a dialog.

**Files:**
- Rename: `src/components/schedule/LineupModal.vue` → `src/components/schedule/LineupScreen.vue`; `LineupModal.test.ts` → `LineupScreen.test.ts`
- Modify: both, as below
- Modify: `src/views/LineupView.vue` (replace the placeholder), create `src/views/LineupView.test.ts`
- Modify: `src/views/ScheduleView.vue`, `src/views/ScheduleView.test.ts`

**Interfaces:**
- Consumes: `ToolScreen` (Task 2); `matchById` (Task 3); `seasonFullMatchMinutes(teams, teamId)` from `src/domain/season.ts`.
- Produces: `LineupScreen` taking `matchId`, `matchLabel`, `matchMinutes`, `teamId`, `schoolId`, `players`, emitting `close` and `saved`. New hook `data-lineup-length`.

- [ ] **Step 1: Rename the files and drop the modal wrapper**

```bash
git mv src/components/schedule/LineupModal.vue src/components/schedule/LineupScreen.vue
git mv src/components/schedule/LineupModal.test.ts src/components/schedule/LineupScreen.test.ts
```

In `LineupScreen.test.ts`, change the import and the mount: replace `import LineupModal from './LineupModal.vue';` with `import LineupScreen from './LineupScreen.vue';`, replace `mount(LineupModal, {` with `mount(LineupScreen, {`, and in the props object delete `open: true,` and add `matchMinutes: 80,`. Add the `RouterLink` stub the frame needs, so the `global` block reads:

```ts
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: false })],
      stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } }
    },
```

- [ ] **Step 2: Add the failing cases for what the screen adds**

Append to the outermost `describe` in `LineupScreen.test.ts`:

```ts
  it('states this squad's own match length, because every rate divides by it', async () => {
    const w = await mountLineup({ matchMinutes: 80 });
    expect(w.find('[data-lineup-length]').text()).toContain('80');
  });

  it('offers a way back to the schedule', async () => {
    const w = await mountLineup();
    expect(w.find('[data-tool-back]').exists()).toBe(true);
  });
```

- [ ] **Step 3: Run it to verify those two fail**

Run: `npx vitest run src/components/schedule/LineupScreen.test.ts`
Expected: the two new cases fail; the existing ones pass once the rename compiles.

- [ ] **Step 4: Convert the component**

In `src/components/schedule/LineupScreen.vue`, change the script's import of `BaseModal` to `ToolScreen`:

```ts
import ToolScreen from '../layout/ToolScreen.vue';
```

Replace the props block with:

```ts
const props = defineProps<{
  /** The fixture, or null for a sheet not tied to one. */
  matchId: string | null;
  matchLabel?: string;
  /** This squad's own full-match length, from the team record. */
  matchMinutes: number;
  teamId: string | null;
  schoolId: string | null;
  players: any[];
}>();
```

Replace the `watch` on `[props.open, props.matchId]` with one on the match alone, which now runs whenever the screen is mounted:

```ts
watch(() => props.matchId, () => {
  picked.value = null;
  notice.value = null;
  lineup.load(props.teamId, props.matchId);
}, { immediate: true });
```

Change `title` to the screen's own:

```ts
const title = computed(() => 'Lineup');
const kicker = computed(() =>
  props.matchLabel ? `vs ${props.matchLabel}` : 'No fixture');
```

Then replace the template's outer `<BaseModal …>` wrapper with the frame. The whole template becomes:

```html
<template>
  <ToolScreen
    :title="title" :kicker="kicker"
    :back-to="{ name: 'schedule' }" back-label="Schedule"
  >
    <template #top-right>
      <label class="fld">
        <span class="sr-only">Formation</span>
        <select
          class="formation" data-formation
          :value="lineup.formation"
          @change="lineup.setFormation(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="f in FORMATIONS" :key="f" :value="f">{{ f }}</option>
        </select>
      </label>
    </template>

    <p class="length" data-lineup-length>
      {{ matchMinutes }}-minute match. Every per-match rate divides by it.
    </p>
    <p class="hint" data-lineup-hint>Tap a player, then tap a position. Dragging works too.</p>

    <div class="pitch" data-lineup-pitch @dragover.prevent>
      <div
        v-for="s in lineup.slots" :key="s.slot"
        class="slot" :class="{ 'is-filled': !!playerIn(s.slot), 'is-target': !!picked }"
        :style="{ left: `${s.x}%`, bottom: `${s.y}%` }"
        :data-slot="s.slot"
        draggable="true"
        @click="onSlot(s.slot)"
        @dragstart="onDragStart(lineup.assignments[s.slot], s.slot)"
        @dragover.prevent
        @drop.prevent="onDropSlot(s.slot)"
      >
        <span class="slot__pos">{{ s.slot }}</span>
        <template v-if="playerIn(s.slot)">
          <span class="slot__name" data-slot-name>{{ shortName(playerIn(s.slot)) }}</span>
          <span class="slot__meta">
            <span v-if="playerIn(s.slot).number != null">{{ playerIn(s.slot).number }}</span>
            <span v-if="grade(playerIn(s.slot))" data-slot-grade>· {{ grade(playerIn(s.slot)) }}</span>
          </span>
          <button
            type="button" class="slot__x" aria-label="Clear this position"
            data-slot-clear @click.stop="onClearSlot(s.slot)"
          >&times;</button>
        </template>
      </div>
    </div>

    <p class="kicker bench__h">Bench · tap to place <span class="tnum">{{ bench.length }}</span></p>

    <div class="bench" data-lineup-bench @dragover.prevent @drop.prevent="onDropBench">
      <button
        v-for="p in bench" :key="p.id"
        type="button" class="chip" :class="{ 'is-picked': picked === p.id }"
        :data-bench-player="p.id"
        draggable="true"
        @click="onBenchPlayer(p.id)"
        @dragstart="onDragStart(p.id, null)"
      >
        <span v-if="p.number != null" class="chip__no tnum">{{ p.number }}</span>
        <span class="chip__name">{{ shortName(p) }}</span>
        <span v-if="grade(p)" class="chip__grade">{{ grade(p) }}</span>
      </button>

      <p v-if="bench.length === 0" class="hint">Everyone available is on the pitch.</p>
    </div>

    <label class="fld fld--wide">
      <span class="fld__label">Notes</span>
      <textarea v-model="lineup.notes" class="inp inp--wide" rows="2" data-lineup-notes />
    </label>

    <p v-if="notice" class="hint hint--bad" role="alert" data-lineup-error>{{ notice }}</p>

    <template #foot>
      <button
        type="button" class="toolbtn toolbtn--go" :disabled="saving"
        data-lineup-save @click="onSave"
      >{{ saving ? 'Saving…' : 'Save lineup' }}</button>
      <RouterLink
        v-if="matchId" class="toolbtn" data-lineup-golive
        :to="{ name: 'live', params: { matchId } }"
      >Go live</RouterLink>
    </template>
  </ToolScreen>
</template>
```

The Cancel button goes: the frame's back link is how a coach leaves.

- [ ] **Step 5: Replace the styles**

```css
.fld { display: block; }
.fld--wide { margin-top: var(--space-3); }

.fld__label {
  display: block;
  margin-bottom: 4px;
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.formation {
  appearance: none;
  -webkit-appearance: none;
  padding: 6px 10px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--mark);
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.08em;
  cursor: pointer;
}

.inp {
  padding: 6px 10px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 14px;
}

.inp--wide { width: 100%; }
.inp:focus-visible { border-color: var(--live); outline-offset: 0; }

.length { font-size: 12px; color: var(--ink-muted); }
.length::first-line { color: var(--ink); }

/*
 * The pitch is a fixed dark green whatever ground the page is on, so its own
 * text colour is pinned rather than taken from --ink. The grid line is the
 * halfway line.
 */
.pitch {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  max-height: 46vh;
  margin: var(--space-3) auto 0;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  --pitch-ink: #F8FAFC;
  background:
    linear-gradient(to top, color-mix(in srgb, var(--pitch-ink) 5%, transparent) 0 1px, transparent 1px) center 50% / 100% 100% no-repeat,
    #163d16;
  overflow: hidden;
}

.slot {
  position: absolute;
  transform: translate(-50%, 50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  padding: 2px 4px;
  border: 1.5px dashed color-mix(in srgb, var(--pitch-ink) 40%, transparent);
  border-radius: 50%;
  background: rgb(0 0 0 / 0.35);
  color: var(--pitch-ink);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.slot.is-filled { border-style: solid; border-color: var(--live); }
.slot.is-target { border-color: var(--mark); }

.slot__pos { font-size: 8.5px; letter-spacing: 0.06em; color: color-mix(in srgb, var(--pitch-ink) 70%, transparent); }
.slot__name { font-family: var(--font-display); font-size: 12px; }
.slot__meta { font-size: 9px; color: color-mix(in srgb, var(--pitch-ink) 70%, transparent); }

.slot__x {
  position: absolute;
  top: -6px;
  right: -6px;
  padding: 1px 5px;
  border: 0;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.7);
  color: var(--pitch-ink);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

.bench__h { margin-top: var(--space-4); color: var(--ink-muted); }

.bench {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.chip {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 52px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.chip.is-picked { border-color: var(--mark); }
.chip__no { font-family: var(--font-display); font-size: 17px; color: var(--mark); }
.chip__name { font-size: 12px; line-height: 1.25; min-width: 0; }
.chip__grade { margin-left: auto; font-size: 10px; color: var(--ink-muted); }

.hint { margin-top: var(--space-2); font-size: 12px; line-height: 1.5; color: var(--ink-muted); }
.hint--bad { color: var(--color-warning); }

/* The footer bar's buttons: big enough for a coach watching the game. */
.toolbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 52px;
  padding: 0 var(--space-4);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--ink-muted);
  font-family: var(--font-display);
  font-size: 15px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
}

.toolbtn--go { border: 1.5px solid var(--live); color: var(--live); }
.toolbtn:disabled { opacity: 0.55; cursor: default; }

@media (min-width: 768px) {
  .bench { grid-template-columns: repeat(3, 1fr); }
  .pitch { max-height: 52vh; }
}
```

- [ ] **Step 6: Write the view and its test**

Replace `src/views/LineupView.vue` with:

```vue
<script setup lang="ts">
/**
 * The lineup, reached at its own URL.
 *
 * A tool route can be arrived at cold — a bookmark, a reload, a link a coach
 * sent themselves — so the view loads what the screen needs rather than
 * assuming the Schedule filled the stores first. A fixture id that names
 * nothing is said out loud instead of rendering a sheet for a match that is
 * not there.
 */
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { RouterLink } from 'vue-router';
import LineupScreen from '../components/schedule/LineupScreen.vue';
import { useOrganizationStore } from '../stores/organization';
import { useScheduleStore } from '../stores/schedule';
import { useRosterStore } from '../stores/roster';
import { matchById } from '../domain/match-lookup';
import { seasonFullMatchMinutes } from '../domain/season';

const route = useRoute();
const org = useOrganizationStore();
const schedule = useScheduleStore();
const roster = useRosterStore();

const matchId = computed(() => (route.params.matchId as string) || null);
const match = computed(() => matchById(schedule.matches, matchId.value));
const schoolId = computed(() => org.school?.id ?? null);
const matchMinutes = computed(() =>
  seasonFullMatchMinutes(org.teams, org.activeTeamId || ''));

/** Settled means a load has happened, so "not found" is a real answer. */
const settled = computed(() => !schedule.loading && schedule.loadedTeamId !== null);
/** A lineup with no fixture is legitimate; a lineup for a missing one is not. */
const missing = computed(() => !!matchId.value && settled.value && !match.value);

watch(() => org.activeTeamId, (id) => {
  schedule.load(id);
  roster.load(id);
}, { immediate: true });
</script>

<template>
  <p v-if="!settled" class="state" data-lineup-loading>Loading the fixture…</p>

  <section v-else-if="missing" class="state" data-lineup-missing>
    <p>That fixture is not on this team's schedule.</p>
    <RouterLink :to="{ name: 'schedule' }" class="state__back">Back to the schedule</RouterLink>
  </section>

  <LineupScreen
    v-else
    :match-id="matchId"
    :match-label="match?.opponent || ''"
    :match-minutes="matchMinutes"
    :team-id="org.activeTeamId"
    :school-id="schoolId"
    :players="roster.players"
  />
</template>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: center;
  justify-content: center;
  height: 100vh;
  height: 100dvh;
  padding: var(--space-4);
  background: var(--ground);
  color: var(--ink-muted);
  font-size: 14px;
  text-align: center;
}

.state__back { color: var(--live); border-bottom: 1px solid var(--live); text-decoration: none; }
</style>
```

Create `src/views/LineupView.test.ts`:

```ts
/**
 * The lineup at its own URL.
 *
 * The cases that matter are the cold ones: a bookmark to a fixture that has
 * since been deleted must say so, and one that has not loaded yet must not
 * claim the fixture is missing.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { createRouter, createMemoryHistory } from 'vue-router';
import LineupView from './LineupView.vue';

const MATCHES = [{ id: 'm1', opponent: 'Yucaipa', isHome: true }];

async function mountAt(matchId: string | null, schedule: Record<string, any> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/schedule', name: 'schedule', component: { template: '<p />' } },
      { path: '/schedule/lineup/:matchId?', name: 'lineup', component: LineupView },
      { path: '/schedule/:matchId/live', name: 'live', component: { template: '<p />' } }
    ]
  });
  await router.push(matchId ? `/schedule/lineup/${matchId}` : '/schedule/lineup');
  await router.isReady();

  const w = mount(LineupView, {
    global: {
      plugins: [router, createTestingPinia({
        createSpy: vi.fn,
        initialState: {
          schedule: { matches: MATCHES, loading: false, loadError: null, loadedTeamId: 't1', ...schedule },
          organization: {
            schools: [{ id: 's1', name: 'Legends FC', mascot: 'Lions' }],
            teams: [{ id: 't1', name: 'U16', school_id: 's1', match_minutes: 80 }],
            activeTeamId: 't1'
          },
          roster: { players: [{ id: 'p1', name: 'Cesar Alva', number: 1 }], loadedTeamId: 't1' }
        }
      })],
      stubs: { LineupScreen: { props: ['matchId', 'matchLabel', 'matchMinutes'], template: '<div data-screen :data-label="matchLabel" :data-minutes="matchMinutes" />' } }
    }
  });
  await flushPromises();
  return w;
}

describe('LineupView', () => {
  it('renders the screen for a fixture on the schedule', async () => {
    const w = await mountAt('m1');
    expect(w.find('[data-screen]').attributes('data-label')).toBe('Yucaipa');
  });

  it('passes the team's own match length, not a constant', async () => {
    const w = await mountAt('m1');
    expect(w.find('[data-screen]').attributes('data-minutes')).toBe('80');
  });

  it('renders the screen with no fixture, which is a sheet not tied to one', async () => {
    const w = await mountAt(null);
    expect(w.find('[data-screen]').exists()).toBe(true);
    expect(w.find('[data-lineup-missing]').exists()).toBe(false);
  });

  it('says so when the id names no fixture this team has', async () => {
    const w = await mountAt('gone');
    expect(w.find('[data-lineup-missing]').exists()).toBe(true);
    expect(w.find('[data-screen]').exists()).toBe(false);
  });

  it('claims nothing about a missing fixture before the schedule has loaded', async () => {
    const w = await mountAt('gone', { loadedTeamId: null, loading: true });
    expect(w.find('[data-lineup-loading]').exists()).toBe(true);
    expect(w.find('[data-lineup-missing]').exists()).toBe(false);
  });
});
```

- [ ] **Step 7: Link from the Schedule and drop the modal**

In `src/views/ScheduleView.vue`: delete the `LineupModal` import, the `lineupOpen` and `lineupMatch` refs, the `openLineup` function, the `onLineupSaved` function, and the `<LineupModal … />` element. Keep `missingLineup` and the `lineup.loadIndex` call in the team watch — the marker on a fixture still needs the index.

Replace each of the three `data-fixture-lineup` buttons with a link. They currently read like:

```html
                <button type="button" class="textlink" data-fixture-lineup @click="openLineup(m)">
                  Lineup<span v-if="missingLineup.has(m.id)" class="dot" data-lineup-missing>•</span>
                </button>
```

Each becomes, with `m` replaced by `schedule.nextMatch` in the next-fixture card exactly as the button was:

```html
                <RouterLink class="textlink" data-fixture-lineup
                            :to="{ name: 'lineup', params: { matchId: m.id } }">
                  Lineup<span v-if="missingLineup.has(m.id)" class="dot" data-lineup-missing>•</span>
                </RouterLink>
```

And the page-header button becomes:

```html
        <RouterLink class="btn" data-open-lineup :to="{ name: 'lineup' }">Lineup</RouterLink>
```

- [ ] **Step 8: Update the Schedule's tests**

In `src/views/ScheduleView.test.ts`, the case that clicks a lineup control and asserts the pitch rendered can no longer do so — the screen is a route away. Replace the case containing `expect(w.find('[data-lineup-pitch]').exists()).toBe(true);` with:

```ts
  it('links each fixture to its lineup, and the header to a sheet with no fixture', () => {
    const w = mountSchedule({ coach: true });
    const first = w.findAll('[data-fixture-lineup]')[0];
    expect(first.attributes('href')).toContain('/schedule/lineup/');
    expect(w.find('[data-open-lineup]').attributes('href')).toBe('/schedule/lineup');
  });
```

**This stub is required, not optional.** `ScheduleView.test.ts` mounts with a testing Pinia and no router, and it currently stubs nothing — so the moment the view renders a `RouterLink`, Vue fails to resolve the component and the element never appears. The file's `global` block has only `plugins`; add a `stubs` key beside it, resolving a route object to a path so the href assertions have something to read:

```ts
        RouterLink: {
          props: ['to'],
          template: '<a :href="href"><slot /></a>',
          computed: {
            href(): string {
              const to: any = (this as any).to;
              if (typeof to === 'string') return to;
              if (to?.name === 'lineup') {
                return to.params?.matchId ? `/schedule/lineup/${to.params.matchId}` : '/schedule/lineup';
              }
              if (to?.name === 'live') return `/schedule/${to.params?.matchId}/live`;
              if (to?.name === 'season-report') return '/schedule/report';
              return '#';
            }
          }
        }
```

so that `global` reads `{ plugins: [...], stubs: { RouterLink: { … } } }`. Tasks 5 and 6 add more links to the same view and rely on this one stub; do not add a second.

- [ ] **Step 9: Run the tests and the three gates**

Run: `npx vitest run src/components/schedule/LineupScreen.test.ts src/views/LineupView.test.ts src/views/ScheduleView.test.ts src/design-tokens.test.ts` → PASS. Three gates exit 0. `grep -n -- '--bhs-\|--text-muted' src/components/schedule/LineupScreen.vue src/views/LineupView.vue` returns nothing.

- [ ] **Step 10: Commit**

```bash
git add -A src/components/schedule src/views/LineupView.vue src/views/LineupView.test.ts src/views/ScheduleView.vue src/views/ScheduleView.test.ts
git commit -m "feat: the lineup is a screen at its own URL

The modal becomes a tool screen on the pitch ground, stating the squad's
own match length because every rate downstream divides by it. The Schedule
links to it; a fixture id that names nothing says so.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The live plus/minus screen

Canvas 1b·2 and 1b·3. The heaviest conversion: a running clock, a status strip, the refusal card, 54px targets, and the event bar. **The clock rule is not re-implemented here** — the store refuses and the screen shows what it said.

**Files:**
- Rename: `src/components/schedule/PlusMinusModal.vue` → `LiveMatchScreen.vue`; `PlusMinusModal.test.ts` → `LiveMatchScreen.test.ts`
- Modify: both
- Modify: `src/views/LiveMatchView.vue` (replace the placeholder), create `src/views/LiveMatchView.test.ts`
- Modify: `src/views/ScheduleView.vue`, `src/views/ScheduleView.test.ts`

**Interfaces:**
- Consumes: `ToolScreen`, `matchById`; the plus/minus store's `clockText`, `running`, `everStarted`, `notice`, `onPitch`, `append`, `toggleClock`, `undo`, `endPeriod`, `arm`, `armed`, `teamGoal`, `movePlayer`, `open`, `tick`.
- Produces: `LiveMatchScreen` taking `matchId`, `matchLabel`, `teamId`, `schoolId`, `players`, emitting `close`. New hooks `data-pm-status`, `data-pm-refusal`, `data-pm-refusal-title`, `data-pm-arm`, `data-pm-sub`.

- [ ] **Step 1: Rename and adjust the existing test**

```bash
git mv src/components/schedule/PlusMinusModal.vue src/components/schedule/LiveMatchScreen.vue
git mv src/components/schedule/PlusMinusModal.test.ts src/components/schedule/LiveMatchScreen.test.ts
```

In `LiveMatchScreen.test.ts`: change the import to `import LiveMatchScreen from './LiveMatchScreen.vue';`, change `mount(PlusMinusModal, {` to `mount(LiveMatchScreen, {`, delete `open: true,` from the props, and add the `RouterLink` stub to the `global` block so it reads:

```ts
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: false })],
      stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } }
    },
```

- [ ] **Step 2: Add the failing cases for what the screen adds**

Append to the outermost `describe` in `LiveMatchScreen.test.ts`:

```ts
  it('says the clock is not started before kick-off, and says it differently once stopped', async () => {
    const w = await mountBoard();
    expect(w.find('[data-pm-status]').text()).toMatch(/not started/i);

    await startClock(w);
    expect(w.find('[data-pm-status]').text()).toMatch(/running/i);

    await w.find('[data-pm-clock-toggle]').trigger('click');
    await flush();
    await w.vm.$nextTick();
    expect(w.find('[data-pm-status]').text()).toMatch(/stopped/i);
  });

  it('shows the refusal as a card headed for the case it is', async () => {
    // Before kick-off the mistake is different from a mid-match stoppage,
    // and the coach is told which one they are in.
    const w = await mountBoard();
    await sendOn(w, 'p1');
    await w.find('[data-pm-plus="p1"]').trigger('click');
    await flush();
    await w.vm.$nextTick();

    expect(w.find('[data-pm-refusal]').exists()).toBe(true);
    expect(w.find('[data-pm-refusal-title]').text()).toMatch(/hasn't kicked off|has not kicked off/i);
    // The words are the store's, not the screen's.
    expect(w.find('[data-pm-notice]').text()).toMatch(/start the clock/i);
  });

  it('heads the refusal differently once the match has started', async () => {
    const w = await mountBoard();
    await sendOn(w, 'p1');
    await startClock(w);
    await w.find('[data-pm-clock-toggle]').trigger('click');
    await flush();
    await w.vm.$nextTick();

    await w.find('[data-pm-plus="p1"]').trigger('click');
    await flush();
    await w.vm.$nextTick();

    expect(w.find('[data-pm-refusal-title]').text()).toMatch(/stopped/i);
  });

  it('offers a way back to the schedule', async () => {
    const w = await mountBoard();
    expect(w.find('[data-tool-back]').exists()).toBe(true);
  });

  it('arms an event kind from the footer bar', async () => {
    const w = await mountBoard();
    await startClock(w);
    await w.find('[data-pm-arm="goal"]').trigger('click');
    await w.vm.$nextTick();
    expect(w.find('[data-pm-arm="goal"]').classes()).toContain('is-armed');
  });
```

- [ ] **Step 3: Run it to verify the new cases fail**

Run: `npx vitest run src/components/schedule/LiveMatchScreen.test.ts`
Expected: the five new cases fail; the existing ones pass once the rename compiles.

- [ ] **Step 4: Convert the component's script**

In `src/components/schedule/LiveMatchScreen.vue`, replace the `BaseModal` import with `ToolScreen`:

```ts
import ToolScreen from '../layout/ToolScreen.vue';
```

Replace the props block with:

```ts
const props = defineProps<{
  matchId: string | null;
  matchLabel?: string;
  teamId: string | null;
  schoolId: string | null;
  players: any[];
}>();
```

Replace the two `watch`es (which keyed on `props.open`) with:

```ts
watch(() => props.matchId, async () => {
  openError.value = null;
  const res = await pm.open(props.teamId, props.schoolId, props.matchId, props.matchLabel);
  if (!res?.ok) openError.value = res?.error || 'Could not open that match.';
}, { immediate: true });

// The clock is derived from a timestamp, so something has to ask it the time.
onMounted(() => { ticker = setInterval(() => pm.tick(), 1000); });
```

and change the `vue` import to include `onMounted`:

```ts
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
```

Replace `title` with the screen's own heading pieces, and add the status and refusal wording:

```ts
const kicker = computed(() => {
  const half = pm.period === 1 ? '1st half' : pm.period === 2 ? '2nd half' : `Period ${pm.period}`;
  return props.matchLabel ? `${half} · vs ${props.matchLabel}` : half;
});

/** What the strip under the clock says, in three states. */
const clockState = computed(() => {
  if (pm.running) return 'Clock running · recording live';
  return pm.everStarted ? 'Clock stopped' : 'Not started';
});

const gateHint = computed(() => (pm.running ? '' : '± and events are held'));

/**
 * The refusal's heading.
 *
 * The store decides whether an event is refused and words the reason; this
 * only says which of the two situations the coach is in, because the mistake
 * each prevents is different.
 */
const refusalTitle = computed(() =>
  pm.everStarted ? 'The clock is stopped' : "The match hasn't kicked off");

/** Whether a clock-gated control should read as dead. */
const held = computed(() => !pm.running);

const EVENT_KINDS = [
  { kind: 'shot' as const, label: 'Shot' },
  { kind: 'goal' as const, label: 'Goal' },
  { kind: 'assist' as const, label: 'Assist' }
];

/**
 * Arming a kind while the clock is stopped is refused by the store's own
 * door, so the screen asks it rather than deciding for itself.
 */
async function onArm(kind: 'shot' | 'goal' | 'assist'): Promise<void> {
  if (!pm.running) { await pm.append(kind); return; }
  pm.arm(kind);
}

const benchEl = ref<HTMLElement | null>(null);
function onSub(): void {
  benchEl.value?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
```

- [ ] **Step 5: Replace the template**

```html
<template>
  <ToolScreen
    title="Live ±" :kicker="kicker"
    :back-to="{ name: 'schedule' }" back-label="Schedule"
  >
    <template #top-right>
      <button
        type="button" class="clockbtn" :class="{ 'is-running': pm.running }"
        data-pm-clock-toggle @click="pm.toggleClock()"
      >{{ pm.running ? 'Stop' : pm.everStarted ? 'Restart' : 'Start' }}</button>
    </template>

    <p v-if="openError" class="hint hint--bad" role="alert" data-pm-open-error>{{ openError }}</p>

    <div class="clock">
      <strong class="clock__time tnum" :class="{ 'is-running': pm.running }" data-pm-clock>
        {{ pm.clockText }}
      </strong>
      <span class="clock__score tnum" data-pm-score>{{ scoreLine }}</span>
    </div>

    <div class="status" :class="{ 'is-held': !pm.running }" data-pm-status>
      <span class="status__dot" />
      <span class="status__state">{{ clockState }}</span>
      <span v-if="gateHint" class="status__hint">{{ gateHint }}</span>
    </div>

    <!-- The words are the store's; only the heading is the screen's, and it
         says which of the two mistakes is being prevented. -->
    <div v-if="pm.notice" class="refusal" role="status" data-pm-refusal>
      <p class="refusal__title" data-pm-refusal-title>{{ refusalTitle }}</p>
      <p class="refusal__body" data-pm-notice>{{ pm.notice }}</p>
    </div>

    <div class="overflow">
      <button type="button" class="minor" data-pm-goal-for @click="pm.teamGoal(true)">Goal for us</button>
      <button type="button" class="minor" data-pm-goal-against @click="pm.teamGoal(false)">Goal against</button>
      <button type="button" class="minor" data-pm-end-period @click="pm.endPeriod()">End period</button>
      <button type="button" class="minor" data-pm-undo @click="pm.undo()">Undo</button>
    </div>

    <p class="kicker sec">
      On the pitch <span class="tnum" data-pm-on-count>{{ pm.onPitch.length }} / {{ pmMaxOnPitch() }}</span>
    </p>

    <p v-if="onPitch.length === 0" class="hint" data-pm-empty-pitch>
      Nobody is on yet. Send players on from the bench below — that works
      before kick-off.
    </p>

    <div class="rows">
      <div
        v-for="p in onPitch" :key="p.id"
        class="row" :data-pm-player="p.id"
        @click="onTapPlayer(p.id, $event)"
        @contextmenu.prevent="onTapPlayer(p.id, $event, true)"
      >
        <span class="row__no tnum">{{ p.number ?? '—' }}</span>
        <span class="row__who">
          <span class="row__name">{{ shortName(p) }}</span>
          <span class="row__stat tnum" :data-pm-score-for="p.id">
            {{ Math.round((statOf(p.id).secondsPlayed || 0) / 60) }}′ on ·
            net {{ statOf(p.id).score > 0 ? '+' : '' }}{{ statOf(p.id).score }}
          </span>
        </span>
        <button
          type="button" class="tap" :class="{ 'is-held': held }"
          :data-pm-minus="p.id" aria-label="Minus"
          @click.stop="pm.append('minus', p.id)"
        >&minus;</button>
        <button
          type="button" class="tap tap--plus" :class="{ 'is-held': held }"
          :data-pm-plus="p.id" aria-label="Plus"
          @click.stop="pm.append('plus', p.id)"
        >+</button>
        <button type="button" class="off" :data-pm-off="p.id" @click.stop="pm.movePlayer(p.id, false)">
          Off
        </button>
      </div>
    </div>

    <p ref="benchEl" class="kicker sec">Bench</p>

    <div class="rows">
      <button
        v-for="p in bench" :key="p.id"
        type="button" class="row row--bench" :data-pm-bench="p.id"
        @click="pm.movePlayer(p.id, true)"
      >
        <span class="row__no tnum">{{ p.number ?? '—' }}</span>
        <span class="row__name">{{ shortName(p) }}</span>
        <span class="row__on">On</span>
      </button>
      <p v-if="bench.length === 0" class="hint">Everyone is on the pitch.</p>
    </div>

    <p class="kicker sec">The sheet</p>

    <div class="wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th v-for="c in columns" :key="c.key" :class="{ 'is-text': c.text }">
              <button type="button" class="th" :data-pm-sort="c.key" @click="sortBy(c.key)">
                <span v-html="c.label" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.player.id" data-pm-row>
            <td
              v-for="(cell, i) in r.cells" :key="columns[i].key"
              :class="columns[i].text ? 'is-text' : 'tabular'"
              :data-pm-cell="columns[i].key"
            >{{ cell }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <template #foot>
      <button
        v-for="e in EVENT_KINDS" :key="e.kind"
        type="button" class="eventbtn"
        :class="{ 'is-held': held, 'is-armed': pm.armed === e.kind }"
        :data-pm-arm="e.kind" @click="onArm(e.kind)"
      >{{ e.label }}</button>
      <button type="button" class="eventbtn eventbtn--go" data-pm-sub @click="onSub">Sub</button>
    </template>
  </ToolScreen>
</template>
```

- [ ] **Step 6: Replace the styles**

```css
.clock { display: flex; align-items: baseline; gap: var(--space-3); }

.clock__time {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 33px;
  line-height: 1.15;
  color: var(--color-warning);
}

.clock__time.is-running { color: var(--live); }
.clock__score { font-size: 15px; color: var(--ink); }

.status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-2) calc(var(--space-4) * -1) 0;
  padding: 9px var(--space-4);
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--live);
}

.status.is-held { background: #1c1608; color: var(--color-warning); }

.status__dot {
  width: 9px;
  height: 9px;
  flex: none;
  border-radius: 50%;
  background: currentColor;
}

.status__hint {
  margin-left: auto;
  font-family: var(--font-body);
  font-size: 11.5px;
  letter-spacing: 0;
  text-transform: none;
  color: var(--ink-muted);
}

.refusal {
  margin-top: var(--space-3);
  padding: var(--space-3) var(--space-3);
  border: 1px solid var(--color-warning);
  border-left-width: 4px;
  border-radius: var(--radius-lg);
  background: #241c07;
}

.refusal__title {
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-warning);
}

.refusal__body { margin-top: 6px; font-size: 13px; line-height: 1.5; color: var(--ink); }

.overflow { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }

.minor {
  min-height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.minor:hover { color: var(--ink); }

.sec { margin-top: var(--space-4); color: var(--ink-muted); }
.sec .tnum { color: var(--ink-muted); }

.rows { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-2); }

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
  user-select: none;
}

.row__no { width: 26px; flex: none; font-family: var(--font-display); font-size: 19px; color: var(--mark); }
.row__who { flex: 1; min-width: 0; }
.row__name { display: block; font-size: 13px; line-height: 1.2; }
.row__stat { display: block; font-size: 10.5px; color: var(--ink-muted); }
.row--bench .row__name { flex: 1; }
.row__on { margin-left: auto; font-size: 11px; color: var(--live); }

/* 54px, because a coach taps these while watching the game rather than the phone. */
.tap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  flex: none;
  border: 1.5px solid var(--rule);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--ink);
  font-family: var(--font-display);
  font-size: 24px;
  cursor: pointer;
}

.tap--plus { border-color: var(--live); color: var(--live); }
.tap.is-held { border-style: dashed; border-color: var(--rule); color: var(--ink-soft); }

.off {
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-muted);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.wrap { overflow-x: auto; margin-top: var(--space-2); }
.tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }

.tbl th, .tbl td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--rule);
  text-align: right;
  white-space: nowrap;
}

.tbl th.is-text, .tbl td.is-text { text-align: left; }

.th {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink-muted);
  font: inherit;
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.tabular { font-variant-numeric: tabular-nums; }

.hint { margin-top: var(--space-2); font-size: 12px; line-height: 1.5; color: var(--ink-muted); }
.hint--bad { color: var(--color-warning); }

.clockbtn {
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1.5px solid var(--live);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--live);
  font-family: var(--font-display);
  font-size: 15px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.clockbtn.is-running { border-color: var(--color-warning); color: var(--color-warning); }

.eventbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 56px;
  border: 1.5px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
}

.eventbtn.is-held { border-style: dashed; background: transparent; color: var(--ink-soft); }
.eventbtn.is-armed { border-color: var(--mark); color: var(--mark); }
.eventbtn--go { border: 1.5px solid var(--live); background: transparent; color: var(--live); }

@media (min-width: 768px) {
  .rows { display: grid; grid-template-columns: 1fr 1fr; }
}
```

- [ ] **Step 7: Write the view and its test**

Replace `src/views/LiveMatchView.vue` with the same shape as `LineupView`, differing in the screen it renders and its wording:

```vue
<script setup lang="ts">
/**
 * The live plus/minus board, at its own URL.
 *
 * Reached from the Schedule or from a bookmark on a touchline, so the view
 * loads the schedule and the roster itself. Unlike the lineup, this screen
 * always needs a fixture: a board with no match has nothing to write to.
 */
import { computed, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import LiveMatchScreen from '../components/schedule/LiveMatchScreen.vue';
import { useOrganizationStore } from '../stores/organization';
import { useScheduleStore } from '../stores/schedule';
import { useRosterStore } from '../stores/roster';
import { matchById } from '../domain/match-lookup';

const route = useRoute();
const org = useOrganizationStore();
const schedule = useScheduleStore();
const roster = useRosterStore();

const matchId = computed(() => (route.params.matchId as string) || null);
const match = computed(() => matchById(schedule.matches, matchId.value));
const schoolId = computed(() => org.school?.id ?? null);

const settled = computed(() => !schedule.loading && schedule.loadedTeamId !== null);
const missing = computed(() => settled.value && !match.value);

watch(() => org.activeTeamId, (id) => {
  schedule.load(id);
  roster.load(id);
}, { immediate: true });
</script>

<template>
  <p v-if="!settled" class="state" data-live-loading>Loading the fixture…</p>

  <section v-else-if="missing" class="state" data-live-missing>
    <p>That fixture is not on this team's schedule.</p>
    <RouterLink :to="{ name: 'schedule' }" class="state__back">Back to the schedule</RouterLink>
  </section>

  <LiveMatchScreen
    v-else
    :match-id="matchId"
    :match-label="match?.opponent || ''"
    :team-id="org.activeTeamId"
    :school-id="schoolId"
    :players="roster.players"
  />
</template>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: center;
  justify-content: center;
  height: 100vh;
  height: 100dvh;
  padding: var(--space-4);
  background: var(--ground);
  color: var(--ink-muted);
  font-size: 14px;
  text-align: center;
}

.state__back { color: var(--live); border-bottom: 1px solid var(--live); text-decoration: none; }
</style>
```

Create `src/views/LiveMatchView.test.ts`:

```ts
/**
 * The live board at its own URL.
 *
 * A board always needs a fixture: unlike a lineup, there is nothing to write
 * to without one. The cold cases are what matter — a stale bookmark says so,
 * and an unloaded schedule claims nothing.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { createRouter, createMemoryHistory } from 'vue-router';
import LiveMatchView from './LiveMatchView.vue';

const MATCHES = [{ id: 'm1', opponent: 'Yucaipa', isHome: true }];

async function mountAt(matchId: string, schedule: Record<string, any> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/schedule', name: 'schedule', component: { template: '<p />' } },
      { path: '/schedule/:matchId/live', name: 'live', component: LiveMatchView }
    ]
  });
  await router.push(`/schedule/${matchId}/live`);
  await router.isReady();

  const w = mount(LiveMatchView, {
    global: {
      plugins: [router, createTestingPinia({
        createSpy: vi.fn,
        initialState: {
          schedule: { matches: MATCHES, loading: false, loadError: null, loadedTeamId: 't1', ...schedule },
          organization: {
            schools: [{ id: 's1', name: 'Legends FC', mascot: 'Lions' }],
            teams: [{ id: 't1', name: 'U16', school_id: 's1' }],
            activeTeamId: 't1'
          },
          roster: { players: [{ id: 'p1', name: 'Cesar Alva', number: 1 }], loadedTeamId: 't1' }
        }
      })],
      stubs: { LiveMatchScreen: { props: ['matchId', 'matchLabel'], template: '<div data-screen :data-label="matchLabel" />' } }
    }
  });
  await flushPromises();
  return w;
}

describe('LiveMatchView', () => {
  it('renders the board for a fixture on the schedule', async () => {
    const w = await mountAt('m1');
    expect(w.find('[data-screen]').attributes('data-label')).toBe('Yucaipa');
  });

  it('says so when the id names no fixture this team has', async () => {
    const w = await mountAt('gone');
    expect(w.find('[data-live-missing]').exists()).toBe(true);
    expect(w.find('[data-screen]').exists()).toBe(false);
  });

  it('claims nothing about a missing fixture before the schedule has loaded', async () => {
    const w = await mountAt('gone', { loadedTeamId: null, loading: true });
    expect(w.find('[data-live-loading]').exists()).toBe(true);
    expect(w.find('[data-live-missing]').exists()).toBe(false);
  });
});
```

- [ ] **Step 8: Link from the Schedule**

In `src/views/ScheduleView.vue`: delete the `PlusMinusModal` import, the `pmOpen` and `pmMatch` refs, the `openPlusMinus` function and the `<PlusMinusModal … />` element. Replace each of the three `data-fixture-pm` buttons, which read:

```html
                <button type="button" class="textlink" data-fixture-pm @click="openPlusMinus(m)">Live ±</button>
```

with, `m` being `schedule.nextMatch` in the next-fixture card exactly as the button was:

```html
                <RouterLink class="textlink" data-fixture-pm
                            :to="{ name: 'live', params: { matchId: m.id } }">Live ±</RouterLink>
```

In `src/views/ScheduleView.test.ts`, replace the case containing `expect(w.find('[data-pm-clock]').exists()).toBe(true);` with:

```ts
  it('links each fixture to its live board', () => {
    const w = mountSchedule({ coach: true });
    expect(w.findAll('[data-fixture-pm]')[0].attributes('href')).toMatch(/^\/schedule\/.+\/live$/);
  });
```

- [ ] **Step 9: Run the tests and the three gates**

Run: `npx vitest run src/components/schedule/LiveMatchScreen.test.ts src/views/LiveMatchView.test.ts src/views/ScheduleView.test.ts src/design-tokens.test.ts` → PASS. Three gates exit 0. `grep -n -- '--bhs-\|--text-muted' src/components/schedule/LiveMatchScreen.vue src/views/LiveMatchView.vue` returns nothing.

- [ ] **Step 10: Commit**

```bash
git add -A src/components/schedule src/views/LiveMatchView.vue src/views/LiveMatchView.test.ts src/views/ScheduleView.vue src/views/ScheduleView.test.ts
git commit -m "feat: the live board is a screen at its own URL

The touchline board on the pitch ground: 54px targets, a status strip, and
the refusal rendered as a card headed for the case it is. The clock rule
stays exactly where it was, in the store's one door.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The season report screen

The ledger table, full screen. The smallest of the three conversions: the table itself is right already, and what changes is the frame and the tokens.

**Files:**
- Rename: `src/components/schedule/SeasonReportModal.vue` → `SeasonReportScreen.vue`; `SeasonReportModal.test.ts` → `SeasonReportScreen.test.ts`
- Modify: both
- Modify: `src/views/SeasonReportView.vue` (replace the placeholder), create `src/views/SeasonReportView.test.ts`
- Modify: `src/views/ScheduleView.vue`, `src/views/ScheduleView.test.ts`

- [ ] **Step 1: Rename and adjust the existing test**

```bash
git mv src/components/schedule/SeasonReportModal.vue src/components/schedule/SeasonReportScreen.vue
git mv src/components/schedule/SeasonReportModal.test.ts src/components/schedule/SeasonReportScreen.test.ts
```

In `SeasonReportScreen.test.ts`: change the import to `SeasonReportScreen`, change the `mount(` call to match, delete `open: true,` from its props, and add to the `global` block:

```ts
      stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } }
```

- [ ] **Step 2: Add the failing case**

Append to the outermost `describe` in `SeasonReportScreen.test.ts`:

```ts
  it('offers a way back to the schedule', async () => {
    const w = await mountSeason();
    expect(w.find('[data-tool-back]').exists()).toBe(true);
  });
```

`mountSeason` is the file's existing mount helper.

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/components/schedule/SeasonReportScreen.test.ts`
Expected: the new case fails; the rest pass once the rename compiles.

- [ ] **Step 4: Convert the component**

In `src/components/schedule/SeasonReportScreen.vue`, replace the `BaseModal` import with `ToolScreen`:

```ts
import ToolScreen from '../layout/ToolScreen.vue';
```

Remove `open` from the props block, so it reads:

```ts
const props = defineProps<{
  teamId: string | null;
  teams: any[];
  players: any[];
}>();
```

Change the `watch` to key on the team alone:

```ts
watch(() => props.teamId, () => { load(); }, { immediate: true });
```

Replace the template's `<BaseModal …>` wrapper and its footer with the frame. The opening becomes:

```html
<template>
  <ToolScreen
    title="Season report" :kicker="`${fullMatch}-minute match`"
    :back-to="{ name: 'schedule' }" back-label="Schedule"
  >
```

the closing `</BaseModal>` and the whole `<template #footer>…</template>` block become:

```html
  </ToolScreen>
</template>
```

Everything between — the lede, the three states and the table — stays exactly as it is.

- [ ] **Step 5: Replace the styles**

```css
.lede {
  max-width: 44rem;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--ink-muted);
}

.state { padding: var(--space-8) 0; text-align: center; font-size: 13px; color: var(--ink-muted); }
.state--bad { color: var(--color-warning); }

.wrap { overflow-x: auto; margin-top: var(--space-4); }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }

.tbl th, .tbl td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--rule);
  text-align: right;
  white-space: nowrap;
}

.tbl th { border-bottom-color: var(--rule-strong); }
.tbl th.is-text, .tbl td.is-text { text-align: left; }
.tbl td.is-text { font-family: var(--font-body); }

.th {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink-muted);
  font: inherit;
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
}

.th:hover { color: var(--ink); }
.tabular { font-variant-numeric: tabular-nums; font-family: var(--heading-face); font-size: 15px; }

/* The name column stays put while the figures scroll under a narrow screen. */
@media (max-width: 767.98px) {
  .tbl td.is-text, .tbl th.is-text {
    position: sticky;
    left: 0;
    background: var(--ground);
  }
}
```

- [ ] **Step 6: Write the view and its test**

Replace `src/views/SeasonReportView.vue` with:

```vue
<script setup lang="ts">
/**
 * The season report, at its own URL.
 *
 * Read at a desk rather than a touchline, but it is a tool screen for the
 * same reason the others are: it is a wide table that wants the whole
 * window. It needs no fixture — the report is the season.
 */
import { computed, watch } from 'vue';
import SeasonReportScreen from '../components/schedule/SeasonReportScreen.vue';
import { useOrganizationStore } from '../stores/organization';
import { useRosterStore } from '../stores/roster';

const org = useOrganizationStore();
const roster = useRosterStore();

const teamId = computed(() => org.activeTeamId);

watch(() => org.activeTeamId, (id) => { roster.load(id); }, { immediate: true });
</script>

<template>
  <SeasonReportScreen :team-id="teamId" :teams="org.teams" :players="roster.players" />
</template>
```

Create `src/views/SeasonReportView.test.ts`:

```ts
/**
 * The season report at its own URL.
 *
 * It needs no fixture, so the only thing to prove is that it hands the
 * screen this team and this squad — a report built from another team's
 * roster names the wrong players.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import SeasonReportView from './SeasonReportView.vue';

describe('SeasonReportView', () => {
  it('hands the screen the active team, its teams and its squad', async () => {
    const w = mount(SeasonReportView, {
      global: {
        plugins: [createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            organization: {
              schools: [{ id: 's1', name: 'Legends FC' }],
              teams: [{ id: 't1', name: 'U16', school_id: 's1', match_minutes: 80 }],
              activeTeamId: 't1'
            },
            roster: { players: [{ id: 'p1', name: 'Cesar Alva' }], loadedTeamId: 't1' }
          }
        })],
        stubs: {
          SeasonReportScreen: {
            props: ['teamId', 'teams', 'players'],
            template: '<div data-screen :data-team="teamId" :data-players="players.length" />'
          }
        }
      }
    });
    await flushPromises();

    expect(w.find('[data-screen]').attributes('data-team')).toBe('t1');
    expect(w.find('[data-screen]').attributes('data-players')).toBe('1');
  });
});
```

- [ ] **Step 7: Link from the Schedule**

In `src/views/ScheduleView.vue`: delete the `SeasonReportModal` import, the `seasonOpen` ref and the `<SeasonReportModal … />` element. Replace the header button:

```html
        <button type="button" class="btn" data-open-season @click="seasonOpen = true">Season report</button>
```

with:

```html
        <RouterLink class="btn" data-open-season :to="{ name: 'season-report' }">Season report</RouterLink>
```

In `src/views/ScheduleView.test.ts`, the case asserting `data-open-season` exists still passes. Add beside it:

```ts
  it('links the header to the season report', () => {
    expect(mountSchedule({ coach: true }).find('[data-open-season]').attributes('href'))
      .toBe('/schedule/report');
  });
```

At this point `ScheduleView.vue` should import no modal at all except `MatchFormModal`. Confirm with `grep -n "Modal" src/views/ScheduleView.vue`, which should name only `MatchFormModal`.

- [ ] **Step 8: Run the tests and the three gates**

Run: `npx vitest run src/components/schedule/SeasonReportScreen.test.ts src/views/SeasonReportView.test.ts src/views/ScheduleView.test.ts src/design-tokens.test.ts` → PASS. Three gates exit 0. `grep -n -- '--bhs-\|--text-muted' src/components/schedule/SeasonReportScreen.vue src/views/SeasonReportView.vue` returns nothing.

- [ ] **Step 9: Commit**

```bash
git add -A src/components/schedule src/views/SeasonReportView.vue src/views/SeasonReportView.test.ts src/views/ScheduleView.vue src/views/ScheduleView.test.ts
git commit -m "feat: the season report is a screen at its own URL

The ledger table full screen, with the name column sticky on a narrow one.
Every player keeps a row and the minutes stay beside every rate.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: The phase gate

**Files:**
- Modify: `docs/superpowers/specs/2026-09-07-mobile-restyle-design.md` (one line)
- Modify: `CLAUDE.md` (the Layout table's `src/views/*.vue` row)

- [ ] **Step 1: Run the three gates for the whole phase**

```bash
npm test > /dev/null 2>&1; echo "TEST EXIT=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK EXIT=$?"
npm run build > /dev/null 2>&1; echo "BUILD EXIT=$?"
```

All three print `0`. Then run `npm test 2>&1 | tail -6` and record the counts.

- [ ] **Step 2: Confirm the exit conditions**

- `grep -rn "Modal" src/views/ScheduleView.vue` names only `MatchFormModal`.
- `grep -rln -- '--bhs-\|--text-muted' src/components/layout/ToolScreen.vue src/components/schedule/LineupScreen.vue src/components/schedule/LiveMatchScreen.vue src/components/schedule/SeasonReportScreen.vue src/views/LineupView.vue src/views/LiveMatchView.vue src/views/SeasonReportView.vue` returns nothing. (`MatchFormModal.vue` still carries the aliases and correctly so: the spec's §4 does not convert it and its §9 removes the alias block in phase 5.)
- `git grep -n "PlusMinusModal\|LineupModal\|SeasonReportModal" src | wc -l` is 0.

- [ ] **Step 3: Note the phase in the spec and the guide**

In the spec's §9 list, append to the line beginning `3. **Touchline routes.**`:

```
 — done 2026-09-07; the three screens share one ToolScreen frame, and matchById answers a stale bookmark.
```

In `CLAUDE.md`'s Layout table, change the `src/views/*.vue` row's second cell to:

```markdown
One per route. The seven nav routes, `/admin`, `/quiz`, and the three touchline tools (`LineupView`, `LiveMatchView`, `SeasonReportView`), which resolve their subject from the route and render a screen inside `components/layout/ToolScreen.vue`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-07-mobile-restyle-design.md CLAUDE.md
git commit -m "docs: phase 3 of the restyle is done

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review against the spec

- §3.4 tool chrome: `ToolScreen` draws the top bar with the back link and the footer bar; `App.vue` already hides the shell on `meta.chrome === 'tool'` from phase 1 — Task 2, and Task 3 sets the meta.
- §4 routes: the three paths, names, grounds and guards, registered in the spec's order, with the lineup's optional parameter — Task 3. Cold arrival, the loads and the refused state for an unknown id — Tasks 4, 5, 6 via `matchById`. `vercel.json` already serves extensionless paths, so no deployment change.
- §4 conversion: the three modal components converted in place and renamed, their tests renamed with them and every behavioural assertion kept — Tasks 4, 5, 6.
- §5.2 Lineup: formation in the top bar, the match length stated, the pitch with round markers, the bench as a two-column grid of large targets, Save and Go live in the footer, tap and drag both kept — Task 4.
- §5.2 Live: clock and clock button in the top bar, the status strip tinting when held, the refusal card with a title that differs on `everStarted` and a body that is the store's own words, 54px plus and minus that go dashed when held, the event bar with Sub always live, the sheet below — Task 5.
- §5.3 season report: full-screen ledger table, minutes beside every rate, every player present, back link — Task 6.
- §6 widths: 64rem measure on the frame; the bench and the live rows widen above 768px; the report's name column is sticky below it — Tasks 2, 4, 5, 6.
- §8 testing: route guards — Task 3; component tests for the three views asserting the subject resolves from the parameter and the refused state for an unknown id — Tasks 4, 5, 6; `LiveMatchView`'s card title differing on `everStarted` is asserted in the screen's own test, which is where `everStarted` can be driven — Task 5.
- Phase 2's parked items: the `.plate__label` contrast fix and the three deferred domain edges — Task 1.

Placeholder scan: every code step carries its code. Task 3 creates the three views as placeholders so its own commit builds, and Tasks 4–6 replace them; that is stated rather than implied. Task 6's Step 2 tells the implementer what to do if the mount helper has a different name.

Type consistency: `matchById(matches, id)` (Task 3) is called with `schedule.matches` and a route param in Tasks 4, 5. `ToolScreen`'s props `title`, `kicker`, `backTo`, `backLabel` and slots `top-right`, default, `foot` (Task 2) are what Tasks 4, 5 and 6 pass. `LineupScreen` gains `matchMinutes: number` (Task 4) and `LineupView` supplies it from `seasonFullMatchMinutes`, which returns a number. `pmMaxOnPitch` and `statOf` in Task 5's template are already imported and defined in the component being converted.
