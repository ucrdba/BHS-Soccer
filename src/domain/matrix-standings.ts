/**
 * Joining the derived standings onto the roster.
 *
 * Points are not stored on a player. `matrix_standings` is a view over
 * `matrix_logs` and `matrix_session_results`, which is what makes correcting a
 * mis-entered result re-derive every rank — and what makes the results panel
 * necessary rather than optional.
 *
 * It is a LEFT join, deliberately. A player with no results has no standings
 * row, and must still appear on the board at 0/0/0 rather than vanishing from
 * their own squad's leaderboard.
 *
 * Lifted out of syncFromSupabase during the Vue migration's Phase 3.
 */

export interface MatrixStats {
  wins: number;
  draws: number;
  losses: number;
  games: number;
  exercises: number;
  earned: number;
  available: number;
  /** Null until a player has taken part in something. */
  share: number | null;
  rank: number;
}

/**
 * Reads the columns migration 0009 introduced, falling back to the ones it
 * replaced.
 *
 * The fallback is kept rather than tidied away: the view's shape depends on
 * which migrations a given database has had applied, and the cost is one `??`
 * per field against rendering `undefined` on a board.
 */
export function toMatrixStats(s: any, unrankedFrom: number): MatrixStats {
  if (!s) {
    return {
      wins: 0, draws: 0, losses: 0, games: 0, exercises: 0,
      earned: 0, available: 0, share: null, rank: unrankedFrom
    };
  }

  const share = s.share ?? s.win_pct;
  return {
    wins: s.wins || 0,
    draws: s.draws || 0,
    losses: s.losses || 0,
    games: s.games || 0,
    exercises: s.exercises ?? s.games ?? 0,
    earned: Number(s.earned ?? s.points ?? 0),
    available: Number(s.available ?? 0),
    share: share === null || share === undefined ? null : Number(share),
    rank: s.rank
  };
}

/**
 * Every player, with their standings attached.
 *
 * An unranked player is ranked one past the last ranked one rather than being
 * given 999 or dropped: the board sinks them either way, and a rank derived
 * from the squad's size reads as "last" rather than as a magic number.
 */
export function joinStandings(players: any[], standings: any[] | null): any[] {
  const byId = new Map((standings || []).map(s => [s.player_id, s]));
  const unrankedFrom = (standings || []).length + 1;

  return (players || []).map(p => ({
    ...p,
    matrixStats: toMatrixStats(byId.get(p.id), unrankedFrom)
  }));
}
