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
import * as plusMinus from './plus-minus';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, pmSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
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

  it('back where they started does nothing', () => {
    // How a drag gets cancelled.
    expect(drop({ wasOn: true, overPitch: true, onCount: 1 })).toEqual({ kind: null });
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
