/**
 * The tactical board.
 *
 * `SoccerTacticalBoard` ported off the prototype. The behaviour is the
 * legacy behaviour; what changed is what it talks to.
 *
 * - `attach(canvas)` takes the **element**. The legacy `init(canvasId)` looked
 *   it up by id, which is why there were two hard-coded sets of ids and a
 *   `this.app.masterDiagrammer === this` check to choose between them. Two
 *   boards are two instances; the check and the ids are gone.
 * - `updateToolbarUI()` and `updateTimelineUI()` are **gone too**, replaced by
 *   one `onChange` callback. A class that renders its own controls is what
 *   produced the id-switching in the first place.
 * - `alert()` is gone: a refusal is a returned reason. An alert cannot be
 *   styled, cannot be tested, and blocks the page.
 * - The text tool asks its owner for the text rather than reaching for a
 *   global `app.showPromptModal`.
 *
 * Ported from public/js/diagrammer.js during Phase 4b.
 */
import { renderBoard, type PitchType, type BoardElement, type Drawing, type Point } from './draw';
import { canvasPos, isPointNearDrawing } from './geometry';
import {
  blankKeyframes, reindexNumbers, commitFrame, appendKeyframe,
  removeKeyframe, interpolateFrames, type Keyframe
} from './frames';
import { exportDiagram, loadDiagram, type DiagramState } from './serialize';

export type Tool =
  | 'select' | 'eraser' | 'text'
  | 'attacker' | 'defender' | 'gk' | 'ball' | 'cone' | 'goal'
  | 'line_solid' | 'line_arrow' | 'line_dribble' | 'line_dashed' | 'line_shot';

const PIECE_TOOLS: Tool[] = ['attacker', 'defender', 'gk', 'ball', 'cone', 'goal'];
const LINE_TOOLS: Tool[] = ['line_solid', 'line_arrow', 'line_dribble', 'line_dashed', 'line_shot'];

const PIECE_COLORS: Record<string, string> = {
  attacker: '#0047AB', defender: '#EF4444', gk: '#FFD700'
};

const LINE_COLORS: Record<string, string> = {
  line_shot: '#EF4444', line_dashed: '#FFD700', line_dribble: '#10B981'
};

/** 1.2s per step, as the legacy board plays it. */
const STEP_MS = 1200;
const HISTORY_LIMIT = 30;

export interface BoardOptions {
  /** Fires whenever anything the UI shows has moved. */
  onChange?: () => void;
  /** Asked for the text of a label; the owner calls `placeText`. */
  onTextRequest?: (pos: Point) => void;
}

interface Snapshot {
  elements: BoardElement[];
  drawings: Drawing[];
  pitchType: PitchType;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export class TacticalBoard {
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;

  elements: BoardElement[] = [];
  drawings: Drawing[] = [];
  keyframes: Keyframe[] = blankKeyframes();
  currentFrameIndex = 0;
  pitchType: PitchType = 'full';

  activeTool: Tool = 'attacker';
  selectedElement: BoardElement | null = null;
  selectedDrawing: Drawing | null = null;
  isPlaying = false;

  private history: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private animId: number | null = null;
  private detachers: Array<() => void> = [];

  private draggedElement: BoardElement | null = null;
  private draggedDrawing: Drawing | null = null;
  private dragOffset: Point = { x: 0, y: 0 };
  private lastDragPos: Point | null = null;
  private isDrawing = false;
  private currentPath: Drawing | null = null;

  constructor(private options: BoardOptions = {}) {}

  private changed(): void { this.options.onChange?.(); }

  // ── the canvas ──────────────────────────────────────────────────────────

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext ? canvas.getContext('2d') : null;
    this.fitToWrapper();
    this.bindEvents();
    this.render();
    this.changed();
  }

  /** Every listener this board added, removed. */
  detach(): void {
    this.stopAnimation();
    this.detachers.forEach(off => off());
    this.detachers = [];
    this.canvas = null;
    this.ctx = null;
  }

  /**
   * Size the board to the space it has, keeping the pitch's 5:3 proportions.
   *
   * Capped at 840 so it does not sprawl on a desktop and floored at 280 so a
   * narrow phone gets a board rather than a sliver.
   */
  fitToWrapper(): boolean {
    if (!this.canvas) return false;

    const wrapper = this.canvas.parentElement;
    const avail = (wrapper ? wrapper.clientWidth : 800) - 20;
    const w = Math.max(280, Math.min(840, avail || 800));
    const h = Math.round(w * 0.6);

    if (this.canvas.width === w && this.canvas.height === h) return false;
    this.canvas.width = w;
    this.canvas.height = h;
    return true;
  }

  /**
   * Move everything by the factor the board changed by.
   *
   * Coordinates are canvas pixels, so a resize that does not rescale slides
   * every player relative to the pitch — a diagram that still renders, still
   * saves, and no longer means what it did.
   */
  rescaleContents(before: { w: number; h: number }, after: { w: number; h: number }): void {
    if (!before.w || !before.h) return;

    const fx = after.w / before.w;
    const fy = after.h / before.h;
    if (fx === 1 && fy === 1) return;

    const movePoints = (drawings: Drawing[]) =>
      (drawings || []).forEach(d => (d.points || []).forEach(pt => { pt.x *= fx; pt.y *= fy; }));

    (this.elements || []).forEach(el => { el.x *= fx; el.y *= fy; });
    movePoints(this.drawings);
    (this.keyframes || []).forEach(kf => {
      (kf.elements || []).forEach((el: any) => { el.x *= fx; el.y *= fy; });
      movePoints(kf.drawings as Drawing[]);
    });
  }

  /** Re-fit and rescale together, which is the only correct order. */
  resize(): void {
    if (!this.canvas) return;
    const before = { w: this.canvas.width, h: this.canvas.height };
    if (!this.fitToWrapper()) return;

    this.rescaleContents(before, { w: this.canvas.width, h: this.canvas.height });
    this.commit();
    this.render();
  }

  render(): void {
    if (!this.ctx || !this.canvas) return;
    renderBoard(
      this.ctx, this.canvas.width, this.canvas.height, this.pitchType,
      this.drawings, this.elements,
      { drawing: this.selectedDrawing, element: this.selectedElement }
    );
  }

  exportImage(): string | null {
    return this.canvas?.toDataURL ? this.canvas.toDataURL('image/png') : null;
  }

  // ── tools and state ─────────────────────────────────────────────────────

  setTool(tool: Tool): void {
    this.activeTool = tool;
    this.changed();
  }

  setPitchType(type: PitchType): void {
    this.saveState();
    this.pitchType = type;
    this.render();
    this.changed();
  }

  private snapshot(): Snapshot {
    return { elements: clone(this.elements), drawings: clone(this.drawings), pitchType: this.pitchType };
  }

  saveState(): void {
    this.history.push(this.snapshot());
    // Capped: a long session would otherwise hold every state of a board full
    // of elements.
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.redoStack = [];
    this.commit();
  }

  undo(): boolean {
    if (this.history.length === 0) return false;

    this.redoStack.push(this.snapshot());
    const state = this.history.pop()!;
    this.elements = state.elements;
    this.drawings = state.drawings;
    this.pitchType = state.pitchType || 'full';
    this.selectedElement = null;
    this.selectedDrawing = null;

    this.commit();
    this.render();
    this.changed();
    return true;
  }

  clear(): void {
    this.saveState();
    this.elements = [];
    this.drawings = [];
    this.selectedElement = null;
    this.selectedDrawing = null;
    this.commit();
    this.render();
    this.changed();
  }

  /**
   * Delete what is selected, or the last thing added.
   *
   * The fallback is the legacy behaviour and worth keeping: a Delete key with
   * nothing selected means "undo that last piece", which is what a coach
   * placing a shape expects.
   */
  deleteSelected(): boolean {
    if (this.selectedElement) {
      const idx = this.elements.findIndex(el => el.id === this.selectedElement!.id);
      if (idx !== -1) return this.removeElementAt(idx);
    }
    if (this.selectedDrawing) {
      const idx = this.drawings.indexOf(this.selectedDrawing);
      if (idx !== -1) return this.removeDrawingAt(idx);
    }
    if (this.elements.length > 0) return this.removeElementAt(this.elements.length - 1);
    if (this.drawings.length > 0) return this.removeDrawingAt(this.drawings.length - 1);
    return false;
  }

  private removeElementAt(index: number): boolean {
    this.saveState();
    this.elements.splice(index, 1);
    this.elements = reindexNumbers(this.elements);
    this.selectedElement = null;
    this.commit();
    this.render();
    this.changed();
    return true;
  }

  private removeDrawingAt(index: number): boolean {
    this.saveState();
    this.drawings.splice(index, 1);
    this.selectedDrawing = null;
    this.commit();
    this.render();
    this.changed();
    return true;
  }

  // ── keyframes ───────────────────────────────────────────────────────────

  /** Write the board into the frame it belongs to, and propagate forward. */
  private commit(): void {
    this.keyframes = commitFrame(
      this.keyframes, this.currentFrameIndex, this.elements, this.drawings);
  }

  addKeyframe(): void {
    this.commit();
    this.stopAnimation();

    this.keyframes = appendKeyframe(this.keyframes, this.currentFrameIndex);
    this.currentFrameIndex = this.keyframes.length - 1;
    this.showFrame(this.currentFrameIndex);
  }

  goToKeyframe(index: number): void {
    if (index < 0 || index >= this.keyframes.length) return;
    this.commit();
    this.stopAnimation();

    this.currentFrameIndex = index;
    this.showFrame(index);
  }

  private showFrame(index: number): void {
    const frame = this.keyframes[index];
    this.elements = clone(frame?.elements || []);
    this.drawings = clone(frame?.drawings || []) as Drawing[];
    this.selectedElement = null;
    this.selectedDrawing = null;
    this.render();
    this.changed();
  }

  /** Returns a reason when it will not, rather than raising an alert. */
  deleteCurrentKeyframe(): { ok: boolean; error?: string } {
    const next = removeKeyframe(this.keyframes, this.currentFrameIndex);
    if (!next) {
      return { ok: false, error: 'The start position cannot be deleted — every diagram needs one.' };
    }

    this.keyframes = next;
    this.currentFrameIndex = Math.min(this.currentFrameIndex, this.keyframes.length - 1);
    this.showFrame(this.currentFrameIndex);
    return { ok: true };
  }

  // ── animation ───────────────────────────────────────────────────────────

  togglePlay(): { ok: boolean; error?: string } {
    if (this.isPlaying) { this.stopAnimation(); return { ok: true }; }

    // At the end already: rewind, or pressing play does nothing visible.
    if (this.currentFrameIndex >= this.keyframes.length - 1) this.goToKeyframe(0);
    return this.play();
  }

  play(): { ok: boolean; error?: string } {
    if (this.keyframes.length < 2) {
      return {
        ok: false,
        error: 'Add a second time frame to animate the movement — one frame is a position, not a move.'
      };
    }

    this.commit();
    this.isPlaying = true;
    this.changed();

    const steps = this.keyframes.length - 1;
    const total = steps * STEP_MS;
    let startTime: number | null = null;

    const tick = (timestamp: number) => {
      if (!this.isPlaying) return;
      if (startTime === null) startTime = timestamp;

      const elapsed = timestamp - startTime;

      if (elapsed >= total) {
        // Stop on the final frame rather than snapping back to the start.
        this.currentFrameIndex = steps;
        const last = this.keyframes[steps];
        this.elements = clone(last.elements || []);
        this.drawings = clone(last.drawings || []) as Drawing[];
        this.isPlaying = false;
        this.cancelFrame();
        this.render();
        this.changed();
        return;
      }

      const step = Math.min(Math.floor(elapsed / STEP_MS), steps - 1);
      const progress = (elapsed % STEP_MS) / STEP_MS;
      const a = this.keyframes[step];
      const b = this.keyframes[step + 1];

      this.elements = interpolateFrames(a.elements, b.elements, progress);
      // Lines snap at the half way point: interpolating a freehand path
      // between two unrelated shapes produces a scribble.
      this.drawings = (progress < 0.5 ? a.drawings : b.drawings) as Drawing[];
      this.currentFrameIndex = step;

      this.render();
      this.changed();
      this.animId = requestAnimationFrame(tick);
    };

    this.animId = requestAnimationFrame(tick);
    return { ok: true };
  }

  stopAnimation(): void {
    const was = this.isPlaying;
    this.isPlaying = false;
    this.cancelFrame();

    // Settle on the frame it stopped at, rather than mid-interpolation.
    if (was && this.keyframes[this.currentFrameIndex]) {
      const frame = this.keyframes[this.currentFrameIndex];
      this.elements = clone(frame.elements || []);
      this.drawings = clone(frame.drawings || []) as Drawing[];
    }
    this.render();
    this.changed();
  }

  private cancelFrame(): void {
    if (this.animId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.animId);
    }
    this.animId = null;
  }

  // ── serialization ───────────────────────────────────────────────────────

  toDiagramData(): DiagramState {
    this.commit();
    return exportDiagram({
      keyframes: this.keyframes,
      currentFrameIndex: this.currentFrameIndex,
      elements: this.elements,
      drawings: this.drawings,
      pitchType: this.pitchType
    });
  }

  fromDiagramData(data: any): void {
    const state = loadDiagram(data);
    this.keyframes = state.keyframes;
    this.currentFrameIndex = state.currentFrameIndex;
    this.elements = state.elements;
    this.drawings = state.drawings as Drawing[];
    this.pitchType = state.pitchType;
    this.selectedElement = null;
    this.selectedDrawing = null;
    this.history = [];
    this.redoStack = [];
    this.render();
    this.changed();
  }

  // ── placing and picking ─────────────────────────────────────────────────

  /** A piece of the given type, numbered per side. */
  placePiece(tool: Tool, pos: Point): BoardElement {
    this.saveState();

    let number = '';
    if (tool === 'attacker' || tool === 'defender') {
      number = String(this.elements.filter(el => el.type === tool).length + 1);
    }

    const el: BoardElement = {
      id: Date.now() + Math.random(),
      type: tool,
      x: pos.x,
      y: pos.y,
      color: PIECE_COLORS[tool] || '#FF8C00',
      number
    };

    this.elements.push(el);
    this.selectedElement = el;
    this.selectedDrawing = null;
    this.elements = reindexNumbers(this.elements);
    this.commit();
    this.render();
    this.changed();
    return el;
  }

  /** The text tool's second half: the owner supplies the words. */
  placeText(pos: Point, text: string): BoardElement | null {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return null;

    this.saveState();
    const el: BoardElement = {
      id: Date.now() + Math.random(),
      type: 'text',
      text: trimmed,
      x: pos.x,
      y: pos.y,
      color: '#FFD700'
    };

    this.elements.push(el);
    this.selectedElement = el;
    this.selectedDrawing = null;
    this.commit();
    this.render();
    this.changed();
    return el;
  }

  /** A text label is a box; everything else is a disc. */
  private elementIndexAt(pos: Point): number {
    return this.elements.findIndex(el => (
      el.type === 'text'
        ? Math.abs(el.x - pos.x) < 40 && Math.abs(el.y - pos.y) < 15
        : Math.hypot(el.x - pos.x, el.y - pos.y) < 22
    ));
  }

  // ── pointer handling ────────────────────────────────────────────────────

  private onStart(e: any): void {
    if (!this.canvas) return;
    const pos = canvasPos(e, this.canvas);

    if (PIECE_TOOLS.includes(this.activeTool)) {
      this.placePiece(this.activeTool, pos);
      return;
    }

    if (this.activeTool === 'text') {
      this.options.onTextRequest?.(pos);
      return;
    }

    if (this.activeTool === 'select' || this.activeTool === 'eraser') {
      this.onPick(pos);
      return;
    }

    if (LINE_TOOLS.includes(this.activeTool)) {
      this.saveState();
      this.isDrawing = true;
      this.currentPath = {
        tool: this.activeTool,
        color: LINE_COLORS[this.activeTool] || '#FFFFFF',
        width: this.activeTool === 'line_shot' ? 4 : 3,
        points: [pos]
      };
      this.drawings.push(this.currentPath);
      this.selectedDrawing = this.currentPath;
      this.selectedElement = null;
    }
  }

  private onPick(pos: Point): void {
    const elIdx = this.elementIndexAt(pos);

    if (elIdx !== -1) {
      if (this.activeTool === 'eraser') { this.removeElementAt(elIdx); return; }

      this.saveState();
      this.draggedElement = this.elements[elIdx];
      this.selectedElement = this.elements[elIdx];
      this.selectedDrawing = null;
      this.dragOffset = { x: pos.x - this.draggedElement.x, y: pos.y - this.draggedElement.y };
      this.render();
      this.changed();
      return;
    }

    const drawIdx = this.drawings.findIndex(d => isPointNearDrawing(pos, d, 18));
    if (drawIdx !== -1) {
      if (this.activeTool === 'eraser') { this.removeDrawingAt(drawIdx); return; }

      this.saveState();
      this.draggedDrawing = this.drawings[drawIdx];
      this.selectedDrawing = this.drawings[drawIdx];
      this.selectedElement = null;
      this.lastDragPos = pos;
      this.render();
      this.changed();
      return;
    }

    this.selectedElement = null;
    this.selectedDrawing = null;
    this.render();
    this.changed();
  }

  private onMove(e: any): void {
    if (!this.canvas) return;
    const pos = canvasPos(e, this.canvas);

    if (this.draggedElement) {
      this.draggedElement.x = pos.x - this.dragOffset.x;
      this.draggedElement.y = pos.y - this.dragOffset.y;
      this.render();
    } else if (this.draggedDrawing && this.lastDragPos) {
      const dx = pos.x - this.lastDragPos.x;
      const dy = pos.y - this.lastDragPos.y;
      this.draggedDrawing.points.forEach(pt => { pt.x += dx; pt.y += dy; });
      this.lastDragPos = pos;
      this.render();
    } else if (this.isDrawing && this.currentPath) {
      this.currentPath.points.push(pos);
      this.render();
    }
  }

  private onEnd(): void {
    // A drag or a stroke that has just finished is part of the frame now.
    const wasEditing = this.isDrawing || !!this.draggedElement || !!this.draggedDrawing;

    this.isDrawing = false;
    this.currentPath = null;
    this.draggedElement = null;
    this.draggedDrawing = null;
    this.lastDragPos = null;

    if (wasEditing) { this.commit(); this.changed(); }
  }

  private bindEvents(): void {
    const canvas = this.canvas;
    if (!canvas) return;

    const start = (e: any) => this.onStart(e);
    const move = (e: any) => this.onMove(e);
    const end = () => this.onEnd();
    const touchStart = (e: any) => { e.preventDefault(); this.onStart(e); };
    const touchMove = (e: any) => { e.preventDefault(); this.onMove(e); };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', touchStart, { passive: false });
    canvas.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);

    // Debounced: iOS fires resize repeatedly through an orientation change,
    // and each one is a full re-render.
    let pending: any = null;
    const onResize = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => { pending = null; this.resize(); }, 150);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    const onKeydown = (e: KeyboardEvent) => {
      // Never steal Delete from a field somebody is typing in.
      const tag = document.activeElement?.tagName?.toLowerCase() || '';
      if (['input', 'textarea', 'select'].includes(tag)) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!this.selectedElement && !this.selectedDrawing) return;

      e.preventDefault();
      this.deleteSelected();
    };
    window.addEventListener('keydown', onKeydown);

    this.detachers = [
      () => canvas.removeEventListener('mousedown', start),
      () => canvas.removeEventListener('mousemove', move),
      () => window.removeEventListener('mouseup', end),
      () => canvas.removeEventListener('touchstart', touchStart),
      () => canvas.removeEventListener('touchmove', touchMove),
      () => window.removeEventListener('touchend', end),
      () => window.removeEventListener('touchcancel', end),
      () => window.removeEventListener('resize', onResize),
      () => window.removeEventListener('orientationchange', onResize),
      () => window.removeEventListener('keydown', onKeydown),
      () => { if (pending) clearTimeout(pending); }
    ];
  }
}
