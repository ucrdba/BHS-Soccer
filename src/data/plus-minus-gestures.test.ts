/**
 * What a gesture means on the plus/minus screen.
 *
 * A statistician is watching the match, not the phone. Every one of these
 * rules exists so that a tap made without looking records what was intended:
 *
 *   one tap  → plus        two fingers / right-click → minus
 *   drag     → substitution
 *   an armed event wins over both, because the button was pressed on purpose
 *
 * The pointer plumbing is browser behaviour and not worth simulating. The
 * DECISIONS are worth pinning down, which is why they live in
 * pmResolveTap/pmResolveDrop rather than inside an event handler.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import pmSrc from '../../public/js/views/plusminus.view.js?raw';
// plusminus reuses the lineup's formations rather than defining its own.
import lineupSrc from '../../public/js/views/lineup.view.js?raw';
import * as plusMinus from './plus-minus';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, lineupSrc, pmSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

function makeApp(): any {
  const app = Object.create(ctor.prototype);
  app.activeTeamId = 't1';
  app.data = {
    players: [
      { id: 'p1', name: 'Cesar Alva', recordingNumber: 1 },
      { id: 'p2', name: 'Tom Budde', recordingNumber: 2 }
    ],
    teams: [{ id: 't1', school_id: 's1', name: 'Varsity' }]
  };
  app._pmEvents = [];
  app._pmClockBase = 0;
  app._pmRunningSince = null;
  app._pmPeriod = 1;
  app._pmMatchId = null;              // no database in these tests
  app.renderPlusMinus = () => {};
  return app;
}

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  (window as any).plusMinus = plusMinus;
  (window as any).supabaseService = { isConfigured: () => false };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('tapping a player on the pitch', () => {
  const app = () => makeApp();

  it('one finger is a plus', () => {
    expect(app().pmResolveTap({ armed: null, fingers: 1, rightClick: false, onPitch: true }))
      .toEqual({ kind: 'plus' });
  });

  it('two fingers is a minus', () => {
    // Two fingers rather than a long press: a long press competes with the
    // drag gesture for the same half second and the two would fight.
    expect(app().pmResolveTap({ armed: null, fingers: 2, rightClick: false, onPitch: true }))
      .toEqual({ kind: 'minus' });
  });

  it('three fingers is still a minus, not a third thing', () => {
    expect(app().pmResolveTap({ armed: null, fingers: 3, rightClick: false, onPitch: true }).kind)
      .toBe('minus');
  });

  it('right-click is the minus on a desktop', () => {
    expect(app().pmResolveTap({ armed: null, fingers: 1, rightClick: true, onPitch: true }))
      .toEqual({ kind: 'minus' });
  });
});

describe('tapping a substitute', () => {
  it('does nothing on one finger', () => {
    // A player on the bench cannot have made a good play.
    expect(makeApp().pmResolveTap({ armed: null, fingers: 1, rightClick: false, onPitch: false }))
      .toEqual({ kind: null });
  });

  it('does nothing on two fingers either', () => {
    expect(makeApp().pmResolveTap({ armed: null, fingers: 2, rightClick: false, onPitch: false }))
      .toEqual({ kind: null });
  });
});

describe('an armed event', () => {
  it('wins over the plus gesture', () => {
    // The button was pressed on purpose a moment ago; the tap is the second
    // half of that, not a plus.
    expect(makeApp().pmResolveTap({ armed: 'goal', fingers: 1, rightClick: false, onPitch: true }))
      .toEqual({ kind: 'goal', disarm: true });
  });

  it('wins over the minus gesture too', () => {
    expect(makeApp().pmResolveTap({ armed: 'shot', fingers: 2, rightClick: false, onPitch: true }).kind)
      .toBe('shot');
  });

  it('works on a substitute, who can still be credited a goal', () => {
    // A player subbed off a moment before the ball crossed the line still
    // scored it, and the statistician is catching up.
    expect(makeApp().pmResolveTap({ armed: 'assist', fingers: 1, rightClick: false, onPitch: false }))
      .toEqual({ kind: 'assist', disarm: true });
  });

  it('disarms afterwards, so the next tap is a plus again', () => {
    expect(makeApp().pmResolveTap({ armed: 'goal', fingers: 1, rightClick: false, onPitch: true }).disarm)
      .toBe(true);
  });

  it('is cancelled by pressing the same button again', () => {
    const app = makeApp();
    app.pmArm('goal');
    expect(app._pmArmed).toBe('goal');
    app.pmArm('goal');
    expect(app._pmArmed).toBeNull();
  });

  it('is replaced by pressing a different button', () => {
    const app = makeApp();
    app.pmArm('goal');
    app.pmArm('shot');
    expect(app._pmArmed).toBe('shot');
  });
});

describe('dragging a player', () => {
  const app = () => makeApp();
  const drop = (over: any) => app().pmResolveDrop({
    playerId: 'p1', wasOn: false, overPitch: false, overBench: false, onCount: 0, ...over
  });

  it('onto the pitch sends them on', () => {
    expect(drop({ overPitch: true })).toEqual({ kind: 'on' });
  });

  it('onto the bench takes them off', () => {
    expect(drop({ wasOn: true, overBench: true })).toEqual({ kind: 'off' });
  });

  it('moves a player already on the pitch, rather than doing nothing', () => {
    // Dropping somewhere else on the pitch is a reposition, so the shape on
    // screen can be made to match the shape on the grass.
    expect(drop({ wasOn: true, overPitch: true, onCount: 1 })).toEqual({ kind: 'move' });
  });

  it('does nothing dropping a substitute back on the bench', () => {
    // How a drag gets cancelled, for a player who was never on.
    expect(drop({ overBench: true })).toEqual({ kind: null });
  });

  it('onto neither does nothing', () => {
    expect(drop({ wasOn: true, onCount: 1 })).toEqual({ kind: null });
  });

  it('with nobody in hand does nothing', () => {
    expect(drop({ playerId: null, overPitch: true })).toEqual({ kind: null });
  });
});

describe('eleven on the pitch', () => {
  /**
   * A twelfth player is not a mistake anyone spots at the time. The minutes
   * and the goal differential are simply wrong afterwards, for everybody, and
   * nothing on the screen ever said so.
   */
  const app = () => makeApp();
  const drop = (over: any) => app().pmResolveDrop({
    playerId: 'p1', wasOn: false, overPitch: true, overBench: false, onCount: 0, ...over
  });

  it('allows the eleventh', () => {
    expect(drop({ onCount: 10 })).toEqual({ kind: 'on' });
  });

  it('refuses the twelfth', () => {
    expect(drop({ onCount: 11 }).kind).toBeNull();
  });

  it('says why, rather than just doing nothing', () => {
    // A drag that silently fails reads as a broken drop target.
    expect(drop({ onCount: 11 }).reason).toBe('full');
  });

  it('still lets a player come OFF a full pitch', () => {
    expect(app().pmResolveDrop({
      playerId: 'p1', wasOn: true, overPitch: false, overBench: true, onCount: 11
    })).toEqual({ kind: 'off' });
  });

  it('records nothing when the pitch is full', async () => {
    const a = makeApp();
    a.data.players = Array.from({ length: 13 }, (_, i) => ({ id: `q${i}`, name: `P${i}` }));
    for (let i = 0; i < 11; i++) await a.pmAppend('on', `q${i}`);
    await a.pmMovePlayer('q11', true);
    expect(a.pmOnPitch()).toHaveLength(11);
    expect(a._pmError).toContain('11 players are already on');
  });

  it('lets the swap through once someone comes off', async () => {
    const a = makeApp();
    a.data.players = Array.from({ length: 13 }, (_, i) => ({ id: `q${i}`, name: `P${i}` }));
    for (let i = 0; i < 11; i++) await a.pmAppend('on', `q${i}`);
    await a.pmMovePlayer('q0', false);
    await a.pmMovePlayer('q11', true);
    expect(a.pmOnPitch()).toHaveLength(11);
    expect(a.pmOnPitch()).toContain('q11');
  });

  it('has a limit that is one line to change', () => {
    expect(makeApp().pmMaxOnPitch()).toBe(11);
  });
});

describe('recording through the screen', () => {
  it('appends a plus for a player on the pitch', async () => {
    const app = makeApp();
    await app.pmAppend('on', 'p1');
    await app.pmTapPlayer('p1', { fingers: 1 });
    expect(app._pmEvents.map((e: any) => e.kind)).toEqual(['on', 'plus']);
  });

  it('appends nothing for a substitute', async () => {
    const app = makeApp();
    await app.pmTapPlayer('p2', { fingers: 1 });
    expect(app._pmEvents).toEqual([]);
  });

  it('stamps events with the match clock, not wall time', async () => {
    // Playing time and goal differential are both computed against this.
    const app = makeApp();
    app._pmClockBase = 615;
    await app.pmAppend('plus', 'p1');
    expect(app._pmEvents[0].atSeconds).toBe(615);
  });

  it('does not advance the clock while it is stopped', () => {
    const app = makeApp();
    app._pmClockBase = 300;
    app._pmRunningSince = null;
    expect(app.pmClock()).toBe(300);
  });

  it('advances the clock while it runs', () => {
    const app = makeApp();
    app._pmClockBase = 300;
    app._pmRunningSince = Date.now() - 5000;
    expect(app.pmClock()).toBe(305);
  });
});

describe('the clock button', () => {
  it('starts the clock and records it', async () => {
    const app = makeApp();
    await app.pmToggleClock();
    expect(app._pmEvents[0].kind).toBe('clock_start');
    expect(app._pmRunningSince).not.toBeNull();
  });

  it('stops it and records that', async () => {
    const app = makeApp();
    await app.pmToggleClock();
    await app.pmToggleClock();
    expect(app._pmEvents.map((e: any) => e.kind)).toEqual(['clock_start', 'clock_stop']);
    expect(app._pmRunningSince).toBeNull();
  });

  it('stops the clock when a period ends', async () => {
    // A half that ends with the clock running keeps crediting everyone on the
    // pitch with time they did not play, and nobody notices until full time.
    const app = makeApp();
    await app.pmToggleClock();
    await app.pmEndPeriod();
    expect(app._pmRunningSince).toBeNull();
    expect(app._pmEvents.map((e: any) => e.kind))
      .toEqual(['clock_start', 'clock_stop', 'period']);
  });

  it('moves to the next period', async () => {
    const app = makeApp();
    await app.pmEndPeriod();
    expect(app._pmPeriod).toBe(2);
  });
});

describe('undo', () => {
  it('removes the most recent event', async () => {
    const app = makeApp();
    await app.pmAppend('on', 'p1');
    await app.pmAppend('plus', 'p1');
    await app.pmUndo();
    expect(app._pmEvents.map((e: any) => e.kind)).toEqual(['on']);
  });

  it('puts the clock back when a start is undone', async () => {
    // Undoing clock_start without stopping the clock would leave it counting
    // from an event that no longer exists.
    const app = makeApp();
    await app.pmToggleClock();
    await app.pmUndo();
    expect(app._pmRunningSince).toBeNull();
  });

  it('restarts the clock when a stop is undone', async () => {
    const app = makeApp();
    await app.pmToggleClock();
    await app.pmToggleClock();
    await app.pmUndo();
    expect(app._pmRunningSince).not.toBeNull();
  });

  it('says so when there is nothing to undo', async () => {
    const app = makeApp();
    await app.pmUndo();
    expect(app._pmError).toContain('Nothing to undo');
  });
});

describe('the numbers on screen', () => {
  it('derives every figure from the events', async () => {
    const app = makeApp();
    await app.pmAppend('clock_start');
    await app.pmAppend('on', 'p1');
    await app.pmAppend('plus', 'p1');
    await app.pmAppend('plus', 'p1');
    await app.pmAppend('minus', 'p1');
    await app.pmAppend('goal_for');

    const s = app.pmStats().get('p1');
    expect(s.plus).toBe(2);
    expect(s.minus).toBe(1);
    expect(s.score).toBe(1);
    expect(s.goalDiff).toBe(1);
  });

  it('leaves a substitute out of the goal differential', async () => {
    const app = makeApp();
    await app.pmAppend('on', 'p1');
    await app.pmAppend('goal_against');
    expect(app.pmStats().get('p1').goalDiff).toBe(-1);
    expect(app.pmStats().get('p2').goalDiff).toBe(0);
  });

  it('knows who is on the pitch', async () => {
    const app = makeApp();
    await app.pmAppend('on', 'p1');
    await app.pmAppend('on', 'p2');
    await app.pmAppend('off', 'p1');
    expect(app.pmOnPitch()).toEqual(['p2']);
  });
});

describe('sorting the sheet', () => {
  /**
   * The half-time sheet. Minutes played by default, because the question at
   * half time is who to change and scanning twenty-five alphabetical rows for
   * it wastes the interval.
   *
   * The tie-break matters more here than anywhere else: the sheet redraws
   * every second while the clock runs, and rows swapping places under the eye
   * reads as a fault. Every column falls back to the name so the order is
   * stable between redraws.
   */
  function sheet() {
    const app = makeApp();
    app.data.players = [
      { id: 'p1', name: 'Cesar Alva', recordingNumber: 7 },
      { id: 'p2', name: 'Tom Budde', recordingNumber: 2 },
      { id: 'p3', name: 'Alain Renteria', recordingNumber: null }
    ];
    const stats = new Map<string, any>([
      ['p1', { plus: 5, minus: 1, score: 4, goalDiff: 2, secondsPlayed: 300, shots: 3, goals: 1, assists: 0 }],
      ['p2', { plus: 1, minus: 4, score: -3, goalDiff: -1, secondsPlayed: 900, shots: 0, goals: 0, assists: 2 }],
      ['p3', { plus: 3, minus: 3, score: 0, goalDiff: 0, secondsPlayed: 600, shots: 1, goals: 0, assists: 1 }]
    ]);
    return { app, stats, squad: app.data.players };
  }

  const order = (app: any, stats: any, squad: any) =>
    app.pmSortedRows(stats, squad).map((r: any) => r.p.id);

  it('defaults to minutes played, most first', () => {
    const { app, stats, squad } = sheet();
    expect(order(app, stats, squad)).toEqual(['p2', 'p3', 'p1']);
  });

  it('sorts by score, best first on one click', () => {
    // Not blind ascending: one click should answer "who is doing well".
    const { app, stats, squad } = sheet();
    app.setPlusMinusSort('score');
    expect(order(app, stats, squad)).toEqual(['p1', 'p3', 'p2']);
  });

  it('reverses on a second click', () => {
    const { app, stats, squad } = sheet();
    app.setPlusMinusSort('score');
    app.setPlusMinusSort('score');
    expect(order(app, stats, squad)).toEqual(['p2', 'p3', 'p1']);
  });

  it('sorts by goal differential', () => {
    const { app, stats, squad } = sheet();
    app.setPlusMinusSort('gd');
    expect(order(app, stats, squad)).toEqual(['p1', 'p3', 'p2']);
  });

  it('sorts by minus, most first — who is giving it away', () => {
    const { app, stats, squad } = sheet();
    app.setPlusMinusSort('minus');
    expect(order(app, stats, squad)).toEqual(['p2', 'p3', 'p1']);
  });

  it('sorts by name A to Z', () => {
    const { app, stats, squad } = sheet();
    app.setPlusMinusSort('name');
    expect(order(app, stats, squad)).toEqual(['p3', 'p1', 'p2']);
  });

  it('sorts by recording number, lowest first', () => {
    const { app, stats, squad } = sheet();
    app.setPlusMinusSort('number');
    expect(order(app, stats, squad).slice(0, 2)).toEqual(['p2', 'p1']);
  });

  it('sinks a player with no recording number, both ways', () => {
    // Number(null) is 0 and would otherwise lead the sheet.
    const { app, stats, squad } = sheet();
    app.setPlusMinusSort('number');
    expect(order(app, stats, squad).slice(-1)).toEqual(['p3']);
    app.setPlusMinusSort('number');
    expect(order(app, stats, squad).slice(-1)).toEqual(['p3']);
  });

  it('starts a newly clicked column in its own direction', () => {
    const { app, stats, squad } = sheet();
    app.setPlusMinusSort('score');
    app.setPlusMinusSort('score');      // reversed
    app.setPlusMinusSort('gd');         // should be highest first again
    expect(order(app, stats, squad)).toEqual(['p1', 'p3', 'p2']);
  });

  it('breaks a tie by name, so the order holds between redraws', () => {
    // The sheet redraws every second while the clock runs. Two players level
    // on a figure must not swap places each time.
    const { app, squad } = sheet();
    const tied = new Map<string, any>([
      ['p1', { goals: 1, secondsPlayed: 0 }],
      ['p2', { goals: 1, secondsPlayed: 0 }],
      ['p3', { goals: 1, secondsPlayed: 0 }]
    ]);
    app.setPlusMinusSort('goals');
    const first = order(app, tied, squad);
    const second = order(app, tied, squad);
    expect(first).toEqual(second);
    expect(first).toEqual(['p3', 'p1', 'p2']);   // by name
  });

  it('gives every column a heading and a first direction', () => {
    const cols = makeApp().pmColumns();
    expect(cols.map((c: any) => c.key)).toEqual([
      'number', 'name', 'plus', 'minus', 'score', 'gd', 'mins', 'shots', 'goals', 'assists'
    ]);
    cols.forEach((c: any) => {
      expect(typeof c.label).toBe('string');
      expect(typeof c.desc).toBe('boolean');
    });
  });
});

describe('the sheet on a narrow screen', () => {
  /**
   * Ten columns do not fit a phone. Reported from the ground as "player, plus
   * and minus are not sortable on the phone" — a column past the edge with
   * nothing to scroll cannot be tapped, however sortable the code makes it.
   */
  function render() {
    const app = makeApp();
    app.data.players = [{ id: 'p1', name: 'Cesar Alva', recordingNumber: 1 }];
    (window as any).plusMinus = (window as any).plusMinus;
    document.body.innerHTML = app.renderPlusMinusTable(
      new Map([['p1', { plus: 1, minus: 0, score: 1, goalDiff: 0, secondsPlayed: 60, shots: 0, goals: 0, assists: 0 }]]),
      app.data.players
    );
    return app;
  }

  it('puts the table in its own scroller', () => {
    render();
    expect(document.querySelector('.pm-tablewrap')).not.toBeNull();
    expect(document.querySelector('.pm-tablewrap .pm-table')).not.toBeNull();
  });

  it('makes every one of the ten headings clickable', () => {
    // Including Player, Plus and Minus, the three reported as unreachable.
    render();
    const heads = Array.from(document.querySelectorAll('.pm-table th.sortable'));
    expect(heads).toHaveLength(10);
    heads.forEach(h => expect(h.getAttribute('onclick')).toMatch(/setPlusMinusSort/));
  });

  it('wires each heading to its own column', () => {
    render();
    const keys = Array.from(document.querySelectorAll('.pm-table th.sortable'))
      .map(h => (h.getAttribute('onclick') || '').match(/setPlusMinusSort\('([a-z]+)'\)/)?.[1]);
    expect(keys).toEqual([
      'number', 'name', 'plus', 'minus', 'score', 'gd', 'mins', 'shots', 'goals', 'assists'
    ]);
  });

  it('marks the column in force so the arrow is not guesswork', () => {
    const app = render();
    app.setPlusMinusSort('plus');
    document.body.innerHTML = app.renderPlusMinusTable(
      new Map([['p1', { plus: 1 }]]), app.data.players);
    const sorted = document.querySelector('.pm-table th.sorted')!;
    expect(sorted.textContent).toContain('Plus');
  });
});

describe('placing players on the pitch', () => {
  /**
   * Where a chip sits is PRESENTATION, not a statistic. It changes nothing
   * about plus, minus, goal differential or minutes — those come from the
   * event log — and it exists so the shape on screen matches the shape on the
   * grass.
   *
   * That is why a reposition appends no event: recording it would put noise in
   * the log that undo would then have to step back through.
   */
  function app() {
    const a = makeApp();
    a._pmPos = {};
    a.pmSavePositions = () => {};
    a.renderPlusMinus = () => {};
    return a;
  }

  it('keeps a position inside the pitch', () => {
    // Positions are the CENTRE of a chip; without a margin half of one sits
    // outside the boundary where it cannot be tapped.
    const a = app();
    expect(a.pmClampPosition(-40, 140)).toEqual({ x: 8, y: 92 });
    expect(a.pmClampPosition(50, 50)).toEqual({ x: 50, y: 50 });
  });

  it('remembers where a player was put', () => {
    const a = app();
    a.pmSetPosition('p1', 30, 70);
    expect(a._pmPos.p1).toEqual({ x: 30, y: 70 });
  });

  it('records NO event when a player is repositioned', async () => {
    const a = app();
    await a.pmAppend('on', 'p1');
    const before = a._pmEvents.length;
    await a.pmMovePlayer('p1', true, { x: 40, y: 60 });
    expect(a._pmEvents).toHaveLength(before);
    expect(a._pmPos.p1).toEqual({ x: 40, y: 60 });
  });

  it('puts a substitute where they were dropped as they come on', async () => {
    const a = app();
    await a.pmMovePlayer('p2', true, { x: 25, y: 15 });
    expect(a.pmOnPitch()).toEqual(['p2']);
    expect(a._pmPos.p2).toEqual({ x: 25, y: 15 });
  });

  it('lays the squad out in the chosen formation', async () => {
    const a = app();
    await a.pmAppend('on', 'p1');
    await a.pmAppend('on', 'p2');
    a.pmApplyFormation('4-4-2');

    const slots = a.lineupSlots('4-4-2');
    expect(a._pmPos.p1).toEqual({ x: slots[0].x, y: slots[0].y });
    expect(a._pmPos.p2).toEqual({ x: slots[1].x, y: slots[1].y });
  });

  it('reuses the lineup formations rather than a second list', () => {
    // Two lists of the same shapes drift, and 4-3-3 means the same thing on
    // both screens.
    const a = app();
    expect(Object.keys(a.lineupFormations())).toContain('4-3-3');
    expect(a.lineupSlots('4-3-3')).toHaveLength(11);
  });

  it('places only as many as are actually on', async () => {
    // A side playing with ten must not be left with a gap where a formation
    // says somebody should be.
    const a = app();
    await a.pmAppend('on', 'p1');
    a.pmApplyFormation('4-4-2');
    expect(Object.keys(a._pmPos)).toEqual(['p1']);
  });

  it('spreads unplaced players out rather than stacking them', () => {
    // A squad piled on the centre spot is unusable.
    const a = app();
    const spots = [0, 1, 2, 3].map(i => a.pmPositionFor(`q${i}`, i, 4));
    const keys = spots.map(s => `${s.x},${s.y}`);
    expect(new Set(keys).size).toBe(4);
  });

  it('prefers a saved position over the fallback', () => {
    const a = app();
    a.pmSetPosition('p1', 33, 44);
    expect(a.pmPositionFor('p1', 0, 4)).toEqual({ x: 33, y: 44 });
  });
});

describe('dropping one player onto another', () => {
  /**
   * Reported from a match: "when I drag a bench player over a field player
   * they switch position and now the stats are for the sub who just came in."
   *
   * What was happening: the substitute was simply placed at the same
   * coordinates. Two chips stacked, the newer drew over the older, and it read
   * exactly as though the field player's statistics had become the
   * substitute's. Both players were still on, both still accruing minutes, and
   * nothing on screen said so.
   *
   * Dropping a substitute on a player now means what anyone doing it means:
   * substitute them.
   */
  function app() {
    const a = makeApp();
    a._pmPos = {};
    a.pmSavePositions = () => {};
    a.renderPlusMinus = () => {};
    return a;
  }

  it('reads a substitute dropped on a player as a substitution', () => {
    expect(app().pmResolveDrop({
      playerId: 'p2', wasOn: false, overPitch: true, onCount: 1, overPlayerId: 'p1'
    })).toEqual({ kind: 'sub', outId: 'p1' });
  });

  it('reads two players already on as swapping places', () => {
    expect(app().pmResolveDrop({
      playerId: 'p2', wasOn: true, overPitch: true, onCount: 2, overPlayerId: 'p1'
    })).toEqual({ kind: 'swap', otherId: 'p1' });
  });

  it('ignores a player dropped on themselves', () => {
    // The dragged chip stays put rather than following the pointer, so it can
    // be the one under the finger at the end.
    expect(app().pmResolveDrop({
      playerId: 'p1', wasOn: true, overPitch: true, onCount: 1, overPlayerId: 'p1'
    })).toEqual({ kind: 'move' });
  });

  it('takes the field player OFF and brings the substitute on', async () => {
    const a = app();
    await a.pmAppend('on', 'p1');
    await a.pmMovePlayer('p2', true, { x: 50, y: 50 }, 'p1');
    expect(a.pmOnPitch()).toEqual(['p2']);
  });

  it('does not leave both on the pitch', async () => {
    // The bug: both were on, both accruing minutes, one hidden under the other.
    const a = app();
    await a.pmAppend('on', 'p1');
    await a.pmMovePlayer('p2', true, { x: 50, y: 50 }, 'p1');
    expect(a.pmOnPitch()).not.toContain('p1');
    expect(a.pmOnPitch()).toHaveLength(1);
  });

  it("keeps each player's own statistics", async () => {
    // The reported symptom. The one going off keeps what they earned; the one
    // coming on starts from their own record, not the other's.
    const a = app();
    await a.pmAppend('on', 'p1');
    await a.pmAppend('plus', 'p1');
    await a.pmAppend('plus', 'p1');
    await a.pmMovePlayer('p2', true, { x: 50, y: 50 }, 'p1');

    expect(a.pmStats().get('p1').plus).toBe(2);
    expect(a.pmStats().get('p2').plus).toBe(0);
  });

  it('puts the substitute in the position being vacated', async () => {
    const a = app();
    await a.pmAppend('on', 'p1');
    a.pmSetPosition('p1', 30, 70);
    await a.pmMovePlayer('p2', true, { x: 5, y: 5 }, 'p1');
    expect(a._pmPos.p2).toEqual({ x: 30, y: 70 });
  });

  it('substitutes onto a FULL pitch, which is when it is actually used', async () => {
    // The one going off has to be recorded first, or an eleventh-and-twelfth
    // pair exists for an instant and the limit refuses the player coming on.
    const a = app();
    a.data.players = Array.from({ length: 13 }, (_, i) => ({ id: `q${i}`, name: `P${i}` }));
    for (let i = 0; i < 11; i++) await a.pmAppend('on', `q${i}`);

    await a.pmMovePlayer('q11', true, { x: 50, y: 50 }, 'q3');

    expect(a.pmOnPitch()).toHaveLength(11);
    expect(a.pmOnPitch()).toContain('q11');
    expect(a.pmOnPitch()).not.toContain('q3');
  });

  it('records the substitution as two events, so it can be undone', async () => {
    const a = app();
    await a.pmAppend('on', 'p1');
    await a.pmMovePlayer('p2', true, { x: 50, y: 50 }, 'p1');
    expect(a._pmEvents.map((e: any) => `${e.kind}:${e.playerId}`))
      .toEqual(['on:p1', 'off:p1', 'on:p2']);
  });

  it('exchanges positions when both are already on, recording nothing', async () => {
    const a = app();
    await a.pmAppend('on', 'p1');
    await a.pmAppend('on', 'p2');
    a.pmSetPosition('p1', 20, 20);
    a.pmSetPosition('p2', 80, 80);
    const before = a._pmEvents.length;

    await a.pmMovePlayer('p2', true, { x: 20, y: 20 }, 'p1');

    expect(a._pmPos.p2).toEqual({ x: 20, y: 20 });
    expect(a._pmPos.p1).toEqual({ x: 80, y: 80 });
    expect(a._pmEvents).toHaveLength(before);
    expect(a.pmOnPitch()).toHaveLength(2);
  });
});

describe('starting from the saved lineup', () => {
  /**
   * A statistician should not be arranging eleven players at kickoff. The
   * coach already set a lineup, so the pitch starts from it.
   *
   * The guard that matters: only for a match nobody has started. "Started"
   * means any player has EVER been sent on, not who is on now — a match where
   * everyone was substituted off is finished, not empty, and repopulating it
   * would put eleven players back on at full time.
   */
  function app() {
    const a = makeApp();
    a._pmPos = {};
    a.pmSavePositions = () => {};
    a.renderPlusMinus = () => {};
    return a;
  }

  const lineup = (over: any = {}) => ({
    formation: '4-4-2',
    players: [
      { player_id: 'p1', role: 'starter', slot: 'GK', x: 50, y: 10, sort_order: 0 },
      { player_id: 'p2', role: 'starter', slot: 'LB', x: 15, y: 25, sort_order: 1 },
      { player_id: 'p3', role: 'bench', slot: null, x: null, y: null, sort_order: 100 }
    ],
    ...over
  });

  it('takes the starters', () => {
    expect(app().pmStartersFromLineup(lineup()).map((p: any) => p.playerId))
      .toEqual(['p1', 'p2']);
  });

  it('leaves the bench off the pitch', () => {
    expect(app().pmStartersFromLineup(lineup()).map((p: any) => p.playerId))
      .not.toContain('p3');
  });

  it('puts each one where the lineup had them', () => {
    const [gk] = app().pmStartersFromLineup(lineup());
    expect(gk).toEqual({ playerId: 'p1', x: 50, y: 10 });
  });

  it('falls back to the formation slot when the lineup has no coordinates', () => {
    // A lineup saved before positions were stored must still lay out, rather
    // than piling everyone at the origin.
    const a = app();
    const out = a.pmStartersFromLineup(lineup({
      players: [{ player_id: 'p1', role: 'starter', slot: 'LB', x: null, y: null, sort_order: 0 }]
    }));
    const lb = a.lineupSlots('4-4-2').find((s: any) => s.slot === 'LB');
    expect(out[0]).toEqual({ playerId: 'p1', x: lb.x, y: lb.y });
  });

  it('keeps the formation order', () => {
    const out = app().pmStartersFromLineup(lineup({
      players: [
        { player_id: 'p2', role: 'starter', slot: 'LB', sort_order: 5 },
        { player_id: 'p1', role: 'starter', slot: 'GK', sort_order: 1 }
      ]
    }));
    expect(out.map((p: any) => p.playerId)).toEqual(['p1', 'p2']);
  });

  it('never takes more than the pitch holds', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      player_id: `q${i}`, role: 'starter', slot: 'GK', sort_order: i
    }));
    expect(app().pmStartersFromLineup(lineup({ players: many }))).toHaveLength(11);
  });

  it('copes with no lineup at all', () => {
    expect(app().pmStartersFromLineup(null)).toEqual([]);
    expect(app().pmStartersFromLineup({ players: [] })).toEqual([]);
  });

  it('keeps every starter inside the pitch', () => {
    const out = app().pmStartersFromLineup(lineup({
      players: [{ player_id: 'p1', role: 'starter', slot: 'GK', x: -20, y: 300, sort_order: 0 }]
    }));
    expect(out[0].x).toBeGreaterThanOrEqual(8);
    expect(out[0].y).toBeLessThanOrEqual(92);
  });
});

describe('seeding a match from the lineup', () => {
  function app(events: any[] = []) {
    const a = makeApp();
    a._pmEvents = events;
    a._pmPos = {};
    a._pmMatchFixture = 'm1';
    a.pmSavePositions = () => {};
    a.renderPlusMinus = () => {};
    return a;
  }

  const withLineup = (fixture: any, fallback: any = null) => {
    (window as any).supabaseService = {
      isConfigured: () => true,
      fetchLineup: async (_t: string, matchId: string | null) =>
        matchId ? fixture : fallback,
      appendStatEvent: async () => ({ ok: true, id: 'e1' })
    };
  };

  const L = {
    formation: '4-4-2',
    players: [
      { player_id: 'p1', role: 'starter', slot: 'GK', x: 50, y: 10, sort_order: 0 },
      { player_id: 'p2', role: 'starter', slot: 'LB', x: 15, y: 25, sort_order: 1 }
    ]
  };

  it('sends the lineup onto the pitch', async () => {
    const a = app();
    withLineup(L);
    await a.pmSeedFromLineup();
    expect(a.pmOnPitch()).toEqual(['p1', 'p2']);
  });

  it('places them where the lineup had them', async () => {
    const a = app();
    withLineup(L);
    await a.pmSeedFromLineup();
    expect(a._pmPos.p1).toEqual({ x: 50, y: 10 });
  });

  it("adopts the lineup's formation", async () => {
    const a = app();
    withLineup({ ...L, formation: '4-3-3' });
    await a.pmSeedFromLineup();
    expect(a._pmFormation).toBe('4-3-3');
  });

  it('does nothing for a match already under way', async () => {
    // Anyone ever sent on means this match has started.
    const a = app([{ kind: 'on', playerId: 'p9', atSeconds: 0 }]);
    withLineup(L);
    expect(await a.pmSeedFromLineup()).toBe(false);
    expect(a.pmOnPitch()).toEqual(['p9']);
  });

  it('does nothing for a FINISHED match, where everyone came off', async () => {
    // The pitch is empty but the match is over. Repopulating it would put
    // eleven players back on at full time.
    const a = app([
      { kind: 'on', playerId: 'p9', atSeconds: 0 },
      { kind: 'off', playerId: 'p9', atSeconds: 2700 }
    ]);
    withLineup(L);
    expect(await a.pmSeedFromLineup()).toBe(false);
    expect(a.pmOnPitch()).toEqual([]);
  });

  it("prefers this fixture's lineup over the default one", async () => {
    const a = app();
    withLineup(L, { formation: '3-5-2', players: [
      { player_id: 'zz', role: 'starter', slot: 'GK', x: 50, y: 10, sort_order: 0 }
    ] });
    await a.pmSeedFromLineup();
    expect(a.pmOnPitch()).toEqual(['p1', 'p2']);
  });

  it('falls back to the default lineup when the fixture has none', async () => {
    const a = app();
    withLineup(null, L);
    await a.pmSeedFromLineup();
    expect(a.pmOnPitch()).toEqual(['p1', 'p2']);
  });

  it('does nothing when there is no lineup anywhere', async () => {
    const a = app();
    withLineup(null, null);
    expect(await a.pmSeedFromLineup()).toBe(false);
    expect(a.pmOnPitch()).toEqual([]);
  });
});

describe('clearing the pitch', () => {
  /**
   * Recorded as `off` events at the current clock rather than deleting
   * anything. The log is append-only, so everything earned up to that point —
   * plus, minus, goal differential, minutes — stays exactly as it was.
   * Clearing the pitch is something that HAPPENED, not something that unhappens.
   */
  function app() {
    const a = makeApp();
    a._pmPos = {};
    a.pmSavePositions = () => {};
    a.renderPlusMinus = () => {};
    return a;
  }

  it('takes everyone off', async () => {
    (window as any).confirm = () => true;
    const a = app();
    await a.pmAppend('on', 'p1');
    await a.pmAppend('on', 'p2');
    await a.pmResetPitch();
    expect(a.pmOnPitch()).toEqual([]);
  });

  it('keeps what every player earned', async () => {
    // The whole reason it is an event and not a deletion.
    (window as any).confirm = () => true;
    const a = app();
    await a.pmAppend('on', 'p1');
    await a.pmAppend('plus', 'p1');
    await a.pmAppend('goal_for');
    await a.pmResetPitch();

    const s = a.pmStats().get('p1');
    expect(s.plus).toBe(1);
    expect(s.goalDiff).toBe(1);
  });

  it('stops minutes counting', async () => {
    (window as any).confirm = () => true;
    const a = app();
    await a.pmAppend('clock_start');
    await a.pmAppend('on', 'p1');
    a._pmClockBase = 600;
    await a.pmResetPitch();
    a._pmClockBase = 1200;

    // Ten minutes on, then off: the next ten do not count.
    expect(a.pmStats().get('p1').secondsPlayed).toBe(600);
  });

  it('asks first, since it stops every player at once', async () => {
    (window as any).confirm = () => false;
    const a = app();
    await a.pmAppend('on', 'p1');
    await a.pmResetPitch();
    expect(a.pmOnPitch()).toEqual(['p1']);
  });

  it('says so when the pitch is already empty', async () => {
    const a = app();
    await a.pmResetPitch();
    expect(a._pmError).toContain('Nobody is on');
  });
});

describe('loading the lineup on demand', () => {
  function app(events: any[] = []) {
    const a = makeApp();
    a._pmEvents = events;
    a._pmPos = {};
    a._pmMatchFixture = 'm1';
    a.pmSavePositions = () => {};
    a.renderPlusMinus = () => {};
    return a;
  }

  const L = {
    formation: '4-4-2',
    players: [
      { player_id: 'p1', role: 'starter', slot: 'GK', x: 50, y: 10, sort_order: 0 },
      { player_id: 'p2', role: 'starter', slot: 'LB', x: 15, y: 25, sort_order: 1 }
    ]
  };

  const withLineup = (l: any) => {
    (window as any).supabaseService = {
      isConfigured: () => true,
      fetchLineup: async () => l,
      appendStatEvent: async () => ({ ok: true, id: 'e1' })
    };
  };

  it('loads it even though the match has already started', async () => {
    // The automatic version refuses this, which is right for opening a match
    // and wrong once a coach has cleared the pitch and asked for it back.
    const a = app([
      { kind: 'on', playerId: 'p9', atSeconds: 0 },
      { kind: 'off', playerId: 'p9', atSeconds: 100 }
    ]);
    withLineup(L);
    (window as any).confirm = () => true;

    await a.pmLoadLineup();
    expect(a.pmOnPitch()).toEqual(['p1', 'p2']);
  });

  it('leaves a player who is already on exactly where they are', async () => {
    // Topping up a part-filled pitch must not restart anybody's minutes.
    const a = app();
    withLineup(L);
    (window as any).confirm = () => true;
    await a.pmAppend('on', 'p1');
    const before = a._pmEvents.length;

    await a.pmLoadLineup();

    expect(a.pmOnPitch()).toEqual(['p1', 'p2']);
    expect(a._pmEvents).toHaveLength(before + 1);      // only p2 was added
  });

  it('never takes the pitch past eleven', async () => {
    const a = app();
    a.data.players = Array.from({ length: 15 }, (_, i) => ({ id: `q${i}`, name: `P${i}` }));
    withLineup({ formation: '4-4-2', players: Array.from({ length: 11 }, (_, i) => ({
      player_id: `z${i}`, role: 'starter', slot: 'GK', x: 50, y: 10, sort_order: i
    })) });
    (window as any).confirm = () => true;
    for (let i = 0; i < 9; i++) await a.pmAppend('on', `q${i}`);

    await a.pmLoadLineup();
    expect(a.pmOnPitch()).toHaveLength(11);
  });

  it('says so when there is no lineup to load', async () => {
    const a = app();
    withLineup(null);
    await a.pmLoadLineup();
    expect(a._pmError).toContain('No saved lineup');
  });

  it('does nothing when the coach declines', async () => {
    const a = app();
    withLineup(L);
    (window as any).confirm = () => false;
    await a.pmAppend('on', 'p9');
    await a.pmLoadLineup();
    expect(a.pmOnPitch()).toEqual(['p9']);
  });
});

describe('eleven players, whatever the route', () => {
  /**
   * The limit is a fact about the match, not about one gesture. A twelfth
   * player is wrong however they got on — every player's minutes and goal
   * differential are quietly wrong afterwards, and nothing at the time says so.
   */
  function app() {
    const a = makeApp();
    a.data.players = Array.from({ length: 15 }, (_, i) => ({ id: `q${i}`, name: `P${i}` }));
    a._pmPos = {};
    a.pmSavePositions = () => {};
    a.renderPlusMinus = () => {};
    return a;
  }

  it('refuses a twelfth even when sent on directly', async () => {
    const a = app();
    for (let i = 0; i < 12; i++) await a.pmAppend('on', `q${i}`);
    expect(a.pmOnPitch()).toHaveLength(11);
  });

  it('says why', async () => {
    const a = app();
    for (let i = 0; i < 12; i++) await a.pmAppend('on', `q${i}`);
    expect(a._pmError).toContain('11 players are already on');
  });

  it('ignores sending a player on who is already on', async () => {
    // Otherwise a duplicate `on` restarts their clock and inflates minutes.
    const a = app();
    await a.pmAppend('on', 'q0');
    const before = a._pmEvents.length;
    await a.pmAppend('on', 'q0');
    expect(a._pmEvents).toHaveLength(before);
  });

  it('lets an eleventh on after somebody comes off', async () => {
    const a = app();
    for (let i = 0; i < 11; i++) await a.pmAppend('on', `q${i}`);
    await a.pmAppend('off', 'q0');
    await a.pmAppend('on', 'q11');
    expect(a.pmOnPitch()).toHaveLength(11);
    expect(a.pmOnPitch()).toContain('q11');
  });
});

describe('clearing a pitch that came from the database', () => {
  /**
   * Reported: "clear pitch did not remove all the players, just some."
   *
   * Two things could produce that, and both are covered here. Events loaded
   * from the database carry no `seq`, so ordering fell back to their array
   * index while events added this session counted from 1 — two different
   * scales for the same comparison. And each `off` is a separate write, so one
   * refused in the middle leaves part of the squad on with nothing to say so.
   */
  function loaded(events: any[]) {
    const a = makeApp();
    a.data.players = Array.from({ length: 11 }, (_, i) => ({ id: `q${i}`, name: `P${i}` }));
    a._pmEvents = events;
    a._pmPos = {};
    a.pmSavePositions = () => {};
    a.renderPlusMinus = () => {};
    return a;
  }

  const fromDb = (n: number, at = 0) =>
    Array.from({ length: n }, (_, i) => ({
      id: `e${i}`, kind: 'on', playerId: `q${i}`, atSeconds: at, period: 1
    }));

  it('clears a full pitch loaded with no ordering stamp', async () => {
    (window as any).confirm = () => true;
    const a = loaded(fromDb(11));
    expect(a.pmOnPitch()).toHaveLength(11);
    await a.pmResetPitch();
    expect(a.pmOnPitch()).toEqual([]);
  });

  it('clears when substitutions share the clock second with the clear', async () => {
    (window as any).confirm = () => true;
    const a = loaded([
      ...fromDb(8, 0),
      { id: 'e8', kind: 'on', playerId: 'q8', atSeconds: 600, period: 1 },
      { id: 'e9', kind: 'on', playerId: 'q9', atSeconds: 600, period: 1 },
      { id: 'e10', kind: 'on', playerId: 'q10', atSeconds: 600, period: 1 }
    ]);
    a._pmClockBase = 600;
    await a.pmResetPitch();
    expect(a.pmOnPitch()).toEqual([]);
  });

  it('reports anyone left on when a write is refused', async () => {
    // A silent partial clear leaves players accruing minutes, and the only
    // sign is chips that did not disappear — easy to read as a slow screen.
    (window as any).confirm = () => true;
    const a = loaded(fromDb(3));
    a._pmMatchId = '00000000-0000-0000-0000-000000000001';

    let calls = 0;
    (window as any).supabaseService = {
      isConfigured: () => true,
      // The second write fails, as a dropped signal would.
      appendStatEvent: async () => (++calls === 2
        ? { ok: false, error: 'network' }
        : { ok: true, id: `x${calls}` })
    };

    await a.pmResetPitch();

    expect(a.pmOnPitch()).toHaveLength(1);
    expect(a._pmError).toContain('still on the pitch');
    expect(a._pmError).toContain('P1');
  });

  it('says nothing when every player came off', async () => {
    (window as any).confirm = () => true;
    const a = loaded(fromDb(4));
    await a.pmResetPitch();
    expect(a._pmError).toBe('');
  });
});
