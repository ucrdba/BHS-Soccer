# Mobile Restyle Phase 4 — Player Ratings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Player Ratings and its panels onto the ledger ground as the canvas draws them, promote session entry to a full-screen route with the format banner and the large keyboard-driven grid, and extract the route-view logic phase 3 deliberately left duplicated.

**Architecture:** `/matrix` keeps the app shell but changes ground from paper to ledger, and its actions become a segmented control that switches the panels the view already renders rather than five new routes. Session entry becomes the fourth tool route, converted in place from its modal like phase 3's three. The duplicated "resolve a subject from the route, distinguish loading from not-found" logic in the two phase-3 views becomes one pure function and one shared notice component, which the new session view is the third consumer of.

**Tech Stack:** Vue 3 `<script setup>`, Vue Router 5, Pinia, Vitest 4 with jsdom and `@vue/test-utils`, `vue-tsc`, Vite 8.

**Spec:** `docs/superpowers/specs/2026-09-07-mobile-restyle-design.md` (§4 routes, §5.3 ledger ground, §6 widths, §8 testing, phase 4 of §9). The canvas is `qlaudDesignSpec/soccer-program-mobile.dc.html`; the screens are option `1c` (board, exercise leaderboard, player breakdown) and turn `2a` (session entry, both measures).

**Baseline entering this plan:** commit `ffb703a` on `feature/convertToVue`, 137 test files, 2,455 tests passing, 2 skipped, three gates green.

## Global Constraints

- **Three gates on every commit, checked by exit code:** `npm test`, `npm run typecheck`, `npm run build`. In bash: `npm test > /dev/null 2>&1; echo "EXIT=$?"`. The suite takes about 80 seconds.
- **Files this phase rewrites use the ground tokens only:** `--ground`, `--surface`, `--surface-deep`, `--ink`, `--ink-muted`, `--ink-soft`, `--rule`, `--rule-strong`, `--live`, `--mark`, `--heading-face`, `--font-heading`, `--font-body`, `--font-display`, `--space-*`, `--radius-*`, `--shadow-md`, `--color-success/warning/danger`, plus the global `.kicker`, `.tnum`, `.sr-only`, `.btn`, `.btn--go`. **No `--bhs-*` name, no `--text-muted`, no literal colour.**
- **`time_bands` is a standard, not a ranking.** Four measures rank players against each other; `time_bands` asks whether a player can last a full match. Its emphasis is **strictly additive**: it may never narrow a table, remove a row, reorder one, or disable a sort. A squad where everyone clears the standard is the good outcome, not a broken exercise.
- **Low-minute and low-attempt players are never filtered.** Every player keeps a row on the board, the leaderboard, the squad report and the progress list. No minimum, no "others" row.
- **The two time measures are entered differently and must stay distinguishable.** `time_bands` is `4:30`, four minutes thirty. `time_low` is `4.85`, decimal seconds. Reading one as the other produces a figure that is wrong without looking wrong, which is why the screen states the unit. `domain/session-entry.ts` holds the parsing and this phase does not touch it.
- **The session grid competes with paper.** Three behaviours are requirements, not conveniences, and their existing tests must keep passing: Enter moves to the next entry field rather than submitting; it moves **in the order shown on screen**, which after a sort is not the roster order; and typing a value marks the player present, because a recorded time outranks whatever the attendance control said.
- **Recording numbers are not shirt numbers.** The board and the grid sort on the recording number. Nothing here renumbers anything.
- **Never hardcode a school, mascot, colour or 'bhs'.**
- **Every `data-*` hook the existing tests use is kept.** Board: `data-matrix-board`, `data-board-sort`, `data-board-row`, `data-board-player`. Leaderboard: `data-exercise-leaderboard`, `data-exercise-sort`, `data-leaderboard-row`, `data-leaderboard-empty`, `data-standing`, `data-below-standard`, `data-standard-summary`. View: `data-record-session`, `data-session-drill`, `data-open-weights`, `data-open-squad`, `data-open-progress`, `data-results-panel`, `data-result-row`, `data-result-remove`, `data-results-empty`, `data-history`, `data-empty`, `data-load-error`, `data-notice`. Grid: `data-session-date`, `data-jump-input`, `data-jump-go`, `data-jump-error`, `data-grid-sort`, `data-grid-row`, `data-grid-name`, `data-entry-field`, `data-attendance`, `data-grid-clear`, `data-band-earned`, `data-no-bands`, `data-session-save`, `data-session-error`. Panels: `data-breakdown-row`, `data-breakdown-detail`, `data-breakdown-empty`, `data-breakdown-error`, `data-history-row`, `data-history-date`, `data-history-edit`, `data-history-delete`, `data-history-empty`, `data-history-error`, `data-weight-row`, `data-weights-save`, `data-weights-notice`, `data-weights-error`, `data-weights-empty`, `data-measure`, `data-bands`, `data-band-row`, `data-band-add`, `data-band-remove`, `data-band-time`, `data-squad-row`, `data-squad-player`, `data-squad-exercise`, `data-squad-best`, `data-squad-attempts`, `data-squad-standard`, `data-squad-short`, `data-squad-no-standard`, `data-squad-empty`, `data-squad-error`, `data-progress-player`, `data-progress-drill`, `data-progress-chart`, `data-progress-reading`, `data-progress-trend`, `data-progress-empty`, `data-progress-error`.
- `tsconfig.json` stays loose; `typescript` stays on 5.x. `.at()` is unavailable at this `lib` target.
- Conventional Commits, trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Git prints CRLF warnings on this machine; they are not errors.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/domain/tool-subject.ts`, `.test.ts` (create) | `subjectState` — loading, missing or ready, for a route view. |
| `src/components/layout/ToolNotice.vue`, `.test.ts` (create) | The loading and refused cards a tool route shows instead of its screen. |
| `src/views/LineupView.vue`, `src/views/LiveMatchView.vue` (modify) | Retrofitted onto both; the lineup's double navigation fixed and tested. |
| `src/domain/session-format.ts`, `.test.ts` (create) | `entryFormat` (the unit banner) and `entryTally` (the footer counts). |
| `src/components/matrix/SessionEntryScreen.vue` (rename from `SessionModal.vue`) | Canvas 2a on the ledger ground. |
| `src/views/SessionEntryView.vue`, `.test.ts` (create) | Resolves the drill from the route, honours `?session=`. |
| `src/router/index.ts` (modify) | The session route; `/matrix` moves to the ledger ground. |
| `src/domain/matrix-panels.ts`, `.test.ts` (create) | `PANELS` and `panelFor` — which panel the segmented control shows. |
| `src/views/MatrixView.vue` (rewrite template + styles) | Canvas 1c·1's header, the segmented control, the ledger page. |
| `src/components/matrix/MatrixBoard.vue` (rewrite) | Canvas 1c·1's hairline board. |
| `src/components/matrix/ExerciseLeaderboard.vue` (rewrite) | Canvas 1c·2, standard box and word marks. |
| `src/components/matrix/PlayerBreakdownModal.vue` (rewrite styles) | Canvas 1c·3 as a ledger dialog. |
| `ResultsPanel`, `SessionHistory`, `WeightsModal`, `SquadReportModal`, `ProgressModal` (modify styles) | Ledger tokens, no layout change. |

---

### Task 1: One answer to "is the subject there yet?"

Phase 3 left `LineupView` and `LiveMatchView` with the same `settled`/`missing` computeds, the same load watch and a verbatim copy of the same `.state` style block. Task 2 adds the third view, which is the count that justified extracting `ToolScreen`. Its final review also parked two small faults in `LineupView`: a saved sheet navigates twice, and nothing tests that it navigates at all.

**Files:**
- Create: `src/domain/tool-subject.ts`, `src/domain/tool-subject.test.ts`
- Create: `src/components/layout/ToolNotice.vue`, `src/components/layout/ToolNotice.test.ts`
- Modify: `src/views/LineupView.vue`, `src/views/LineupView.test.ts`, `src/views/LiveMatchView.vue`, `src/views/LiveMatchView.test.ts`

**Interfaces:**
- Produces: `type SubjectState = 'loading' | 'missing' | 'ready'`; `subjectState(opts: { settled: boolean; id: string | null | undefined; found: unknown; idOptional?: boolean }): SubjectState`. `ToolNotice` takes `kind: 'loading' | 'missing'`, `message: string`, `backTo: RouteLocationRaw`, `backLabel?: string` (default `'Back to the schedule'`), and renders `data-tool-notice`, `data-tool-notice-message`, `data-tool-notice-back`.

- [ ] **Step 1: Write the failing domain test**

Create `src/domain/tool-subject.test.ts`:

```ts
/**
 * Whether a tool route can render yet.
 *
 * A touchline screen is a real URL, so it is reached from bookmarks and
 * reloads as well as from a link. Three answers, and the difference between
 * the first two is what stops the screen announcing that a fixture is gone
 * while its own schedule is still loading.
 */
import { describe, it, expect } from 'vitest';
import { subjectState } from './tool-subject';

describe('subjectState', () => {
  it('is loading until the source has settled, whatever the id says', () => {
    expect(subjectState({ settled: false, id: 'm1', found: null })).toBe('loading');
    expect(subjectState({ settled: false, id: 'gone', found: null })).toBe('loading');
    expect(subjectState({ settled: false, id: null, found: null })).toBe('loading');
  });

  it('is ready once the subject is found', () => {
    expect(subjectState({ settled: true, id: 'm1', found: { id: 'm1' } })).toBe('ready');
  });

  it('is missing when a named subject is not there', () => {
    expect(subjectState({ settled: true, id: 'gone', found: null })).toBe('missing');
  });

  it('is missing when no id was given and the screen needs one', () => {
    // The live board and the session grid both need a subject; without one
    // there is nothing to write to.
    expect(subjectState({ settled: true, id: null, found: null })).toBe('missing');
    expect(subjectState({ settled: true, id: '', found: null })).toBe('missing');
  });

  it('is ready with no id when the screen does not need one', () => {
    // A lineup not tied to a fixture is a legitimate sheet.
    expect(subjectState({ settled: true, id: null, found: null, idOptional: true })).toBe('ready');
    expect(subjectState({ settled: true, id: '', found: null, idOptional: true })).toBe('ready');
  });

  it('still reports a named subject missing even when the id is optional', () => {
    expect(subjectState({ settled: true, id: 'gone', found: null, idOptional: true })).toBe('missing');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/domain/tool-subject.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module**

`src/domain/tool-subject.ts`:

```ts
/**
 * Whether a tool route can render its screen yet.
 *
 * The touchline screens and the session grid are real URLs, reached from a
 * bookmark or a reload as readily as from a link, so each has to tell three
 * situations apart: the source has not loaded, the id names nothing, and the
 * subject is here. Keeping the difference between the first two is the point
 * — a screen that says "that fixture is gone" while its own schedule is
 * still loading is lying, and a coach on a touchline believes it.
 *
 * `idOptional` is for the lineup, which may legitimately be a sheet tied to
 * no fixture at all.
 */
export type SubjectState = 'loading' | 'missing' | 'ready';

export interface SubjectQuery {
  /** Has the source of the subject actually been read? */
  settled: boolean;
  /** The id from the route. */
  id: string | null | undefined;
  /** What the lookup returned for that id. */
  found: unknown;
  /** True when a screen without an id is still a screen. */
  idOptional?: boolean;
}

export function subjectState(opts: SubjectQuery): SubjectState {
  if (!opts || !opts.settled) return 'loading';
  if (opts.found) return 'ready';
  if (!opts.id) return opts.idOptional ? 'ready' : 'missing';
  return 'missing';
}
```

- [ ] **Step 4: Run the domain test, then write the failing component test**

Run: `npx vitest run src/domain/tool-subject.test.ts` → PASS.

Create `src/components/layout/ToolNotice.test.ts`:

```ts
/**
 * What a tool route shows instead of its screen.
 *
 * Both cases need a way out: a tool route has no header and no navigation,
 * so a coach who lands on one from a stale link is otherwise stranded.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ToolNotice from './ToolNotice.vue';

const RouterLinkStub = { props: ['to'], template: '<a><slot /></a>' };

const mountNotice = (props: Record<string, any>) => mount(ToolNotice, {
  props: { backTo: { name: 'schedule' }, ...props },
  global: { stubs: { RouterLink: RouterLinkStub } }
});

describe('ToolNotice', () => {
  it('shows the message it was given', () => {
    const w = mountNotice({ kind: 'loading', message: 'Loading the fixture…' });
    expect(w.find('[data-tool-notice-message]').text()).toBe('Loading the fixture…');
  });

  it('says which kind it is, so a test and a stylesheet can tell them apart', () => {
    expect(mountNotice({ kind: 'loading', message: 'x' }).find('[data-tool-notice]').attributes('data-tool-notice')).toBe('loading');
    expect(mountNotice({ kind: 'missing', message: 'x' }).find('[data-tool-notice]').attributes('data-tool-notice')).toBe('missing');
  });

  it('offers a way out of a missing subject', () => {
    const w = mountNotice({ kind: 'missing', message: 'That fixture is gone.' });
    expect(w.find('[data-tool-notice-back]').text()).toBe('Back to the schedule');
  });

  it('does not offer a way out while still loading', () => {
    // Nothing has gone wrong yet; a way out would read as one.
    const w = mountNotice({ kind: 'loading', message: 'Loading…' });
    expect(w.find('[data-tool-notice-back]').exists()).toBe(false);
  });

  it('lets the way out be named for where it goes', () => {
    const w = mountNotice({ kind: 'missing', message: 'x', backLabel: 'Back to the ratings' });
    expect(w.find('[data-tool-notice-back]').text()).toBe('Back to the ratings');
  });
});
```

- [ ] **Step 5: Run it to verify it fails, then create the component**

Run: `npx vitest run src/components/layout/ToolNotice.test.ts` → FAIL, component missing.

Create `src/components/layout/ToolNotice.vue`:

```vue
<script setup lang="ts">
/**
 * What a tool route shows instead of its screen.
 *
 * A tool route renders without the app's header and navigation, so a coach
 * who reaches one from a stale bookmark has no way back unless the notice
 * carries it. While the source is merely loading there is nothing to escape
 * from yet, so no way out is offered — an escape hatch on a page that is
 * about to work reads as a failure.
 */
import type { RouteLocationRaw } from 'vue-router';

withDefaults(defineProps<{
  kind: 'loading' | 'missing';
  message: string;
  backTo: RouteLocationRaw;
  backLabel?: string;
}>(), { backLabel: 'Back to the schedule' });
</script>

<template>
  <section class="notice" :data-tool-notice="kind">
    <p class="notice__message" data-tool-notice-message>{{ message }}</p>
    <RouterLink
      v-if="kind === 'missing'" :to="backTo"
      class="notice__back" data-tool-notice-back
    >{{ backLabel }}</RouterLink>
  </section>
</template>

<style scoped>
.notice {
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

.notice__back {
  color: var(--live);
  border-bottom: 1px solid var(--live);
  text-decoration: none;
}

.notice__back:hover,
.notice__back:focus-visible { color: var(--ink); border-bottom-color: var(--ink); }
</style>
```

- [ ] **Step 6: Retrofit the two phase-3 views**

In `src/views/LineupView.vue`:

- Add to the imports: `import ToolNotice from '../components/layout/ToolNotice.vue';` and `import { subjectState } from '../domain/tool-subject';`.
- Replace the `settled` and `missing` computeds with one:

```ts
/**
 * A lineup may legitimately have no fixture, so a missing id is ready
 * rather than missing; only an id that names nothing is a dead link.
 */
const state = computed(() => subjectState({
  settled: !schedule.loading && schedule.loadedTeamId !== null,
  id: matchId.value,
  found: match.value,
  idOptional: true
}));
```

- Fix the double navigation the phase 3 review parked: `LineupScreen` emits `saved` and then `close` on a successful save, and binding `onDone` to both pushes the same route twice. Bind only `@close`, and comment why:

```html
    <!-- Only @close: the screen emits `saved` and then `close` on a
         successful save, so binding both would push the same route twice. -->
```

- Replace the template's three branches with:

```html
<template>
  <ToolNotice
    v-if="state === 'loading'" kind="loading"
    message="Loading the fixture…" :back-to="{ name: 'schedule' }"
  />

  <ToolNotice
    v-else-if="state === 'missing'" kind="missing"
    message="That fixture is not on this team's schedule."
    :back-to="{ name: 'schedule' }"
  />

  <LineupScreen
    v-else
    :match-id="matchId"
    :match-label="match?.opponent || ''"
    :match-minutes="matchMinutes"
    :team-id="org.activeTeamId"
    :school-id="schoolId"
    :players="roster.players"
    @close="onDone"
  />
</template>
```

- Delete the file's entire `<style scoped>` block; the notice carries its own now.

Make the same three changes in `src/views/LiveMatchView.vue`, with `idOptional` omitted (a board always needs a fixture), the loading message `"Loading the fixture…"`, the missing message `"That fixture is not on this team's schedule."`, and no `@close` binding to add, since `LiveMatchScreen` no longer emits one. Delete its `<style scoped>` block too.

- [ ] **Step 7: Update the two view tests, and add the missing navigation test**

In both `src/views/LineupView.test.ts` and `src/views/LiveMatchView.test.ts`, the hooks change. Replace every `w.find('[data-lineup-loading]')` with `w.find('[data-tool-notice="loading"]')`, every `w.find('[data-lineup-missing]')` with `w.find('[data-tool-notice="missing"]')`, and the same for the `data-live-loading` and `data-live-missing` pair. Add `ToolNotice` to neither file's stubs — it should really render.

Append to `LineupView.test.ts`, inside its existing `describe('LineupView', …)`:

```ts
  it('returns to the schedule when the screen is done', async () => {
    // Parked in phase 3: a saved sheet used to navigate twice and nothing
    // tested that it navigated at all.
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/schedule', name: 'schedule', component: { template: '<p />' } },
        { path: '/schedule/lineup/:matchId?', name: 'lineup', component: LineupView },
        { path: '/schedule/:matchId/live', name: 'live', component: { template: '<p />' } }
      ]
    });
    await router.push('/schedule/lineup/m1');
    await router.isReady();

    const w = mount(LineupView, {
      global: {
        plugins: [router, createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            schedule: { matches: MATCHES, loading: false, loadError: null, loadedTeamId: 't1' },
            organization: {
              schools: [{ id: 's1', name: 'Legends FC', mascot: 'Lions' }],
              teams: [{ id: 't1', name: 'U16', school_id: 's1', match_minutes: 80 }],
              activeTeamId: 't1'
            },
            roster: { players: [{ id: 'p1', name: 'Cesar Alva', number: 1 }], loadedTeamId: 't1' }
          }
        })],
        stubs: { LineupScreen: { template: '<div data-screen />' } }
      }
    });
    await flushPromises();

    const push = vi.spyOn(router, 'push');
    w.findComponent({ name: 'LineupScreen' }).vm.$emit('close');
    await flushPromises();

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({ name: 'schedule' });
  });
```

If `findComponent({ name: 'LineupScreen' })` does not resolve because the stub is anonymous, give the stub a `name: 'LineupScreen'` property and say so in your report.

- [ ] **Step 8: Run the tests and the three gates**

Run: `npx vitest run src/domain/tool-subject.test.ts src/components/layout/ToolNotice.test.ts src/views/LineupView.test.ts src/views/LiveMatchView.test.ts src/design-tokens.test.ts` → PASS. Three gates exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/domain/tool-subject.ts src/domain/tool-subject.test.ts src/components/layout/ToolNotice.vue src/components/layout/ToolNotice.test.ts src/views/LineupView.vue src/views/LineupView.test.ts src/views/LiveMatchView.vue src/views/LiveMatchView.test.ts
git commit -m "refactor: one answer to whether a tool route can render yet

subjectState and ToolNotice replace the loading and refused states the two
touchline views had copied between them, and the saved lineup now navigates
once, with a test that it navigates at all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: What the session grid states about its units

Two small pure functions the grid needs: the banner naming the unit an exercise is entered in, and the tally under the table. Separate from the component because both are the sort of thing a reviewer should be able to read on its own.

**Files:**
- Create: `src/domain/session-format.ts`, `src/domain/session-format.test.ts`

**Interfaces:**
- Consumes: `EntryRow` and `Attendance` from `src/domain/session-entry.ts`.
- Produces: `entryFormat(measure: string): { figure: string; note: string } | null`; `entryTally(players: any[], entries: Record<string, EntryRow>, measure: string): { timed: number; absent: number; remaining: number }`.

- [ ] **Step 1: Write the failing test**

Create `src/domain/session-format.test.ts`:

```ts
/**
 * What the session grid says about its own units, and what it counts.
 *
 * The two time measures look alike and are not: `4:30` is four minutes
 * thirty and `4.85` is four point eight five seconds. Reading one as the
 * other gives a figure that is wrong without looking wrong, so the screen
 * states which is expected rather than leaving the coach to infer it.
 */
import { describe, it, expect } from 'vitest';
import { entryFormat, entryTally } from './session-format';

describe('entryFormat', () => {
  it('names minutes and seconds for a banded exercise', () => {
    const f = entryFormat('time_bands');
    expect(f?.figure).toBe('m:ss');
    expect(f?.note).toMatch(/minutes and seconds/i);
    expect(f?.note).toContain('10:41');
  });

  it('names decimal seconds for a sprint, and says a colon is refused', () => {
    const f = entryFormat('time_low');
    expect(f?.figure).toBe('0.00');
    expect(f?.note).toMatch(/decimal seconds/i);
    expect(f?.note).toContain('4.85');
    expect(f?.note).toMatch(/colon/i);
  });

  it('names repetitions for a count', () => {
    const f = entryFormat('count_high');
    expect(f?.figure).toBe('count');
    expect(f?.note).toMatch(/whole numbers/i);
  });

  it('says nothing for a measure whose field is not typed', () => {
    // A win or loss is chosen, not typed, so a unit banner would be noise.
    expect(entryFormat('win_loss')).toBeNull();
    expect(entryFormat('head_to_head')).toBeNull();
    expect(entryFormat('')).toBeNull();
    expect(entryFormat('something_new')).toBeNull();
  });

  it('never confuses the two time measures', () => {
    expect(entryFormat('time_bands')!.figure).not.toBe(entryFormat('time_low')!.figure);
  });
});

describe('entryTally', () => {
  const players = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const row = (over: any = {}) => ({ value: '', outcome: '', attendance: 'present', ...over });

  it('counts what is timed, who is out, and what is left', () => {
    const entries = {
      a: row({ value: '10:41' }),
      b: row({ attendance: 'excused' }),
      c: row({ attendance: 'unexcused' }),
      d: row()
    } as any;
    expect(entryTally(players, entries, 'time_bands')).toEqual({ timed: 1, absent: 2, remaining: 1 });
  });

  it('reads a chosen result as recorded for an outcome measure', () => {
    const entries = { a: row({ outcome: 'win' }), b: row(), c: row(), d: row() } as any;
    expect(entryTally(players, entries, 'win_loss')).toEqual({ timed: 1, absent: 0, remaining: 3 });
  });

  it('does not count a value from a player who is not in the squad', () => {
    const entries = { a: row({ value: '9' }), zz: row({ value: '9' }) } as any;
    expect(entryTally(players, entries, 'count_high').timed).toBe(1);
  });

  it('never reports a negative remainder', () => {
    const entries = {
      a: row({ value: '1' }), b: row({ value: '2' }),
      c: row({ value: '3' }), d: row({ value: '4' })
    } as any;
    expect(entryTally(players, entries, 'count_high')).toEqual({ timed: 4, absent: 0, remaining: 0 });
  });

  it('counts nothing for nothing', () => {
    expect(entryTally([], {}, 'count_high')).toEqual({ timed: 0, absent: 0, remaining: 0 });
    expect(entryTally(null as any, null as any, 'count_high')).toEqual({ timed: 0, absent: 0, remaining: 0 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/domain/session-format.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module**

`src/domain/session-format.ts`:

```ts
/**
 * What the session grid states about its units, and what it counts.
 *
 * The unit banner exists because the two time measures are plausible-looking
 * numbers in each other's format: `time_bands` takes `4:30`, four minutes
 * thirty, and `time_low` takes `4.85`, decimal seconds. A coach who enters
 * one in the other's shape gets a result that is wrong and does not look
 * wrong, so the screen names the unit rather than relying on them to
 * remember which exercise is which.
 *
 * The parsing itself is `domain/session-entry.ts`; this only says what to
 * expect and counts what has arrived.
 */
import type { EntryRow } from './session-entry';

export interface EntryFormat {
  /** The unit as a figure, shown large. */
  figure: string;
  /** One sentence naming the unit and an example. */
  note: string;
}

const FORMATS: Record<string, EntryFormat> = {
  time_bands: {
    figure: 'm:ss',
    note: 'Minutes and seconds — 10:41. This exercise is banded, not a sprint.'
  },
  time_low: {
    figure: '0.00',
    note: 'Decimal seconds — 4.85. A colon is refused here, not silently read as a time.'
  },
  count_high: {
    figure: 'count',
    note: 'Repetitions — whole numbers.'
  }
};

/** The banner for a measure, or null when its field is chosen rather than typed. */
export function entryFormat(measure: string): EntryFormat | null {
  return FORMATS[measure] || null;
}

export interface EntryTally {
  /** Players with a recorded result. */
  timed: number;
  /** Players marked out of the session. */
  absent: number;
  /** Players still to account for. Never negative. */
  remaining: number;
}

function recorded(row: EntryRow | undefined, measure: string): boolean {
  if (!row) return false;
  if (measure === 'win_loss' || measure === 'head_to_head') return !!row.outcome;
  return !!(row.value && String(row.value).trim());
}

export function entryTally(
  players: any[], entries: Record<string, EntryRow>, measure: string
): EntryTally {
  const squad = players || [];
  const rows = entries || {};

  let timed = 0;
  let absent = 0;

  for (const p of squad) {
    const row = rows[p?.id];
    if (recorded(row, measure)) { timed += 1; continue; }
    if (row && row.attendance !== 'present') absent += 1;
  }

  return { timed, absent, remaining: Math.max(0, squad.length - timed - absent) };
}
```

- [ ] **Step 4: Run the test to verify it passes, then the three gates**

Run: `npx vitest run src/domain/session-format.test.ts` → PASS. Three gates exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/domain/session-format.ts src/domain/session-format.test.ts
git commit -m "feat: the session grid's unit banner and its tally

The two time measures are each other's plausible shapes, so the screen
states which one it expects rather than leaving a coach to remember.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Session entry becomes a route

The screen that competes with paper. Converted in place from its modal like phase 3's three, onto the ledger ground at its own URL, with the unit banner, larger fields and the footer tally. **The three keyboard behaviours are carried across untouched.**

**Files:**
- Rename: `src/components/matrix/SessionModal.vue` → `SessionEntryScreen.vue`; `SessionModal.test.ts` → `SessionEntryScreen.test.ts`
- Modify: both
- Create: `src/views/SessionEntryView.vue`, `src/views/SessionEntryView.test.ts`
- Modify: `src/router/index.ts`, `src/router/ground.test.ts`, `src/router/guards.test.ts`
- Modify: `src/views/MatrixView.vue` (the record-session control becomes a link)
- Modify: `src/components/matrix/SessionHistory.vue`, `SessionHistory.test.ts` (the `edit` event carries the session id)

**Interfaces:**
- Consumes: `ToolScreen`, `ToolNotice` (Task 1), `subjectState` (Task 1), `entryFormat` and `entryTally` (Task 2).
- Produces: route `session-entry` at `/matrix/session/:drillId`; `SessionEntryScreen` taking `drillId`, `teamId`, `schoolId`, `players`, emitting `close` and `saved`. New hooks `data-entry-format`, `data-entry-tally`, `data-session-refused`.

- [ ] **Step 1: Write the failing route tests**

Add to `src/router/ground.test.ts`, inside `describe('the router', …)`:

```ts
  it('puts session entry on the ledger ground as a tool', () => {
    const byName = new Map(router.getRoutes().map(r => [String(r.name || ''), r]));
    expect(byName.get('session-entry')?.meta.ground).toBe('ledger');
    expect(byName.get('session-entry')?.meta.chrome).toBe('tool');
    expect(router.getRoutes().map(r => r.path)).toContain('/matrix/session/:drillId');
  });
```

Add to `src/router/guards.test.ts`, inside `describe('routeAllowed', …)`:

```ts
  it('keeps session entry to coaches and admins', () => {
    // A player may read the ratings; recording a session is a coach's.
    expect(routeAllowed('session-entry', coach)).toBe(true);
    expect(routeAllowed('session-entry', admin)).toBe(true);
    expect(routeAllowed('session-entry', player)).toBe(false);
    expect(routeAllowed('session-entry', guest)).toBe(false);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/router/ground.test.ts src/router/guards.test.ts`
Expected: FAIL on both new cases.

- [ ] **Step 3: Register the route**

In `src/router/index.ts`, add the import beside the other views:

```ts
import SessionEntryView from '../views/SessionEntryView.vue';
```

In `routeAllowed`, extend the touchline line so it reads:

```ts
  // The touchline tools and session entry write to the record, so they are
  // a coach's. A player may read the ratings board but not record against it.
  if (name === 'lineup' || name === 'live' || name === 'season-report'
      || name === 'session-entry') {
    return a.isCoach() || a.isAdmin();
  }
```

In the `routes` array, after the three touchline routes and before the catch-all:

```ts
    { path: '/matrix/session/:drillId', name: 'session-entry', component: SessionEntryView,
      meta: { ground: 'ledger', chrome: 'tool' } },
```

Create `src/views/SessionEntryView.vue` as a placeholder so this task's commit builds; Step 6 fills it in:

```vue
<script setup lang="ts">
/** Filled in by the restyle's phase 4, Task 3. */
</script>

<template>
  <p>Session entry</p>
</template>
```

Run `npx vitest run src/router/ground.test.ts src/router/guards.test.ts` → PASS.

- [ ] **Step 4: Rename the component and adjust its test**

```bash
git mv src/components/matrix/SessionModal.vue src/components/matrix/SessionEntryScreen.vue
git mv src/components/matrix/SessionModal.test.ts src/components/matrix/SessionEntryScreen.test.ts
```

In `SessionEntryScreen.test.ts`: change the import to `import SessionEntryScreen from './SessionEntryScreen.vue';`, change the `mount(SessionModal,` call to `mount(SessionEntryScreen,`, delete `open: true,` from the props it passes, and add the `RouterLink` stub the frame needs to the `global` block:

```ts
      stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } }
```

If the file has flat sibling `describe` blocks rather than one wrapper, add the new cases below as a new sibling `describe('the screen', …)` at the end.

```ts
  it('states the unit a banded exercise is entered in', async () => {
    const w = await mountGrid({ measure: 'time_bands' });
    expect(w.find('[data-entry-format]').text()).toContain('m:ss');
    expect(w.find('[data-entry-format]').text()).toMatch(/minutes and seconds/i);
  });

  it('states decimal seconds for a sprint instead', async () => {
    const w = await mountGrid({ measure: 'time_low' });
    expect(w.find('[data-entry-format]').text()).toContain('0.00');
    expect(w.find('[data-entry-format]').text()).toMatch(/colon/i);
  });

  it('states no unit for a result that is chosen rather than typed', async () => {
    const w = await mountGrid({ measure: 'win_loss' });
    expect(w.find('[data-entry-format]').exists()).toBe(false);
  });

  it('counts what is entered, who is out and what is left', async () => {
    const w = await mountGrid({ measure: 'count_high' });
    expect(w.find('[data-entry-tally]').text()).toMatch(/to go/i);
  });

  it('offers a way back to the ratings', async () => {
    const w = await mountGrid({ measure: 'count_high' });
    expect(w.find('[data-tool-back]').exists()).toBe(true);
  });
```

The file's existing helper is `mountGrid(opts: { drillId?: string; open?: boolean })`, which seeds the session store. Drop `open` from its options and its mount call, and extend it to accept a `measure` that seeds the drill's measure the way the file already seeds `drills`. Read the top of the file for that seeding and follow it; say in your report what the helper became.

- [ ] **Step 5: Convert the component**

In `src/components/matrix/SessionEntryScreen.vue`:

- Replace the `BaseModal` import with `import ToolScreen from '../layout/ToolScreen.vue';` and add `import { entryFormat, entryTally } from '../../domain/session-format';`.
- Replace the props block with:

```ts
const props = defineProps<{
  teamId: string | null;
  schoolId: string | null;
  players: any[];
  /** The exercise being recorded. Chosen before the screen opens. */
  drillId: string;
}>();
```

- Replace the `watch` that keyed on `props.open` with one on the drill alone:

```ts
watch(
  () => [props.drillId, props.players, session.results] as const,
  () => {
    entries.value = session.results.length
      ? entriesFromResults(props.players, session.results, measure.value)
      : blankEntries(props.players, measure.value);
  },
  { immediate: true, deep: true }
);
```

- Delete the `watch(() => props.open, …)` that reset the errors, and add three computeds:

```ts
const format = computed(() => entryFormat(measure.value));
const tally = computed(() => entryTally(props.players, entries.value, measure.value));

const title = computed(() =>
  session.editingId ? `Edit ${drill.value?.name || 'session'}` : (drill.value?.name || 'Session'));
```

- Replace the template's `<BaseModal …>` wrapper with the frame, keeping every hook and the whole table between them exactly as they are. The opening becomes:

```html
<template>
  <ToolScreen
    :title="title" kicker="Session entry"
    :back-to="{ name: 'matrix' }" back-label="Ratings"
  >
    <template #top-right>
      <button
        type="button" class="sortbtn" data-grid-sort="name"
        @click="setSort(sort.by === 'name' ? 'recordingNumber' : 'name')"
      >Sort: {{ sort.by === 'name' ? 'name' : 'recording no.' }} ▾</button>
    </template>

    <p v-if="format" class="format" data-entry-format>
      <span class="format__figure tnum">{{ format.figure }}</span>
      <span class="format__note">{{ format.note }}</span>
    </p>
```

Note the `data-grid-sort` hook moves onto that one button; the table's own two sort buttons keep theirs, so the hook appears three times. If an existing test asserts on the *count* of `[data-grid-sort]` elements, keep the table's two and give the top-right control `data-grid-sort-toggle` instead, and say so in your report.

The closing `</BaseModal>` and the whole `<template #footer>…</template>` become:

```html
    <template #foot>
      <p class="tally tnum" data-entry-tally>
        <span class="tally__done">{{ tally.timed }} recorded</span>
        · {{ tally.absent }} absent · {{ tally.remaining }} to go
      </p>
      <button
        ref="saveBtn" type="button" class="savebtn"
        :disabled="saving" data-session-save
        @click="onSave"
      >{{ saving ? 'Saving…' : 'Save session' }}</button>
    </template>
  </ToolScreen>
</template>
```

and the error paragraph moves above the footer, gaining a card:

```html
    <div v-if="error" class="refused" role="alert" data-session-refused>
      <p class="refused__title">Not saved</p>
      <p class="refused__body" data-session-error>{{ error }}</p>
      <p class="refused__note">Your entries are still in the fields above.</p>
    </div>
```

- [ ] **Step 6: Replace the styles**

```css
.format {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius-md);
}

.format__figure { font-family: var(--heading-face); font-size: 19px; color: var(--rule-strong); }
.format__note { font-size: 11.5px; line-height: 1.4; color: var(--ink); }

.head { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-3); }

.fld { display: flex; flex-direction: column; gap: 4px; }
.fld--wide { flex: 1; min-width: 14rem; }

.fld__label {
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.fld__input {
  min-height: 40px;
  padding: 6px 10px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 14px;
}

.fld__input:focus-visible { border-color: var(--live); outline-offset: 0; }
.jump { display: flex; gap: var(--space-2); }

.wrap { overflow-x: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }

.tbl th, .tbl td {
  padding: 7px 8px;
  border-bottom: 1px solid var(--rule);
  text-align: right;
}

.tbl th { border-bottom-color: var(--rule-strong); }
.tbl th.is-text, .tbl td.is-text { text-align: left; }

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
.tabular { font-variant-numeric: tabular-nums; }

/*
 * 48px, right-aligned, in the heading face: a coach enters twenty-five of
 * these one-handed while holding a clipboard, and the field is the whole
 * point of the screen.
 */
.inp {
  width: 84px;
  height: 48px;
  box-sizing: border-box;
  padding: 0 9px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: var(--surface-deep);
  color: var(--ink);
  font-family: var(--heading-face);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.inp:focus-visible { border-color: var(--live); outline-offset: 0; }
select.inp { width: auto; min-width: 96px; font-size: 14px; text-align: left; }

.earned { margin-left: var(--space-2); font-size: 11px; }
.earned--good { color: var(--live); }
.earned--none { color: var(--ink-muted); }
.earned--bad { color: var(--color-warning); }

.hint { margin: var(--space-2) 0; font-size: 12px; line-height: 1.5; color: var(--ink-muted); }
.hint--bad { color: var(--color-warning); }

.refused {
  margin-top: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-warning);
  border-left-width: 4px;
  border-radius: var(--radius-md);
}

.refused__title {
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-warning);
}

.refused__body { margin-top: 6px; font-size: 13px; line-height: 1.5; color: var(--ink); }
.refused__note { margin-top: 6px; font-size: 12px; color: var(--ink-muted); }

.btn {
  min-height: 40px;
  padding: 0 var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.btn--quiet { color: var(--ink-muted); font-size: 12px; }

.sortbtn {
  min-height: 40px;
  padding: 0 var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--live);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.tally { flex: 1; align-self: center; font-size: 11.5px; line-height: 1.4; color: var(--ink-muted); }
.tally__done { color: var(--ink); }

.savebtn {
  min-height: 48px;
  padding: 0 var(--space-4);
  border: 1.5px solid var(--live);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--live);
  font-family: var(--heading-face);
  font-size: 16px;
  letter-spacing: 0.04em;
  cursor: pointer;
}

.savebtn:disabled { opacity: 0.55; cursor: default; }
```

- [ ] **Step 7: Write the view**

Replace `src/views/SessionEntryView.vue` with:

```vue
<script setup lang="ts">
/**
 * Session entry, at its own URL.
 *
 * The drill is in the path and an existing session may be named in the query,
 * so a coach can return to a half-entered sheet from a bookmark. The view
 * loads the exercises and the squad itself rather than assuming the ratings
 * screen filled the stores first.
 */
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ToolScreen from '../components/layout/ToolScreen.vue';
import ToolNotice from '../components/layout/ToolNotice.vue';
import SessionEntryScreen from '../components/matrix/SessionEntryScreen.vue';
import { useOrganizationStore } from '../stores/organization';
import { useRosterStore } from '../stores/roster';
import { useSessionStore } from '../stores/session';
import { subjectState } from '../domain/tool-subject';

const route = useRoute();
const router = useRouter();
const org = useOrganizationStore();
const roster = useRosterStore();
const session = useSessionStore();

const drillId = computed(() => (route.params.drillId as string) || null);
const sessionId = computed(() => (route.query.session as string) || null);
const schoolId = computed(() => org.school?.id ?? null);

const drill = computed(() =>
  session.drills.find((d: any) => String(d.id) === String(drillId.value)) || null);

/**
 * Settled means the exercises have actually been read, so "no such exercise"
 * is an answer rather than a race.
 */
const state = computed(() => subjectState({
  settled: !session.loading && session.drills.length > 0,
  id: drillId.value,
  found: drill.value
}));

/**
 * Opening the sheet: an existing session is reopened with its results, a new
 * one starts blank. Both are the store's own calls; the view only decides
 * which the URL asked for.
 */
watch(
  () => [org.activeTeamId, drillId.value, sessionId.value] as const,
  async ([teamId, id, existing]) => {
    if (!teamId) return;
    roster.load(teamId);
    await session.loadDrills(schoolId.value);
    if (!id) return;
    // openExisting(sessionId, teamId) — two arguments; the drill is implied
    // by the session. openNew(drillId, teamId).
    if (existing) await session.openExisting(existing, teamId);
    else await session.openNew(id, teamId);
  },
  { immediate: true }
);

function onDone(): void {
  router.push({ name: 'matrix' });
}
</script>

<template>
  <ToolNotice
    v-if="state === 'loading'" kind="loading"
    message="Loading the exercise…" :back-to="{ name: 'matrix' }"
  />

  <ToolNotice
    v-else-if="state === 'missing'" kind="missing"
    message="That exercise is not in this organization's drill library."
    :back-to="{ name: 'matrix' }" back-label="Back to the ratings"
  />

  <SessionEntryScreen
    v-else
    :drill-id="drillId!"
    :team-id="org.activeTeamId"
    :school-id="schoolId"
    :players="roster.players"
    @close="onDone"
  />
</template>
```

Delete the `ToolScreen` import from that file: the view renders the screen, and the screen owns the frame. It is named here only because a reader may expect it.

- [ ] **Step 8: Write the view's test**

Create `src/views/SessionEntryView.test.ts`:

```ts
/**
 * Session entry at its own URL.
 *
 * The cold cases are what matter: a bookmark to an exercise that has since
 * been retired must say so, and an unloaded drill library must not claim the
 * exercise is gone.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { createRouter, createMemoryHistory } from 'vue-router';
import SessionEntryView from './SessionEntryView.vue';

const DRILLS = [{ id: 'd1', name: '1.5-Mile Run', measure: 'time_bands' }];

async function mountAt(path: string, sessionState: Record<string, any> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/matrix', name: 'matrix', component: { template: '<p />' } },
      { path: '/matrix/session/:drillId', name: 'session-entry', component: SessionEntryView }
    ]
  });
  await router.push(path);
  await router.isReady();

  const w = mount(SessionEntryView, {
    global: {
      plugins: [router, createTestingPinia({
        createSpy: vi.fn,
        initialState: {
          session: { drills: DRILLS, sessions: [], results: [], bands: [], editingId: null, loading: false, loadError: null, ...sessionState },
          organization: {
            schools: [{ id: 's1', name: 'Legends FC', mascot: 'Lions' }],
            teams: [{ id: 't1', name: 'U16', school_id: 's1' }],
            activeTeamId: 't1'
          },
          roster: { players: [{ id: 'p1', name: 'Cesar Alva', recordingNumber: 1 }], loadedTeamId: 't1' }
        }
      })],
      stubs: { SessionEntryScreen: { props: ['drillId'], template: '<div data-screen :data-drill="drillId" />' } }
    }
  });
  await flushPromises();
  return w;
}

describe('SessionEntryView', () => {
  it('renders the grid for an exercise in the library', async () => {
    const w = await mountAt('/matrix/session/d1');
    expect(w.find('[data-screen]').attributes('data-drill')).toBe('d1');
  });

  it('says so when the exercise is not in the library', async () => {
    const w = await mountAt('/matrix/session/gone');
    expect(w.find('[data-tool-notice="missing"]').exists()).toBe(true);
    expect(w.find('[data-screen]').exists()).toBe(false);
  });

  it('claims nothing before the library has loaded', async () => {
    const w = await mountAt('/matrix/session/gone', { drills: [], loading: true });
    expect(w.find('[data-tool-notice="loading"]').exists()).toBe(true);
    expect(w.find('[data-tool-notice="missing"]').exists()).toBe(false);
  });

  it('reopens a named session rather than starting a blank one', async () => {
    const w = await mountAt('/matrix/session/d1?session=s9');
    const store = (w.vm as any).$pinia._s.get('session');
    expect(store.openExisting).toHaveBeenCalled();
    expect(store.openNew).not.toHaveBeenCalled();
  });

  it('starts a blank sheet when no session is named', async () => {
    const w = await mountAt('/matrix/session/d1');
    const store = (w.vm as any).$pinia._s.get('session');
    expect(store.openNew).toHaveBeenCalled();
    expect(store.openExisting).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 9: Link from the ratings screen**

In `src/views/MatrixView.vue`, the "Record a session" button currently calls `onRecordSession`, which opens the modal. Replace the button with a link that carries the chosen exercise, keeping the `data-record-session` hook:

```html
        <RouterLink
          v-if="sessionDrills.length" class="act" data-record-session
          :to="{ name: 'session-entry', params: { drillId: sessionDrillId || sessionDrills[0].id } }"
        >Record a session</RouterLink>
        <p v-else class="act act--dead" data-record-session>Add an exercise in the planner first</p>
```

Delete `onRecordSession`, `sessionOpen`, the `SessionModal` import and the `<SessionModal … />` element. Keep `sessionDrillId`, `sessionDrills` and `openSessions`.

**Editing a recorded session needs one more change, and without it the feature silently breaks.** `SessionHistory.onEdit` currently calls `session.openExisting(s.id, props.teamId)` and then emits `edit` with only the drill id. In the routed world the view's own watch runs on arrival, sees no `?session=` in the URL, and calls `openNew` — wiping the results the history just loaded. The coach would open a recorded session and find a blank sheet.

So the history must say *which* session, and the route must carry it. In `src/components/matrix/SessionHistory.vue`:

```ts
const emit = defineEmits<{ edit: [string, string]; changed: [] }>();
```

```ts
async function onEdit(s: any): Promise<void> {
  error.value = null;
  // The route carries the session id, so the grid reopens this sheet rather
  // than starting a blank one. Loading it here as well is harmless and keeps
  // the store warm for the navigation.
  await session.openExisting(s.id, props.teamId);
  emit('edit', s.drill_id, s.id);
}
```

`src/components/matrix/SessionHistory.test.ts` asserts `expect(w.emitted('edit')![0]).toEqual(['d-small'])`. Change that expectation to `toEqual(['d-small', <the session's id in that fixture>])`, reading the fixture at the top of the file for the real id.

Then in `MatrixView.vue`, replace `onEditSession` with:

```ts
/** Editing a recorded session reopens the grid at its own URL. */
function onEditSession(drillId: string, sessionId: string): void {
  router.push({ name: 'session-entry', params: { drillId }, query: { session: sessionId } });
}
```

and add `import { useRouter } from 'vue-router';` with `const router = useRouter();` beside the stores.

If `MatrixView.test.ts` asserts that clicking `[data-record-session]` opens a modal, replace that assertion with one that the element is a link whose href contains `/matrix/session/`, using the same `RouterLink` stub pattern `ScheduleView.test.ts` uses. Say in your report which assertions you changed.

- [ ] **Step 10: Run the tests and the three gates**

Run: `npx vitest run src/components/matrix/SessionEntryScreen.test.ts src/views/SessionEntryView.test.ts src/views/MatrixView.test.ts src/router/ground.test.ts src/router/guards.test.ts src/design-tokens.test.ts` → PASS. Three gates exit 0. `grep -n -- '--bhs-\|--text-muted' src/components/matrix/SessionEntryScreen.vue src/views/SessionEntryView.vue` returns nothing.

- [ ] **Step 11: Commit**

```bash
git add -A src/components/matrix src/views/SessionEntryView.vue src/views/SessionEntryView.test.ts src/views/MatrixView.vue src/views/MatrixView.test.ts src/router
git commit -m "feat: session entry is a screen at its own URL

The grid that competes with paper moves to the ledger ground with the unit
banner, 48px fields and a footer tally. Enter still moves in the order
shown, and typing still marks the player present.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Which panel the ratings screen is showing

The canvas gives the ratings screen a segmented control. It switches between panels the view already renders rather than routing, so the decision of which panel is showing is a small pure function worth testing on its own.

**Files:**
- Create: `src/domain/matrix-panels.ts`, `src/domain/matrix-panels.test.ts`

**Interfaces:**
- Produces: `type PanelKey = 'board' | 'exercise' | 'results' | 'history'`; `PANELS: { key: PanelKey; label: string; coachOnly: boolean }[]`; `visiblePanels(isCoach: boolean)`; `panelFor(chosen: string, isCoach: boolean, hasExercise: boolean): PanelKey`.

- [ ] **Step 1: Write the failing test**

Create `src/domain/matrix-panels.test.ts`:

```ts
/**
 * Which panel the ratings screen is showing.
 *
 * The canvas gives the screen a segmented control rather than five routes,
 * so this decides what the control offers and what a chosen value resolves
 * to — including the two ways a choice can be stale: a panel a player may
 * not see, and the exercise panel with no exercise picked.
 */
import { describe, it, expect } from 'vitest';
import { PANELS, visiblePanels, panelFor } from './matrix-panels';

describe('PANELS', () => {
  it('lists the four panels in the order the canvas reads', () => {
    expect(PANELS.map(p => p.key)).toEqual(['board', 'exercise', 'results', 'history']);
  });

  it('marks the two a player has no business in', () => {
    const coachOnly = PANELS.filter(p => p.coachOnly).map(p => p.key);
    expect(coachOnly).toEqual(['results', 'history']);
  });
});

describe('visiblePanels', () => {
  it('gives a coach all four', () => {
    expect(visiblePanels(true).map(p => p.key)).toEqual(['board', 'exercise', 'results', 'history']);
  });

  it('gives a player the two that are theirs to read', () => {
    expect(visiblePanels(false).map(p => p.key)).toEqual(['board', 'exercise']);
  });
});

describe('panelFor', () => {
  it('honours a choice that is available', () => {
    expect(panelFor('results', true, false)).toBe('results');
    expect(panelFor('exercise', false, true)).toBe('exercise');
  });

  it('falls back to the board for a panel this viewer may not see', () => {
    expect(panelFor('results', false, false)).toBe('board');
    expect(panelFor('history', false, false)).toBe('board');
  });

  it('falls back to the board for a name that is not a panel', () => {
    expect(panelFor('nonsense', true, false)).toBe('board');
    expect(panelFor('', true, false)).toBe('board');
  });

  it('shows the exercise panel even with nothing picked, so the picker is reachable', () => {
    // The panel carries the picker; sending the reader to the board would
    // leave them no way to choose an exercise.
    expect(panelFor('exercise', true, false)).toBe('exercise');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/domain/matrix-panels.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module**

`src/domain/matrix-panels.ts`:

```ts
/**
 * Which panel the ratings screen is showing.
 *
 * The canvas gives this screen a segmented control rather than five separate
 * URLs, because the panels are four readings of one table rather than four
 * places. Two of them — the logged results and the session history — are a
 * coach's, so a player's control offers two.
 *
 * Resolving rather than trusting the stored choice matters because the
 * choice outlives the viewer: a coach picks the history, signs out, and a
 * player arrives with `history` still selected.
 */
export type PanelKey = 'board' | 'exercise' | 'results' | 'history';

export interface Panel {
  key: PanelKey;
  label: string;
  coachOnly: boolean;
}

export const PANELS: Panel[] = [
  { key: 'board',    label: 'Board',    coachOnly: false },
  { key: 'exercise', label: 'Exercise', coachOnly: false },
  { key: 'results',  label: 'Results',  coachOnly: true },
  { key: 'history',  label: 'History',  coachOnly: true }
];

export function visiblePanels(isCoach: boolean): Panel[] {
  return PANELS.filter(p => isCoach || !p.coachOnly);
}

/**
 * The panel to show, given what was chosen and who is looking.
 *
 * `hasExercise` is accepted because a caller naturally has it, but the
 * exercise panel is shown whether or not one is picked: the panel carries
 * the picker, so redirecting away would leave the reader unable to choose.
 */
export function panelFor(chosen: string, isCoach: boolean, hasExercise: boolean): PanelKey {
  void hasExercise;
  const found = visiblePanels(isCoach).find(p => p.key === chosen);
  return found ? found.key : 'board';
}
```

- [ ] **Step 4: Run the test to verify it passes, then the three gates**

Run: `npx vitest run src/domain/matrix-panels.test.ts` → PASS. Three gates exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/domain/matrix-panels.ts src/domain/matrix-panels.test.ts
git commit -m "feat: which panel the ratings screen is showing

Four readings of one table rather than four places, with the two that are a
coach's resolved rather than trusted — a stored choice outlives the viewer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The ratings screen and its board

Canvas 1c·1. The page header, the segmented control, and the board as hairline rows with the rank in the organization's mark colour. `/matrix` moves to the ledger ground, which means the app shell renders on navy for the first time.

**Files:**
- Modify: `src/router/index.ts` (one line), `src/router/ground.test.ts`
- Modify: `src/views/MatrixView.vue` (template and styles), `src/views/MatrixView.test.ts`
- Modify: `src/components/matrix/MatrixBoard.vue` (rewrite)

**Interfaces:**
- Consumes: `PANELS`, `visiblePanels`, `panelFor` (Task 4); `matrix.boardRows`, `matrix.boardSort`, `matrix.setBoardSort`, `matrix.boardDescends`, `matrix.exercises`, `matrix.exerciseFilter`, `matrix.setExerciseFilter`, `matrix.players`.
- Produces: hooks `data-panel-tab`, `data-panel`; the board keeps `data-matrix-board`, `data-board-sort`, `data-board-row`, `data-board-player`.

- [ ] **Step 1: Write the failing ground test**

Add to `src/router/ground.test.ts`, inside `describe('the router', …)`:

```ts
  it('puts the ratings on the ledger ground, with the shell still on', () => {
    const byName = new Map(router.getRoutes().map(r => [String(r.name || ''), r]));
    expect(byName.get('matrix')?.meta.ground).toBe('ledger');
    // Not a tool: the ratings are browsed to, so they keep the header and nav.
    expect(byName.get('matrix')?.meta.chrome).toBeUndefined();
  });
```

- [ ] **Step 2: Run it, then change the route**

Run: `npx vitest run src/router/ground.test.ts` → FAIL on the new case.

In `src/router/index.ts`, change the matrix route's meta from `{ ground: 'paper' }` to `{ ground: 'ledger' }` and delete the comment line above it that says the ratings move to the ledger ground in phase 4.

Run the file again → PASS.

- [ ] **Step 3: Add the failing view tests**

Append to `src/views/MatrixView.test.ts`, as a new sibling `describe` at the end if the file has flat siblings:

```ts
  it('offers a coach four panels and a player two', () => {
    const coach = mountMatrix({ coach: true });
    expect(coach.findAll('[data-panel-tab]').map(t => t.text()))
      .toEqual(['Board', 'Exercise', 'Results', 'History']);

    const player = mountMatrix({ coach: false });
    expect(player.findAll('[data-panel-tab]').map(t => t.text()))
      .toEqual(['Board', 'Exercise']);
  });

  it('shows the board first and switches on a tab', async () => {
    const w = mountMatrix({ coach: true });
    expect(w.find('[data-panel]').attributes('data-panel')).toBe('board');

    await w.findAll('[data-panel-tab]')[1].trigger('click');
    expect(w.find('[data-panel]').attributes('data-panel')).toBe('exercise');
  });
```

The file's helper is `async function mountMatrix(opts: {…})` — note it is async, so both cases above must `await` it. Read its options at the top of the file for the one that seeds a coach, and adjust these two cases to the real signature, saying in your report what you used.

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/views/MatrixView.test.ts`
Expected: the two new cases fail; the rest pass.

- [ ] **Step 5: Update the view's script**

In `src/views/MatrixView.vue`, add the import and two pieces of state:

```ts
import { PANELS, visiblePanels, panelFor } from '../domain/matrix-panels';
```

```ts
/** Which panel the segmented control is showing. */
const chosenPanel = ref<string>('board');
const panels = computed(() => visiblePanels(isCoach.value));
const panel = computed(() =>
  panelFor(chosenPanel.value, isCoach.value, !!matrix.exerciseFilter));
```

`PANELS` is imported for the type's sake only if you use it; if you do not reference it, import just `visiblePanels` and `panelFor`.

- [ ] **Step 6: Replace the view's template**

```html
<template>
  <section class="matrix">
    <header class="matrix__head">
      <p class="kicker kicker--accent">Competitive matrix</p>
      <h1 class="matrix__title">Player Ratings</h1>
      <p class="matrix__meta tnum">
        <span v-if="org.branding.name">
          {{ org.branding.name }}<span v-if="org.activeTeam"> · {{ org.activeTeam.name }}</span>
        </span>
        <span class="matrix__counts">
          {{ matrix.exercises.length }} exercises · {{ matrix.players.length }} players
        </span>
      </p>
    </header>

    <p v-if="notice" class="notice" role="status" data-notice>
      {{ notice }}
      <button type="button" class="notice__x" aria-label="Dismiss" @click="notice = null">&times;</button>
    </p>
    <p v-if="matrix.loadError" class="notice notice--bad" role="alert" data-load-error>
      {{ matrix.loadError }}
    </p>

    <nav class="tabs" aria-label="Ratings panels">
      <button
        v-for="p in panels" :key="p.key"
        type="button" class="tab" :class="{ 'is-on': panel === p.key }"
        data-panel-tab @click="chosenPanel = p.key"
      >{{ p.label }}</button>
    </nav>

    <div v-if="isCoach" class="acts">
      <select
        v-if="sessionDrills.length" v-model="sessionDrillId"
        class="acts__select" aria-label="Exercise to record" data-session-drill
      >
        <option v-for="d in sessionDrills" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>
      <RouterLink
        v-if="sessionDrills.length" class="act" data-record-session
        :to="{ name: 'session-entry', params: { drillId: sessionDrillId || sessionDrills[0].id } }"
      >Record a session</RouterLink>
      <p v-else class="act act--dead" data-record-session>Add an exercise in the planner first</p>
      <button type="button" class="act" data-open-weights @click="weightsOpen = true">Weights &amp; standards</button>
      <button type="button" class="act" data-open-squad @click="squadOpen = true">Squad report</button>
      <button type="button" class="act" data-open-progress @click="progressOpen = true">Progress</button>
    </div>

    <p v-if="!settled" class="empty">Loading the ratings…</p>
    <p v-else-if="matrix.players.length === 0" class="empty" data-empty>
      No players on this team yet.
    </p>

    <div v-else class="panel" :data-panel="panel">
      <template v-if="panel === 'board'">
        <MatrixBoard @open-player="openPlayerId = $event" />
      </template>

      <template v-else-if="panel === 'exercise'">
        <label class="picker">
          <span class="picker__label kicker">Exercise</span>
          <select
            class="picker__select" data-exercise-filter
            :value="matrix.exerciseFilter"
            @change="matrix.setExerciseFilter(($event.target as HTMLSelectElement).value)"
          >
            <option value="">Choose an exercise</option>
            <option v-for="d in matrix.exercises" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
        </label>
        <ExerciseLeaderboard v-if="matrix.exerciseFilter" />
        <p v-else class="empty">Pick an exercise to see it on its own.</p>
      </template>

      <template v-else-if="panel === 'results'">
        <ResultsPanel :can-edit="isCoach" @remove="onRemoveResult" />
      </template>

      <template v-else>
        <SessionHistory
          :can-edit="isCoach" :team-id="org.activeTeamId"
          @edit="onEditSession" @changed="reload" />
      </template>
    </div>

    <PlayerBreakdownModal
      :player-id="openPlayerId" :team-id="org.activeTeamId"
      @close="openPlayerId = null" />

    <WeightsModal
      v-if="isCoach"
      :open="weightsOpen" :school-id="schoolId" :team-id="org.activeTeamId"
      @close="weightsOpen = false" @saved="reload" />

    <SquadReportModal
      v-if="isCoach"
      :open="squadOpen" :team-id="org.activeTeamId" :school-id="schoolId"
      @close="squadOpen = false" />

    <ProgressModal
      v-if="isCoach"
      :open="progressOpen" :team-id="org.activeTeamId" :school-id="schoolId"
      @close="progressOpen = false" />
  </section>
</template>
```

Check the four modal elements against what the file currently passes them and keep the existing props exactly; the block above shows the shape, not necessarily this file's prop names. If any differ, keep the file's own.

- [ ] **Step 7: Replace the view's styles**

```css
.matrix { padding: var(--space-4) var(--space-4) var(--space-8); }

.matrix__head { padding-bottom: var(--space-3); border-bottom: 1px solid var(--rule); }
.kicker--accent { color: var(--rule-strong); }

.matrix__title {
  margin-top: 6px;
  font-family: var(--heading-face);
  font-weight: 400;
  font-size: 28px;
  line-height: 1.1;
  color: var(--ink);
}

.matrix__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: space-between;
  margin-top: var(--space-3);
  padding-top: var(--space-2);
  border-top: 1px solid var(--rule);
  font-size: 11.5px;
  color: var(--ink-muted);
}

.tabs {
  display: flex;
  gap: var(--space-4);
  margin-top: var(--space-3);
  padding-bottom: var(--space-2);
  overflow-x: auto;
}

.tab {
  padding: 0 0 4px;
  border: 0;
  border-bottom: 1px solid transparent;
  background: none;
  color: var(--ink-muted);
  font: inherit;
  font-size: 11.5px;
  white-space: nowrap;
  cursor: pointer;
}

.tab.is-on { color: var(--live); border-bottom-color: var(--live); }

.acts { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }

.act {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  padding: 0 var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  text-decoration: none;
  cursor: pointer;
}

.act--dead { color: var(--ink-muted); cursor: default; }
.act:hover { border-color: var(--live); color: var(--live); }
.act--dead:hover { border-color: var(--rule); color: var(--ink-muted); }

.acts__select, .picker__select {
  min-height: 36px;
  padding: 0 var(--space-2);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 12px;
}

.picker { display: flex; flex-direction: column; gap: 4px; margin-bottom: var(--space-3); }
.picker__label { color: var(--ink-muted); }

.panel { margin-top: var(--space-3); }

.empty { padding: var(--space-8) var(--space-3); text-align: center; color: var(--ink-muted); }

.notice {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-3);
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
  .matrix { max-width: 64rem; margin: 0 auto; }
}
```

- [ ] **Step 8: Rewrite the board**

Replace `src/components/matrix/MatrixBoard.vue`'s template and styles, keeping its script exactly as it is:

```html
<template>
  <div class="wrap">
    <table class="board" data-matrix-board>
      <thead>
        <tr>
          <th
            v-for="c in COLUMNS" :key="c.key"
            :class="{ 'is-text': c.text, 'is-sortable': c.sortable }"
            :title="c.title || (c.sortable ? `Sort by ${c.label}` : undefined)"
            :aria-sort="matrix.boardSort.by === c.key
              ? (matrix.boardDescends(c.key) ? 'descending' : 'ascending')
              : undefined"
          >
            <button
              v-if="c.sortable" type="button" class="th-btn"
              :data-board-sort="c.key" @click="matrix.setBoardSort(c.key)"
            >{{ c.label }}{{ arrow(c.key) }}</button>
            <span v-else>{{ c.label }}</span>
          </th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="m in matrix.boardRows" :key="m.playerId" data-board-row>
          <td>
            <span v-if="m.exercises === 0" class="rank rank--none" title="Has not taken part in anything yet">—</span>
            <span v-else class="rank tnum">{{ m.rank }}</span>
          </td>

          <td class="is-text">
            <button
              type="button" class="who" data-board-player
              title="See how these points were earned"
              @click="emit('openPlayer', m.playerId)"
            >{{ m.name }}</button>
          </td>

          <td class="tnum muted">{{ m.recordingNumber != null ? m.recordingNumber : '—' }}</td>
          <td class="tnum">{{ m.exercises }}</td>
          <td class="tnum">{{ m.wins }} - {{ m.draws }} - {{ m.losses }}</td>
          <td class="tnum points">{{ m.earned.toFixed(2) }}</td>
          <td class="tnum muted">{{ m.available.toFixed(2) }}</td>
          <td class="tnum">
            <span v-if="m.share === null" class="muted">—</span>
            <span v-else>{{ m.share.toFixed(1) }}%</span>
          </td>
        </tr>
      </tbody>
    </table>

    <p class="foot">
      Sorted on the recording number, not the shirt. The exercises column sits
      beside the points so a small sample is visible rather than hidden — no
      player is left out for having taken part in little.
    </p>
  </div>
</template>
```

The recording number moves out of the player cell into its own column, so add it to `COLUMNS` in the script, after `name`:

```ts
  { key: 'recordingNumber', label: 'No', sortable: false, title: 'Recording number, not the shirt number' },
```

The meter bar goes: the canvas's board is figures on hairlines, and `m.barPct` is no longer read. Leave `barPct` in the store; nothing else needs changing there.

Styles:

```css
.wrap { overflow-x: auto; }
.board { width: 100%; border-collapse: collapse; font-size: 13px; }

.board th, .board td {
  padding: 9px 8px;
  border-bottom: 1px solid var(--rule);
  text-align: right;
  white-space: nowrap;
}

.board th { border-bottom-color: var(--rule-strong); }
.board th.is-text, .board td.is-text { text-align: left; }

.board th {
  color: var(--ink-muted);
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.th-btn {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}

.th-btn:hover { color: var(--ink); }

.tnum { font-variant-numeric: tabular-nums; }
.muted { color: var(--ink-muted); }

.rank { font-family: var(--heading-face); font-size: 15px; color: var(--mark); }
.rank--none { color: var(--ink-soft); }

.who {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.who:hover, .who:focus-visible { color: var(--live); }

.points { font-family: var(--heading-face); font-size: 16px; color: var(--ink); }

.foot {
  padding: var(--space-3) 0 0;
  font-size: 11.5px;
  line-height: 1.5;
  font-style: italic;
  color: var(--ink-muted);
}

/* The name column stays put while the figures scroll on a narrow screen. */
@media (max-width: 767.98px) {
  .board td.is-text, .board th.is-text {
    position: sticky;
    left: 0;
    background: var(--ground);
  }
}
```

- [ ] **Step 9: Run the tests and the three gates**

Run: `npx vitest run src/views/MatrixView.test.ts src/router/ground.test.ts src/design-tokens.test.ts` → PASS. Three gates exit 0. `grep -n -- '--bhs-\|--text-muted' src/views/MatrixView.vue src/components/matrix/MatrixBoard.vue` returns nothing.

- [ ] **Step 10: Commit**

```bash
git add src/router/index.ts src/router/ground.test.ts src/views/MatrixView.vue src/views/MatrixView.test.ts src/components/matrix/MatrixBoard.vue
git commit -m "feat: the ratings screen and its board on the ledger ground

The canvas header, a segmented control over the panels the view already
had, and the board as hairline figures with the rank in the organization's
mark. Every player keeps a row and the exercise count sits beside the
points, so a small sample is visible rather than hidden.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The exercise leaderboard, the breakdown, and the remaining panels

Canvas 1c·2 and 1c·3, plus the five panels that only need the ledger tokens. The band summary is the piece that carries a rule: it is **additive**, and may never narrow the table or disable a sort.

**Files:**
- Modify: `src/components/matrix/ExerciseLeaderboard.vue` (template and styles)
- Modify: `src/components/matrix/PlayerBreakdownModal.vue` (styles only)
- Modify: `src/components/matrix/ResultsPanel.vue`, `SessionHistory.vue`, `WeightsModal.vue`, `SquadReportModal.vue`, `ProgressModal.vue` (styles only)
- Modify: `src/components/matrix/ExerciseLeaderboard` tests if the file has any; otherwise `src/views/MatrixView.test.ts` covers it

- [ ] **Step 1: Write the failing leaderboard tests**

Append to `src/views/MatrixView.test.ts`, in the sibling `describe` Task 5 added:

```ts
  it('marks a below-standard player in words, not colour alone', () => {
    // Status must never be carried by colour alone; the word is the signal.
    const w = mountMatrixWithBandedExercise();
    const flags = w.findAll('[data-below-standard]').map(f => f.text().toLowerCase());
    expect(flags.length).toBeGreaterThan(0);
    for (const f of flags) expect(f).toMatch(/below|no band/);
  });

  it('keeps every player on a banded exercise, and keeps the sort working', async () => {
    // The band emphasis is additive: it may never narrow the table.
    const w = mountMatrixWithBandedExercise();
    const before = w.findAll('[data-leaderboard-row]').length;
    expect(before).toBe(w.vm.$pinia._s.get('matrix').leaderboard.length);

    await w.find('[data-exercise-sort="earned"]').trigger('click');
    expect(w.findAll('[data-leaderboard-row]').length).toBe(before);
  });
```

`mountMatrixWithBandedExercise` is a helper you write beside the file's existing mount helper: it mounts as a coach with `matrix.exerciseFilter` set to a `time_bands` drill and a `leaderboard` seeded with at least one row whose `earned` is below its `available` and one whose `earned` equals it. Read the file's existing seeding of the matrix store and follow it; say in your report what the helper looks like.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/views/MatrixView.test.ts`
Expected: the two new cases fail, because the helper does not exist yet or the markup differs.

- [ ] **Step 3: Rewrite the leaderboard's template**

Keep the script exactly as it is and replace the template with:

```html
<template>
  <div>
    <header v-if="matrix.selectedDrill" class="lb__head">
      <p class="kicker">Exercise · {{ matrix.measure.replace('_', ' ') }}</p>
      <h2 class="lb__name">{{ matrix.selectedDrill.name }}</h2>
    </header>

    <!--
      Only for a standard. A competitive exercise gets no summary, because
      spread across the squad is the point there rather than a shortfall.
    -->
    <div
      v-if="matrix.isThreshold && matrix.leaderboard.length"
      class="standard" data-standard-summary
    >
      <p class="kicker standard__kicker">Match-readiness standard, not a ranking</p>
      <p class="standard__line">
        <template v-if="matrix.shortOfStandard.length">
          <span class="standard__count tnum">{{ matrix.shortOfStandard.length }}</span>
          of {{ matrix.measuredCount }} measured
          {{ matrix.shortOfStandard.length === 1 ? 'player is' : 'players are' }}
          below the standard. The rest have cleared it.
        </template>
        <template v-else>
          All {{ matrix.measuredCount }} measured
          {{ matrix.measuredCount === 1 ? 'player meets' : 'players meet' }}
          the standard.
        </template>
      </p>
    </div>

    <p v-if="matrix.leaderboard.length === 0" class="empty" data-leaderboard-empty>
      No results recorded for
      {{ matrix.selectedDrill ? matrix.selectedDrill.name : 'this exercise' }} yet.
    </p>

    <div v-else class="wrap">
      <table class="lb" data-exercise-leaderboard>
        <thead>
          <tr>
            <th
              v-for="c in columns" :key="c.key"
              :class="{ 'is-text': c.text }"
              :title="`Sort by ${c.label}`"
              :aria-sort="matrix.exerciseSort.by === c.key
                ? (matrix.exerciseDescends(c.key) ? 'descending' : 'ascending')
                : undefined"
            >
              <button
                type="button" class="th-btn"
                :data-exercise-sort="c.key" @click="matrix.setExerciseSort(c.key)"
              >{{ c.label }}{{ arrow(c.key) }}</button>
            </th>
            <th title="Points available from this exercise">Of</th>
            <th v-if="matrix.isThreshold">Standard</th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="r in matrix.leaderboard" :key="r.playerId"
            :data-standing="standing(r)"
            data-leaderboard-row
          >
            <td class="tnum muted">{{ r.recordingNumber != null ? r.recordingNumber : '—' }}</td>
            <td class="is-text">{{ r.name }}</td>
            <td class="tnum">
              <template v-if="isWinLoss">{{ r.wins }} - {{ r.draws }} - {{ r.losses }}</template>
              <template v-else>{{ best(r) }}</template>
            </td>
            <td class="tnum points">{{ r.earned.toFixed(2) }}</td>
            <td class="tnum muted">{{ r.available.toFixed(2) }}</td>
            <td v-if="matrix.isThreshold" class="tnum">
              <span
                v-if="standing(r) === 'below' || standing(r) === 'missed'"
                class="mark mark--short" data-below-standard
              >{{ standing(r) === 'missed' ? 'no band' : '△ below' }}</span>
              <span v-else-if="standing(r) === 'met'" class="mark">met</span>
              <span v-else class="mark mark--none">—</span>
            </td>
          </tr>
        </tbody>
      </table>

      <p class="foot">
        Below-standard players are marked in words as well as colour, and stay
        where the sort puts them. The table is never narrowed — a squad where
        everyone passes is a fit squad, not a broken exercise.
      </p>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Replace the leaderboard's styles**

```css
.lb__head { margin-bottom: var(--space-3); }

.lb__name {
  margin-top: 6px;
  font-family: var(--heading-face);
  font-weight: 400;
  font-size: 25px;
  line-height: 1.15;
  color: var(--ink);
}

.standard {
  margin-bottom: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius-md);
}

.standard__kicker { color: var(--rule-strong); }
.standard__line { margin-top: 8px; font-size: 13.5px; line-height: 1.4; color: var(--ink); }
.standard__count { font-family: var(--heading-face); font-size: 34px; line-height: 1; margin-right: 6px; }

.wrap { overflow-x: auto; }
.lb { width: 100%; border-collapse: collapse; font-size: 13px; }

.lb th, .lb td {
  padding: 9px 8px;
  border-bottom: 1px solid var(--rule);
  text-align: right;
  white-space: nowrap;
}

.lb th { border-bottom-color: var(--rule-strong); }
.lb th.is-text, .lb td.is-text { text-align: left; }

.lb th {
  color: var(--ink-muted);
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.th-btn {
  padding: 0; border: 0; background: none; color: inherit;
  font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer;
}

.th-btn:hover { color: var(--ink); }

.tnum { font-variant-numeric: tabular-nums; }
.muted { color: var(--ink-muted); }
.points { font-family: var(--heading-face); font-size: 16px; color: var(--ink); }

/* Marked, never moved: the row stays exactly where the chosen sort puts it. */
.mark { font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-muted); }
.mark--short { color: var(--color-warning); }
.mark--none { color: var(--ink-soft); }

.foot {
  padding: var(--space-3) 0 0;
  font-size: 11.5px;
  line-height: 1.55;
  font-style: italic;
  color: var(--ink-muted);
}

.empty { padding: var(--space-8) var(--space-3); text-align: center; color: var(--ink-muted); }

@media (max-width: 767.98px) {
  .lb td.is-text, .lb th.is-text { position: sticky; left: 0; background: var(--ground); }
}
```

- [ ] **Step 5: Retoken the six remaining components**

For each of `PlayerBreakdownModal.vue`, `ResultsPanel.vue`, `SessionHistory.vue`, `WeightsModal.vue`, `SquadReportModal.vue` and `ProgressModal.vue`, change **only** the `<style scoped>` block, leaving every template and script untouched. Apply this mapping to every declaration:

| Current | Becomes |
| --- | --- |
| `var(--bhs-navy-border)` | `var(--rule)` |
| `var(--bhs-navy-bg)` | `var(--surface-deep)` |
| `var(--bhs-navy-card)` | `var(--surface)` |
| `var(--bhs-cyan-accent)` | `var(--live)` |
| `var(--bhs-gold-accent)` | `var(--rule-strong)` |
| `var(--text-muted, #94a3b8)` and `var(--text-muted)` | `var(--ink-muted)` |
| `var(--color-danger, #f87171)` | `var(--color-danger)` |
| any remaining literal hex | the nearest token above; if none fits, report it rather than inventing one |

Two exceptions, because they carry meaning rather than decoration: a rule whose colour distinguishes a *below-standard* or *warning* state uses `var(--color-warning)`, and one that marks a *destructive* control uses `var(--color-danger)`.

After each file, run its own test file to confirm nothing moved.

- [ ] **Step 6: Run the tests and the three gates**

Run: `npx vitest run src/views/MatrixView.test.ts src/components/matrix src/design-tokens.test.ts` → PASS. Three gates exit 0.

Then: `grep -rn -- '--bhs-\|--text-muted' src/components/matrix src/views/MatrixView.vue` must return nothing.

- [ ] **Step 7: Commit**

```bash
git add src/components/matrix src/views/MatrixView.test.ts
git commit -m "feat: the leaderboard's standard box, and the panels on the ledger

The band summary reports how many fell short and marks them in words; the
table keeps every player and every sort, which was the condition on the
emphasis existing at all. The five remaining panels take the tokens.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: The phase gate

**Files:**
- Modify: `docs/superpowers/specs/2026-09-07-mobile-restyle-design.md` (one line)

- [ ] **Step 1: Run the three gates for the whole phase**

```bash
npm test > /dev/null 2>&1; echo "TEST EXIT=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK EXIT=$?"
npm run build > /dev/null 2>&1; echo "BUILD EXIT=$?"
```

All three print `0`. Then run `npm test 2>&1 | tail -6` and record the counts.

- [ ] **Step 2: Confirm the exit conditions**

Run each and record its exact output:

- `grep -rln -- '--bhs-\|--text-muted' src/components/matrix src/components/layout src/views/MatrixView.vue src/views/SessionEntryView.vue src/views/LineupView.vue src/views/LiveMatchView.vue` returns nothing.
- `git grep -n "SessionModal" src | wc -l` is 0.
- `grep -n "ground: 'ledger'" src/router/index.ts` names both the season report and the matrix and session-entry routes.

- [ ] **Step 3: Note the phase in the spec**

In the spec's §9 list, append to the line beginning `4. **Ratings.**`:

```
 — done 2026-09-07; the panels became a segmented control rather than routes, and subjectState/ToolNotice replaced the duplicated route-view states phase 3 left behind.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-07-mobile-restyle-design.md
git commit -m "docs: phase 4 of the restyle is done

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review against the spec

- §4 routes: session entry at `/matrix/session/:drillId` with `?session=` for editing, coach-guarded, ledger ground, tool chrome; cold arrival loads the drills and the roster; an unknown drill is refused — Task 3.
- §5.3 board: kicker, heading, the org and counts line, the segmented control, hairline rows with rank in `--mark`, recording number, points and exercise count, no cut-off — Tasks 4 and 5.
- §5.3 exercise leaderboard: the kicker and name header, the `--rule-strong` standard box counting those below, word marks rather than colour alone, the table never narrowed and the sort never disabled — Task 6.
- §5.3 player breakdown and the remaining panels: ledger tokens, no layout change — Task 6.
- §5.3 session entry: the unit banner per measure, 48px right-aligned fields, the footer tally, the refused card keeping the typed values, and the three paper-beating behaviours untouched — Tasks 2 and 3.
- §6 widths: 64rem measure on the ratings page; the name column sticky under 768px on both tables — Tasks 5 and 6.
- §8 testing: route and guard cases for session entry — Task 3; component tests for the session view's three states and its two open paths — Task 3; the panel resolution — Task 4; the board's tabs and the leaderboard's additive emphasis — Tasks 5 and 6; `subjectState` and `ToolNotice` — Task 1.
- Phase 3's deferred items: the duplicated view logic, the double navigation and the missing navigation test — Task 1.

Placeholder scan: every code step carries its code. Four steps tell the implementer to read an existing helper and adapt (the session grid's mount helper, `MatrixView`'s mount helper, `openExisting`'s signature, the four modal prop lists) and each says to report what it found — those are real ambiguities in existing code rather than gaps in the plan. Task 3 creates the session view as a placeholder before filling it in, and says so.

Type consistency: `subjectState` takes `{ settled, id, found, idOptional? }` and returns `'loading' | 'missing' | 'ready'` (Task 1), which Tasks 1 and 3 both call that way. `ToolNotice` takes `kind`, `message`, `backTo`, `backLabel?` (Task 1) and is used with exactly those in Tasks 1 and 3. `entryFormat` returns `{ figure, note } | null` and `entryTally` returns `{ timed, absent, remaining }` (Task 2), which Task 3's template reads as `format.figure`, `format.note`, `tally.timed`, `tally.absent`, `tally.remaining`. `visiblePanels` and `panelFor` (Task 4) are what Task 5's script calls. `matrix.isThreshold`, `shortOfStandard` and `measuredCount` are existing store members Task 6 reads unchanged.
