/**
 * The squad report's small progress graph, one per player per timed exercise.
 *
 * **Better is drawn higher**, whichever way the measure runs: a sprint time
 * that falls climbs, so a rising line reads as improving on every row.
 *
 * **Every row in an exercise shares one range** (`sparkRange`), so the graphs
 * can be compared down the table and a standard sits at the same height in
 * each. The cost is that a small gain can look flat; that was chosen over
 * stretching each graph to its own readings, which makes a one-second gain and
 * a thirty-second one look the same.
 *
 * Readings are spaced evenly by session, not by date. The series is
 * `progressSeries`'s, so a missed session is left out rather than drawn as a
 * collapse, exactly as in the Progress window.
 *
 * The screen and the printed report both draw from `sparkline`, so the two
 * cannot place a point differently.
 */
import { progressTrend } from './progress';
import { escapeHtml } from './plan-print';

export interface SparkRange { min: number; max: number }
export interface SparkPoint { x: number; y: number }

export interface Sparkline {
  width: number;
  height: number;
  points: SparkPoint[];
  /** A polyline's points; empty for a single reading, which is a dot only. */
  line: string;
  /** The latest reading, marked with a dot. */
  last: SparkPoint;
  /** Where the standard lies across the graph, or null when there is none. */
  standardY: number | null;
}

export interface SparkOptions {
  lowerIsBetter: boolean;
  standard?: number | null;
  width?: number;
  height?: number;
}

const WIDTH = 80;
const HEIGHT = 20;
const PAD = 2;

/**
 * The range every graph in one exercise is drawn against: all the squad's
 * readings, and the standard, so its line never falls outside the box. Null
 * when nobody has a reading -- there is nothing to draw a standard against.
 */
export function sparkRange(seriesPerPlayer: number[][], standard: number | null): SparkRange | null {
  const values = (seriesPerPlayer || []).flat().filter(v => Number.isFinite(v));
  if (values.length === 0) return null;
  if (standard !== null && standard !== undefined && Number.isFinite(standard)) values.push(standard);
  return { min: Math.min(...values), max: Math.max(...values) };
}

export function sparkline(
  series: number[], range: SparkRange | null, options: SparkOptions
): Sparkline | null {
  const values = (series || []).filter(v => Number.isFinite(v));
  if (values.length === 0 || !range) return null;

  const width = options.width ?? WIDTH;
  const height = options.height ?? HEIGHT;
  const span = range.max - range.min;

  const y = (v: number): number => {
    // One value across the whole squad: nothing to rise or fall against.
    if (span === 0) return height / 2;
    const t = (v - range.min) / span;
    const better = options.lowerIsBetter ? 1 - t : t;
    return height - PAD - better * (height - 2 * PAD);
  };

  const n = values.length;
  const x = (i: number): number =>
    n === 1 ? width - PAD : PAD + (i * (width - 2 * PAD)) / (n - 1);

  const points = values.map((v, i) => ({ x: x(i), y: y(v) }));
  const standard = options.standard;

  return {
    width,
    height,
    points,
    line: n > 1 ? points.map(p => `${p.x},${p.y}`).join(' ') : '',
    last: points[n - 1],
    standardY: standard !== null && standard !== undefined && Number.isFinite(standard) ? y(standard) : null
  };
}

/** The graph in words: for the hover, a screen reader, and the printed page. */
export function sparkLabel(
  series: number[], lowerIsBetter: boolean, format: (v: number) => string
): string {
  const values = (series || []).filter(v => Number.isFinite(v));
  if (values.length === 0) return 'No readings yet';
  if (values.length === 1) return `One reading: ${format(values[0])}`;

  const trend = progressTrend(values.map(value => ({ on: '', value })), lowerIsBetter)!;
  const word = trend.direction === 'better' ? 'Improving'
    : trend.direction === 'worse' ? 'Slipping' : 'Level';
  return `${word} — ${format(trend.first)} to ${format(trend.last)} across ${values.length} readings`;
}

/**
 * The graph as markup, for the printed report. Print colours are fixed, as
 * the rest of the printed page's are: a print window has no ground tokens.
 */
export function sparklineSvg(s: Sparkline, label: string): string {
  const std = s.standardY === null ? ''
    : `<line x1="0" y1="${s.standardY}" x2="${s.width}" y2="${s.standardY}" stroke="#b8b5b5" stroke-width="0.8" stroke-dasharray="2 2" />`;
  const line = s.line
    ? `<polyline points="${s.line}" fill="none" stroke="#201f1d" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" />`
    : '';
  const dot = `<circle cx="${s.last.x}" cy="${s.last.y}" r="1.8" fill="#201f1d" />`;
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(label)}" `
    + `width="${s.width}" height="${s.height}" viewBox="0 0 ${s.width} ${s.height}">`
    + `<title>${escapeHtml(label)}</title>${std}${line}${dot}</svg>`;
}
