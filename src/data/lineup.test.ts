/**
 * The lineup builder and the card it prints.
 *
 * A coach picks a formation, puts players in its slots, and hands the card to
 * the officials. The rules that carry the weight:
 *
 *   A slot holds one player and a player holds one slot. Allowing either to
 *   double up prints a card with twelve names on it, which is the one thing a
 *   lineup card must never do.
 *
 *   Changing formation keeps the players whose slot still exists. Dropping the
 *   whole XI because the coach tried 4-3-3 and went back would make the
 *   formation picker unusable.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import lineupSrc from '../../public/js/views/lineup.view.js?raw';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, lineupSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

const squad = () => [
  { id: 'p1', name: 'Kevin Corona', number: 1, classYear: 'Senior' },
  { id: 'p2', name: 'JP Davila', number: 4, classYear: '11' },
  { id: 'p3', name: 'Aiden Diaz', number: 9, classYear: 'Junior (2028)' },
  { id: 'p4', name: 'Blake Francis', number: null, classYear: 'Freshman' }
];

function makeApp(players: any[] = squad()): any {
  const app = Object.create(ctor.prototype);
  app.activeTeamId = 't1';
  app.data = { players, teams: [{ id: 't1', school_id: 's1', name: 'JV' }], schedule: [] };
  app._lineupAssign = {};
  app._lineupFormation = '4-4-2';
  app.renderLineupBody = () => {};
  return app;
}

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the formations', () => {
  it('all field eleven players', () => {
    const app = makeApp();
    const all = app.lineupFormations();
    Object.keys(all).forEach(name => {
      expect(all[name]).toHaveLength(11);
    });
  });

  it('give every slot a distinct label, since the label is the key', () => {
    // Assignments are keyed by slot, so a duplicate label would make two
    // positions share one player.
    const app = makeApp();
    const all = app.lineupFormations();
    Object.keys(all).forEach(name => {
      const slots = all[name].map((s: any) => s.slot);
      expect(new Set(slots).size).toBe(slots.length);
    });
  });

  it('keep every slot on the pitch', () => {
    const app = makeApp();
    const all = app.lineupFormations();
    Object.keys(all).forEach(name => {
      all[name].forEach((s: any) => {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(100);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(100);
      });
    });
  });

  it('put exactly one keeper nearest the goal line in each', () => {
    const app = makeApp();
    const all = app.lineupFormations();
    Object.keys(all).forEach(name => {
      const gk = all[name].filter((s: any) => s.slot === 'GK');
      expect(gk).toHaveLength(1);
      const lowest = Math.min(...all[name].map((s: any) => s.y));
      expect(gk[0].y).toBe(lowest);
    });
  });

  it('keeps every slot clear of the edge, so none is clipped', () => {
    // The pitch clips its overflow, and a slot is centred on its coordinate --
    // so a slot sitting on the boundary loses half of itself, including the
    // half you tap. The keeper is the one that gets close.
    const app = makeApp();
    const all = app.lineupFormations();
    Object.keys(all).forEach(name => {
      all[name].forEach((s: any) => {
        expect(s.y).toBeGreaterThanOrEqual(8);
        expect(s.y).toBeLessThanOrEqual(92);
        expect(s.x).toBeGreaterThanOrEqual(8);
        expect(s.x).toBeLessThanOrEqual(92);
      });
    });
  });

  it('falls back to a real formation when asked for one that does not exist', () => {
    expect(makeApp().lineupSlots('9-9-9')).toHaveLength(11);
  });
});

describe('placing a player', () => {
  it('puts them in the slot', () => {
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    expect(app._lineupAssign.GK).toBe('p1');
  });

  it('moves them rather than cloning them', () => {
    // A player in two slots would print twelve names on the card.
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    app.assignLineupSlot('LB', 'p1');
    expect(app._lineupAssign.GK).toBeUndefined();
    expect(app._lineupAssign.LB).toBe('p1');
  });

  it('displaces whoever was in the slot', () => {
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    app.assignLineupSlot('GK', 'p2');
    expect(app._lineupAssign.GK).toBe('p2');
    expect(Object.values(app._lineupAssign)).toEqual(['p2']);
  });

  it('empties the slot when given nobody', () => {
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    app.assignLineupSlot('GK', null);
    expect(app._lineupAssign.GK).toBeUndefined();
  });
});

describe('tapping', () => {
  it('places the player in hand', () => {
    const app = makeApp();
    app._lineupPicked = 'p1';
    app.tapLineupSlot('GK');
    expect(app._lineupAssign.GK).toBe('p1');
    expect(app._lineupPicked).toBeNull();
  });

  it('lifts a player back off when nothing is in hand', () => {
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    app._lineupPicked = null;
    app.tapLineupSlot('GK');
    expect(app._lineupAssign.GK).toBeUndefined();
    expect(app._lineupPicked).toBe('p1');
  });

  it('does nothing on an empty slot with empty hands', () => {
    const app = makeApp();
    app._lineupPicked = null;
    app.tapLineupSlot('GK');
    expect(app._lineupAssign.GK).toBeUndefined();
    expect(app._lineupPicked).toBeNull();
  });

  it('puts a picked player down when tapped again', () => {
    const app = makeApp();
    app.pickLineupPlayer('p1');
    app.pickLineupPlayer('p1');
    expect(app._lineupPicked).toBeNull();
  });
});

describe('changing formation', () => {
  it('keeps players whose slot still exists', () => {
    // GK and LB are in both shapes; trying a formation and going back must not
    // cost the coach the whole XI.
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    app.assignLineupSlot('LB', 'p2');
    app.setLineupFormation('4-3-3');
    expect(app._lineupAssign.GK).toBe('p1');
    expect(app._lineupAssign.LB).toBe('p2');
  });

  it('frees a player whose slot is gone', () => {
    const app = makeApp();
    app.assignLineupSlot('LM', 'p3');      // 4-4-2 has LM; 4-3-3 does not
    app.setLineupFormation('4-3-3');
    expect(app._lineupAssign.LM).toBeUndefined();
    expect(Object.values(app._lineupAssign)).not.toContain('p3');
  });
});

describe('the starting XI', () => {
  it('comes back in the formation order, not the order they were placed', () => {
    const app = makeApp();
    app.assignLineupSlot('LST', 'p3');
    app.assignLineupSlot('GK', 'p1');
    const xi = app.lineupStarters('4-4-2');
    expect(xi[0].slot).toBe('GK');
  });

  it('carries the slot and the coordinates', () => {
    // Both are stored: the slot is what prints, x/y is where it sits.
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    const [row] = app.lineupStarters('4-4-2');
    expect(row.slot).toBe('GK');
    expect(typeof row.x).toBe('number');
    expect(typeof row.y).toBe('number');
  });

  it('ignores a slot pointing at somebody no longer on the roster', () => {
    const app = makeApp();
    app._lineupAssign = { GK: 'gone' };
    expect(app.lineupStarters('4-4-2')).toEqual([]);
  });
});

describe('the bench', () => {
  it('is everyone not starting, by default', () => {
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    expect(app.lineupBench('4-4-2').map((p: any) => p.id)).toEqual(['p2', 'p3', 'p4']);
  });

  it('never lists a starter', () => {
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    expect(app.lineupBench('4-4-2').map((p: any) => p.id)).not.toContain('p1');
  });

  it('drops a player the coach leaves out', () => {
    const app = makeApp();
    app.toggleLineupBench('p4');
    expect(app.lineupBench('4-4-2').map((p: any) => p.id)).not.toContain('p4');
  });

  it('takes them back', () => {
    const app = makeApp();
    app.toggleLineupBench('p4');
    app.toggleLineupBench('p4');
    expect(app.lineupBench('4-4-2').map((p: any) => p.id)).toContain('p4');
  });
});

describe('the rows that get saved', () => {
  it('marks starters and bench distinctly', () => {
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    const rows = app.lineupRowsForSave('4-4-2');
    expect(rows.find((r: any) => r.player_id === 'p1').role).toBe('starter');
    expect(rows.find((r: any) => r.player_id === 'p2').role).toBe('bench');
  });

  it('never lists a player twice', () => {
    // The database enforces this too, but hitting that constraint mid-save
    // leaves the lineup empty.
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    app.assignLineupSlot('LB', 'p2');
    const ids = app.lineupRowsForSave('4-4-2').map((r: any) => r.player_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives the bench no slot or coordinates', () => {
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    const bench = app.lineupRowsForSave('4-4-2').filter((r: any) => r.role === 'bench');
    bench.forEach((r: any) => {
      expect(r.slot).toBeNull();
      expect(r.x).toBeNull();
    });
  });

  it('orders starters before the bench', () => {
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    const rows = app.lineupRowsForSave('4-4-2');
    const starter = rows.find((r: any) => r.role === 'starter');
    const sub = rows.find((r: any) => r.role === 'bench');
    expect(starter.sort_order).toBeLessThan(sub.sort_order);
  });
});

describe('what the card prints', () => {
  it('shortens a name to fit a slot on the pitch', () => {
    expect(makeApp().lineupShortName({ name: 'Kevin Corona' })).toBe('K. Corona');
  });

  it('copes with a single-word name', () => {
    expect(makeApp().lineupShortName({ name: 'Ronaldinho' })).toBe('Ronaldinho');
  });

  it('reduces every grade shape the roster actually holds to a year', () => {
    // These arrived from different imports and all three shapes are live.
    const app = makeApp();
    expect(app.lineupGrade({ classYear: 'Senior' })).toBe('12');
    expect(app.lineupGrade({ classYear: 'Junior (2028)' })).toBe('11');
    expect(app.lineupGrade({ classYear: '11' })).toBe('11');
    expect(app.lineupGrade({ classYear: 'Freshman' })).toBe('9');
    expect(app.lineupGrade({ classYear: 'Sophomore' })).toBe('10');
  });

  it('passes an unrecognised grade through rather than inventing one', () => {
    expect(makeApp().lineupGrade({ classYear: 'Post-grad' })).toBe('Post-grad');
  });

  it('is blank when no grade is recorded', () => {
    expect(makeApp().lineupGrade({})).toBe('');
  });
});

describe('the squad list', () => {
  it('reads in uniform number order', () => {
    expect(makeApp().lineupSquad().map((p: any) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('puts a player with no uniform number last, not first', () => {
    // Number(null) is 0, which would otherwise sort them above the whole squad.
    expect(makeApp().lineupSquad().slice(-1)[0].id).toBe('p4');
  });
});

describe('dragging a player', () => {
  /**
   * Drag and drop is built on Pointer Events, not HTML5 drag: dragstart never
   * fires on touch, and this is used on a phone at the ground.
   *
   * The pointer plumbing is browser behaviour and not worth simulating. What
   * IS worth pinning down is the decision a drop makes, which is why that
   * lives in resolveLineupDrop rather than inside the event handler.
   */

  it('places a player dropped on an empty slot', () => {
    const app = makeApp();
    expect(app.resolveLineupDrop({ playerId: 'p1', fromSlot: null, overSlot: 'GK' }))
      .toEqual({ action: 'place', playerId: 'p1', slot: 'GK' });
  });

  it('moves a starter dropped on a different slot', () => {
    const app = makeApp();
    expect(app.resolveLineupDrop({ playerId: 'p1', fromSlot: 'GK', overSlot: 'LB' }))
      .toEqual({ action: 'place', playerId: 'p1', slot: 'LB' });
  });

  it('does nothing when a player is dropped back where they started', () => {
    // Dropping a player on their own slot is how a drag gets cancelled.
    const app = makeApp();
    expect(app.resolveLineupDrop({ playerId: 'p1', fromSlot: 'GK', overSlot: 'GK' }))
      .toEqual({ action: 'none' });
  });

  it('takes a starter off when dropped on the squad list', () => {
    const app = makeApp();
    expect(app.resolveLineupDrop({ playerId: 'p1', fromSlot: 'GK', overSquad: true }))
      .toEqual({ action: 'remove', slot: 'GK' });
  });

  it('does nothing when a substitute is dropped back on the squad list', () => {
    // They were never on the pitch, so there is nothing to remove.
    const app = makeApp();
    expect(app.resolveLineupDrop({ playerId: 'p2', fromSlot: null, overSquad: true }))
      .toEqual({ action: 'none' });
  });

  it('does nothing when dropped on empty space', () => {
    const app = makeApp();
    expect(app.resolveLineupDrop({ playerId: 'p1', fromSlot: 'GK' }))
      .toEqual({ action: 'none' });
  });

  it('does nothing when there is no player in hand', () => {
    const app = makeApp();
    expect(app.resolveLineupDrop({ playerId: null, overSlot: 'GK' }))
      .toEqual({ action: 'none' });
  });
});

describe('carrying out a drop', () => {
  it('places the player on the pitch', () => {
    const app = makeApp();
    app.applyLineupDrop({ action: 'place', playerId: 'p1', slot: 'GK' });
    expect(app._lineupAssign.GK).toBe('p1');
  });

  it('takes the player off', () => {
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    app.applyLineupDrop({ action: 'remove', slot: 'GK' });
    expect(app._lineupAssign.GK).toBeUndefined();
  });

  it('still moves rather than clones when dropped on a second slot', () => {
    // The same rule the tap path obeys: one slot per player, or the card
    // prints twelve names.
    const app = makeApp();
    app.applyLineupDrop({ action: 'place', playerId: 'p1', slot: 'GK' });
    app.applyLineupDrop({ action: 'place', playerId: 'p1', slot: 'LB' });
    expect(Object.values(app._lineupAssign)).toEqual(['p1']);
    expect(app._lineupAssign.LB).toBe('p1');
  });

  it('reports whether anything actually changed', () => {
    const app = makeApp();
    expect(app.applyLineupDrop({ action: 'none' })).toBe(false);
    expect(app.applyLineupDrop({ action: 'place', playerId: 'p1', slot: 'GK' })).toBe(true);
  });
});

describe('the drag handles in the markup', () => {
  /** The delegated handler finds its targets by data attribute, so the
   *  markup has to carry them or nothing is draggable at all. */
  function render(app: any) {
    document.body.innerHTML = '<div id="lineupBody"></div>';
    app.renderLineupBody = ctor.prototype.renderLineupBody;
    app.attachLineupDrag = () => {};
    app.renderLineupBody();
    return document.getElementById('lineupBody')!;
  }

  it('marks every squad row as draggable', () => {
    const app = makeApp();
    const el = render(app);
    expect(el.querySelectorAll('.lineup-pick-main[data-player-id]')).toHaveLength(4);
  });

  it('marks a filled slot as draggable, so it can be dragged off', () => {
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    const el = render(app);
    const gk = el.querySelector('.lineup-slot[data-slot="GK"]')!;
    expect(gk.getAttribute('data-player-id')).toBe('p1');
  });

  it('leaves an empty slot without a player id, so a drag never starts on one', () => {
    const app = makeApp();
    const el = render(app);
    const gk = el.querySelector('.lineup-slot[data-slot="GK"]')!;
    expect(gk.getAttribute('data-player-id')).toBeNull();
  });

  it('gives every slot its label, since that is the drop target key', () => {
    const app = makeApp();
    const el = render(app);
    const slots = Array.from(el.querySelectorAll('.lineup-slot'))
      .map(s => s.getAttribute('data-slot'));
    expect(slots).toHaveLength(11);
    expect(new Set(slots).size).toBe(11);
  });
});

describe('fitting the card on one sheet', () => {
  /**
   * A lineup card that runs to a second page is useless — it is handed over at
   * the touchline and read at a glance. The XI is always eleven rows, but the
   * bench is whatever the squad has left, so the total runs from about twelve
   * to nearly forty and no single fixed size serves both.
   *
   * The thresholds are set against US Letter at 10mm margins, the smaller of
   * the two common sheets, so what fits there fits A4 too.
   */

  /**
   * Roughly how tall the card prints, in points, from the density it chose.
   * Letter at 10mm margins leaves about 736pt of usable height.
   */
  const heightOf = (app: any, starters: number, bench: number) => {
    const d = app.lineupCardDensity(starters, bench);
    const rows = starters + Math.ceil(bench / d.benchCols);
    const rowHeight = d.font + d.pad * 2 + 1;          // text + padding + rule
    const headings = 2 * (d.font + 6);                 // the two section labels
    const chrome = d.head + 30;                        // header block + signatures
    return rows * rowHeight + headings + chrome;
  };

  const LETTER = 736;

  it('fits a normal squad', () => {
    expect(heightOf(makeApp(), 11, 7)).toBeLessThan(LETTER);
  });

  it('fits a full squad of twenty-five', () => {
    expect(heightOf(makeApp(), 11, 14)).toBeLessThan(LETTER);
  });

  it('fits an unusually large squad', () => {
    expect(heightOf(makeApp(), 11, 25)).toBeLessThan(LETTER);
  });

  it('fits even an absurd one, rather than overflowing', () => {
    expect(heightOf(makeApp(), 11, 40)).toBeLessThan(LETTER);
  });

  it('splits a long bench into two columns, which is worth more than shrinking', () => {
    const app = makeApp();
    expect(app.lineupCardDensity(11, 14).benchCols).toBe(2);
    expect(app.lineupCardDensity(11, 5).benchCols).toBe(1);
  });

  it('keeps a short card readable rather than shrinking it needlessly', () => {
    // Scaling is for fitting, not a house style. A card with room to spare
    // should be set large enough to read at arm's length.
    expect(makeApp().lineupCardDensity(11, 4).font).toBeGreaterThanOrEqual(11);
  });

  it('never sets type too small to read', () => {
    const app = makeApp();
    [0, 7, 14, 25, 40].forEach(bench => {
      expect(app.lineupCardDensity(11, bench).font).toBeGreaterThanOrEqual(7.5);
    });
  });

  it('shrinks as the list grows, never the other way', () => {
    const app = makeApp();
    let last = Infinity;
    [0, 5, 10, 15, 20, 30].forEach(bench => {
      const f = app.lineupCardDensity(11, bench).font;
      expect(f).toBeLessThanOrEqual(last);
      last = f;
    });
  });

  it('gives the header less room than the roster', () => {
    // The header was three lines and cost a fifth of the page for things the
    // coach already knows.
    const d = makeApp().lineupCardDensity(11, 14);
    expect(d.head).toBeLessThan(20);
  });
});

describe('resetting the lineup', () => {
  /**
   * Clears the WORKING lineup only. Whatever was last saved stays untouched
   * until Save is pressed, which is what makes a mis-tap recoverable: close
   * the modal, open it again.
   */
  it('takes everyone off the pitch', () => {
    (window as any).confirm = () => true;
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    app.assignLineupSlot('LB', 'p2');
    app.resetLineup();
    expect(app._lineupAssign).toEqual({});
  });

  it('puts down whoever was in hand', () => {
    (window as any).confirm = () => true;
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    app._lineupPicked = 'p3';
    app.resetLineup();
    expect(app._lineupPicked).toBeNull();
  });

  it('makes the whole squad available again', () => {
    // A reset that left players marked "Out" would not be a reset.
    (window as any).confirm = () => true;
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    app.toggleLineupBench('p4');
    app.resetLineup();
    expect(app.lineupBench('4-4-2').map((p: any) => p.id)).toContain('p4');
  });

  it('asks first, since it discards real work', () => {
    (window as any).confirm = () => false;
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    app.resetLineup();
    expect(app._lineupAssign.GK).toBe('p1');
  });

  it('does not ask when the pitch is already empty', () => {
    // Nothing to lose, so nothing to confirm.
    let asked = 0;
    (window as any).confirm = () => { asked += 1; return true; };
    const app = makeApp();
    app.resetLineup();
    expect(asked).toBe(0);
    expect(app._lineupAssign).toEqual({});
  });

  it('says how many players are affected', () => {
    let msg = '';
    (window as any).confirm = (m: string) => { msg = m; return true; };
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    app.assignLineupSlot('LB', 'p2');
    app.resetLineup();
    expect(msg).toContain('2');
  });

  it('says the saved lineup is safe, so the way back is obvious', () => {
    let msg = '';
    (window as any).confirm = (m: string) => { msg = m; return true; };
    const app = makeApp();
    app.assignLineupSlot('GK', 'p1');
    app.resetLineup();
    expect(msg).toContain('Save lineup');
  });
});

describe('recalling and reusing a lineup', () => {
  /**
   * Recalling is automatic: opening a fixture that has a saved lineup loads
   * it. Reusing is explicit: pick another fixture and copy its arrangement,
   * which lands in the working lineup and is not written until Save.
   */
  const savedShape = () => ({
    formation: '4-3-3',
    players: [
      { player_id: 'p1', role: 'starter', slot: 'GK' },
      { player_id: 'p2', role: 'starter', slot: 'LB' },
      { player_id: 'p3', role: 'bench', slot: null }
    ]
  });

  it('loads the formation that was saved', () => {
    const app = makeApp();
    app.applySavedLineup(savedShape());
    expect(app._lineupFormation).toBe('4-3-3');
  });

  it('puts the starters back in their slots', () => {
    const app = makeApp();
    app.applySavedLineup(savedShape());
    expect(app._lineupAssign).toEqual({ GK: 'p1', LB: 'p2' });
  });

  it('restores who was on the bench', () => {
    const app = makeApp();
    app.applySavedLineup(savedShape());
    expect(app._lineupBench).toEqual({ p3: true });
  });

  it('leaves the whole squad available when no bench was recorded', () => {
    // An older lineup, or one saved before anyone was marked out.
    const app = makeApp();
    app.applySavedLineup({ formation: '4-4-2', players: [
      { player_id: 'p1', role: 'starter', slot: 'GK' }
    ] });
    expect(app._lineupBench).toBeNull();
  });

  it('ignores a starter row with no slot rather than dropping it somewhere', () => {
    const app = makeApp();
    app.applySavedLineup({ formation: '4-4-2', players: [
      { player_id: 'p1', role: 'starter', slot: null }
    ] });
    expect(app._lineupAssign).toEqual({});
  });

  it('reports that there was nothing to load', () => {
    expect(makeApp().applySavedLineup(null)).toBe(false);
  });
});

describe('choosing a lineup to copy', () => {
  const index = () => ([
    { match_id: null, formation: '4-4-2' },
    { match_id: 'm1', formation: '4-3-3' },
    { match_id: 'm2', formation: '3-5-2' }
  ]);

  function appWith(current: string | null) {
    const app = makeApp();
    app._lineupMatchId = current;
    app._lineupIndex = index();
    app.data.schedule = [
      { id: 'm1', opponent: 'Redlands', date: '09/12/2026' },
      { id: 'm2', opponent: 'Yucaipa', date: '09/19/2026' }
    ];
    return app;
  }

  it('never offers the lineup you are already editing', () => {
    // Copying a lineup onto itself is a no-op that looks like a broken button.
    const app = appWith('m1');
    expect(app.lineupCopySources().map((r: any) => r.match_id)).toEqual([null, 'm2']);
  });

  it('excludes the default lineup when that is what you are editing', () => {
    const app = appWith(null);
    expect(app.lineupCopySources().map((r: any) => r.match_id)).toEqual(['m1', 'm2']);
  });

  it('names each one by opponent and date', () => {
    const app = appWith(null);
    expect(app.lineupCopySources()[0].label).toBe('Redlands — 09/12/2026');
  });

  it('names the one with no fixture as the default', () => {
    const app = appWith('m1');
    expect(app.lineupCopySources()[0].label).toBe('Default lineup');
  });

  it('copes with a lineup whose fixture has since been deleted', () => {
    const app = appWith(null);
    app.data.schedule = [];
    expect(app.lineupCopySources()[0].label).toBe('A past fixture');
  });
});

describe('applying one lineup to every fixture', () => {
  /**
   * A season's shape is usually one lineup with a change or two per match, so
   * setting each fixture from scratch is the same work twenty times over.
   *
   * The rule that matters most here is what it REFUSES to do: a fixture that
   * already has a lineup keeps it. A bulk action that silently replaced a
   * carefully set XI would be unforgivable.
   */
  function appWith(schedule: any[], index: any[]) {
    const app = makeApp();
    app.data.schedule = schedule;
    app._lineupIndex = index;
    return app;
  }

  const fixtures = () => ([
    { id: 'm1', opponent: 'Redlands' },
    { id: 'm2', opponent: 'Yucaipa' },
    { id: 'm3', opponent: 'Beaumont' }
  ]);

  it('targets every fixture when none has a lineup', () => {
    const app = appWith(fixtures(), []);
    expect(app.fixturesWithoutLineup().map((m: any) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('leaves out a fixture that already has one', () => {
    const app = appWith(fixtures(), [{ match_id: 'm2' }]);
    expect(app.fixturesWithoutLineup().map((m: any) => m.id)).toEqual(['m1', 'm3']);
  });

  it('is not confused by the default lineup, which belongs to no fixture', () => {
    const app = appWith(fixtures(), [{ match_id: null }]);
    expect(app.fixturesWithoutLineup()).toHaveLength(3);
  });

  it('skips a deleted fixture', () => {
    const app = appWith([...fixtures(), { id: 'm4', opponent: 'Gone', is_deleted: true }], []);
    expect(app.fixturesWithoutLineup().map((m: any) => m.id)).not.toContain('m4');
  });

  it('targets nothing when every fixture is already set', () => {
    const app = appWith(fixtures(), [{ match_id: 'm1' }, { match_id: 'm2' }, { match_id: 'm3' }]);
    expect(app.fixturesWithoutLineup()).toEqual([]);
  });

  it('refuses to apply an empty pitch', async () => {
    // Writing eleven empty lineups across the season would be worse than
    // doing nothing.
    const app = appWith(fixtures(), []);
    document.body.innerHTML = '<span id="lineupError"></span>';
    let saved = 0;
    (window as any).supabaseService = { saveLineup: async () => { saved += 1; return { ok: true }; } };

    await app.applyLineupToAllFixtures();

    expect(saved).toBe(0);
    expect(document.getElementById('lineupError')!.textContent).toContain('Place some players');
  });

  it('writes one lineup per targeted fixture, and none for the rest', async () => {
    const app = appWith(fixtures(), [{ match_id: 'm2' }]);
    app.assignLineupSlot('GK', 'p1');
    document.body.innerHTML = '<span id="lineupError"></span>';
    (window as any).confirm = () => true;

    const wrote: string[] = [];
    (window as any).supabaseService = {
      saveLineup: async (_t: string, _s: string, matchId: string) => {
        wrote.push(matchId); return { ok: true };
      },
      fetchTeamLineups: async () => []
    };
    app.renderLineupSources = () => {};

    await app.applyLineupToAllFixtures();

    expect(wrote).toEqual(['m1', 'm3']);
  });

  it('does nothing when the confirmation is declined', async () => {
    const app = appWith(fixtures(), []);
    app.assignLineupSlot('GK', 'p1');
    document.body.innerHTML = '<span id="lineupError"></span>';
    (window as any).confirm = () => false;

    let saved = 0;
    (window as any).supabaseService = { saveLineup: async () => { saved += 1; return { ok: true }; } };

    await app.applyLineupToAllFixtures();
    expect(saved).toBe(0);
  });

  it('reports a failure rather than claiming success', async () => {
    const app = appWith(fixtures(), []);
    app.assignLineupSlot('GK', 'p1');
    document.body.innerHTML = '<span id="lineupError"></span>';
    (window as any).confirm = () => true;
    (window as any).supabaseService = {
      saveLineup: async () => ({ ok: false, error: 'You must coach this team.' }),
      fetchTeamLineups: async () => []
    };
    app.renderLineupSources = () => {};

    await app.applyLineupToAllFixtures();
    expect(document.getElementById('lineupError')!.textContent).toContain('failed');
  });
});
