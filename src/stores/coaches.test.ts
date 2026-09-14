/**
 * The coaching staff store.
 *
 * Two client quirks shape this. `upsertCoach` substitutes 'Coach' and 'Staff'
 * for blank required fields, which would put a person called "Coach" on the
 * page — so blanks are refused here instead. And `deleteCoach` logs its error
 * and returns nothing, so its return value cannot tell success from failure;
 * the removal is verified by reloading rather than assumed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const fetchCoaches = vi.fn();
const upsertCoach = vi.fn();
const deleteCoach = vi.fn();
const fetchPendingRequests = vi.fn();
const isCoach = vi.fn();
const isAdmin = vi.fn();

vi.mock('../data/supabase', () => ({
  supabaseService: {
    fetchCoaches: (...a: any[]) => fetchCoaches(...a),
    upsertCoach: (...a: any[]) => upsertCoach(...a),
    deleteCoach: (...a: any[]) => deleteCoach(...a),
    fetchPendingRequests: (...a: any[]) => fetchPendingRequests(...a)
  }
}));

vi.mock('../auth', () => ({
  auth: {
    isCoach: () => isCoach(),
    isAdmin: () => isAdmin()
  }
}));

const { useCoachesStore } = await import('./coaches');

const row = (over: any = {}) => ({
  id: 'c1', school_id: 's1', name: 'A Coach', level: 'Head Coach',
  phone: '', address: '', email: '', photo_url: null, bio: '',
  is_deleted: false, ...over
});

const form = { name: 'New Coach', level: 'Assistant Coach' };

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  fetchCoaches.mockResolvedValue([row()]);
  upsertCoach.mockResolvedValue({ id: 'c1' });
  deleteCoach.mockResolvedValue(undefined);
  fetchPendingRequests.mockResolvedValue([]);
  isCoach.mockReturnValue(true);
  isAdmin.mockReturnValue(false);
});

describe('loading', () => {
  it('always passes the organization, never relying on the default', async () => {
    // fetchCoaches declares schoolId = 'bhs'; a bare call shows a club coach
    // Beaumont's staff, which is what app.core.js:523 does.
    const s = useCoachesStore();
    await s.load('s1');
    expect(fetchCoaches).toHaveBeenCalledWith('s1');
  });

  it('claims nothing without an organization', async () => {
    const s = useCoachesStore();
    await s.load(null);
    expect(fetchCoaches).not.toHaveBeenCalled();
    expect(s.loadedSchoolId).toBeNull();
  });

  it('orders the staff by seniority', async () => {
    fetchCoaches.mockResolvedValue([
      row({ id: 'a', name: 'Asst', level: 'Assistant Coach' }),
      row({ id: 'h', name: 'Head', level: 'Head Coach' })
    ]);
    const s = useCoachesStore();
    await s.load('s1');
    expect(s.staff.map(c => c.id)).toEqual(['h', 'a']);
  });

  it('records a failure rather than throwing', async () => {
    fetchCoaches.mockRejectedValue(new Error('offline'));
    const s = useCoachesStore();
    await s.load('s1');
    expect(s.loadError).toBe('offline');
  });
});

describe('adding and editing', () => {
  it('saves against the resolved organization', async () => {
    const s = useCoachesStore();
    expect((await s.addCoach(form, 's1')).ok).toBe(true);
    expect(upsertCoach).toHaveBeenCalledWith('s1', expect.objectContaining({
      name: 'New Coach', level: 'Assistant Coach'
    }));
  });

  it('refuses a blank name rather than letting it become "Coach"', async () => {
    // upsertCoach substitutes 'Coach' for a blank name, which would put a
    // person of that name on the staff page.
    const s = useCoachesStore();
    const res = await s.addCoach({ name: '  ', level: 'Head Coach' }, 's1');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/name is required/i);
    expect(upsertCoach).not.toHaveBeenCalled();
  });

  it('refuses a blank role rather than letting it become "Staff"', async () => {
    const s = useCoachesStore();
    expect((await s.addCoach({ name: 'A', level: '' }, 's1')).error)
      .toMatch(/role is required/i);
    expect(upsertCoach).not.toHaveBeenCalled();
  });

  it('refuses without an organization', async () => {
    const s = useCoachesStore();
    expect((await s.addCoach(form, '')).ok).toBe(false);
    expect(upsertCoach).not.toHaveBeenCalled();
  });

  it('treats a null return as failure', async () => {
    upsertCoach.mockResolvedValue(null);
    const s = useCoachesStore();
    expect((await s.addCoach(form, 's1')).ok).toBe(false);
  });

  it('leaves an absent photo empty rather than defaulting one', async () => {
    // Assigning a stock face makes a coach without a photo look like they
    // have one; the view renders a silhouette instead.
    const s = useCoachesStore();
    await s.addCoach(form, 's1');
    expect(upsertCoach).toHaveBeenCalledWith('s1', expect.objectContaining({ photo: '' }));
  });

  it('carries the id through an edit', async () => {
    const s = useCoachesStore();
    await s.updateCoach('c1', form, 's1');
    expect(upsertCoach).toHaveBeenCalledWith('s1', expect.objectContaining({ id: 'c1' }));
  });
});

describe('removing a coach', () => {
  it('verifies the removal by reloading, since deleteCoach reports nothing', async () => {
    fetchCoaches.mockResolvedValue([]);
    const s = useCoachesStore();
    const res = await s.removeCoach('c1', 's1');

    expect(deleteCoach).toHaveBeenCalledWith('c1');
    expect(res.ok).toBe(true);
  });

  it('reports failure when the coach is still there afterwards', async () => {
    // deleteCoach logs its error and returns undefined either way, so the
    // only honest check is whether the row survived.
    fetchCoaches.mockResolvedValue([row()]);
    const s = useCoachesStore();
    const res = await s.removeCoach('c1', 's1');

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/permission/i);
  });

  it('refuses without an organization', async () => {
    const s = useCoachesStore();
    expect((await s.removeCoach('c1', '')).ok).toBe(false);
    expect(deleteCoach).not.toHaveBeenCalled();
  });
});

describe('pending requests', () => {
  it('reads the requests this viewer may act on', async () => {
    isCoach.mockReturnValue(true);
    fetchPendingRequests.mockResolvedValue([{ id: 'u1' }]);
    const s = useCoachesStore();
    await s.loadPending();
    expect(s.pending).toEqual([{ id: 'u1' }]);
  });

  it('reads nothing for a visitor who is neither coach nor admin', async () => {
    isCoach.mockReturnValue(false);
    isAdmin.mockReturnValue(false);
    const s = useCoachesStore();
    await s.loadPending();
    expect(fetchPendingRequests).not.toHaveBeenCalled();
    expect(s.pending).toEqual([]);
  });

  it('shows nobody waiting when the read fails, without breaking the page', async () => {
    isCoach.mockReturnValue(true);
    fetchPendingRequests.mockResolvedValue(null);
    const s = useCoachesStore();
    await s.loadPending();
    expect(s.pending).toEqual([]);
  });
});
