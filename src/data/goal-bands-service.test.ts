/// <reference types="vite/client" />
/**
 * Goals-by-role standards: read from the table, written only through
 * save_goal_bands. These pin the argument names -- a renamed parameter reaches
 * PostgREST as "function not found" -- and that a refusal comes back as the
 * database's own sentence.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;
const DRILL = '11111111-1111-1111-1111-111111111111';
const TEAM = '22222222-2222-2222-2222-222222222222';

let rpcCalls: { fn: string; args: any }[];
let rpcResult: { data: any; error: any };
let fromCalls: { table: string; eqs: [string, any][] }[];
let fromRows: any[] | null;
let fromError: any;

beforeEach(() => {
  rpcCalls = [];
  rpcResult = { data: null, error: null };
  fromCalls = [];
  fromRows = [];
  fromError = null;
  svc.isConfigured = () => true;
  svc.client = {
    rpc(fn: string, args: any) { rpcCalls.push({ fn, args }); return Promise.resolve(rpcResult); },
    from(table: string) {
      const call = { table, eqs: [] as [string, any][] };
      fromCalls.push(call);
      const api: any = {
        select() { return api; },
        eq(col: string, v: any) { call.eqs.push([col, v]); return api; },
        then(res: any) { return Promise.resolve({ data: fromError ? null : fromRows, error: fromError }).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('fetchGoalBands', () => {
  it("reads one squad's bands for one drill, grouped by role and kind", async () => {
    fromRows = [
      { role: 'defend', kind: 'base', threshold: 0, factor: 0.6 },
      { role: 'attack', kind: 'bonus', threshold: 3, factor: 0.1 },
      { role: 'attack', kind: 'base', threshold: 1, factor: 0.5 }
    ];
    const rows = await svc.fetchGoalBands(DRILL, TEAM);
    expect(fromCalls).toEqual([{ table: 'drill_goal_bands', eqs: [['drill_id', DRILL], ['team_id', TEAM]] }]);
    expect(rows.map((r: any) => `${r.role}/${r.kind}`)).toEqual(['attack/base', 'attack/bonus', 'defend/base']);
  });

  it('is null, not empty, when the read fails', async () => {
    fromError = { message: 'boom' };
    expect(await svc.fetchGoalBands(DRILL, TEAM)).toBeNull();
  });

  it('does not query without real ids', async () => {
    expect(await svc.fetchGoalBands('', TEAM)).toBeNull();
    expect(await svc.fetchGoalBands(DRILL, 'team')).toBeNull();
    expect(fromCalls).toHaveLength(0);
  });
});

describe('saveGoalBands', () => {
  it('calls save_goal_bands with the argument names the database declares', async () => {
    const res = await svc.saveGoalBands(DRILL, TEAM, 'attack', [{ kind: 'base', threshold: 1, factor: 0.5 }]);
    expect(rpcCalls).toEqual([{
      fn: 'save_goal_bands',
      args: { p_drill_id: DRILL, p_team_id: TEAM, p_role: 'attack', p_bands: [{ kind: 'base', threshold: 1, factor: 0.5 }] }
    }]);
    expect(res.ok).toBe(true);
  });

  it("returns the database's sentence when it refuses", async () => {
    rpcResult = { data: null, error: { message: 'Only a coach of this team can set its standards.' } };
    expect(await svc.saveGoalBands(DRILL, TEAM, 'attack', []))
      .toEqual({ ok: false, error: 'Only a coach of this team can set its standards.' });
  });

  it('refuses without a drill or a team, before any call', async () => {
    expect(await svc.saveGoalBands('', TEAM, 'attack', [])).toEqual({ ok: false, error: 'No drill given.' });
    expect(await svc.saveGoalBands(DRILL, '', 'attack', [])).toEqual({ ok: false, error: 'No team selected.' });
    expect(rpcCalls).toHaveLength(0);
  });
});
