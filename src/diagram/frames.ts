/**
 * Keyframes — the same players, one step later.
 *
 * A tactical diagram is a sequence of positions, and playing it interpolates
 * between them. Two pieces of bookkeeping make that work:
 *
 * **Propagation.** A player added on frame 2 is copied into every later
 * frame, at the position they were added. Without it they pop into existence
 * mid-animation, which reads as a bug in the diagram rather than in the tool.
 *
 * **Matching.** Interpolating frame A to frame B has to decide which element
 * in B *is* which element in A. Id first; then type-and-number, because a
 * diagram built frame by frame has elements that are the same player without
 * sharing an id; then, for a ball only, type alone — there is one ball.
 *
 * Ported from public/js/diagrammer.js during Phase 4b.
 */
export interface Keyframe {
  time: number;
  label: string;
  elements: any[];
  drawings: any[];
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

/** A board that has not been drawn on yet: exactly one frame. */
export function blankKeyframes(): Keyframe[] {
  return [{ time: 0, label: 'Time 0 (Start Position)', elements: [], drawings: [] }];
}

/**
 * Number the attackers 1..n and the defenders 1..n, in board order.
 *
 * Per side, because the numbers are shirt positions within a team rather than
 * an index into the array. A goalkeeper is drawn as GK and a cone has no
 * number at all, so neither is touched.
 */
export function reindexNumbers(elements: any[]): any[] {
  let attackers = 1;
  let defenders = 1;

  return (elements || []).map(el => {
    if (el?.type === 'attacker') return { ...el, number: String(attackers++) };
    if (el?.type === 'defender') return { ...el, number: String(defenders++) };
    return el;
  });
}

/**
 * Carry every element on one frame into all the frames after it.
 *
 * Only forward: a player added on frame 2 was not on the pitch at frame 1,
 * and back-filling them would rewrite the start of the move.
 */
export function propagateForward(frames: Keyframe[], fromIndex: number): Keyframe[] {
  const list = (frames || []).slice();
  if (list.length <= 1) return list;

  const source = list[fromIndex];
  if (!source?.elements) return list;

  for (let k = fromIndex + 1; k < list.length; k++) {
    const later = list[k];
    if (!later?.elements) continue;

    const added = source.elements.filter(
      el => !later.elements.some(other => other.id === el.id));
    if (added.length) {
      list[k] = { ...later, elements: later.elements.concat(clone(added)) };
    }
  }
  return list;
}

/** Write what is on the board into the frame it belongs to. */
export function commitFrame(
  frames: Keyframe[], index: number, elements: any[], drawings: any[]
): Keyframe[] {
  const list = (frames || []).slice();
  if (!list[index]) return list;

  list[index] = { ...list[index], elements: clone(elements || []), drawings: clone(drawings || []) };
  return propagateForward(list, index);
}

/** A new frame, starting from a copy of the one before it. */
export function appendKeyframe(frames: Keyframe[], fromIndex: number): Keyframe[] {
  const list = (frames || []).slice();
  const previous = list[fromIndex] || { elements: [], drawings: [] };
  const index = list.length;

  list.push({
    time: index,
    label: `Time ${index}`,
    elements: clone(previous.elements || []),
    drawings: clone(previous.drawings || [])
  });
  return list;
}

/**
 * Remove one frame, keeping at least one.
 *
 * Returns null when the board is down to its last frame: a diagram with no
 * frames has nowhere to hold what is on it.
 */
export function removeKeyframe(frames: Keyframe[], index: number): Keyframe[] | null {
  const list = (frames || []).slice();
  if (list.length <= 1) return null;
  if (index < 0 || index >= list.length) return null;

  list.splice(index, 1);
  // Relabelled, or the strip reads Time 0, Time 2, Time 3 after a deletion.
  return list.map((frame, i) => ({
    ...frame,
    time: i,
    label: i === 0 ? 'Time 0 (Start Position)' : `Time ${i}`
  }));
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Frame A moved `t` of the way toward frame B.
 *
 * An element with no match in B is carried at its own position rather than
 * vanishing part way through the step, and an element only in B is included,
 * so a player joining the move appears.
 */
export function interpolateFrames(elementsA: any[], elementsB: any[], t: number): any[] {
  const result: any[] = [];
  const usedB = new Set<any>();

  (elementsA || []).forEach(elA => {
    let matchB = (elementsB || []).find(elB => elB.id === elA.id);

    // A diagram drawn frame by frame has elements that are the same player
    // without sharing an id.
    if (!matchB && elA.type && elA.number) {
      matchB = (elementsB || []).find(
        elB => !usedB.has(elB) && elB.type === elA.type && elB.number === elA.number);
    }
    if (!matchB && elA.type === 'ball') {
      matchB = (elementsB || []).find(elB => !usedB.has(elB) && elB.type === 'ball');
    }

    if (matchB) {
      usedB.add(matchB);
      result.push({ ...elA, x: lerp(elA.x, matchB.x, t), y: lerp(elA.y, matchB.y, t) });
    } else {
      result.push({ ...elA });
    }
  });

  (elementsB || []).forEach(elB => {
    if (!usedB.has(elB)) result.push({ ...elB });
  });

  return result;
}
