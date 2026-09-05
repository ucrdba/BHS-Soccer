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
