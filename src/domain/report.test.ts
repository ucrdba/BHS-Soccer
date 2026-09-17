/**
 * The standard a timed exercise is measured against on the squad report.
 *
 * Two decisions here, and both change what a coach is told:
 *
 * **The tightest band is the target.** Bands read "at or under X earns Y", so
 * the fastest one is the standard; taking the slowest would mark a squad as
 * meeting a standard it has not met.
 *
 * **No bands means the exercise is not counted**, not that everyone failed
 * it. Null says "there is no standard here"; a number would put a whole squad
 * below one that was never set.
 *
 * Ported from the agreement tests that loaded the legacy view.
 */
import { describe, it, expect } from 'vitest';
import { reportStandardSeconds, outcomeRecord } from './report';

const bands = {
  d1: [
    { max_seconds: 300, points: 1 },
    { max_seconds: 270, points: 2 },
    { max_seconds: 240, points: 3 }
  ],
  d2: [{ max_seconds: 55, points: 3 }],
  d3: []
};

describe('the standard for a timed exercise', () => {
  it('IS THE TIGHTEST BAND, not the loosest', () => {
    expect(reportStandardSeconds(bands, 'd1')).toBe(240);
  });

  it('is that band when there is only one', () => {
    expect(reportStandardSeconds(bands, 'd2')).toBe(55);
  });

  it('does not depend on the order the bands arrive in', () => {
    const shuffled = { d1: [{ max_seconds: 240 }, { max_seconds: 300 }, { max_seconds: 270 }] };
    expect(reportStandardSeconds(shuffled, 'd1')).toBe(240);
  });

  it('reads the seconds as a number when they arrive as text', () => {
    expect(reportStandardSeconds({ d1: [{ max_seconds: '270' }, { max_seconds: '240' }] }, 'd1'))
      .toBe(240);
  });
});

describe('AN EXERCISE WITH NO STANDARD IS NOT COUNTED', () => {
  it('returns null for an empty band list rather than a number', () => {
    // A number here would report the whole squad as below a standard nobody
    // ever set.
    expect(reportStandardSeconds(bands, 'd3')).toBeNull();
  });

  it('returns null for a drill the bands say nothing about', () => {
    expect(reportStandardSeconds(bands, 'never-heard-of-it')).toBeNull();
  });

  it('returns null rather than throwing when there are no bands at all', () => {
    expect(reportStandardSeconds(null as any, 'd1')).toBeNull();
    expect(reportStandardSeconds({}, 'd1')).toBeNull();
  });
});

describe('a W/D/L exercise has a record, not a best figure', () => {
  // Flying Fours and small-sided games store won/drew/lost and NO number, so
  // counting raw values reported every player as 0 attempts with a dash --
  // the exercise took a heading in the report and said nothing.
  const HISTORY = [
    { drillId: 'flying', playerId: 'p1', attendance: 'present', rawValue: null, outcome: 'win' },
    { drillId: 'flying', playerId: 'p1', attendance: 'present', rawValue: null, outcome: 'loss' },
    { drillId: 'flying', playerId: 'p1', attendance: 'present', rawValue: null, outcome: 'draw' },
    { drillId: 'flying', playerId: 'p2', attendance: 'present', rawValue: null, outcome: 'win' },
    { drillId: 'laps',   playerId: 'p1', attendance: 'present', rawValue: 250, outcome: null }
  ];

  it('counts the games a player played and reads them as a record', () => {
    expect(outcomeRecord(HISTORY, 'flying', 'p1'))
      .toEqual({ games: 3, wins: 1, draws: 1, losses: 1, label: '1 - 1 - 1' });
  });

  it('is nothing at all for a player who played none', () => {
    expect(outcomeRecord(HISTORY, 'flying', 'p3'))
      .toEqual({ games: 0, wins: 0, draws: 0, losses: 0, label: '—' });
  });

  it('counts only this exercise', () => {
    expect(outcomeRecord(HISTORY, 'laps', 'p1').games).toBe(0);
  });

  it('leaves out a player who was not there, and a row with no outcome', () => {
    const rows = [
      { drillId: 'flying', playerId: 'p1', attendance: 'excused', rawValue: null, outcome: 'win' },
      { drillId: 'flying', playerId: 'p1', attendance: 'unexcused', rawValue: null, outcome: 'loss' },
      { drillId: 'flying', playerId: 'p1', attendance: 'present', rawValue: null, outcome: null }
    ];
    expect(outcomeRecord(rows, 'flying', 'p1').games).toBe(0);
  });

  it('is unbothered by no history at all', () => {
    expect(outcomeRecord(undefined as any, 'flying', 'p1').label).toBe('—');
  });
});

