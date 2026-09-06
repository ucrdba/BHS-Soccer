/**
 * The `diagram_data` blob.
 *
 * **This is the one thing in the planner that can destroy a coach's work.**
 * Every drill in `drills_bank` and every row in `practice_plans` may carry
 * one; it is unversioned, unvalidated, and there is no migration path. A
 * reader that expects a subtly different shape orphans every diagram ever
 * drawn — and nothing on screen would say so, because the board would simply
 * open empty.
 *
 * So these two functions are the legacy ones, moved rather than rewritten,
 * and `serialize.test.ts` builds a diagram on the **legacy** board and loads
 * it here to prove they agree.
 *
 * Ported from public/js/diagrammer.js during Phase 4b.
 */
import { blankKeyframes, type Keyframe } from './frames';
import type { PitchType } from './draw';

export interface DiagramState {
  keyframes: Keyframe[];
  currentFrameIndex: number;
  elements: any[];
  drawings: any[];
  pitchType: PitchType;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

/**
 * The board, as it is stored.
 *
 * `elements` and `drawings` are written alongside the keyframes even though
 * frame 0 holds the same thing. That redundancy is what lets a reader that
 * knows nothing about keyframes still open the diagram, and removing it would
 * be a shape change.
 */
export function exportDiagram(state: DiagramState): DiagramState {
  return {
    keyframes: clone(state.keyframes),
    currentFrameIndex: state.currentFrameIndex,
    elements: clone(state.elements),
    drawings: clone(state.drawings),
    pitchType: state.pitchType
  };
}

/**
 * A stored blob, as a board.
 *
 * Three shapes arrive here and all three have to work:
 *
 * - **A string.** PostgREST hands back `jsonb` as text often enough that this
 *   is a normal path, not an edge case.
 * - **A keyframed diagram**, the current shape.
 * - **A pre-keyframe diagram** — `elements` and `drawings` and nothing else.
 *   There are drills in the library from before keyframes existed, and they
 *   become a single Time 0 frame.
 *
 * Anything unreadable gives an empty board rather than throwing, because a
 * corrupt blob must not take the whole modal down with it.
 */
export function loadDiagram(data: any): DiagramState {
  const empty: DiagramState = {
    keyframes: blankKeyframes(),
    currentFrameIndex: 0,
    elements: [],
    drawings: [],
    pitchType: 'full'
  };

  if (!data) return empty;

  let parsed = data;
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch {
      // A corrupt blob opens an empty board. Throwing would take the modal
      // with it and leave no way to draw a replacement.
      return empty;
    }
  }
  if (!parsed || typeof parsed !== 'object') return empty;

  const pitchType: PitchType = parsed.pitchType || 'full';

  if (Array.isArray(parsed.keyframes) && parsed.keyframes.length > 0) {
    const keyframes = clone(parsed.keyframes) as Keyframe[];
    // Clamped: a blob saved on frame 3 whose frames were later cut would
    // otherwise index past the end and open a board with nothing on it.
    const index = Math.min(
      Math.max(Number(parsed.currentFrameIndex) || 0, 0), keyframes.length - 1);
    const frame = keyframes[index];

    return {
      keyframes,
      currentFrameIndex: index,
      elements: frame?.elements ? clone(frame.elements) : clone(parsed.elements || []),
      drawings: frame?.drawings ? clone(frame.drawings) : clone(parsed.drawings || []),
      pitchType
    };
  }

  // Pre-keyframe: one frame holding what was drawn.
  const elements = clone(parsed.elements || []);
  const drawings = clone(parsed.drawings || []);
  return {
    keyframes: [{
      time: 0,
      label: 'Time 0 (Start Position)',
      elements: clone(elements),
      drawings: clone(drawings)
    }],
    currentFrameIndex: 0,
    elements,
    drawings,
    pitchType
  };
}
