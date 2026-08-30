/**
 * Decides which team a viewer is looking at.
 *
 * Kept separate from the service so it is testable without a database, and
 * because it is the one piece of this feature whose failure is silent: showing
 * one team's roster under another team's name looks like data corruption
 * rather than a scoping bug.
 */
export interface TeamLike {
  id: string;
  name?: string;
  school_id?: string;
  is_public_default?: boolean;
}

export function resolveActiveTeam(
  available: TeamLike[],
  storedId: string | null,
  publicDefaultId: string | null
): string | null {
  const teams = available || [];
  if (teams.length === 0) return null;

  // A stored id is only honoured while the viewer still has access — a coach
  // removed from a team must not keep seeing it because localStorage remembers.
  if (storedId && teams.some((t) => t.id === storedId)) return storedId;

  if (publicDefaultId && teams.some((t) => t.id === publicDefaultId)) return publicDefaultId;

  const flagged = teams.find((t) => t.is_public_default);
  return flagged ? flagged.id : teams[0].id;
}
