/**
 * The lineup board.
 *
 * A slot holds one player and a player holds one slot, so anything that
 * assigns either side has to displace what was there -- allowing both would
 * print a team card with twelve names on it.
 *
 * The drop rules are here rather than inside a pointer handler because
 * "dragging a starter onto the squad list takes them off the pitch" is a rule,
 * and a rule that only exists inside an event handler is one nobody can check.
 */
import { describe, it, expect } from 'vitest';
import {
  lineupFormations, lineupSlots, lineupSquad,
  assignLineupSlot, clearLineupSlot,
  lineupStarters, lineupBench, lineupRowsForSave,
  resolveLineupDrop, applyLineupDrop,
  lineupShortName, lineupGrade, fixturesWithoutLineup, lineupCardDensity
} from './lineup';

const squadOf = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Player ' + i, number: i + 1 }));

describe('formations', () => {
  const all = lineupFormations();

  it('offers the five formations the board draws', () => {
    expect(Object.keys(all).sort())
      .toEqual(['3-5-2', '4-2-3-1', '4-3-3', '4-4-1-1', '4-4-2']);
  });

  it('gives every formation exactly eleven slots', () => {
    for (const [name, slots] of Object.entries(all)) {
      expect(slots, name).toHaveLength(11);
    }
  });

  it('never repeats a slot name within a formation', () => {
    for (const [name, slots] of Object.entries(all)) {
      const names = slots.map(s => s.slot);
      expect(new Set(names).size, name).toBe(names.length);
    }
  });

  it('keeps every slot inside the pitch', () => {
    for (const [name, slots] of Object.entries(all)) {
      for (const s of slots) {
        expect(s.x, `${name} ${s.slot} x`).toBeGreaterThanOrEqual(0);
        expect(s.x, `${name} ${s.slot} x`).toBeLessThanOrEqual(100);
        expect(s.y, `${name} ${s.slot} y`).toBeGreaterThanOrEqual(0);
        expect(s.y, `${name} ${s.slot} y`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('gives every formation a goalkeeper', () => {
    for (const [name, slots] of Object.entries(all)) {
      expect(slots.some(s => s.slot === 'GK'), name).toBe(true);
    }
  });

  it('falls back to 4-4-2 for a formation it does not know', () => {
    expect(lineupSlots('9-0-1')).toEqual(all['4-4-2']);
  });
});

describe('lineupSquad', () => {
  it('sorts by shirt number', () => {
    const players = [
      { id: 'c', name: 'Third', number: 9 },
      { id: 'a', name: 'First', number: 1 }
    ];
    expect(lineupSquad(players).map(p => p.id)).toEqual(['a', 'c']);
  });

  it('puts unnumbered players last, not first', () => {
    // Number(null) is 0, which would otherwise sort them to the top.
    const players = [
      { id: 'none', name: 'Unnumbered', number: null },
      { id: 'one', name: 'Numbered', number: 1 }
    ];
    expect(lineupSquad(players).map(p => p.id)).toEqual(['one', 'none']);
  });

  it('breaks a tie on the name', () => {
    const players = [
      { id: 'b', name: 'Budde', number: null },
      { id: 'a', name: 'Alva', number: null }
    ];
    expect(lineupSquad(players).map(p => p.id)).toEqual(['a', 'b']);
  });

  it('omits deleted players', () => {
    const players = [
      { id: 'a', name: 'Here', number: 1 },
      { id: 'b', name: 'Gone', number: 2, is_deleted: true }
    ];
    expect(lineupSquad(players).map(p => p.id)).toEqual(['a']);
  });
});

describe('assignLineupSlot', () => {
  it('puts a player in a slot', () => {
    expect(assignLineupSlot({}, 'GK', 'p1')).toEqual({ GK: 'p1' });
  });

  it('takes the player off any slot they already held', () => {
    // One player, one slot: assigning must displace, never duplicate.
    const asg = { GK: 'p1' };
    expect(assignLineupSlot(asg, 'LB', 'p1')).toEqual({ LB: 'p1' });
  });

  it('displaces whoever was in the target slot', () => {
    expect(assignLineupSlot({ GK: 'p1' }, 'GK', 'p2')).toEqual({ GK: 'p2' });
  });

  it('clears the slot when given no player', () => {
    expect(assignLineupSlot({ GK: 'p1' }, 'GK', '')).toEqual({});
  });

  it('mutates the map it was given, as the original did', () => {
    const asg: Record<string, string> = {};
    assignLineupSlot(asg, 'GK', 'p1');
    expect(asg).toEqual({ GK: 'p1' });
  });
});

describe('clearLineupSlot', () => {
  it('empties one slot and leaves the rest', () => {
    const asg = { GK: 'p1', LB: 'p2' };
    clearLineupSlot(asg, 'GK');
    expect(asg).toEqual({ LB: 'p2' });
  });

  it('does not throw on a slot that was never filled', () => {
    expect(() => clearLineupSlot({}, 'GK')).not.toThrow();
  });
});

describe('starters and bench', () => {
  const squad = squadOf(14);
  const asg = { GK: 'p0', LB: 'p1', LCB: 'p2' };

  it('returns the assigned players in the formation\'s own order', () => {
    const out = lineupStarters(asg, squad, '4-4-2');
    expect(out.map(r => r.slot)).toEqual(['GK', 'LB', 'LCB']);
    expect(out.map(r => r.sort_order)).toEqual([0, 1, 2]);
  });

  it('carries the slot coordinates through to the starter row', () => {
    const gk = lineupStarters(asg, squad, '4-4-2')[0];
    expect(gk.x).toBe(50);
    expect(gk.y).toBe(10);
  });

  it('does not partition a starter onto the bench', () => {
    const starters = lineupStarters(asg, squad, '4-4-2').map(r => r.player.id);
    const bench = lineupBench(asg, squad, '4-4-2', null).map(p => p.id);
    expect(starters.filter(id => bench.includes(id))).toEqual([]);
  });

  it('benches everyone not starting when nobody is marked dressed', () => {
    expect(lineupBench(asg, squad, '4-4-2', null)).toHaveLength(14 - 3);
  });

  it('benches only the dressed players once some are marked', () => {
    const dressed = { p3: true, p4: true };
    expect(lineupBench(asg, squad, '4-4-2', dressed).map(p => p.id))
      .toEqual(['p3', 'p4']);
  });

  it('ignores an assignment pointing at a player who has left', () => {
    expect(lineupStarters({ GK: 'ghost' }, squad, '4-4-2')).toEqual([]);
  });
});

describe('lineupRowsForSave', () => {
  const squad = squadOf(13);
  const asg = { GK: 'p0', LB: 'p1' };

  it('marks starters and bench, and orders the bench after them', () => {
    const rows = lineupRowsForSave(asg, squad, '4-4-2', null);
    const starters = rows.filter(r => r.role === 'starter');
    const bench = rows.filter(r => r.role === 'bench');

    expect(starters).toHaveLength(2);
    expect(bench).toHaveLength(11);
    expect(Math.min(...bench.map(r => r.sort_order)))
      .toBeGreaterThan(Math.max(...starters.map(r => r.sort_order)));
  });

  it('gives a bench row no slot and no coordinates', () => {
    const bench = lineupRowsForSave(asg, squad, '4-4-2', null)
      .find(r => r.role === 'bench');
    expect(bench.slot).toBeNull();
    expect(bench.x).toBeNull();
    expect(bench.y).toBeNull();
  });
});

describe('resolveLineupDrop', () => {
  it('places a player on the slot they were dropped over', () => {
    expect(resolveLineupDrop({ playerId: 'p1', overSlot: 'GK' }))
      .toEqual({ action: 'place', playerId: 'p1', slot: 'GK' });
  });

  it('treats a drop back on the origin slot as a cancelled drag', () => {
    expect(resolveLineupDrop({ playerId: 'p1', fromSlot: 'GK', overSlot: 'GK' }))
      .toEqual({ action: 'none' });
  });

  it('takes a starter off the pitch when dropped on the squad list', () => {
    expect(resolveLineupDrop({ playerId: 'p1', fromSlot: 'GK', overSquad: true }))
      .toEqual({ action: 'remove', slot: 'GK' });
  });

  it('does nothing when a squad player is dropped back on the squad list', () => {
    expect(resolveLineupDrop({ playerId: 'p1', overSquad: true }))
      .toEqual({ action: 'none' });
  });

  it('does nothing when there is no player', () => {
    expect(resolveLineupDrop({ playerId: '', overSlot: 'GK' }))
      .toEqual({ action: 'none' });
  });

  it('does nothing on a drop over neither pitch nor list', () => {
    expect(resolveLineupDrop({ playerId: 'p1' })).toEqual({ action: 'none' });
  });
});

describe('applyLineupDrop', () => {
  it('carries out a place', () => {
    const asg: Record<string, string> = {};
    expect(applyLineupDrop(asg, { action: 'place', playerId: 'p1', slot: 'GK' })).toBe(true);
    expect(asg).toEqual({ GK: 'p1' });
  });

  it('carries out a remove', () => {
    const asg = { GK: 'p1' };
    expect(applyLineupDrop(asg, { action: 'remove', slot: 'GK' })).toBe(true);
    expect(asg).toEqual({});
  });

  it('reports that nothing happened for a no-op or a missing drop', () => {
    expect(applyLineupDrop({}, { action: 'none' })).toBe(false);
    expect(applyLineupDrop({}, null)).toBe(false);
  });
});

describe('lineupShortName', () => {
  it('shortens the surname to an initial', () => {
    expect(lineupShortName({ name: 'Cesar Alva' })).toBe('Cesar A.');
  });

  it('leaves a single name alone', () => {
    expect(lineupShortName({ name: 'Ronaldinho' })).toBe('Ronaldinho');
  });

  it('uses the last part of a three-part name', () => {
    expect(lineupShortName({ name: 'Juan Carlos Rivera' })).toBe('Juan R.');
  });

  it('returns an empty string for a missing name', () => {
    expect(lineupShortName({})).toBe('');
  });
});

describe('lineupGrade', () => {
  it('turns a written year into its number', () => {
    expect(lineupGrade({ classYear: 'Freshman' })).toBe('9');
    expect(lineupGrade({ classYear: 'Sophomore' })).toBe('10');
    expect(lineupGrade({ classYear: 'Junior' })).toBe('11');
    expect(lineupGrade({ classYear: 'Senior' })).toBe('12');
  });

  it('reads the snake_case column too', () => {
    expect(lineupGrade({ class_year: 'Senior' })).toBe('12');
  });

  it('pulls the year out of a mixed string', () => {
    expect(lineupGrade({ classYear: 'Senior (2027)' })).toBe('12');
  });

  it('passes anything else through rather than guessing', () => {
    expect(lineupGrade({ classYear: 'Year 13' })).toBe('Year 13');
  });

  it('returns an empty string when there is no grade', () => {
    expect(lineupGrade({})).toBe('');
  });
});

describe('fixturesWithoutLineup', () => {
  const schedule = [
    { id: 'm1', date: 'SEP 4 2026' },
    { id: 'm2', date: 'SEP 11 2026' },
    { id: 'm3', date: 'SEP 18 2026', is_deleted: true }
  ];

  it('lists only the fixtures with nothing saved against them', () => {
    const index = [{ match_id: 'm1' }];
    expect(fixturesWithoutLineup(schedule, index).map(m => m.id)).toEqual(['m2']);
  });

  it('omits deleted fixtures', () => {
    expect(fixturesWithoutLineup(schedule, []).map(m => m.id)).toEqual(['m1', 'm2']);
  });

  it('ignores an index row with no match id', () => {
    expect(fixturesWithoutLineup(schedule, [{ match_id: null }]).map(m => m.id))
      .toEqual(['m1', 'm2']);
  });
});

describe('lineupCardDensity', () => {
  it('keeps the bench in one column until it passes eight', () => {
    expect(lineupCardDensity(11, 8).benchCols).toBe(1);
    expect(lineupCardDensity(11, 9).benchCols).toBe(2);
  });

  it('shrinks the type as the card fills', () => {
    const small = lineupCardDensity(11, 5).font;   // 16 rows
    const large = lineupCardDensity(11, 18).font;  // 11 + 9 = 20 rows
    expect(large).toBeLessThan(small);
  });

  it('still returns a size for a squad larger than any real bench', () => {
    const d = lineupCardDensity(11, 60);
    expect(d.font).toBeGreaterThan(0);
    expect(d.benchCols).toBe(2);
  });
});
