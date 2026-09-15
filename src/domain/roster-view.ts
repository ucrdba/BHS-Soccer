/**
 * Narrowing the roster to a position group.
 *
 * A group is a role, and a role comes from the position number -- see
 * domain/position.ts: 1 the goalkeeper, 2-6 defence, 7-11 attack. No text is
 * matched. There is no midfield group because the numbering has no midfield
 * role; a player with no position appears under All only.
 *
 * Sorting stays in src/domain/roster.ts.
 */
import type { Player } from './player-row';
import { roleOfPosition, type PositionRole } from './position';

export interface RosterFilter {
  key: 'ALL' | 'GK' | 'DEF' | 'FWD';
  label: string;
  /** null means "everyone" rather than "match nothing". */
  role: PositionRole | null;
}

export const ROSTER_FILTERS: RosterFilter[] = [
  { key: 'ALL', label: 'All', role: null },
  { key: 'GK', label: 'Keepers', role: 'keeper' },
  { key: 'DEF', label: 'Defence', role: 'defend' },
  { key: 'FWD', label: 'Attack', role: 'attack' }
];

export function filterRoster(players: Player[], filter: string): Player[] {
  const rows = players || [];
  const found = ROSTER_FILTERS.find(f => f.key === filter);

  // An unknown filter shows everyone rather than nobody: an empty roster
  // reads as "there are no players", which would be a lie.
  if (!found || !found.role) return rows.slice();

  return rows.filter(p => roleOfPosition(p?.position) === found.role);
}

/**
 * The chips, with how many each would show.
 *
 * An empty group is shown as zero rather than hidden, so the set of chips does
 * not move around.
 */
export function rosterFilters(players: Player[]): { key: string; label: string; count: number }[] {
  return ROSTER_FILTERS.map(f => ({
    key: f.key,
    label: f.label,
    count: filterRoster(players, f.key).length
  }));
}
