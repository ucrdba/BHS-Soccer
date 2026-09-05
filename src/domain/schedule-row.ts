/**
 * The schedule table's read mapping.
 *
 * Supabase rows are snake_case, app state is camelCase, and there is no ORM:
 * every field is hand-mapped, on read here and on write in the client's
 * upsert methods. Adding a column means editing both sides.
 *
 * Lifted out of syncFromSupabase during the Vue migration's Phase 1 so the
 * two apps cannot drift into mapping the same table differently.
 */

export interface Match {
  id: string;
  date: string;
  time: string;
  /**
   * Derived by a database trigger from the text columns (migration 0008), and
   * null when the text would not parse. Used for comparing and ordering; the
   * text columns remain what the site displays.
   */
  matchOn: string | null;
  kickoffTime: string | null;
  opponent: string;
  location: string;
  venueAddress: string | null;
  status: string;
  isHome: boolean;
  score: string | null;
  result: string | null;
}

export function toMatch(s: any): Match {
  return {
    id: s.id,
    date: s.match_date,
    time: s.match_time,
    matchOn: s.match_on ?? null,
    kickoffTime: s.kickoff_time ?? null,
    opponent: s.opponent,
    location: s.location,
    venueAddress: s.venue_address ?? null,
    status: s.status,
    isHome: s.is_home,
    score: s.score,
    result: s.result
  };
}

/** fetchSchedule returns null on failure, which is not an empty season. */
export function toSchedule(rows: any[] | null | undefined): Match[] {
  return (rows || []).map(toMatch);
}
