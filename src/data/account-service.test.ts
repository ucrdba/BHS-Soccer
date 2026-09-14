/// <reference types="vite/client" />
/**
 * The account methods: thin, and honest about refusals.
 *
 * Every privileged decision is made in Postgres (0035); these pin that each
 * method calls the right function with the right argument names -- a renamed
 * parameter reaches PostgREST as "function not found", which reads to a coach
 * as the app being broken -- and that a refusal comes back as the database's
 * own sentence.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;

let rpcCalls: { fn: string; args: any }[];
let rpcResult: { data: any; error: any };
let fromRows: Record<string, any[]>;
let auth: any;

beforeEach(() => {
  rpcCalls = [];
  rpcResult = { data: null, error: null };
  fromRows = {};
  auth = {
    resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
    updateUser: vi.fn().mockResolvedValue({ data: {}, error: null })
  };
  svc.isConfigured = () => true;
  svc.client = {
    auth,
    rpc(fn: string, args: any) { rpcCalls.push({ fn, args }); return Promise.resolve(rpcResult); },
    from(table: string) {
      const api: any = {
        select() { return api; }, eq() { return api; }, is() { return api; }, order() { return api; },
        then(res: any) { return Promise.resolve({ data: fromRows[table] ?? [], error: null }).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the invitation functions', () => {
  it('invites with the argument names the database declares', async () => {
    rpcResult = { data: { id: 'i1' }, error: null };
    const res = await svc.createInvitation('kid@example.com', 't1', 'player', 'p1');
    expect(rpcCalls).toEqual([{ fn: 'create_invitation',
      args: { p_email: 'kid@example.com', p_team_id: 't1', p_role: 'player', p_player_id: 'p1' } }]);
    expect(res).toEqual({ ok: true, data: { id: 'i1' } });
  });

  it("returns the database's sentence when it refuses", async () => {
    rpcResult = { data: null, error: { message: 'Only an admin can invite a coach.' } };
    expect(await svc.createInvitation('a@example.com', 't1', 'coach', null))
      .toEqual({ ok: false, error: 'Only an admin can invite a coach.' });
  });

  it('revokes by invitation id', async () => {
    await svc.revokeInvitation('i1');
    expect(rpcCalls).toEqual([{ fn: 'revoke_invitation', args: { p_invitation_id: 'i1' } }]);
  });

  it('reads the linked roster entries as a list of ids', async () => {
    rpcResult = { data: [{ player_id: 'p1' }, { player_id: 'p2' }], error: null };
    expect(await svc.fetchLinkedPlayerIds('t1')).toEqual(['p1', 'p2']);
    expect(rpcCalls[0]).toEqual({ fn: 'team_linked_players', args: { p_team_id: 't1' } });
  });

  it('offers only roster entries with no account, by name', async () => {
    svc.fetchTeamRoster = vi.fn().mockResolvedValue([
      { players: { id: 'p2', name: 'Zed Abel' } },
      { players: { id: 'p1', name: 'Ann Bell' } },
      { players: { id: 'p3', name: 'Cy Dunn' } }
    ]);
    rpcResult = { data: [{ player_id: 'p3' }], error: null };
    expect(await svc.fetchUnlinkedRosterEntries('t1'))
      .toEqual([{ id: 'p1', name: 'Ann Bell' }, { id: 'p2', name: 'Zed Abel' }]);
  });

  it('says it could not read, rather than offering nobody, when a read fails', async () => {
    svc.fetchTeamRoster = vi.fn().mockResolvedValue(null);
    expect(await svc.fetchUnlinkedRosterEntries('t1')).toBeNull();
  });
});

describe('the request functions', () => {
  it('reads the queue from pending_requests', async () => {
    rpcResult = { data: [{ id: 'u1' }], error: null };
    expect(await svc.fetchPendingRequests()).toEqual([{ id: 'u1' }]);
    expect(rpcCalls[0]).toEqual({ fn: 'pending_requests', args: {} });
  });

  it('approves a player with the team and an optional roster entry', async () => {
    rpcResult = { data: 'p9', error: null };
    expect(await svc.approvePlayerRequest('u1', 't1', null)).toEqual({ ok: true, data: 'p9' });
    expect(rpcCalls[0]).toEqual({ fn: 'approve_player_request',
      args: { p_profile_id: 'u1', p_team_id: 't1', p_player_id: null } });
  });

  it('approves a coach and refuses through the same shape', async () => {
    await svc.approveCoachRequest('u1', 't1');
    await svc.rejectRequest('u2');
    expect(rpcCalls).toEqual([
      { fn: 'approve_coach_request', args: { p_profile_id: 'u1', p_team_id: 't1' } },
      { fn: 'reject_request', args: { p_profile_id: 'u2' } }
    ]);
  });
});

describe('teams to join', () => {
  it('lists teams by organization, then name', async () => {
    fromRows.teams = [
      { id: 't2', name: 'Varsity', season: '2026', schools: { name: 'Riverside High' } },
      { id: 't1', name: 'U16', season: null, schools: { name: 'Hawks FC' } },
      { id: 't3', name: 'JV', season: '2026', schools: { name: 'Riverside High' } }
    ];
    expect(await svc.fetchJoinableTeams()).toEqual([
      { id: 't1', name: 'U16', season: null, schoolName: 'Hawks FC' },
      { id: 't3', name: 'JV', season: '2026', schoolName: 'Riverside High' },
      { id: 't2', name: 'Varsity', season: '2026', schoolName: 'Riverside High' }
    ]);
  });
});

describe('passwords', () => {
  it('sends the reset link back to this site', async () => {
    svc.authRedirectUrl = () => 'https://example.test/';
    expect(await svc.requestPasswordReset('a@example.com')).toEqual({ ok: true });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@example.com', { redirectTo: 'https://example.test/' });
  });

  it('sets the new password on the signed-in recovery session', async () => {
    expect(await svc.updatePassword('longenough')).toEqual({ ok: true });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'longenough' });
  });

  it('returns the reason a new password was refused', async () => {
    auth.updateUser.mockResolvedValue({ data: null, error: { message: 'Password should be at least 6 characters.' } });
    expect(await svc.updatePassword('x')).toEqual({ ok: false, error: 'Password should be at least 6 characters.' });
  });
});
