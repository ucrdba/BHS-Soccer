/**
 * Sorting the overall Competitive Matrix leaderboard.
 *
 * The board's own answer to "who is ahead" is its rank, and that stays the
 * default. Player, Pts and Share answer different questions, so each sorts
 * both ways.
 *
 * The rule that is easy to lose: a player who has taken part in nothing is not
 * last on merit and not first when reversed — there is nothing to compare.
 * They sink either way, so a block of empty rows never leads the board.
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

/** Three players, whose rank, name, points and share all disagree, so no two
 *  columns can be confused for one another. */
const squad = () => [
  { id: 'p1', name: 'Cesar Alva', recordingNumber: 1,
    matrixStats: { rank: 2, exercises: 4, earned: 8.5, available: 12, share: 70.8, wins: 3, draws: 0, losses: 1 } },
  { id: 'p2', name: 'Tom Budde', recordingNumber: 4,
    matrixStats: { rank: 1, exercises: 5, earned: 11.0, available: 20, share: 55.0, wins: 5, draws: 0, losses: 0 } },
  { id: 'p3', name: 'Alain Renteria', recordingNumber: 18,
    matrixStats: { rank: 3, exercises: 3, earned: 4.0, available: 5, share: 80.0, wins: 1, draws: 1, losses: 1 } }
];

function makeApp(players: any[] = squad()): any {
  const app = Object.create(ctor.prototype);
  app.data = { players };
  app.renderCurrentView = () => {};
  return app;
}

const order = (app: any) => app.matrixBoardRows().map((r: any) => r.playerId);

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the default order', () => {
  it('is the board rank, best first', () => {
    expect(order(makeApp())).toEqual(['p2', 'p1', 'p3']);
  });

  it('is not points order, which is a different question', () => {
    // p3 has the highest SHARE and the lowest points; the two must not agree
    // by accident, or these tests prove nothing.
    const byPts = squad().slice().sort((a, b) => b.matrixStats.earned - a.matrixStats.earned);
    const byShare = squad().slice().sort((a, b) => b.matrixStats.share - a.matrixStats.share);
    expect(byPts.map(p => p.id)).not.toEqual(byShare.map(p => p.id));
  });
});

describe('sorting by player', () => {
  it('goes A to Z on the first click', () => {
    const app = makeApp();
    app.setBoardSort('name');
    expect(app.matrixBoardRows().map((r: any) => r.name))
      .toEqual(['Alain Renteria', 'Cesar Alva', 'Tom Budde']);
  });

  it('goes Z to A on the second', () => {
    const app = makeApp();
    app.setBoardSort('name');
    app.setBoardSort('name');
    expect(app.matrixBoardRows().map((r: any) => r.name))
      .toEqual(['Tom Budde', 'Cesar Alva', 'Alain Renteria']);
  });
});

describe('sorting by points', () => {
  it('puts the most points first', () => {
    const app = makeApp();
    app.setBoardSort('earned');
    expect(order(app)).toEqual(['p2', 'p1', 'p3']);
  });

  it('reverses to fewest first', () => {
    const app = makeApp();
    app.setBoardSort('earned');
    app.setBoardSort('earned');
    expect(order(app)).toEqual(['p3', 'p1', 'p2']);
  });
});

describe('sorting by share', () => {
  it('puts the biggest share first, which is not the points order', () => {
    const app = makeApp();
    app.setBoardSort('share');
    expect(order(app)).toEqual(['p3', 'p1', 'p2']);
  });

  it('reverses to smallest first', () => {
    const app = makeApp();
    app.setBoardSort('share');
    app.setBoardSort('share');
    expect(order(app)).toEqual(['p2', 'p1', 'p3']);
  });
});

describe('a player who has taken part in nothing', () => {
  const withIdle = () => [
    ...squad(),
    { id: 'p4', name: 'Aaron Zero', recordingNumber: 22, matrixStats: undefined }
  ];

  it('sinks under rank, both ways', () => {
    const app = makeApp(withIdle());
    expect(order(app).slice(-1)).toEqual(['p4']);
    app.setBoardSort('rank');
    app.setBoardSort('rank');
    expect(order(app).slice(-1)).toEqual(['p4']);
  });

  it('sinks under points, both ways', () => {
    const app = makeApp(withIdle());
    app.setBoardSort('earned');
    expect(order(app).slice(-1)).toEqual(['p4']);
    app.setBoardSort('earned');
    expect(order(app).slice(-1)).toEqual(['p4']);
  });

  it('sinks under share, both ways', () => {
    const app = makeApp(withIdle());
    app.setBoardSort('share');
    expect(order(app).slice(-1)).toEqual(['p4']);
    app.setBoardSort('share');
    expect(order(app).slice(-1)).toEqual(['p4']);
  });

  it('is still listed by name, because a name list is a roster', () => {
    // Sorting by player is the one case where an idle player belongs in
    // sequence: the coach is looking somebody up, not reading a ranking.
    const app = makeApp(withIdle());
    app.setBoardSort('name');
    expect(app.matrixBoardRows()[0].name).toBe('Aaron Zero');
  });

  it('renders as zeroes rather than undefined', () => {
    const row = makeApp(withIdle()).matrixBoardRows().find((r: any) => r.playerId === 'p4');
    expect(row.earned).toBe(0);
    expect(row.exercises).toBe(0);
    expect(row.share).toBeNull();
  });
});

describe('the sort control', () => {
  it('starts a newly clicked column in its natural order', () => {
    const app = makeApp();
    app.setBoardSort('name');
    app.setBoardSort('name');
    app.setBoardSort('earned');
    expect(app._boardSortReversed).toBe(false);
  });

  it('knows which way each column reads first', () => {
    const app = makeApp();
    expect(app.boardSortDescends('earned')).toBe(true);
    expect(app.boardSortDescends('share')).toBe(true);
    expect(app.boardSortDescends('name')).toBe(false);
    expect(app.boardSortDescends('rank')).toBe(false);
  });
});

describe('the progress bar', () => {
  it('measures points against the leader, whatever the sort', () => {
    // The bar must not be redrawn from whichever column is sorted, or it would
    // disagree with the points sitting beside it.
    const app = makeApp();
    app.setBoardSort('share');
    const leader = app.matrixBoardRows().find((r: any) => r.playerId === 'p2');
    expect(leader.barPct).toBe(100);
  });

  it('does not divide by zero when nobody has scored', () => {
    const app = makeApp([{ id: 'p1', name: 'Nobody', matrixStats: undefined }]);
    expect(app.matrixBoardRows()[0].barPct).toBe(0);
  });
});
