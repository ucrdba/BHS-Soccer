/**
 * Roster ordering.
 *
 * The distinction worth holding: this sorts on the SHIRT number, unlike the
 * matrix board and the session grid, which sort on the recording number. They
 * are different numbers, and the roster is the one place the shirt is what a
 * reader is looking for.
 *
 * Ported from the agreement tests that loaded the legacy view.
 */
import { describe, it, expect } from 'vitest';
import { comparePlayers, sortedPlayers } from './roster';

const squad = [
  { name: 'Tom Budde', number: 11 },
  { name: 'Cesar Alva', number: 9 },
  { name: 'Unnumbered Sub', number: null },
  { name: 'Alex Reyes', number: 2 }
];

describe('sorting by number', () => {
  it('puts the low shirt number first', () => {
    expect(sortedPlayers(squad, 'number').map(p => p.number))
      .toEqual([2, 9, 11, null]);
  });

  it('PUTS AN UNNUMBERED PLAYER LAST, not first', () => {
    // A missing number reads as 0 to parseInt, which would otherwise sort a
    // new player above the whole squad.
    const last = sortedPlayers(squad, 'number').pop()!;
    expect(last.name).toBe('Unnumbered Sub');
  });

  it('falls back to the name when two share a number', () => {
    const rows = [{ name: 'Zoe', number: 7 }, { name: 'Adam', number: 7 }];
    expect(sortedPlayers(rows, 'number').map(p => p.name)).toEqual(['Adam', 'Zoe']);
  });

  it('reads a number that arrives as text', () => {
    const rows = [{ name: 'A', number: '11' }, { name: 'B', number: '2' }];
    expect(sortedPlayers(rows, 'number').map(p => p.name)).toEqual(['B', 'A']);
  });
});

describe('sorting by name', () => {
  it('is alphabetical and ignores case', () => {
    const rows = [{ name: 'zoe' }, { name: 'Adam' }, { name: 'Ben' }];
    expect(sortedPlayers(rows, 'name').map(p => p.name)).toEqual(['Adam', 'Ben', 'zoe']);
  });

  it('is what any value other than "name" is not', () => {
    expect(sortedPlayers(squad, 'anything else').map(p => p.number))
      .toEqual([2, 9, 11, null]);
  });
});

describe('what the roster leaves out', () => {
  it('drops a deleted player, in either spelling of the flag', () => {
    // Rows are soft-deleted repo-wide, and both spellings reach this.
    const rows = [
      { name: 'A', number: 1 },
      { name: 'B', number: 2, is_deleted: true },
      { name: 'C', number: 3, isDeleted: true }
    ];
    expect(sortedPlayers(rows, 'number').map(p => p.name)).toEqual(['A']);
  });

  it('does not mutate the array it was given', () => {
    const rows = [{ name: 'B', number: 2 }, { name: 'A', number: 1 }];
    sortedPlayers(rows, 'number');
    expect(rows[0].name).toBe('B');
  });

  it('copes with nothing loaded yet', () => {
    expect(sortedPlayers(null as any, 'number')).toEqual([]);
  });
});

describe('comparing two players directly', () => {
  it('reports a name comparison', () => {
    expect(comparePlayers({ name: 'Adam' }, { name: 'Zoe' }, 'name')).toBeLessThan(0);
  });

  it('reports a number comparison', () => {
    expect(comparePlayers({ number: 2 }, { number: 9 }, 'number')).toBeLessThan(0);
  });
});
