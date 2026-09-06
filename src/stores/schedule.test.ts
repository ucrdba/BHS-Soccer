/**
 * The schedule store, and its writes.
 *
 * Two rules here are not obvious and both have teeth.
 *
 * The date is CONVERTED, never passed through. parse_match_date() reads
 * "MON D YYYY" and returns null for an ISO date — proved against a real
 * Postgres in src/data/testdb/team-membership.test.ts — so storing the date
 * input's own value leaves match_on null and the fixture sorts as though it
 * had no date, while still reading correctly on screen.
 *
 * And an EMPTY address clears the stored one, while an ABSENT key leaves it
 * alone. A coach removing a wrong address needs the directions link to
 * disappear; the importer needs a sheet with no Address column to change
 * nothing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const fetchSchedule = vi.fn();
const upsertMatch = vi.fn();
const deleteMatch = vi.fn();

vi.mock('../data/supabase', () => ({
  supabaseService: {
    fetchSchedule: (...a: any[]) => fetchSchedule(...a),
    upsertMatch: (...a: any[]) => upsertMatch(...a),
    deleteMatch: (...a: any[]) => deleteMatch(...a)
  }
}));

const { useScheduleStore } = await import('./schedule');

const row = (over: any = {}) => ({
  id: 'm1', match_date: 'SEP 4 2026', match_time: '6:00 PM',
  match_on: '2026-09-04', kickoff_time: '18:00:00',
  opponent: 'Yucaipa', location: 'Home Field', venue_address: null,
  status: 'SCHEDULED', is_home: true, score: null, result: null, ...over
});

const form = {
  date: '2026-09-04', time: '18:00', opponent: 'Yucaipa',
  location: 'Home Field', status: 'SCHEDULED', isHome: true
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  fetchSchedule.mockResolvedValue([row()]);
  upsertMatch.mockResolvedValue({ id: 'm1' });
  deleteMatch.mockResolvedValue({ ok: true });
});

describe('loading', () => {
  it('maps the fixtures and records the team', async () => {
    const s = useScheduleStore();
    await s.load('t1');
    expect(s.matches.map(m => m.id)).toEqual(['m1']);
    expect(s.loadedTeamId).toBe('t1');
  });

  it('claims nothing without a team', async () => {
    const s = useScheduleStore();
    await s.load(null);
    expect(fetchSchedule).not.toHaveBeenCalled();
    expect(s.loadedTeamId).toBeNull();
  });
});

describe('adding a fixture', () => {
  it('converts the date to the format the trigger can read', async () => {
    // An ISO date would leave match_on null and the fixture dateless.
    const s = useScheduleStore();
    await s.addMatch(form as any, 't1');
    expect(upsertMatch).toHaveBeenCalledWith('t1',
      expect.objectContaining({ date: 'SEP 4, 2026' }));
  });

  it('converts the time to twelve hours', async () => {
    const s = useScheduleStore();
    await s.addMatch(form as any, 't1');
    expect(upsertMatch).toHaveBeenCalledWith('t1',
      expect.objectContaining({ time: '6:00 PM' }));
  });

  it('reloads afterwards rather than patching local state', async () => {
    const s = useScheduleStore();
    await s.addMatch(form as any, 't1');
    expect(fetchSchedule).toHaveBeenCalledWith('t1');
  });

  it('refuses without a team, before any write', async () => {
    const s = useScheduleStore();
    expect((await s.addMatch(form as any, '')).ok).toBe(false);
    expect(upsertMatch).not.toHaveBeenCalled();
  });

  it('refuses a blank location with a sentence, not a constraint error', async () => {
    // schedule.location is NOT NULL, verified against a real Postgres.
    const s = useScheduleStore();
    const res = await s.addMatch({ ...form, location: '  ' } as any, 't1');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/location is required/i);
    expect(upsertMatch).not.toHaveBeenCalled();
  });

  it('treats a null return as failure rather than success', async () => {
    // upsertMatch returns null for a refusal, deliberately.
    upsertMatch.mockResolvedValue(null);
    const s = useScheduleStore();
    expect((await s.addMatch(form as any, 't1')).ok).toBe(false);
  });

  it('records a result only for a completed fixture', async () => {
    const s = useScheduleStore();
    await s.addMatch({ ...form, status: 'COMPLETED', score: '3 - 1' } as any, 't1');
    expect(upsertMatch).toHaveBeenCalledWith('t1',
      expect.objectContaining({ result: '3 - 1', score: '3 - 1' }));

    vi.clearAllMocks();
    upsertMatch.mockResolvedValue({ id: 'm1' });
    await s.addMatch({ ...form, status: 'SCHEDULED', score: '' } as any, 't1');
    expect(upsertMatch).toHaveBeenCalledWith('t1',
      expect.objectContaining({ result: null, score: null }));
  });

  it('reads isHome from a string as well as a boolean', async () => {
    // The legacy form submits "true" as text.
    const s = useScheduleStore();
    await s.addMatch({ ...form, isHome: 'true' } as any, 't1');
    expect(upsertMatch).toHaveBeenCalledWith('t1', expect.objectContaining({ isHome: true }));
  });
});

describe('the venue address', () => {
  it('clears it when the box is emptied', async () => {
    // A coach removing a wrong address needs the directions link to go.
    const s = useScheduleStore();
    await s.addMatch({ ...form, venueAddress: '' } as any, 't1');
    expect(upsertMatch).toHaveBeenCalledWith('t1',
      expect.objectContaining({ venueAddress: null }));
  });

  it('trims what is typed', async () => {
    const s = useScheduleStore();
    await s.addMatch({ ...form, venueAddress: '  1 Cougar Way  ' } as any, 't1');
    expect(upsertMatch).toHaveBeenCalledWith('t1',
      expect.objectContaining({ venueAddress: '1 Cougar Way' }));
  });

  it('leaves it untouched when the key is absent', async () => {
    // What the importer relies on: a sheet with no Address column changes
    // nothing, rather than wiping every address it did not mention.
    const s = useScheduleStore();
    await s.addMatch(form as any, 't1');
    expect(Object.keys(upsertMatch.mock.calls[0][1])).not.toContain('venueAddress');
  });
});

describe('editing and deleting', () => {
  it('carries the id through an edit', async () => {
    const s = useScheduleStore();
    await s.updateMatch('m1', form as any, 't1');
    expect(upsertMatch).toHaveBeenCalledWith('t1', expect.objectContaining({ id: 'm1' }));
  });

  it('refuses an edit with a blank location too', async () => {
    const s = useScheduleStore();
    expect((await s.updateMatch('m1', { ...form, location: '' } as any, 't1')).ok).toBe(false);
    expect(upsertMatch).not.toHaveBeenCalled();
  });

  it('deletes and reloads', async () => {
    const s = useScheduleStore();
    expect((await s.removeMatch('m1', 't1')).ok).toBe(true);
    expect(deleteMatch).toHaveBeenCalledWith('m1');
    expect(fetchSchedule).toHaveBeenCalledWith('t1');
  });

  it('surfaces a refused delete', async () => {
    deleteMatch.mockResolvedValue({ ok: false, error: 'not permitted' });
    const s = useScheduleStore();
    expect((await s.removeMatch('m1', 't1')).error).toBe('not permitted');
  });

  it('refuses a delete with no team', async () => {
    const s = useScheduleStore();
    expect((await s.removeMatch('m1', '')).ok).toBe(false);
    expect(deleteMatch).not.toHaveBeenCalled();
  });
});
