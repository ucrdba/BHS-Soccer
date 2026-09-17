/**
 * The squad report's shared helpers.
 *
 * Extracted from public/js/views/report.view.js during the Vue migration
 * (Phase 0). buildSquadReport stays in the view: it is built out of
 * reportBlock, which reads the exercise-points cache and formats through the
 * Supabase client, so it is not pure and cannot be made so by passing
 * parameters.
 */

/**
 * The standard a timed exercise is measured against.
 *
 * The fastest band, because bands are "at or under X earns Y" and the tightest
 * one is the target. Null when no bands are set, which means the exercise is
 * not counted for this squad at all rather than that everyone failed it.
 */
export function reportStandardSeconds(
  bandsByDrill: Record<string, any[]>, drillId: string
): number | null {
  const bands = (bandsByDrill || {})[drillId] || [];
  if (!bands.length) return null;
  return Math.min(...bands.map(b => Number(b.max_seconds)));
}

export interface OutcomeRecord {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** "1 - 1 - 1", or a dash for a player who played none. */
  label: string;
}

/**
 * One player's record in a W/D/L exercise.
 *
 * A small-sided game or a Flying Fours stores won/drew/lost and NO number, so
 * the squad report's "best reading" counts nothing for them: every player read
 * 0 attempts and a dash, and the exercise took a heading in the report while
 * saying nothing about the sessions behind it. Their reading is the record.
 *
 * Only rows where the player was there and a result was chosen: an outcome
 * implies attendance, and a present row with no outcome is a game nobody
 * recorded rather than a game drawn.
 */
export function outcomeRecord(history: any[], drillId: string, playerId: string): OutcomeRecord {
  const mine = (history || []).filter(r =>
    r?.drillId === drillId && r?.playerId === playerId
    && r?.attendance === 'present' && !!r?.outcome);

  const count = (kind: string) => mine.filter(r => r.outcome === kind).length;
  const wins = count('win');
  const draws = count('draw');
  const losses = count('loss');
  const games = wins + draws + losses;

  return { games, wins, draws, losses, label: games === 0 ? '—' : `${wins} - ${draws} - ${losses}` };
}
