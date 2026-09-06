/**
 * A stored diagram, as a picture.
 *
 * `plan-print.ts` takes rasterized steps and leaves the rendering to its
 * caller; this is that caller. It draws onto an offscreen canvas using the
 * same routines the live board uses, so a printed diagram is the diagram.
 *
 * **The native size is 800×480 and it is not decoration.** That is the
 * interactive board's own aspect, and element coordinates are canvas pixels —
 * rendering at another shape moves every player relative to the pitch, which
 * is the same silent corruption a resize without a rescale produces.
 *
 * Everything here returns null rather than throwing when there is no canvas:
 * under jsdom, and in any browser that refuses one, the print path drops the
 * diagrams and still prints the plan.
 *
 * Ported from public/js/views/planner.view.js during Phase 4b.
 */
import { renderBoard, type PitchType } from './draw';

/** The interactive board's own dimensions. */
const NATIVE_WIDTH = 800;
const NATIVE_HEIGHT = 480;

export interface RasterStep {
  dataUrl: string;
  label: string;
}

interface Parsed {
  keyframes: any[];
  elements: any[];
  drawings: any[];
  pitchType: PitchType;
}

function parse(data: any): Parsed | null {
  if (!data) return null;

  let value = data;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object') return null;

  return {
    keyframes: Array.isArray(value.keyframes) ? value.keyframes : [],
    elements: value.elements || [],
    drawings: value.drawings || [],
    pitchType: value.pitchType || 'full'
  };
}

/**
 * One step of a diagram.
 *
 * A step index past the end falls back to the top-level `elements` and
 * `drawings`, which every blob carries — that is what the redundancy in the
 * format is for.
 */
export function renderStep(data: any, stepIndex = 0, width = NATIVE_WIDTH): RasterStep | null {
  const parsed = parse(data);
  if (!parsed) return null;

  let elements = parsed.elements;
  let drawings = parsed.drawings;
  let label = 'Tactical diagram';

  const frame = parsed.keyframes[stepIndex];
  if (frame) {
    elements = Array.isArray(frame.elements) ? frame.elements : parsed.elements;
    drawings = Array.isArray(frame.drawings) ? frame.drawings : parsed.drawings;
    label = frame.label || `Step ${stepIndex + 1}`;
  }

  const canvas = document.createElement('canvas');
  canvas.width = NATIVE_WIDTH;
  canvas.height = NATIVE_HEIGHT;

  const ctx = canvas.getContext ? canvas.getContext('2d') : null;
  // No 2D context: the caller prints the plan without its diagrams rather
  // than not printing at all.
  if (!ctx) return null;

  renderBoard(ctx, NATIVE_WIDTH, NATIVE_HEIGHT, parsed.pitchType, drawings, elements);

  if (!canvas.toDataURL) return null;
  const dataUrl = canvas.toDataURL('image/png');
  return { dataUrl, label };
}

/**
 * Every step of a diagram, in order.
 *
 * A diagram with no keyframes renders once: it is a position rather than a
 * move, and printing it twice would say otherwise.
 */
export function renderAllSteps(data: any, width = NATIVE_WIDTH): RasterStep[] {
  const parsed = parse(data);
  if (!parsed) return [];

  const count = parsed.keyframes.length || 1;
  const steps: RasterStep[] = [];

  for (let i = 0; i < count; i++) {
    const step = renderStep(data, i, width);
    if (step) steps.push(step);
  }
  return steps;
}

/**
 * Every drill's diagram, keyed by name, in the shape `plan-print` takes.
 *
 * Prefers the stored thumbnail when there is one: it is what the coach saw
 * when they saved, and it costs nothing to render.
 */
export function diagramsForPlan(items: any[]): Record<string, RasterStep[]> {
  const out: Record<string, RasterStep[]> = {};

  (items || []).forEach(drill => {
    if (!drill?.name) return;

    const steps = renderAllSteps(drill.diagramData);
    if (steps.length) { out[drill.name] = steps; return; }

    if (drill.diagramImage) {
      out[drill.name] = [{ dataUrl: drill.diagramImage, label: 'Tactical diagram' }];
    }
  });

  return out;
}
