/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

let captured: { table: string; op: string; rows?: any[]; }[];
let opError: { code?: string; message: string } | null;
let opRows: Record<string, any>[];
// Per-table overrides, needed for saveMatrixSession's rollback test: that path
// makes three round trips (drills_bank select, matrix_sessions upsert,
// matrix_session_results upsert) and needs the *last* one to fail while the
// first two succeed with the shared `opRows` default. Only set an override
// for a table when a test genuinely needs a different answer for it than the
// rest of the calls in that test get.
let tableRows: Record<string, Record<string, any>[]>;
let tableErrors: Record<string, { code?: string; message: string }>;

const svc = supabaseService as any;

beforeEach(() => {
  captured = [];
  opError = null;
  opRows = [{ id: 'sess-1' }];
  tableRows = {};
  tableErrors = {};
  svc.isConfigured = () => true;
  svc.client = {
    from(table: string) {
      const api: any = {
        insert(rows: any[]) { captured.push({ table, op: 'insert', rows }); return api; },
        upsert(rows: any[]) { captured.push({ table, op: 'upsert', rows }); return api; },
        update(row: any)    { captured.push({ table, op: 'update', rows: [row] }); return api; },
        delete()            { captured.push({ table, op: 'delete' }); return api; },
        select()            { return api; },
        eq()                { return api; },
        in()                { return api; },
        order()             { return api; },
        limit()             { return api; },
        then(res: any) {
          const err = Object.prototype.hasOwnProperty.call(tableErrors, table) ? tableErrors[table] : opError;
          const data = err ? null : (Object.prototype.hasOwnProperty.call(tableRows, table) ? tableRows[table] : opRows);
          return Promise.resolve({ data, error: err }).then(res);
        }
      };
      return api;
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('saveMatrixSession', () => {
  it('refuses a session with no drill, which cannot be scored', async () => {
    const res = await supabaseService.saveMatrixSession('t1', { drillId: '', occurredOn: '2026-08-31' }, []);
    expect(res.ok).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it('refuses a present player with neither a value nor an outcome', async () => {
    // Storing this would put the full weight into `available` while
    // contributing nothing to `earned` — scoring them as though they failed.
    const res = await supabaseService.saveMatrixSession(
      't1', { drillId: 'd1', occurredOn: '2026-08-31' },
      [{ playerId: 'p1', attendance: 'present', rawValue: null, outcome: null }]
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('p1');
    expect(captured).toHaveLength(0);
  });

  it('allows an absent player to supply nothing', async () => {
    const res = await supabaseService.saveMatrixSession(
      't1', { drillId: 'd1', occurredOn: '2026-08-31' },
      [{ playerId: 'p1', attendance: 'excused', rawValue: null, outcome: null }]
    );
    expect(res.ok).toBe(true);
  });

  it('writes the session before its results', async () => {
    await supabaseService.saveMatrixSession(
      't1', { drillId: 'd1', occurredOn: '2026-08-31' },
      [{ playerId: 'p1', attendance: 'present', rawValue: 2800 }]
    );
    expect(captured[0].table).toBe('matrix_sessions');
    expect(captured[1].table).toBe('matrix_session_results');
  });

  it('refuses a session against a head-to-head drill', async () => {
    // Those are entered as pairings in the Record Result modal. Allowing both
    // routes for one drill would let the same day be counted twice. The picker
    // filters them out, but the save path must refuse them too — the spec is
    // explicit that this cannot rely on the UI.
    opRows = [{ id: 'd1', measure: 'head_to_head' }];
    const res = await supabaseService.saveMatrixSession(
      't1', { drillId: 'd1', occurredOn: '2026-08-31' },
      [{ playerId: 'p1', attendance: 'present', rawValue: 1 }]
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('pairing');
    expect(captured.some(c => c.table === 'matrix_sessions')).toBe(false);
  });

  it('reports an RLS refusal rather than claiming success', async () => {
    opRows = [];
    const res = await supabaseService.saveMatrixSession(
      't1', { drillId: 'd1', occurredOn: '2026-08-31' },
      [{ playerId: 'p1', attendance: 'present', rawValue: 1 }]
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('coach');
  });

  it('soft-deletes the session it just created when the results write is refused', async () => {
    // PostgREST gives no transaction across the two round trips. Leaving the
    // session behind here would not be inert (it still has a drill_id, so
    // matrix_standings would join it), and would also leave the caller with
    // no id to retry into, so a resubmit would insert a second orphan.
    tableRows['matrix_session_results'] = [];
    const res = await supabaseService.saveMatrixSession(
      't1', { drillId: 'd1', occurredOn: '2026-08-31' },
      [{ playerId: 'p1', attendance: 'present', rawValue: 1 }]
    );
    expect(res.ok).toBe(false);
    const rollback = captured.find(c => c.table === 'matrix_sessions' && c.op === 'update');
    expect(rollback).toBeDefined();
    expect(rollback!.rows![0].is_deleted).toBe(true);
  });
});

describe('updateDrillWeights', () => {
  it('refuses a weight outside a sane range', async () => {
    const res = await supabaseService.updateDrillWeights([{ id: 'd1', points: 99, measure: 'count_high' }]);
    expect(res.ok).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it('refuses a measure the CHECK constraint would reject', async () => {
    const res = await supabaseService.updateDrillWeights([{ id: 'd1', points: 3, measure: 'vibes' }]);
    expect(res.ok).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it('accepts a fractional weight, which is the point of the widening', async () => {
    const res = await supabaseService.updateDrillWeights([{ id: 'd1', points: 2.5, measure: 'win_loss' }]);
    expect(res.ok).toBe(true);
    expect(captured[0].rows![0].points).toBe(2.5);
  });
});

describe('deleteMatrixSession', () => {
  const SESSION = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('soft-deletes rather than removing the row', async () => {
    await supabaseService.deleteMatrixSession(SESSION);
    expect(captured[0].op).toBe('update');
    expect(captured[0].rows![0].is_deleted).toBe(true);
  });

  /*
   * A caller holding the wrong row shape sent the string "undefined" and
   * Postgres answered `invalid input syntax for type uuid`, which is a crash
   * report rather than something a coach can act on. Refused here instead,
   * the same way the matrix_logs writers refuse one.
   */
  it('refuses an id that is not a uuid rather than letting Postgres say so', async () => {
    const res = await supabaseService.deleteMatrixSession(undefined as any);

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no database id/i);
    expect(captured).toHaveLength(0);
  });
});

describe('saveMatrixSession for a Goals-by-role drill', () => {
  beforeEach(() => { tableRows = { drills_bank: [{ measure: 'role_goals' }] }; });

  it('writes the role and both goal counts, and no raw value', async () => {
    const res = await supabaseService.saveMatrixSession(
      't1', { drillId: 'd1', occurredOn: '2026-09-14' },
      [
        { playerId: 'p1', attendance: 'present', role: 'attack', goalsFor: 3, goalsAgainst: 1 },
        { playerId: 'p2', attendance: 'excused', role: 'defend', goalsFor: 2, goalsAgainst: 2 }
      ]
    );
    expect(res.ok).toBe(true);
    const results = captured.find(c => c.table === 'matrix_session_results')!;
    expect(results.rows).toEqual([
      { session_id: 'sess-1', player_id: 'p1', attendance: 'present', raw_value: null, outcome: null,
        role: 'attack', goals_for: 3, goals_against: 1 },
      { session_id: 'sess-1', player_id: 'p2', attendance: 'excused', raw_value: null, outcome: null,
        role: null, goals_for: null, goals_against: null }
    ]);
  });

  it.each([
    ['no role', { role: null, goalsFor: 3, goalsAgainst: 1 }],
    ['a role the database refuses', { role: 'midfield', goalsFor: 3, goalsAgainst: 1 }],
    ['no score', { role: 'attack', goalsFor: null, goalsAgainst: null }],
    ['a count over 99', { role: 'attack', goalsFor: 100, goalsAgainst: 1 }]
  ])('refuses a present player with %s, naming them', async (_label, r) => {
    const res = await supabaseService.saveMatrixSession(
      't1', { drillId: 'd1', occurredOn: '2026-09-14' },
      [{ playerId: 'p1', attendance: 'present', ...r }]
    );
    expect(res.ok).toBe(false);
    expect(res.error).toBe('p1 is marked present but needs a role and a score like 3-1. Enter both, or mark them absent.');
    expect(captured).toHaveLength(0);
  });
});

describe('saveMatrixSession for other measures', () => {
  it('writes the Goals-by-role columns as null', async () => {
    tableRows = { drills_bank: [{ measure: 'count_high' }] };
    await supabaseService.saveMatrixSession(
      't1', { drillId: 'd1', occurredOn: '2026-09-14' },
      [{ playerId: 'p1', attendance: 'present', rawValue: 40, role: 'attack', goalsFor: 1, goalsAgainst: 0 }]
    );
    const results = captured.find(c => c.table === 'matrix_session_results')!;
    expect(results.rows![0]).toMatchObject({ raw_value: 40, role: null, goals_for: null, goals_against: null });
  });
});
