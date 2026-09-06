/**
 * Accounts waiting for approval.
 *
 * The most consequential control in the application: approving a signup hands
 * somebody a coach's access to a squad of minors. So the confirmation names
 * the person and the role rather than asking "are you sure?", and refusing
 * says outright that the account is kept -- otherwise a coach assumes a
 * mis-click is unrecoverable and leaves a real person locked out rather than
 * ask.
 *
 * The list is scoped to the organization and never fetched bare.
 * getPendingApprovals() without one falls back to a legacy default, which
 * showed a club admin Beaumont's signups. That is a fixed bug, and this is
 * where it would come back.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ApprovalsSection from './ApprovalsSection.vue';

const getPendingApprovals = vi.fn();
const approveUserAccess = vi.fn();
const rejectUserAccess = vi.fn();

vi.mock('../../auth', () => ({
  auth: {
    getPendingApprovals: (...a: any[]) => getPendingApprovals(...a),
    approveUserAccess: (...a: any[]) => approveUserAccess(...a),
    rejectUserAccess: (...a: any[]) => rejectUserAccess(...a)
  }
}));

const WAITING = [
  { id: 'u1', name: 'Ana Ruiz', email: 'ana@example.com', requestedRole: 'coach' },
  { id: 'u2', name: '', email: 'nobody@example.com', requestedRole: 'player' }
];

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

async function mountApprovals(schoolId: string | null = 's1') {
  const w = mount(ApprovalsSection, { props: { schoolId }, attachTo: document.body });
  await flush();
  await w.vm.$nextTick();
  return w;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  getPendingApprovals.mockResolvedValue(WAITING);
  approveUserAccess.mockResolvedValue(true);
  rejectUserAccess.mockResolvedValue(true);
});

describe('reading the list', () => {
  it('asks for ONE ORGANIZATION, never bare', async () => {
    // A bare call falls back to a legacy default and shows a club admin
    // somebody else's signups.
    await mountApprovals('s1');
    expect(getPendingApprovals).toHaveBeenCalledWith('s1');
  });

  it('asks for nothing at all without an organization', async () => {
    const w = await mountApprovals(null);
    expect(getPendingApprovals).not.toHaveBeenCalled();
    expect(w.find('[data-approvals-error]').exists()).toBe(true);
  });

  it('lists everybody waiting', async () => {
    const w = await mountApprovals();
    expect(w.findAll('[data-approval-row]')).toHaveLength(2);
  });

  it('shows WHAT THEY ASKED FOR, not just who they are', async () => {
    // A name and an email alone is not enough to decide on.
    const w = await mountApprovals();
    expect(w.find('[data-approval-role]').text()).toMatch(/coach/i);
    expect(w.find('[data-approval-email]').text()).toBe('ana@example.com');
  });

  it('copes with somebody who gave no name', async () => {
    const w = await mountApprovals();
    expect(w.findAll('[data-approval-name]')[1].text()).toBeTruthy();
  });

  it('says when nobody is waiting', async () => {
    getPendingApprovals.mockResolvedValue([]);
    const w = await mountApprovals();
    expect(w.find('[data-approvals-empty]').exists()).toBe(true);
  });

  it('REPORTS a failed read rather than saying nobody is waiting', async () => {
    // Which would leave a real person waiting indefinitely.
    getPendingApprovals.mockRejectedValue(new Error('offline'));
    const w = await mountApprovals();

    expect(w.find('[data-approvals-error]').exists()).toBe(true);
    expect(w.find('[data-approvals-empty]').exists()).toBe(false);
  });
});

describe('approving', () => {
  it('NAMES the person and the role first', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountApprovals();
    await w.find('[data-approval-approve]').trigger('click');

    const asked = confirmSpy.mock.calls[0][0];
    expect(asked).toContain('Ana Ruiz');
    expect(asked).toMatch(/COACH/);
    expect(approveUserAccess).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('says the decision can be changed afterwards', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountApprovals();
    await w.find('[data-approval-approve]').trigger('click');

    expect(confirmSpy.mock.calls[0][0]).toMatch(/change it again/i);
    confirmSpy.mockRestore();
  });

  it('approves and re-reads once confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountApprovals();
    await w.find('[data-approval-approve]').trigger('click');
    await flush();

    expect(approveUserAccess).toHaveBeenCalledWith('u1');
    expect(getPendingApprovals).toHaveBeenCalledTimes(2);
    confirmSpy.mockRestore();
  });

  it('reports a refusal rather than claiming it worked', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    approveUserAccess.mockResolvedValue(false);
    const w = await mountApprovals();
    await w.find('[data-approval-approve]').trigger('click');
    await flush();

    expect(w.find('[data-approvals-notice]').text()).toMatch(/refused/i);
    confirmSpy.mockRestore();
  });
});

describe('refusing', () => {
  it('SAYS THE ACCOUNT IS KEPT, not deleted', async () => {
    // Otherwise a coach assumes a mis-click is unrecoverable and leaves a
    // real person locked out rather than ask.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountApprovals();
    await w.find('[data-approval-reject]').trigger('click');

    const asked = confirmSpy.mock.calls[0][0];
    expect(asked).toMatch(/kept/i);
    expect(asked).toMatch(/undone|approving them later/i);
    confirmSpy.mockRestore();
  });

  it('names the person', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountApprovals();
    await w.find('[data-approval-reject]').trigger('click');

    expect(confirmSpy.mock.calls[0][0]).toContain('Ana Ruiz');
    confirmSpy.mockRestore();
  });

  it('refuses and re-reads once confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountApprovals();
    await w.find('[data-approval-reject]').trigger('click');
    await flush();

    expect(rejectUserAccess).toHaveBeenCalledWith('u1');
    expect(w.find('[data-approvals-notice]').text()).toMatch(/kept/i);
    confirmSpy.mockRestore();
  });
});
