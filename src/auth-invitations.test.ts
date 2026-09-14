/**
 * An account that already existed when it was invited is connected at sign-in.
 *
 * Confirmation only redeems invitations for a brand-new account, so a parent,
 * a player with a school account or a coach invited to a second team would
 * otherwise never be connected. AuthManager asks redeem_my_invitations after
 * signing in, and reloads the profile when anything was redeemed so the new
 * role shows at once. A failure is not the person's action and says nothing.
 *
 * Mocks src/data/supabase.ts, like auth-recovery.test.ts, so it runs with no
 * stack.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
  signOutUser: vi.fn(),
  signInUser: vi.fn(),
  fetchOwnProfile: vi.fn(),
  redeemMyInvitations: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  isConfigured: () => true
}));
vi.mock('./data/supabase', () => ({ supabaseService: svc }));

import { AuthManager } from './auth';

const row = (over: Record<string, any> = {}) =>
  ({ id: 'u1', name: 'Pat', email: 'pat@example.com', role: 'guest', status: 'active', ...over });

describe('connecting invitations at sign-in', () => {
  let auth: AuthManager;

  beforeEach(() => {
    vi.clearAllMocks();
    svc.signInUser.mockResolvedValue({ data: {}, error: null });
    svc.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    auth = new AuthManager();
  });

  it('redeems after a successful sign-in, and reloads the profile when one was', async () => {
    svc.fetchOwnProfile
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ role: 'player', player_id: 'p1' }));
    svc.redeemMyInvitations.mockResolvedValue({ ok: true, data: 1 });

    const res = await auth.loginUser('pat@example.com', 'secret');

    expect(svc.redeemMyInvitations).toHaveBeenCalledTimes(1);
    expect(svc.fetchOwnProfile).toHaveBeenCalledTimes(2);
    expect(res.success).toBe(true);
    expect(auth.getCurrentUser()).toMatchObject({ role: 'player', playerId: 'p1' });
  });

  it('does not reload when nothing was redeemed', async () => {
    svc.fetchOwnProfile.mockResolvedValue(row());
    svc.redeemMyInvitations.mockResolvedValue({ ok: true, data: 0 });
    await auth.loginUser('pat@example.com', 'secret');
    expect(svc.fetchOwnProfile).toHaveBeenCalledTimes(1);
  });

  it('still signs in when redeeming fails', async () => {
    svc.fetchOwnProfile.mockResolvedValue(row());
    svc.redeemMyInvitations.mockResolvedValue({ ok: false, error: 'Only an active account with a confirmed email can accept invitations.' });
    const res = await auth.loginUser('pat@example.com', 'secret');
    expect(res).toMatchObject({ success: true });
    expect(res.message).toBeUndefined();
  });

  it('does not redeem for an account still waiting for approval', async () => {
    svc.fetchOwnProfile.mockResolvedValue(row({ status: 'pending_approval', requested_role: 'player' }));
    await auth.loginUser('pat@example.com', 'secret');
    expect(svc.redeemMyInvitations).not.toHaveBeenCalled();
  });

  it('redeems when a restored session loads an active profile', async () => {
    svc.fetchOwnProfile
      .mockResolvedValueOnce(row({ role: 'coach' }))
      .mockResolvedValueOnce(row({ role: 'coach', school_id: 's2' }));
    svc.redeemMyInvitations.mockResolvedValue({ ok: true, data: 1 });

    await auth.init();

    expect(svc.redeemMyInvitations).toHaveBeenCalledTimes(1);
    expect(auth.getCurrentUser()).toMatchObject({ schoolId: 's2' });
  });

  it('does not redeem for a signed-out visitor', async () => {
    svc.getSession.mockResolvedValue({ data: { session: null } });
    await auth.init();
    expect(svc.redeemMyInvitations).not.toHaveBeenCalled();
  });
});
