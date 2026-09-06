/**
 * Where a pointer is, and what it is near.
 *
 * Two pieces of arithmetic here are load-bearing in ways that are invisible
 * until they are wrong.
 *
 * `canvasPos` scales by `canvas.width / rect.width` because the board's
 * backing store and its displayed size differ — it is fitted to its wrapper.
 * Without the scale every element lands at an offset that grows across the
 * pitch, so a tap on the right wing places a player in midfield.
 *
 * `touchHitRadius` doubles the catchment for a coarse pointer. 18px was
 * measured against a mouse; a fingertip covers roughly 40px and you cannot
 * see under it, so selecting a line on a phone is guesswork at the mouse
 * radius.
 *
 * Ported from public/js/diagrammer.js during Phase 4b.
 */
export interface Point { x: number; y: number }

/** Perpendicular distance to a segment, clamped to its ends. */
export function distToSegment(p: Point, v: Point, w: Point): number {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  // A segment of no length is a point; the projection below would divide by
  // zero.
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);

  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

/** How close counts as "on" something, given what is doing the pointing. */
export function touchHitRadius(base: number): number {
  const coarse = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(pointer: coarse)').matches;
  return coarse ? base * 2 : base;
}

export function isPointNearDrawing(pos: Point, drawing: any, maxDist = 18): boolean {
  const radius = touchHitRadius(maxDist);
  const pts = drawing?.points;
  if (!pts || pts.length === 0) return false;
  if (pts.length === 1) return Math.hypot(pos.x - pts[0].x, pos.y - pts[0].y) <= radius;

  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(pos, pts[i], pts[i + 1]) <= radius) return true;
  }
  return false;
}

/**
 * A pointer or touch event, in the canvas's own coordinates.
 *
 * Those are what elements are stored in, so this is the conversion every
 * placement, drag and hit test goes through.
 */
export function canvasPos(e: any, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect();
  const touch = e?.touches && e.touches.length > 0 ? e.touches[0] : null;
  const clientX = touch ? touch.clientX : e?.clientX;
  const clientY = touch ? touch.clientY : e?.clientY;

  // A zero-width rect means the canvas is not laid out. Scaling by it gives
  // Infinity, which puts the element nowhere and is unrecoverable.
  const scaleX = rect.width ? canvas.width / rect.width : 1;
  const scaleY = rect.height ? canvas.height / rect.height : 1;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

/**
 * The element under a point, latest first.
 *
 * Latest first because a player dropped on top of another is the one the
 * coach means: they can see it, and it is what they just placed.
 */
export function elementAt(pos: Point, elements: any[], radius = 16): any | null {
  const r = touchHitRadius(radius);
  for (let i = (elements || []).length - 1; i >= 0; i--) {
    const el = elements[i];
    if (Math.hypot(pos.x - el.x, pos.y - el.y) <= r) return el;
  }
  return null;
}
