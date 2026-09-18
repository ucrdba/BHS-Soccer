/**
 * Ordering one exercise's rows in the squad report.
 *
 * Emphasis and ordering only: every player stays in the table, including the
 * ones who attempted nothing. They are the players the report exists to
 * surface, so they sink to the bottom rather than dropping out — and they sink
 * whichever way the column points, because there is nothing to compare.
 */
import { describe, it, expect } from 'vitest';
import { sortSquadEntries, squadSortDescends } from './squad-report';

const P = (id: string, name: string) => ({ id, name });

const TIMED = [
  { player: P('p1', 'Cesar Alva'), attempts: 2, best: 250, record: null, short: false },
  { player: P('p2', 'Tom Budde'), attempts: 1, best: 290, record: null, short: true },
  { player: P('p3', 'Alain Renteria'), attempts: 0, best: null, record: null, short: false }
];

const COUNTED = [
  { player: P('p1', 'Cesar Alva'), attempts: 1, best: 2800, record: null, short: false },
  { player: P('p2', 'Tom Budde'), attempts: 1, best: 3100, record: null, short: false },
  { player: P('p3', 'Alain Renteria'), attempts: 0, best: null, record: null, short: false }
];

const WDL = [
  { player: P('p1', 'Cesar Alva'), attempts: 3, best: null, record: '1 - 1 - 1', wins: 1, draws: 1, losses: 1, short: false },
  { player: P('p2', 'Tom Budde'), attempts: 2, best: null, record: '2 - 0 - 0', wins: 2, draws: 0, losses: 0, short: false },
  { player: P('p3', 'Alain Renteria'), attempts: 0, best: null, record: '—', wins: 0, draws: 0, losses: 0, short: false }
];

const names = (rows: any[]) => rows.map(r => r.player.name);

describe('sorting by best', () => {
  it('puts the fastest first on a timed exercise', () => {
    expect(names(sortSquadEntries(TIMED, 'best', false, { timed: true })))
      .toEqual(['Cesar Alva', 'Tom Budde', 'Alain Renteria']);
  });

  it('puts the highest first on a counted one', () => {
    expect(names(sortSquadEntries(COUNTED, 'best', false, { timed: false })))
      .toEqual(['Tom Budde', 'Cesar Alva', 'Alain Renteria']);
  });

  it('keeps a player with nothing at the bottom when reversed', () => {
    const rows = sortSquadEntries(TIMED, 'best', true, { timed: true });
    expect(names(rows)).toEqual(['Tom Budde', 'Cesar Alva', 'Alain Renteria']);
  });
});

describe('sorting by attempts', () => {
  it('counts down by default, and never drops a player', () => {
    expect(names(sortSquadEntries(TIMED, 'attempts', false, { timed: true })))
      .toEqual(['Cesar Alva', 'Tom Budde', 'Alain Renteria']);
    expect(sortSquadEntries(TIMED, 'attempts', true, { timed: true })).toHaveLength(3);
  });
});

describe('sorting a W/D/L exercise by record', () => {
  it('orders on wins, then draws, with nobody who played sinking', () => {
    expect(names(sortSquadEntries(WDL, 'record', false, { outcomes: true })))
      .toEqual(['Tom Budde', 'Cesar Alva', 'Alain Renteria']);
  });

  it('reverses the players who played and leaves the rest at the bottom', () => {
    expect(names(sortSquadEntries(WDL, 'record', true, { outcomes: true })))
      .toEqual(['Cesar Alva', 'Tom Budde', 'Alain Renteria']);
  });
});

describe('sorting by name', () => {
  it('is alphabetical, and includes everyone', () => {
    expect(names(sortSquadEntries(TIMED, 'name', false, { timed: true })))
      .toEqual(['Alain Renteria', 'Cesar Alva', 'Tom Budde']);
  });

  it('reverses on a second click', () => {
    expect(names(sortSquadEntries(TIMED, 'name', true, { timed: true })))
      .toEqual(['Tom Budde', 'Cesar Alva', 'Alain Renteria']);
  });
});

describe('what a first click means', () => {
  it('reads a name upward and every figure downward', () => {
    expect(squadSortDescends('name')).toBe(false);
    expect(squadSortDescends('attempts')).toBe(true);
    expect(squadSortDescends('record')).toBe(true);
    // A time is "best first" either way; the flag is only about the arrow.
    expect(squadSortDescends('best')).toBe(true);
  });
});

describe('leaving the rows alone', () => {
  it('does not mutate what it was given', () => {
    const before = names(TIMED);
    sortSquadEntries(TIMED, 'name', false, { timed: true });
    expect(names(TIMED)).toEqual(before);
  });

  it('returns the rows unchanged when nothing is sorted yet', () => {
    expect(names(sortSquadEntries(TIMED, '', false, { timed: true }))).toEqual(names(TIMED));
  });
});
