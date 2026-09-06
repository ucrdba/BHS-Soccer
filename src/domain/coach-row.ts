/**
 * The coaches table's read mapping.
 *
 * `name` and `level` are NOT NULL in the database — verified against a running
 * Postgres, not read off the schema file, which drifts. Anything writing a
 * coach must supply both or the insert is rejected with a constraint error the
 * coach on screen cannot act on.
 *
 * Lifted out of syncFromSupabase during the Vue migration's Phase 2. Note the
 * legacy call site is `fetchCoaches('bhs')` with the organization hardcoded
 * (app.core.js:523), which shows Beaumont's staff to a club coach. Nothing
 * here carries that literal; the caller passes the resolved organization.
 */

export interface Coach {
  id: string;
  schoolId: string | null;
  name: string;
  /** Head Coach, Assistant, Keeper Coach … NOT NULL in the database. */
  level: string;
  phone: string | null;
  address: string | null;
  email: string | null;
  photo: string | null;
  bio: string | null;
}

export function toCoach(c: any): Coach {
  return {
    id: c?.id,
    schoolId: c?.school_id ?? null,
    name: c?.name,
    level: c?.level,
    phone: c?.phone ?? null,
    address: c?.address ?? null,
    email: c?.email ?? null,
    photo: c?.photo_url ?? null,
    bio: c?.bio ?? null
  };
}

/**
 * fetchCoaches returns null on failure, which is not an empty staff list.
 *
 * Soft deletes are a repo-wide convention: rows carry `is_deleted` and readers
 * filter on it. A row with no id is dropped rather than rendered as a blank
 * card nobody can edit or remove.
 */
export function toCoaches(rows: any[] | null | undefined): Coach[] {
  return (rows || [])
    .filter(c => c && !c.is_deleted && !c.isDeleted)
    .map(toCoach)
    .filter(c => c.id);
}

/**
 * Order the staff the way a programme lists it: seniority, then name.
 *
 * `level` is free text, so this matches on keywords rather than an enum —
 * "Head Coach", "Head", and "head coach" all mean the same thing to a reader.
 * Anything unrecognised sorts after the ranks it does not match, rather than
 * disappearing or leading.
 */
/**
 * Tiers, not a flat keyword list: one role can be spelled several ways and
 * they must rank together. "Goalkeeping Coach" does not contain "keeper" —
 * there is no 'r' after "keep" — so both spellings have to be named.
 */
const RANK: string[][] = [
  ['head'],
  ['assistant', 'asst'],
  ['keeper', 'goalkeep']
];

export function coachRank(level: string): number {
  const l = String(level || '').toLowerCase();
  const i = RANK.findIndex(tier => tier.some(kw => l.includes(kw)));
  return i === -1 ? RANK.length : i;
}

export function sortedCoaches(coaches: Coach[]): Coach[] {
  return (coaches || []).slice().sort((a, b) => {
    const ra = coachRank(a.level), rb = coachRank(b.level);
    if (ra !== rb) return ra - rb;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}
