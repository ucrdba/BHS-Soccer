/**
 * Inviting someone to a team.
 *
 * The invitation is only authorization; the app sends no email. So after
 * inviting, the control shows the link for the coach to send, and says so --
 * a coach who assumes an email went out waits for a sign-up that never comes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import InviteControl from './InviteControl.vue';

const fetchTeamInvitations = vi.fn();
const fetchLinkedPlayerIds = vi.fn();
const createInvitation = vi.fn();
const revokeInvitation = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchTeamInvitations: (...a: any[]) => fetchTeamInvitations(...a),
    fetchLinkedPlayerIds: (...a: any[]) => fetchLinkedPlayerIds(...a),
    createInvitation: (...a: any[]) => createInvitation(...a),
    revokeInvitation: (...a: any[]) => revokeInvitation(...a)
  }
}));

const OPEN = { id: 'i1', email: 'kid@example.com', role: 'player', player_id: 'p1', team_id: 't1', created_at: '' };

const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0)); };

async function mountPlayer(playerId = 'p1') {
  const w = mount(InviteControl, {
    props: { teamId: 't1', role: 'player', playerId, subject: 'Ana Ruiz' }, attachTo: document.body
  });
  await flush();
  return w;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  fetchTeamInvitations.mockResolvedValue([]);
  fetchLinkedPlayerIds.mockResolvedValue([]);
  createInvitation.mockResolvedValue({ ok: true, data: OPEN });
  revokeInvitation.mockResolvedValue({ ok: true });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('InviteControl', () => {
  it('says an account is linked, and offers nothing else', async () => {
    fetchLinkedPlayerIds.mockResolvedValue(['p1']);
    const w = await mountPlayer();
    expect(w.find('[data-invite-linked]').exists()).toBe(true);
    expect(w.find('[data-invite-form]').exists()).toBe(false);
  });

  it('invites the player by email, for this roster entry', async () => {
    const w = await mountPlayer();
    await w.find('[data-invite-email]').setValue('Kid@Example.com');
    await w.find('[data-invite-form]').trigger('submit');
    await flush();
    expect(createInvitation).toHaveBeenCalledWith('Kid@Example.com', 't1', 'player', 'p1');
    expect(w.find('[data-invite-notice]').text()).toMatch(/does not email/i);
    // An address that already has an account is connected at its next sign-in.
    expect(w.find('[data-invite-notice]').text())
      .toContain('If they already have an account, they are connected the next time they sign in.');
  });

  it('shows an open invitation with the sign-up link to send', async () => {
    fetchTeamInvitations.mockResolvedValue([OPEN]);
    const w = await mountPlayer();
    expect(w.find('[data-invite-open]').text()).toContain('kid@example.com');
    expect((w.find('[data-invite-link]').element as HTMLInputElement).value)
      .toBe(`${window.location.origin}/#signup=kid%40example.com`);
    expect(w.find('[data-invite-form]').exists()).toBe(false);
  });

  it("ignores another player's invitation on the same team", async () => {
    fetchTeamInvitations.mockResolvedValue([{ ...OPEN, player_id: 'p2' }]);
    const w = await mountPlayer('p1');
    expect(w.find('[data-invite-open]').exists()).toBe(false);
    expect(w.find('[data-invite-form]').exists()).toBe(true);
  });

  it('withdraws an invitation after confirming', async () => {
    fetchTeamInvitations.mockResolvedValue([OPEN]);
    const w = await mountPlayer();
    await w.find('[data-invite-revoke]').trigger('click');
    await flush();
    expect(revokeInvitation).toHaveBeenCalledWith('i1');
  });

  it("shows the database's refusal in words", async () => {
    createInvitation.mockResolvedValue({ ok: false, error: 'That player already has an account.' });
    const w = await mountPlayer();
    await w.find('[data-invite-email]').setValue('kid@example.com');
    await w.find('[data-invite-form]').trigger('submit');
    await flush();
    expect(w.find('[data-invite-error]').text()).toBe('That player already has an account.');
  });

  it('keeps the form for a coach invitation while others are open', async () => {
    fetchTeamInvitations.mockResolvedValue([{ ...OPEN, role: 'coach', player_id: null }]);
    const w = mount(InviteControl, { props: { teamId: 't1', role: 'coach', subject: 'U14' }, attachTo: document.body });
    await flush();
    expect(w.findAll('[data-invite-open]')).toHaveLength(1);
    expect(w.find('[data-invite-form]').exists()).toBe(true);
    expect(fetchLinkedPlayerIds).not.toHaveBeenCalled();
  });

  it('says a failed read failed', async () => {
    fetchTeamInvitations.mockResolvedValue(null);
    const w = await mountPlayer();
    expect(w.find('[data-invite-error]').text()).toMatch(/Could not load/);
  });
});
