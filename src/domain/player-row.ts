/**
 * The team_players table's read mapping.
 *
 * A row is a MEMBERSHIP with the person nested under `players`. `players` is
 * pure identity; everything that varies by team -- number, position, season
 * stats, ratings -- lives on the membership. That separation is what lets one
 * person appear on a school team and a club team with separate statistics, so
 * the person's id and the membership's id are both carried and never merged.
 *
 * Lifted out of syncFromSupabase during the Vue migration's Phase 2 so the
 * two apps cannot drift into reading the roster differently.
 */

export interface Player {
  /** The person. Stable across every team they appear on. */
  id: string;
  /** The team_players row. What a per-team edit writes to. */
  membershipId: string;
  /**
   * Maintained by a database trigger from the two parts (0016). It stays in
   * state because the roster cards, Matrix standings, planner and export all
   * read it; the parts come along for the editor, which edits them rather
   * than the whole.
   */
  name: string;
  firstName: string;
  lastName: string;
  classYear: string;
  height: string;
  photo: string;
  /** The shirt number. */
  number: number | null;
  /** The paper-sheet number, distinct from the shirt (0021). */
  recordingNumber: number | null;
  position: string;
  seasonStats: Record<string, any>;
  ratings: Record<string, any>;
}

/**
 * The placeholder images, as app.core.js names them.
 *
 * Kept identical rather than re-pointed: both apps serve them from the same
 * public/img, and a second placeholder would drift from the first.
 */
export const PLAYER_SILHOUETTE = 'img/player-placeholder.png';
export const COACH_SILHOUETTE = 'img/coach-placeholder.png';

/**
 * A photo, or the silhouette when none is set.
 *
 * Treats null, undefined and whitespace-only strings alike — imports and
 * manual edits all leave photo_url as an empty string rather than null.
 */
export function photoOrPlaceholder(url: string | null | undefined, kind: 'player' | 'coach' = 'player'): string {
  if (url && String(url).trim()) return url;
  return kind === 'coach' ? COACH_SILHOUETTE : PLAYER_SILHOUETTE;
}

export function toPlayer(m: any): Player {
  return {
    id: m?.players?.id,
    membershipId: m?.id,
    name: m?.players?.name,
    firstName: m?.players?.first_name || '',
    lastName: m?.players?.last_name || '',
    classYear: m?.players?.class_year,
    height: m?.players?.height,
    photo: m?.players?.photo_url,
    number: m?.number ?? null,
    recordingNumber: m?.recording_number ?? null,
    position: m?.position,
    seasonStats: m?.season_stats || {},
    ratings: m?.ratings || {}
  };
}

/**
 * fetchTeamRoster returns null on failure, which is not an empty squad.
 *
 * A membership whose join produced no person is dropped rather than rendered:
 * a blank card on the roster is worse than a missing one, because there is no
 * way to act on it.
 */
export function toRoster(rows: any[] | null | undefined): Player[] {
  return (rows || []).map(toPlayer).filter(p => p.id);
}
