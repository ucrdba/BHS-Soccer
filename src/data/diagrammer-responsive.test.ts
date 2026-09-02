/**
 * The tactical board on a phone.
 *
 * Two rules carry the weight here, and both are the kind that fail silently:
 *
 *   The board must re-fit when the viewport changes, because it used to size
 *   itself once at init() and a rotated phone left it at the portrait width.
 *
 *   Re-fitting must move everything on it by the same factor. Element
 *   coordinates are stored in canvas pixels, so a resize that does not rescale
 *   quietly slides every player relative to the pitch -- a diagram that still
 *   renders, still saves, and no longer means what it did.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, vi } from 'vitest';

import diagrammerSrc from '../../public/js/diagrammer.js?raw';

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

const Board: any = new Function(
  strip(diagrammerSrc) + '\nreturn SoccerTacticalBoard;'
)();

/** A board with a canvas whose wrapper is a width we control. */
function makeBoard(wrapperWidth: number) {
  const b = new Board();
  const wrapper = document.createElement('div');
  const canvas = document.createElement('canvas');
  wrapper.appendChild(canvas);
  document.body.appendChild(wrapper);
  Object.defineProperty(wrapper, 'clientWidth', { value: wrapperWidth, configurable: true });
  b.canvas = canvas;
  return b;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('fitting the board to its space', () => {
  it('fills a phone-width wrapper instead of overflowing it', () => {
    const b = makeBoard(360);
    b.fitToWrapper();
    expect(b.canvas.width).toBe(340);          // 360 less the 20px gutter
    expect(b.canvas.width).toBeLessThanOrEqual(360);
  });

  it('keeps the pitch proportions at any width', () => {
    const b = makeBoard(360);
    b.fitToWrapper();
    expect(b.canvas.height).toBe(Math.round(b.canvas.width * 0.6));
  });

  it('does not sprawl on a desktop', () => {
    const b = makeBoard(2400);
    b.fitToWrapper();
    expect(b.canvas.width).toBe(840);
  });

  it('still gives a usable board on the narrowest phone', () => {
    // A sliver of a pitch is not a pitch. Below the floor it stops shrinking
    // and the wrapper scrolls instead.
    const b = makeBoard(200);
    b.fitToWrapper();
    expect(b.canvas.width).toBe(280);
  });

  it('reports whether anything actually changed, so a re-render can be skipped', () => {
    const b = makeBoard(360);
    expect(b.fitToWrapper()).toBe(true);
    expect(b.fitToWrapper()).toBe(false);
  });
});

describe('rescaling what is on the board', () => {
  it('moves players by the factor the board changed by', () => {
    // The whole point: a player on the halfway line stays on the halfway line.
    const b = makeBoard(400);
    b.elements = [{ x: 100, y: 50 }];
    b.rescaleContents({ w: 400, h: 240 }, { w: 800, h: 480 });
    expect(b.elements[0]).toEqual({ x: 200, y: 100 });
  });

  it('moves every point of a drawn line, not just its start', () => {
    const b = makeBoard(400);
    b.drawings = [{ points: [{ x: 10, y: 10 }, { x: 20, y: 30 }] }];
    b.rescaleContents({ w: 400, h: 240 }, { w: 800, h: 480 });
    expect(b.drawings[0].points).toEqual([{ x: 20, y: 20 }, { x: 40, y: 60 }]);
  });

  it('rescales stored keyframes too, or a movement step drifts off the pitch', () => {
    // Keyframes hold their own copies. Missing them would leave the animation
    // playing against the old geometry while the live board used the new one.
    const b = makeBoard(400);
    b.keyframes = [{ time: 0, elements: [{ x: 100, y: 50 }], drawings: [{ points: [{ x: 10, y: 10 }] }] }];
    b.rescaleContents({ w: 400, h: 240 }, { w: 800, h: 480 });
    expect(b.keyframes[0].elements[0]).toEqual({ x: 200, y: 100 });
    expect(b.keyframes[0].drawings[0].points[0]).toEqual({ x: 20, y: 20 });
  });

  it('leaves everything alone when the size did not change', () => {
    const b = makeBoard(400);
    b.elements = [{ x: 100, y: 50 }];
    b.rescaleContents({ w: 400, h: 240 }, { w: 400, h: 240 });
    expect(b.elements[0]).toEqual({ x: 100, y: 50 });
  });

  it('does not divide by zero on a board that was never sized', () => {
    const b = makeBoard(400);
    b.elements = [{ x: 100, y: 50 }];
    b.rescaleContents({ w: 0, h: 0 }, { w: 400, h: 240 });
    expect(b.elements[0]).toEqual({ x: 100, y: 50 });
  });
});

describe('hit testing with a finger', () => {
  const setPointer = (coarse: boolean) => {
    (window as any).matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: coarse && q.includes('coarse'), media: q,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}
    }));
  };

  it('keeps the mouse radius for a mouse', () => {
    setPointer(false);
    expect(makeBoard(800).touchHitRadius(18)).toBe(18);
  });

  it('widens the catchment for a fingertip', () => {
    // A finger covers roughly a 40px circle and hides what is under it, so the
    // mouse radius makes selecting a line guesswork.
    setPointer(true);
    expect(makeBoard(360).touchHitRadius(18)).toBe(36);
  });

  it('applies that widening to the real line hit test', () => {
    setPointer(true);
    const b = makeBoard(360);
    const line = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
    // 25px away: outside the mouse radius of 18, inside a finger's 36.
    expect(b.isPointNearDrawing({ x: 50, y: 25 }, line)).toBe(true);
  });

  it('still misses a line that is genuinely far away', () => {
    setPointer(true);
    const b = makeBoard(360);
    const line = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
    expect(b.isPointNearDrawing({ x: 50, y: 120 }, line)).toBe(false);
  });
});
