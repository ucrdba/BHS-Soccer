/**
 * Recording a session.
 *
 * The assertions that matter most are about what happens around a save rather
 * than the save itself. Points are derived in Postgres, so nothing moves until
 * a re-read — and the edit id is the difference between correcting a session
 * and recording a second one for the same day, which would double everyone's
 * `available`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const fetchTeamSessionHistory = vi.fn();
const fetchMatrixSessions = vi.fn();
const fetchMatrixSessionResults = vi.fn();
const fetchDrillsForWeighting = vi.fn();
const fetchTimeBands = vi.fn();
const fetchGoalBands = vi.fn();
const saveMatrixSession = vi.fn();
const deleteMatrixSession = vi.fn();

vi.mock('../data/supabase', () => ({
  supabaseService: {
    fetchTeamSessionHistory: (...a: any[]) => fetchTeamSessionHistory(...a),
    fetchMatrixSessions: (...a: any[]) => fetchMatrixSessions(...a),
    fetchMatrixSessionResults: (...a: any[]) => fetchMatrixSessionResults(...a),
    fetchDrillsForWeighting: (...a: any[]) => fetchDrillsForWeighting(...a),
    fetchTimeBands: (...a: any[]) => fetchTimeBands(...a),
    fetchGoalBands: (...a: any[]) => fetchGoalBands(...a),
    saveMatrixSession: (...a: any[]) => saveMatrixSession(...a),
    deleteMatrixSession: (...a: any[]) => deleteMatrixSession(...a)
  }
}));

const { useSessionStore } = await import('./session');

const LAPS = 'd-laps';      // time_bands — has standards
const SMALL = 'd-small';    // win_loss — has none
const GOALS = 'd-goals';    // role_goals — has goal bands

const DRILLS = [
  { id: LAPS, name: '3 Laps', measure: 'time_bands', points: 3 },
  { id: SMALL, name: 'Small Sided', measure: 'win_loss', points: 2 },
  { id: GOALS, name: '1v1 Attack', measure: 'role_goals', points: 3 }
];

const SESSIONS = [
  { id: 's1', drill_id: LAPS, occurred_on: '2026-09-04', drills_bank: { name: '3 Laps' } },
  { id: 's2', drill_id: SMALL, occurred_on: '2026-09-01', drills_bank: { name: 'Small Sided' } }
];

const BANDS = [
  { id: 'b1', drill_id: LAPS, team_id: 't1', max_seconds: 270, factor: 1 }
];

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  fetchMatrixSessions.mockResolvedValue(SESSIONS);
  fetchTeamSessionHistory.mockResolvedValue([]);
  fetchMatrixSessionResults.mockResolvedValue([]);
  fetchDrillsForWeighting.mockResolvedValue(DRILLS);
  fetchTimeBands.mockResolvedValue(BANDS);
  saveMatrixSession.mockResolvedValue({ ok: true, id: 's9' });
  deleteMatrixSession.mockResolvedValue({ ok: true });
});

describe('loading', () => {
  it('reads the history for the team', async () => {
    const s = useSessionStore();
    await s.loadHistory('t1');
    expect(fetchMatrixSessions).toHaveBeenCalledWith('t1');
    expect(s.sessions).toHaveLength(2);
  });

  it('reads the drill library for the ORGANIZATION, never bare', async () => {
    // fetchDrillsForWeighting returns null rather than defaulting to
    // Beaumont's library, so a bare call leaves the exercise picker silently
    // empty. That is the failure Phase 3a hit.
    const s = useSessionStore();
    await s.loadDrills('school-1');
    expect(fetchDrillsForWeighting).toHaveBeenCalledWith('school-1');
    expect(s.drills).toHaveLength(DRILLS.length);
  });

  it('does not call for drills at all without an organization', async () => {
    const s = useSessionStore();
    await s.loadDrills(null);
    expect(fetchDrillsForWeighting).not.toHaveBeenCalled();
    expect(s.loadError).toMatch(/team|organization/i);
  });

  it('reports a failed read rather than showing an empty history', async () => {
    fetchMatrixSessions.mockResolvedValue(null);
    const s = useSessionStore();
    await s.loadHistory('t1');
    expect(s.loadError).toBeTruthy();
    expect(s.sessions).toEqual([]);
  });
});

describe('the standards a squad is held to', () => {
  it('fetches bands for a banded exercise, scoped to the squad', async () => {
    // A JV standard is not a Varsity standard, so the team is half the key.
    const s = useSessionStore();
    await s.loadBands(LAPS, 't1');
    expect(fetchTimeBands).toHaveBeenCalledWith(LAPS, 't1');
    expect(s.bands).toHaveLength(1);
  });

  it('does not fetch bands for an exercise that has none', async () => {
    // A wasted round trip whose empty result would then read as "no standards
    // set" for a drill that cannot have any.
    const s = useSessionStore();
    s.drills = DRILLS;
    await s.loadBands(SMALL, 't1');
    expect(fetchTimeBands).not.toHaveBeenCalled();
    expect(s.bands).toEqual([]);
  });

  it('clears the bands of the exercise it switched away from', async () => {
    const s = useSessionStore();
    s.drills = DRILLS;
    await s.loadBands(LAPS, 't1');
    await s.loadBands(SMALL, 't1');
    expect(s.bands).toEqual([]);
  });
});

describe('opening a session', () => {
  it('starts a new one with no edit id', async () => {
    const s = useSessionStore();
    await s.openNew(LAPS, 't1');
    expect(s.editingId).toBeNull();
    expect(s.results).toEqual([]);
  });

  it('reopens an existing one with its id and its results', async () => {
    // The id is what makes saveMatrixSession upsert rather than insert a
    // second session for the same exercise and day.
    fetchMatrixSessionResults.mockResolvedValue([
      { player_id: 'p1', attendance: 'present', raw_value: 250 }
    ]);
    const s = useSessionStore();
    s.sessions = SESSIONS;
    await s.openExisting('s1', 't1');
    expect(s.editingId).toBe('s1');
    expect(s.results).toHaveLength(1);
    expect(fetchMatrixSessionResults).toHaveBeenCalledWith('s1');
  });

  it('reads the history when the session is not already known', async () => {
    // SessionEntryView opens this URL directly -- from the Edit button, a
    // bookmark or a reload -- and never loads the history itself. Without
    // this the session row is not there to read, so the date box opens blank
    // and the coach retypes it, MOVING the session to whatever they type.
    const s = useSessionStore();
    await s.openExisting('s1', 't1');
    expect(fetchMatrixSessions).toHaveBeenCalledWith('t1');
    expect(s.sessions.find(x => x.id === 's1')?.occurred_on).toBe('2026-09-04');
  });

  it('does not re-read a history it already has', async () => {
    const s = useSessionStore();
    s.sessions = SESSIONS;
    await s.openExisting('s1', 't1');
    expect(fetchMatrixSessions).not.toHaveBeenCalled();
  });

  it('loads the bands of the session being edited', async () => {
    const s = useSessionStore();
    s.sessions = SESSIONS;
    s.drills = DRILLS;
    await s.openExisting('s1', 't1');
    expect(fetchTimeBands).toHaveBeenCalledWith(LAPS, 't1');
  });
});

describe('saving', () => {
  const payload = () => ({
    session: { drillId: LAPS, occurredOn: '2026-09-06' },
    results: [{ playerId: 'p1', attendance: 'present', rawValue: 250, outcome: null }]
  });

  it('passes the edit id so a correction upserts', async () => {
    const s = useSessionStore();
    s.sessions = SESSIONS;
    await s.openExisting('s1', 't1');
    const { session, results } = payload();
    await s.save('t1', session, results as any);

    expect(saveMatrixSession).toHaveBeenCalledWith(
      't1', expect.objectContaining({ id: 's1' }), results);
  });

  it('sends no id for a new session', async () => {
    const s = useSessionStore();
    const { session, results } = payload();
    await s.save('t1', session, results as any);
    expect(saveMatrixSession.mock.calls[0][1].id).toBeUndefined();
  });

  it('reloads the history rather than patching it', async () => {
    // Standings are derived in Postgres; nothing moves until a re-read, and a
    // locally added row would show a number the database does not hold.
    const s = useSessionStore();
    const { session, results } = payload();
    await s.save('t1', session, results as any);
    expect(fetchMatrixSessions).toHaveBeenCalledWith('t1');
  });

  it('clears the edit id after a successful save', async () => {
    // Leaving it set makes the next "record a session" overwrite the one just
    // edited instead of creating a new one.
    const s = useSessionStore();
    s.sessions = SESSIONS;
    await s.openExisting('s1', 't1');
    const { session, results } = payload();
    await s.save('t1', session, results as any);
    expect(s.editingId).toBeNull();
  });

  it('KEEPS the edit id when the save is refused', async () => {
    // Clearing it would turn the coach's retry into a second session for the
    // same day, doubling everyone's available.
    saveMatrixSession.mockResolvedValue({ ok: false, error: 'Refused.' });
    const s = useSessionStore();
    s.sessions = SESSIONS;
    await s.openExisting('s1', 't1');
    const { session, results } = payload();
    const res = await s.save('t1', session, results as any);

    expect(res.ok).toBe(false);
    expect(s.editingId).toBe('s1');
  });

  it('reports the reason the database gave', async () => {
    saveMatrixSession.mockResolvedValue({ ok: false, error: 'Only a coach of this team can record sessions.' });
    const s = useSessionStore();
    const { session, results } = payload();
    const res = await s.save('t1', session, results as any);
    expect(res.error).toMatch(/only a coach/i);
  });

  it('refuses to save without a team rather than calling bare', async () => {
    const s = useSessionStore();
    const { session, results } = payload();
    const res = await s.save(null, session, results as any);
    expect(res.ok).toBe(false);
    expect(saveMatrixSession).not.toHaveBeenCalled();
  });
});

describe('deleting a session', () => {
  it('reloads afterwards, because the standings re-derive', async () => {
    const s = useSessionStore();
    await s.remove('s1', 't1');
    expect(deleteMatrixSession).toHaveBeenCalledWith('s1');
    expect(fetchMatrixSessions).toHaveBeenCalledWith('t1');
  });

  it('reports the refusal the database gave, not a generic message', async () => {
    deleteMatrixSession.mockResolvedValue({ ok: false, error: 'Not your team.' });
    const s = useSessionStore();
    const res = await s.remove('s1', 't1');
    expect(res.error).toBe('Not your team.');
  });

  it('does not reload after a refused delete', async () => {
    deleteMatrixSession.mockResolvedValue({ ok: false, error: 'Not your team.' });
    const s = useSessionStore();
    await s.remove('s1', 't1');
    expect(fetchMatrixSessions).not.toHaveBeenCalled();
  });
});

describe('the shape the history is read in', () => {
  /*
   * loadHistory once called fetchTeamSessionHistory, which reads the same
   * table and returns something else: one row per RESULT, in camelCase, for
   * the progress and squad reports. This store and SessionHistory want one
   * row per SESSION.
   *
   * Every symptom followed from that one swap -- the drill name fell back to
   * "Exercise (since removed)" on every row, the dates were blank, the count
   * was results rather than sessions, and Delete sent the string "undefined"
   * to Postgres as a uuid. The tests missed it because their mock returned
   * session-shaped rows from the method that does not produce them.
   */
  it('reads the per-session list, not the per-result one', async () => {
    const store = useSessionStore();
    await store.loadHistory('t1');

    expect(fetchMatrixSessions).toHaveBeenCalledWith('t1');
    expect(fetchTeamSessionHistory).not.toHaveBeenCalled();
  });

  it('holds rows carrying the fields the history screen reads', async () => {
    const store = useSessionStore();
    await store.loadHistory('t1');

    const [row] = store.sessions;
    // Named individually rather than deep-equalled: these four are what
    // SessionHistory and openExisting actually reach for, and a row missing
    // any of them renders or deletes wrongly without throwing.
    expect(row.id).toBeTruthy();
    expect(row.drill_id).toBeTruthy();
    expect(row.occurred_on).toBeTruthy();
    expect(row).toHaveProperty('drills_bank');
  });

  it('carries an id a delete can actually use', async () => {
    const store = useSessionStore();
    await store.loadHistory('t1');
    await store.remove(store.sessions[0].id, 't1');

    expect(deleteMatrixSession).toHaveBeenCalledWith('s1');
    expect(deleteMatrixSession).not.toHaveBeenCalledWith(undefined);
  });
});

describe('Goals-by-role standards', () => {
  it('loads goal bands, not time bands, for a role_goals drill', async () => {
    fetchGoalBands.mockResolvedValue([{ role: 'attack', kind: 'base', threshold: 0, factor: 1 }]);
    const s = useSessionStore();
    s.drills = DRILLS;
    await s.loadBands(GOALS, 't1');
    expect(fetchGoalBands).toHaveBeenCalledWith(GOALS, 't1');
    expect(fetchTimeBands).not.toHaveBeenCalled();
    expect(s.goalBands).toHaveLength(1);
    expect(s.bands).toEqual([]);
  });

  it('clears the goal bands when switching to another exercise', async () => {
    fetchGoalBands.mockResolvedValue([{ role: 'attack', kind: 'base', threshold: 0, factor: 1 }]);
    const s = useSessionStore();
    s.drills = DRILLS;
    await s.loadBands(GOALS, 't1');
    await s.loadBands(SMALL, 't1');
    expect(s.goalBands).toEqual([]);
  });

  it('treats a failed read as no standards rather than throwing', async () => {
    fetchGoalBands.mockResolvedValue(null);
    const s = useSessionStore();
    s.drills = DRILLS;
    await s.loadBands(GOALS, 't1');
    expect(s.goalBands).toEqual([]);
  });
});
