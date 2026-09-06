/**
 * Keyframes, and the movement between them.
 *
 * The two behaviours worth reading twice are propagation and matching.
 *
 * A player added on frame 2 is copied into every later frame, or they pop
 * into existence mid-animation -- which a coach reads as a bug in the diagram
 * rather than in the tool.
 *
 * Interpolation matches on id, then on type-and-number, then on type for a
 * ball. The fallbacks are not sloppiness: a diagram built frame by frame has
 * elements that are plainly the same player without sharing an id, and
 * without them the player teleports instead of running.
 */
import { describe, it, expect } from 'vitest';
import {
  blankKeyframes, reindexNumbers, propagateForward, commitFrame,
  appendKeyframe, removeKeyframe, interpolateFrames, type Keyframe
} from './frames';

const el = (over: any = {}) => ({ id: 1, type: 'attacker', x: 0, y: 0, number: '1', ...over });

const frame = (over: Partial<Keyframe> = {}): Keyframe => ({
  time: 0, label: 'Time 0', elements: [], drawings: [], ...over
});

describe('a fresh board', () => {
  it('has exactly one frame', () => {
    // Zero frames would leave nowhere to hold what gets drawn.
    expect(blankKeyframes()).toHaveLength(1);
  });

  it('names it as the start position', () => {
    expect(blankKeyframes()[0].label).toMatch(/start/i);
  });

  it('is a new array each time, not a shared one', () => {
    const a = blankKeyframes();
    a[0].elements.push(el());
    expect(blankKeyframes()[0].elements).toHaveLength(0);
  });
});

describe('renumbering', () => {
  it('numbers each side from one', () => {
    // The numbers are shirt positions within a team, not an index into the
    // array, so the two sides count separately.
    const out = reindexNumbers([
      el({ id: 1, type: 'attacker' }),
      el({ id: 2, type: 'defender' }),
      el({ id: 3, type: 'attacker' })
    ]);
    expect(out.map(e => e.number)).toEqual(['1', '1', '2']);
  });

  it('leaves a goalkeeper and a cone alone', () => {
    // A GK is drawn as GK and a cone has no number at all.
    const out = reindexNumbers([
      el({ id: 1, type: 'gk', number: undefined }),
      el({ id: 2, type: 'cone', number: undefined })
    ]);
    expect(out[0].number).toBeUndefined();
    expect(out[1].number).toBeUndefined();
  });

  it('closes the gap after a player is removed', () => {
    const out = reindexNumbers([el({ id: 1, number: '1' }), el({ id: 3, number: '3' })]);
    expect(out.map(e => e.number)).toEqual(['1', '2']);
  });

  it('does not mutate what it was given', () => {
    const input = [el({ number: '9' })];
    reindexNumbers(input);
    expect(input[0].number).toBe('9');
  });
});

describe('propagating a new element forward', () => {
  const three = () => [
    frame({ elements: [el({ id: 1, x: 10 })] }),
    frame({ time: 1, elements: [el({ id: 1, x: 50 })] }),
    frame({ time: 2, elements: [el({ id: 1, x: 90 })] })
  ];

  it('copies an element into every later frame', () => {
    // Otherwise the player appears from nowhere part way through the move.
    const frames = three();
    frames[0].elements.push(el({ id: 2, type: 'ball', x: 20, y: 20 }));

    const out = propagateForward(frames, 0);
    expect(out[1].elements.map(e => e.id)).toContain(2);
    expect(out[2].elements.map(e => e.id)).toContain(2);
  });

  it('copies it at the position it was added', () => {
    const frames = three();
    frames[0].elements.push(el({ id: 2, type: 'ball', x: 20, y: 30 }));

    const out = propagateForward(frames, 0);
    expect(out[2].elements.find(e => e.id === 2)).toMatchObject({ x: 20, y: 30 });
  });

  it('does NOT copy backwards', () => {
    // A player added on frame 2 was not on the pitch at frame 1, and
    // back-filling them would rewrite the start of the move.
    const frames = three();
    frames[1].elements.push(el({ id: 9, x: 60 }));

    const out = propagateForward(frames, 1);
    expect(out[0].elements.map(e => e.id)).not.toContain(9);
    expect(out[2].elements.map(e => e.id)).toContain(9);
  });

  it('leaves an element that is already there where it is', () => {
    // The whole point of keyframes: frame 2 holds the SAME player, moved.
    const out = propagateForward(three(), 0);
    expect(out[1].elements.find(e => e.id === 1).x).toBe(50);
  });

  it('does nothing on a single-frame board', () => {
    const one = [frame({ elements: [el()] })];
    expect(propagateForward(one, 0)).toEqual(one);
  });
});

describe('committing what is on the board', () => {
  it('writes the elements and drawings into the frame', () => {
    const frames = blankKeyframes();
    const out = commitFrame(frames, 0, [el({ x: 42 })], [{ points: [] }]);

    expect(out[0].elements[0].x).toBe(42);
    expect(out[0].drawings).toHaveLength(1);
  });

  it('stores a copy, not the live array', () => {
    // The board keeps mutating these; a shared reference would rewrite the
    // saved frame every time a player is dragged.
    const live = [el({ x: 10 })];
    const out = commitFrame(blankKeyframes(), 0, live, []);
    live[0].x = 999;

    expect(out[0].elements[0].x).toBe(10);
  });

  it('propagates as it commits', () => {
    const frames = [frame(), frame({ time: 1 })];
    const out = commitFrame(frames, 0, [el({ id: 7 })], []);
    expect(out[1].elements.map(e => e.id)).toContain(7);
  });

  it('ignores a frame index that is not there', () => {
    const frames = blankKeyframes();
    expect(commitFrame(frames, 5, [el()], [])).toEqual(frames);
  });
});

describe('adding a frame', () => {
  it('starts from a copy of the frame before it', () => {
    // A new step begins where the last one ended; a coach moves players from
    // there rather than placing the whole shape again.
    const out = appendKeyframe([frame({ elements: [el({ x: 10 })] })], 0);
    expect(out).toHaveLength(2);
    expect(out[1].elements[0].x).toBe(10);
  });

  it('copies rather than shares', () => {
    const out = appendKeyframe([frame({ elements: [el({ x: 10 })] })], 0);
    out[1].elements[0].x = 99;
    expect(out[0].elements[0].x).toBe(10);
  });

  it('names and times it by its position', () => {
    const out = appendKeyframe(blankKeyframes(), 0);
    expect(out[1].label).toBe('Time 1');
    expect(out[1].time).toBe(1);
  });
});

describe('removing a frame', () => {
  const two = () => [frame(), frame({ time: 1, label: 'Time 1' })];

  it('takes it out and renumbers the rest', () => {
    // Otherwise the strip reads Time 0, Time 2, Time 3 after a deletion.
    const three = two().concat([frame({ time: 2, label: 'Time 2' })]);
    const out = removeKeyframe(three, 1)!;

    expect(out).toHaveLength(2);
    expect(out.map(f => f.time)).toEqual([0, 1]);
    expect(out[1].label).toBe('Time 1');
  });

  it('keeps naming the first one as the start position', () => {
    const out = removeKeyframe(two(), 0)!;
    expect(out[0].label).toMatch(/start/i);
  });

  it('refuses to remove the last frame', () => {
    // A diagram with no frames has nowhere to hold what is on it.
    expect(removeKeyframe(blankKeyframes(), 0)).toBeNull();
  });

  it('refuses an index that is not there', () => {
    expect(removeKeyframe(two(), 7)).toBeNull();
  });
});

describe('interpolating between frames', () => {
  const a = [el({ id: 1, x: 0, y: 0 })];
  const b = [el({ id: 1, x: 100, y: 50 })];

  it('gives frame A exactly at the start of a step', () => {
    expect(interpolateFrames(a, b, 0)[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('gives frame B\'s positions at the end', () => {
    expect(interpolateFrames(a, b, 1)[0]).toMatchObject({ x: 100, y: 50 });
  });

  it('is half way across at half way through', () => {
    expect(interpolateFrames(a, b, 0.5)[0]).toMatchObject({ x: 50, y: 25 });
  });

  it('keeps everything else about the element', () => {
    const out = interpolateFrames(
      [el({ id: 1, color: '#0047AB', number: '7' })],
      [el({ id: 1, x: 100, color: '#0047AB', number: '7' })], 0.5);
    expect(out[0]).toMatchObject({ color: '#0047AB', number: '7', type: 'attacker' });
  });

  it('matches on type and number when the ids differ', () => {
    // A diagram drawn frame by frame has elements that are plainly the same
    // player without sharing an id. Without this they teleport.
    const out = interpolateFrames(
      [el({ id: 'a', type: 'attacker', number: '7', x: 0 })],
      [el({ id: 'b', type: 'attacker', number: '7', x: 100 })], 0.5);

    expect(out).toHaveLength(1);
    expect(out[0].x).toBe(50);
  });

  it('matches a ball on type alone, since there is one', () => {
    const out = interpolateFrames(
      [{ id: 'a', type: 'ball', x: 0, y: 0 }],
      [{ id: 'b', type: 'ball', x: 80, y: 0 }], 0.5);

    expect(out).toHaveLength(1);
    expect(out[0].x).toBe(40);
  });

  it('does not match two different players on type alone', () => {
    // An attacker without a number must not be paired with any attacker
    // that happens to be in the next frame.
    const out = interpolateFrames(
      [{ id: 'a', type: 'attacker', x: 0, y: 0 }],
      [{ id: 'b', type: 'attacker', x: 80, y: 0 }], 0.5);

    expect(out).toHaveLength(2);
  });

  it('carries an unmatched element at its own position', () => {
    // Rather than vanishing part way through the step.
    const out = interpolateFrames([el({ id: 1, x: 10 }), el({ id: 2, number: '2', x: 20 })],
      [el({ id: 1, x: 100 })], 0.5);

    expect(out.find(e => e.id === 2)).toMatchObject({ x: 20 });
  });

  it('includes an element that only exists in the later frame', () => {
    // A player joining the move appears.
    const out = interpolateFrames(a, b.concat([el({ id: 5, number: '5', x: 70 })]), 0.5);
    expect(out.map(e => e.id)).toContain(5);
  });

  it('uses each later element only once', () => {
    // Two attackers both numbered 7 must not both interpolate to the same
    // destination and land on top of each other.
    const out = interpolateFrames(
      [el({ id: 'a1', number: '7', x: 0 }), el({ id: 'a2', number: '7', x: 10 })],
      [el({ id: 'b1', number: '7', x: 100 })], 1);

    const atDestination = out.filter(e => e.x === 100);
    expect(atDestination).toHaveLength(1);
  });

  it('copes with empty frames', () => {
    expect(interpolateFrames([], [], 0.5)).toEqual([]);
    expect(interpolateFrames(null as any, null as any, 0.5)).toEqual([]);
  });

  it('does not mutate either frame', () => {
    const from = [el({ id: 1, x: 0 })];
    const to = [el({ id: 1, x: 100 })];
    interpolateFrames(from, to, 0.5);

    expect(from[0].x).toBe(0);
    expect(to[0].x).toBe(100);
  });
});

describe('agreement with the legacy board', () => {
  // Interpolation decides what an animation looks like. A port that matched
  // elements differently would play a visibly different move from the same
  // stored diagram.
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

  it('interpolates the same way', async () => {
    const src = (await import('./legacy/diagrammer.legacy.js?raw')).default;
    const Legacy: any = new Function(strip(src) + '\nreturn SoccerTacticalBoard;')();
    const board = new Legacy();

    const cases: [any[], any[], number][] = [
      [[el({ id: 1, x: 0 })], [el({ id: 1, x: 100 })], 0.5],
      [[el({ id: 'a', number: '7' })], [el({ id: 'b', number: '7', x: 60 })], 0.25],
      [[{ id: 'a', type: 'ball', x: 0, y: 0 }], [{ id: 'b', type: 'ball', x: 80, y: 40 }], 0.75],
      [[el({ id: 1, x: 10 }), el({ id: 2, number: '2', x: 20 })], [el({ id: 1, x: 100 })], 0.5],
      [[], [el({ id: 3, x: 5 })], 0.5]
    ];

    cases.forEach(([from, to, t]) => {
      expect(interpolateFrames(from, to, t)).toEqual(board.interpolateFrames(from, to, t));
    });
  });
});
