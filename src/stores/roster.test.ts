/**
 * The roster, and the first writes this migration makes to Postgres.
 *
 * Everything before this phase was read-only. The failures worth guarding
 * against here are the silent ones: a write that reports success and did
 * nothing, a write that lands unscoped, and a half-saved edit reported as a
 * total failure so the coach re-enters something already stored.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const fetchTeamRoster = vi.fn();
const upsertPlayerIdentity = vi.fn();
const upsertTeamMembership = vi.fn();
const deleteTeamMembership = vi.fn();

vi.mock('../data/supabase', () => ({
  supabaseService: {
    fetchTeamRoster: (...a: any[]) => fetchTeamRoster(...a),
    upsertPlayerIdentity: (...a: any[]) => upsertPlayerIdentity(...a),
    upsertTeamMembership: (...a: any[]) => upsertTeamMembership(...a),
    deleteTeamMembership: (...a: any[]) => deleteTeamMembership(...a)
  }
}));

const { useRosterStore } = await import('./roster');

const row = (id: string, name: string, over: any = {}) => ({
  id: 'tp-' + id, number: 7, recording_number: 21, position: 8,
  season_stats: {}, ratings: {},
  players: { id, name, first_name: name.split(' ')[0], last_name: name.split(' ')[1] || '' },
  ...over
});

const form = { firstName: 'Cesar', lastName: 'Alva', number: '7', position: 8 };

beforeEach(() => {
  setActivePinia(createPinia());
  // restoreMocks in vitest.config restores spies, not vi.fn() call history,
  // so "was never called" assertions would otherwise see earlier tests' calls.
  vi.clearAllMocks();
  fetchTeamRoster.mockResolvedValue([row('p1', 'Cesar Alva'), row('p2', 'Tom Budde')]);
  upsertPlayerIdentity.mockResolvedValue({ id: 'p1' });
  upsertTeamMembership.mockResolvedValue({ ok: true });
  deleteTeamMembership.mockResolvedValue({ ok: true });
});

describe('loading', () => {
  it('maps the team roster', async () => {
    const s = useRosterStore();
    await s.load('t1');
    expect(s.players.map(p => p.id)).toEqual(['p1', 'p2']);
    expect(s.loadedTeamId).toBe('t1');
  });

  it('uses fetchTeamRoster, which has no school default', async () => {
    // fetchPlayers defaults schoolId to 'bhs' and would silently serve
    // Beaumont's squad to a club coach.
    const s = useRosterStore();
    await s.load('t1');
    expect(fetchTeamRoster).toHaveBeenCalledWith('t1');
  });

  it('claims nothing without a team', async () => {
    const s = useRosterStore();
    await s.load(null);
    expect(s.players).toEqual([]);
    expect(s.loadedTeamId).toBeNull();
    expect(fetchTeamRoster).not.toHaveBeenCalled();
  });

  it('records a failure rather than throwing', async () => {
    fetchTeamRoster.mockRejectedValue(new Error('offline'));
    const s = useRosterStore();
    await s.load('t1');
    expect(s.loadError).toBe('offline');
    expect(s.loading).toBe(false);
  });

  it('sorts and filters what it shows', async () => {
    fetchTeamRoster.mockResolvedValue([
      row('p1', 'Cesar Alva', { number: 9, position: 9 }),
      row('p2', 'Tom Budde', { number: 2, position: 4 })
    ]);
    const s = useRosterStore();
    await s.load('t1');

    expect(s.visible.map(p => p.id)).toEqual(['p2', 'p1']);
    s.setFilter('FWD');
    expect(s.visible.map(p => p.id)).toEqual(['p1']);
  });
});

describe('adding a player', () => {
  it('saves the identity, then the membership, then reloads', async () => {
    const s = useRosterStore();
    const res = await s.addPlayer(form as any, 't1', 's1');

    expect(res.ok).toBe(true);
    expect(upsertPlayerIdentity).toHaveBeenCalled();
    expect(upsertTeamMembership).toHaveBeenCalledWith('t1', 's1',
      expect.objectContaining({ player_id: 'p1', number: 7 }));
    // Reloaded, not patched: what is on screen is what is in Postgres.
    expect(fetchTeamRoster).toHaveBeenCalledWith('t1');
  });

  it('refuses without a team or a school', async () => {
    const s = useRosterStore();
    expect((await s.addPlayer(form as any, '', 's1')).ok).toBe(false);
    expect((await s.addPlayer(form as any, 't1', '')).ok).toBe(false);
    expect(upsertPlayerIdentity).not.toHaveBeenCalled();
  });

  it('surfaces a null identity write instead of reporting success', async () => {
    // upsertPlayerIdentity returns null for failure; ignoring the return is
    // how a silent loss gets reported as a save.
    upsertPlayerIdentity.mockResolvedValue(null);
    const s = useRosterStore();
    const res = await s.addPlayer(form as any, 't1', 's1');

    expect(res.ok).toBe(false);
    expect(upsertTeamMembership).not.toHaveBeenCalled();
  });

  it('surfaces a failed membership write', async () => {
    upsertTeamMembership.mockResolvedValue({ ok: false, error: 'already on another team' });
    const s = useRosterStore();
    const res = await s.addPlayer(form as any, 't1', 's1');

    expect(res.ok).toBe(false);
    expect(res.error).toContain('already on another team');
  });

  it('turns blank numbers into null rather than NaN', async () => {
    const s = useRosterStore();
    await s.addPlayer({ ...form, number: '', recordingNumber: undefined } as any, 't1', 's1');
    expect(upsertTeamMembership).toHaveBeenCalledWith('t1', 's1',
      expect.objectContaining({ number: null, recording_number: null }));
  });

  it('writes the position as a number, and a blank one as null', async () => {
    // Not .at(-1): this project's tsconfig lib target predates it.
    const last = (calls: any[][]) => calls[calls.length - 1];
    const s = useRosterStore();
    await s.addPlayer({ ...form, position: 8 }, 't1', 's1');
    expect(last(upsertTeamMembership.mock.calls)[2]).toMatchObject({ position: 8 });
    await s.addPlayer({ ...form, position: null }, 't1', 's1');
    expect(last(upsertTeamMembership.mock.calls)[2]).toMatchObject({ position: null });
  });
});

describe('adding an existing person to the team', () => {
  it('creates only the membership', async () => {
    const s = useRosterStore();
    const res = await s.addExistingPlayer('p9', 't1', 's1');

    expect(res.ok).toBe(true);
    expect(upsertPlayerIdentity).not.toHaveBeenCalled();
    expect(upsertTeamMembership).toHaveBeenCalledWith('t1', 's1', { player_id: 'p9' });
  });

  it('explains the one-team-per-organization rule when it is hit', async () => {
    upsertTeamMembership.mockResolvedValue({ ok: false });
    const s = useRosterStore();
    const res = await s.addExistingPlayer('p9', 't1', 's1');

    expect(res.error).toMatch(/another team in this organization/i);
  });
});

describe('editing a player', () => {
  it('saves the identity and the membership', async () => {
    const s = useRosterStore();
    const res = await s.updatePlayer('p1', form as any, 't1', 's1');

    expect(res.ok).toBe(true);
    expect(upsertPlayerIdentity).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
  });

  it('reports a half-saved edit as half-saved, not as a total failure', async () => {
    // The profile went in and this team's fields did not. Calling it a total
    // failure sends the coach to re-enter something already stored.
    upsertTeamMembership.mockResolvedValue({ ok: false, error: 'RLS refused.' });
    const s = useRosterStore();
    const res = await s.updatePlayer('p1', form as any, 't1', 's1');

    expect(res.ok).toBe(false);
    expect(res.partial).toBe(true);
    expect(res.error).toContain('profile was updated');
  });
});

describe('removing a player', () => {
  it('deletes the membership, never the person', async () => {
    // They may be on a club side too, and their Matrix history is theirs.
    const s = useRosterStore();
    const res = await s.removePlayer('p1', 't1');

    expect(res.ok).toBe(true);
    expect(deleteTeamMembership).toHaveBeenCalledWith('t1', 'p1');
  });

  it('refuses without a team', async () => {
    const s = useRosterStore();
    expect((await s.removePlayer('p1', '')).ok).toBe(false);
    expect(deleteTeamMembership).not.toHaveBeenCalled();
  });

  it('surfaces a refusal', async () => {
    deleteTeamMembership.mockResolvedValue({ ok: false, error: 'not permitted' });
    const s = useRosterStore();
    expect((await s.removePlayer('p1', 't1')).error).toBe('not permitted');
  });
});
