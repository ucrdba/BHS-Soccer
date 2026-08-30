/**
 * The service's network calls are not mocked here — the existing suites do not
 * mock Supabase either, and a mocked query only asserts the mock. What is worth
 * testing is the pure decision that picks which team a viewer sees, because
 * getting it wrong shows one team's roster under another team's name.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { resolveActiveTeam } from './team-scope';
import appCoreSrc from '../../public/js/app.core.js?raw';
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

interface SwitcherApp {
  data: { teams: any[] };
  activeTeamId: string | null;
  renderTeamSwitcher(): string;
}

let switcherApp: SwitcherApp;

beforeAll(() => {
  // Same technique as matrix-results-panel.test.ts: load the real classic
  // scripts from public/js rather than reimplementing their logic, so there
  // is no second copy of the gating/grouping logic to drift out of sync.
  // The constructor is never invoked (Object.create, not `new`), so app.core.js's
  // constructor-time dependency on SoccerTacticalBoard never needs to resolve.
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  const sources = [appCoreSrc, switcherSrc];
  const ctor = new Function(sources.map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;')();
  switcherApp = Object.create(ctor.prototype) as SwitcherApp;
});

const team = (over: Record<string, any>) => ({
  id: 't-1', name: 'Varsity', season: null, school_id: 's-bhs',
  school_name: 'Beaumont High School', school_kind: 'high_school',
  is_public_default: false, ...over
});

describe('team switcher', () => {
  it('has a mount point in the markup', () => {
    expect(indexHtml).toContain('id="teamSwitcherMount"');
  });

  it('is wired to setActiveTeam, not to a re-render alone', () => {
    expect(switcherSrc).toContain('app.setActiveTeam');
  });

  it('renders both teams, marking the active one selected, with two or more teams', () => {
    switcherApp.data = {
      teams: [
        team({ id: 't-varsity', name: 'Varsity' }),
        team({ id: 't-jv', name: 'JV' })
      ]
    };
    switcherApp.activeTeamId = 't-jv';
    const html = switcherApp.renderTeamSwitcher();
    expect(html).toContain('Varsity');
    expect(html).toContain('JV');
    // The active team's <option> carries `selected`; the other does not.
    const jvOption = html.slice(html.indexOf('value="t-jv"'), html.indexOf('value="t-jv"') + 60);
    expect(jvOption).toContain('selected');
    const varsityOption = html.slice(html.indexOf('value="t-varsity"'), html.indexOf('value="t-varsity"') + 60);
    expect(varsityOption).not.toContain('selected');
  });

  it('renders nothing for a viewer with exactly one team', () => {
    // A player on one team should never see a dead control.
    switcherApp.data = { teams: [team({ id: 't-varsity', name: 'Varsity' })] };
    switcherApp.activeTeamId = 't-varsity';
    expect(switcherApp.renderTeamSwitcher()).toBe('');
  });

  it('groups teams from two organizations under separate optgroups', () => {
    switcherApp.data = {
      teams: [
        team({ id: 't-varsity', name: 'Varsity', school_id: 's-bhs', school_name: 'Beaumont High School' }),
        team({ id: 't-club', name: 'U16', school_id: 's-rev', school_name: 'Revolution FC' })
      ]
    };
    switcherApp.activeTeamId = 't-varsity';
    const html = switcherApp.renderTeamSwitcher();
    expect(html).toContain('<optgroup label="Beaumont High School">');
    expect(html).toContain('<optgroup label="Revolution FC">');
    // Each team nests under its own org's optgroup, not the other's.
    const bhsGroup = html.slice(html.indexOf('<optgroup label="Beaumont High School">'), html.indexOf('</optgroup>', html.indexOf('<optgroup label="Beaumont High School">')));
    const revGroup = html.slice(html.indexOf('<optgroup label="Revolution FC">'), html.indexOf('</optgroup>', html.indexOf('<optgroup label="Revolution FC">')));
    expect(bhsGroup).toContain('Varsity');
    expect(bhsGroup).not.toContain('U16');
    expect(revGroup).toContain('U16');
    expect(revGroup).not.toContain('Varsity');
  });
});
