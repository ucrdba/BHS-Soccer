/**
 * Narrowing the roster to a position group.
 *
 * The groups are keyword matches against whatever a coach typed in the
 * position column, because that column is free text that arrived from
 * spreadsheets: "CB", "Centre Back", "Center-back" and "Defender" all mean
 * the same thing to a reader and nothing to a string comparison.
 */
import { describe, it, expect } from 'vitest';
import { filterRoster, rosterFilters, ROSTER_FILTERS } from './roster-view';

const p = (id: string, position: string) => ({ id, name: id, position } as any);

const squad = [
  p('gk1', 'Goalkeeper'),
  p('cb1', 'Center Back'),
  p('lb1', 'Left Back'),
  p('cm1', 'Central Midfielder'),
  p('st1', 'Striker'),
  p('lw1', 'Winger'),
  p('none', '')
];

describe('filterRoster', () => {
  it('returns everyone for ALL', () => {
    expect(filterRoster(squad, 'ALL')).toHaveLength(squad.length);
  });

  it('finds keepers', () => {
    expect(filterRoster(squad, 'GK').map(x => x.id)).toEqual(['gk1']);
  });

  it('finds defenders however the position is written', () => {
    // 'back' catches Center Back and Left Back; 'defender' and 'def' catch
    // the other spellings the column actually holds.
    expect(filterRoster(squad, 'DEF').map(x => x.id)).toEqual(['cb1', 'lb1']);
    expect(filterRoster([p('d', 'Defender')], 'DEF')).toHaveLength(1);
    expect(filterRoster([p('d', 'DEF')], 'DEF')).toHaveLength(1);
  });

  it('finds midfielders', () => {
    expect(filterRoster(squad, 'MID').map(x => x.id)).toEqual(['cm1']);
  });

  it('finds forwards, including wingers and attacking mids', () => {
    expect(filterRoster(squad, 'FWD').map(x => x.id)).toEqual(['st1', 'lw1']);
    expect(filterRoster([p('c', 'CAM')], 'FWD')).toHaveLength(1);
  });

  it('ignores case', () => {
    expect(filterRoster([p('a', 'GOALKEEPER')], 'GK')).toHaveLength(1);
    expect(filterRoster([p('a', 'goalkeeper')], 'GK')).toHaveLength(1);
  });

  it('leaves a player with no position out of every group but ALL', () => {
    for (const key of ['GK', 'DEF', 'MID', 'FWD']) {
      expect(filterRoster(squad, key).some(x => x.id === 'none'), key).toBe(false);
    }
    expect(filterRoster(squad, 'ALL').some(x => x.id === 'none')).toBe(true);
  });

  it('returns everyone for a filter it does not know, rather than nobody', () => {
    // An empty roster reads as "there are no players", which is a lie.
    expect(filterRoster(squad, 'NONSENSE')).toHaveLength(squad.length);
    expect(filterRoster(squad, '')).toHaveLength(squad.length);
  });

  it('does not throw on a missing roster', () => {
    expect(filterRoster(null as any, 'ALL')).toEqual([]);
  });
});

describe('rosterFilters', () => {
  it('offers the five groups in their established order', () => {
    expect(rosterFilters(squad).map(f => f.key)).toEqual(['ALL', 'GK', 'DEF', 'MID', 'FWD']);
    expect(ROSTER_FILTERS.map(f => f.key)).toEqual(['ALL', 'GK', 'DEF', 'MID', 'FWD']);
  });

  it('counts how many each group would show', () => {
    // A chip that leads to an empty list is worth knowing about before it is
    // pressed.
    const byKey = Object.fromEntries(rosterFilters(squad).map(f => [f.key, f.count]));
    expect(byKey.ALL).toBe(7);
    expect(byKey.GK).toBe(1);
    expect(byKey.DEF).toBe(2);
    expect(byKey.MID).toBe(1);
    expect(byKey.FWD).toBe(2);
  });

  it('counts zero rather than omitting an empty group', () => {
    const byKey = Object.fromEntries(rosterFilters([p('a', 'Striker')]).map(f => [f.key, f.count]));
    expect(byKey.GK).toBe(0);
  });

  it('copes with an empty roster', () => {
    expect(rosterFilters([]).every(f => f.count === 0)).toBe(true);
  });
});
