/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

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
