/**
 * Narrowing the roster to a position group.
 *
 * The position column is free text that arrived from spreadsheets other
 * people made: "CB", "Centre Back", "Center-back" and "Defender" all mean the
 * same thing to a reader and nothing to a string comparison. So a group is a
 * set of keywords matched as substrings, not an enum.
 *
 * Extracted from filterRoster in public/js/views/roster.view.js, which did
 * this by setting style.display on each card. Sorting stays in
 * src/domain/roster.ts, where Phase 0 put it.
 */
import type { Player } from './player-row';

export interface RosterFilter {
  key: string;
  label: string;
  /** null means "everyone" rather than "match nothing". */
  keywords: string[] | null;
}

export const ROSTER_FILTERS: RosterFilter[] = [
  { key: 'ALL', label: 'All', keywords: null },
  { key: 'GK', label: 'Keepers', keywords: ['goalkeeper', 'keeper', 'gk'] },
  { key: 'DEF', label: 'Defence', keywords: ['back', 'defender', 'def'] },
  { key: 'MID', label: 'Midfield', keywords: ['midfield', 'mid'] },
  // CAM sits here rather than in midfield, matching how the legacy chips read.
  { key: 'FWD', label: 'Attack', keywords: ['forward', 'winger', 'cam', 'striker'] }
];

export function filterRoster(players: Player[], filter: string): Player[] {
  const rows = players || [];
  const found = ROSTER_FILTERS.find(f => f.key === filter);

  // An unknown filter shows everyone rather than nobody: an empty roster
  // reads as "there are no players", which would be a lie.
  if (!found || !found.keywords) return rows.slice();

  const keywords = found.keywords;
  return rows.filter(p => {
    const pos = String(p?.position || '').toLowerCase();
    return keywords.some(kw => pos.includes(kw));
  });
}

/**
 * The chips, with how many each would show.
 *
 * The count is the addition: a chip that leads to an empty list is worth
 * knowing about before it is pressed, and an empty group is shown as zero
 * rather than hidden, so the set of chips does not move around.
 */
export function rosterFilters(players: Player[]): { key: string; label: string; count: number }[] {
  return ROSTER_FILTERS.map(f => ({
    key: f.key,
    label: f.label,
    count: filterRoster(players, f.key).length
  }));
}
