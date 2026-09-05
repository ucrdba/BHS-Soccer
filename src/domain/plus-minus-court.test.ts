/**
 * The plus/minus court: the pitch, its positions, and what a gesture means.
 *
 * Distinct from data/plus-minus.ts, which replays the event log. This is the
 * screen the statistician actually touches during a match, so the rules that
 * matter here are the ones that are wrong silently: a twelfth player on the
 * pitch, two chips stacked on one spot, or a plus recorded while the clock is
 * stopped.
 */
import { describe, it, expect } from 'vitest';
import {
  pmClock, pmClockRunning, pmClockEverStarted,
  pmResolveTap, pmPosKey, pmPosVersion,
  pmClampPosition, pmPerRow, pmSpreadSlot, pmPositionFor,
  pmMaxOnPitch, pmResolveDrop, pmStartersFromLineup,
  pmColumns, pmSortedRows
} from './plus-minus-court';

describe('the match clock', () => {
  it('reads the base while stopped', () => {
    expect(pmClock(120, null)).toBe(120);
  });

  it('ticks forward from the base while running', () => {
    const since = 1_000_000;
    expect(pmClock(120, since, since + 30_000)).toBe(150);
  });

  it('is zero before anything has happened', () => {
    expect(pmClock(0, null)).toBe(0);
  });

  /**
   * Running and ever-started are different questions.
   *
   * Plus and minus are gated on RUNNING: stopped is stopped, and an event
   * recorded at half time is stamped at a minute that has already passed.
   * Ever-started only words the refusal.
   */
  it('distinguishes running from ever-started', () => {
    expect(pmClockRunning(null)).toBe(false);
    expect(pmClockRunning(1_000_000)).toBe(true);
  });

  it('reads ever-started from the log, not from the base', () => {
    // The base is zero both before kick-off AND straight after a reset, so
    // only the log distinguishes them.
    expect(pmClockEverStarted([])).toBe(false);
    expect(pmClockEverStarted([{ kind: 'on' }])).toBe(false);
    expect(pmClockEverStarted([{ kind: 'clock_start' }])).toBe(true);
  });
});

describe('pmResolveTap', () => {
  const tap = (o: any) => pmResolveTap({ armed: null, fingers: 1, rightClick: false, onPitch: true, ...o });

  it('makes one finger on the pitch a plus', () => {
    expect(tap({})).toEqual({ kind: 'plus' });
  });

  it('makes two fingers a minus', () => {
    expect(tap({ fingers: 2 })).toEqual({ kind: 'minus' });
  });

  it('makes a right click a minus', () => {
    expect(tap({ rightClick: true })).toEqual({ kind: 'minus' });
  });

  it('lets an armed button win over the gesture, and disarms', () => {
    expect(tap({ armed: 'goal', fingers: 2 })).toEqual({ kind: 'goal', disarm: true });
  });

  it('ignores a plain tap on a bench player', () => {
    // A bench player cannot have made a good play.
    expect(tap({ onPitch: false })).toEqual({ kind: null });
  });

  it('ignores a minus gesture on a bench player', () => {
    expect(tap({ onPitch: false, fingers: 2 })).toEqual({ kind: null });
  });

  it('still fires an armed button for a bench player', () => {
    expect(tap({ onPitch: false, armed: 'sub' })).toEqual({ kind: 'sub', disarm: true });
  });
});

describe('stored positions', () => {
  it('keys storage by match id, falling back to the fixture then a default', () => {
    expect(pmPosKey('m1', 'Beaumont v Yucaipa')).toBe('bhs_pm_pos_m1');
    expect(pmPosKey(null, 'Beaumont v Yucaipa')).toBe('bhs_pm_pos_Beaumont v Yucaipa');
    expect(pmPosKey(null, null)).toBe('bhs_pm_pos_default');
  });

  it('stamps a layout version so older positions can be dropped', () => {
    expect(pmPosVersion()).toBe(2);
  });
});

describe('pmClampPosition', () => {
  it('keeps a chip fully on the pitch', () => {
    expect(pmClampPosition(0, 0)).toEqual({ x: 8, y: 8 });
    expect(pmClampPosition(100, 100)).toEqual({ x: 92, y: 92 });
  });

  it('leaves a position already inside alone', () => {
    expect(pmClampPosition(50, 50)).toEqual({ x: 50, y: 50 });
  });

  it('treats an unreadable value as zero, then clamps it', () => {
    expect(pmClampPosition(NaN as any, 'x' as any)).toEqual({ x: 8, y: 8 });
  });
});

describe('pmPerRow', () => {
  it('fits three chips across a phone and four on a desktop', () => {
    expect(pmPerRow(600)).toBe(3);
    expect(pmPerRow(1024)).toBe(4);
  });

  it('switches at 700', () => {
    expect(pmPerRow(699)).toBe(3);
    expect(pmPerRow(700)).toBe(4);
  });
});

describe('pmSpreadSlot', () => {
  it('puts the keeper on the goal line rather than scaling them', () => {
    // A uniform stretch cannot separate the keeper from a 3-5-2 centre back
    // eight percent away on the same x.
    expect(pmSpreadSlot({ slot: 'GK', x: 50, y: 10 }).y).toBe(8);
  });

  it('pushes width out from the centre line', () => {
    const left = pmSpreadSlot({ slot: 'LB', x: 15, y: 25 });
    expect(left.x).toBeLessThan(15);
  });

  it('leaves a centred player centred', () => {
    expect(pmSpreadSlot({ slot: 'CM', x: 50, y: 46 }).x).toBe(50);
  });

  it('keeps every slot of every formation on the pitch', () => {
    for (const y of [10, 18, 25, 46, 52, 72, 82, 90]) {
      for (const x of [10, 15, 38, 50, 62, 85, 90]) {
        const p = pmSpreadSlot({ slot: 's', x, y });
        expect(p.x).toBeGreaterThanOrEqual(9);
        expect(p.x).toBeLessThanOrEqual(91);
        expect(p.y).toBeGreaterThanOrEqual(8);
        expect(p.y).toBeLessThanOrEqual(92);
      }
    }
  });

  it('keeps a keeper clear of a centre back standing in front of them', () => {
    // 3-5-2: CB at x=50,y=18 sits directly above the keeper at x=50,y=10.
    const gk = pmSpreadSlot({ slot: 'GK', x: 50, y: 10 });
    const cb = pmSpreadSlot({ slot: 'CB', x: 50, y: 18 });
    expect(cb.y - gk.y).toBeGreaterThan(14);
  });
});

describe('pmPositionFor', () => {
  it('uses a stored position when there is one', () => {
    expect(pmPositionFor({ p1: { x: 30, y: 40 } }, 'p1', 0, 11, 1024))
      .toEqual({ x: 30, y: 40 });
  });

  it('spreads an unplaced squad into a grid rather than stacking it', () => {
    const a = pmPositionFor({}, 'p1', 0, 11, 1024);
    const b = pmPositionFor({}, 'p2', 1, 11, 1024);
    expect(a).not.toEqual(b);
  });

  it('keeps a fourth row of an over-full pitch on the grass', () => {
    const p = pmPositionFor({}, 'p1', 15, 16, 1024);
    expect(p.y).toBeGreaterThanOrEqual(8);
    expect(p.y).toBeLessThanOrEqual(92);
  });
});

describe('pmResolveDrop', () => {
  const drop = (o: any) => pmResolveDrop({
    playerId: 'p1', wasOn: false, overPitch: false, overBench: false, onCount: 0, ...o
  });

  it('sends a bench player on when the pitch has room', () => {
    expect(drop({ overPitch: true, onCount: 10 })).toEqual({ kind: 'on' });
  });

  it('refuses a twelfth player and says why', () => {
    // Not a mistake anyone spots at the time: the minutes and the goal
    // differential are simply wrong afterwards, for everybody.
    expect(drop({ overPitch: true, onCount: 11 }))
      .toEqual({ kind: null, reason: 'full' });
  });

  it('treats a drop on another player as a substitution', () => {
    expect(drop({ overPitch: true, overPlayerId: 'p2', onCount: 11 }))
      .toEqual({ kind: 'sub', outId: 'p2' });
  });

  it('treats two players already on as a swap', () => {
    expect(drop({ wasOn: true, overPitch: true, overPlayerId: 'p2' }))
      .toEqual({ kind: 'swap', otherId: 'p2' });
  });

  it('treats a drop elsewhere on the pitch as a reposition, not a sub', () => {
    // Appends no event: where a player stands is not a statistic.
    expect(drop({ wasOn: true, overPitch: true })).toEqual({ kind: 'move' });
  });

  it('takes a player off when dropped on the bench', () => {
    expect(drop({ wasOn: true, overBench: true })).toEqual({ kind: 'off' });
  });

  it('does nothing for a bench player dropped on the bench', () => {
    expect(drop({ overBench: true })).toEqual({ kind: null });
  });

  it('does nothing without a player', () => {
    expect(drop({ playerId: '', overPitch: true })).toEqual({ kind: null });
  });

  it('ignores a drop on the player themselves', () => {
    expect(drop({ wasOn: true, overPitch: true, overPlayerId: 'p1' }))
      .toEqual({ kind: 'move' });
  });
});

describe('pmStartersFromLineup', () => {
  const lineup = (players: any[], formation = '4-4-2') => ({ formation, players });

  it('is empty without a lineup', () => {
    expect(pmStartersFromLineup(null)).toEqual([]);
  });

  it('takes the starters, in their saved order', () => {
    const out = pmStartersFromLineup(lineup([
      { player_id: 'b', role: 'starter', slot: 'LB', sort_order: 1 },
      { player_id: 'a', role: 'starter', slot: 'GK', sort_order: 0 }
    ]));
    expect(out.map(r => r.playerId)).toEqual(['a', 'b']);
  });

  it('leaves the bench off the pitch', () => {
    const out = pmStartersFromLineup(lineup([
      { player_id: 'a', role: 'starter', slot: 'GK', sort_order: 0 },
      { player_id: 'z', role: 'bench', sort_order: 100 }
    ]));
    expect(out.map(r => r.playerId)).toEqual(['a']);
  });

  it('never returns more than a full pitch', () => {
    const many = Array.from({ length: 16 }, (_, i) => ({
      player_id: 'p' + i, role: 'starter', slot: 'GK', sort_order: i
    }));
    expect(pmStartersFromLineup(lineup(many))).toHaveLength(pmMaxOnPitch());
  });

  it('prefers a nudged x/y over the formation slot', () => {
    const withXy = pmStartersFromLineup(lineup([
      { player_id: 'a', role: 'starter', slot: 'GK', sort_order: 0, x: 20, y: 60 }
    ]));
    const fromSlot = pmStartersFromLineup(lineup([
      { player_id: 'a', role: 'starter', slot: 'GK', sort_order: 0 }
    ]));
    expect(withXy[0]).not.toEqual(fromSlot[0]);
  });

  it('falls back to the slot when a lineup predates stored positions', () => {
    const out = pmStartersFromLineup(lineup([
      { player_id: 'a', role: 'starter', slot: 'GK', sort_order: 0 }
    ]));
    // Not piled at the origin.
    expect(out[0].x).toBeGreaterThan(0);
    expect(out[0].y).toBeGreaterThan(0);
  });

  it('skips a row with no player', () => {
    expect(pmStartersFromLineup(lineup([
      { player_id: null, role: 'starter', slot: 'GK', sort_order: 0 }
    ]))).toEqual([]);
  });
});

describe('the sheet', () => {
  const squad = [
    { id: 'p1', name: 'Cesar Alva', number: 7 },
    { id: 'p2', name: 'Tom Budde', number: 2 },
    { id: 'p3', name: 'Alain Renteria', number: null }
  ];
  const stats = new Map<string, any>([
    ['p1', { plus: 5, minus: 1, score: 4, secondsPlayed: 600, goals: 2 }],
    ['p2', { plus: 2, minus: 0, score: 2, secondsPlayed: 1200, goals: 0 }],
    ['p3', { plus: 0, minus: 0, score: 0, secondsPlayed: 0, goals: 0 }]
  ]);

  it('offers the ten columns the sheet draws', () => {
    expect(pmColumns().map(c => c.key)).toEqual(
      ['number', 'name', 'plus', 'minus', 'score', 'gd', 'mins', 'shots', 'goals', 'assists']);
  });

  it('sorts by minutes played by default, most first', () => {
    // At half time the question is who to change.
    expect(pmSortedRows(stats, squad, 'mins', false).map(r => r.p.id))
      .toEqual(['p2', 'p1', 'p3']);
  });

  it('reverses when asked', () => {
    expect(pmSortedRows(stats, squad, 'mins', true).map(r => r.p.id))
      .toEqual(['p3', 'p1', 'p2']);
  });

  it('sinks an unnumbered player whichever way the number column points', () => {
    expect(pmSortedRows(stats, squad, 'number', false)[2].p.id).toBe('p3');
    expect(pmSortedRows(stats, squad, 'number', true)[2].p.id).toBe('p3');
  });

  it('sorts names alphabetically', () => {
    expect(pmSortedRows(stats, squad, 'name', false).map(r => r.p.id))
      .toEqual(['p3', 'p1', 'p2']);
  });

  it('breaks a tie on the name so rows do not swap between redraws', () => {
    // The sheet redraws every second while the clock runs.
    const tied = [
      { id: 'b', name: 'Budde', number: 1 },
      { id: 'a', name: 'Alva', number: 2 }
    ];
    const none = new Map<string, any>([['a', { goals: 0 }], ['b', { goals: 0 }]]);
    expect(pmSortedRows(none, tied, 'goals', false).map(r => r.p.id)).toEqual(['a', 'b']);
  });

  it('falls back to minutes for a column it does not know', () => {
    expect(pmSortedRows(stats, squad, 'nonsense', false).map(r => r.p.id))
      .toEqual(['p2', 'p1', 'p3']);
  });

  it('copes with a player who has no statistics row yet', () => {
    const partial = new Map<string, any>([['p1', { secondsPlayed: 10 }]]);
    expect(() => pmSortedRows(partial, squad, 'mins', false)).not.toThrow();
  });
});
