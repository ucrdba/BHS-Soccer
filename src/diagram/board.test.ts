/**
 * The tactical board.
 *
 * The port's contract with its component is `onChange`, so most of what is
 * asserted here is that it fires when something the UI shows has moved. The
 * legacy board rendered its own toolbar and keyframe strip, which is why it
 * carried two hard-coded sets of element ids and a check to choose between
 * them; the callback is what replaces all of that.
 *
 * The resize test is the one that guards a silent corruption. Element
 * coordinates are canvas pixels, so a resize that does not rescale slides
 * every player relative to the pitch -- a diagram that still renders, still
 * saves, and no longer means what the coach drew.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TacticalBoard } from './board';

/**
 * A board on a detached canvas.
 *
 * `getContext` returns null under jsdom, so nothing paints -- which is fine:
 * every assertion here is about state, not pixels.
 */
function makeBoard(opts: { wrapperWidth?: number; onChange?: () => void; onTextRequest?: any } = {}) {
  const { wrapperWidth = 820, onChange, onTextRequest } = opts;

  const wrapper = document.createElement('div');
  const canvas = document.createElement('canvas');
  wrapper.appendChild(canvas);
  document.body.appendChild(wrapper);
  Object.defineProperty(wrapper, 'clientWidth', { value: wrapperWidth, configurable: true });

  canvas.getBoundingClientRect = () => ({
    left: 0, top: 0, width: canvas.width, height: canvas.height,
    right: canvas.width, bottom: canvas.height, x: 0, y: 0, toJSON: () => ({})
  });

  const board = new TacticalBoard({ onChange, onTextRequest });
  board.attach(canvas);
  return { board, canvas, wrapper };
}

const at = (x: number, y: number) => ({ x, y });

beforeEach(() => {
  document.body.innerHTML = '';
  (window as any).matchMedia = vi.fn().mockReturnValue({ matches: false });
});

describe('placing pieces', () => {
  it('puts a piece of the active tool where it was asked', () => {
    const { board } = makeBoard();
    board.setTool('attacker');
    board.placePiece('attacker', at(100, 120));

    expect(board.elements).toHaveLength(1);
    expect(board.elements[0]).toMatchObject({ type: 'attacker', x: 100, y: 120 });
  });

  it('numbers each side from one', () => {
    const { board } = makeBoard();
    board.placePiece('attacker', at(10, 10));
    board.placePiece('defender', at(20, 20));
    board.placePiece('attacker', at(30, 30));

    expect(board.elements.map(e => e.number)).toEqual(['1', '1', '2']);
  });

  it('gives a ball and a cone no number', () => {
    const { board } = makeBoard();
    board.placePiece('ball', at(10, 10));
    expect(board.elements[0].number).toBe('');
  });

  it('colours each type as the legacy board does', () => {
    const { board } = makeBoard();
    board.placePiece('attacker', at(1, 1));
    board.placePiece('defender', at(2, 2));
    board.placePiece('gk', at(3, 3));

    expect(board.elements.map(e => e.color)).toEqual(['#0047AB', '#EF4444', '#FFD700']);
  });

  it('selects what it just placed', () => {
    // So Delete removes it, and a coach who mis-taps can undo with one key.
    const { board } = makeBoard();
    const el = board.placePiece('attacker', at(10, 10));
    expect(board.selectedElement).toBe(el);
  });
});

describe('the text tool', () => {
  it('asks its owner for the words rather than reaching for a global', () => {
    // The legacy board called app.showPromptModal -- a global reference from
    // inside a canvas engine.
    const onTextRequest = vi.fn();
    const { board, canvas } = makeBoard({ onTextRequest });
    board.setTool('text');
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 40, clientY: 50 }));

    expect(onTextRequest).toHaveBeenCalledWith({ x: 40, y: 50 });
    expect(board.elements).toHaveLength(0);
  });

  it('places the label once it has them', () => {
    const { board } = makeBoard();
    board.placeText(at(40, 50), 'Overlapping run');

    expect(board.elements[0]).toMatchObject({ type: 'text', text: 'Overlapping run' });
  });

  it('places nothing for an empty label', () => {
    const { board } = makeBoard();
    expect(board.placeText(at(40, 50), '   ')).toBeNull();
    expect(board.elements).toHaveLength(0);
  });
});

describe('undo', () => {
  it('puts back what was there before', () => {
    const { board } = makeBoard();
    board.placePiece('attacker', at(10, 10));
    board.placePiece('defender', at(20, 20));

    expect(board.undo()).toBe(true);
    expect(board.elements).toHaveLength(1);
  });

  it('says so when there is nothing to undo', () => {
    const { board } = makeBoard();
    expect(board.undo()).toBe(false);
  });

  it('restores the pitch type too', () => {
    const { board } = makeBoard();
    board.setPitchType('half');
    board.undo();
    expect(board.pitchType).toBe('full');
  });

  it('drops the oldest state once the history is full', () => {
    // A long session would otherwise hold every state of a full board.
    const { board } = makeBoard();
    for (let i = 0; i < 40; i++) board.placePiece('cone', at(i, i));
    for (let i = 0; i < 40; i++) board.undo();

    // Thirty undos' worth survives; the board does not empty completely.
    expect(board.elements.length).toBeGreaterThan(0);
  });
});

describe('deleting', () => {
  it('removes what is selected', () => {
    const { board } = makeBoard();
    board.placePiece('attacker', at(10, 10));
    board.placePiece('defender', at(20, 20));

    expect(board.deleteSelected()).toBe(true);
    expect(board.elements.map(e => e.type)).toEqual(['attacker']);
  });

  it('removes the LAST piece when nothing is selected', () => {
    // The legacy behaviour, and what a coach placing a shape expects from a
    // Delete key: undo that last one.
    const { board } = makeBoard();
    board.placePiece('attacker', at(10, 10));
    board.placePiece('defender', at(20, 20));
    board.selectedElement = null;

    board.deleteSelected();
    expect(board.elements.map(e => e.type)).toEqual(['attacker']);
  });

  it('renumbers the side afterwards', () => {
    const { board } = makeBoard();
    board.placePiece('attacker', at(10, 10));
    board.placePiece('attacker', at(20, 20));
    board.placePiece('attacker', at(30, 30));

    board.deleteSelected();
    expect(board.elements.map(e => e.number)).toEqual(['1', '2']);
  });

  it('says so when there is nothing at all to delete', () => {
    const { board } = makeBoard();
    expect(board.deleteSelected()).toBe(false);
  });

  it('does not steal Delete from a field being typed in', () => {
    const { board } = makeBoard();
    board.placePiece('attacker', at(10, 10));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));

    expect(board.elements).toHaveLength(1);
  });

  it('deletes on the Delete key when the board has focus', () => {
    const { board } = makeBoard();
    board.placePiece('attacker', at(10, 10));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));

    expect(board.elements).toHaveLength(0);
  });
});

describe('keyframes', () => {
  it('starts with one', () => {
    const { board } = makeBoard();
    expect(board.keyframes).toHaveLength(1);
  });

  it('adds one starting from what is on the board', () => {
    const { board } = makeBoard();
    board.placePiece('attacker', at(10, 10));
    board.addKeyframe();

    expect(board.keyframes).toHaveLength(2);
    expect(board.currentFrameIndex).toBe(1);
    expect(board.elements).toHaveLength(1);
  });

  it('keeps each frame\'s own positions', () => {
    const { board } = makeBoard();
    board.placePiece('attacker', at(10, 10));
    board.addKeyframe();
    board.elements[0].x = 200;
    board.goToKeyframe(0);

    expect(board.elements[0].x).toBe(10);
    board.goToKeyframe(1);
    expect(board.elements[0].x).toBe(200);
  });

  it('refuses to delete the only frame, and says why', () => {
    // A returned reason rather than an alert: an alert cannot be styled,
    // cannot be tested, and blocks the page.
    const { board } = makeBoard();
    const res = board.deleteCurrentKeyframe();

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/start position/i);
  });

  it('deletes a later frame', () => {
    const { board } = makeBoard();
    board.addKeyframe();

    expect(board.deleteCurrentKeyframe().ok).toBe(true);
    expect(board.keyframes).toHaveLength(1);
    expect(board.currentFrameIndex).toBe(0);
  });

  it('ignores a frame index that is not there', () => {
    const { board } = makeBoard();
    board.goToKeyframe(7);
    expect(board.currentFrameIndex).toBe(0);
  });
});

describe('playing the movement', () => {
  it('refuses with one frame, and says what to do', () => {
    // One frame is a position, not a move.
    const { board } = makeBoard();
    const res = board.togglePlay();

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/time frame/i);
    expect(board.isPlaying).toBe(false);
  });

  it('plays with two', () => {
    const { board } = makeBoard();
    board.placePiece('attacker', at(10, 10));
    board.addKeyframe();
    board.goToKeyframe(0);

    expect(board.togglePlay().ok).toBe(true);
    expect(board.isPlaying).toBe(true);
    board.stopAnimation();
  });

  it('stops when told to', () => {
    const { board } = makeBoard();
    board.addKeyframe();
    board.goToKeyframe(0);
    board.togglePlay();
    board.togglePlay();

    expect(board.isPlaying).toBe(false);
  });

  it('settles on a real frame rather than mid-interpolation', () => {
    const { board } = makeBoard();
    board.placePiece('attacker', at(10, 10));
    board.addKeyframe();
    board.elements[0].x = 200;
    board.goToKeyframe(0);

    board.togglePlay();
    board.stopAnimation();
    expect(board.elements[0].x).toBe(10);
  });
});

describe('the change callback', () => {
  it('fires when the tool changes', () => {
    // The whole contract with the component: it renders from these.
    const onChange = vi.fn();
    const { board } = makeBoard({ onChange });
    onChange.mockClear();

    board.setTool('ball');
    expect(onChange).toHaveBeenCalled();
  });

  it('fires when a frame is added or shown', () => {
    const onChange = vi.fn();
    const { board } = makeBoard({ onChange });
    onChange.mockClear();

    board.addKeyframe();
    expect(onChange).toHaveBeenCalled();

    onChange.mockClear();
    board.goToKeyframe(0);
    expect(onChange).toHaveBeenCalled();
  });

  it('fires when the play state changes', () => {
    const onChange = vi.fn();
    const { board } = makeBoard({ onChange });
    board.addKeyframe();
    board.goToKeyframe(0);
    onChange.mockClear();

    board.togglePlay();
    expect(onChange).toHaveBeenCalled();
    board.stopAnimation();
  });

  it('fires when a piece is placed or deleted', () => {
    const onChange = vi.fn();
    const { board } = makeBoard({ onChange });
    onChange.mockClear();

    board.placePiece('attacker', at(10, 10));
    expect(onChange).toHaveBeenCalled();

    onChange.mockClear();
    board.deleteSelected();
    expect(onChange).toHaveBeenCalled();
  });
});

describe('resizing', () => {
  it('fits the board to its wrapper', () => {
    const { canvas } = makeBoard({ wrapperWidth: 500 });
    expect(canvas.width).toBe(480);
    expect(canvas.height).toBe(288);
  });

  it('does not sprawl on a wide desktop', () => {
    const { canvas } = makeBoard({ wrapperWidth: 2000 });
    expect(canvas.width).toBe(840);
  });

  it('gives a narrow phone a board rather than a sliver', () => {
    const { canvas } = makeBoard({ wrapperWidth: 200 });
    expect(canvas.width).toBe(280);
  });

  it('MOVES EVERYTHING BY THE SAME FACTOR', () => {
    // Coordinates are canvas pixels. A resize that does not rescale slides
    // every player relative to the pitch -- a diagram that still renders,
    // still saves, and no longer means what it did.
    const { board, wrapper, canvas } = makeBoard({ wrapperWidth: 820 });
    board.placePiece('attacker', at(400, 240));
    board.drawings.push({ tool: 'line', points: [{ x: 100, y: 100 }] });

    const before = canvas.width;
    Object.defineProperty(wrapper, 'clientWidth', { value: 420, configurable: true });
    board.resize();

    const factor = canvas.width / before;
    expect(board.elements[0].x).toBeCloseTo(400 * factor, 5);
    expect(board.drawings[0].points[0].x).toBeCloseTo(100 * factor, 5);
  });

  it('rescales every keyframe too, not just the visible one', () => {
    // A frame left unscaled makes the animation jump on the step into it.
    const { board, wrapper } = makeBoard({ wrapperWidth: 820 });
    board.placePiece('attacker', at(400, 240));
    board.addKeyframe();
    board.goToKeyframe(0);

    Object.defineProperty(wrapper, 'clientWidth', { value: 420, configurable: true });
    board.resize();

    expect(board.keyframes[1].elements[0].x).toBeLessThan(400);
  });

  it('does nothing when the size has not changed', () => {
    const { board } = makeBoard({ wrapperWidth: 820 });
    board.placePiece('attacker', at(400, 240));
    board.resize();

    expect(board.elements[0].x).toBe(400);
  });
});

describe('loading and saving', () => {
  it('round trips a diagram through its own format', () => {
    const { board } = makeBoard();
    board.placePiece('attacker', at(100, 120));
    board.setPitchType('half');
    board.addKeyframe();

    const data = board.toDiagramData();

    const { board: other } = makeBoard();
    other.fromDiagramData(data);

    expect(other.elements[0]).toMatchObject({ type: 'attacker', x: 100, y: 120 });
    expect(other.pitchType).toBe('half');
    expect(other.keyframes).toHaveLength(2);
  });

  it('saves the frame being edited, not the one last committed', () => {
    // Otherwise the last thing the coach drew is missing from the save.
    const { board } = makeBoard();
    board.placePiece('attacker', at(10, 10));
    board.elements[0].x = 250;

    expect(board.toDiagramData().keyframes[0].elements[0].x).toBe(250);
  });

  it('clears the undo history when a diagram is loaded', () => {
    // Undoing into the previous drill's board would be worse than no undo.
    const { board } = makeBoard();
    board.placePiece('attacker', at(10, 10));
    board.fromDiagramData({ elements: [], drawings: [], pitchType: 'full' });

    expect(board.undo()).toBe(false);
  });

  it('opens an empty board for a diagram that is not there', () => {
    const { board } = makeBoard();
    board.fromDiagramData(null);

    expect(board.elements).toEqual([]);
    expect(board.keyframes).toHaveLength(1);
  });
});

describe('detaching', () => {
  it('removes its listeners, so a closed modal stops responding', () => {
    const { board } = makeBoard();
    board.placePiece('attacker', at(10, 10));
    board.detach();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(board.elements).toHaveLength(1);
  });

  it('stops an animation on the way out', () => {
    const { board } = makeBoard();
    board.addKeyframe();
    board.goToKeyframe(0);
    board.togglePlay();
    board.detach();

    expect(board.isPlaying).toBe(false);
  });
});

describe('unsaved work', () => {
  /*
   * A drawn diagram is only in the canvas until someone saves it, and the
   * board looks identical either way. The flag is what lets the screen above
   * warn before a close throws the work away.
   */
  it('starts clean, because nothing has been drawn yet', () => {
    const { board } = makeBoard();
    expect(board.dirty).toBe(false);
  });

  it('is dirty once a piece is placed', () => {
    const { board } = makeBoard();
    board.placePiece('attacker', at(20, 20));
    expect(board.dirty).toBe(true);
  });

  it('is dirty after a clear, which is a change like any other', () => {
    const { board } = makeBoard();
    board.placePiece('attacker', at(20, 20));
    board.markSaved();

    board.clear();
    expect(board.dirty).toBe(true);
  });

  it('is dirty after the pitch changes under the same pieces', () => {
    const { board } = makeBoard();
    board.setPitchType('half');
    expect(board.dirty).toBe(true);
  });

  it('is dirty after a time frame is added or deleted', () => {
    const { board } = makeBoard();
    board.addKeyframe();
    expect(board.dirty).toBe(true);

    board.markSaved();
    board.deleteCurrentKeyframe();
    expect(board.dirty).toBe(true);
  });

  it('stays clean when the delete is refused', () => {
    // Refusing to delete the start position changed nothing, so there is
    // nothing to warn about.
    const { board } = makeBoard();
    const res = board.deleteCurrentKeyframe();

    expect(res.ok).toBe(false);
    expect(board.dirty).toBe(false);
  });

  it('counts an undo as an edit', () => {
    // Undoing back to what was loaded may leave the diagram where it began,
    // but a warning that is occasionally over-cautious costs a keystroke and
    // one that misses costs the diagram.
    const { board } = makeBoard();
    board.placePiece('attacker', at(20, 20));
    board.markSaved();

    board.undo();
    expect(board.dirty).toBe(true);
  });

  it('does not count picking a tool, which draws nothing', () => {
    const { board } = makeBoard();
    board.setTool('line_arrow');
    expect(board.dirty).toBe(false);
  });

  it('does not count stepping between time frames', () => {
    const { board } = makeBoard();
    board.addKeyframe();
    board.markSaved();

    board.goToKeyframe(0);
    board.goToKeyframe(1);
    expect(board.dirty).toBe(false);
  });

  it('does not count playing the movement back', () => {
    const { board } = makeBoard();
    board.addKeyframe();
    board.markSaved();
    board.goToKeyframe(0);

    board.togglePlay();
    board.stopAnimation();
    expect(board.dirty).toBe(false);
  });

  it('is clean again after a save, and after opening a stored diagram', () => {
    const { board } = makeBoard();
    board.placePiece('attacker', at(20, 20));
    const stored = board.toDiagramData();

    board.markSaved();
    expect(board.dirty).toBe(false);

    board.placePiece('defender', at(40, 40));
    expect(board.dirty).toBe(true);

    // Opening a diagram is not an edit of it.
    board.fromDiagramData(stored);
    expect(board.dirty).toBe(false);
  });

  it('tells the screen above when it becomes clean', () => {
    // The "Unsaved changes" mark is rendered off onChange, so a save that
    // did not fire one would leave the warning up over a saved diagram.
    const onChange = vi.fn();
    const { board } = makeBoard({ onChange });
    board.placePiece('attacker', at(20, 20));
    onChange.mockClear();

    board.markSaved();
    expect(onChange).toHaveBeenCalled();
  });
});
