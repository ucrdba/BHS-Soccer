/**
 * The diagram_data blob.
 *
 * This is the file the whole phase turns on. The blob is stored against every
 * drill and every plan row, it is unversioned, it is unvalidated, and there
 * is no migration path -- so a reader that expects a subtly different shape
 * orphans every diagram a coach has ever drawn, and NOTHING ON SCREEN WOULD
 * SAY SO. The board would simply open empty.
 *
 * The agreement block at the bottom is therefore the point of the file: a
 * diagram is built on the LEGACY board, exported by the legacy code, and read
 * back here. If the two ever disagree the test fails, which is the only kind
 * of assurance worth having about data that cannot be regenerated.
 */
/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';
import legacySrc from '../../public/js/diagrammer.js?raw';
import { exportDiagram, loadDiagram } from './serialize';

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const Legacy: any = new Function(strip(legacySrc) + '\nreturn SoccerTacticalBoard;')();

/**
 * A legacy board with no canvas.
 *
 * render() and the UI methods bail out on a null canvas, so everything the
 * serialization touches runs and nothing else does.
 */
function legacyBoard() {
  const b = new Legacy();
  b.canvas = null;
  b.ctx = null;
  return b;
}

const player = (over: any = {}) => ({
  id: 1, type: 'attacker', x: 100, y: 120, color: '#0047AB', number: '1', ...over
});

describe('exporting', () => {
  it('writes the keyframes, the board and the pitch', () => {
    const out = exportDiagram({
      keyframes: [{ time: 0, label: 'Time 0', elements: [player()], drawings: [] }],
      currentFrameIndex: 0,
      elements: [player()],
      drawings: [{ tool: 'line', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }],
      pitchType: 'half'
    });

    expect(out.keyframes).toHaveLength(1);
    expect(out.pitchType).toBe('half');
    expect(out.drawings).toHaveLength(1);
  });

  it('writes elements and drawings alongside the keyframes', () => {
    // Redundant with frame 0 on purpose: it is what lets a reader that knows
    // nothing about keyframes still open the diagram. Removing it would be a
    // shape change.
    const out = exportDiagram({
      keyframes: [{ time: 0, label: 'Time 0', elements: [player()], drawings: [] }],
      currentFrameIndex: 0, elements: [player()], drawings: [], pitchType: 'full'
    });

    expect(out.elements).toHaveLength(1);
  });

  it('deep copies, so the stored blob does not keep changing', () => {
    const live = [player()];
    const out = exportDiagram({
      keyframes: [{ time: 0, label: 'Time 0', elements: live, drawings: [] }],
      currentFrameIndex: 0, elements: live, drawings: [], pitchType: 'full'
    });
    live[0].x = 999;

    expect(out.elements[0].x).toBe(100);
    expect(out.keyframes[0].elements[0].x).toBe(100);
  });
});

describe('loading', () => {
  it('reads a diagram back', () => {
    const data = {
      keyframes: [{ time: 0, label: 'Time 0', elements: [player()], drawings: [] }],
      currentFrameIndex: 0, elements: [player()], drawings: [], pitchType: 'half'
    };
    const out = loadDiagram(data);

    expect(out.elements[0]).toMatchObject({ x: 100, y: 120, number: '1' });
    expect(out.pitchType).toBe('half');
  });

  it('parses a string, which is how PostgREST usually returns it', () => {
    const data = JSON.stringify({
      keyframes: [{ time: 0, label: 'Time 0', elements: [player()], drawings: [] }],
      currentFrameIndex: 0, elements: [], drawings: [], pitchType: 'full'
    });

    expect(loadDiagram(data).elements[0].number).toBe('1');
  });

  it('opens an empty board for text it cannot parse', () => {
    // Rather than throwing, which would take the modal with it and leave no
    // way to draw a replacement.
    const out = loadDiagram('{ not json');
    expect(out.elements).toEqual([]);
    expect(out.keyframes).toHaveLength(1);
  });

  it('opens an empty board for nothing at all', () => {
    // One frame, not zero: a board with no frames has nowhere to hold what
    // gets drawn on it.
    expect(loadDiagram(null).keyframes).toHaveLength(1);
    expect(loadDiagram(undefined).keyframes).toHaveLength(1);
  });

  it('OPENS A PRE-KEYFRAME DIAGRAM', () => {
    // There are drills in the library from before keyframes existed. Those
    // blobs have elements and drawings and no keyframes at all, and dropping
    // them would silently blank the oldest drills in the bank.
    const out = loadDiagram({
      elements: [player()],
      drawings: [{ tool: 'line', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }],
      pitchType: 'full'
    });

    expect(out.elements).toHaveLength(1);
    expect(out.keyframes).toHaveLength(1);
    expect(out.keyframes[0].elements).toHaveLength(1);
  });

  it('shows the frame the diagram was saved on', () => {
    const out = loadDiagram({
      keyframes: [
        { time: 0, label: 'Time 0', elements: [player({ x: 10 })], drawings: [] },
        { time: 1, label: 'Time 1', elements: [player({ x: 90 })], drawings: [] }
      ],
      currentFrameIndex: 1, elements: [], drawings: [], pitchType: 'full'
    });

    expect(out.currentFrameIndex).toBe(1);
    expect(out.elements[0].x).toBe(90);
  });

  it('clamps a frame index past the end', () => {
    // A blob saved on frame 3 whose frames were later cut would otherwise
    // open a board with nothing on it.
    const out = loadDiagram({
      keyframes: [{ time: 0, label: 'Time 0', elements: [player()], drawings: [] }],
      currentFrameIndex: 3, elements: [], drawings: [], pitchType: 'full'
    });

    expect(out.currentFrameIndex).toBe(0);
    expect(out.elements).toHaveLength(1);
  });

  it('defaults the pitch rather than drawing nothing', () => {
    expect(loadDiagram({ elements: [], drawings: [] }).pitchType).toBe('full');
  });

  it('deep copies, so editing the board does not rewrite the stored blob', () => {
    const data = {
      keyframes: [{ time: 0, label: 'Time 0', elements: [player()], drawings: [] }],
      currentFrameIndex: 0, elements: [player()], drawings: [], pitchType: 'full'
    };
    const out = loadDiagram(data);
    out.elements[0].x = 999;

    expect(data.elements[0].x).toBe(100);
    expect(data.keyframes[0].elements[0].x).toBe(100);
  });
});

describe('agreement with the legacy board', () => {
  /** A two-frame move drawn on the legacy board, exported the legacy way. */
  function legacyExport() {
    const b = legacyBoard();
    b.elements = [
      player({ id: 1, x: 100, y: 120 }),
      { id: 2, type: 'defender', x: 300, y: 200, color: '#EF4444', number: '1' },
      { id: 3, type: 'ball', x: 150, y: 140, color: '#FF8C00', number: '' }
    ];
    b.drawings = [
      { tool: 'line_arrow', color: '#FFF', width: 3, points: [{ x: 10, y: 10 }, { x: 90, y: 60 }] }
    ];
    b.pitchType = 'half';
    b.saveCurrentFrameState();

    b.addKeyframe();
    b.elements = b.elements.map((el: any) => ({ ...el, x: el.x + 60 }));
    b.saveCurrentFrameState();

    return b.exportDiagramData();
  }

  it('reads a legacy diagram with every element intact', () => {
    const out = loadDiagram(legacyExport());

    expect(out.elements).toHaveLength(3);
    expect(out.elements.map((e: any) => e.type).sort())
      .toEqual(['attacker', 'ball', 'defender']);
    expect(out.elements.find((e: any) => e.id === 1)).toMatchObject({
      x: 160, y: 120, color: '#0047AB', number: '1'
    });
  });

  it('reads its drawings, its pitch and its frame', () => {
    const out = loadDiagram(legacyExport());

    expect(out.drawings).toHaveLength(1);
    expect(out.drawings[0].tool).toBe('line_arrow');
    expect(out.pitchType).toBe('half');
    expect(out.keyframes).toHaveLength(2);
    expect(out.currentFrameIndex).toBe(1);
  });

  it('reads the SAME thing the legacy loader reads', () => {
    // The strongest form of this check: hand one blob to both loaders and
    // compare what each ends up holding.
    const data = legacyExport();

    const theirs = legacyBoard();
    theirs.loadDiagramData(data);
    const mine = loadDiagram(data);

    expect(mine.elements).toEqual(theirs.elements);
    expect(mine.drawings).toEqual(theirs.drawings);
    expect(mine.keyframes).toEqual(theirs.keyframes);
    expect(mine.currentFrameIndex).toBe(theirs.currentFrameIndex);
    expect(mine.pitchType).toBe(theirs.pitchType);
  });

  it('agrees on a diagram that arrived as a string', () => {
    const data = JSON.stringify(legacyExport());

    const theirs = legacyBoard();
    theirs.loadDiagramData(data);
    const mine = loadDiagram(data);

    expect(mine.elements).toEqual(theirs.elements);
    expect(mine.keyframes).toEqual(theirs.keyframes);
  });

  it('agrees on a pre-keyframe diagram', () => {
    // The oldest drills in the library are this shape.
    const data = {
      elements: [player()],
      drawings: [{ tool: 'line', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }],
      pitchType: 'full'
    };

    const theirs = legacyBoard();
    theirs.loadDiagramData(data);
    const mine = loadDiagram(data);

    expect(mine.elements).toEqual(theirs.elements);
    expect(mine.drawings).toEqual(theirs.drawings);
    expect(mine.keyframes).toEqual(theirs.keyframes);
  });

  it('exports the same shape the legacy board writes', () => {
    // The write side: a diagram saved by the Vue app has to be one the legacy
    // app can open, for as long as both are live.
    const data = legacyExport();
    const state = loadDiagram(data);
    const round = exportDiagram(state);

    expect(Object.keys(round).sort()).toEqual(Object.keys(data).sort());
    expect(round.keyframes).toEqual(data.keyframes);
    expect(round.pitchType).toBe(data.pitchType);
  });

  it('survives a full round trip through the legacy loader', () => {
    // Vue writes it, the legacy board reads it, and everything is still there.
    const state = loadDiagram(legacyExport());
    const written = exportDiagram(state);

    const theirs = legacyBoard();
    theirs.loadDiagramData(JSON.parse(JSON.stringify(written)));

    expect(theirs.elements).toEqual(state.elements);
    expect(theirs.keyframes).toEqual(state.keyframes);
    expect(theirs.pitchType).toBe(state.pitchType);
  });
});
