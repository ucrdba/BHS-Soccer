# Vue Migration Phase 0, Clusters 1–2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the schedule, matrix-board and matrix-session logic out of the `BHSSoccerApp` prototype into framework-free modules under `src/domain/`, with tests that import them directly, while the legacy app keeps running unchanged.

**Architecture:** Each extracted function becomes a pure export in `src/domain/` taking its data as parameters instead of reading `this.data`. `src/main.ts` publishes each module as a namespace on `window`, reusing the pattern it already applies to `plusMinus`, `seasonStats` and `plusMinusImport`. The corresponding prototype method shrinks to a one-line delegation, so `public/js/` behaves identically without being able to import.

**Tech Stack:** TypeScript (`strict: false`), Vitest, Vite. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-05-vue-migration-design.md`

## Scope of this plan

The spec sequences Phase 0 as six clusters. **This plan covers clusters 1 and 2 only** — `domain/schedule.ts`, `domain/matrix.ts`, `domain/matrix-session.ts`. Clusters 3–6 (`lineup`, `plus-minus-court`, the reports group, and `roster`/`csv`/`upsert`) get a follow-on plan once this pattern is proven against the two best-tested clusters. Each task below leaves the repository green and shippable on its own.

## Global Constraints

- **No Vue.** Not a dependency, not a component, not a build change. (Spec: Non-goals.)
- **No behavioural change.** Where extraction reveals a bug, record it in the commit message and leave it alone. (Spec: Non-goals.)
- **No redesign.** The UI is untouched.
- `tsconfig.json` stays loose — `strict: false`, `noImplicitAny: false`. Do not tighten it. (CLAUDE.md: Conventions.)
- Extracted functions are **side-effect free**: no DOM, no `localStorage`, no Supabase, no `this`.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `refactor:`).
- Every commit must pass all four gates: `npm test`, `npm run typecheck`, `npm run build`, and `powershell -File check_syntax.ps1`.
- The test count must never drop below the current **1,684**.

## The shim pattern, used by every task

This is the mechanism the whole plan rests on. Read it once; each task refers back to it.

**1. The domain module** (`src/domain/x.ts`) takes data as parameters:

```ts
export function getNextMatch(schedule, now = Date.now()) { /* ... */ }
```

**2. `src/main.ts` publishes the namespace.** It already does exactly this for the replay engine at the bottom of the file:

```ts
import * as scheduleDomain from './domain/schedule';
(window as any).scheduleDomain = scheduleDomain;
```

**3. The prototype method delegates**, keeping its original name and call signature so no caller in `index.html` or any view template changes:

```js
getNextMatch() {
  return window.scheduleDomain.getNextMatch(this.data.schedule || []);
},
```

**4. Legacy tests that still eval the modified file need the global.** They build a fake `window` by hand, which will not have `scheduleDomain` on it, and the delegation will throw. Each affected test gets two lines added to its setup:

```ts
import * as scheduleDomain from '../domain/schedule';
// ...inside the existing beforeAll/beforeEach that builds the fake window:
w.scheduleDomain = scheduleDomain;
```

This is the "import swap" the spec describes. It is mechanical, and each task below names the exact files that need it.

---

### Task 1: `domain/schedule.ts`

Extracts the six fixture-date functions from `public/js/utils.js`. These read `this.data.schedule` and call each other through `this`; the module versions take `schedule` as a parameter and call each other directly.

**Files:**
- Create: `src/domain/schedule.ts`
- Create: `src/domain/schedule.test.ts`
- Modify: `public/js/utils.js:133-283` (the six method bodies)
- Modify: `src/main.ts` (publish the namespace)
- Modify: `src/data/next-match.test.ts` (migrate), `src/data/top-banner.test.ts`, `src/data/email-link.test.ts`, `src/data/nav-drawer.test.ts` (add the global)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  export type ScheduleState = 'upcoming' | 'empty' | 'complete' | 'stale';
  export interface Countdown { days: string; hours: string; mins: string }

  export function parseMatchDateTime(dateStr: string, timeStr?: string): Date | null;
  export function matchDateTime(m: any): Date | null;
  export function getNextMatch(schedule: any[], now?: number): any | null;
  export function scheduleState(schedule: any[], now?: number): ScheduleState;
  export function lastPlayedMatch(schedule: any[]): any | null;
  export function nextMatchCountdown(schedule: any[], now?: Date): Countdown | null;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/domain/schedule.test.ts`. These cases are ported from the behaviours `src/data/next-match.test.ts` already proves — the free-text date parsing, the three-hour grace period, and the four schedule states.

```ts
/**
 * Fixture dates and what counts as the next match.
 *
 * match_date is a TEXT column holding 'AUG 28, 2026' and 'SEP 4 2026' alike,
 * so every comparison happens on parsed dates and never on strings: 'SEP 11'
 * sorts before 'SEP 4' alphabetically.
 */
import { describe, it, expect } from 'vitest';
import {
  parseMatchDateTime, matchDateTime, getNextMatch,
  scheduleState, lastPlayedMatch, nextMatchCountdown
} from './schedule';

const at = (iso: string) => new Date(iso).getTime();

describe('parseMatchDateTime', () => {
  it('reads the app\'s own "MON D YYYY" format', () => {
    expect(parseMatchDateTime('SEP 4 2026', '6:00 PM'))
      .toEqual(new Date(2026, 8, 4, 18, 0));
  });

  it('strips commas', () => {
    expect(parseMatchDateTime('AUG 28, 2026', '4:30 PM'))
      .toEqual(new Date(2026, 7, 28, 16, 30));
  });

  it('defaults to a 6pm kickoff when no time is given', () => {
    expect(parseMatchDateTime('SEP 4 2026', ''))
      .toEqual(new Date(2026, 8, 4, 18, 0));
  });

  it('reads midnight as 00:00, not noon', () => {
    expect(parseMatchDateTime('SEP 4 2026', '12:00 AM'))
      .toEqual(new Date(2026, 8, 4, 0, 0));
  });

  it('returns null for an empty date', () => {
    expect(parseMatchDateTime('', '6:00 PM')).toBeNull();
  });
});

describe('matchDateTime', () => {
  it('prefers the trigger-derived match_on over the free text', () => {
    expect(matchDateTime({ matchOn: '2026-09-04', kickoffTime: '19:30', date: 'NONSENSE' }))
      .toEqual(new Date(2026, 8, 4, 19, 30));
  });

  it('reads a bare ISO date in local time, not UTC', () => {
    // new Date('2026-09-04') is UTC midnight, which is 3 Sep west of Greenwich.
    expect(matchDateTime({ matchOn: '2026-09-04' }).getDate()).toBe(4);
  });

  it('falls back to the text columns when match_on is absent', () => {
    expect(matchDateTime({ date: 'SEP 4 2026', time: '6:00 PM' }))
      .toEqual(new Date(2026, 8, 4, 18, 0));
  });
});

describe('getNextMatch', () => {
  const sched = [
    { id: 'later', date: 'SEP 11 2026', time: '6:00 PM', status: 'SCHEDULED' },
    { id: 'sooner', date: 'SEP 4 2026', time: '6:00 PM', status: 'SCHEDULED' },
    { id: 'done', date: 'AUG 28 2026', time: '6:00 PM', status: 'COMPLETED' }
  ];

  it('picks the earliest by date, not by row order', () => {
    expect(getNextMatch(sched, at('2026-09-01T12:00:00')).id).toBe('sooner');
  });

  it('ignores completed fixtures', () => {
    expect(getNextMatch(sched, at('2026-08-27T12:00:00')).id).toBe('sooner');
  });

  it('keeps a match "next" for three hours after kickoff', () => {
    // 7pm on the day of a 6pm kickoff: still in progress.
    expect(getNextMatch(sched, at('2026-09-04T19:00:00')).id).toBe('sooner');
  });

  it('moves on once the grace period expires', () => {
    expect(getNextMatch(sched, at('2026-09-04T22:00:00')).id).toBe('later');
  });

  it('falls back to an unparseable fixture rather than declaring the season over', () => {
    const odd = [{ id: 'odd', date: 'sometime in spring', status: 'SCHEDULED' }];
    expect(getNextMatch(odd, at('2026-09-01T12:00:00')).id).toBe('odd');
  });

  it('returns null when nothing is left', () => {
    expect(getNextMatch([], at('2026-09-01T12:00:00'))).toBeNull();
  });
});

describe('scheduleState', () => {
  const past = { date: 'AUG 28 2026', time: '6:00 PM' };
  const now = at('2026-09-01T12:00:00');

  it('is "upcoming" when a fixture lies ahead', () => {
    expect(scheduleState([{ ...past, date: 'SEP 4 2026', status: 'SCHEDULED' }], now))
      .toBe('upcoming');
  });

  it('is "empty" with no fixtures at all', () => {
    expect(scheduleState([], now)).toBe('empty');
  });

  it('is "complete" only when every fixture is written up', () => {
    expect(scheduleState([{ ...past, status: 'COMPLETED' }], now)).toBe('complete');
  });

  it('is "stale" when past fixtures were never marked complete', () => {
    // The season is not over; the schedule has just run out.
    expect(scheduleState([{ ...past, status: 'SCHEDULED' }], now)).toBe('stale');
  });
});

describe('lastPlayedMatch', () => {
  it('returns the most recent fixture by date', () => {
    const sched = [
      { id: 'old', date: 'AUG 21 2026', time: '6:00 PM' },
      { id: 'recent', date: 'AUG 28 2026', time: '6:00 PM' }
    ];
    expect(lastPlayedMatch(sched).id).toBe('recent');
  });

  it('returns null when no fixture has a readable date', () => {
    expect(lastPlayedMatch([{ id: 'x', date: '' }])).toBeNull();
  });
});

describe('nextMatchCountdown', () => {
  const sched = [{ id: 'n', date: 'SEP 4 2026', time: '6:00 PM', status: 'SCHEDULED' }];

  it('counts down in zero-padded days, hours and minutes', () => {
    expect(nextMatchCountdown(sched, new Date(2026, 8, 2, 16, 30)))
      .toEqual({ days: '02', hours: '01', mins: '30' });
  });

  it('reads all zeroes once the target has passed', () => {
    expect(nextMatchCountdown(sched, new Date(2026, 8, 4, 19, 0)))
      .toEqual({ days: '00', hours: '00', mins: '00' });
  });

  it('is null when there is no next match', () => {
    expect(nextMatchCountdown([], new Date(2026, 8, 2))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/schedule.test.ts`
Expected: FAIL — `Failed to resolve import "./schedule"`.

- [ ] **Step 3: Write `src/domain/schedule.ts`**

Move the bodies from `public/js/utils.js:133-283` verbatim, with three changes: `this.data.schedule` becomes the `schedule` parameter, `this.matchDateTime(...)` and `this.parseMatchDateTime(...)` become direct calls, and `Date.now()` becomes the injected `now`. Keep every explanatory comment — they record bugs already fixed.

```ts
/**
 * Fixture dates, and which match is next.
 *
 * Extracted from public/js/utils.js during the Vue migration (Phase 0). The
 * behaviour is unchanged; the data arrives as parameters instead of through
 * `this.data`.
 */

export type ScheduleState = 'upcoming' | 'empty' | 'complete' | 'stale';
export interface Countdown { days: string; hours: string; mins: string }

/** A match stays "next" for a few hours after kickoff, so the site does not
 *  flip to the following fixture while the game is still being played. */
const GRACE_MS = 3 * 60 * 60 * 1000;

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
};

export function parseMatchDateTime(dateStr: string, timeStr?: string): Date | null {
  if (!dateStr) return null;
  const combined = `${dateStr} ${timeStr || ''}`.trim();
  const parsed = new Date(combined);
  if (!isNaN(parsed.getTime())) return parsed;

  try {
    const parts = dateStr.replace(/,/g, '').split(/\s+/);
    if (parts.length >= 3) {
      const monthIndex = MONTHS[parts[0].substring(0, 3).toUpperCase()];
      const day = parseInt(parts[1]);
      const year = parseInt(parts[2]);

      let hours = 18, minutes = 0;
      if (timeStr) {
        const timeMatch = timeStr.match(/(\d+):?(\d+)?\s*(AM|PM)?/i);
        if (timeMatch) {
          hours = parseInt(timeMatch[1]);
          minutes = parseInt(timeMatch[2] || '0');
          const ampm = (timeMatch[3] || '').toUpperCase();
          if (ampm === 'PM' && hours < 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;
        }
      }
      if (monthIndex !== undefined && !isNaN(day) && !isNaN(year)) {
        return new Date(year, monthIndex, day, hours, minutes);
      }
    }
  } catch (e) { /* fall through to null */ }
  return null;
}

/**
 * When a fixture happens, as a Date.
 *
 * Prefers match_on/kickoff_time, which a database trigger derives from the
 * text columns (migration 0008) and which are therefore already normalised.
 * Falls back to parsing the free text, so the app still works against a
 * database where 0008 has not been applied.
 */
export function matchDateTime(m: any): Date | null {
  if (!m) return null;
  if (m.matchOn) {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(m.matchOn));
    if (d) {
      // Split rather than new Date(iso): a bare ISO date parses as UTC and
      // lands on the previous evening west of Greenwich, which would show
      // the wrong day for every fixture.
      const t = /^(\d{2}):(\d{2})/.exec(String(m.kickoffTime || ''));
      return new Date(
        Number(d[1]), Number(d[2]) - 1, Number(d[3]),
        t ? Number(t[1]) : 18, t ? Number(t[2]) : 0
      );
    }
  }
  return parseMatchDateTime(m.date, m.time);
}

/**
 * The next match by DATE, not by row order.
 *
 * This used to be `schedule.find(m => m.status !== 'COMPLETED')`, which
 * returns whichever row happens to sit first in the array. fetchSchedule
 * orders by created_at, so that was really "the fixture typed in first" --
 * and match_date is a TEXT column, so even ordering by it would put SEP 11
 * before SEP 4.
 */
export function getNextMatch(schedule: any[], now: number = Date.now()): any | null {
  const candidates = (schedule || []).filter(m => m && m.status !== 'COMPLETED');
  if (candidates.length === 0) return null;

  const dated: { m: any; t: number }[] = [];
  const undated: any[] = [];
  candidates.forEach(m => {
    const t = matchDateTime(m);
    if (t) dated.push({ m, t: t.getTime() });
    else undated.push(m);
  });

  const upcoming = dated.filter(x => x.t + GRACE_MS > now).sort((a, b) => a.t - b.t);
  if (upcoming.length) return upcoming[0].m;

  // Nothing we could read is still ahead. A row whose date would not parse
  // might be, so it beats announcing the season is over on a parse failure.
  return undated.length ? undated[0] : null;
}

/**
 * Why there is no next match, when there isn't one.
 *
 * The home page used to have two states -- a fixture, or "SEASON COMPLETE" --
 * so every other reason read as the season being over. At the start of a
 * season, with one past friendly on the books and the rest of the fixtures
 * not yet entered, that is precisely backwards.
 */
export function scheduleState(schedule: any[], now: number = Date.now()): ScheduleState {
  const rows = (schedule || []).filter(m => m);
  if (getNextMatch(rows, now)) return 'upcoming';
  if (rows.length === 0) return 'empty';
  // Every fixture on record has been played AND written up.
  if (rows.every(m => m.status === 'COMPLETED')) return 'complete';
  // Fixtures exist and are in the past, but were never marked COMPLETED.
  // The season is not over; the schedule has just run out.
  return 'stale';
}

/** The most recent match already played, for the 'stale' message. */
export function lastPlayedMatch(schedule: any[]): any | null {
  const dated = (schedule || [])
    .filter(m => m)
    .map(m => ({ m, t: matchDateTime(m) }))
    .filter(x => x.t)
    .sort((a, b) => (b.t as Date).getTime() - (a.t as Date).getTime());
  return dated.length ? dated[0].m : null;
}

export function nextMatchCountdown(schedule: any[], now: Date = new Date()): Countdown | null {
  const nextMatch = getNextMatch(schedule, now.getTime());
  if (!nextMatch) return null;

  const targetDate = parseMatchDateTime(nextMatch.date, nextMatch.time);
  if (!targetDate) return null;

  const diffMs = targetDate.getTime() - now.getTime();
  if (diffMs <= 0) return { days: '00', hours: '00', mins: '00' };

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / (3600 * 24));
  const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);

  return {
    days: String(days).padStart(2, '0'),
    hours: String(hours).padStart(2, '0'),
    mins: String(mins).padStart(2, '0')
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/domain/schedule.test.ts`
Expected: PASS, 20 tests.

If `nextMatchCountdown` fails its first case, check the grace period: `getNextMatch` is called with `now.getTime()`, so a fixture inside its three-hour window is still returned and the countdown correctly reads zeroes.

- [ ] **Step 5: Publish the namespace from `src/main.ts`**

Add the import alongside the existing ones at the top:

```ts
import * as scheduleDomain from './domain/schedule';
```

And the assignment beside the existing `plusMinus` block near the bottom:

```ts
/**
 * Fixture-date logic, for the classic scripts.
 *
 * Same reason as the replay engine above: it is pure logic worth testing
 * directly, and public/js/ cannot import.
 */
(window as any).scheduleDomain = scheduleDomain;
```

- [ ] **Step 6: Replace the six method bodies in `public/js/utils.js`**

Each keeps its name and signature so no caller changes. Replace lines 133-283 — that is `parseMatchDateTime` through `getNextMatchCountdown`, leaving `updateCountdownUI` and everything after it untouched.

```js
  parseMatchDateTime(dateStr, timeStr) {
    return window.scheduleDomain.parseMatchDateTime(dateStr, timeStr);
  },

  matchDateTime(m) {
    return window.scheduleDomain.matchDateTime(m);
  },

  getNextMatch() {
    return window.scheduleDomain.getNextMatch(this.data.schedule || []);
  },

  scheduleState() {
    return window.scheduleDomain.scheduleState(this.data.schedule || []);
  },

  lastPlayedMatch() {
    return window.scheduleDomain.lastPlayedMatch(this.data.schedule || []);
  },

  getNextMatchCountdown() {
    return window.scheduleDomain.nextMatchCountdown(this.data.schedule || []);
  },
```

Note the one rename: the module calls it `nextMatchCountdown`, the prototype method stays `getNextMatchCountdown` because `index.html` and the home view call it by that name.

- [ ] **Step 7: Give the four legacy tests the global**

`src/data/next-match.test.ts`, `top-banner.test.ts`, `email-link.test.ts` and `nav-drawer.test.ts` all eval `utils.js` against a hand-built fake `window`, which now needs `scheduleDomain` or the delegation throws.

In each file, add the import at the top:

```ts
import * as scheduleDomain from '../domain/schedule';
```

and this line inside the existing setup block that assigns to the fake window (in `nav-drawer.test.ts` that is the `beforeAll` at line 21; in the others find the assignment of `w.window` or `globalThis.window`):

```ts
(globalThis as any).scheduleDomain = scheduleDomain;
```

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS, at least 1,684 tests. `next-match.test.ts` still passes because the delegation produces identical results.

- [ ] **Step 9: Run the other three gates**

```bash
npm run typecheck
npm run build
powershell -File check_syntax.ps1
```

Expected: all pass. The build matters most here — `main.ts` gained an import, and only a real build resolves it.

- [ ] **Step 10: Commit**

```bash
git add src/domain/schedule.ts src/domain/schedule.test.ts src/main.ts public/js/utils.js src/data/next-match.test.ts src/data/top-banner.test.ts src/data/email-link.test.ts src/data/nav-drawer.test.ts
git commit -m "refactor: extract fixture-date logic into src/domain/schedule.ts

First extraction of Vue migration Phase 0. The six schedule functions
move out of the prototype into a framework-free module that takes the
schedule as a parameter, published on window the way the plus/minus
replay engine already is so public/js can still reach them.

Behaviour is unchanged; the new tests import the module directly rather
than evaluating utils.js through ?raw.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `domain/matrix.ts`

Extracts the overall-board and single-exercise leaderboard logic from `public/js/views/matrix.view.js`. The two `set*Sort` methods are the mutating case the spec calls out: the pure part becomes `nextSortState`, the assignment stays in the view.

**Files:**
- Create: `src/domain/matrix.ts`
- Create: `src/domain/matrix.test.ts`
- Modify: `public/js/views/matrix.view.js:24-287`
- Modify: `src/main.ts`
- Modify: the eight tests listed in Step 7

**Interfaces:**
- Consumes: the shim pattern from Task 1. Nothing else.
- Produces:
  ```ts
  export interface MatrixContext {
    points: any[];        // rows from matrix_exercise_points
    players: any[];
    drillsBank: any[];
  }
  export interface SortState { by: string; reversed: boolean }

  export function exerciseLeaderboard(ctx: MatrixContext, drillId: string, sortBy?: string, reversed?: boolean): any[];
  export function compareExerciseRows(x: any, y: any, sortBy: string, timed: boolean, reversed: boolean): number;
  export function exercisesWithResults(ctx: MatrixContext): any[];
  export function matrixBoardRows(players: any[], by?: string, reversed?: boolean): any[];
  export function compareBoardRows(x: any, y: any, by: string, reversed: boolean): number;
  export function boardSortDescends(by: string): boolean;
  export function exerciseSortDescends(by: string, timed: boolean): boolean;
  export function nextSortState(current: SortState, by: string): SortState;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/domain/matrix.test.ts`. The fixtures mirror those in `src/data/exercise-leaderboard.test.ts` so the ported behaviour is directly comparable.

```ts
/**
 * The Competitive Matrix boards.
 *
 * The board answers "who is ahead overall". A coach also wants "who is best
 * at Coopers", and those are different questions with different natural
 * answers: wins for a head-to-head drill, the highest count for a counted
 * one, the FASTEST time for a timed one. Ranking a timed exercise by highest
 * value puts the slowest player top, and it looks like a leaderboard either
 * way.
 */
import { describe, it, expect } from 'vitest';
import {
  exerciseLeaderboard, exercisesWithResults, matrixBoardRows,
  boardSortDescends, exerciseSortDescends, nextSortState
} from './matrix';

const COOPERS = 'd-coopers';   // count_high
const LAPS = 'd-laps';         // time_bands
const SMALL = 'd-small';       // win_loss

const ctx = (points: any[]) => ({
  points,
  players: [
    { id: 'p1', name: 'Cesar Alva', recordingNumber: 1 },
    { id: 'p2', name: 'Tom Budde', recordingNumber: 4 },
    { id: 'p3', name: 'Alain Renteria', recordingNumber: 18 }
  ],
  drillsBank: [
    { id: COOPERS, name: 'Coopers', measure: 'count_high' },
    { id: LAPS, name: '3 Laps', measure: 'time_bands' },
    { id: SMALL, name: 'Small Sided', measure: 'win_loss' }
  ]
});

const row = (over: any) => ({
  player_id: 'p1', drill_id: COOPERS, raw_value: null, weight: 1,
  earned: 0, available: 1, w: 0, dr: 0, ls: 0, ...over
});

describe('exerciseLeaderboard', () => {
  it('takes the HIGHEST value as a personal best for a counted exercise', () => {
    const rows = exerciseLeaderboard(ctx([
      row({ raw_value: 40 }), row({ raw_value: 55 })
    ]), COOPERS);
    expect(rows[0].best).toBe(55);
  });

  it('takes the LOWEST value as a personal best for a timed exercise', () => {
    const rows = exerciseLeaderboard(ctx([
      row({ drill_id: LAPS, raw_value: 190 }),
      row({ drill_id: LAPS, raw_value: 172 })
    ]), LAPS);
    expect(rows[0].best).toBe(172);
  });

  it('ranks a timed exercise fastest-first when sorted by best', () => {
    const rows = exerciseLeaderboard(ctx([
      row({ drill_id: LAPS, player_id: 'p1', raw_value: 200 }),
      row({ drill_id: LAPS, player_id: 'p2', raw_value: 170 })
    ]), LAPS, 'best');
    expect(rows.map(r => r.playerId)).toEqual(['p2', 'p1']);
  });

  it('does not count a null value as an attempt', () => {
    const rows = exerciseLeaderboard(ctx([
      row({ raw_value: null }), row({ raw_value: 40 })
    ]), COOPERS);
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].best).toBe(40);
  });

  it('still counts a null value against available points', () => {
    const rows = exerciseLeaderboard(ctx([
      row({ raw_value: null, earned: 0, available: 3 })
    ]), COOPERS);
    expect(rows[0].available).toBe(3);
    expect(rows[0].share).toBe(0);
  });

  it('names a player no longer on the roster rather than showing a blank', () => {
    const rows = exerciseLeaderboard(ctx([
      row({ player_id: 'gone', raw_value: 10 })
    ]), COOPERS);
    expect(rows[0].name).toBe('Former squad member');
  });

  it('sinks a player with no best whichever way the column is sorted', () => {
    const points = [
      row({ player_id: 'p1', raw_value: null, earned: 5, available: 5 }),
      row({ player_id: 'p2', raw_value: 30, earned: 1, available: 5 })
    ];
    expect(exerciseLeaderboard(ctx(points), COOPERS, 'best')[1].playerId).toBe('p1');
    expect(exerciseLeaderboard(ctx(points), COOPERS, 'best', true)[1].playerId).toBe('p1');
  });

  it('sorts unnumbered players last, in both directions', () => {
    const c = ctx([
      row({ player_id: 'p1', raw_value: 10 }),
      row({ player_id: 'p2', raw_value: 20 })
    ]);
    c.players[1].recordingNumber = null;
    expect(exerciseLeaderboard(c, COOPERS, 'number')[1].playerId).toBe('p2');
    expect(exerciseLeaderboard(c, COOPERS, 'number', true)[1].playerId).toBe('p2');
  });

  it('is empty for an exercise with no rows', () => {
    expect(exerciseLeaderboard(ctx([]), COOPERS)).toEqual([]);
  });
});

describe('exercisesWithResults', () => {
  it('lists only exercises that have rows, alphabetically', () => {
    const out = exercisesWithResults(ctx([
      row({ drill_id: SMALL }), row({ drill_id: LAPS })
    ]));
    expect(out.map(d => d.name)).toEqual(['3 Laps', 'Small Sided']);
  });

  it('omits a retired drill', () => {
    const c = ctx([row({ drill_id: LAPS })]);
    c.drillsBank[1].is_deleted = true;
    expect(exercisesWithResults(c)).toEqual([]);
  });
});

describe('matrixBoardRows', () => {
  const players = [
    { id: 'p1', name: 'Cesar Alva', matrixStats: { earned: 50, available: 100, share: 50, rank: 2, exercises: 4 } },
    { id: 'p2', name: 'Tom Budde', matrixStats: { earned: 100, available: 100, share: 100, rank: 1, exercises: 4 } },
    { id: 'p3', name: 'Alain Renteria', matrixStats: { earned: 0, available: 0, share: null, rank: 999, exercises: 0 } }
  ];

  it('orders by rank by default', () => {
    expect(matrixBoardRows(players).map(r => r.playerId)).toEqual(['p2', 'p1', 'p3']);
  });

  it('draws the bar against the leader\'s POINTS, not their share', () => {
    const rows = matrixBoardRows(players);
    expect(rows.find(r => r.playerId === 'p1').barPct).toBe(50);
    expect(rows.find(r => r.playerId === 'p2').barPct).toBe(100);
  });

  it('sinks a player who has taken part in nothing, in both directions', () => {
    expect(matrixBoardRows(players, 'earned').at(-1).playerId).toBe('p3');
    expect(matrixBoardRows(players, 'earned', true).at(-1).playerId).toBe('p3');
  });

  it('lets an unranked player sort normally by name', () => {
    expect(matrixBoardRows(players, 'name')[0].name).toBe('Alain Renteria');
  });

  it('omits deleted players', () => {
    const withDeleted = [...players, { id: 'p4', name: 'Gone', is_deleted: true, matrixStats: {} }];
    expect(matrixBoardRows(withDeleted).some(r => r.playerId === 'p4')).toBe(false);
  });

  it('gives every player a zero bar when nobody has scored', () => {
    const none = [{ id: 'p1', name: 'A', matrixStats: { earned: 0, exercises: 0 } }];
    expect(matrixBoardRows(none)[0].barPct).toBe(0);
  });
});

describe('which way a column reads on its first click', () => {
  it('reads points and share highest-first on the board', () => {
    expect(boardSortDescends('earned')).toBe(true);
    expect(boardSortDescends('share')).toBe(true);
    expect(boardSortDescends('name')).toBe(false);
  });

  it('reads a timed best fastest-first, a counted best highest-first', () => {
    expect(exerciseSortDescends('best', true)).toBe(false);
    expect(exerciseSortDescends('best', false)).toBe(true);
  });

  it('reads names and numbers lowest-first', () => {
    expect(exerciseSortDescends('name', false)).toBe(false);
    expect(exerciseSortDescends('number', false)).toBe(false);
  });
});

describe('nextSortState', () => {
  it('reverses when the same column is clicked again', () => {
    expect(nextSortState({ by: 'earned', reversed: false }, 'earned'))
      .toEqual({ by: 'earned', reversed: true });
  });

  it('switches column and resets direction when a new one is clicked', () => {
    expect(nextSortState({ by: 'earned', reversed: true }, 'name'))
      .toEqual({ by: 'name', reversed: false });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/matrix.test.ts`
Expected: FAIL — `Failed to resolve import "./matrix"`.

- [ ] **Step 3: Write `src/domain/matrix.ts`**

The bodies come from `public/js/views/matrix.view.js` — `exerciseLeaderboard` (line 24), `compareExerciseRows` (78), `exercisesWithResults` (122), `matrixBoardRows` (157), `compareBoardRows` (194), `boardSortDescends` (227), `exerciseSortDescends` (265) — with `this._exercisePoints` becoming `ctx.points`, `this.data.*` becoming `ctx.*`, and the `this._boardSort` pair becoming parameters. `nextSortState` is new: it is the pure half of `setBoardSort` (231) and `setExerciseSort` (248), which are byte-identical apart from the fields they assign to.

```ts
/**
 * The Competitive Matrix boards.
 *
 * Extracted from public/js/views/matrix.view.js during the Vue migration
 * (Phase 0). Behaviour is unchanged; app state arrives as parameters.
 */

export interface MatrixContext {
  points: any[];        // rows as matrix_exercise_points returns them
  players: any[];
  drillsBank: any[];
}
export interface SortState { by: string; reversed: boolean }

const isTimedMeasure = (m: string) => m === 'time_low' || m === 'time_bands';

export function exerciseLeaderboard(
  ctx: MatrixContext, drillId: string, sortBy?: string, reversed?: boolean
): any[] {
  const rows = (ctx.points || []).filter(r => r.drill_id === drillId);
  if (rows.length === 0) return [];

  const drill = (ctx.drillsBank || []).find(d => d.id === drillId);
  const measure = (drill && drill.measure) || 'count_high';
  const timed = isTimedMeasure(measure);
  const byId = new Map((ctx.players || []).map(p => [p.id, p]));

  const acc: Record<string, any> = {};
  rows.forEach(r => {
    const a = acc[r.player_id] = acc[r.player_id] || {
      playerId: r.player_id,
      wins: 0, draws: 0, losses: 0,
      earned: 0, available: 0, attempts: 0,
      best: null, timed
    };

    a.wins += Number(r.w) || 0;
    a.draws += Number(r.dr) || 0;
    a.losses += Number(r.ls) || 0;
    a.earned += Number(r.earned) || 0;
    a.available += Number(r.available) || 0;

    // A row with no value is an absence or a session never filled in: it
    // counts against the points, but it is not an attempt and cannot be a
    // personal best.
    if (r.raw_value === null || r.raw_value === undefined) return;
    a.attempts += 1;
    const v = Number(r.raw_value);
    if (a.best === null) a.best = v;
    else a.best = timed ? Math.min(a.best, v) : Math.max(a.best, v);
  });

  const out = Object.values(acc).map((a: any) => {
    const p = byId.get(a.playerId);
    return {
      ...a,
      name: (p && p.name) || 'Former squad member',
      recordingNumber: p ? p.recordingNumber : null,
      share: a.available ? (100 * a.earned) / a.available : 0
    };
  });

  return out.sort((x, y) => compareExerciseRows(x, y, sortBy, timed, reversed));
}

/**
 * Order two rows of a single-exercise board.
 *
 * Points first by default -- the board's own currency, and the only figure
 * that means the same thing for every measure. A player with no figure at all
 * sorts last whichever column is chosen, so a column of blanks never leads.
 */
export function compareExerciseRows(
  x: any, y: any, sortBy: string, timed: boolean, reversed: boolean
): number {
  const by = sortBy || 'earned';
  // Reversing flips the comparison of VALUES only. Rows with nothing to
  // compare keep sinking either way -- a column of blanks must never lead
  // the board just because it was clicked twice.
  const flip = reversed ? -1 : 1;

  if (by === 'best') {
    if (x.best === null || y.best === null) {
      if (x.best === y.best) return 0;
      return x.best === null ? 1 : -1;
    }
    // Fastest first for a timed exercise; highest first for a counted one.
    return flip * (timed ? x.best - y.best : y.best - x.best);
  }

  if (by === 'wins') {
    if (y.wins !== x.wins) return flip * (y.wins - x.wins);
    return flip * (y.earned - x.earned);
  }

  if (by === 'name') {
    return flip * String(x.name || '').localeCompare(String(y.name || ''));
  }

  if (by === 'number') {
    const nx = x.recordingNumber == null ? NaN : Number(x.recordingNumber);
    const ny = y.recordingNumber == null ? NaN : Number(y.recordingNumber);
    const gx = Number.isFinite(nx), gy = Number.isFinite(ny);
    if (gx !== gy) return gx ? -1 : 1;          // unnumbered always last
    if (gx && nx !== ny) return flip * (nx - ny);
    return flip * String(x.name || '').localeCompare(String(y.name || ''));
  }

  // Default: points earned, with the best figure breaking a tie rather than
  // leaving two equal players in whatever order they happened to arrive.
  if (y.earned !== x.earned) return flip * (y.earned - x.earned);
  if (x.best !== null && y.best !== null && x.best !== y.best) {
    return flip * (timed ? x.best - y.best : y.best - x.best);
  }
  return String(x.name || '').localeCompare(String(y.name || ''));
}

/** Exercises that actually have results, for the picker. */
export function exercisesWithResults(ctx: MatrixContext): any[] {
  const ids = new Set((ctx.points || []).map(r => r.drill_id).filter(Boolean));
  return (ctx.drillsBank || [])
    .filter(d => ids.has(d.id) && !d.is_deleted && !d.isDeleted)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export function matrixBoardRows(
  players: any[], by: string = 'rank', reversed: boolean = false
): any[] {
  const live = (players || []).filter(p => !p.is_deleted && !p.isDeleted);
  // Hoisted: computing this per row would rescan every player for every row.
  const leaderPts = Math.max(0, ...live.map(x => Number(x.matrixStats?.earned || 0)));

  const rows = live.map(p => {
    const ms = p.matrixStats || {};
    const earned = Number(ms.earned || 0);
    return {
      playerId: p.id,
      name: p.name,
      recordingNumber: p.recordingNumber,
      wins: ms.wins || 0, draws: ms.draws || 0, losses: ms.losses || 0,
      games: ms.games || 0, exercises: ms.exercises || 0,
      earned,
      available: Number(ms.available || 0),
      share: (ms.share === undefined ? null : ms.share),
      rank: ms.rank || 999,
      // The bar tracks POINTS against the leader, because points are what
      // the table is ordered by by default. A bar drawn from share would
      // disagree with the ordering sitting beside it.
      barPct: leaderPts > 0 ? Math.round((earned / leaderPts) * 100) : 0
    };
  });

  return rows.sort((x, y) => compareBoardRows(x, y, by, reversed));
}

/**
 * Order two rows of the overall board.
 *
 * A player who has taken part in nothing is not last on merit and not first
 * when reversed -- there is nothing to compare. They sink either way, so a
 * block of empty rows never leads the board.
 */
export function compareBoardRows(x: any, y: any, by: string, reversed: boolean): number {
  const flip = reversed ? -1 : 1;
  const unranked = (r: any) => r.exercises === 0;

  if (by !== 'name') {
    if (unranked(x) !== unranked(y)) return unranked(x) ? 1 : -1;
  }

  if (by === 'name') {
    return flip * String(x.name || '').localeCompare(String(y.name || ''));
  }

  if (by === 'earned') {
    if (x.earned !== y.earned) return flip * (y.earned - x.earned);
    return String(x.name || '').localeCompare(String(y.name || ''));
  }

  if (by === 'share') {
    // Share is null until a player has taken part in something.
    if (x.share === null || y.share === null) {
      if (x.share === y.share) return 0;
      return x.share === null ? 1 : -1;
    }
    if (x.share !== y.share) return flip * (y.share - x.share);
    return String(x.name || '').localeCompare(String(y.name || ''));
  }

  // Default: the board's own rank, best first.
  if (x.rank !== y.rank) return flip * (x.rank - y.rank);
  return String(x.name || '').localeCompare(String(y.name || ''));
}

/** Which way a board column reads on its first click. */
export function boardSortDescends(by: string): boolean {
  return by === 'earned' || by === 'share';
}

/**
 * Which way an exercise column reads on its FIRST click.
 *
 * Points and wins read highest-first, a time reads fastest-first, and a name
 * or number reads lowest-first. Knowing this is what lets the header arrow
 * show the order actually in force rather than just "sorted".
 */
export function exerciseSortDescends(by: string, timed: boolean): boolean {
  if (by === 'name' || by === 'number') return false;
  if (by === 'best') return !timed;
  return true;                        // earned, wins
}

/**
 * Click a column to sort by it; click the same one again to reverse.
 *
 * The pure half of setBoardSort/setExerciseSort, which were identical apart
 * from which pair of fields they assigned to. The assignment stays in the
 * view; only the decision moves here.
 */
export function nextSortState(current: SortState, by: string): SortState {
  if (current.by === by) return { by, reversed: !current.reversed };
  return { by, reversed: false };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/domain/matrix.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 5: Publish the namespace from `src/main.ts`**

```ts
import * as matrixDomain from './domain/matrix';
// ...beside the other window assignments:
(window as any).matrixDomain = matrixDomain;
```

- [ ] **Step 6: Replace the method bodies in `public/js/views/matrix.view.js`**

`exerciseLeaderboard`, `compareExerciseRows`, `exercisesWithResults`, `matrixBoardRows`, `compareBoardRows`, `boardSortDescends` and `exerciseSortDescends` become delegations. Build the context object once in a private helper so the seven call sites stay short:

```js
  /** The data the matrix domain functions need, from app state. */
  _matrixCtx() {
    return {
      points: this._exercisePoints || [],
      players: this.data.players || [],
      drillsBank: this.data.drillsBank || []
    };
  },

  exerciseLeaderboard(drillId, sortBy, reversed) {
    return window.matrixDomain.exerciseLeaderboard(this._matrixCtx(), drillId, sortBy, reversed);
  },

  compareExerciseRows(x, y, sortBy, timed, reversed) {
    return window.matrixDomain.compareExerciseRows(x, y, sortBy, timed, reversed);
  },

  exercisesWithResults() {
    return window.matrixDomain.exercisesWithResults(this._matrixCtx());
  },

  matrixBoardRows() {
    return window.matrixDomain.matrixBoardRows(
      this.data.players || [], this._boardSort || 'rank', !!this._boardSortReversed);
  },

  compareBoardRows(x, y, by, reversed) {
    return window.matrixDomain.compareBoardRows(x, y, by, reversed);
  },

  boardSortDescends(by) {
    return window.matrixDomain.boardSortDescends(by);
  },

  exerciseSortDescends(by, timed) {
    return window.matrixDomain.exerciseSortDescends(by, timed);
  },
```

The two sort setters keep their assignment and their `renderCurrentView()` call, and delegate only the decision:

```js
  setBoardSort(by) {
    const next = window.matrixDomain.nextSortState(
      { by: this._boardSort, reversed: !!this._boardSortReversed }, by);
    this._boardSort = next.by;
    this._boardSortReversed = next.reversed;
    this.renderCurrentView();
  },

  setExerciseSort(by) {
    const next = window.matrixDomain.nextSortState(
      { by: this._exerciseSort, reversed: !!this._exerciseSortReversed }, by);
    this._exerciseSort = next.by;
    this._exerciseSortReversed = next.reversed;
    this.renderCurrentView();
  },
```

Leave `formatExerciseBest`, `loadExercisePoints`, `setExerciseFilter` and every `render*` method alone — they are I/O or markup and belong to later phases.

- [ ] **Step 7: Give the eight legacy tests the global**

These all eval `matrix.view.js`: `exercise-leaderboard.test.ts`, `matrix-board-sort.test.ts`, `matrix-results-panel.test.ts`, `matrix-session-entry.test.ts`, `matrix-standings-display.test.ts`, `matrix-view-numbers.test.ts`, `progress-report.test.ts`, `squad-report.test.ts`.

In each, add:

```ts
import * as matrixDomain from '../domain/matrix';
```

and, in the setup block that prepares the fake window (in `exercise-leaderboard.test.ts` that is the `beforeEach` at line 58 which assigns `globalThis.window`):

```ts
(globalThis as any).matrixDomain = matrixDomain;
```

- [ ] **Step 8: Run the full suite and the other gates**

```bash
npm test
npm run typecheck
npm run build
powershell -File check_syntax.ps1
```

Expected: all pass, no drop in test count.

- [ ] **Step 9: Commit**

```bash
git add src/domain/matrix.ts src/domain/matrix.test.ts src/main.ts public/js/views/matrix.view.js src/data/exercise-leaderboard.test.ts src/data/matrix-board-sort.test.ts src/data/matrix-results-panel.test.ts src/data/matrix-session-entry.test.ts src/data/matrix-standings-display.test.ts src/data/matrix-view-numbers.test.ts src/data/progress-report.test.ts src/data/squad-report.test.ts
git commit -m "refactor: extract the matrix boards into src/domain/matrix.ts

The overall board, the single-exercise leaderboard and their comparators
move out of the prototype. setBoardSort and setExerciseSort were
identical apart from the fields they wrote, so their shared decision
becomes nextSortState() and only the assignment stays in the view.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `domain/matrix-session.ts`

**Files:**
- Create: `src/domain/matrix-session.ts`
- Create: `src/domain/matrix-session.test.ts`
- Modify: `public/js/views/matrix-session.view.js` at lines 644, 731 and 991
- Modify: `src/main.ts`
- Modify: the thirteen tests listed in Step 6

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces:
  ```ts
  export function compareSessionPlayers(a: any, b: any, by: string, reversed: boolean): number;
  export function defaultSessionAttendance(measure: string): 'present' | 'unexcused';
  export function isTimedExercise(row: any, drillsBank: any[]): boolean;
  ```

**Note on scope.** The spec listed band rows and `sessionDrillOptions` for this module. Reading them showed the classifier was wrong: `captureBandDrafts`, `addBandRow` and `removeBandRow` reach the DOM through `readBandRows()` and `redrawWeights()`, and `sessionDrillOptions` returns `<option>` markup. They stay in the view and are deleted with it in Phase 5. This is the "inventory, not a contract" risk the spec records, and this task is the first place it bites. Three genuinely pure functions remain, and they are worth extracting because session sorting and attendance defaults are behaviour a coach notices immediately.

- [ ] **Step 1: Write the failing test**

```ts
/**
 * Matrix session entry.
 *
 * Two rules a coach notices at once: a player with no recording number sorts
 * last whichever way the column is pointed, and a timed exercise defaults
 * everyone to absent rather than present -- because a time that was never run
 * is not a slow time, and defaulting to present would silently award the
 * bottom band to a player who was not there.
 */
import { describe, it, expect } from 'vitest';
import {
  compareSessionPlayers, defaultSessionAttendance, isTimedExercise
} from './matrix-session';

const p = (name: string, recordingNumber: any) => ({ name, recordingNumber });

describe('compareSessionPlayers', () => {
  it('orders by recording number by default', () => {
    expect(compareSessionPlayers(p('Budde', 4), p('Alva', 1), '', false))
      .toBeGreaterThan(0);
  });

  it('sorts an unnumbered player last, in both directions', () => {
    expect(compareSessionPlayers(p('Nobody', null), p('Alva', 1), '', false))
      .toBeGreaterThan(0);
    expect(compareSessionPlayers(p('Nobody', null), p('Alva', 1), '', true))
      .toBeGreaterThan(0);
  });

  it('orders by name when asked', () => {
    expect(compareSessionPlayers(p('Alva', 9), p('Budde', 1), 'name', false))
      .toBeLessThan(0);
  });

  it('reverses a name sort', () => {
    expect(compareSessionPlayers(p('Alva', 9), p('Budde', 1), 'name', true))
      .toBeGreaterThan(0);
  });

  it('falls back to the name when two players share a number', () => {
    expect(compareSessionPlayers(p('Alva', 3), p('Budde', 3), '', false))
      .toBeLessThan(0);
  });
});

describe('defaultSessionAttendance', () => {
  it('defaults a timed exercise to absent', () => {
    expect(defaultSessionAttendance('time_low')).toBe('unexcused');
    expect(defaultSessionAttendance('time_bands')).toBe('unexcused');
  });

  it('defaults a counted exercise to present', () => {
    expect(defaultSessionAttendance('count_high')).toBe('present');
    expect(defaultSessionAttendance('win_loss')).toBe('present');
  });
});

describe('isTimedExercise', () => {
  const bank = [
    { id: 'd1', measure: 'time_low' },
    { id: 'd2', measure: 'count_high' },
    { id: 'd3', measure: 'time_bands' }
  ];

  it('is true for both timed measures', () => {
    expect(isTimedExercise({ drill_id: 'd1' }, bank)).toBe(true);
    expect(isTimedExercise({ drill_id: 'd3' }, bank)).toBe(true);
  });

  it('is false for a counted measure', () => {
    expect(isTimedExercise({ drill_id: 'd2' }, bank)).toBe(false);
  });

  it('is false for a drill no longer in the bank', () => {
    expect(isTimedExercise({ drill_id: 'gone' }, bank)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/matrix-session.test.ts`
Expected: FAIL — `Failed to resolve import "./matrix-session"`.

- [ ] **Step 3: Write `src/domain/matrix-session.ts`**

```ts
/**
 * Matrix session entry.
 *
 * Extracted from public/js/views/matrix-session.view.js during the Vue
 * migration (Phase 0). The band-draft and drill-picker helpers that the
 * migration spec also listed here turned out to reach the DOM, so they stay
 * in the view until it is replaced.
 */

/**
 * Order two rows of the session grid.
 *
 * A player with no recording number sinks whichever way the column points --
 * an unnumbered block must never lead the grid just because it was clicked
 * twice.
 */
export function compareSessionPlayers(a: any, b: any, by: string, reversed: boolean): number {
  const flip = reversed ? -1 : 1;

  if (by === 'name') {
    return flip * String(a.name || '').localeCompare(String(b.name || ''));
  }

  const na = a.recordingNumber == null ? NaN : Number(a.recordingNumber);
  const nb = b.recordingNumber == null ? NaN : Number(b.recordingNumber);
  const ga = Number.isFinite(na), gb = Number.isFinite(nb);
  if (ga !== gb) return ga ? -1 : 1;
  if (ga && na !== nb) return flip * (na - nb);
  return flip * String(a.name || '').localeCompare(String(b.name || ''));
}

/**
 * What the attendance dropdown reads before anybody touches it.
 *
 * A timed exercise starts everyone absent: a time that was never run is not a
 * slow time, and defaulting to present would award the bottom band to a
 * player who was not there.
 */
export function defaultSessionAttendance(measure: string): 'present' | 'unexcused' {
  return measure === 'time_low' || measure === 'time_bands' ? 'unexcused' : 'present';
}

export function isTimedExercise(row: any, drillsBank: any[]): boolean {
  const drill = (drillsBank || []).find(d => d.id === row.drill_id);
  return !!drill && (drill.measure === 'time_low' || drill.measure === 'time_bands');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/domain/matrix-session.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Publish the namespace and replace the three method bodies**

In `src/main.ts`:

```ts
import * as matrixSessionDomain from './domain/matrix-session';
// ...
(window as any).matrixSessionDomain = matrixSessionDomain;
```

In `public/js/views/matrix-session.view.js`, replace the bodies at lines 644, 731 and 991:

```js
  compareSessionPlayers(a, b, by, reversed) {
    return window.matrixSessionDomain.compareSessionPlayers(a, b, by, reversed);
  },

  defaultSessionAttendance(measure) {
    return window.matrixSessionDomain.defaultSessionAttendance(measure);
  },

  isTimedExercise(row) {
    return window.matrixSessionDomain.isTimedExercise(row, this.data.drillsBank || []);
  },
```

- [ ] **Step 6: Give the thirteen legacy tests the global**

These eval `matrix-session.view.js`: `band-rows.test.ts`, `breakdown-time.test.ts`, `drill-weight-editor.test.ts`, `matrix-results-panel.test.ts`, `matrix-session-entry.test.ts`, `measure-pickers.test.ts`, `player-breakdown.test.ts`, `session-attendance.test.ts`, `session-jump.test.ts`, `session-keys.test.ts`, `session-sort.test.ts`, `session-time-entry.test.ts`, `session-width.test.ts`.

In each, add the import and the assignment into the existing fake-window setup:

```ts
import * as matrixSessionDomain from '../domain/matrix-session';
// ...
(globalThis as any).matrixSessionDomain = matrixSessionDomain;
```

`matrix-results-panel.test.ts` and `matrix-session-entry.test.ts` eval both `matrix.view.js` and `matrix-session.view.js`, so they need `matrixDomain` from Task 2 as well. If Task 2 is already done, that line is present; confirm it rather than adding it twice.

- [ ] **Step 7: Run the full suite and the other gates**

```bash
npm test
npm run typecheck
npm run build
powershell -File check_syntax.ps1
```

Expected: all pass, no drop in test count.

- [ ] **Step 8: Run the app and confirm nothing moved**

Run: `npm run dev`

Check three things by hand, because they are what these three tasks touched: the home page shows the correct next fixture and a counting-down clock; the Player Ratings board sorts both ways when a column header is clicked twice; and a session grid opened on a timed exercise starts with players marked absent.

- [ ] **Step 9: Commit**

```bash
git add src/domain/matrix-session.ts src/domain/matrix-session.test.ts src/main.ts public/js/views/matrix-session.view.js src/data/band-rows.test.ts src/data/breakdown-time.test.ts src/data/drill-weight-editor.test.ts src/data/matrix-results-panel.test.ts src/data/matrix-session-entry.test.ts src/data/measure-pickers.test.ts src/data/player-breakdown.test.ts src/data/session-attendance.test.ts src/data/session-jump.test.ts src/data/session-keys.test.ts src/data/session-sort.test.ts src/data/session-time-entry.test.ts src/data/session-width.test.ts
git commit -m "refactor: extract session sorting and attendance defaults

Completes clusters 1 and 2 of Vue migration Phase 0.

Only three of this view's methods were genuinely pure. The band-draft
helpers the spec listed here reach the DOM through readBandRows() and
redrawWeights(), and sessionDrillOptions() returns option markup, so
they stay in the view until Phase 5 replaces it -- the first instance of
the 'inventory, not a contract' risk the design records.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## After this plan

Clusters 3–6 remain: `domain/lineup.ts` (21 methods), `domain/plus-minus-court.ts` (24 methods), the reports group (`round-robin`, `season`, `progress`, `report`, `recording-numbers`), and `domain/roster.ts` / `csv.ts` / `upsert.ts`. They get their own plan, written once this one has proven the shim pattern and the legacy-test fix-up in practice.

Two things to carry forward into that plan:

1. **Read every method before extracting it.** Task 3 lost four of its seven candidates to the classifier's false positives. Expect the same rate elsewhere, particularly in `plusminus.view.js` where `pmLoadPositions` and `pmSavePositions` touch `localStorage`.
2. **The fake-window fix-up is the real cost.** Adding one global to thirteen test files, as Task 3 does, is more work than writing the module. If clusters 3–6 hit the same ratio, consider a shared test helper that installs every domain namespace at once.
