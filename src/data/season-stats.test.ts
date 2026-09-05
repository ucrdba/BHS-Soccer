/**
 * Season-long plus/minus: the totals, the rates, and who is allowed to vanish.
 *
 * The rule these are built around, and the reason the module exists in this
 * shape: high school soccer allows unlimited substitution and re-entry, so
 * much of the squad plays well under a full match, and the coach reads these
 * numbers to decide who to play MORE. Filtering short outings out would
 * remove exactly the players the report is meant to inform a decision about.
 *
 * Nobody is filtered. The uncertainty is shown instead.
 */

import { describe, it, expect } from 'vitest';
import {
  perMatch, toMinutes, orderMatches, seasonTotals, seasonSeries,
  pointWeight, seasonTrend, DEFAULT_FULL_MATCH_MINUTES, type MatchStats
} from './season-stats';

/**
 * Eighty minutes, because that is a high school match: two forty-minute
 * halves under NFHS rules, not the ninety of the professional game. Club
 * fixtures vary by age group, which is why every function takes the length
 * rather than assuming one.
 */
const HS = DEFAULT_FULL_MATCH_MINUTES;
import type { PlayerStats } from './plus-minus';

const stats = (over: Partial<PlayerStats> & { playerId: string }): PlayerStats => ({
  plus: 0, minus: 0, score: 0, goalDiff: 0, secondsPlayed: 0,
  shots: 0, goals: 0, assists: 0, onPitch: false, ...over
});

/** A tracked fixture. `mins` is per player, for readability. */
const match = (
  id: string, date: string, sortKey: string | null, opponent: string,
  players: Array<Partial<PlayerStats> & { playerId: string; mins?: number }>
): MatchStats => ({
  statMatchId: id, matchId: null, date, sortKey, opponent,
  stats: new Map(players.map(p => {
    const { mins, ...rest } = p;
    return [p.playerId, stats({ ...rest, secondsPlayed: (mins ?? 0) * 60 })];
  }))
});

describe('a rate per full match', () => {
  it('defaults to the high school eighty minutes, not ninety', () => {
    // The professional convention would inflate every figure by an eighth,
    // so a player who was on for the whole game would show a rate higher
    // than what they actually did — breaking the one number a coach can
    // check against their memory of the match.
    expect(DEFAULT_FULL_MATCH_MINUTES).toBe(80);
  });

  it('leaves a full match exactly as it was', () => {
    // The property that makes the number sanity-checkable: play every
    // minute and the rate IS the raw score.
    expect(perMatch(2, HS, HS)).toBe(2);
  });

  it('scales a half match up', () => {
    expect(perMatch(2, 40, HS)).toBe(4);
  });

  it('takes a club length when the team plays one', () => {
    // A U14 side on 70-minute games is normalised to 70, not to 80 and not
    // to 90. Nothing here may assume one organization's match length.
    expect(perMatch(2, 35, 70)).toBe(4);
    expect(perMatch(1, 70, 70)).toBe(1);
  });

  it('extrapolates a short cameo, loudly', () => {
    // Not smoothed, not capped. One plus in five minutes of an eighty-minute
    // game really is +16, and the chart's job is to show it came off five
    // minutes — not to quietly soften it.
    expect(perMatch(1, 5, HS)).toBe(16);
  });

  it('is null with no minutes, never zero', () => {
    // Zero would draw a player who has not been on the pitch as a mid-table
    // performer. Absent and average are different things.
    expect(perMatch(3, 0, HS)).toBeNull();
    expect(perMatch(0, 0, HS)).toBeNull();
  });

  it('falls back rather than dividing by a nonsense length', () => {
    expect(perMatch(2, 40, 0)).toBe(4);
  });

  it('carries a negative through', () => {
    expect(perMatch(-2, 40, HS)).toBe(-4);
  });
});

describe('minutes', () => {
  it('converts from the seconds the replay engine keeps', () => {
    expect(toMinutes(2700)).toBe(45);
  });

  it('never goes negative', () => {
    expect(toMinutes(-10)).toBe(0);
  });
});

describe('putting the season in order', () => {
  const dec = match('m2', 'DEC 8 2026', '2026-12-08', 'Sultana', []);
  const jan = match('m3', 'JAN 6 2027', '2027-01-06', 'Redlands', []);
  const nov = match('m1', 'NOV 30 2026', '2026-11-30', 'Yucaipa', []);

  it('runs oldest first', () => {
    expect(orderMatches([jan, nov, dec]).map(m => m.statMatchId))
      .toEqual(['m1', 'm2', 'm3']);
  });

  it('crosses the new year correctly', () => {
    // The displayed text does not compare usefully: "JAN 6 2027" sorts before
    // "DEC 8 2026" as a string, which would put the season in reverse.
    expect(orderMatches([jan, dec]).map(m => m.opponent))
      .toEqual(['Sultana', 'Redlands']);
  });

  it('puts an unparseable date last, not first', () => {
    // One bad row must not silently become the start of the season and drag
    // every to-date figure with it.
    const bad = match('m9', 'SOMEDAY', null, 'Unknown', []);
    expect(orderMatches([bad, jan, dec]).map(m => m.statMatchId))
      .toEqual(['m2', 'm3', 'm9']);
  });
});

describe('season totals', () => {
  const season = [
    match('m1', 'DEC 8 2026', '2026-12-08', 'Sultana', [
      { playerId: 'starter', mins: 80, plus: 4, minus: 1, score: 3, goalDiff: 2, goals: 1 },
      { playerId: 'sub',     mins: 10, plus: 1, minus: 0, score: 1, goalDiff: 1 }
    ]),
    match('m2', 'DEC 11 2026', '2026-12-11', 'El Toro', [
      { playerId: 'starter', mins: 90, plus: 2, minus: 2, score: 0, goalDiff: -1 },
      { playerId: 'sub',     mins: 20, plus: 2, minus: 0, score: 2, goalDiff: 1, assists: 1 }
    ])
  ];

  it('adds the raw numbers up', () => {
    const t = seasonTotals(season).get('starter')!;
    expect(t.plus).toBe(6);
    expect(t.minus).toBe(3);
    expect(t.score).toBe(3);
    expect(t.goalDiff).toBe(1);
    expect(t.goals).toBe(1);
    expect(t.minutes).toBe(170);
  });

  it('counts appearances', () => {
    expect(seasonTotals(season).get('sub')!.appearances).toBe(2);
  });

  it('rates the substitute on the same footing as the starter', () => {
    // The whole reason for per 90. Raw score says the starter is ahead 3 to 3
    // — level. Per 90 says the substitute has been far more effective in the
    // time they got, which is the thing worth knowing when deciding whether
    // to give them more of it.
    const t = seasonTotals(season);
    expect(t.get('starter')!.scorePerMatch).toBeCloseTo(3 / 170 * HS, 6);
    expect(t.get('sub')!.scorePerMatch).toBeCloseTo(3 / 30 * HS, 6);
    expect(t.get('sub')!.scorePerMatch!).toBeGreaterThan(t.get('starter')!.scorePerMatch!);
  });

  it('keeps a player who has barely played', () => {
    // No threshold, by design: these are the players the report exists for.
    const withCameo = season.concat([
      match('m3', 'DEC 14 2026', '2026-12-14', 'Moreno Valley', [
        { playerId: 'cameo', mins: 4, plus: 1, score: 1 }
      ])
    ]);
    const t = seasonTotals(withCameo).get('cameo')!;
    expect(t).toBeDefined();
    expect(t.appearances).toBe(1);
    expect(t.scorePerMatch).toBeCloseTo(1 / 4 * HS, 6);
  });

  it('records no appearance for a player who never got on, but keeps them', () => {
    const t = seasonTotals([
      match('m1', 'DEC 8 2026', '2026-12-08', 'Sultana', [{ playerId: 'bench', mins: 0 }])
    ]).get('bench')!;
    expect(t.appearances).toBe(0);
    expect(t.minutes).toBe(0);
    expect(t.scorePerMatch).toBeNull();
  });
});

describe("a player's series", () => {
  const season = [
    match('m2', 'DEC 11 2026', '2026-12-11', 'El Toro', [
      { playerId: 'p1', mins: 30, score: 2, goalDiff: 1 }
    ]),
    match('m1', 'DEC 8 2026', '2026-12-08', 'Sultana', [
      { playerId: 'p1', mins: 10, score: 1, goalDiff: 0 }
    ]),
    match('m3', 'DEC 14 2026', '2026-12-14', 'Moreno Valley', [
      { playerId: 'p1', mins: 60, score: 3, goalDiff: 2 }
    ])
  ];

  it('runs oldest first whatever order the matches arrived in', () => {
    expect(seasonSeries(season, 'p1').map(p => p.opponent))
      .toEqual(['Sultana', 'El Toro', 'Moreno Valley']);
  });

  it('carries the minutes behind every point', () => {
    // What makes a wild rate readable as wild rather than as form.
    expect(seasonSeries(season, 'p1').map(p => p.minutes)).toEqual([10, 30, 60]);
  });

  it('gives each match its own rate', () => {
    const s = seasonSeries(season, 'p1');
    expect(s[0].scorePerMatch).toBeCloseTo(1 / 10 * HS, 6);   // 1 in 10
    expect(s[1].scorePerMatch).toBeCloseTo(2 / 30 * HS, 6);   // 2 in 30
    expect(s[2].scorePerMatch).toBeCloseTo(3 / 60 * HS, 6);   // 3 in 60
  });

  it('runs a to-date rate that steadies as minutes accumulate', () => {
    // The per-match line swings; this is what a coach should read for form.
    const s = seasonSeries(season, 'p1');
    expect(s[0].scorePerMatchToDate).toBeCloseTo(1 / 10 * HS, 6);  // 1 in 10
    expect(s[1].scorePerMatchToDate).toBeCloseTo(3 / 40 * HS, 6);  // 3 in 40
    expect(s[2].scorePerMatchToDate).toBeCloseTo(6 / 100 * HS, 6); // 6 in 100
  });

  it('accumulates minutes across the season', () => {
    expect(seasonSeries(season, 'p1').map(p => p.minutesToDate)).toEqual([10, 40, 100]);
  });

  it('leaves out a match the player did not feature in', () => {
    // Rather than plotting a zero, which would read as a poor game instead of
    // an absence. The to-date figure carries their form across the gap.
    const withGap = season.concat([
      match('m4', 'DEC 21 2026', '2026-12-21', 'Anaheim', [{ playerId: 'other', mins: 90 }])
    ]);
    expect(seasonSeries(withGap, 'p1')).toHaveLength(3);
  });

  it('leaves out a player put on and taken straight off', () => {
    const s = seasonSeries([
      match('m1', 'DEC 8 2026', '2026-12-08', 'Sultana', [{ playerId: 'p1', mins: 0 }])
    ], 'p1');
    expect(s).toEqual([]);
  });

  it('tracks goal differential the same way', () => {
    const s = seasonSeries(season, 'p1');
    expect(s[2].goalDiff).toBe(2);
    expect(s[2].goalDiffPerMatch).toBeCloseTo(2 / 60 * HS, 6);
    expect(s[2].goalDiffPerMatchToDate).toBeCloseTo(3 / 100 * HS, 6);
  });
});

describe('how heavily to draw a point', () => {
  /**
   * Weight decides how a point LOOKS, never whether it is drawn. That is the
   * whole mechanism by which a five-minute cameo can be both visible and
   * visibly uncertain.
   */
  it('draws a full match at full weight', () => {
    expect(pointWeight(HS, HS)).toBe(1);
  });

  it('draws half a match at about half', () => {
    expect(pointWeight(40, HS)).toBeCloseTo(0.5, 6);
  });

  it('measures against the team own match length', () => {
    // 40 minutes is half a high school game but a full U14 club half-hour
    // game and more; the dot must reflect the game actually played.
    expect(pointWeight(35, 70)).toBeCloseTo(0.5, 6);
    expect(pointWeight(70, 70)).toBe(1);
  });

  it('keeps the shortest cameo visible', () => {
    // A floor, not a cutoff: one minute still draws a dot a coach can see.
    expect(pointWeight(1, HS)).toBe(0.25);
    expect(pointWeight(0, HS)).toBe(0.25);
  });

  it('does not oversize extra time', () => {
    expect(pointWeight(120, HS)).toBe(1);
  });
});

describe('the trend arrow', () => {
  const series = (...rates: number[]) =>
    rates.map((r, i) => ({
      statMatchId: 'm' + i, date: 'D' + i, opponent: 'O', minutes: 90,
      score: 0, goalDiff: 0, scorePerMatch: r, goalDiffPerMatch: r,
      scorePerMatchToDate: r, goalDiffPerMatchToDate: r, minutesToDate: 90 * (i + 1)
    })) as any;

  it('says up when the running rate has climbed', () => {
    expect(seasonTrend(series(0, 1, 2, 3))).toBe('up');
  });

  it('says down when it has fallen', () => {
    expect(seasonTrend(series(3, 2, 1, 0))).toBe('down');
  });

  it('says flat for movement below the resolution of a short season', () => {
    expect(seasonTrend(series(1, 1.02, 1.01, 1.03))).toBe('flat');
  });

  it('reports nothing at all under three appearances', () => {
    // Two numbers are not a trend, and an arrow would put confidence on
    // nothing. Null so the view can say "not enough yet" instead.
    expect(seasonTrend(series(0, 5))).toBeNull();
    expect(seasonTrend(series(0))).toBeNull();
    expect(seasonTrend([])).toBeNull();
  });

  it('can read goal differential instead', () => {
    expect(seasonTrend(series(0, 1, 2, 3), 'goalDiffPerMatchToDate')).toBe('up');
  });
});
