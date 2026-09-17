/**
 * One exercise's leaderboard, taken off the screen.
 *
 * A coach reads the board sorted the way the question needs — fastest first to
 * pick a squad, slowest first to plan a session — and then wants that, printed
 * or in a spreadsheet. So both exports take the rows they are given, in the
 * order they are given them, and never re-sort. The sort already happened on
 * screen and is the coach's answer, not a detail to normalise away.
 *
 * Printing follows `plan-print.ts`: a rendered HTML document handed to the
 * browser's own print dialog, where "Save as PDF" is one of the destinations.
 * No PDF library, for the reason that module already gives — it would be a
 * dependency for a worse result.
 */
import { formatSecondsAsTime } from './time';
import { printTableDocument } from './print-table';
import { bandStanding, isThresholdMeasure, roleGoalStanding } from './matrix-threshold';
import { roleLabel, type PositionRole } from './position';
import { formatGoalDifference } from './goal-score';
import { percentLabel } from './role-goal-score';

export interface ExerciseExportOptions {
  exercise: string;
  measure: string;
  organization: string;
  team?: string;
  /** Leaderboard rows, already in the order the coach sorted them. */
  rows: any[];
}

const isWinLoss = (m: string) => m === 'win_loss' || m === 'head_to_head';

/** A figure phrased for the exercise it was measured in, or a dash. */
function figure(row: any, value: any): string {
  if (value === null || value === undefined) return '—';
  return row.timed ? formatSecondsAsTime(Math.round(value)) : String(value);
}

/** The verdict, in the words the screen uses. */
function verdict(row: any): string {
  const s = bandStanding(row);
  if (s === 'met') return 'met';
  if (s === 'below') return 'below';
  if (s === 'missed') return 'no band';
  return 'no runs';
}

/**
 * How many runs cleared the bar, where that adds something.
 *
 * A player who cleared every run he made needs no ratio — the verdict already
 * says it — and one who never ran has no runs to count.
 */
function runs(row: any): string {
  const met = Number(row?.metRuns) || 0;
  const short = Number(row?.shortRuns) || 0;
  const total = met + short;
  return total === 0 || short === 0 ? '' : `${met} of ${total}`;
}

/**
 * The rows as a spreadsheet, one object per player, keys in column order.
 *
 * Times are written as times. A sheet full of raw seconds is not the sheet the
 * coach was reading, and 269 does not mean anything to the person it is handed
 * to.
 */
export function exerciseSheet(options: ExerciseExportOptions): Record<string, any>[] {
  const rows = options?.rows || [];
  if (rows.length === 0) return [];

  const winLoss = isWinLoss(options.measure);
  const threshold = isThresholdMeasure(options.measure);
  const roleGoals = options.measure === 'role_goals';

  return rows.map(r => {
    const out: Record<string, any> = {
      '#': r.recordingNumber == null ? '' : r.recordingNumber,
      Player: r.name
    };

    if (winLoss) {
      out['W-D-L'] = `${r.wins || 0} - ${r.draws || 0} - ${r.losses || 0}`;
    } else if (roleGoals) {
      const has = (v: any) => v !== null && v !== undefined;
      out.Role = r.role ? roleLabel(r.role as PositionRole) : '';
      out.Score = has(r.goalsFor) && has(r.goalsAgainst) ? `${r.goalsFor}-${r.goalsAgainst}` : '';
      out['Goal difference'] = has(r.diff) ? formatGoalDifference(r.diff) : '';
      out['Base %'] = has(r.baseFactor) ? percentLabel(r.baseFactor) : '';
      out['Bonus %'] = has(r.bonusFactor) ? percentLabel(r.bonusFactor) : '';
    } else {
      out['Best time'] = figure(r, r.best);
      out.Average = figure(r, r.avg);
    }

    out.Points = Number(r.earned ?? 0).toFixed(2);
    out.Of = Number(r.available ?? 0).toFixed(2);

    // Only where the measure is a standard. A competitive exercise has no
    // verdict to report, and an empty column would imply it failed to load.
    if (threshold) {
      out.Standard = verdict(r);
      out.Runs = runs(r);
    }

    if (roleGoals) {
      const s = roleGoalStanding(r);
      out.Standard = s === 'none' ? '' : s;
    }

    return out;
  });
}

/**
 * The printable document, or null when there is nothing to print.
 *
 * Self-contained on purpose: off screen there is no summary box to explain
 * what the standard column means, so the sheet says it. The page itself is
 * `print-table.ts`, shared with the board export.
 */
export function buildExercisePrintDocument(options: ExerciseExportOptions): string | null {
  const standardNote = isThresholdMeasure(options.measure)
    ? `<p class="note">A match-readiness standard, not a ranking. A player meets it
       once his fastest run clears the bar; “runs” says how many of his runs did.
       “No runs” means the exercise has not been attempted.</p>`
    : options.measure === 'role_goals'
      ? `<p class="note">Scored against standards per role, not a ranking. Each row is the
         player’s latest result; “below” means the goal difference met no band for their role.
         Points total every session.</p>`
      : '';

  return printTableDocument({
    title: options.exercise,
    where: [options.organization, options.team],
    textual: new Set(['Player', 'Standard', 'Runs', 'W-D-L', 'Role', 'Score']),
    rows: exerciseSheet(options),
    note: standardNote
  });
}
