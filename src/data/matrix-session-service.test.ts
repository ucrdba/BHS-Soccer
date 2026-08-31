/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

let captured: { table: string; op: string; rows?: any[]; }[];
let opError: { code?: string; message: string } | null;
let opRows: Record<string, any>[];

const svc = supabaseService as any;

beforeEach(() => {
  captured = [];
  opError = null;
  opRows = [{ id: 'sess-1' }];
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
        then(res: any)      { return Promise.resolve({ data: opError ? null : opRows, error: opError }).then(res); }
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
  it('soft-deletes rather than removing the row', async () => {
    await supabaseService.deleteMatrixSession('sess-1');
    expect(captured[0].op).toBe('update');
    expect(captured[0].rows![0].is_deleted).toBe(true);
  });
});
