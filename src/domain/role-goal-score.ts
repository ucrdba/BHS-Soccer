/**
 * What a Goals-by-role score earns against a squad's standards.
 *
 * The database is the authority -- 0037's `role_scored` CTE. This copy exists
 * so a coach sees what each score is worth as it is typed, not after a save
 * and a reload, the same reason band-score.ts duplicates factorForTime.
 * role-goal-score.test.ts and src/data/testdb/goals-by-role.test.ts both run
 * the cases in role-goal-cases.ts, so the two cannot disagree silently.
 *
 *   base   the highest factor among the role's base bands whose threshold the
 *          goal difference meets or beats
 *   bonus  the highest factor among the role's bonus bands met: attack on goals
 *          scored (at least), defend and keeper on goals given up (at most)
 *   total  base + bonus, capped at 1
 *
 * A role with no base bands has no standards: the database leaves it out.
 */
import { roleLabel, type PositionRole } from './position';
import { parseGoalScore, formatGoalDifference, type GoalScore } from './goal-score';

export interface GoalBand {
  role: string;
  kind: string;
  threshold: number | string;
  factor: number | string;
}

export interface RoleGoalFactor {
  base: number;
  bonus: number;
  total: number;
  hasStandards: boolean;
}

export type GoalFeedbackTone = 'good' | 'none' | 'bad' | 'empty';

function best(bands: GoalBand[], meets: (threshold: number) => boolean): number {
  return bands
    .filter(b => meets(Number(b.threshold)))
    .reduce((top, b) => Math.max(top, Number(b.factor) || 0), 0);
}

export function roleGoalFactor(
  score: GoalScore | null, role: string | null | undefined, bands: GoalBand[]
): RoleGoalFactor {
  const mine = (bands || []).filter(b => b.role === role);
  const base = mine.filter(b => b.kind === 'base');
  const bonus = mine.filter(b => b.kind === 'bonus');
  const hasStandards = !!role && base.length > 0;
  if (!hasStandards || !score) return { base: 0, bonus: 0, total: 0, hasStandards };

  const diff = score.scored - score.conceded;
  const b = best(base, t => diff >= t);
  const bo = best(bonus, t => (role === 'attack' ? score.scored >= t : score.conceded <= t));
  // Rounded to the database's three places, so 0.7 + 0.1 reads 0.8.
  const total = Math.min(1, Math.round((b + bo) * 1000) / 1000);
  return { base: b, bonus: bo, total, hasStandards };
}

export function percentLabel(factor: number): string {
  return `${+(Number(factor) * 100).toFixed(1)}%`;
}

/**
 * What sits beside the score box as it is typed.
 *
 * `bad` means the entry could not be used as it stands; `none` means it was
 * read and earned nothing, or cannot score yet. The two must not look alike:
 * telling a coach a correct score looks wrong would have them retype it.
 */
export function roleGoalFeedback(
  raw: string, role: string | null | undefined, bands: GoalBand[], weight: number | string | null | undefined
): { text: string; tone: GoalFeedbackTone } {
  const typed = String(raw ?? '').trim();
  if (!typed) return { text: '', tone: 'empty' };

  const score = parseGoalScore(typed);
  if (!score) return { text: 'score? e.g. 3-1', tone: 'bad' };
  if (!role) return { text: 'choose a role', tone: 'bad' };

  const f = roleGoalFactor(score, role, bands);
  if (!f.hasStandards) return { text: `no standards for ${roleLabel(role as PositionRole)}`, tone: 'none' };

  const points = +((Number(weight) || 0) * f.total).toFixed(2);
  return {
    text: `${percentLabel(f.base)} + ${percentLabel(f.bonus)} = ${percentLabel(f.total)} · ${points} pts`,
    tone: f.total > 0 ? 'good' : 'none'
  };
}

/**
 * A worked example for the editor, from the role's own bands.
 *
 * It takes the best-paying base band's threshold as the goal difference and
 * the best-paying bonus band's threshold as goals scored (attack) or given up
 * (defend, keeper), then scores that result with the rule above -- so the
 * line always shows what the bands on screen would really pay.
 */
export function goalBandExample(role: PositionRole, bands: GoalBand[]): string {
  const mine = (bands || []).filter(b => b.role === role);
  const base = mine.filter(b => b.kind === 'base');
  if (!base.length) return `Add a goal-difference band to score ${roleLabel(role)}.`;

  const top = (list: GoalBand[]) => list.reduce((a, b) => (Number(b.factor) > Number(a.factor) ? b : a));
  const diff = Number(top(base).threshold);
  const bonus = mine.filter(b => b.kind === 'bonus');
  const bonusThreshold = bonus.length ? Number(top(bonus).threshold) : 0;

  let scored: number;
  let conceded: number;
  if (role === 'attack') {
    scored = Math.max(bonusThreshold, diff, 0);
    conceded = scored - diff;
  } else {
    conceded = Math.max(bonusThreshold, 0);
    scored = conceded + diff;
    if (scored < 0) { scored = 0; conceded = -diff; }
  }

  const f = roleGoalFactor({ scored, conceded }, role, mine);
  const what = role === 'attack' ? `${scored} scored` : `${conceded} given up`;
  return `${formatGoalDifference(scored - conceded)} with ${what} → `
    + `${percentLabel(f.base)} + ${percentLabel(f.bonus)} = ${percentLabel(f.total)}`;
}
