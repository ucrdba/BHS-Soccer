/**
 * The three diagrams the demo's sample program ships with, captured from the
 * real board rather than written by hand.
 *
 * diagram_data is stored, unversioned and irreplaceable (CLAUDE.md): a blob
 * that merely looks right can fail in the print path's rasterizer and nowhere
 * earlier. So these are built by driving TacticalBoard's own API and taking
 * its own export, and the committed Resouces/SQL/demo/demo_diagrams.json must
 * equal what the board produces today.
 *
 * To regenerate after a board change:
 *   WRITE_DEMO_DIAGRAMS=1 npx vitest run src/diagram/demo-diagrams.test.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TacticalBoard } from './board';
import { loadDiagram, exportDiagram } from './serialize';

const FILE = join(process.cwd(), 'Resouces', 'SQL', 'demo', 'demo_diagrams.json');

/** A board on a detached canvas, as board.test.ts builds one. Nothing paints under jsdom. */
function board(): TacticalBoard {
  const wrapper = document.createElement('div');
  const canvas = document.createElement('canvas');
  wrapper.appendChild(canvas);
  document.body.appendChild(wrapper);
  Object.defineProperty(wrapper, 'clientWidth', { value: 820, configurable: true });
  canvas.getBoundingClientRect = () => ({
    left: 0, top: 0, width: canvas.width, height: canvas.height,
    right: canvas.width, bottom: canvas.height, x: 0, y: 0, toJSON: () => ({})
  });
  const b = new TacticalBoard();
  b.attach(canvas);
  return b;
}

const at = (x: number, y: number) => ({ x, y });

/** Moves a piece on the current frame, found by type and shirt number. */
function move(b: TacticalBoard, type: string, number: string, x: number, y: number): void {
  const el = b.elements.find(e => e.type === type && String(e.number ?? '') === number);
  if (!el) throw new Error(`no ${type} ${number || '(unnumbered)'} on this frame`);
  el.x = x;
  el.y = y;
}

/**
 * Element ids are `Date.now() + Math.random()`: stable within one diagram, but
 * different on every run. Renumbered 1..n in first-seen order so the committed
 * file is reproducible. An element keeps one id in every frame, which is what
 * the board's interpolation matches on first.
 */
function normalize(data: any): any {
  const ids = new Map<number, number>();
  const fix = (els: any[]) => els.map(e => {
    if (!ids.has(e.id)) ids.set(e.id, ids.size + 1);
    return { ...e, id: ids.get(e.id) };
  });
  return {
    ...data,
    keyframes: data.keyframes.map((k: any) => ({ ...k, elements: fix(k.elements) })),
    elements: fix(data.elements)
  };
}

/** Four around the outside, two in the middle; the ball goes wide, then switches. */
function rondo() {
  const b = board();
  b.setPitchType('blank');
  b.placePiece('attacker', at(250, 140));
  b.placePiece('attacker', at(550, 140));
  b.placePiece('attacker', at(550, 340));
  b.placePiece('attacker', at(250, 340));
  b.placePiece('defender', at(370, 230));
  b.placePiece('defender', at(430, 250));
  b.placePiece('ball', at(265, 150));
  b.placeText(at(400, 60), 'Rondo 4v2: two touches');
  b.addKeyframe();
  move(b, 'ball', '', 535, 150);
  move(b, 'defender', '1', 470, 190);
  b.addKeyframe();
  move(b, 'ball', '', 535, 330);
  move(b, 'defender', '2', 480, 300);
  b.goToKeyframe(0);
  return b.toDiagramData();
}

/** The winger comes inside, the full-back overlaps, and the ball goes in. */
function overlap() {
  const b = board();
  b.setPitchType('half');
  b.placePiece('attacker', at(300, 380));
  b.placePiece('attacker', at(330, 250));
  b.placePiece('attacker', at(470, 150));
  b.placePiece('defender', at(360, 230));
  b.placePiece('defender', at(500, 120));
  b.placePiece('gk', at(400, 40));
  b.placePiece('ball', at(335, 262));
  b.addKeyframe();
  move(b, 'attacker', '2', 420, 240);
  move(b, 'attacker', '1', 300, 180);
  move(b, 'ball', '', 300, 190);
  b.addKeyframe();
  move(b, 'attacker', '3', 430, 90);
  move(b, 'ball', '', 430, 100);
  b.goToKeyframe(0);
  return b.toDiagramData();
}

/** A wide crosser and three runners: near post, far post, cut-back. */
function crossing() {
  const b = board();
  b.setPitchType('half');
  b.placePiece('attacker', at(150, 150));
  b.placePiece('attacker', at(360, 260));
  b.placePiece('attacker', at(460, 280));
  b.placePiece('attacker', at(400, 330));
  b.placePiece('gk', at(400, 40));
  b.placePiece('cone', at(330, 110));
  b.placePiece('cone', at(470, 110));
  b.placePiece('ball', at(160, 160));
  b.addKeyframe();
  move(b, 'attacker', '2', 350, 100);
  move(b, 'attacker', '3', 480, 110);
  move(b, 'attacker', '4', 390, 190);
  b.addKeyframe();
  move(b, 'ball', '', 350, 105);
  b.goToKeyframe(0);
  return b.toDiagramData();
}

const build = () => ({ rondo: normalize(rondo()), overlap: normalize(overlap()), crossing: normalize(crossing()) });

beforeEach(() => {
  document.body.innerHTML = '';
  (window as any).matchMedia = vi.fn().mockReturnValue({ matches: false });
});

describe('the demo diagrams', () => {
  it('are exactly what the board produces today', () => {
    const built = build();
    if (process.env.WRITE_DEMO_DIAGRAMS === '1') {
      writeFileSync(FILE, JSON.stringify(built, null, 2) + '\n');
    }
    expect(existsSync(FILE)).toBe(true);
    expect(JSON.parse(readFileSync(FILE, 'utf8'))).toEqual(built);
  });

  it('are the three the seed puts in', () => {
    const stored = JSON.parse(readFileSync(FILE, 'utf8'));
    expect(Object.keys(stored).sort()).toEqual(['crossing', 'overlap', 'rondo']);
  });

  it('each open on the board exactly as stored', () => {
    const stored = JSON.parse(readFileSync(FILE, 'utf8'));
    for (const [key, data] of Object.entries<any>(stored)) {
      expect(exportDiagram(loadDiagram(data)), key).toEqual(data);
    }
  });

  it('each have a starting position and two steps to play through', () => {
    const stored = JSON.parse(readFileSync(FILE, 'utf8'));
    for (const [key, data] of Object.entries<any>(stored)) {
      expect(data.keyframes, key).toHaveLength(3);
      expect(data.currentFrameIndex, key).toBe(0);
      expect(data.keyframes[0].elements.length, key).toBeGreaterThan(4);
    }
  });
});
