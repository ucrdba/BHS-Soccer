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

  /**
   * Not 6pm, despite the fallback's `let hours = 18`.
   *
   * Every date string V8 accepts is handled by `new Date(combined)` on the
   * way in, and that reads a bare date as midnight. The fallback parser --
   * and so its 6pm default -- is reached only when V8 rejects the string
   * outright, which for these inputs means the month name is unrecognisable
   * and the MONTHS lookup fails too. The default is therefore dead for real
   * fixtures. Recorded, not fixed: Phase 0 changes no behaviour.
   */
  it('reads a timeless fixture as midnight, not the fallback 6pm', () => {
    expect(parseMatchDateTime('SEP 4 2026', ''))
      .toEqual(new Date(2026, 8, 4, 0, 0));
  });

  it('returns null when the month name is unreadable', () => {
    expect(parseMatchDateTime('XYZ 4 2026', '6:00 PM')).toBeNull();
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
