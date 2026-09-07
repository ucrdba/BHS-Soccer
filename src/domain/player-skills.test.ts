/**
 * The four skill ratings as bars.
 *
 * Ratings are stored per membership as a loose object; the bio shows the four
 * the program rates, in a fixed order, and only those actually set. A missing
 * rating is not a zero — a bar at nothing would read as a judgement.
 */
import { describe, it, expect } from 'vitest';
import { skillBars, SKILLS } from './player-skills';

describe('skillBars', () => {
  it('returns the four skills in order with a percentage of a hundred', () => {
    expect(skillBars({ technical: 80, tactical: 70, physical: 90, mental: 70 })).toEqual([
      { key: 'technical', name: 'Technical', value: 80, pct: 80 },
      { key: 'tactical', name: 'Tactical', value: 70, pct: 70 },
      { key: 'physical', name: 'Physical', value: 90, pct: 90 },
      { key: 'mental', name: 'Mental', value: 70, pct: 70 }
    ]);
  });

  it('leaves out a rating that is not set, and ignores keys it does not know', () => {
    expect(skillBars({ technical: 60, speed: 90 })).toEqual([
      { key: 'technical', name: 'Technical', value: 60, pct: 60 }
    ]);
  });

  it('reads a number typed as text and clamps to the scale', () => {
    expect(skillBars({ mental: '70' })[0].value).toBe(70);
    expect(skillBars({ mental: 140 })[0]).toEqual({ key: 'mental', name: 'Mental', value: 100, pct: 100 });
    expect(skillBars({ mental: -20 })[0].value).toBe(0);
  });

  it('matches a real seed rating', () => {
    expect(skillBars({ technical: 92 })[0]).toEqual({ key: 'technical', name: 'Technical', value: 92, pct: 92 });
  });

  it('is empty for nothing', () => {
    expect(skillBars(null)).toEqual([]);
    expect(skillBars({})).toEqual([]);
    expect(skillBars({ technical: 'lots' })).toEqual([]);
  });

  it('names the four the program rates', () => {
    expect(SKILLS).toEqual(['technical', 'tactical', 'physical', 'mental']);
  });
});
