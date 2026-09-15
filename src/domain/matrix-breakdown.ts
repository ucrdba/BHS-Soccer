/**
 * Why a player's number is what it is.
 *
 * A breakdown answers one question — "where did those points come from?" — so
 * every row is phrased for the exercise it came from. A time is not a count,
 * and 250 read as a score looks like points earned, which is the column next
 * to it.
 *
 * Extracted from public/js/views/matrix-session.view.js during Phase 3.
 */
import { formatSecondsAsTime } from './time';
import { isTimedExercise } from './matrix-session';
import { roleLabel, type PositionRole } from './position';
import { formatGoalDifference } from './goal-score';
import { percentLabel } from './role-goal-score';

export interface BreakdownRow {
  kind: string;
  detail?: string;
  opponent_id?: string;
  drill_id?: string;
  raw_value?: number | null;
  earned?: number;
  available?: number;
  [k: string]: any;
}

/**
 * What the player actually did, in words.
 *
 * `absent` and `not_entered` are deliberately different. A no-show is a
 * decision somebody recorded; a row nobody filled in is an omission, and
 * naming it tells the coach to go back rather than leaving them to assume the
 * player was missing.
 */
export function breakdownDetail(
  row: BreakdownRow,
  names: Map<string, string>,
  drillsBank: any[]
): string {
  if (!row) return '';

  if (row.kind === 'head_to_head') {
    const who = names.get(row.opponent_id || '') || 'an opponent';
    return row.detail === 'win' ? `beat ${who}`
      : row.detail === 'draw' ? `drew with ${who}`
        : `lost to ${who}`;
  }

  if (row.kind === 'win_loss') {
    return row.detail === 'win' ? 'won' : row.detail === 'draw' ? 'drew' : 'lost';
  }

  if (row.kind === 'role_goals') {
    // The exercise and "1.8 of 3.0" sit in the modal's own columns; this cell
    // says what the player did and which shares it earned.
    const parts = [row.role ? roleLabel(row.role as PositionRole) : 'no role'];
    if (row.goals_for != null && row.goals_against != null) {
      const gf = Number(row.goals_for);
      const ga = Number(row.goals_against);
      parts.push(`${gf}-${ga} (${formatGoalDifference(gf - ga)})`);
    }
    parts.push(`${percentLabel(Number(row.base_factor) || 0)} + ${percentLabel(Number(row.bonus_factor) || 0)}`);
    return parts.join(' · ');
  }

  if (row.kind === 'absent') return 'no-show';
  if (row.kind === 'not_entered') return 'not entered';

  if (row.raw_value === null || row.raw_value === undefined) return 'took part';

  if (row.kind === 'time_band') {
    // Shown as the coach entered it, WITH what it earned, because the whole
    // question a breakdown answers is "why that number?".
    const time = formatSecondsAsTime(row.raw_value);
    const share = Number(row.available) ? Number(row.earned) / Number(row.available) : 0;
    return share > 0
      ? `${time} — earned ${+share.toFixed(2)} of the exercise`
      : `${time} — met no standard`;
  }

  // Both timed and counted exercises arrive as 'measured' with a bare number.
  // Only the drill knows which it is, and 2800 metres and 2800 seconds want
  // very different formatting.
  if (row.kind === 'measured' && isTimedExercise(row, drillsBank)) {
    return formatSecondsAsTime(row.raw_value);
  }

  return String(Number(row.raw_value));
}

export interface Verdict {
  /** Null for a draw. */
  winnerId: string | null;
  loserId: string | null;
  drew: boolean;
  aId: string;
  bId: string;
}

/**
 * Who won a head-to-head result.
 *
 * The stored `outcome` is 'a', 'b' or 'draw', which names a position in the
 * row rather than a person. Resolving it here means the panel can mark the
 * winner instead of making a reader decode which column was which.
 */
export function resultVerdict(log: any): Verdict {
  const aId = log?.player_a_id;
  const bId = log?.player_b_id;

  if (log?.outcome === 'draw') {
    return { winnerId: null, loserId: null, drew: true, aId, bId };
  }
  const aWon = log?.outcome === 'a';
  return {
    winnerId: aWon ? aId : bId,
    loserId: aWon ? bId : aId,
    drew: false,
    aId, bId
  };
}

/**
 * How a player is named beside a result.
 *
 * The RECORDING number, not the shirt: the Matrix is read alongside the paper
 * sheets, which carry recording numbers, and migration 0021 cleared the shirt
 * number for the whole squad when it moved those values across.
 */
export function resultLabel(playerId: string, byId: Map<string, any>): string {
  const p = byId.get(playerId);
  if (!p) return '(removed player)';
  return p.recordingNumber != null ? `(${p.recordingNumber}) ${p.name}` : p.name;
}
