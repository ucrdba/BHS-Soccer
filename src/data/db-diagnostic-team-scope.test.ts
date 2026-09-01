/**
 * Task 6 / addendum Ruling B: migration 0015 drops school_id from
 * practice_plans and daily_thoughts, and both tables are team-scoped by RLS
 * (is_team_coach(team_id)) since migration 0014. runFullDatabaseDiagnostic's
 * two payloads for those tables used to send school_id and no team_id at
 * all -- after 0015 that insert fails outright ("column does not exist"),
 * and even before 0015 it reads as a false FAILED for a plain coach, since
 * is_team_coach(null) only returns true for an admin.
 *
 * These tests execute the real SupabaseService method against a recording
 * fake client and assert the payload that would reach the database, not
 * merely that the call resolved -- same house style as planner-copy.test.ts
 * and thoughts-save.test.ts.
 */
/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;
const TEAM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

let inserted: Record<string, any>[];

function makeClient() {
  inserted = [];
  return {
    from(table: string) {
      const api: any = {
        select() { return api; },
        or() { return api; },
        order() { return api; },
        limit() { return api; },
        eq() { return api; },
        delete() { return api; },
        maybeSingle: async () => ({ data: null, error: null }),
        insert(rows: any[]) {
          rows.forEach(r => inserted.push({ table, ...r }));
          api._result = rows.map(r => ({ ...r, id: r.id || `gen_${table}` }));
          return api;
        },
        upsert(rows: any[]) {
          rows.forEach(r => inserted.push({ table, ...r }));
          api._result = rows.map(r => ({ ...r, id: r.id || `gen_${table}`, code: r.code }));
          return api;
        },
        then(res: any) {
          return Promise.resolve({ data: api._result || [], error: null }).then(res);
        }
      };
      return api;
    }
  };
}

beforeEach(() => {
  svc.isConfigured = () => true;
  svc._cachedSchoolUuidMap = null;
  svc.client = makeClient();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('runFullDatabaseDiagnostic — team-scoped planner tables', () => {
  it('with a valid team: sends team_id and no school_id key on both payloads', async () => {
    const res = await supabaseService.runFullDatabaseDiagnostic(TEAM);

    const planRows = inserted.filter(r => r.table === 'practice_plans');
    const thoughtRows = inserted.filter(r => r.table === 'daily_thoughts');
    expect(planRows).toHaveLength(1);
    expect(thoughtRows).toHaveLength(1);

    expect(planRows[0].team_id).toBe(TEAM);
    expect('school_id' in planRows[0]).toBe(false);

    expect(thoughtRows[0].team_id).toBe(TEAM);
    expect('school_id' in thoughtRows[0]).toBe(false);

    const planResult = res.tableResults.find((r: any) => r.table === 'practice_plans');
    const thoughtResult = res.tableResults.find((r: any) => r.table === 'daily_thoughts');
    expect(planResult.insertStatus).toBe('PASSED');
    expect(thoughtResult.insertStatus).toBe('PASSED');
  });

  it('with no team: neither insert is attempted, and neither table is reported FAILED', async () => {
    const res = await supabaseService.runFullDatabaseDiagnostic(undefined);

    expect(inserted.filter(r => r.table === 'practice_plans')).toHaveLength(0);
    expect(inserted.filter(r => r.table === 'daily_thoughts')).toHaveLength(0);

    const planResult = res.tableResults.find((r: any) => r.table === 'practice_plans');
    const thoughtResult = res.tableResults.find((r: any) => r.table === 'daily_thoughts');
    expect(planResult.insertStatus).toBe('N/A');
    expect(thoughtResult.insertStatus).toBe('N/A');
    expect(planResult.insertStatus).not.toBe('FAILED');
    expect(thoughtResult.insertStatus).not.toBe('FAILED');
    expect(String(planResult.responseDetails)).toMatch(/team/i);
    expect(String(thoughtResult.responseDetails)).toMatch(/team/i);

    // N/A must not sink the overall result -- allPassed treats it as a pass.
    expect(res.success).toBe(true);
  });

  it('with a non-uuid team (a stale school code, say): treated the same as no team', async () => {
    const res = await supabaseService.runFullDatabaseDiagnostic('bhs');

    expect(inserted.filter(r => r.table === 'practice_plans')).toHaveLength(0);
    expect(inserted.filter(r => r.table === 'daily_thoughts')).toHaveLength(0);
    const planResult = res.tableResults.find((r: any) => r.table === 'practice_plans');
    expect(planResult.insertStatus).toBe('N/A');
  });
});
