/**
 * Accounts waiting for approval, read from pending_requests().
 *
 * The database decides who sees what: a coach gets player requests for their
 * own teams, an admin gets everything. This component's job is to make the
 * one decision each request needs -- which roster entry, and for a request
 * that named no team, which team -- and never to offer a button the database
 * would refuse.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ApprovalsSection from './ApprovalsSection.vue';

const fetchPendingRequests = vi.fn();
const fetchUnlinkedRosterEntries = vi.fn();
const fetchJoinableTeams = vi.fn();
const approvePlayerRequest = vi.fn();
const approveCoachRequest = vi.fn();
const rejectRequest = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchPendingRequests: (...a: any[]) => fetchPendingRequests(...a),
    fetchUnlinkedRosterEntries: (...a: any[]) => fetchUnlinkedRosterEntries(...a),
    fetchJoinableTeams: (...a: any[]) => fetchJoinableTeams(...a),
    approvePlayerRequest: (...a: any[]) => approvePlayerRequest(...a),
    approveCoachRequest: (...a: any[]) => approveCoachRequest(...a),
    rejectRequest: (...a: any[]) => rejectRequest(...a)
  }
}));

const PLAYER = {
  id: 'u1', name: 'Ana Ruiz', email: 'ana@example.com', requested_role: 'player',
  requested_team_id: 't1', team_name: 'U14', school_name: 'Hawks FC', created_at: '2026-09-14'
};
const COACH = { ...PLAYER, id: 'u2', name: 'Ben Cole', email: 'ben@example.com', requested_role: 'coach' };
const TEAMLESS = { ...PLAYER, id: 'u3', name: 'Cy Dunn', requested_team_id: null, team_name: null, school_name: null };

const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0));
};

async function mountQueue(isAdmin = false) {
  const w = mount(ApprovalsSection, { props: { isAdmin }, attachTo: document.body });
  await flush();
  return w;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  fetchPendingRequests.mockResolvedValue([PLAYER]);
  fetchUnlinkedRosterEntries.mockResolvedValue([{ id: 'p1', name: 'Ana Ruiz' }]);
  fetchJoinableTeams.mockResolvedValue([{ id: 't9', name: 'U16', season: null, schoolName: 'Hawks FC' }]);
  approvePlayerRequest.mockResolvedValue({ ok: true, data: 'p1' });
  approveCoachRequest.mockResolvedValue({ ok: true });
  rejectRequest.mockResolvedValue({ ok: true });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('the queue', () => {
  it('names the person, the team and its organization', async () => {
    const w = await mountQueue();
    expect(w.find('[data-request-row]').text()).toContain('Ana Ruiz');
    expect(w.find('[data-request-team-label]').text()).toBe('U14 · Hawks FC');
  });

  it('says a failed read failed, rather than that nobody is waiting', async () => {
    fetchPendingRequests.mockResolvedValue(null);
    const w = await mountQueue();
    expect(w.find('[data-approvals-error]').exists()).toBe(true);
    expect(w.find('[data-approvals-empty]').exists()).toBe(false);
  });

  it("offers the team's unlinked roster entries and a new entry", async () => {
    const w = await mountQueue();
    const options = w.findAll('[data-request-player] option').map(o => o.text());
    expect(options).toEqual(['New roster entry', 'Ana Ruiz']);
    expect(fetchUnlinkedRosterEntries).toHaveBeenCalledWith('t1');
  });

  it('approves a player onto the chosen roster entry', async () => {
    const w = await mountQueue();
    await w.find('[data-request-player]').setValue('p1');
    await w.find('[data-request-approve]').trigger('click');
    await flush();
    expect(approvePlayerRequest).toHaveBeenCalledWith('u1', 't1', 'p1');
    expect(w.find('[data-approvals-notice]').text()).toContain('Ana Ruiz approved');
  });

  it('approves a player as a new roster entry when none is chosen', async () => {
    const w = await mountQueue();
    await w.find('[data-request-approve]').trigger('click');
    await flush();
    expect(approvePlayerRequest).toHaveBeenCalledWith('u1', 't1', null);
  });

  it("shows the database's refusal in words", async () => {
    approvePlayerRequest.mockResolvedValue({ ok: false, error: 'That player already has an account.' });
    const w = await mountQueue();
    await w.find('[data-request-approve]').trigger('click');
    await flush();
    expect(w.find('[data-approvals-refused]').text()).toBe('That player already has an account.');
  });

  it('approves a coach request onto its team, with no roster picker', async () => {
    fetchPendingRequests.mockResolvedValue([COACH]);
    const w = await mountQueue(true);
    expect(w.find('[data-request-player]').exists()).toBe(false);
    await w.find('[data-request-approve]').trigger('click');
    await flush();
    expect(approveCoachRequest).toHaveBeenCalledWith('u2', 't1');
  });

  it('asks an admin which team a request that named none should join', async () => {
    fetchPendingRequests.mockResolvedValue([TEAMLESS]);
    const w = await mountQueue(true);
    await w.find('[data-request-approve]').trigger('click');
    await flush();
    expect(approvePlayerRequest).not.toHaveBeenCalled();
    expect(w.find('[data-approvals-refused]').text()).toMatch(/Choose the team/);

    await w.find('[data-request-team]').setValue('t9');
    await flush();
    await w.find('[data-request-approve]').trigger('click');
    await flush();
    expect(approvePlayerRequest).toHaveBeenCalledWith('u3', 't9', null);
  });

  it('refuses a request after confirming, and keeps the account', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountQueue();
    await w.find('[data-request-reject]').trigger('click');
    await flush();
    expect(confirmSpy.mock.calls[0][0]).toMatch(/kept/);
    expect(rejectRequest).toHaveBeenCalledWith('u1');
  });

  it('does nothing when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountQueue();
    await w.find('[data-request-approve]').trigger('click');
    await flush();
    expect(approvePlayerRequest).not.toHaveBeenCalled();
  });
});
