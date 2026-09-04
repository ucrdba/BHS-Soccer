/**
 * The touch plumbing on the plus/minus screen.
 *
 * I had written that the pointer plumbing was browser behaviour and not worth
 * simulating, and tested only the decision function. The two-finger minus then
 * shipped broken in exactly the gap that left: the gesture set a flag and left
 * the decision to the NEXT pointerup, so two fingers did nothing at the time
 * and turned the following single tap into a minus — against a different
 * player.
 *
 * The decision function was right the whole time. These tests cover the part
 * that was wrong: WHEN each gesture fires, and against whom.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import pmSrc from '../../public/js/views/plusminus.view.js?raw';
// plusminus reuses the lineup's formations rather than defining its own.
import lineupSrc from '../../public/js/views/lineup.view.js?raw';
import * as plusMinus from './plus-minus';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, pmSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

let app: any;
/** What the fingers are currently over, since jsdom has no layout. */
let elementAt: Element | null = null;

function makeApp(): any {
  const a = Object.create(ctor.prototype);
  a.activeTeamId = 't1';
  a.data = {
    players: [
      { id: 'p1', name: 'Cesar Alva', recordingNumber: 1 },
      { id: 'p2', name: 'Tom Budde', recordingNumber: 2 }
    ],
    teams: [{ id: 't1', school_id: 's1', name: 'Varsity' }]
  };
  a._pmEvents = [];
  a._pmClockBase = 0;
  a._pmRunningSince = null;
  a._pmPeriod = 1;
  a._pmMatchId = null;
  a.renderPlusMinus = () => {};
  return a;
}

/** The chips as renderPlusMinus draws them, both players on the pitch. */
function mount() {
  document.body.innerHTML = `
    <div id="plusMinusBody">
      <div id="pmPitch">
        <button class="pm-chip on" data-player-id="p1">1</button>
        <button class="pm-chip on" data-player-id="p2">2</button>
      </div>
      <div id="pmBench"></div>
    </div>`;
}

const chip = (id: string) => document.querySelector(`[data-player-id="${id}"]`) as HTMLElement;

/**
 * Both players are sent on before each test.
 *
 * Being on the pitch is decided by the EVENT LOG, not by which div a chip is
 * drawn in — a tap on a bench player counts nothing. Rendering the chips
 * without the `on` events made every gesture correctly resolve to nothing,
 * which looked exactly like the bug under test.
 */
const SEEDED = 2;
const kinds = () =>
  app._pmEvents.slice(SEEDED).map((e: any) => `${e.kind}:${e.playerId ?? ''}`);

/** A touchstart carrying n fingers, the way a browser delivers one. */
function touchStart(n: number) {
  const e: any = new Event('touchstart', { bubbles: true, cancelable: true });
  e.touches = Array.from({ length: n }, () => ({ clientX: 10, clientY: 10 }));
  document.getElementById('plusMinusBody')!.dispatchEvent(e);
  return e;
}

function touchEnd(remaining: number) {
  const e: any = new Event('touchend', { bubbles: true, cancelable: true });
  e.touches = Array.from({ length: remaining }, () => ({ clientX: 10, clientY: 10 }));
  document.getElementById('plusMinusBody')!.dispatchEvent(e);
}

/** A finger going down and up on a chip, with no movement. */
function tap(id: string) {
  const el = chip(id);
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
  el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10 }));
}

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  (window as any).plusMinus = plusMinus;
  (window as any).supabaseService = { isConfigured: () => false };
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  mount();
  elementAt = chip('p1');
  document.elementFromPoint = () => elementAt as any;
  (Element.prototype as any).setPointerCapture = function () {};
  (Element.prototype as any).releasePointerCapture = function () {};

  app = makeApp();
  app._pmEvents = [
    { kind: 'on', playerId: 'p1', atSeconds: 0 },
    { kind: 'on', playerId: 'p2', atSeconds: 0 }
  ];
  (globalThis as any).app = app;
  (window as any).app = app;
  app.attachPlusMinusGestures();
});

describe('two fingers', () => {
  it('records a minus the moment the second finger lands', async () => {
    // The bug: it recorded nothing until some later tap.
    touchStart(2);
    await Promise.resolve();
    expect(kinds()).toEqual(['minus:p1']);
  });

  it('records it against the player under the fingers', async () => {
    elementAt = chip('p2');
    touchStart(2);
    await Promise.resolve();
    expect(kinds()).toEqual(['minus:p2']);
  });

  it('does not also count a plus when the fingers lift', async () => {
    touchStart(2);
    await Promise.resolve();
    chip('p1').dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10 }));
    await Promise.resolve();
    expect(kinds()).toEqual(['minus:p1']);
  });

  it('does not turn the NEXT tap into a minus', async () => {
    // The exact reported behaviour: two fingers appeared to do nothing, then
    // the following single tap decremented whoever it landed on.
    touchStart(2);
    await Promise.resolve();
    touchEnd(0);

    elementAt = chip('p2');
    tap('p2');
    await Promise.resolve();

    expect(kinds()).toEqual(['minus:p1', 'plus:p2']);
  });

  it('prevents the default, or the page pinch-zooms instead', () => {
    const e = touchStart(2);
    expect(e.defaultPrevented).toBe(true);
  });

  it('ignores two fingers landing away from any player', async () => {
    elementAt = document.getElementById('pmBench');
    touchStart(2);
    await Promise.resolve();
    expect(kinds()).toEqual([]);
  });

  it('abandons a drag that had begun on the first finger', async () => {
    // Two fingers is a minus, not a substitution.
    const el = chip('p1');
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
    el.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 60, clientY: 60 }));
    touchStart(2);
    await Promise.resolve();

    elementAt = document.getElementById('pmBench');
    el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 60, clientY: 60 }));
    await Promise.resolve();

    expect(kinds()).toEqual(['minus:p1']);
  });
});

describe('one finger', () => {
  it('records a plus', async () => {
    touchStart(1);
    tap('p1');
    await Promise.resolve();
    expect(kinds()).toEqual(['plus:p1']);
  });

  it('records only one, not one per event in the sequence', async () => {
    tap('p1');
    await Promise.resolve();
    expect(kinds()).toEqual(['plus:p1']);
  });
});

describe('the suppression flag', () => {
  it('clears only once every finger has lifted', async () => {
    // Clearing when the SECOND finger lifts would re-arm the tap path while
    // the first is still down, and that finger's release would add a plus.
    touchStart(2);
    await Promise.resolve();
    touchEnd(1);                                   // one finger still down
    chip('p1').dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10 }));
    await Promise.resolve();
    expect(kinds()).toEqual(['minus:p1']);
  });
});

describe('a long press', () => {
  /**
   * A third way to say minus, because two fingers do not always fit on a chip
   * and the match does not wait for a second attempt.
   *
   * It competes with the drag for the same gesture — which is why it was left
   * out at first — so what these pin down is the boundary: a press that stays
   * put is a minus, a press that travels is a substitution, and neither is
   * ever both.
   */
  const down = (id: string, x = 10, y = 10) =>
    chip(id).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
  const move = (id: string, x: number, y: number) =>
    chip(id).dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y }));
  const up = (id: string, x = 10, y = 10) =>
    chip(id).dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: x, clientY: y }));

  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('records a minus when held still', async () => {
    down('p1');
    vi.advanceTimersByTime(600);
    await Promise.resolve();
    expect(kinds()).toEqual(['minus:p1']);
  });

  it('does not fire before it has been held long enough', async () => {
    down('p1');
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    expect(kinds()).toEqual([]);
  });

  it('is a plus, not a minus, when released quickly', async () => {
    down('p1');
    vi.advanceTimersByTime(100);
    up('p1');
    await Promise.resolve();
    expect(kinds()).toEqual(['plus:p1']);
  });

  it('does not also count a plus when the finger lifts', async () => {
    down('p1');
    vi.advanceTimersByTime(600);
    await Promise.resolve();
    up('p1');
    await Promise.resolve();
    expect(kinds()).toEqual(['minus:p1']);
  });

  it('is cancelled by movement, because that is a drag', async () => {
    // The reason a long press was avoided at first. A press that travels must
    // be a substitution and nothing else.
    down('p1');
    move('p1', 80, 80);
    vi.advanceTimersByTime(600);
    await Promise.resolve();
    expect(kinds()).toEqual([]);
  });

  it('lets the drag complete after the press was cancelled', async () => {
    down('p1');
    move('p1', 80, 80);
    vi.advanceTimersByTime(600);
    elementAt = document.getElementById('pmBench');
    up('p1', 80, 80);
    await Promise.resolve();
    expect(kinds()).toEqual(['off:p1']);
  });

  it('does not fire after the finger has already lifted', async () => {
    // The timer outlives the gesture unless it is cleared.
    down('p1');
    up('p1');
    vi.advanceTimersByTime(600);
    await Promise.resolve();
    expect(kinds()).toEqual(['plus:p1']);
  });

  it('counts one minus, not two, when two fingers land during a press', async () => {
    down('p1');
    vi.advanceTimersByTime(200);
    touchStart(2);
    vi.advanceTimersByTime(600);
    await Promise.resolve();
    expect(kinds()).toEqual(['minus:p1']);
  });

  it('records against the player being held, not another', async () => {
    down('p2');
    vi.advanceTimersByTime(600);
    await Promise.resolve();
    expect(kinds()).toEqual(['minus:p2']);
  });
});
