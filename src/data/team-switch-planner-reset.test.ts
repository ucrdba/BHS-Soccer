/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import appCoreSrc from '../../public/js/app.core.js?raw';
import plannerSrc from '../../public/js/views/planner.view.js?raw';

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
 *
 * Two kinds of state are at stake here and they do NOT clear on the same rule:
 *
 * - `savedPlans` and `dailyThoughts` are database-derived. They are rebuilt
 *   unconditionally from the active team, and emptied when no team resolves.
 * - `currentPracticePlan` / `activePlanName` are the coach's live working plan.
 *   They belong to ONE team, tagged by `tagWorkingPlanTeam()`, and are dropped
 *   only when a DIFFERENT team actually resolves. Clearing them whenever no
 *   team resolved would discard unsaved work on a transient
 *   `fetchTeamsForViewer` failure -- a bad trade, and unnecessary, because
 *   every write path already refuses without a team.
 */

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

const VARSITY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const JV = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

let ctor: any;

beforeAll(() => {
  ctor = new Function(
    [appCoreSrc, plannerSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
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
    fetchTeamQuiz: empty,
    fetchTeamExercisePoints: empty,
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
  // Set by tagWorkingPlanTeam() wherever the working plan gains a database
  // identity -- loadPracticePlan, savePracticePlan, the two add-drill paths.
  app._workingPlanTeamId = VARSITY;
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
    expect(app._workingPlanTeamId).toBeNull();
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
  it('clears the database-derived collections, like the roster and schedule beside them', async () => {
    const app = makeApp();
    (window as any).supabaseService = makeService({ fetchTeamsForViewer: async () => [] });

    await app.syncFromSupabase();

    expectCleanSync();
    expect(app.activeTeamId).toBeNull();
    expect(app.data.savedPlans).toEqual([]);
    expect(app.data.dailyThoughts).toEqual([]);
  });
});

/**
 * The working plan is not database-derived -- it is what the coach is typing
 * into right now. It belongs to ONE team (tagged by tagWorkingPlanTeam), and
 * that tag, not the presence or absence of a resolved team, is what decides
 * whether it survives a sync.
 */
describe('the working practice plan across a re-sync', () => {
  it('survives a transient fetchTeamsForViewer failure that resolves no team', async () => {
    // The !hasTeam branch is reached on a network blip, not only by a genuinely
    // teamless viewer. Discarding unsaved work over a dropped packet is a bad
    // trade -- and nothing can be corrupted meanwhile, because every write path
    // already refuses without a team.
    const app = makeApp();
    (window as any).supabaseService = makeService({ fetchTeamsForViewer: async () => [] });

    await app.syncFromSupabase();

    expectCleanSync();
    expect(app.activeTeamId).toBeNull();
    expect(app.data.currentPracticePlan).toHaveLength(1);
    expect(app.data.activePlanName).toBe('Standard 90');
    expect(app._workingPlanTeamId).toBe(VARSITY);
  });

  it('is discarded when a DIFFERENT team resolves without setActiveTeam running', async () => {
    // One user signs out and another signs in on the same device: the auth
    // subscriber re-syncs and resolveActiveTeam lands on another team, with no
    // setActiveTeam call anywhere in the path. Same corruption, different route.
    const app = makeApp();
    (window as any).supabaseService = makeService();
    localStorage.setItem('bhs_active_team_id', JV);

    await app.syncFromSupabase();

    expectCleanSync();
    expect(app.activeTeamId).toBe(JV);
    expect(app.data.currentPracticePlan).toEqual([]);
    expect(app.data.activePlanName).toBe('');
    expect(app._workingPlanTeamId).toBeNull();
  });

  it('is left alone by a re-sync onto the SAME team', async () => {
    // syncFromSupabase runs on boot and on every auth change (TOKEN_REFRESHED,
    // and SIGNED_IN when a tab regains visibility). None of those invalidate
    // the plan the coach is building.
    const app = makeApp();
    (window as any).supabaseService = makeService();
    localStorage.setItem('bhs_active_team_id', VARSITY);

    await app.syncFromSupabase();

    expectCleanSync();
    expect(app.activeTeamId).toBe(VARSITY);
    expect(app.data.currentPracticePlan).toHaveLength(1);
    expect(app.data.activePlanName).toBe('Standard 90');
    expect(app._workingPlanTeamId).toBe(VARSITY);
  });

  it('is left alone when it was never tagged, having no database identity to move', async () => {
    // Drills added while no team was selected were never written, so they carry
    // no row ids and there is nothing to corrupt.
    const app = makeApp();
    app._workingPlanTeamId = null;
    (window as any).supabaseService = makeService();
    localStorage.setItem('bhs_active_team_id', JV);

    await app.syncFromSupabase();

    expectCleanSync();
    expect(app.activeTeamId).toBe(JV);
    expect(app.data.currentPracticePlan).toHaveLength(1);
  });
});

/**
 * Nothing above works unless the tag is actually set where the plan gains a
 * database identity. loadPracticePlan is the site the corruption ran through:
 * it copies plan.drills -- practice_plans row ids and all -- into
 * currentPracticePlan.
 */
describe('tagging the working plan with its team', () => {
  it('loadPracticePlan records the team the plan came from', () => {
    const app = Object.create(ctor.prototype) as any;
    app.activeTeamId = VARSITY;
    app.data = {
      savedPlans: [{
        id: 'plan_db_standard_90', name: 'Standard 90', date: 'AUG 1, 2026',
        drills: [{ id: 'varsity-row-1', time: '4:00 PM', name: 'Dynamic Warmup', duration: '15 min' }]
      }],
      currentPracticePlan: [], activePlanName: ''
    };
    app.saveData = () => {};
    app.renderCurrentView = () => {};
    app.closeModals = () => {};
    // The real modal is a confirm step; run its callback straight through.
    app.showConfirmModal = (opts: any) => opts.onConfirm();

    app.loadPracticePlan('plan_db_standard_90');

    expect(app.data.currentPracticePlan[0].id).toBe('varsity-row-1');
    expect(app.data.activePlanName).toBe('Standard 90');
    expect(app._workingPlanTeamId).toBe(VARSITY);
  });

  it('leaves the plan untagged when no team is active, since nothing was written', () => {
    const app = Object.create(ctor.prototype) as any;
    app.activeTeamId = null;
    app.data = { savedPlans: [], currentPracticePlan: [], activePlanName: '' };
    app.tagWorkingPlanTeam();
    expect(app._workingPlanTeamId).toBeNull();
  });
});
