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
// Read across the seam on purpose: the bug lived between what the leaderboard
// totals and what the standard reads, so one of these tests spans both.
import { bandStanding, belowStandard } from './matrix-threshold';

const COOPERS = 'd-coopers';   // count_high
const LAPS = 'd-laps';         // time_bands
const SMALL = 'd-small';       // win_loss
const GOALS = 'd-goals';       // role_goals

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
    { id: SMALL, name: 'Small Sided', measure: 'win_loss' },
    { id: GOALS, name: '1v1 Attack', measure: 'role_goals' }
  ] as any[]
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

  /*
   * The two totals a standard and a ranking need, which are not the same.
   *
   * A player ran two 3-430 sessions inside the standard and missed a third.
   * Points must count the absence — that is the scoring rule, and it is what
   * ranks the squad. The standard must not: it asks whether he cleared the bar
   * when he ran, and he did, every time. Reported as below the standard, he
   * was the reason this distinction exists.
   */
  it('separates the totals over every session from those over attempts', () => {
    const rows = exerciseLeaderboard(ctx([
      row({ drill_id: LAPS, raw_value: 224, earned: 1, available: 1 }),
      row({ drill_id: LAPS, raw_value: 247, earned: 1, available: 1 }),
      // The no-show: no value, so not an attempt, but still available.
      row({ drill_id: LAPS, raw_value: null, earned: 0, available: 1 })
    ]), LAPS);

    expect(rows[0].earned).toBe(2);
    expect(rows[0].available).toBe(3);
    expect(rows[0].attempts).toBe(2);
    // Both runs cleared the bar; the absence is in neither count.
    expect(rows[0].metRuns).toBe(2);
    expect(rows[0].shortRuns).toBe(0);
  });

  /*
   * Ashton: 4:29 cleared a 4:30 bar, 4:40 took a looser band, one session
   * missed. He has proved he can do it, so the standard reads met -- and the
   * two counts are what say he does not do it every time.
   */
  it('counts a clear run and a looser one separately', () => {
    const rows = exerciseLeaderboard(ctx([
      row({ drill_id: LAPS, raw_value: 269, earned: 1, available: 1 }),
      row({ drill_id: LAPS, raw_value: 280, earned: 0.5, available: 1 }),
      row({ drill_id: LAPS, raw_value: null, earned: 0, available: 1 })
    ]), LAPS);

    expect(rows[0].metRuns).toBe(1);
    expect(rows[0].shortRuns).toBe(1);
    expect(rows[0].attempts).toBe(2);
    expect(bandStanding(rows[0])).toBe('met');
  });

  it('reads that player as having met the standard, end to end', () => {
    const rows = exerciseLeaderboard(ctx([
      row({ drill_id: LAPS, raw_value: 224, earned: 1, available: 1 }),
      row({ drill_id: LAPS, raw_value: 247, earned: 1, available: 1 }),
      row({ drill_id: LAPS, raw_value: null, earned: 0, available: 1 })
    ]), LAPS);

    // Through the real row rather than a hand-built one: the bug lived in the
    // seam between what the leaderboard totals and what the standard reads.
    expect(bandStanding(rows[0])).toBe('met');
    expect(belowStandard(rows)).toEqual([]);
  });

  /*
   * The best time is a ceiling; the average is the norm. A player whose only
   * clear run was his fastest reads very differently from one who clears it
   * routinely, and the two figures side by side say which.
   */
  it('averages the attempted values, ignoring absences', () => {
    const rows = exerciseLeaderboard(ctx([
      row({ drill_id: LAPS, raw_value: 269, earned: 1, available: 1 }),
      row({ drill_id: LAPS, raw_value: 281, earned: 0.5, available: 1 }),
      // No value: it is not an attempt, so it must not drag the mean toward 0.
      row({ drill_id: LAPS, raw_value: null, earned: 0, available: 1 })
    ]), LAPS);

    expect(rows[0].best).toBe(269);
    expect(rows[0].avg).toBe(275);
  });

  it('has no average for a player who never attempted', () => {
    const rows = exerciseLeaderboard(ctx([
      row({ drill_id: LAPS, raw_value: null, earned: 0, available: 1 })
    ]), LAPS);
    expect(rows[0].avg).toBeNull();
  });

  it('sorts a timed exercise fastest-average-first', () => {
    const rows = exerciseLeaderboard(ctx([
      row({ drill_id: LAPS, player_id: 'p1', raw_value: 300 }),
      row({ drill_id: LAPS, player_id: 'p2', raw_value: 240 })
    ]), LAPS, 'avg');
    expect(rows.map(r => r.playerId)).toEqual(['p2', 'p1']);
  });

  it('sinks a player with no average whichever way that column is sorted', () => {
    const points = [
      row({ drill_id: LAPS, player_id: 'p1', raw_value: null, earned: 5, available: 5 }),
      row({ drill_id: LAPS, player_id: 'p2', raw_value: 240, earned: 1, available: 5 })
    ];
    expect(exerciseLeaderboard(ctx(points), LAPS, 'avg')[1].playerId).toBe('p1');
    expect(exerciseLeaderboard(ctx(points), LAPS, 'avg', true)[1].playerId).toBe('p1');
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
    c.players[1].recordingNumber = null as any;
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
    // Not .at(-1): this project's tsconfig lib target predates it.
    const last = (rows: any[]) => rows[rows.length - 1];
    expect(last(matrixBoardRows(players, 'earned')).playerId).toBe('p3');
    expect(last(matrixBoardRows(players, 'earned', true)).playerId).toBe('p3');
  });

  it('lets an unranked player sort normally by name', () => {
    expect(matrixBoardRows(players, 'name')[0].name).toBe('Alain Renteria');
  });

  it('omits deleted players', () => {
    const withDeleted = [...players, { id: 'p4', name: 'Gone', is_deleted: true, matrixStats: {} } as any];
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

describe('a Goals-by-role leaderboard', () => {
  const g = (over: any) => row({
    drill_id: GOALS, kind: 'role_goals', weight: 3, available: 3, ...over
  });

  it("shows each player's latest result and totals the points", () => {
    const rows = exerciseLeaderboard(ctx([
      g({ player_id: 'p1', occurred_on: '2026-09-01', role: 'defend', goals_for: 0, goals_against: 2,
          raw_value: -2, base_factor: 0, bonus_factor: 0, earned: 0 }),
      g({ player_id: 'p1', occurred_on: '2026-09-08', role: 'attack', goals_for: 3, goals_against: 1,
          raw_value: 2, base_factor: '0.500', bonus_factor: '0.100', earned: 1.8 })
    ]), GOALS);
    expect(rows[0]).toMatchObject({
      role: 'attack', goalsFor: 3, goalsAgainst: 1, diff: 2, baseFactor: 0.5, bonusFactor: 0.1,
      earned: 1.8, available: 6
    });
  });

  it('leaves the figures empty for a player with only a no-show', () => {
    const rows = exerciseLeaderboard(ctx([
      row({ drill_id: GOALS, kind: 'absent', player_id: 'p2', weight: 3, available: 3 })
    ]), GOALS);
    expect(rows[0]).toMatchObject({ role: null, goalsFor: null, diff: null, baseFactor: null });
  });

  it('sorts by goal difference, highest first, with blanks last either way', () => {
    const points = [
      g({ player_id: 'p1', role: 'attack', goals_for: 1, goals_against: 1, raw_value: 0, base_factor: 0.2, bonus_factor: 0 }),
      g({ player_id: 'p2', role: 'attack', goals_for: 4, goals_against: 1, raw_value: 3, base_factor: 0.8, bonus_factor: 0 }),
      row({ drill_id: GOALS, kind: 'not_entered', player_id: 'p3', weight: 3, available: 3 })
    ];
    expect(exerciseLeaderboard(ctx(points), GOALS, 'diff', false).map(r => r.playerId)).toEqual(['p2', 'p1', 'p3']);
    expect(exerciseLeaderboard(ctx(points), GOALS, 'diff', true).map(r => r.playerId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('sorts by role alphabetically and by base, bonus and score', () => {
    const points = [
      g({ player_id: 'p1', role: 'defend', goals_for: 0, goals_against: 0, raw_value: 0, base_factor: 0.6, bonus_factor: 0.4 }),
      g({ player_id: 'p2', role: 'attack', goals_for: 5, goals_against: 1, raw_value: 4, base_factor: 0.8, bonus_factor: 0.2 })
    ];
    expect(exerciseLeaderboard(ctx(points), GOALS, 'role', false).map(r => r.playerId)).toEqual(['p2', 'p1']);
    expect(exerciseLeaderboard(ctx(points), GOALS, 'base', false).map(r => r.playerId)).toEqual(['p2', 'p1']);
    expect(exerciseLeaderboard(ctx(points), GOALS, 'bonus', false).map(r => r.playerId)).toEqual(['p1', 'p2']);
    expect(exerciseLeaderboard(ctx(points), GOALS, 'score', false).map(r => r.playerId)).toEqual(['p2', 'p1']);
  });

  it('reads role ascending and the figures descending on first click', () => {
    expect(exerciseSortDescends('role', false)).toBe(false);
    for (const by of ['score', 'diff', 'base', 'bonus']) expect(exerciseSortDescends(by, false)).toBe(true);
  });
});
