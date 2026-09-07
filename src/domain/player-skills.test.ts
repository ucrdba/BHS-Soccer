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
  it('returns the four skills in order with a percentage of ten', () => {
    expect(skillBars({ technical: 8, tactical: 7, physical: 9, mental: 7 })).toEqual([
      { key: 'technical', name: 'Technical', value: 8, pct: 80 },
      { key: 'tactical', name: 'Tactical', value: 7, pct: 70 },
      { key: 'physical', name: 'Physical', value: 9, pct: 90 },
      { key: 'mental', name: 'Mental', value: 7, pct: 70 }
    ]);
  });

  it('leaves out a rating that is not set, and ignores keys it does not know', () => {
    expect(skillBars({ technical: 6, speed: 9 })).toEqual([
      { key: 'technical', name: 'Technical', value: 6, pct: 60 }
    ]);
  });

  it('reads a number typed as text and clamps to the scale', () => {
    expect(skillBars({ mental: '7' })[0].value).toBe(7);
    expect(skillBars({ mental: 14 })[0]).toEqual({ key: 'mental', name: 'Mental', value: 10, pct: 100 });
    expect(skillBars({ mental: -2 })[0].value).toBe(0);
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
