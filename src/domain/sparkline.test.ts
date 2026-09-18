/**
 * The squad report's small progress graph.
 *
 * Three promises matter. Better is drawn higher whichever way the measure
 * runs, so a climbing line reads as improving on a sprint and a Cooper's
 * alike. Every row in an exercise shares one range, so the graphs can be read
 * down the table and the standard sits at the same height in each. And a
 * player with one reading gets a dot, not a line -- one result is not a trend.
 */
import { describe, it, expect } from 'vitest';
import { sparkRange, sparkline, sparkLabel, sparklineSvg } from './sparkline';

const W = 80;
const H = 20;
const PAD = 2;

describe('the shared range', () => {
  it('spans every reading in the exercise', () => {
    expect(sparkRange([[250, 260], [290], []], null)).toEqual({ min: 250, max: 290 });
  });

  it('takes in the standard, so its line is always inside the box', () => {
    expect(sparkRange([[250, 260]], 300)).toEqual({ min: 250, max: 300 });
    expect(sparkRange([[250, 260]], 200)).toEqual({ min: 200, max: 260 });
  });

  it('is null when nobody has a reading', () => {
    expect(sparkRange([[], []], null)).toBeNull();
    expect(sparkRange([[], []], 270)).toBeNull();
  });
});

describe('the drawing', () => {
  const range = { min: 240, max: 300 };

  it('draws a FASTER time higher', () => {
    const s = sparkline([300, 240], range, { lowerIsBetter: true })!;
    expect(s.points[1].y).toBeLessThan(s.points[0].y);
    expect(s.points[0].y).toBe(H - PAD);
    expect(s.points[1].y).toBe(PAD);
  });

  it('draws a HIGHER count higher', () => {
    const s = sparkline([240, 300], range, { lowerIsBetter: false })!;
    expect(s.points[1].y).toBeLessThan(s.points[0].y);
  });

  it('puts the same value at the same height in every row', () => {
    const a = sparkline([270, 250], range, { lowerIsBetter: true })!;
    const b = sparkline([290, 270, 260], range, { lowerIsBetter: true })!;
    expect(a.points[0].y).toBe(b.points[1].y);
  });

  it('spreads the readings evenly, oldest at the left, latest at the right', () => {
    const s = sparkline([250, 260, 270], range, { lowerIsBetter: true })!;
    expect(s.points.map(p => p.x)).toEqual([PAD, W / 2, W - PAD]);
    expect(s.last).toEqual(s.points[2]);
  });

  it('draws one reading as a dot with no line', () => {
    const s = sparkline([260], range, { lowerIsBetter: true })!;
    expect(s.points).toHaveLength(1);
    expect(s.line).toBe('');
    expect(s.last.x).toBe(W - PAD);
  });

  it('draws nothing for a player with no readings', () => {
    expect(sparkline([], range, { lowerIsBetter: true })).toBeNull();
    expect(sparkline([260], null, { lowerIsBetter: true })).toBeNull();
  });

  it('lays the standard across at the height of that value', () => {
    const s = sparkline([300, 240], range, { lowerIsBetter: true, standard: 270 })!;
    expect(s.standardY).toBe(H / 2);
    expect(sparkline([300], range, { lowerIsBetter: true })!.standardY).toBeNull();
  });

  it('draws a squad with one value across the whole range at mid-height', () => {
    const s = sparkline([260, 260], { min: 260, max: 260 }, { lowerIsBetter: true })!;
    expect(s.points.every(p => p.y === H / 2)).toBe(true);
  });
});

describe('the words behind it', () => {
  const time = (v: number) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;

  it('says a faster time is improving, first to last', () => {
    expect(sparkLabel([340, 330, 312], true, time)).toBe('Improving — 5:40 to 5:12 across 3 readings');
  });

  it('says a slower one is slipping', () => {
    expect(sparkLabel([300, 320], true, time)).toBe('Slipping — 5:00 to 5:20 across 2 readings');
  });

  it('says level when first and last agree', () => {
    expect(sparkLabel([300, 290, 300], true, time)).toBe('Level — 5:00 to 5:00 across 3 readings');
  });

  it('puts no verdict on a single reading', () => {
    expect(sparkLabel([300], true, time)).toBe('One reading: 5:00');
  });

  it('says so when there are none', () => {
    expect(sparkLabel([], true, time)).toBe('No readings yet');
  });
});

describe('the printed graph', () => {
  const range = { min: 240, max: 300 };

  it('is an svg carrying its words for a reader', () => {
    const svg = sparklineSvg(sparkline([300, 250], range, { lowerIsBetter: true })!, 'Improving — 5:00 to 4:10');
    expect(svg).toMatch(/^<svg[^>]*role="img"[^>]*aria-label="Improving — 5:00 to 4:10"/);
    expect(svg).toContain('<polyline');
    expect(svg).toContain('<circle');
  });

  it('escapes the words', () => {
    const svg = sparklineSvg(sparkline([300], range, { lowerIsBetter: true })!, '<b>"x"</b>');
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&lt;b&gt;');
  });

  it('draws the standard only when there is one', () => {
    const withStd = sparklineSvg(sparkline([300, 250], range, { lowerIsBetter: true, standard: 270 })!, '');
    const without = sparklineSvg(sparkline([300, 250], range, { lowerIsBetter: true })!, '');
    expect(withStd).toContain('stroke-dasharray');
    expect(without).not.toContain('stroke-dasharray');
  });

  it('prints a single reading as a dot with no line', () => {
    const svg = sparklineSvg(sparkline([300], range, { lowerIsBetter: true })!, '');
    expect(svg).not.toContain('<polyline');
    expect(svg).toContain('<circle');
  });
});
