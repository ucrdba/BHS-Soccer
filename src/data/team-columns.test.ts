/**
 * The team list carries the columns the app reads off a team.
 *
 * `fetchTeamsForViewer` and `fetchAllTeams` select named columns and map them
 * by hand, so a column missing from those strings is invisible to the app
 * however well the database holds it. That is not hypothetical:
 * `seasonFullMatchMinutes` read `team.match_minutes` for months while neither
 * the column (0034) nor the select named it, and every team silently played
 * the 80-minute fallback — including the club sides that do not.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(process.cwd(), 'src/data/supabase.ts'), 'utf8');

/** The `.select('…')` strings that read a list of teams, not a single id. */
function teamListSelects(source: string): string[] {
  return [...source.matchAll(/\.from\(\s*'teams'\s*\)\s*(?:\/\/[^\n]*\n|\s)*\.select\(\s*'([^']+)'/g)]
    .map(m => m[1])
    .filter(s => s.includes('is_public_default') && s.includes('name'));
}

describe('the columns a team is read with', () => {
  it('finds the selects that build the team list', () => {
    // fetchTeamsForViewer and fetchAllTeams. A third would want this too.
    expect(teamListSelects(SOURCE).length).toBeGreaterThanOrEqual(2);
  });

  it('names match_minutes in every one of them', () => {
    const without = teamListSelects(SOURCE).filter(s => !s.includes('match_minutes'));
    expect(without, `a team select omits match_minutes: ${without.join(' | ')}`).toEqual([]);
  });

  it('maps it onto the object the domain reads, not only into the query', () => {
    // seasonFullMatchMinutes reads team.match_minutes off the mapped row.
    const mappings = [...SOURCE.matchAll(/is_public_default: t\.is_public_default,\s*(match_minutes: t\.match_minutes)?/g)];
    expect(mappings.length).toBeGreaterThanOrEqual(2);
    expect(mappings.every(m => m[1])).toBe(true);
  });
});
