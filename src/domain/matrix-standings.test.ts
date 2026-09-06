/**
 * Joining derived standings onto the roster.
 *
 * The join is LEFT on purpose. Points live in a Postgres view rather than on
 * the player, so a squad member who has taken part in nothing has no standings
 * row at all — and must still appear on their own team's board at 0/0/0 rather
 * than disappearing from it.
 */
import { describe, it, expect } from 'vitest';
import { toMatrixStats, joinStandings } from './matrix-standings';

const player = (id: string, name: string) => ({ id, name });

const standing = (over: any = {}) => ({
  player_id: 'p1', wins: 3, draws: 1, losses: 2,
  games: 6, exercises: 4, earned: 7.5, available: 10,
  share: 75, rank: 1, ...over
});

describe('toMatrixStats', () => {
  it('maps a standings row', () => {
    expect(toMatrixStats(standing(), 99)).toEqual({
      wins: 3, draws: 1, losses: 2, games: 6, exercises: 4,
      earned: 7.5, available: 10, share: 75, rank: 1
    });
  });

  it('gives a player with no row zeroes rather than undefined', () => {
    const s = toMatrixStats(null, 20);
    expect(s.earned).toBe(0);
    expect(s.exercises).toBe(0);
    expect(s.rank).toBe(20);
  });

  it('leaves share null until a player has taken part in something', () => {
    // Null and zero mean different things: nothing attempted versus nothing
    // earned, and the board sorts them differently.
    expect(toMatrixStats(standing({ share: null }), 99).share).toBeNull();
    expect(toMatrixStats(null, 99).share).toBeNull();
    expect(toMatrixStats(standing({ share: 0 }), 99).share).toBe(0);
  });

  it('reads the columns migration 0009 replaced, when that is what it gets', () => {
    // The view's shape depends on which migrations a database has had, and
    // rendering `undefined` on a board is worse than one ?? per field.
    const old = { player_id: 'p1', wins: 1, draws: 0, losses: 0,
                  games: 3, points: 4.5, win_pct: 60, rank: 2 };
    const s = toMatrixStats(old, 99);
    expect(s.earned).toBe(4.5);
    expect(s.share).toBe(60);
    expect(s.exercises).toBe(3);
  });

  it('coerces numeric strings, which is what PostgREST returns for numeric', () => {
    const s = toMatrixStats(standing({ earned: '7.5', available: '10', share: '75' }), 99);
    expect(s.earned).toBe(7.5);
    expect(s.available).toBe(10);
    expect(s.share).toBe(75);
  });
});

describe('joinStandings', () => {
  const roster = [player('p1', 'Ranked'), player('p2', 'Unplayed')];

  it('attaches each player their own standings', () => {
    const out = joinStandings(roster, [standing({ player_id: 'p1', rank: 1 })]);
    expect(out[0].matrixStats.rank).toBe(1);
    expect(out[0].matrixStats.earned).toBe(7.5);
  });

  it('keeps a player who has taken part in nothing', () => {
    // They must not vanish from their own squad's board.
    const out = joinStandings(roster, [standing({ player_id: 'p1' })]);
    expect(out).toHaveLength(2);
    expect(out[1].name).toBe('Unplayed');
    expect(out[1].matrixStats.earned).toBe(0);
  });

  it('ranks an unplayed player one past the last ranked one', () => {
    // Derived from the squad, so it reads as "last" rather than as a magic
    // number like 999.
    const out = joinStandings(roster, [standing({ player_id: 'p1' })]);
    expect(out[1].matrixStats.rank).toBe(2);
  });

  it('gives everyone rank 1 when nobody has played', () => {
    const out = joinStandings(roster, []);
    expect(out.map(p => p.matrixStats.rank)).toEqual([1, 1]);
  });

  it('preserves the player fields it was given', () => {
    const out = joinStandings([{ id: 'p1', name: 'A', number: 7 }], []);
    expect(out[0].name).toBe('A');
    expect(out[0].number).toBe(7);
  });

  it('does not throw on a failed standings fetch', () => {
    // fetchMatrixStandings returns null on failure, which is not "nobody has
    // played" -- but the board must still render.
    expect(() => joinStandings(roster, null)).not.toThrow();
    expect(joinStandings(roster, null)).toHaveLength(2);
  });

  it('copes with an empty roster', () => {
    expect(joinStandings([], [standing()])).toEqual([]);
  });
});
