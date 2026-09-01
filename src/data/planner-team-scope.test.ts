/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';
import appCoreSrc from '../../public/js/app.core.js?raw';
import adminSrc from '../../public/js/admin.js?raw';

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

const svc = supabaseService as any;
const TEAM = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b';

let filters: { table: string; column: string; value: any }[];
let written: Record<string, any>[];

beforeEach(() => {
  filters = [];
  written = [];
  svc.isConfigured = () => true;
  svc._cachedSchoolUuidMap = null;
  svc.client = {
    from(table: string) {
      const api: any = {
        select() { return api; },
        or() { return api; },
        order() { return api; },
        limit() { return api; },
        maybeSingle: async () => ({ data: null, error: null }),
        eq(column: string, value: any) { filters.push({ table, column, value }); return api; },
        update(row: any) { written.push({ table, ...row }); return api; },
        insert(rows: any[]) { rows.forEach(r => written.push({ table, ...r })); return api; },
        upsert(rows: any[]) { rows.forEach(r => written.push({ table, ...r })); return api; },
        then(res: any) { return Promise.resolve({ data: [], error: null }).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

/** The literal that must never reach the database again. */
const sentSchoolCode = () =>
  filters.some(f => f.value === 'bhs') || written.some(w => w.school_id === 'bhs');

describe('planner reads are team-scoped', () => {
  it('filters practice plans by team, not school', async () => {
    await supabaseService.fetchPracticePlans(TEAM);
    expect(filters.some(f => f.table === 'practice_plans' && f.column === 'team_id' && f.value === TEAM)).toBe(true);
    expect(filters.some(f => f.column === 'school_id')).toBe(false);
  });

  it('filters daily thoughts by team', async () => {
    await supabaseService.fetchDailyThoughts(TEAM);
    expect(filters.some(f => f.table === 'daily_thoughts' && f.column === 'team_id' && f.value === TEAM)).toBe(true);
  });

  it('filters the active thought by team', async () => {
    await supabaseService.fetchLatestDailyThoughts(TEAM);
    expect(filters.some(f => f.column === 'team_id' && f.value === TEAM)).toBe(true);
  });

  it('never sends a school CODE where an id belongs', async () => {
    // This is the bug that killed daily thoughts entirely: 'bhs' was passed
    // into a uuid column, every call failed with 22P02, and the page rendered
    // an empty state. Asserting the value that reaches the database is the
    // property that was missing.
    await supabaseService.fetchDailyThoughts('bhs');
    expect(sentSchoolCode()).toBe(false);
  });

  it('returns null without querying when no team is given', async () => {
    // An unscoped query would return every team's plans.
    expect(await supabaseService.fetchPracticePlans('')).toBeNull();
    expect(filters.some(f => f.table === 'practice_plans')).toBe(false);
  });
});

describe('planner writes are team-scoped', () => {
  it('writes team_id on a new thought', async () => {
    await supabaseService.upsertDailyThought(TEAM, { text: 'Press high today.' });
    expect(written.some(w => w.team_id === TEAM)).toBe(true);
    expect(sentSchoolCode()).toBe(false);
  });

  it('clears the previously active thought within the team only', async () => {
    // Scoped to school, this would clear another team's active message.
    await supabaseService.setActiveDailyThought(TEAM, 'thought-1');
    expect(filters.some(f => f.table === 'daily_thoughts' && f.column === 'team_id' && f.value === TEAM)).toBe(true);
  });

  it('refuses to write without a team rather than writing unscoped', async () => {
    const res = await supabaseService.upsertDailyThought('', { text: 'x' });
    expect(res.error).toBeTruthy();
    expect(written.some(w => w.table === 'daily_thoughts')).toBe(false);
  });
});

/**
 * The XLSX/CSV import path for daily thoughts (public/js/admin.js,
 * `activeTarget === 'thoughts'`) calls upsertDailyThought directly, bypassing
 * everything above. It used to pass the literal school code 'bhs'; now that
 * upsertDailyThought refuses a non-uuid team, an unfixed import would reject
 * every row while still reporting its own success/failure counts — the same
 * silent-failure shape this whole task exists to close. These drive the real
 * import path (model: quiz-import-mapping.test.ts) rather than calling
 * admin.js's internals directly, so a regression here would actually be
 * caught by import behavior, not by a test that assumes the wiring is right.
 */
describe('importing daily thoughts is team-scoped', () => {
  let importApp: any;
  let importCsvText: string;
  let importCalls: { teamId: any; thought: any }[];

  const importStatus = () => document.getElementById('importStatus')!.textContent || '';

  const runThoughtsImport = async () => {
    const file = new File([importCsvText], 'thoughts.csv', { type: 'text/csv' });
    await importApp.handleImportFile(file, 'thoughts');

    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const text = importStatus();
      if (text && !text.includes('Reading')) return;
      await new Promise(r => setTimeout(r, 5));
    }
    throw new Error('import did not finish; status stuck at: ' + importStatus());
  };

  beforeEach(() => {
    importCalls = [];
    importCsvText = '';
    document.body.innerHTML = '<div id="importStatus"></div>';

    const w = globalThis as any;
    w.auth = {
      isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
      canAccessRatings: () => true, subscribe: () => {},
      getCurrentUser: () => ({ id: 'u1', role: 'admin', status: 'active' }),
      getRole: () => 'admin'
    };
    w.can = () => true;
    w.supabaseService = {
      isConfigured: () => true,
      upsertDailyThought: async (teamId: any, thought: any) => {
        importCalls.push({ teamId, thought });
        return { data: { id: 'dt_1' } };
      }
    };

    const ctor = new Function(
      [strip(appCoreSrc), strip(adminSrc)].join('\n;\n') + '\nreturn BHSSoccerApp;'
    )() as { prototype: any };

    importApp = Object.create(ctor.prototype);
    importApp.data = {
      dailyThoughts: [], players: [], schedule: [], drillsBank: [],
      matrixLogs: [], teams: [], soccerCategories: []
    };
    importApp.syncFromSupabase = async () => {};
    importApp.renderCurrentView = () => {};
    importApp.saveData = () => {};
    importApp.populateCategoryDropdowns = () => {};
  });

  it('sends the active team id to upsertDailyThought, never a school code', async () => {
    importApp.activeTeamId = TEAM;
    importCsvText = 'ThoughtsText,CoachName\nPress high today.,Coach B\n';
    await runThoughtsImport();

    expect(importCalls).toHaveLength(1);
    expect(importCalls[0].teamId).toBe(TEAM);
    expect(importCalls[0].teamId).not.toBe('bhs');
  });

  it('skips the import and never calls upsertDailyThought when no team is selected', async () => {
    importApp.activeTeamId = null;
    importCsvText = 'ThoughtsText,CoachName\nPress high today.,Coach B\n';
    await runThoughtsImport();

    expect(importCalls).toHaveLength(0);
    expect(importStatus()).toContain('no team is selected');
  });
});
