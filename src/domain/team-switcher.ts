/**
 * Teams grouped by organization, for the header's switcher.
 *
 * Almost everything on every screen is scoped to the active team, and a
 * person may belong to a school team and a club team at once. Grouping by
 * organization is what stops the two being confused. The label comes from
 * the organization's row, or from the name the team row carries when the
 * schools have not loaded — and never from a code.
 */
export interface SwitcherTeam {
  id: string;
  name: string;
  season: string;
}

export interface TeamGroup {
  id: string;
  label: string;
  teams: SwitcherTeam[];
}

export function teamGroups(teams: any[], schools: any[]): TeamGroup[] {
  const byId = new Map<string, any>((schools || []).map(s => [String(s.id), s]));
  const groups: TeamGroup[] = [];
  const index = new Map<string, TeamGroup>();

  for (const t of teams || []) {
    const key = String(t.school_id ?? '');
    let group = index.get(key);
    if (!group) {
      const school = byId.get(key);
      group = {
        id: key,
        label: (school && school.name) || t.school_name || 'Organization',
        teams: []
      };
      index.set(key, group);
      groups.push(group);
    }
    group.teams.push({ id: String(t.id), name: String(t.name || ''), season: t.season ? String(t.season) : '' });
  }

  return groups;
}
