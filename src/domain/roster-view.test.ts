/**
 * Narrowing the roster to a position group.
 *
 * A group is a role, and a role comes from the position number (0036): 1 the
 * goalkeeper, 2-6 defence, 7-11 attack. No text is matched, and there is no
 * midfield group because the numbering has no midfield role.
 */
import { describe, it, expect } from 'vitest';
import { filterRoster, rosterFilters, ROSTER_FILTERS } from './roster-view';

const p = (id: string, position: number | null) => ({ id, name: id, position } as any);

const squad = [p('gk', 1), p('cb', 4), p('lb', 3), p('dm', 6), p('rw', 7), p('st', 9), p('none', null)];

describe('filterRoster', () => {
  it('returns everyone for ALL', () => {
    expect(filterRoster(squad, 'ALL')).toHaveLength(squad.length);
  });

  it('finds the keeper at 1', () => {
    expect(filterRoster(squad, 'GK').map(x => x.id)).toEqual(['gk']);
  });

  it('finds defence at 2-6', () => {
    expect(filterRoster(squad, 'DEF').map(x => x.id)).toEqual(['cb', 'lb', 'dm']);
  });

  it('finds attack at 7-11', () => {
    expect(filterRoster(squad, 'FWD').map(x => x.id)).toEqual(['rw', 'st']);
  });

  it('leaves a player with no position out of every group but ALL', () => {
    for (const key of ['GK', 'DEF', 'FWD']) {
      expect(filterRoster(squad, key).some(x => x.id === 'none'), key).toBe(false);
    }
  });

  it('shows everyone for an unknown filter rather than nobody', () => {
    expect(filterRoster(squad, 'MID')).toHaveLength(squad.length);
  });

  it('treats a missing roster as empty rather than throwing', () => {
    expect(filterRoster(null as any, 'GK')).toEqual([]);
  });

  it('shows everyone for an empty filter', () => {
    expect(filterRoster(squad, '')).toHaveLength(squad.length);
  });
});

describe('rosterFilters', () => {
  it('offers All, Keepers, Defence and Attack — no Midfield', () => {
    expect(ROSTER_FILTERS.map(f => f.label)).toEqual(['All', 'Keepers', 'Defence', 'Attack']);
  });

  it('counts each chip, including an empty one', () => {
    expect(rosterFilters([p('a', 9), p('b', null)])).toEqual([
      { key: 'ALL', label: 'All', count: 2 },
      { key: 'GK', label: 'Keepers', count: 0 },
      { key: 'DEF', label: 'Defence', count: 0 },
      { key: 'FWD', label: 'Attack', count: 1 }
    ]);
  });

  it('shows every chip with a count of zero for an empty roster', () => {
    expect(rosterFilters([])).toEqual([
      { key: 'ALL', label: 'All', count: 0 },
      { key: 'GK', label: 'Keepers', count: 0 },
      { key: 'DEF', label: 'Defence', count: 0 },
      { key: 'FWD', label: 'Attack', count: 0 }
    ]);
  });
});
