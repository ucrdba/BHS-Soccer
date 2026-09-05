/**
 * Roster ordering.
 *
 * Extracted from public/js/views/roster.view.js during the Vue migration
 * (Phase 0).
 *
 * Note this sorts on the SHIRT number, unlike the matrix and session grids,
 * which sort on the recording number. They are different numbers and the
 * roster is the one place the shirt is what a reader is looking for.
 */

export function comparePlayers(a: any, b: any, by: string): number {
  if (by === 'name') {
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  }
  const na = parseInt(a.number, 10) || 0;
  const nb = parseInt(b.number, 10) || 0;
  if (!na !== !nb) return na ? -1 : 1;   // exactly one is unnumbered — it goes last
  if (na !== nb) return na - nb;
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
}

export function sortedPlayers(players: any[], by: string): any[] {
  const key = by === 'name' ? 'name' : 'number';
  return (players || [])
    .filter(p => !p.is_deleted && !p.isDeleted)
    .slice()
    .sort((a, b) => comparePlayers(a, b, key));
}
