/**
 * Where a pointer is, and what it is near.
 *
 * Both halves of this module fail invisibly when they are wrong. A missing
 * canvas scale places elements at an offset that grows across the pitch, so
 * a tap on the right wing puts a player in midfield -- and the diagram still
 * renders, still saves, and no longer means what the coach drew. A hit radius
 * measured for a mouse makes selecting a line on a phone guesswork, because a
 * fingertip covers about 40px and you cannot see under it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  distToSegment, touchHitRadius, isPointNearDrawing, canvasPos, elementAt
} from './geometry';

/** Pretend to be a mouse, or a finger. */
function pointer(coarse: boolean) {
  (window as any).matchMedia = vi.fn().mockReturnValue({ matches: coarse });
}

/** A canvas 800 wide in its backing store, displayed at `shown` pixels. */
function canvasAt(shown: number, left = 0, top = 0): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 480;
  canvas.getBoundingClientRect = () => ({
    left, top, width: shown, height: shown * 0.6,
    right: left + shown, bottom: top + shown * 0.6, x: left, y: top, toJSON: () => ({})
  });
  return canvas;
}

beforeEach(() => { pointer(false); });

describe('distance to a segment', () => {
  const v = { x: 0, y: 0 };
  const w = { x: 10, y: 0 };

  it('is zero on the segment', () => {
    expect(distToSegment({ x: 5, y: 0 }, v, w)).toBe(0);
  });

  it('is the perpendicular distance beside it', () => {
    expect(distToSegment({ x: 5, y: 3 }, v, w)).toBe(3);
  });

  it('measures to the nearer end past the segment', () => {
    // Not to the infinite line: a point beyond the end of a pass line is not
    // on that pass line.
    expect(distToSegment({ x: 20, y: 0 }, v, w)).toBe(10);
    expect(distToSegment({ x: -5, y: 0 }, v, w)).toBe(5);
  });

  it('treats a zero-length segment as a point rather than dividing by zero', () => {
    expect(distToSegment({ x: 3, y: 4 }, v, v)).toBe(5);
  });
});

describe('the hit radius', () => {
  it('is the measured one for a mouse', () => {
    pointer(false);
    expect(touchHitRadius(18)).toBe(18);
  });

  it('doubles for a finger', () => {
    // A fingertip covers roughly 40px and hides what is under it.
    pointer(true);
    expect(touchHitRadius(18)).toBe(36);
  });

  it('falls back to the base when the browser cannot say', () => {
    (window as any).matchMedia = undefined;
    expect(touchHitRadius(18)).toBe(18);
  });
});

describe('a point near a drawn line', () => {
  const line = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };

  it('is near it when it is within the radius', () => {
    expect(isPointNearDrawing({ x: 50, y: 10 }, line)).toBe(true);
  });

  it('is not near it when it is outside', () => {
    expect(isPointNearDrawing({ x: 50, y: 40 }, line)).toBe(false);
  });

  it('reaches further for a finger', () => {
    // The same tap misses with a mouse and hits with a finger, on purpose.
    pointer(false);
    expect(isPointNearDrawing({ x: 50, y: 25 }, line)).toBe(false);
    pointer(true);
    expect(isPointNearDrawing({ x: 50, y: 25 }, line)).toBe(true);
  });

  it('checks every segment of a many-point freehand line', () => {
    const squiggle = { points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 80 }] };
    expect(isPointNearDrawing({ x: 55, y: 60 }, squiggle)).toBe(true);
  });

  it('handles a single-point drawing as a point', () => {
    expect(isPointNearDrawing({ x: 5, y: 5 }, { points: [{ x: 0, y: 0 }] })).toBe(true);
  });

  it('is never near a drawing with no points', () => {
    expect(isPointNearDrawing({ x: 0, y: 0 }, { points: [] })).toBe(false);
    expect(isPointNearDrawing({ x: 0, y: 0 }, {})).toBe(false);
  });
});

describe('a pointer position on the canvas', () => {
  it('scales the display size up to the backing store', () => {
    // The board is fitted to its wrapper, so these differ. Without the scale
    // a tap on the right wing places a player in midfield.
    const canvas = canvasAt(400);   // half the 800px backing store
    expect(canvasPos({ clientX: 200, clientY: 120 }, canvas)).toEqual({ x: 400, y: 240 });
  });

  it('is one to one when the two match', () => {
    const canvas = canvasAt(800);
    expect(canvasPos({ clientX: 200, clientY: 120 }, canvas)).toEqual({ x: 200, y: 120 });
  });

  it('subtracts where the canvas sits on the page', () => {
    const canvas = canvasAt(800, 100, 50);
    expect(canvasPos({ clientX: 300, clientY: 150 }, canvas)).toEqual({ x: 200, y: 100 });
  });

  it('reads a touch rather than the mouse fields', () => {
    const canvas = canvasAt(800);
    const touch = { touches: [{ clientX: 200, clientY: 120 }] };
    expect(canvasPos(touch, canvas)).toEqual({ x: 200, y: 120 });
  });

  it('does not produce Infinity for a canvas that is not laid out', () => {
    // A zero-width rect scales to Infinity, which puts the element nowhere
    // and cannot be recovered from.
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 480;
    canvas.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({})
    });
    const pos = canvasPos({ clientX: 10, clientY: 10 }, canvas);
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
  });
});

describe('the element under a point', () => {
  const a = { id: 1, type: 'attacker', x: 100, y: 100 };
  const b = { id: 2, type: 'defender', x: 300, y: 100 };

  it('finds one within reach', () => {
    expect(elementAt({ x: 105, y: 104 }, [a, b])).toBe(a);
  });

  it('finds nothing on empty grass', () => {
    expect(elementAt({ x: 500, y: 400 }, [a, b])).toBeNull();
  });

  it('picks the LAST one placed when two overlap', () => {
    // The one on top is the one the coach can see, and the one they just put
    // there.
    const under = { id: 3, type: 'attacker', x: 100, y: 100 };
    expect(elementAt({ x: 100, y: 100 }, [under, a])).toBe(a);
  });

  it('reaches further for a finger here too', () => {
    pointer(false);
    expect(elementAt({ x: 120, y: 100 }, [a])).toBeNull();
    pointer(true);
    expect(elementAt({ x: 120, y: 100 }, [a])).toBe(a);
  });

  it('copes with no elements at all', () => {
    expect(elementAt({ x: 0, y: 0 }, [])).toBeNull();
    expect(elementAt({ x: 0, y: 0 }, null as any)).toBeNull();
  });
});

describe('agreement with the legacy board', () => {
  // distToSegment and isPointNearDrawing decide what a tap selects. A port
  // that rounds differently makes lines harder to grab without ever failing.
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

  it('measures distances the same way', async () => {
    const src = (await import('../../public/js/diagrammer.js?raw')).default;
    const Legacy: any = new Function(strip(src) + '\nreturn SoccerTacticalBoard;')();
    const board = new Legacy();

    const cases: [any, any, any][] = [
      [{ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 20, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
      [{ x: -7, y: 12 }, { x: 4, y: 4 }, { x: 40, y: 90 }]
    ];

    cases.forEach(([p, v, w]) => {
      expect(distToSegment(p, v, w)).toBe(board.distToSegment(p, v, w));
    });
  });
});
