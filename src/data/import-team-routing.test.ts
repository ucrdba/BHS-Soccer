/**
 * Tests for resolveImportTeam — the function that decides which team an
 * imported row joins.
 *
 * It matters because every failure here is silent and lands in the database:
 * a row routed to the wrong team looks like a coach's data-entry mistake, and
 * a name that should have matched an existing team but didn't creates a
 * duplicate squad that then shows up in the switcher.
 *
 * Loads the real classic scripts rather than reimplementing the logic, the same
 * way matrix-results-panel.test.ts does — there is no second copy to drift.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import adminSrc from '../../public/js/admin.js?raw';

interface ImportApp {
  data: Record<string, any>;
  activeTeamId: string | null;
  resolveImportTeam(name: string | undefined, cache: Map<string, any>, warnings: string[]): Promise<any>;
}

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

let app: ImportApp;
let created: { schoolId: string; name: string }[];
let createTeamReturns: { id?: string } | null;

beforeEach(() => {
  const w = globalThis as any;
  w.auth = {
    isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
    canAccessRatings: () => true, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'admin', status: 'active' }),
    getRole: () => 'admin'
  };
  w.can = () => true;

  created = [];
  createTeamReturns = { id: 'team-new' };
  w.supabaseService = {
    isConfigured: () => false,
    createTeam: async (schoolId: string, name: string) => {
      created.push({ schoolId, name });
      return createTeamReturns;
    }
  };

  const ctor = new Function(
    [strip(appCoreSrc), strip(adminSrc)].join('\n;\n') + '\nreturn BHSSoccerApp;'
  )() as { prototype: ImportApp };

  app = Object.create(ctor.prototype) as ImportApp;
  app.activeTeamId = 't-varsity';
  app.data = {
    teams: [
      { id: 't-varsity', school_id: 's-bhs', name: 'Varsity', school_name: 'Beaumont High School' },
      { id: 't-jv', school_id: 's-bhs', name: 'JV', school_name: 'Beaumont High School' },
      { id: 't-club', school_id: 's-rev', name: 'U16', school_name: 'REV Club' }
    ]
  };
});

describe('resolveImportTeam', () => {
  it('falls back to the active team when the Team column is blank', async () => {
    // Every sheet written before this column existed must keep working.
    const team = await app.resolveImportTeam('', new Map(), []);
    expect(team.id).toBe('t-varsity');
  });

  it('falls back to the active team when the column is absent entirely', async () => {
    const team = await app.resolveImportTeam(undefined, new Map(), []);
    expect(team.id).toBe('t-varsity');
  });

  it('matches an existing team by name', async () => {
    const team = await app.resolveImportTeam('JV', new Map(), []);
    expect(team.id).toBe('t-jv');
    expect(created).toHaveLength(0);
  });

  it('matches case-insensitively, so "varsity" is not a second squad', async () => {
    const team = await app.resolveImportTeam('vArSiTy', new Map(), []);
    expect(team.id).toBe('t-varsity');
    expect(created).toHaveLength(0);
  });

  it('does not match a team in a different organization', async () => {
    // U16 belongs to REV Club; importing while Beaumont is active must not
    // silently file players into another organization's squad.
    const team = await app.resolveImportTeam('U16', new Map(), []);
    expect(team.id).toBe('team-new');
    expect(created).toEqual([{ schoolId: 's-bhs', name: 'U16' }]);
  });

  it('creates a team the sheet names but the database does not have', async () => {
    const warnings: string[] = [];
    const team = await app.resolveImportTeam('Freshman', new Map(), warnings);
    expect(team.id).toBe('team-new');
    expect(created).toEqual([{ schoolId: 's-bhs', name: 'Freshman' }]);
    expect(warnings).toHaveLength(0);
  });

  it('adds a created team to this.data.teams so the switcher sees it', async () => {
    await app.resolveImportTeam('Freshman', new Map(), []);
    expect(app.data.teams.map((t: any) => t.name)).toContain('Freshman');
  });

  it('skips rows with a warning when the team cannot be created', async () => {
    // teams_write is admin-only. A coach must get their rows skipped, not the
    // whole sheet failing and not a silent misfile onto the active team.
    createTeamReturns = null;
    const warnings: string[] = [];
    const team = await app.resolveImportTeam('Freshman', new Map(), warnings);
    expect(team).toBeNull();
    expect(warnings[0]).toContain('Freshman');
    expect(warnings[0]).toContain('admin');
  });

  it('resolves each distinct team once per import', async () => {
    // A 30-row sheet must not make 30 createTeam calls for the same name.
    const cache = new Map();
    await app.resolveImportTeam('Freshman', cache, []);
    await app.resolveImportTeam('Freshman', cache, []);
    await app.resolveImportTeam('freshman', cache, []);
    expect(created).toHaveLength(1);
  });

  it('caches a failure too, so one refusal is not retried per row', async () => {
    createTeamReturns = null;
    const cache = new Map();
    const warnings: string[] = [];
    await app.resolveImportTeam('Freshman', cache, warnings);
    await app.resolveImportTeam('Freshman', cache, warnings);
    expect(created).toHaveLength(1);
    expect(warnings).toHaveLength(1);
  });

  it('returns null when there is no active team to borrow an organization from', async () => {
    app.activeTeamId = null;
    const team = await app.resolveImportTeam('Freshman', new Map(), []);
    expect(team).toBeNull();
  });
});
