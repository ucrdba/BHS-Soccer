/**
 * Reading a leaderboard row against a standard.
 *
 * A fitness drill — the three-lap run, Cooper's, the beep test — asks whether a
 * player can last a full match. It is scored against absolute per-squad
 * thresholds, not against team-mates, so most of a fit squad landing on full
 * marks is the GOOD outcome rather than a flat result needing correction.
 *
 * What is worth seeing is therefore who fell SHORT. Two players earning 0.5 and
 * 0.25 under a 4:30 / 4:40 / 4:50 set are the signal; the seventeen on 1.0 need
 * no attention.
 */
import { describe, it, expect } from 'vitest';
import { isThresholdMeasure, bandStanding, belowStandard } from './matrix-threshold';

// The id includes attempts: without it, a missed attempt and a non-attempt
// both read as "p0-1" and the assertions below cannot tell them apart.
const row = (earned: number, available: number, attempts = 1) =>
  ({ earned, available, attempts, playerId: `p${earned}-${available}-${attempts}` });

describe('isThresholdMeasure', () => {
  it('is true for a time measured against bands', () => {
    expect(isThresholdMeasure('time_bands')).toBe(true);
  });

  it('is FALSE for a fastest-time exercise', () => {
    // time_low ranks players against each other — it is competitive, and
    // spread across the squad is meaningful there.
    expect(isThresholdMeasure('time_low')).toBe(false);
  });

  it('is false for the competitive measures', () => {
    for (const m of ['head_to_head', 'win_loss', 'count_high']) {
      expect(isThresholdMeasure(m), m).toBe(false);
    }
  });

  it('is false for nothing at all', () => {
    expect(isThresholdMeasure('')).toBe(false);
    expect(isThresholdMeasure(undefined as any)).toBe(false);
  });
});

describe('bandStanding', () => {
  it('reads full marks as having met the standard', () => {
    expect(bandStanding(row(1, 1))).toBe('met');
    expect(bandStanding(row(3, 3))).toBe('met');
  });

  it('reads partial marks as below the standard', () => {
    // Met a looser band. This is what the screen exists to surface.
    expect(bandStanding(row(0.5, 1))).toBe('below');
    expect(bandStanding(row(0.25, 1))).toBe('below');
  });

  it('reads an attempt that scored nothing as having missed', () => {
    expect(bandStanding(row(0, 1, 1))).toBe('missed');
  });

  it('reads no attempt as none, not as failure', () => {
    // An absence is not a slow time, and must not be counted against a player
    // as though they had run and failed.
    expect(bandStanding(row(0, 1, 0))).toBe('none');
  });

  it('does not divide by an absent denominator', () => {
    expect(() => bandStanding(row(0, 0, 0))).not.toThrow();
    expect(bandStanding(row(0, 0, 0))).toBe('none');
  });
});

describe('belowStandard', () => {
  const squad = [
    row(1, 1), row(1, 1), row(1, 1),      // met
    row(0.5, 1), row(0.25, 1),            // below
    row(0, 1, 1),                         // missed
    row(0, 1, 0)                          // never attempted
  ];

  it('counts those who fell short, and those alone', () => {
    // Below AND missed: both fell short of the standard.
    expect(belowStandard(squad)).toHaveLength(3);
  });

  it('does not count a player who never attempted', () => {
    const ids = belowStandard(squad).map(r => r.playerId);
    expect(ids).not.toContain(row(0, 1, 0).playerId);
  });

  it('is empty when the whole squad met the standard', () => {
    // The good outcome, and the summary should be able to say so.
    expect(belowStandard([row(1, 1), row(1, 1)])).toEqual([]);
  });

  it('copes with no rows at all', () => {
    expect(belowStandard([])).toEqual([]);
    expect(belowStandard(null as any)).toEqual([]);
  });
});
