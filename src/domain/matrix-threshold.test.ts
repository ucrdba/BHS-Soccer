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
const row = (earned: number, available: number, attempts = 1, metRuns?: number) =>
  ({
    earned, available, attempts,
    // Runs that cleared the bar outright. Defaults to the whole-marks reading
    // so the older cases below still describe what they meant.
    metRuns: metRuns === undefined ? (earned >= available && attempts > 0 ? 1 : 0) : metRuns,
    playerId: `p${earned}-${available}-${attempts}-${metRuns}`
  });

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

  /*
   * An absence must not turn a player who cleared the bar into one who did
   * not — the reported bug.
   *
   * A real case: three 3-430 sessions, two run at 3:44 and 4:07 and both
   * inside the standard, one missed. The leaderboard row aggregates earned
   * and available over EVERY session (exerciseLeaderboard in domain/matrix.ts
   * says so: an absence "counts against the points, but it is not an
   * attempt"), so it arrives here as earned 2 of available 3 with 2 attempts
   * — and 2 >= 3 is false, so a player who met the standard every time he ran
   * was reported below it.
   *
   * Counting an absence against the POINTS is right: that is the scoring rule
   * and it drives the ranking. Counting it against the STANDARD is not. The
   * standard asks a different question — when this player ran, did they clear
   * the bar? — and this function already says so for a player who missed
   * everything. The same reasoning holds for one who missed some.
   */
  it('reads a player who cleared the bar on every run as having met it', () => {
    // Two runs inside the standard, one session missed: earned 2 of an
    // available 3, but both RUNS cleared it.
    expect(bandStanding(row(2, 3, 2, 2))).toBe('met');
  });

  it('still reads a genuine shortfall as below, absences or not', () => {
    // Ran three on looser bands and missed a fourth. Never cleared the bar.
    expect(bandStanding(row(1.5, 4, 3, 0))).toBe('below');
  });

  it('falls back to the totals when the run counts are absent', () => {
    // Any row built before the counts existed, read the way it used to be.
    const bare = (earned: number, available: number, attempts = 1) =>
      ({ earned, available, attempts, playerId: 'bare' });
    expect(bandStanding(bare(1, 1))).toBe('met');
    expect(bandStanding(bare(0.5, 1))).toBe('below');
    expect(bandStanding(bare(0, 1, 0))).toBe('none');
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


/**
 * The standard is judged on the fastest run, not the average of them.
 *
 * A player who ran 4:29 and 4:40 against a 4:30 bar has proved he can clear
 * it; the 4:40 says he does not always, which is worth showing but is not the
 * same as failing. Averaging the two put him below a standard he had met, and
 * a coach reading the board to pick a squad wants both facts, not a blend.
 */
describe('bandStanding on the fastest run', () => {
  it('reads one clear run as having met the standard', () => {
    // 4:29 met it, 4:40 took a looser band: earned 1.5 of 2 across two runs.
    expect(bandStanding(row(1.5, 2, 2, 1))).toBe('met');
  });

  it('reads no clear run but some credit as below', () => {
    // Two runs, both on looser bands. Never actually cleared the bar.
    expect(bandStanding(row(1, 2, 2, 0))).toBe('below');
  });

  it('reads attempts that earned nothing as missed', () => {
    expect(bandStanding(row(0, 2, 2, 0))).toBe('missed');
  });

  it('still reads no attempt at all as none', () => {
    expect(bandStanding(row(0, 2, 0, 0))).toBe('none');
  });

  it('counts a player below only while no run has cleared the bar', () => {
    const cleared = row(1.5, 2, 2, 1);
    const never = row(1, 2, 2, 0);
    expect(belowStandard([cleared, never])).toEqual([never]);
  });
});
