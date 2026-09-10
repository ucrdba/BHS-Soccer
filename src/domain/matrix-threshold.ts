/**
 * Reading a leaderboard row against a fitness standard.
 *
 * Four of the five measures are competitive: beating team-mates is the point,
 * and spread across the squad is meaningful. `time_bands` is not. It is a
 * standard — the three-lap run, Cooper's, the beep test — asking whether a
 * player can last a full match, scored against absolute per-squad thresholds.
 *
 * In the coach's words, when most of the squad hit the top band: "we are not
 * trying to seperate anyone. Just measuring if they are fit." So a bunched
 * result is the good outcome, and the useful output is who fell SHORT.
 *
 * Everything here is emphasis, never a filter: the leaderboard keeps every row
 * and every sort. That was the condition on introducing it.
 */

export type BandStanding = 'met' | 'below' | 'missed' | 'none';

export interface StandingRow {
  /** Over every session held, absences included. This is what points rank on. */
  earned: number;
  available: number;
  /** Results with a value. An absence is not an attempt. */
  attempts: number;
  /**
   * Runs that cleared the bar outright, and runs that did not. Attempts only —
   * an absence is neither. Optional: a row built before the distinction
   * existed falls back to reading the totals.
   */
  metRuns?: number;
  shortRuns?: number;
  [k: string]: any;
}

/**
 * Is this measure scored against a standard rather than against team-mates?
 *
 * Only `time_bands`. `time_low` is a fastest-wins exercise — it ranks players
 * against each other, and spread there is meaningful.
 */
export function isThresholdMeasure(measure: string): boolean {
  return measure === 'time_bands';
}

export function bandStanding(row: StandingRow): BandStanding {
  const attempts = Number(row?.attempts) || 0;

  /*
   * Never run: not measured, and therefore not shown to be match-ready.
   *
   * This used to be excluded from the shortfall entirely, on the reasoning
   * that an absence is not a slow time. That is true about blame and wrong
   * about READINESS, which is what this standard measures — a player who has
   * not run three laps in 4:30 has not shown he can last a full match,
   * whatever the reason.
   *
   * It keeps its own value rather than folding into 'below' because the two
   * ask different things of a coach: one player needs training, the other
   * needs to turn up. `belowStandard` counts both.
   */
  if (attempts === 0) return 'none';

  /*
   * Judged on the fastest run, not on an average of them.
   *
   * A player who ran 4:29 and 4:40 against a 4:30 bar has PROVED he can clear
   * it. The 4:40 says he does not always, which is worth showing — and
   * `metRuns` / `shortRuns` are what show it — but it is not the same as
   * failing. Averaging the two put him below a standard he had already met.
   *
   * This also settles the absence case on its own: an absence is not an
   * attempt, so it is in neither count and cannot demote anybody.
   */
  const metRuns = Number(row?.metRuns);
  if (Number.isFinite(metRuns)) {
    if (metRuns > 0) return 'met';
    return (Number(row?.earned) || 0) > 0 ? 'below' : 'missed';
  }

  // A row built before the counts existed: read the totals, as it used to.
  const earned = Number(row?.earned) || 0;
  const available = Number(row?.available) || 0;
  if (available === 0) return 'none';
  if (earned >= available) return 'met';
  if (earned > 0) return 'below';
  return 'missed';
}

/**
 * The rows worth a coach's attention: everyone not shown to be match-ready.
 *
 * `below`, `missed` and `none` — meeting a looser band, meeting none, and
 * never having run it are three degrees of the same signal. They are marked
 * differently on the row, because they call for different things, but a
 * headline that left any of them out would understate who is not ready.
 */
export function belowStandard<T extends StandingRow>(rows: T[]): T[] {
  return (rows || []).filter(r => bandStanding(r) !== 'met');
}
