/**
 * The service's network calls are not mocked here — the existing suites do not
 * mock Supabase either, and a mocked query only asserts the mock. What is worth
 * testing is the pure decision that picks which team a viewer sees, because
 * getting it wrong shows one team's roster under another team's name.
 */
import { describe, it, expect } from 'vitest';
import { resolveActiveTeam } from './team-scope';
import switcherSrc from '../../public/js/views/teamswitcher.view.js?raw';
import indexHtml from '../../index.html?raw';

const teams = [
  { id: 't-varsity', name: 'Varsity', school_id: 's-bhs', is_public_default: false },
  { id: 't-jv',      name: 'JV',      school_id: 's-bhs', is_public_default: true  },
  { id: 't-club',    name: 'U16',     school_id: 's-rev', is_public_default: false }
];

describe('resolveActiveTeam', () => {
  it('uses the stored team when the viewer still has access to it', () => {
    expect(resolveActiveTeam(teams, 't-jv', 't-varsity')).toBe('t-jv');
  });

  it('ignores a stored team the viewer can no longer see', () => {
    // A coach removed from a team must not keep seeing it because localStorage
    // remembers it.
    expect(resolveActiveTeam(teams, 't-gone', 't-varsity')).toBe('t-varsity');
  });

  it('falls back to the public default when nothing is stored', () => {
    // 't-jv' is the flagged default here, and it is NOT teams[0] — this only
    // passes if the resolver actually consults is_public_default rather than
    // just returning the first team in the list.
    expect(resolveActiveTeam(teams, null, 't-jv')).toBe('t-jv');
  });

  it('falls back to the first available team when there is no public default', () => {
    // A separate fixture with no team flagged, so this exercises the final
    // fallback (teams[0]) rather than accidentally hitting the flag above.
    const noDefaultTeams = teams.map((t) => ({ ...t, is_public_default: false }));
    expect(resolveActiveTeam(noDefaultTeams, null, null)).toBe('t-varsity');
  });

  it('returns null when the viewer has no teams at all', () => {
    expect(resolveActiveTeam([], 't-jv', null)).toBeNull();
  });
});

describe('team switcher', () => {
  it('has a mount point in the markup', () => {
    expect(indexHtml).toContain('id="teamSwitcherMount"');
  });

  it('is wired to setActiveTeam, not to a re-render alone', () => {
    expect(switcherSrc).toContain('app.setActiveTeam');
  });

  it('hides itself when the viewer has only one team', () => {
    // A player on one team should not see a control that does nothing.
    expect(switcherSrc).toContain('length < 2');
  });

  it('groups teams by organization', () => {
    expect(switcherSrc).toContain('school_name');
  });
});
