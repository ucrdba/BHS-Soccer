/**
 * Drawing a tactical board.
 *
 * **What these tests prove and what they do not.** `node-canvas` is not
 * installed, so under jsdom `getContext('2d')` returns null and no test here
 * can look at a pixel. What they assert is the calls a routine makes against
 * a recording stub: that a full pitch draws a centre circle and a half pitch
 * does not, that an arrow draws a head, that a player draws its number. That
 * is evidence the routine ran and branched correctly. It is NOT evidence that
 * the board looks right, and nothing here should be read as such.
 *
 * The proportions themselves were moved verbatim from the legacy board and
 * are deliberately not asserted: pinning `fh * 0.22` in a test would make the
 * test a copy of the code rather than a check on it.
 */
/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';
import legacySrc from './legacy/diagrammer.legacy.js?raw';
import { drawPitch, drawPath, drawElement, renderBoard } from './draw';

interface Call { fn: string; args: any[] }

/** A 2D context that remembers what it was asked to do. */
function recorder() {
  const calls: Call[] = [];
  const props: Record<string, any> = {};

  const methods = [
    'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc',
    'rect', 'roundRect', 'fill', 'stroke', 'fillRect', 'strokeRect',
    'setLineDash', 'fillText', 'measureText'
  ];

  const ctx: any = new Proxy({}, {
    get(_t, key: string) {
      if (key === '__calls') return calls;
      if (key === '__props') return props;
      if (key === 'measureText') return (t: string) => { calls.push({ fn: 'measureText', args: [t] }); return { width: t.length * 6 }; };
      if (methods.includes(key)) return (...args: any[]) => { calls.push({ fn: key, args }); };
      return props[key];
    },
    set(_t, key: string, value: any) {
      props[key] = value;
      calls.push({ fn: `set:${key}`, args: [value] });
      return true;
    }
  });

  return {
    ctx: ctx as CanvasRenderingContext2D,
    calls,
    /** Every call of one kind. */
    of: (fn: string) => calls.filter(c => c.fn === fn),
    ran: (fn: string) => calls.some(c => c.fn === fn),
    /** Every value a property was set to. */
    set: (key: string) => calls.filter(c => c.fn === `set:${key}`).map(c => c.args[0])
  };
}

describe('the pitch', () => {
  it('lays down grass and stripes whatever the type', () => {
    const r = recorder();
    drawPitch(r.ctx, 800, 480, 'blank');

    // The ground, plus five stripes.
    expect(r.of('fillRect').length).toBeGreaterThanOrEqual(6);
    expect(r.set('fillStyle')[0]).toBe('#163d16');
  });

  it('draws the touchlines whatever the type', () => {
    const r = recorder();
    drawPitch(r.ctx, 800, 480, 'blank');
    expect(r.ran('strokeRect')).toBe(true);
  });

  it('draws a centre circle and both boxes on a full pitch', () => {
    const r = recorder();
    drawPitch(r.ctx, 800, 480, 'full');

    // Centre circle, centre spot.
    expect(r.of('arc').length).toBe(2);
    // Touchlines, two penalty boxes, two six-yard boxes.
    expect(r.of('strokeRect').length).toBe(5);
  });

  it('draws one box and a D on a half pitch', () => {
    const r = recorder();
    drawPitch(r.ctx, 800, 480, 'half');

    expect(r.of('arc').length).toBe(1);
    expect(r.of('strokeRect').length).toBe(3);
  });

  it('draws no markings at all on a blank one', () => {
    // A blank board is for a gym, a court or a drill that is not on a pitch.
    const r = recorder();
    drawPitch(r.ctx, 800, 480, 'blank');

    expect(r.of('arc').length).toBe(0);
    expect(r.of('strokeRect').length).toBe(1);   // the boundary only
  });
});

describe('a drawn line', () => {
  const line = (over: any = {}) => ({
    points: [{ x: 10, y: 10 }, { x: 90, y: 50 }], ...over
  });

  it('is ignored when it has fewer than two points', () => {
    // A tap that never became a drag is not a line.
    const r = recorder();
    drawPath(r.ctx, { points: [{ x: 10, y: 10 }] });
    expect(r.calls).toHaveLength(0);
  });

  it('strokes from the first point through the rest', () => {
    const r = recorder();
    drawPath(r.ctx, line());

    expect(r.of('moveTo')[0].args).toEqual([10, 10]);
    expect(r.ran('stroke')).toBe(true);
  });

  it('dashes a dashed line and solid-fills the others', () => {
    const dashed = recorder();
    drawPath(dashed.ctx, line({ tool: 'line_dashed' }));
    expect(dashed.of('setLineDash')[0].args[0]).toEqual([8, 6]);

    const solid = recorder();
    drawPath(solid.ctx, line({ tool: 'line_arrow' }));
    expect(solid.of('setLineDash')[0].args[0]).toEqual([]);
  });

  it('draws an arrow head for the pointing tools', () => {
    // Three lineTo calls for the shaft and the two head edges.
    const r = recorder();
    drawPath(r.ctx, line({ tool: 'line_arrow' }));
    expect(r.of('lineTo').length).toBeGreaterThan(2);
    expect(r.ran('fill')).toBe(true);
  });

  it('draws no head on a plain line', () => {
    const r = recorder();
    drawPath(r.ctx, line({ tool: 'line' }));
    expect(r.ran('fill')).toBe(false);
  });

  it('rings the end of a shot, so it reads as on target', () => {
    const r = recorder();
    drawPath(r.ctx, line({ tool: 'line_shot' }));
    expect(r.of('arc').length).toBe(1);
  });

  it('offsets alternate points on a dribble', () => {
    // The wobble is what makes a dribble read as a dribble rather than a pass.
    const r = recorder();
    drawPath(r.ctx, {
      tool: 'line_dribble',
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }]
    });
    const drawn = r.of('lineTo').map(c => c.args);
    expect(drawn[0]).not.toEqual([10, 10]);
  });

  it('highlights a selected line under the line itself', () => {
    const plain = recorder();
    drawPath(plain.ctx, line({ tool: 'line' }));

    const picked = recorder();
    drawPath(picked.ctx, line({ tool: 'line' }), true);

    expect(picked.of('stroke').length).toBeGreaterThan(plain.of('stroke').length);
    expect(picked.set('strokeStyle')).toContain('#FFD700');
  });
});

describe('an element on the board', () => {
  it('draws a player as a numbered disc', () => {
    const r = recorder();
    drawElement(r.ctx, { type: 'attacker', x: 40, y: 40, color: '#0047AB', number: '7' });

    expect(r.of('arc').length).toBe(1);
    expect(r.of('fillText')[0].args[0]).toBe('7');
  });

  it('labels a goalkeeper GK rather than numbering them', () => {
    const r = recorder();
    drawElement(r.ctx, { type: 'gk', x: 40, y: 40, color: '#FFD700' });
    expect(r.of('fillText')[0].args[0]).toBe('GK');
  });

  it('falls back to a number rather than drawing a blank disc', () => {
    const r = recorder();
    drawElement(r.ctx, { type: 'attacker', x: 40, y: 40, color: '#0047AB' });
    expect(r.of('fillText')[0].args[0]).toBeTruthy();
  });

  it('draws a ball without a squad number', () => {
    const r = recorder();
    drawElement(r.ctx, { type: 'ball', x: 40, y: 40 });
    expect(r.of('fillText')[0].args[0]).toBe('⚽');
  });

  it('draws a cone as a triangle', () => {
    const r = recorder();
    drawElement(r.ctx, { type: 'cone', x: 40, y: 40 });

    expect(r.of('lineTo').length).toBe(2);
    expect(r.ran('closePath')).toBe(true);
  });

  it('draws a goal as a rectangle', () => {
    const r = recorder();
    drawElement(r.ctx, { type: 'goal', x: 40, y: 40 });
    expect(r.ran('strokeRect')).toBe(true);
  });

  it('sizes a text label to the text in it', () => {
    const r = recorder();
    drawElement(r.ctx, { type: 'text', x: 40, y: 40, text: 'Overlap here' });

    expect(r.of('measureText')[0].args[0]).toBe('Overlap here');
    expect(r.of('fillText')[0].args[0]).toBe('Overlap here');
  });

  it('marks a selected element', () => {
    const plain = recorder();
    drawElement(plain.ctx, { type: 'attacker', x: 40, y: 40, color: '#0047AB', number: '7' });

    const picked = recorder();
    drawElement(picked.ctx, { type: 'attacker', x: 40, y: 40, color: '#0047AB', number: '7' }, true);

    expect(picked.of('arc').length).toBeGreaterThan(plain.of('arc').length);
    expect(picked.set('strokeStyle')).toContain('#FFD700');
  });

  it('ignores a type it does not know rather than throwing', () => {
    // An older blob may carry something this version does not draw.
    const r = recorder();
    expect(() => drawElement(r.ctx, { type: 'hologram', x: 1, y: 1 })).not.toThrow();
  });

  it('always balances save with restore', () => {
    // An unbalanced save leaks styles into whatever is drawn next.
    const r = recorder();
    drawElement(r.ctx, { type: 'attacker', x: 40, y: 40, color: '#0047AB', number: '7' });
    expect(r.of('save').length).toBe(r.of('restore').length);
  });
});

describe('the whole board', () => {
  it('draws the pitch, then the lines, then the pieces on top', () => {
    // Order matters: a player drawn under a pass line disappears beneath it.
    const r = recorder();
    renderBoard(
      r.ctx, 800, 480, 'full',
      [{ points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], tool: 'line' }],
      [{ type: 'ball', x: 5, y: 5 }]
    );

    const first = r.calls.findIndex(c => c.fn === 'fillRect');
    const line = r.calls.findIndex(c => c.fn === 'moveTo' && c.args[0] === 0);
    const ball = r.calls.findIndex(c => c.fn === 'fillText' && c.args[0] === '⚽');

    expect(first).toBeLessThan(line);
    expect(line).toBeLessThan(ball);
  });

  it('draws an empty board without complaint', () => {
    const r = recorder();
    expect(() => renderBoard(r.ctx, 800, 480, 'full', [], [])).not.toThrow();
  });

  it('marks whichever element is selected', () => {
    const el = { type: 'attacker', x: 40, y: 40, color: '#0047AB', number: '7' };
    const r = recorder();
    renderBoard(r.ctx, 800, 480, 'blank', [], [el], { element: el });

    expect(r.set('strokeStyle')).toContain('#FFD700');
  });
});

describe('agreement with the legacy board', () => {
  // These routines were moved verbatim, and "verbatim" is checkable: the
  // legacy class is loaded here and its prototype methods are called against
  // the same recording stub, with the fake `this` the print path already
  // builds. Any divergence -- a proportion nudged, a branch reordered --
  // shows up as a different call list.
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  const Legacy: any = new Function(strip(legacySrc) + '\nreturn SoccerTacticalBoard;')();

  const sameCalls = (a: Call[], b: Call[]) => {
    expect(a.map(c => c.fn)).toEqual(b.map(c => c.fn));
    expect(a.map(c => c.args)).toEqual(b.map(c => c.args));
  };

  it.each(['full', 'half', 'blank'] as const)('draws a %s pitch identically', (type) => {
    const mine = recorder();
    drawPitch(mine.ctx, 800, 480, type);

    const theirs = recorder();
    Legacy.prototype.drawPitch.call({ ctx: theirs.ctx, pitchType: type }, 800, 480);

    sameCalls(mine.calls, theirs.calls);
  });

  it.each(['line', 'line_arrow', 'line_dashed', 'line_shot', 'line_dribble'])(
    'draws a %s identically', (tool) => {
      const d = {
        tool, color: '#FFF', width: 3,
        points: [{ x: 10, y: 10 }, { x: 50, y: 30 }, { x: 90, y: 50 }]
      };

      const mine = recorder();
      drawPath(mine.ctx, d);

      const theirs = recorder();
      Legacy.prototype.drawPath.call({ ctx: theirs.ctx }, d);

      sameCalls(mine.calls, theirs.calls);
    });

  it.each(['attacker', 'defender', 'gk', 'ball', 'cone', 'goal', 'text'])(
    'draws a %s identically', (type) => {
      const el = { type, x: 40, y: 60, color: '#0047AB', number: '7', text: 'Label' };

      const mine = recorder();
      drawElement(mine.ctx, el);

      const theirs = recorder();
      Legacy.prototype.drawElement.call({ ctx: theirs.ctx }, el);

      sameCalls(mine.calls, theirs.calls);
    });
});
