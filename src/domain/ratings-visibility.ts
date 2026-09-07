/**
 * Who may see a player's skill ratings.
 *
 * The ratings are a coach's assessment of a player, and most of the players
 * are minors, so the bio does not show them to everyone who can reach the
 * roster. Coaches and admins see them because they run the program; a player
 * sees them on the team they are actually on, and nowhere else.
 *
 * The design and functional specifications originally described the bio as
 * public with the ratings on it. That was overruled deliberately: a public
 * assessment of a named minor is not something a styling decision should
 * hand out.
 *
 * Framework-free on purpose, so the rule can be read and tested without
 * mounting anything. It is an affordance, not enforcement — the real access
 * rules are the database's RLS policies.
 */
export interface RatingsViewer {
  isCoach: boolean;
  isAdmin: boolean;
  /** The app's "active account, role of player, coach or admin" flag. */
  canAccessRatings: boolean;
  /** The signed-in profile's player record, when it has one. */
  viewerPlayerId: string | null | undefined;
  /** The people on the team being looked at. */
  teamPlayerIds: readonly string[];
}

export function canSeeTeamRatings(v: RatingsViewer): boolean {
  if (!v || !v.canAccessRatings) return false;
  if (v.isCoach || v.isAdmin) return true;

  const mine = v.viewerPlayerId;
  if (mine === null || mine === undefined || mine === '') return false;

  // Compared as text: one side is a profile row's column and the other a
  // roster row's, and a uuid that arrives as a number would never match.
  return (v.teamPlayerIds || []).some(id => String(id) === String(mine));
}
