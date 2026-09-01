/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import appCoreSrc from '../../public/js/app.core.js?raw';

/**
 * Switching teams must not leave the previous team's planner state behind.
 *
 * `syncFromSupabase` used to guard both assignments on `length > 0`, and to
 * MERGE plans into `this.data.savedPlans` rather than rebuild it. After 0014
 * every team but Varsity has zero plan rows and `daily_thoughts` is empty by
 * construction, so the first switch out of Varsity showed Varsity's plans in
 * the picker and Varsity's coaching message on the other team's home page.
 *
 * It is worse than a stale display: loading a leaked plan copies Varsity's
 * practice_plans row ids into `currentPracticePlan`, and the next drill edit
 * upserts on those ids with the NEW team_id -- moving Varsity's rows onto JV.
 *
 * The same trap was already fixed for `schedule` (see the comment beside the
 * schedule assignment in app.core.js); its coverage was source-text greps that
 * pass whatever the code does. These tests execute the real classic script and
 * assert the state a coach is left holding. Mutation check: restore
 * `if (dbPlans && dbPlans.length > 0)` / `if (dbThoughts && dbThoughts.length > 0)`
 * and the first three tests below must fail.
 */

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

const VARSITY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const JV = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

let ctor: any;

beforeAll(() => {
  ctor = new Function(strip(appCoreSrc) + '\nreturn BHSSoccerApp;')();
});

/** Every fetch syncFromSupabase makes, all empty unless overridden. */
function makeService(over: Record<string, any> = {}) {
  const empty = async () => [];
  return {
    isConfigured: () => true,
    fetchTeamsForViewer: async () => ([
      { id: VARSITY, name: 'Varsity', school_id: 's-bhs', is_public_default: true },
      { id: JV, name: 'JV', school_id: 's-bhs' }
    ]),
    fetchSchool: async () => null,
    fetchSchools: empty,
    fetchDrillsBank: empty,
    fetchTeamRoster: empty,
    fetchMatrixStandings: empty,
    fetchMatrixLogs: empty,
    fetchMatrixSessions: empty,
    fetchSchedule: empty,
    fetchPracticePlans: empty,
    fetchDailyThoughts: empty,
    fetchCoaches: empty,
    fetchSoccerCategories: empty,
    ...over
  };
}

/** A coach sitting on Varsity with a saved plan, a loaded plan and a message. */
function makeApp() {
  const app = Object.create(ctor.prototype) as any;
  app.activeTeamId = VARSITY;
  app.data = {
    school: { code: 'bhs' },
    schools: [], teams: [], players: [], schedule: [], drillsBank: [],
    matrixLogs: [], coaches: [], soccerCategories: [],
    savedPlans: [{
      id: 'plan_db_standard_90', name: 'Standard 90', date: 'AUG 1, 2026',
      // Varsity's real practice_plans primary keys -- the payload that gets
      // upserted under the new team_id if this survives a switch.
      drills: [{ id: 'varsity-row-1', time: '4:00 PM', name: 'Dynamic Warmup', duration: '15 min' }]
    }],
    currentPracticePlan: [{ id: 'varsity-row-1', time: '4:00 PM', name: 'Dynamic Warmup', duration: '15 min' }],
    activePlanName: 'Standard 90',
    dailyThoughts: [{ id: 'varsity-thought-1', text: 'Press high today.', isActive: true }]
  };
  app.saveData = () => {};
  app.updateHeaderBranding = () => {};
  app.populateCategoryDropdowns = () => {};
  app.renderCurrentView = vi.fn();
  return app;
}

let warned: any[][];

beforeEach(() => {
  warned = [];
  localStorage.clear();
  (window as any).resolveActiveTeam = (_teams: any[], stored: string | null, def: string | null) =>
    stored || def;
  vi.spyOn(console, 'warn').mockImplementation((...a: any[]) => { warned.push(a); });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

/**
 * syncFromSupabase swallows every throw into a console.warn, so a test that
 * only asserted "state is empty" would also pass if the sync died before it
 * reached the planner at all. Assert it ran clean.
 */
const expectCleanSync = () =>
  expect(warned.filter(a => String(a[0]).includes('Supabase data sync notice'))).toEqual([]);

describe('switching to a team that has no plans or messages', () => {
  it('empties savedPlans instead of keeping the previous team\'s', async () => {
    const app = makeApp();
    (window as any).supabaseService = makeService();
    localStorage.setItem('bhs_active_team_id', JV);

    await app.syncFromSupabase();

    expectCleanSync();
    expect(app.activeTeamId).toBe(JV);
    expect(app.data.savedPlans).toEqual([]);
  });

  it('empties dailyThoughts instead of showing the previous team\'s message', async () => {
    const app = makeApp();
    (window as any).supabaseService = makeService();
    localStorage.setItem('bhs_active_team_id', JV);

    await app.syncFromSupabase();

    expectCleanSync();
    expect(app.data.dailyThoughts).toEqual([]);
  });

  it('rebuilds savedPlans from the new team rather than merging into the old list', async () => {
    // The merge kept every plan it had ever seen, keyed by name, so Varsity's
    // plan stayed in JV's picker alongside JV's own.
    const app = makeApp();
    (window as any).supabaseService = makeService({
      fetchPracticePlans: async (teamId: string) => (teamId === JV ? [{
        id: 'jv-row-1', name: 'JV Session', time_slot: '3:30 PM', duration: '20 min',
        drill: 'Rondo', coach_notes: '', created_at: '2026-08-01T00:00:00Z'
      }] : [])
    });
    localStorage.setItem('bhs_active_team_id', JV);

    await app.syncFromSupabase();

    expectCleanSync();
    expect(app.data.savedPlans.map((p: any) => p.name)).toEqual(['JV Session']);
    expect(app.data.savedPlans.flatMap((p: any) => p.drills.map((d: any) => d.id)))
      .not.toContain('varsity-row-1');
  });
});

describe('setActiveTeam', () => {
  it('drops the loaded plan, so no Varsity row id can be upserted under JV', async () => {
    // planner.view.js copies plan.drills (database row ids and all) into
    // currentPracticePlan on load, and every later drill edit upserts on those
    // ids with the CURRENT activeTeamId.
    const app = makeApp();
    (window as any).supabaseService = makeService();

    await app.setActiveTeam(JV);

    expectCleanSync();
    expect(app.activeTeamId).toBe(JV);
    expect(app.data.currentPracticePlan).toEqual([]);
    expect(app.data.activePlanName).toBe('');
    expect(app.data.savedPlans).toEqual([]);
    expect(app.data.dailyThoughts).toEqual([]);
    expect(app.renderCurrentView).toHaveBeenCalled();
  });

  it('leaves the working plan alone when the team did not actually change', async () => {
    // Re-syncs also happen on boot and on token refresh; wiping an in-progress
    // plan there would lose a coach's unsaved work.
    const app = makeApp();
    (window as any).supabaseService = makeService();

    await app.setActiveTeam(VARSITY);

    expect(app.data.currentPracticePlan).toHaveLength(1);
    expect(app.data.activePlanName).toBe('Standard 90');
  });
});

describe('a viewer resolved to no team at all', () => {
  it('clears all four planner collections, like the roster and schedule beside them', async () => {
    const app = makeApp();
    (window as any).supabaseService = makeService({ fetchTeamsForViewer: async () => [] });

    await app.syncFromSupabase();

    expectCleanSync();
    expect(app.activeTeamId).toBeNull();
    expect(app.data.savedPlans).toEqual([]);
    expect(app.data.currentPracticePlan).toEqual([]);
    expect(app.data.activePlanName).toBe('');
    expect(app.data.dailyThoughts).toEqual([]);
  });
});
