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
   * The same totals over attempted sessions alone, which is what a standard
   * is judged on. Optional: a row built before the distinction existed falls
   * back to the totals above.
   */
  attemptedEarned?: number;
  attemptedAvailable?: number;
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
   * Judged on the sessions the player actually ran, not on every session held.
   *
   * A leaderboard row totals `earned` and `available` over every session,
   * absences included — that is the scoring rule, and it is right for the
   * POINTS, which rank the squad. It is wrong for the STANDARD, which asks a
   * different question: when this player ran, did they clear the bar? A player
   * who met it on both his runs and missed a third arrived here as 2 of 3 and
   * was reported below a standard he had never actually failed.
   *
   * `attemptedEarned` / `attemptedAvailable` carry the same totals over
   * attempted sessions alone. They are optional so a row built before this
   * distinction existed still reads sensibly, falling back to the totals.
   */
  const hasAttempted = row?.attemptedAvailable !== undefined
    && row?.attemptedAvailable !== null;
  const earned = Number(hasAttempted ? row.attemptedEarned : row?.earned) || 0;
  const available = Number(hasAttempted ? row.attemptedAvailable : row?.available) || 0;

  // No attempt is not a failure. A player who was not there has not run
  // slowly, and counting them as falling short would put a coach's attention
  // on the wrong person.
  if (attempts === 0 || available === 0) return 'none';

  if (earned >= available) return 'met';
  if (earned > 0) return 'below';
  return 'missed';
}

/**
 * The rows worth a coach's attention: those who attempted and fell short.
 *
 * Both `below` and `missed` — meeting a looser band and meeting none are
 * different degrees of the same signal.
 */
export function belowStandard<T extends StandingRow>(rows: T[]): T[] {
  return (rows || []).filter(r => {
    const s = bandStanding(r);
    return s === 'below' || s === 'missed';
  });
}
