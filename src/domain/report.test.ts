/**
 * The standard a timed exercise is measured against on the squad report.
 *
 * Two decisions here, and both change what a coach is told:
 *
 * **The tightest band is the target.** Bands read "at or under X earns Y", so
 * the fastest one is the standard; taking the slowest would mark a squad as
 * meeting a standard it has not met.
 *
 * **No bands means the exercise is not counted**, not that everyone failed
 * it. Null says "there is no standard here"; a number would put a whole squad
 * below one that was never set.
 *
 * Ported from the agreement tests that loaded the legacy view.
 */
import { describe, it, expect } from 'vitest';
import { reportStandardSeconds } from './report';

const bands = {
  d1: [
    { max_seconds: 300, points: 1 },
    { max_seconds: 270, points: 2 },
    { max_seconds: 240, points: 3 }
  ],
  d2: [{ max_seconds: 55, points: 3 }],
  d3: []
};

describe('the standard for a timed exercise', () => {
  it('IS THE TIGHTEST BAND, not the loosest', () => {
    expect(reportStandardSeconds(bands, 'd1')).toBe(240);
  });

  it('is that band when there is only one', () => {
    expect(reportStandardSeconds(bands, 'd2')).toBe(55);
  });

  it('does not depend on the order the bands arrive in', () => {
    const shuffled = { d1: [{ max_seconds: 240 }, { max_seconds: 300 }, { max_seconds: 270 }] };
    expect(reportStandardSeconds(shuffled, 'd1')).toBe(240);
  });

  it('reads the seconds as a number when they arrive as text', () => {
    expect(reportStandardSeconds({ d1: [{ max_seconds: '270' }, { max_seconds: '240' }] }, 'd1'))
      .toBe(240);
  });
});

describe('AN EXERCISE WITH NO STANDARD IS NOT COUNTED', () => {
  it('returns null for an empty band list rather than a number', () => {
    // A number here would report the whole squad as below a standard nobody
    // ever set.
    expect(reportStandardSeconds(bands, 'd3')).toBeNull();
  });

  it('returns null for a drill the bands say nothing about', () => {
    expect(reportStandardSeconds(bands, 'never-heard-of-it')).toBeNull();
  });

  it('returns null rather than throwing when there are no bands at all', () => {
    expect(reportStandardSeconds(null as any, 'd1')).toBeNull();
    expect(reportStandardSeconds({}, 'd1')).toBeNull();
  });
});
