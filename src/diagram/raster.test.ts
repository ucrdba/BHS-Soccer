/**
 * A stored diagram, as a picture for the printed plan.
 *
 * jsdom has no 2D context, so every render here returns null -- which is
 * itself the behaviour most worth pinning: the print path has to drop the
 * diagrams and still print the plan, rather than throwing and printing
 * nothing. The tests that need a context stub one, and assert what was drawn
 * rather than what it looks like.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderStep, renderAllSteps, diagramsForPlan } from './raster';

const DIAGRAM = {
  keyframes: [
    { time: 0, label: 'Time 0 (Start Position)', elements: [{ id: 1, type: 'ball', x: 10, y: 10 }], drawings: [] },
    { time: 1, label: 'Time 1', elements: [{ id: 1, type: 'ball', x: 90, y: 40 }], drawings: [] }
  ],
  currentFrameIndex: 0,
  elements: [{ id: 1, type: 'ball', x: 10, y: 10 }],
  drawings: [],
  pitchType: 'half'
};

/**
 * Give every canvas a context that records what it drew.
 *
 * Returns the sizes each canvas was created at, which is the assertion that
 * matters: the native 800x480 is the interactive board's own aspect, and
 * rendering at another shape moves every element relative to the pitch.
 */
function stubCanvas() {
  const sizes: { w: number; h: number }[] = [];
  const drawn: string[] = [];

  const original = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el: any = original(tag);
    if (tag !== 'canvas') return el;

    el.getContext = () => new Proxy({}, {
      get: (_t, key: string) => (...args: any[]) => {
        drawn.push(key);
        if (key === 'measureText') return { width: 10 };
        return undefined;
      },
      set: () => true
    });
    el.toDataURL = () => {
      sizes.push({ w: el.width, h: el.height });
      return 'data:image/png;base64,STUB';
    };
    return el;
  });

  return { sizes, drawn };
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('with no canvas available', () => {
  it('returns null rather than throwing', () => {
    // The print path drops the diagrams and still prints the plan. Throwing
    // here would print nothing at all.
    expect(renderStep(DIAGRAM, 0)).toBeNull();
  });

  it('returns no steps rather than failing the print', () => {
    expect(renderAllSteps(DIAGRAM)).toEqual([]);
  });
});

describe('rendering one step', () => {
  it('draws at the interactive board\'s own size', () => {
    // Element coordinates are canvas pixels. Rendering at another aspect
    // moves every player relative to the pitch.
    const { sizes } = stubCanvas();
    renderStep(DIAGRAM, 0);

    expect(sizes[0]).toEqual({ w: 800, h: 480 });
  });

  it('labels the step from its keyframe', () => {
    stubCanvas();
    expect(renderStep(DIAGRAM, 1)!.label).toBe('Time 1');
  });

  it('returns an image', () => {
    stubCanvas();
    expect(renderStep(DIAGRAM, 0)!.dataUrl).toMatch(/^data:image\/png/);
  });

  it('draws the pitch and the pieces', () => {
    const { drawn } = stubCanvas();
    renderStep(DIAGRAM, 0);

    expect(drawn).toContain('fillRect');   // the ground
    expect(drawn).toContain('arc');        // the ball
  });

  it('falls back to the top-level board for a step past the end', () => {
    // Every blob carries elements and drawings alongside the keyframes; that
    // redundancy is exactly what this uses.
    stubCanvas();
    const step = renderStep(DIAGRAM, 9);

    expect(step).not.toBeNull();
    expect(step!.label).toBe('Tactical diagram');
  });

  it('renders a diagram that arrived as a string', () => {
    stubCanvas();
    expect(renderStep(JSON.stringify(DIAGRAM), 0)).not.toBeNull();
  });

  it('renders a pre-keyframe diagram', () => {
    stubCanvas();
    const step = renderStep({ elements: [{ type: 'ball', x: 5, y: 5 }], drawings: [], pitchType: 'full' }, 0);
    expect(step).not.toBeNull();
  });

  it('gives nothing back for a diagram that is not there', () => {
    stubCanvas();
    expect(renderStep(null, 0)).toBeNull();
    expect(renderStep('{ not json', 0)).toBeNull();
  });
});

describe('rendering every step', () => {
  it('renders one image per keyframe', () => {
    stubCanvas();
    expect(renderAllSteps(DIAGRAM)).toHaveLength(2);
  });

  it('renders a diagram with no keyframes once', () => {
    // It is a position rather than a move, and printing it twice would say
    // otherwise.
    stubCanvas();
    const steps = renderAllSteps({ elements: [{ type: 'ball', x: 1, y: 1 }], drawings: [] });
    expect(steps).toHaveLength(1);
  });

  it('keeps the steps in order', () => {
    stubCanvas();
    expect(renderAllSteps(DIAGRAM).map(s => s.label)).toEqual([
      'Time 0 (Start Position)', 'Time 1'
    ]);
  });
});

describe('a whole plan', () => {
  const drill = (over: any = {}) => ({
    name: 'Rondo', time: '4:00 PM - 4:20 PM', duration: '20 min', coachNotes: '', ...over
  });

  it('keys the steps by drill name, as plan-print takes them', () => {
    stubCanvas();
    const out = diagramsForPlan([drill({ diagramData: DIAGRAM })]);

    expect(Object.keys(out)).toEqual(['Rondo']);
    expect(out.Rondo).toHaveLength(2);
  });

  it('leaves out a drill with no diagram', () => {
    stubCanvas();
    expect(diagramsForPlan([drill()])).toEqual({});
  });

  it('falls back to the saved thumbnail when it cannot render', () => {
    // No canvas: the stored image is what the coach saw when they saved it,
    // and printing it beats printing nothing.
    const out = diagramsForPlan([
      drill({ diagramData: DIAGRAM, diagramImage: 'data:image/png;base64,SAVED' })
    ]);

    expect(out.Rondo).toEqual([{ dataUrl: 'data:image/png;base64,SAVED', label: 'Tactical diagram' }]);
  });

  it('prefers the rendered steps over the thumbnail when it can', () => {
    // The thumbnail is one frame; the steps are the whole move.
    stubCanvas();
    const out = diagramsForPlan([
      drill({ diagramData: DIAGRAM, diagramImage: 'data:image/png;base64,SAVED' })
    ]);

    expect(out.Rondo).toHaveLength(2);
  });

  it('copes with an empty plan', () => {
    expect(diagramsForPlan([])).toEqual({});
    expect(diagramsForPlan(null as any)).toEqual({});
  });
});
