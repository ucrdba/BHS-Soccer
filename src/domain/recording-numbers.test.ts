/**
 * Recording numbers.
 *
 * These are assigned by the coach in a block per squad and are what the paper
 * sheets carry through a season, so nothing here renumbers anybody on its
 * own: the functions PROPOSE and the coach accepts.
 *
 * The write planner is the part with a trap in it. `recording_number` is
 * unique per team, so swapping two players' numbers by writing one at a time
 * hits the constraint on the FIRST write even though the final state is
 * perfectly legal -- which is why anything whose number is being taken is
 * cleared to null before anything is set.
 */
import { describe, it, expect } from 'vitest';
import { duplicateNumbers, planNumberWrites } from './recording-numbers';


describe('duplicate numbers', () => {
  const a = (over: any = {}) =>
    ({ playerId: 'p1', name: 'Alva', current: null, value: null, ...over });

  it('finds a number used twice', () => {
    expect(duplicateNumbers([
      a({ playerId: 'p1', value: 7 }),
      a({ playerId: 'p2', value: 7 })
    ])).toEqual([7]);
  });

  it('finds nothing when every number is distinct', () => {
    expect(duplicateNumbers([
      a({ playerId: 'p1', value: 7 }),
      a({ playerId: 'p2', value: 8 })
    ])).toEqual([]);
  });

  it('ignores players with no number', () => {
    // Several unnumbered players is the normal state of a squad being
    // numbered for the first time.
    expect(duplicateNumbers([
      a({ playerId: 'p1', value: null }),
      a({ playerId: 'p2', value: null })
    ])).toEqual([]);
  });

  it('sorts what it found, so the message reads sensibly', () => {
    expect(duplicateNumbers([
      a({ playerId: 'p1', value: 9 }), a({ playerId: 'p2', value: 9 }),
      a({ playerId: 'p3', value: 3 }), a({ playerId: 'p4', value: 3 })
    ])).toEqual([3, 9]);
  });

  it('reports a number once however many share it', () => {
    expect(duplicateNumbers([
      a({ playerId: 'p1', value: 7 }),
      a({ playerId: 'p2', value: 7 }),
      a({ playerId: 'p3', value: 7 })
    ])).toEqual([7]);
  });
});

describe('planning the writes', () => {
  const a = (playerId: string, current: number | null, value: number | null) =>
    ({ playerId, name: playerId, current, value });

  it('writes NOTHING when nothing changed', () => {
    // A squad of twenty-five with no edits makes no writes.
    expect(planNumberWrites([a('p1', 7, 7), a('p2', 8, 8)])).toEqual([]);
  });

  it('writes only the rows that changed', () => {
    const out = planNumberWrites([a('p1', 7, 7), a('p2', 8, 9)]);
    expect(out).toEqual([{ playerId: 'p2', value: 9 }]);
  });

  it('CLEARS BOTH SIDES OF A SWAP FIRST', () => {
    // recording_number is unique per team, so writing one side of a swap
    // first hits the constraint even though the final state is legal.
    const out = planNumberWrites([a('p1', 7, 8), a('p2', 8, 7)]);

    expect(out.slice(0, 2)).toEqual([
      { playerId: 'p1', value: null },
      { playerId: 'p2', value: null }
    ]);
    expect(out.slice(2)).toEqual([
      { playerId: 'p1', value: 8 },
      { playerId: 'p2', value: 7 }
    ]);
  });

  it('clears the player whose number is being taken', () => {
    // p2 is not changing, but p1 wants their number.
    const out = planNumberWrites([a('p1', 5, 8), a('p2', 8, null)]);
    expect(out[0]).toEqual({ playerId: 'p2', value: null });
  });

  it('needs no clearing pass for a number nobody holds', () => {
    const out = planNumberWrites([a('p1', 7, 40)]);
    expect(out).toEqual([{ playerId: 'p1', value: 40 }]);
  });

  it('resolves a CHAIN without a collision', () => {
    // A takes B's number and B takes C's. Every number being taken is
    // cleared before anything is set.
    const out = planNumberWrites([a('p1', 1, 2), a('p2', 2, 3), a('p3', 3, 4)]);
    const clears = out.filter(w => w.value === null).map(w => w.playerId);

    expect(clears).toEqual(['p2', 'p3']);
    expect(out.slice(clears.length).map(w => w.value)).toEqual([2, 3, 4]);
  });

  it('handles a number being cleared', () => {
    const out = planNumberWrites([a('p1', 7, null)]);
    expect(out).toEqual([{ playerId: 'p1', value: null }]);
  });

  it('handles a number being given to somebody who had none', () => {
    const out = planNumberWrites([a('p1', null, 7)]);
    expect(out).toEqual([{ playerId: 'p1', value: 7 }]);
  });

  it('copes with nothing at all', () => {
    expect(planNumberWrites([])).toEqual([]);
    expect(planNumberWrites(null as any)).toEqual([]);
  });
});
