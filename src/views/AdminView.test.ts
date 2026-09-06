/**
 * Administration.
 *
 * The gating is what this file is really about, and it is not what it first
 * looks like. Guarding the whole route on can_access_admin_dashboard would be
 * tighter and WRONG: schema_roles.sql grants that permission to admin alone,
 * while the legacy panel shows the categories, the unassigned players and the
 * quiz bank to any coach. So the route is coach-or-admin and each section
 * carries its own gate.
 *
 * The other case worth pinning is an admin whose roles table did not load.
 * fetchRoles returns null when the client is unconfigured, both entry points
 * then call setRoles([]), and every permission reads false -- so a real admin
 * is locked out of the panel they would come to precisely to diagnose that.
 * They are told, rather than shown a page that looks complete.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import AdminView from './AdminView.vue';
import { setRoles } from '../auth/permissions';

const getPendingApprovals = vi.fn();

// The whole module is replaced, so it needs everything the auth STORE
// touches as well -- the store is created by createTestingPinia and calls
// into this on setup.
vi.mock('../auth', () => ({
  auth: {
    getPendingApprovals: (...a: any[]) => getPendingApprovals(...a),
    approveUserAccess: vi.fn(),
    rejectUserAccess: vi.fn(),
    getCurrentUser: () => ({ id: 'u1', name: 'Admin', role: 'admin', status: 'active' }),
    getRole: () => 'admin',
    isCoach: () => true,
    isAdmin: () => true,
    isLoggedIn: () => true,
    canAccessRatings: () => true,
    subscribe: () => () => {},
    loginUser: vi.fn(),
    registerUser: vi.fn(),
    verifyUserOtp: vi.fn(),
    logout: vi.fn()
  }
}));

// The sections read through this on mount; an incomplete mock leaves an
// unhandled rejection, which exits non-zero while every test "passes".
vi.mock('../data/supabase', () => ({
  supabaseService: {
    fetchAllTeams: vi.fn().mockResolvedValue([]),
    fetchTeamCoaches: vi.fn().mockResolvedValue([]),
    fetchAssignableCoaches: vi.fn().mockResolvedValue([]),
    fetchUnassignedPlayers: vi.fn().mockResolvedValue([]),
    fetchSoccerCategories: vi.fn().mockResolvedValue([]),
    fetchCategoryUsage: vi.fn().mockResolvedValue({})
  }
}));

const ADMIN_ROLES = [
  { name: 'admin', permissions: { can_access_admin_dashboard: true } },
  { name: 'coach', permissions: { can_access_admin_dashboard: false } }
];

const flush = () => new Promise(r => setTimeout(r, 0));

async function mountAdmin(opts: { coach?: boolean; admin?: boolean } = {}) {
  const { coach = true, admin = false } = opts;

  const w = mount(AdminView, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: true,
        initialState: {
          organization: {
            schools: [{ id: 's1', name: 'Legends FC', mascot: 'Lions' }],
            teams: [{ id: 't1', name: 'U16', school_id: 's1' }],
            activeTeamId: 't1'
          },
          auth: { isCoach: coach, isAdmin: admin, isGuest: false }
        }
      })]
    }
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  getPendingApprovals.mockResolvedValue([]);
  setRoles(ADMIN_ROLES as any);
});

describe('what a coach sees', () => {
  it('reaches the panel and sees the approvals', async () => {
    const w = await mountAdmin({ coach: true, admin: false });
    expect(w.find('[data-approvals]').exists()).toBe(true);
  });

  it('does NOT see the admin-only sections', async () => {
    // Absent from the document, not hidden.
    const w = await mountAdmin({ coach: true, admin: false });
    expect(w.find('[data-admin-manage]').exists()).toBe(false);
  });

  it('is told some sections are for administrators', async () => {
    // Rather than wondering whether the page failed to load.
    const w = await mountAdmin({ coach: true, admin: false });
    expect(w.find('[data-admin-coach-note]').exists()).toBe(true);
  });

  it('is not shown the locked-out warning, which is not their situation', async () => {
    const w = await mountAdmin({ coach: true, admin: false });
    expect(w.find('[data-admin-locked]').exists()).toBe(false);
  });
});

describe('what an admin sees', () => {
  it('sees the management sections', async () => {
    const w = await mountAdmin({ coach: true, admin: true });
    expect(w.find('[data-admin-manage]').exists()).toBe(true);
  });

  it('sees the approvals too', async () => {
    const w = await mountAdmin({ coach: true, admin: true });
    expect(w.find('[data-approvals]').exists()).toBe(true);
  });

  it('is not told sections are for administrators, being one', async () => {
    const w = await mountAdmin({ coach: true, admin: true });
    expect(w.find('[data-admin-coach-note]').exists()).toBe(false);
  });
});

describe('AN ADMIN WHOSE ROLES TABLE DID NOT LOAD', () => {
  it('is TOLD, rather than shown a page missing half of itself', async () => {
    // fetchRoles returns null when the client is unconfigured, and setRoles([])
    // makes every permission read false. This panel is exactly where an admin
    // would come to diagnose that, so it has to say so.
    setRoles([]);
    const w = await mountAdmin({ coach: true, admin: true });

    expect(w.find('[data-admin-manage]').exists()).toBe(false);
    expect(w.find('[data-admin-locked]').exists()).toBe(true);
  });

  it('names the roles table, so the message is actionable', async () => {
    setRoles([]);
    const w = await mountAdmin({ coach: true, admin: true });
    expect(w.find('[data-admin-locked]').text()).toMatch(/roles/i);
  });

  it('does not warn a coach, for whom this is normal', async () => {
    setRoles([]);
    const w = await mountAdmin({ coach: true, admin: false });
    expect(w.find('[data-admin-locked]').exists()).toBe(false);
  });
});

describe('the page itself', () => {
  it('names the organization rather than a hardcoded school', async () => {
    const w = await mountAdmin();
    expect(w.text()).toContain('Legends FC');
    expect(w.text()).not.toMatch(/beaumont|cougars/i);
  });
});

describe('the coach-visible sections', () => {
  it('shows the unassigned players and the categories to a coach', async () => {
    // soccer_categories_write and the membership policies both allow a coach,
    // so these are not controls the database would refuse.
    const w = await mountAdmin({ coach: true, admin: false });
    expect(w.find('[data-admin-unassigned]').exists()).toBe(true);
    expect(w.find('[data-admin-categories]').exists()).toBe(true);
  });

  it('shows them to an admin too', async () => {
    const w = await mountAdmin({ coach: true, admin: true });
    expect(w.find('[data-admin-unassigned]').exists()).toBe(true);
    expect(w.find('[data-admin-categories]').exists()).toBe(true);
  });
});
