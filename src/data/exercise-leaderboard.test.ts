/**
 * The leaderboard, filtered to one exercise.
 *
 * The board answers "who is ahead overall". A coach also wants "who has the
 * most small-sided wins" and "who is best at Coopers", and those are different
 * questions with different natural answers: wins for a head-to-head drill, the
 * highest count for a counted one, the FASTEST time for a timed one.
 *
 * Getting that backwards is the failure to guard against -- ranking a timed
 * exercise by highest value puts the slowest player top, and it looks like a
 * leaderboard either way.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import matrixSrc from '../../public/js/views/matrix.view.js?raw';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, matrixSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

const COOPERS = 'd-coopers';
const LAPS = 'd-laps';
const SMALL = 'd-small';

/** A row as matrix_exercise_points returns it. */
const row = (over: any) => ({
  player_id: 'p1', drill_id: COOPERS, exercise: 'Coopers', kind: 'measured',
  raw_value: null, weight: 1, earned: 0, available: 1,
  w: 0, dr: 0, ls: 0, exercise_count: 1, ...over
});

function makeApp(points: any[]): any {
  const app = Object.create(ctor.prototype);
  app.data = {
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
  };
  app._exercisePoints = points;
  return app;
}

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('a counted exercise, where higher is better', () => {
  const points = [
    row({ player_id: 'p1', raw_value: 2600, earned: 0.6 }),
    row({ player_id: 'p1', raw_value: 2900, earned: 1 }),     // p1's best
    row({ player_id: 'p2', raw_value: 2750, earned: 0.8 })
  ];

  it('takes each player\'s BEST figure, not their latest or their average', () => {
    const rows = makeApp(points).exerciseLeaderboard(COOPERS);
    expect(rows.find((r: any) => r.playerId === 'p1').best).toBe(2900);
  });

  it('ranks the higher figure first', () => {
    const rows = makeApp(points).exerciseLeaderboard(COOPERS);
    expect(rows[0].playerId).toBe('p1');
  });

  it('totals the points earned across every attempt', () => {
    // The points column must still agree with the overall board.
    const rows = makeApp(points).exerciseLeaderboard(COOPERS);
    expect(rows.find((r: any) => r.playerId === 'p1').earned).toBeCloseTo(1.6);
  });
});

describe('a timed exercise, where LOWER is better', () => {
  const points = [
    row({ drill_id: LAPS, kind: 'time_band', player_id: 'p1', raw_value: 250, earned: 1 }),
    row({ drill_id: LAPS, kind: 'time_band', player_id: 'p1', raw_value: 240, earned: 1 }),  // p1's best
    row({ drill_id: LAPS, kind: 'time_band', player_id: 'p2', raw_value: 235, earned: 1 })
  ];

  it('takes the FASTEST time as the best', () => {
    // Taking the maximum here would call a player's worst run their best.
    const rows = makeApp(points).exerciseLeaderboard(LAPS);
    expect(rows.find((r: any) => r.playerId === 'p1').best).toBe(240);
  });

  it('ranks the fastest player first when sorted on the figure', () => {
    // And ranking a timed exercise by highest value puts the SLOWEST on top,
    // which still looks like a leaderboard.
    const rows = makeApp(points).exerciseLeaderboard(LAPS, 'best');
    expect(rows[0].playerId).toBe('p2');
    expect(rows[0].best).toBe(235);
  });

  it('marks the exercise as timed so the column can be formatted', () => {
    const rows = makeApp(points).exerciseLeaderboard(LAPS);
    expect(rows[0].timed).toBe(true);
  });
});

describe('a win/loss exercise', () => {
  const points = [
    row({ drill_id: SMALL, kind: 'win_loss', player_id: 'p1', w: 1, earned: 1 }),
    row({ drill_id: SMALL, kind: 'win_loss', player_id: 'p1', w: 1, earned: 1 }),
    row({ drill_id: SMALL, kind: 'win_loss', player_id: 'p2', dr: 1, earned: 0.5 }),
    row({ drill_id: SMALL, kind: 'win_loss', player_id: 'p3', ls: 1, earned: 0 })
  ];

  it('totals wins, draws and losses', () => {
    const rows = makeApp(points).exerciseLeaderboard(SMALL);
    const p1 = rows.find((r: any) => r.playerId === 'p1');
    expect([p1.wins, p1.draws, p1.losses]).toEqual([2, 0, 0]);
  });

  it('ranks by wins when sorted on them', () => {
    // "Who has the most small-sided wins" -- the question that prompted this.
    const rows = makeApp(points).exerciseLeaderboard(SMALL, 'wins');
    expect(rows[0].playerId).toBe('p1');
    expect(rows[0].wins).toBe(2);
  });
});

describe('who appears at all', () => {
  it('leaves out a player with no row for that exercise', () => {
    const rows = makeApp([row({ player_id: 'p1', raw_value: 2600, earned: 1 })])
      .exerciseLeaderboard(COOPERS);
    expect(rows.map((r: any) => r.playerId)).toEqual(['p1']);
  });

  it('includes a player who was down for it but never entered, showing zero', () => {
    // Worth seeing: it says who is missing sessions, not just who is winning.
    const rows = makeApp([
      row({ player_id: 'p1', raw_value: 2600, earned: 1 }),
      row({ player_id: 'p2', kind: 'not_entered', raw_value: null, earned: 0, available: 1 })
    ]).exerciseLeaderboard(COOPERS);

    const p2 = rows.find((r: any) => r.playerId === 'p2');
    expect(p2).toBeTruthy();
    expect(p2.earned).toBe(0);
    expect(p2.best).toBeNull();
  });

  it('carries the name and recording number for display', () => {
    const rows = makeApp([row({ player_id: 'p1', raw_value: 2600 })]).exerciseLeaderboard(COOPERS);
    expect(rows[0].name).toBe('Cesar Alva');
    expect(rows[0].recordingNumber).toBe(1);
  });
});

describe('the default order', () => {
  it('is points earned, which is the board\'s own currency', () => {
    const rows = makeApp([
      row({ player_id: 'p1', raw_value: 2900, earned: 0.5 }),
      row({ player_id: 'p2', raw_value: 2600, earned: 1.5 })
    ]).exerciseLeaderboard(COOPERS);
    expect(rows[0].playerId).toBe('p2');
  });

  it('breaks a tie on the best figure rather than leaving it arbitrary', () => {
    const rows = makeApp([
      row({ player_id: 'p1', raw_value: 2600, earned: 1 }),
      row({ player_id: 'p2', raw_value: 2900, earned: 1 })
    ]).exerciseLeaderboard(COOPERS);
    expect(rows[0].playerId).toBe('p2');
  });
});

describe('reversing a column', () => {
  /**
   * Clicking a heading a second time reverses it. There was no direction at
   * all before -- every click re-applied the same fixed order, so the board
   * sorted one way while the arrow in the header implied a second way that did
   * not exist.
   */
  const counted = [
    row({ player_id: 'p1', raw_value: 2600, earned: 0.6, available: 1 }),
    row({ player_id: 'p2', raw_value: 2900, earned: 1.0, available: 1 }),
    row({ player_id: 'p3', raw_value: 2400, earned: 0.3, available: 1 })
  ];

  const timedRows = [
    row({ drill_id: LAPS, kind: 'time_band', player_id: 'p1', raw_value: 288, earned: 0.25 }),
    row({ drill_id: LAPS, kind: 'time_band', player_id: 'p2', raw_value: 255, earned: 1 }),
    row({ drill_id: LAPS, kind: 'time_band', player_id: 'p3', raw_value: 274, earned: 0.5 })
  ];

  it('puts the highest count first by default', () => {
    const rows = makeApp(counted).exerciseLeaderboard(COOPERS, 'best');
    expect(rows.map((r: any) => r.best)).toEqual([2900, 2600, 2400]);
  });

  it('actually reverses a counted column', () => {
    const rows = makeApp(counted).exerciseLeaderboard(COOPERS, 'best', true);
    expect(rows.map((r: any) => r.best)).toEqual([2400, 2600, 2900]);
  });

  it('puts the fastest time first by default', () => {
    const rows = makeApp(timedRows).exerciseLeaderboard(LAPS, 'best');
    expect(rows.map((r: any) => r.best)).toEqual([255, 274, 288]);
  });

  it('reverses a timed column to slowest first', () => {
    const rows = makeApp(timedRows).exerciseLeaderboard(LAPS, 'best', true);
    expect(rows.map((r: any) => r.best)).toEqual([288, 274, 255]);
  });

  it('reverses points', () => {
    const rows = makeApp(counted).exerciseLeaderboard(COOPERS, 'earned', true);
    expect(rows.map((r: any) => r.earned)).toEqual([0.3, 0.6, 1.0]);
  });

  it('reverses the player name', () => {
    const rows = makeApp(counted).exerciseLeaderboard(COOPERS, 'name', true);
    expect(rows.map((r: any) => r.name)).toEqual(['Tom Budde', 'Cesar Alva', 'Alain Renteria']);
  });

  it('reverses the recording number', () => {
    const rows = makeApp(counted).exerciseLeaderboard(COOPERS, 'number', true);
    expect(rows.map((r: any) => r.recordingNumber)).toEqual([18, 4, 1]);
  });

  it('keeps a player with no figure last in BOTH directions', () => {
    // Reversing flips the values, not the rule that a blank has nothing to
    // compare. A column of blanks must never lead the board.
    const withBlank = [
      row({ player_id: 'p1', raw_value: 2600, earned: 0.6 }),
      row({ player_id: 'p2', kind: 'not_entered', raw_value: null, earned: 0 })
    ];
    expect(makeApp(withBlank).exerciseLeaderboard(COOPERS, 'best')[1].playerId).toBe('p2');
    expect(makeApp(withBlank).exerciseLeaderboard(COOPERS, 'best', true)[1].playerId).toBe('p2');
  });

  it('keeps an unnumbered player last in BOTH directions', () => {
    const app = makeApp(counted);
    app.data.players[2].recordingNumber = null;
    expect(app.exerciseLeaderboard(COOPERS, 'number').slice(-1)[0].playerId).toBe('p3');
    expect(app.exerciseLeaderboard(COOPERS, 'number', true).slice(-1)[0].playerId).toBe('p3');
  });
});

describe('the sort control', () => {
  const counted = [
    row({ player_id: 'p1', raw_value: 2600, earned: 0.6 }),
    row({ player_id: 'p2', raw_value: 2900, earned: 1.0 })
  ];

  const app = () => {
    const a = makeApp(counted);
    a.renderCurrentView = () => {};
    return a;
  };

  it('sorts by a newly clicked column in its natural order', () => {
    const a = app();
    a.setExerciseSort('name');
    expect(a._exerciseSort).toBe('name');
    expect(a._exerciseSortReversed).toBe(false);
  });

  it('reverses when the same column is clicked again', () => {
    const a = app();
    a.setExerciseSort('name');
    a.setExerciseSort('name');
    expect(a._exerciseSortReversed).toBe(true);
  });

  it('returns to the natural order on a third click', () => {
    const a = app();
    a.setExerciseSort('name');
    a.setExerciseSort('name');
    a.setExerciseSort('name');
    expect(a._exerciseSortReversed).toBe(false);
  });

  it('starts fresh when a different column is clicked', () => {
    // Carrying the reversal over would silently invert the new column.
    const a = app();
    a.setExerciseSort('name');
    a.setExerciseSort('name');
    a.setExerciseSort('earned');
    expect(a._exerciseSortReversed).toBe(false);
  });

  it('knows which way each column reads first', () => {
    // This is what lets the header arrow show the order actually in force.
    const a = app();
    expect(a.exerciseSortDescends('earned', false)).toBe(true);
    expect(a.exerciseSortDescends('wins', false)).toBe(true);
    expect(a.exerciseSortDescends('best', false)).toBe(true);   // counted: highest first
    expect(a.exerciseSortDescends('best', true)).toBe(false);   // timed: fastest first
    expect(a.exerciseSortDescends('name', false)).toBe(false);
    expect(a.exerciseSortDescends('number', false)).toBe(false);
  });
});
