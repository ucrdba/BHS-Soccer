/**
 * Tests for the team-management panel.
 *
 * The failure that matters here is offering a control the database will refuse:
 * teams_write and team_coaches_write are admin-only by RLS, so rendering these
 * controls to a coach produces buttons that always fail. The other is a team
 * with no coach — nobody can edit its roster, and that has to be visible rather
 * than inferred from an empty space.
 *
 * Loads the real classic scripts rather than reimplementing, as
 * matrix-results-panel.test.ts does.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import adminSrc from '../../public/js/admin.js?raw';

interface AdminApp {
  data: Record<string, any>;
  _allTeams: any[];
  _teamCoaches: any[];
  _assignableCoaches: any[];
  renderTeamAdminSection(): string;
}

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

let app: AdminApp;
let isAdmin: boolean;

beforeEach(() => {
  isAdmin = true;
  const w = globalThis as any;
  w.auth = {
    isCoach: () => true, isAdmin: () => isAdmin, isLoggedIn: () => true,
    canAccessRatings: () => true, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: isAdmin ? 'admin' : 'coach', status: 'active' }),
    getRole: () => (isAdmin ? 'admin' : 'coach')
  };
  w.can = () => true;
  w.supabaseService = { isConfigured: () => false };

  const ctor = new Function(
    [strip(appCoreSrc), strip(adminSrc)].join('\n;\n') + '\nreturn BHSSoccerApp;'
  )() as { prototype: AdminApp };

  app = Object.create(ctor.prototype) as AdminApp;
  app.data = { schools: [{ id: 's-bhs', name: 'Beaumont High School' }] };
  app._allTeams = [
    { id: 't-varsity', school_id: 's-bhs', name: 'Varsity', season: '2026', is_public_default: true, school_name: 'Beaumont High School' },
    { id: 't-jv', school_id: 's-bhs', name: 'JV', season: '2026', is_public_default: false, school_name: 'Beaumont High School' },
    { id: 't-u16', school_id: 's-rev', name: 'U16 Boys', season: '2026', is_public_default: false, school_name: 'REV Club' }
  ];
  app._teamCoaches = [
    { team_id: 't-varsity', profile_id: 'p-bob', name: 'Coach Bob', role: 'admin', status: 'active' }
  ];
  app._assignableCoaches = [
    { id: 'p-bob', name: 'Coach Bob', role: 'admin' },
    { id: 'p-dean', name: 'Dean Whitaker', role: 'coach' }
  ];
});

describe('renderTeamAdminSection', () => {
  it('renders nothing for a non-admin', () => {
    // Both writes behind this panel are admin-only by RLS. Showing it to a
    // coach would offer buttons the database refuses every time.
    isAdmin = false;
    expect(app.renderTeamAdminSection()).toBe('');
  });

  it('lists every team, including ones the admin does not coach', () => {
    const html = app.renderTeamAdminSection();
    expect(html).toContain('Varsity');
    expect(html).toContain('JV');
    expect(html).toContain('U16 Boys');
  });

  it('groups teams by organization', () => {
    const html = app.renderTeamAdminSection();
    const bhsAt = html.indexOf('Beaumont High School');
    const revAt = html.indexOf('REV Club');
    expect(bhsAt).toBeGreaterThan(-1);
    expect(revAt).toBeGreaterThan(-1);
    // JV belongs to Beaumont, so it must appear before the REV Club heading.
    expect(html.indexOf('JV')).toBeLessThan(revAt);
  });

  it('says plainly when a team has no coach', () => {
    // An empty space would read as "loading". A team nobody can edit is a
    // state an admin needs to see.
    const html = app.renderTeamAdminSection();
    const jvBlock = html.slice(html.indexOf('>JV'), html.indexOf('REV Club'));
    expect(jvBlock).toContain('No coaches assigned');
  });

  it('shows an assigned coach against their team', () => {
    const html = app.renderTeamAdminSection();
    const varsityBlock = html.slice(html.indexOf('>Varsity'), html.indexOf('>JV'));
    expect(varsityBlock).toContain('Coach Bob');
  });

  it('omits already-assigned coaches from that team\'s dropdown', () => {
    // Offering Bob for a team he already coaches invites a no-op that looks
    // like a failure.
    const html = app.renderTeamAdminSection();
    const varsitySelect = html.slice(
      html.indexOf('id="assignCoach_t-varsity"'),
      html.indexOf('</select>', html.indexOf('id="assignCoach_t-varsity"'))
    );
    expect(varsitySelect).not.toContain('Coach Bob');
    expect(varsitySelect).toContain('Dean Whitaker');
  });

  it('offers every assignable coach for a team with none', () => {
    const html = app.renderTeamAdminSection();
    const jvSelect = html.slice(
      html.indexOf('id="assignCoach_t-jv"'),
      html.indexOf('</select>', html.indexOf('id="assignCoach_t-jv"'))
    );
    expect(jvSelect).toContain('Coach Bob');
    expect(jvSelect).toContain('Dean Whitaker');
  });

  it('wires assign and remove to the right team and coach', () => {
    const html = app.renderTeamAdminSection();
    expect(html).toContain("app.assignCoachToTeam('t-jv')");
    expect(html).toContain("app.removeCoachFromTeam('t-varsity','p-bob')");
  });

  it('offers a create form with the organizations to choose from', () => {
    const html = app.renderTeamAdminSection();
    expect(html).toContain('id="newTeamOrg"');
    expect(html).toContain('id="newTeamName"');
    expect(html).toContain('app.createTeamFromAdmin()');
  });

  it('handles having no teams at all without breaking', () => {
    app._allTeams = [];
    app._teamCoaches = [];
    const html = app.renderTeamAdminSection();
    expect(html).toContain('No teams yet');
    // The create form must still render, or there is no way out of that state.
    expect(html).toContain('app.createTeamFromAdmin()');
  });
});
