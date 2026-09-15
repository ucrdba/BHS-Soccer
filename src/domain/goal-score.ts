/**
 * A Goals-by-role score, as typed on the session sheet.
 *
 * One box, from the player's own side: "3-1" is scored three, gave up one.
 * "3:1" and "3 1" mean the same, because a phone keyboard's number pad may not
 * offer a dash. Each side is a whole number 0-99, matching the database check.
 *
 * Anything else is refused rather than guessed. "3" could be three scored or
 * three given up, and reading it either way would score a result that did not
 * happen without anything on screen looking wrong.
 */

export interface GoalScore {
  scored: number;
  conceded: number;
}

const SCORE = /^\s*(\d{1,2})\s*[-:\s]\s*(\d{1,2})\s*$/;

export function parseGoalScore(text: unknown): GoalScore | null {
  if (typeof text !== 'string') return null;
  const m = SCORE.exec(text);
  return m ? { scored: Number(m[1]), conceded: Number(m[2]) } : null;
}

export function formatGoalScore(score: GoalScore | null): string {
  return score ? `${score.scored}-${score.conceded}` : '';
}

/** "+2", "0", "-1": a positive difference is signed so it cannot be read as a score. */
export function formatGoalDifference(diff: number): string {
  return diff > 0 ? `+${diff}` : String(diff);
}
