/**
 * Tests for next-match selection.
 *
 * The bug: the home view and the countdown each did
 * `schedule.find(m => m.status !== 'COMPLETED')`, which returns whichever row
 * sits first in the array. fetchSchedule orders by created_at, so "next match"
 * really meant "the fixture entered first". A match played two days ago but
 * never marked COMPLETED stayed pinned to the home page as NEXT MATCH, with
 * the countdown stuck at 00/00/00 because its target had already passed.
 *
 * match_date is a TEXT column holding values like 'AUG 28, 2026' and
 * 'SEP 4 2026' - inconsistent, and alphabetically 'SEP 11' sorts before
 * 'SEP 4'. So the comparison has to happen on parsed dates, never on strings.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import utilsSrc from '../../public/js/utils.js?raw';

interface MatchApp {
  data: Record<string, any>;
  getNextMatch(): any;
  getNextMatchCountdown(): { days: string; hours: string; mins: string } | null;
  parseMatchDateTime(d: string, t: string): Date | null;
}

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

// The season the live data sits in; "today" is fixed so these never rot.
const NOW = new Date(2026, 7, 30, 12, 0, 0); // 30 Aug 2026, midday

let app: MatchApp;

const match = (opponent: string, date: string, time = '4:00 PM', status = 'UPCOMING') =>
  ({ opponent, date, time, status, location: 'Somewhere', isHome: true });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);

  const w = globalThis as any;
  w.auth = {
    isCoach: () => false, isAdmin: () => false, isLoggedIn: () => false,
    canAccessRatings: () => false, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'guest', status: 'active' }),
    getRole: () => 'guest'
  };
  w.can = () => true;
  w.supabaseService = { isConfigured: () => false };
  // utils.js boots the app and touches the canvas engine, which lives in a
  // script this test does not load. A stub keeps the prototype available
  // without dragging the diagrammer in.
  w.SoccerTacticalBoard = class { constructor() {} };

  const ctor = new Function(
    [strip(appCoreSrc), strip(utilsSrc)].join('\n;\n') + '\nreturn BHSSoccerApp;'
  )() as { prototype: MatchApp };

  app = Object.create(ctor.prototype) as MatchApp;
  app.data = { schedule: [] };
});

afterEach(() => { vi.useRealTimers(); });

describe('getNextMatch', () => {
  it('skips a past match that was never marked COMPLETED', () => {
    // The exact live case: Palm Springs, AUG 28, still UPCOMING on AUG 30.
    app.data.schedule = [
      match('Palm Springs Indians', 'AUG 28, 2026', '6:51 PM'),
      match('Yucaipa Thunderbirds', 'SEP 4 2026')
    ];
    expect(app.getNextMatch().opponent).toBe('Yucaipa Thunderbirds');
  });

  it('ignores row order and picks the earliest upcoming fixture', () => {
    // fetchSchedule orders by created_at, so array position means nothing.
    app.data.schedule = [
      match('Citrus Valley', 'SEP 11 2026'),
      match('Yucaipa Thunderbirds', 'SEP 4 2026'),
      match('Riverside Rush', 'SEP 13 2026')
    ];
    expect(app.getNextMatch().opponent).toBe('Yucaipa Thunderbirds');
  });

  it('compares dates, not strings, so SEP 4 comes before SEP 11', () => {
    // Alphabetically 'SEP 11 2026' sorts before 'SEP 4 2026'. A text sort on
    // this column gets the order backwards.
    app.data.schedule = [match('Citrus Valley', 'SEP 11 2026'), match('Yucaipa', 'SEP 4 2026')];
    expect(app.getNextMatch().opponent).toBe('Yucaipa');
  });

  it('reads both date formats the live table actually holds', () => {
    // 'AUG 28, 2026' has a comma; 'SEP 4 2026' does not.
    app.data.schedule = [match('Comma', 'SEP 6, 2026'), match('NoComma', 'SEP 4 2026')];
    expect(app.getNextMatch().opponent).toBe('NoComma');
  });

  it('skips a COMPLETED match even when it is the soonest', () => {
    app.data.schedule = [
      match('Played Already', 'SEP 1 2026', '4:00 PM', 'COMPLETED'),
      match('Yucaipa', 'SEP 4 2026')
    ];
    expect(app.getNextMatch().opponent).toBe('Yucaipa');
  });

  it('keeps a match in progress rather than skipping to the next one', () => {
    // Kickoff was 90 minutes ago. Flipping the banner to the following fixture
    // mid-game would be wrong on the one day it matters most.
    app.data.schedule = [
      match('In Progress', 'AUG 30 2026', '10:30 AM'),
      match('Yucaipa', 'SEP 4 2026')
    ];
    expect(app.getNextMatch().opponent).toBe('In Progress');
  });

  it('moves on once a match is well and truly over', () => {
    app.data.schedule = [
      match('Finished', 'AUG 30 2026', '6:00 AM'),
      match('Yucaipa', 'SEP 4 2026')
    ];
    expect(app.getNextMatch().opponent).toBe('Yucaipa');
  });

  it('returns null when every match is in the past', () => {
    // The home view renders SEASON COMPLETE on null, which is the honest
    // answer - better than pinning a fixture from last week.
    app.data.schedule = [match('Palm Springs Indians', 'AUG 28, 2026')];
    expect(app.getNextMatch()).toBeNull();
  });

  it('returns null for an empty or missing schedule', () => {
    expect(app.getNextMatch()).toBeNull();
    app.data.schedule = undefined;
    expect(app.getNextMatch()).toBeNull();
  });

  it('falls back to an unparseable row rather than claiming the season is over', () => {
    // We cannot tell whether a date we could not read is past or future.
    // Announcing SEASON COMPLETE on a typo would be worse than showing it.
    app.data.schedule = [match('Mystery Date', 'sometime next week')];
    expect(app.getNextMatch().opponent).toBe('Mystery Date');
  });

  it('prefers a real upcoming fixture over an unparseable one', () => {
    app.data.schedule = [match('Mystery Date', 'sometime next week'), match('Yucaipa', 'SEP 4 2026')];
    expect(app.getNextMatch().opponent).toBe('Yucaipa');
  });
});

describe('matchDateTime — the real date columns from migration 0008', () => {
  it('uses match_on/kickoff_time when the database has supplied them', () => {
    const d = (app as any).matchDateTime({ matchOn: '2026-09-04', kickoffTime: '16:00:00' });
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);   // September
    expect(d.getDate()).toBe(4);
    expect(d.getHours()).toBe(16);
  });

  it('reads the date in local time, not UTC', () => {
    // new Date('2026-09-04') parses as UTC midnight, which is 3 Sep in
    // California — every fixture would display a day early.
    const d = (app as any).matchDateTime({ matchOn: '2026-09-04', kickoffTime: null });
    expect(d.getDate()).toBe(4);
  });

  it('defaults to 6pm when only the date is known', () => {
    const d = (app as any).matchDateTime({ matchOn: '2026-09-04', kickoffTime: null });
    expect(d.getHours()).toBe(18);
  });

  it('falls back to the text columns when 0008 has not been applied', () => {
    // The app has to keep working against a database that is a migration
    // behind, or a deploy ordering mistake takes the schedule down.
    const d = (app as any).matchDateTime({ date: 'SEP 4 2026', time: '4:00 PM' });
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(4);
    expect(d.getHours()).toBe(16);
  });

  it('prefers the derived column over the text when both are present', () => {
    // The trigger derives one from the other, so they should agree. If they
    // ever do not, the normalised value is the trustworthy one.
    const d = (app as any).matchDateTime({
      matchOn: '2026-09-04', kickoffTime: '16:00:00', date: 'nonsense', time: 'nonsense'
    });
    expect(d.getDate()).toBe(4);
  });

  it('returns null for a row with no usable date at all', () => {
    expect((app as any).matchDateTime({ date: 'sometime', time: '' })).toBeNull();
    expect((app as any).matchDateTime(null)).toBeNull();
  });

  it('drives next-match selection from the derived columns', () => {
    app.data.schedule = [
      { opponent: 'Past', matchOn: '2026-08-28', kickoffTime: '18:51:00', status: 'UPCOMING' },
      { opponent: 'Next', matchOn: '2026-09-04', kickoffTime: '16:00:00', status: 'UPCOMING' }
    ];
    expect(app.getNextMatch().opponent).toBe('Next');
  });
});

describe('getNextMatchCountdown', () => {
  it('counts down to the match getNextMatch chose', () => {
    app.data.schedule = [
      match('Palm Springs Indians', 'AUG 28, 2026', '6:51 PM'),
      match('Yucaipa Thunderbirds', 'SEP 4 2026', '4:00 PM')
    ];
    const cd = app.getNextMatchCountdown()!;
    // 30 Aug midday -> 4 Sep 16:00 is 5 days and 4 hours.
    expect(cd.days).toBe('05');
    expect(cd.hours).toBe('04');
  });

  it('no longer reads 00/00/00 because of a stale past fixture', () => {
    // This is what the coach actually saw on the live site.
    app.data.schedule = [
      match('Palm Springs Indians', 'AUG 28, 2026', '6:51 PM'),
      match('Yucaipa Thunderbirds', 'SEP 4 2026')
    ];
    const cd = app.getNextMatchCountdown()!;
    expect(cd.days).not.toBe('00');
  });

  it('pads single digits to two characters', () => {
    app.data.schedule = [match('Soon', 'AUG 31 2026', '3:00 PM')];
    const cd = app.getNextMatchCountdown()!;
    expect(cd.days).toBe('01');
    expect(cd.days.length).toBe(2);
  });

  it('returns null when there is nothing to count down to', () => {
    expect(app.getNextMatchCountdown()).toBeNull();
  });
});
