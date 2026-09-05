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
import cssSrc from '../../styles.css?raw';
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

/**
 * A lineup coordinate, as it lands on the PLUS/MINUS pitch.
 *
 * Not the same numbers. The lineup screen draws a tall 2:3 pitch; this one is
 * wide and short, so the same percentages put players closer together and the
 * keeper ended up underneath the centre backs. The shape is respread. What
 * must hold is the arrangement, not the arithmetic.
 */
const onPmPitch = (x: number, y: number) => {
  const a = makeApp();
  const q = a.pmSpreadSlot({ x, y });
  return a.pmClampPosition(q.x, q.y);
};

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  (window as any).plusMinus = plusMinus;
  (window as any).supabaseService = { isConfigured: () => false };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

/**
 * Kick off, so plus and minus are accepted.
 *
 * They are refused before the clock has ever started: recorded then, they
 * stamp at 0:00 and every player is credited zero minutes. Seeded as an event
 * rather than through pmToggleClock() so the clock stays stopped and these
 * tests keep full control of pmClock().
 */
const kickOff = (a: any) => {
  a._pmEvents.push({ kind: 'clock_start', playerId: null, atSeconds: 0 });
  // Running, not merely started: plus and minus are refused whenever the
  // clock is stopped, half time included. Set directly rather than through
  // pmToggleClock() so _pmClockBase stays where the test put it and pmClock()
  // remains predictable.
  a._pmRunningSince = Date.now();
  return a;
};

/** Event kinds, ignoring the seeded kick-off. */
const kindsAfterKickOff = (a: any) =>
  a._pmEvents.filter((e: any) => e.kind !== 'clock_start').map((e: any) => e.kind);

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
    const app = kickOff(makeApp());
    await app.pmAppend('on', 'p1');
    await app.pmTapPlayer('p1', { fingers: 1 });
    expect(kindsAfterKickOff(app)).toEqual(['on', 'plus']);
  });

  it('appends nothing for a substitute', async () => {
    const app = makeApp();
    await app.pmTapPlayer('p2', { fingers: 1 });
    expect(app._pmEvents).toEqual([]);
  });

  it('stamps events with the match clock, not wall time', async () => {
    // Playing time and goal differential are both computed against this.
    const app = kickOff(makeApp());
    app._pmClockBase = 615;
    await app.pmAppend('plus', 'p1');
    expect(app._pmEvents.find((e: any) => e.kind === 'plus').atSeconds).toBe(615);
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
    const app = kickOff(makeApp());
    await app.pmAppend('on', 'p1');
    await app.pmAppend('plus', 'p1');
    await app.pmUndo();
    expect(kindsAfterKickOff(app)).toEqual(['on']);
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
    // Through the toggle, not pmAppend('clock_start'): the toggle is what
    // actually starts the clock ticking, and plus and minus are refused while
    // it is stopped. Appending the event alone leaves the clock at rest,
    // which is a state the app itself never produces.
    await app.pmToggleClock();
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
      // Uniform numbers, since that is what this screen shows.
      { id: 'p1', name: 'Cesar Alva', number: 7, recordingNumber: 1 },
      { id: 'p2', name: 'Tom Budde', number: 2, recordingNumber: 9 },
      { id: 'p3', name: 'Alain Renteria', number: null, recordingNumber: 4 }
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

  it('sorts by UNIFORM number, lowest first', () => {
    // This screen is read against players wearing shirts, so the number on
    // the sheet has to be the number on the back — not the recording number,
    // which is for paper score sheets.
    const { app, stats, squad } = sheet();
    app.setPlusMinusSort('number');
    expect(order(app, stats, squad).slice(0, 2)).toEqual(['p2', 'p1']);
  });

  it('sinks a player with no uniform number, both ways', () => {
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

    // Respread, not copied: the lineup screen's tall pitch and this wide one
    // need different spacing for the same shape. What must survive is the
    // ORDER — slot one is the keeper, behind slot two.
    const slots = a.lineupSlots('4-4-2');
    const place = (sl: any) => { const p = a.pmSpreadSlot(sl); return a.pmClampPosition(p.x, p.y); };
    expect(a._pmPos.p1).toEqual(place(slots[0]));
    expect(a._pmPos.p2).toEqual(place(slots[1]));
    expect(a._pmPos.p1.y).toBeLessThan(a._pmPos.p2.y);
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
    const a = kickOff(app());
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
    expect(gk).toEqual({ playerId: 'p1', ...onPmPitch(50, 10) });
  });

  it('falls back to the formation slot when the lineup has no coordinates', () => {
    // A lineup saved before positions were stored must still lay out, rather
    // than piling everyone at the origin.
    const a = app();
    const out = a.pmStartersFromLineup(lineup({
      players: [{ player_id: 'p1', role: 'starter', slot: 'LB', x: null, y: null, sort_order: 0 }]
    }));
    const lb = a.lineupSlots('4-4-2').find((s: any) => s.slot === 'LB');
    expect(out[0]).toEqual({ playerId: 'p1', ...onPmPitch(lb.x, lb.y) });
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
    expect(a._pmPos.p1).toEqual(onPmPitch(50, 10));
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
    const a = kickOff(app());
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

describe('which number is shown', () => {
  /**
   * The plus/minus screen and the lineup show the UNIFORM number, because both
   * are read against players on a pitch wearing shirts — the number on the
   * chip has to be the number on the back.
   *
   * The recording number is a different thing: it is what a player writes on a
   * paper score sheet, and it belongs on the session grid.
   */
  function render() {
    const a = makeApp();
    a.data.players = [
      { id: 'p1', name: 'Kevin Corona', number: 30, recordingNumber: 7 },
      { id: 'p2', name: 'JP Davila', number: null, recordingNumber: 8 }
    ];
    a._pmPos = {};
    a.pmSavePositions = () => {};
    document.body.innerHTML = a.renderPlusMinusTable(
      new Map([['p1', {}], ['p2', {}]]), a.data.players);
    return a;
  }

  it('shows the uniform number in the sheet', () => {
    render();
    const cells = Array.from(document.querySelectorAll('tbody tr'))
      .map(r => r.children[0].textContent!.trim());
    expect(cells).toContain('30');
  });

  it('does not show the recording number', () => {
    render();
    const cells = Array.from(document.querySelectorAll('tbody tr'))
      .map(r => r.children[0].textContent!.trim());
    expect(cells).not.toContain('7');
  });

  it('shows a dash for a player with no uniform number', () => {
    render();
    const cells = Array.from(document.querySelectorAll('tbody tr'))
      .map(r => r.children[0].textContent!.trim());
    expect(cells).toContain('—');
  });
});

describe('setting the match clock', () => {
  /**
   * A statistician starts the clock late, or it drifts from the referee's.
   *
   * The change is bracketed by a stop and a start, which is what keeps minutes
   * honest: the stop credits everyone on the pitch up to the OLD time, the
   * start resumes from the NEW one. Without it, moving the clock forward would
   * hand every player the jump as minutes they did not play.
   */
  function app() {
    const a = makeApp();
    a._pmPos = {};
    a.pmSavePositions = () => {};
    a.renderPlusMinus = () => {};
    return a;
  }

  it('sets the clock to the value given', async () => {
    const a = app();
    await a.pmSetClock(750);
    expect(a.pmClock()).toBe(750);
  });

  it('never sets a negative clock', async () => {
    const a = app();
    await a.pmSetClock(-60);
    expect(a.pmClock()).toBe(0);
  });

  it('does not hand out minutes for winding the clock FORWARD', async () => {
    // The whole reason for the stop/start bracket. Ten minutes played, then
    // the clock jumps to 40:00 — that jump is not playing time.
    const a = app();
    await a.pmAppend('clock_start');
    await a.pmAppend('on', 'p1');
    a._pmClockBase = 600;
    a._pmRunningSince = null;
    await a.pmAppend('clock_stop');

    await a.pmSetClock(2400);
    expect(a.pmStats().get('p1').secondsPlayed).toBe(600);
  });

  it('keeps minutes already played when the clock is wound BACK', async () => {
    const a = app();
    await a.pmAppend('clock_start');
    await a.pmAppend('on', 'p1');
    a._pmClockBase = 600;
    a._pmRunningSince = null;
    await a.pmAppend('clock_stop');

    await a.pmSetClock(0);
    expect(a.pmStats().get('p1').secondsPlayed).toBe(600);
  });

  it('stops and restarts a running clock around the change', async () => {
    const a = app();
    await a.pmToggleClock();
    await a.pmSetClock(900);
    expect(a._pmEvents.map((e: any) => e.kind))
      .toEqual(['clock_start', 'clock_stop', 'clock_start']);
    expect(a._pmRunningSince).not.toBeNull();
  });

  it('leaves a stopped clock stopped', async () => {
    const a = app();
    await a.pmSetClock(900);
    expect(a._pmRunningSince).toBeNull();
    expect(a._pmEvents).toHaveLength(0);
  });

  it('does not reorder what already happened', async () => {
    // A player off, then the clock wound back, then a goal. The goal came
    // after they left, so they must not be credited with it — which only
    // holds because events replay in the order they were recorded.
    const a = app();
    await a.pmAppend('on', 'p1');
    a._pmClockBase = 600;
    await a.pmAppend('off', 'p1');
    await a.pmSetClock(30);
    await a.pmAppend('goal_for');

    expect(a.pmStats().get('p1').goalDiff).toBe(0);
  });
});

describe('typing a clock value', () => {
  function app() {
    const a = makeApp();
    a.renderPlusMinus = () => {};
    return a;
  }

  beforeEach(() => {
    (window as any).supabaseService = {
      isConfigured: () => false,
      parseTimeToSeconds: (v: any) => {
        const raw = String(v == null ? '' : v).trim();
        if (!raw) return null;
        if (/^[0-9]+$/.test(raw)) return parseInt(raw, 10);
        const m = /^([0-9]+)[:.]([0-5][0-9])$/.exec(raw);
        return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
      }
    };
  });

  it('accepts mm:ss', async () => {
    (window as any).prompt = () => '12:30';
    const a = app();
    await a.pmPromptClock();
    expect(a.pmClock()).toBe(750);
  });

  it('accepts a full stop, like every other time field', async () => {
    (window as any).prompt = () => '12.30';
    const a = app();
    await a.pmPromptClock();
    expect(a.pmClock()).toBe(750);
  });

  it('accepts bare seconds', async () => {
    (window as any).prompt = () => '750';
    const a = app();
    await a.pmPromptClock();
    expect(a.pmClock()).toBe(750);
  });

  it('refuses something that is not a time, and says so', async () => {
    (window as any).prompt = () => 'half past';
    const a = app();
    a._pmClockBase = 100;
    await a.pmPromptClock();
    expect(a.pmClock()).toBe(100);
    expect(a._pmError).toContain('is not a time');
  });

  it('changes nothing when cancelled', async () => {
    (window as any).prompt = () => null;
    const a = app();
    a._pmClockBase = 100;
    await a.pmPromptClock();
    expect(a.pmClock()).toBe(100);
  });
});

describe('resetting the clock', () => {
  function app() {
    const a = makeApp();
    a.renderPlusMinus = () => {};
    return a;
  }

  it('goes back to zero', async () => {
    (window as any).confirm = () => true;
    const a = app();
    a._pmClockBase = 900;
    await a.pmResetClock();
    expect(a.pmClock()).toBe(0);
  });

  it('asks first, since it is rarely meant mid-match', async () => {
    (window as any).confirm = () => false;
    const a = app();
    a._pmClockBase = 900;
    await a.pmResetClock();
    expect(a.pmClock()).toBe(900);
  });

  it('does not ask when the clock is already at zero', async () => {
    let asked = 0;
    (window as any).confirm = () => { asked += 1; return true; };
    const a = app();
    await a.pmResetClock();
    expect(asked).toBe(0);
  });
});

describe("plus and minus before the clock has started", () => {
  /**
   * A coach sets the pitch up, the whistle goes, and the clock is still
   * sitting at 0:00 because nobody pressed start. Taps record happily: the
   * counters go up, the sheet looks right, and every player is credited zero
   * minutes for the whole match — because minutes are derived from
   * substitutions measured against the clock, and the clock never moved.
   *
   * Nothing at the time says so. The first plus is exactly when a coach would
   * notice a forgotten clock, so that is where to say it.
   */
  it("refuses a plus and says why", async () => {
    const a = makeApp();
    await a.pmAppend('on', 'p1');
    await a.pmAppend('plus', 'p1');

    expect(a._pmEvents.map((e: any) => e.kind)).toEqual(['on']);
    expect(a._pmError).toContain('start the clock to record plus and minus');
  });

  it("refuses a minus too", async () => {
    const a = makeApp();
    await a.pmAppend('on', 'p1');
    await a.pmAppend('minus', 'p1');
    expect(a._pmEvents.map((e: any) => e.kind)).toEqual(['on']);
  });

  it("accepts them once the clock has started", async () => {
    const a = makeApp();
    await a.pmAppend('on', 'p1');
    await a.pmToggleClock();
    await a.pmAppend('plus', 'p1');
    expect(a.pmStats().get('p1').plus).toBe(1);
  });

  it("refuses them while the clock is PAUSED mid-match", async () => {
    // Reported: "I can still increment/decrement players even if the clock is
    // not running."
    //
    // Stopped is stopped. At half time, or in any break in play, an event
    // stamps at a minute that has already passed and lands against whoever
    // was on the pitch then. Play is the only time plus and minus mean
    // anything.
    const a = makeApp();
    await a.pmAppend('on', 'p1');
    await a.pmToggleClock();          // start
    await a.pmToggleClock();          // stop
    await a.pmAppend('plus', 'p1');
    expect(a.pmStats().get('p1').plus).toBe(0);
  });

  it("says the clock is STOPPED rather than telling a coach to start it", async () => {
    // Different situations to the person reading it: one has never kicked
    // off, the other is at half time and knows perfectly well they started
    // the clock an hour ago.
    const a = makeApp();
    await a.pmAppend('on', 'p1');
    await a.pmToggleClock();
    await a.pmToggleClock();
    await a.pmAppend('plus', 'p1');
    expect(a._pmError).toContain('stopped');
  });

  it("accepts them again once play restarts", async () => {
    const a = makeApp();
    await a.pmAppend('on', 'p1');
    await a.pmToggleClock();          // start
    await a.pmToggleClock();          // half time
    await a.pmToggleClock();          // second half
    await a.pmAppend('plus', 'p1');
    expect(a.pmStats().get('p1').plus).toBe(1);
  });

  it("does not block getting players onto the pitch", async () => {
    // Setting the shape up before kick-off is the normal way to start, and
    // being on the pitch is not clock-dependent.
    const a = makeApp();
    await a.pmAppend('on', 'p1');
    await a.pmAppend('on', 'p2');
    expect(a.pmOnPitch()).toEqual(['p1', 'p2']);
  });

  it("does not block the clock itself", async () => {
    // The obvious way to deadlock this guard would be to refuse the very
    // event that lifts it.
    const a = makeApp();
    await a.pmToggleClock();
    expect(a._pmEvents.map((e: any) => e.kind)).toEqual(['clock_start']);
  });

  it("refuses whichever gesture the tap resolved to", async () => {
    // The guard sits in pmAppend rather than the tap handler, so the tap, the
    // long press, the two-finger press and the right click are all covered by
    // one check instead of four that can drift apart.
    const a = makeApp();
    await a.pmAppend('on', 'p1');
    await a.pmTapPlayer('p1', { fingers: 1 });
    await a.pmTapPlayer('p1', { fingers: 2 });
    expect(a._pmEvents.map((e: any) => e.kind)).toEqual(['on']);
  });

  it("clears the complaint once the clock starts", async () => {
    const a = makeApp();
    await a.pmAppend('on', 'p1');
    await a.pmAppend('plus', 'p1');
    expect(a._pmError).toContain('start the clock to record plus and minus');
    await a.pmToggleClock();
    await a.pmAppend('plus', 'p1');
    expect(a._pmError).toBe('');
  });

  it("keeps recording after a reload in the middle of a half", async () => {
    // The risk this guard introduces: if reopening a match did not restore
    // the RUNNING state, a coach who refreshed at half-time-plus-one would be
    // refused for the rest of the match with the clock visibly ticking.
    //
    // openPlusMinus rebuilds it from the log via plusMinus.clockRunning(),
    // which is what makes the stricter rule safe. This asserts that contract
    // rather than the reload plumbing.
    const log = [
      { kind: 'clock_start', playerId: null, atSeconds: 0, seq: 0 },
      { kind: 'on', playerId: 'p1', atSeconds: 0, seq: 1 },
      { kind: 'clock_stop', playerId: null, atSeconds: 2400, seq: 2 },
      { kind: 'clock_start', playerId: null, atSeconds: 2400, seq: 3 }
    ];
    expect(plusMinus.clockRunning(log as any)).toBe(true);

    const a = makeApp();
    a._pmEvents = log.slice();
    a._pmRunningSince = plusMinus.clockRunning(log as any) ? Date.now() : null;
    await a.pmAppend('plus', 'p1');
    expect(a.pmStats().get('p1').plus).toBe(1);
  });

  it("is refused after a reload during half time", async () => {
    // The mirror image: the log ends stopped, so the restored clock is
    // stopped, so recording is refused — the same answer as before reloading.
    const log = [
      { kind: 'clock_start', playerId: null, atSeconds: 0, seq: 0 },
      { kind: 'on', playerId: 'p1', atSeconds: 0, seq: 1 },
      { kind: 'clock_stop', playerId: null, atSeconds: 2400, seq: 2 }
    ];
    expect(plusMinus.clockRunning(log as any)).toBe(false);

    const a = makeApp();
    a._pmEvents = log.slice();
    a._pmRunningSince = plusMinus.clockRunning(log as any) ? Date.now() : null;
    await a.pmAppend('plus', 'p1');
    expect(a.pmStats().get('p1').plus).toBe(0);
  });

  it("stays refused after a reset that clears the log", async () => {
    // The wording of the refusal comes from pmClockEverStarted, which reads
    // the log rather than the clock base, because a base of zero means both
    // "not started yet" and "reset back to zero".
    const a = makeApp();
    await a.pmToggleClock();
    a._pmEvents = [];
    a._pmClockBase = 0;
    a._pmRunningSince = null;
    await a.pmAppend('on', 'p1');
    await a.pmAppend('plus', 'p1');
    expect(a._pmEvents.map((e: any) => e.kind)).toEqual(['on']);
  });
});

describe("where the refusal appears", () => {
  /**
   * Reported: "I still need a message stating please start clock in order to
   * record plus/minus values."
   *
   * The message existed. It was printed at the FOOT of the screen, below the
   * pitch, below the substitutes, just above the statistics table — several
   * hundred pixels past the fold on a full-height pitch, which is what this
   * screen was deliberately made into. A coach taps a chip near the top and
   * sees nothing happen.
   *
   * Same failure as the assign-coach errors: a message nobody can see is the
   * same as no message.
   */
  it("puts the message above the pitch, not below it", () => {
    const src = pmSrc;
    const err = src.indexOf('id="pmError"');
    const pitch = src.indexOf('id="pmPitch"');
    const bench = src.indexOf('id="pmBench"');
    expect(err).toBeGreaterThan(-1);
    expect(err).toBeLessThan(pitch);
    expect(err).toBeLessThan(bench);
  });

  it("sits with the clock button, which is the remedy", () => {
    // Not merely "somewhere higher": the thing the coach must press is right
    // above it.
    const src = pmSrc;
    const bar = src.indexOf('class="pm-bar"');
    const err = src.indexOf('id="pmError"');
    const events = src.indexOf('class="pm-events"');
    expect(bar).toBeLessThan(err);
    expect(err).toBeLessThan(events);
  });

  it("names what is being refused, not just the clock", async () => {
    const a = makeApp();
    await a.pmAppend('plus', 'p1');
    expect(a._pmError.toLowerCase()).toContain('plus and minus');
    expect(a._pmError.toLowerCase()).toContain('start the clock');
  });

  it("takes up no room when there is nothing to say", () => {
    // An always-present banner under the control bar would push the pitch
    // down on a phone, which is the screen this is used on.
    expect(cssSrc).toContain('.pm-error:empty { display: none; }');
  });

  it("is announced to a screen reader when it changes", () => {
    expect(pmSrc).toMatch(/id="pmError"[^>]*aria-live="polite"/);
  });
});

describe('opening a match that has already been played', () => {
  /**
   * The default lineup populates the pitch — but only for a match nobody has
   * tracked yet. An imported match already has a history, and seeding an XI
   * onto it would append `on` events to a finished game and change everyone's
   * minutes.
   *
   * The guard reads the EVENT LOG rather than who is currently on the pitch,
   * which is what makes it safe to take every player off at the final
   * whistle: the pitch is empty, the history is not.
   */
  const finished = () => [
    { kind: 'clock_start', playerId: null, atSeconds: 0, seq: 0 },
    { kind: 'on',  playerId: 'p1', atSeconds: 0, seq: 1 },
    { kind: 'plus', playerId: 'p1', atSeconds: 600, seq: 2 },
    { kind: 'off', playerId: 'p1', atSeconds: 4800, seq: 3 },
    { kind: 'clock_stop', playerId: null, atSeconds: 4800, seq: 4 }
  ];

  it('does not seed a lineup over a match that has been played', async () => {
    const a = makeApp();
    a._pmEvents = finished();
    let asked = false;
    (window as any).supabaseService = {
      isConfigured: () => true,
      fetchLineup: async () => { asked = true; return { players: [{ player_id: 'p2', role: 'starter' }] }; }
    };

    const seeded = await a.pmSeedFromLineup(false);
    expect(seeded).toBe(false);
    expect(asked).toBe(false);              // it does not even look
    expect(a._pmEvents).toHaveLength(5);    // nothing appended
  });

  it('leaves the finished match with an empty pitch and its figures intact', async () => {
    const a = makeApp();
    a._pmEvents = finished();
    expect(a.pmOnPitch()).toEqual([]);
    expect(a.pmStats().get('p1').plus).toBe(1);
    expect(a.pmStats().get('p1').secondsPlayed).toBe(4800);
  });

  it('still seeds a match nobody has tracked', async () => {
    const a = makeApp();
    a._pmEvents = [];
    (window as any).supabaseService = {
      isConfigured: () => true,
      fetchLineup: async () => ({ players: [{ player_id: 'p1', role: 'starter', slot: 'GK' }] })
    };
    await a.pmSeedFromLineup(false);
    expect(a.pmOnPitch()).toContain('p1');
  });
});

describe('players must not overlap on the pitch', () => {
  /**
   * Reported: "some of the players overlap each other. It makes it hard to
   * select them."
   *
   * The default layout put up to six chips in a row, giving each 12.7% of the
   * pitch width to sit in. A chip carries a number and a name and is far
   * wider than that, so they collided every time — and tapping the right
   * player is the one thing this screen has to get right.
   *
   * The column count and the CSS width cap are two halves of one decision, so
   * these check them against each other rather than checking either alone.
   */
  const CAP_DESKTOP = 15;   // #plusMinusModal .pm-chip.placed { max-width }
  const CAP_PHONE   = 25;

  const widthAt = (w: number) => {
    (globalThis as any).window.innerWidth = w;
    return { perRow: makeApp().pmPerRow(), cap: w < 700 ? CAP_PHONE : CAP_DESKTOP };
  };

  it('never puts two chips closer than a chip is wide', () => {
    for (const w of [360, 700, 1024, 1600]) {
      const { perRow, cap } = widthAt(w);
      const app = makeApp();
      const spacing = 80 / perRow;
      expect(spacing).toBeGreaterThan(cap);       // a gap, not a touch
      void app;
    }
  });

  it('spaces a full pitch of eleven so no two share a point', () => {
    (globalThis as any).window.innerWidth = 1024;
    const app = makeApp();
    const seen = Array.from({ length: 11 }, (_, i) => app.pmPositionFor(`p${i}`, i, 11));
    const key = (p: any) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    expect(new Set(seen.map(key)).size).toBe(11);
  });

  it('keeps neighbours in a row a full chip apart', () => {
    (globalThis as any).window.innerWidth = 1024;
    const app = makeApp();
    const a = app.pmPositionFor('p0', 0, 11);
    const b = app.pmPositionFor('p1', 1, 11);
    expect(b.x - a.x).toBeGreaterThan(CAP_DESKTOP);
  });

  it('keeps rows further apart than a chip is tall', () => {
    (globalThis as any).window.innerWidth = 1024;
    const app = makeApp();
    const first = app.pmPositionFor('p0', 0, 11);
    const second = app.pmPositionFor('p4', 4, 11);
    expect(Math.abs(first.y - second.y)).toBeGreaterThanOrEqual(15);
  });

  it('uses fewer columns on a phone, where the pitch is narrow', () => {
    // Four unreadable chips across a 360px pitch is worse than three
    // readable ones.
    expect(widthAt(360).perRow).toBe(3);
    expect(widthAt(1024).perRow).toBe(4);
  });

  it('keeps an over-full pitch on the grass', () => {
    // An imported sheet can still put more than eleven on. They must stay
    // inside the pitch rather than spilling off the top.
    (globalThis as any).window.innerWidth = 1024;
    const app = makeApp();
    for (let i = 0; i < 18; i++) {
      const p = app.pmPositionFor(`p${i}`, i, 18);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });

  it('keeps the stylesheet cap in step with the column count', () => {
    // The two halves of one decision, in two files. Read the real CSS rather
    // than trusting the constants above to still match it.
    const rule = (sel: string) => {
      const i = cssSrc.indexOf(sel);
      return i === -1 ? '' : cssSrc.slice(i, cssSrc.indexOf('}', i));
    };
    expect(rule('#plusMinusModal .pm-chip.placed {'))
      .toContain(`max-width: ${CAP_DESKTOP}%`);
    // The phone cap lives in the 640px block, where several rules share this
    // selector — so match the rule that sets a width, not the last one that
    // happens to mention the class.
    expect(cssSrc).toContain(`.pm-chip.placed { max-width: ${CAP_PHONE}%;`);
  });

  it('leaves a player where they were dragged', () => {
    // The grid is only a default; a coach arranging their shape must keep it.
    const app = makeApp();
    app._pmPos = { p1: { x: 33, y: 44 } };
    expect(app.pmPositionFor('p1', 0, 11)).toEqual({ x: 33, y: 44 });
  });
});

describe('no two players may sit on top of each other', () => {
  /**
   * Reported: "one or two players next to the goal keeper collide."
   *
   * Exactly right, and specific. The formations are drawn for the lineup
   * screen's tall 2:3 pitch, where the keeper at x=50 and the centre backs at
   * x=38 and x=62 look well apart. Plus/minus is wide and short, so those
   * twelve percent become a narrower gap than a chip is wide, and the two
   * centre backs land on the keeper.
   *
   * This is the invariant the screen actually needs, so it is checked
   * directly: for every pair of slots in every formation, after respreading,
   * the two chips must not overlap. Two rectangles miss each other when they
   * are clear on EITHER axis.
   */
  const CHIP_W = 15;   // #plusMinusModal .pm-chip.placed max-width
  const CHIP_H = 12;   // ~48px plus borders on a 62vh pitch, rounded up

  const overlaps = (a: any, b: any) =>
    Math.abs(a.x - b.x) < CHIP_W && Math.abs(a.y - b.y) < CHIP_H;

  const formations = () => {
    const app = makeApp();
    return Object.keys(app.lineupFormations());
  };

  it('covers every formation the picker offers', () => {
    expect(formations().length).toBeGreaterThanOrEqual(4);
  });

  it('never overlaps two players in any formation', () => {
    const app = makeApp();
    for (const name of formations()) {
      // Through both steps, exactly as pmApplyFormation does it. Testing the
      // spread alone missed that pmClampPosition floors y at 8 and undid the
      // keeper's placement — the fix looked right and did nothing.
      const place = (sl: any) => {
        const p = app.pmSpreadSlot(sl);
        return app.pmClampPosition(p.x, p.y);
      };
      const spread = app.lineupSlots(name).map((sl: any) => ({ slot: sl.slot, ...place(sl) }));
      for (let i = 0; i < spread.length; i++) {
        for (let j = i + 1; j < spread.length; j++) {
          const collision = overlaps(spread[i], spread[j])
            ? `${name}: ${spread[i].slot} and ${spread[j].slot} overlap`
            : '';
          expect(collision).toBe('');
        }
      }
    }
  });

  it('clears the keeper from both centre backs, which is what was reported', () => {
    const app = makeApp();
    const spread = app.lineupSlots('4-4-2').map((sl: any) => {
      const p = app.pmSpreadSlot(sl);
      return { slot: sl.slot, ...app.pmClampPosition(p.x, p.y) };
    });
    const gk = spread.find((s: any) => s.slot === 'GK');
    for (const cb of ['LCB', 'RCB']) {
      const d = spread.find((s: any) => s.slot === cb);
      expect(overlaps(gk, d)).toBe(false);
    }
  });

  it('would have failed before the respread', () => {
    // The raw lineup coordinates, unspread: this is the bug, and it proves
    // the test is capable of seeing it rather than passing by construction.
    const app = makeApp();
    const raw = app.lineupSlots('4-4-2');
    const gk = raw.find((s: any) => s.slot === 'GK');
    const lcb = raw.find((s: any) => s.slot === 'LCB');
    expect(overlaps(gk, lcb)).toBe(true);
  });

  it('keeps every chip fully on the pitch', () => {
    // Half off the edge is as hard to tap as underneath somebody.
    const app = makeApp();
    for (const name of formations()) {
      for (const sl of app.lineupSlots(name)) {
        const q = app.pmSpreadSlot(sl);
        const p = app.pmClampPosition(q.x, q.y);
        expect(p.x - CHIP_W / 2).toBeGreaterThanOrEqual(0);
        expect(p.x + CHIP_W / 2).toBeLessThanOrEqual(100);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(100);
      }
    }
  });

  it('keeps the shape: the keeper is still behind the defence', () => {
    // Spreading must not rearrange the team. A back four in front of the
    // keeper and forwards ahead of midfield is the whole point of drawing it.
    const app = makeApp();
    const at = (slot: string) => {
      const sl = app.lineupSlots('4-4-2').find((x: any) => x.slot === slot);
      const p = app.pmSpreadSlot(sl);
      return app.pmClampPosition(p.x, p.y);
    };
    expect(at('GK').y).toBeLessThan(at('LCB').y);
    expect(at('LCB').y).toBeLessThan(at('LCM').y);
    expect(at('LCM').y).toBeLessThan(at('LST').y);
    expect(at('LB').x).toBeLessThan(at('LCB').x);
    expect(at('RB').x).toBeGreaterThan(at('RCB').x);
  });

  it('matches the width the stylesheet actually allows', () => {
    expect(cssSrc).toContain(`max-width: ${CHIP_W}%`);
  });
});
