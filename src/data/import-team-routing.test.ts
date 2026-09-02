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

type TeamChoice =
  | { action: 'existing'; teamId: string }
  | { action: 'create' }
  | { action: 'skip' };

interface ImportApp {
  data: Record<string, any>;
  activeTeamId: string | null;
  resolveImportTeam(name: string | undefined, cache: Map<string, any>, warnings: string[]): Promise<any>;
  prepareImportTeams(rows: any[], cache: Map<string, any>, warnings: string[]): Promise<boolean>;
  askImportTeamChoices(unknowns: { name: string; rows: number }[], active: any): Promise<Map<string, TeamChoice> | null>;
  importableTeams(active: any): any[];
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
    expect(team).toBeNull();
  });

  it('never invents a squad on its own', async () => {
    // The defect this replaced: an unmatched name was CREATED as the row was
    // written. A JV sheet saying "Jr Varsity" made a second squad, moved 25
    // players onto it, left the real JV empty, and called that success.
    const warnings: string[] = [];
    const team = await app.resolveImportTeam('Jr Varsity', new Map(), warnings);
    expect(team).toBeNull();
    expect(created).toHaveLength(0);
    expect(warnings[0]).toContain('Jr Varsity');
  });

  it('resolves each distinct team once per import', async () => {
    // A 30-row sheet must not re-resolve the same name 30 times.
    const cache = new Map();
    const warnings: string[] = [];
    await app.resolveImportTeam('Freshman', cache, warnings);
    await app.resolveImportTeam('Freshman', cache, warnings);
    await app.resolveImportTeam('freshman', cache, warnings);
    expect(warnings).toHaveLength(1);
  });

  it('reads a decision the pre-flight already made', async () => {
    // prepareImportTeams fills the same cache, which is how the write loop
    // resolves every row without asking anything.
    const cache = new Map([['jr varsity', { id: 't-jv', school_id: 's-bhs', name: 'JV' }]]);
    const team = await app.resolveImportTeam('Jr Varsity', cache, []);
    expect(team.id).toBe('t-jv');
  });

  it('returns null when there is no active team to borrow an organization from', async () => {
    app.activeTeamId = null;
    const team = await app.resolveImportTeam('Freshman', new Map(), []);
    expect(team).toBeNull();
  });
});

describe('prepareImportTeams', () => {
  const rows = (...names: (string | undefined)[]) => names.map(n => ({ importTeamName: n }));

  /** Answer the dialog without a browser. */
  function answer(app: ImportApp, reply: Map<string, TeamChoice> | null) {
    const asked: { name: string; rows: number }[][] = [];
    app.askImportTeamChoices = async (unknowns) => { asked.push(unknowns); return reply; };
    return asked;
  }

  it('asks nothing when every name in the sheet already matches', async () => {
    const asked = answer(app, null);
    const cache = new Map();
    const ok = await app.prepareImportTeams(rows('JV', 'Varsity', 'jv'), cache, []);
    expect(ok).toBe(true);
    expect(asked).toHaveLength(0);
  });

  it('asks nothing when the Team column is blank throughout', async () => {
    const asked = answer(app, null);
    const ok = await app.prepareImportTeams(rows('', undefined, ''), new Map(), []);
    expect(ok).toBe(true);
    expect(asked).toHaveLength(0);
  });

  it('asks about a name the organization does not have', async () => {
    const asked = answer(app, new Map([['jr varsity', { action: 'skip' } as TeamChoice]]));
    await app.prepareImportTeams(rows('Jr Varsity'), new Map(), []);
    expect(asked[0].map(u => u.name)).toEqual(['Jr Varsity']);
  });

  it('counts how many rows ride on each unmatched name', async () => {
    // 26 rows going to the wrong squad is a different decision from 1.
    const asked = answer(app, new Map([['jr varsity', { action: 'skip' } as TeamChoice]]));
    await app.prepareImportTeams(rows('Jr Varsity', 'Jr Varsity', 'jr varsity'), new Map(), []);
    expect(asked[0][0].rows).toBe(3);
  });

  it('shows the spelling the sheet used, not a lowercased one', async () => {
    const asked = answer(app, new Map([['jr varsity', { action: 'skip' } as TeamChoice]]));
    await app.prepareImportTeams(rows('Jr Varsity'), new Map(), []);
    expect(asked[0][0].name).toBe('Jr Varsity');
  });

  it('asks once per distinct name, however many rows use it', async () => {
    const asked = answer(app, new Map([['jr varsity', { action: 'skip' } as TeamChoice]]));
    await app.prepareImportTeams(rows('Jr Varsity', 'Jr Varsity'), new Map(), []);
    expect(asked).toHaveLength(1);
  });

  it('routes the rows to the existing squad the coach picks', async () => {
    // The whole point: "Jr Varsity" in the sheet means the JV squad.
    answer(app, new Map([['jr varsity', { action: 'existing', teamId: 't-jv' }]]));
    const cache = new Map();
    await app.prepareImportTeams(rows('Jr Varsity'), cache, []);
    expect(cache.get('jr varsity').id).toBe('t-jv');
  });

  it('creates the named squad when that is what the coach chose', async () => {
    answer(app, new Map([['freshman', { action: 'create' }]]));
    const cache = new Map();
    await app.prepareImportTeams(rows('Freshman'), cache, []);
    expect(created).toEqual([{ schoolId: 's-bhs', name: 'Freshman' }]);
    expect(cache.get('freshman').id).toBe('team-new');
  });

  it('adds a created squad to this.data.teams so the switcher sees it', async () => {
    answer(app, new Map([['freshman', { action: 'create' }]]));
    await app.prepareImportTeams(rows('Freshman'), new Map(), []);
    expect(app.data.teams.map((t: any) => t.name)).toContain('Freshman');
  });

  it('skips the rows with a warning when the coach says skip', async () => {
    answer(app, new Map([['jr varsity', { action: 'skip' }]]));
    const cache = new Map();
    const warnings: string[] = [];
    await app.prepareImportTeams(rows('Jr Varsity'), cache, warnings);
    expect(cache.get('jr varsity')).toBeNull();
    expect(warnings[0]).toContain('Jr Varsity');
  });

  it('says so when a chosen creation is refused for lack of admin', async () => {
    createTeamReturns = null;
    answer(app, new Map([['freshman', { action: 'create' }]]));
    const warnings: string[] = [];
    await app.prepareImportTeams(rows('Freshman'), new Map(), warnings);
    expect(warnings[0]).toContain('admin');
  });

  it('abandons the sheet when the coach cancels', async () => {
    // Cancel must mean nothing is written, not "carry on without those rows".
    answer(app, null);
    const ok = await app.prepareImportTeams(rows('Jr Varsity'), new Map(), []);
    expect(ok).toBe(false);
    expect(created).toHaveLength(0);
  });

  it('records where redirected rows actually went', async () => {
    // The coach chose JV; the report should say so rather than stay silent.
    answer(app, new Map([['jr varsity', { action: 'existing', teamId: 't-jv' }]]));
    const warnings: string[] = [];
    await app.prepareImportTeams(rows('Jr Varsity'), warnings.length ? new Map() : new Map(), warnings);
    expect(warnings[0]).toContain('JV');
  });
});

describe('importableTeams', () => {
  it('offers this organization\'s teams only, never another club\'s', async () => {
    const active = app.data.teams.find((t: any) => t.id === 't-varsity');
    expect(app.importableTeams(active).map((t: any) => t.name)).toEqual(['JV', 'Varsity']);
  });

  it('leaves out a retired team, which is not somewhere to import into', async () => {
    app.data.teams.push({ id: 't-old', school_id: 's-bhs', name: 'Old Squad', is_deleted: true });
    const active = app.data.teams.find((t: any) => t.id === 't-varsity');
    expect(app.importableTeams(active).map((t: any) => t.name)).not.toContain('Old Squad');
  });
});

describe('the team-routing dialog', () => {
  const active = { id: 't-varsity', school_id: 's-bhs', name: 'Varsity', school_name: 'Beaumont High School' };

  beforeEach(() => {
    document.body.innerHTML =
      '<div id="importTeamResolveModal"><div id="importTeamResolveBody"></div>' +
      '<p id="importTeamResolveError"></p></div>';
  });

  it('offers every existing squad, plus create and skip', async () => {
    app.askImportTeamChoices([{ name: 'Jr Varsity', rows: 26 }], active);
    const opts = Array.from(document.querySelectorAll('#importTeamChoice0 option'))
      .map(o => (o as HTMLOptionElement).value);
    expect(opts).toEqual(['', 'existing:t-jv', 'existing:t-varsity', 'create', 'skip']);
  });

  it('shows how many rows ride on the decision', async () => {
    app.askImportTeamChoices([{ name: 'Jr Varsity', rows: 26 }], active);
    expect(document.getElementById('importTeamResolveBody')!.textContent).toContain('26 rows');
  });

  it('does not offer another club\'s squad', async () => {
    app.askImportTeamChoices([{ name: 'Jr Varsity', rows: 1 }], active);
    expect(document.getElementById('importTeamResolveBody')!.innerHTML).not.toContain('U16');
  });

  it('refuses to continue while a name is undecided', async () => {
    // Guessing is exactly what produced the parallel squad. An unanswered row
    // must block, not quietly default to anything.
    const pending = app.askImportTeamChoices([{ name: 'Jr Varsity', rows: 26 }], active);
    let settled = false;
    pending.then(() => { settled = true; });

    (app as any).confirmImportTeamChoices();
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(document.getElementById('importTeamResolveError')!.textContent).toContain('Jr Varsity');
  });

  it('hands back the choice once one is made', async () => {
    const pending = app.askImportTeamChoices([{ name: 'Jr Varsity', rows: 26 }], active);
    (document.getElementById('importTeamChoice0') as HTMLSelectElement).value = 'existing:t-jv';
    (app as any).confirmImportTeamChoices();

    expect(await pending).toEqual(new Map([['jr varsity', { action: 'existing', teamId: 't-jv' }]]));
  });

  it('hands back null when cancelled, which abandons the sheet', async () => {
    const pending = app.askImportTeamChoices([{ name: 'Jr Varsity', rows: 26 }], active);
    (app as any).cancelImportTeamChoices();
    expect(await pending).toBeNull();
  });

  it('keeps each name separate when a sheet names several', async () => {
    const pending = app.askImportTeamChoices(
      [{ name: 'Jr Varsity', rows: 26 }, { name: 'Freshman', rows: 4 }], active);
    (document.getElementById('importTeamChoice0') as HTMLSelectElement).value = 'existing:t-jv';
    (document.getElementById('importTeamChoice1') as HTMLSelectElement).value = 'create';
    (app as any).confirmImportTeamChoices();

    expect(await pending).toEqual(new Map<string, any>([
      ['jr varsity', { action: 'existing', teamId: 't-jv' }],
      ['freshman', { action: 'create' }]
    ]));
  });
});
