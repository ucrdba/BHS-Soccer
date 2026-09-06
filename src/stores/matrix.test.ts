/**
 * The Competitive Matrix store.
 *
 * Points are derived in Postgres rather than stored, which drives two of the
 * behaviours below: a correction reloads instead of patching, because the view
 * has re-derived every rank; and the standings are left-joined, so a player who
 * has taken part in nothing still appears on their own squad's board.
 *
 * The threshold emphasis is asserted as emphasis: the leaderboard keeps every
 * row whether or not an exercise is a standard.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const fetchTeamRoster = vi.fn();
const fetchMatrixStandings = vi.fn();
const fetchTeamExercisePoints = vi.fn();
const fetchDrillsForWeighting = vi.fn();
const fetchMatrixLogs = vi.fn();
const deleteMatrixResult = vi.fn();

vi.mock('../data/supabase', () => ({
  supabaseService: {
    fetchTeamRoster: (...a: any[]) => fetchTeamRoster(...a),
    fetchMatrixStandings: (...a: any[]) => fetchMatrixStandings(...a),
    fetchTeamExercisePoints: (...a: any[]) => fetchTeamExercisePoints(...a),
    fetchDrillsForWeighting: (...a: any[]) => fetchDrillsForWeighting(...a),
    fetchMatrixLogs: (...a: any[]) => fetchMatrixLogs(...a),
    deleteMatrixResult: (...a: any[]) => deleteMatrixResult(...a)
  }
}));

const { useMatrixStore } = await import('./matrix');

const LAPS = 'd-laps';       // time_bands — a standard
const SMALL = 'd-small';     // win_loss — competitive

const member = (id: string, name: string, number: number) => ({
  id: 'tp-' + id, number, recording_number: number, position: 'Mid',
  season_stats: {}, ratings: {},
  players: { id, name, first_name: name, last_name: '', class_year: 'Senior' }
});

const point = (over: any = {}) => ({
  player_id: 'p1', drill_id: LAPS, raw_value: 250, weight: 1,
  earned: 1, available: 1, w: 0, dr: 0, ls: 0, ...over
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  fetchTeamRoster.mockResolvedValue([
    member('p1', 'Alva', 1), member('p2', 'Budde', 2), member('p3', 'Renteria', 3)
  ]);
  fetchMatrixStandings.mockResolvedValue([
    { player_id: 'p1', wins: 2, draws: 0, losses: 0, games: 2, exercises: 2,
      earned: 2, available: 2, share: 100, rank: 1 }
  ]);
  fetchTeamExercisePoints.mockResolvedValue([point()]);
  fetchDrillsForWeighting.mockResolvedValue([
    { id: LAPS, name: '3 Laps', measure: 'time_bands' },
    { id: SMALL, name: 'Small Sided', measure: 'win_loss' }
  ]);
  fetchMatrixLogs.mockResolvedValue([]);
  deleteMatrixResult.mockResolvedValue({ ok: true });
});

describe('loading', () => {
  it('scopes results to the team and the drill library to the organization', async () => {
    // fetchDrillsForWeighting refuses without a school rather than defaulting
    // to one, so a bare call would leave the exercise picker silently empty.
    const s = useMatrixStore();
    await s.load('t1', 's1');

    expect(fetchTeamRoster).toHaveBeenCalledWith('t1');
    expect(fetchMatrixStandings).toHaveBeenCalledWith('t1');
    expect(fetchDrillsForWeighting).toHaveBeenCalledWith('s1');
  });

  it('keeps a player who has taken part in nothing', async () => {
    const s = useMatrixStore();
    await s.load('t1', 's1');
    expect(s.boardRows).toHaveLength(3);
  });

  it('claims nothing without a team', async () => {
    const s = useMatrixStore();
    await s.load(null, 's1');
    expect(fetchTeamRoster).not.toHaveBeenCalled();
    expect(s.loadedTeamId).toBeNull();
  });

  it('records a failure rather than throwing', async () => {
    fetchTeamRoster.mockRejectedValue(new Error('offline'));
    const s = useMatrixStore();
    await s.load('t1', 's1');
    expect(s.loadError).toBe('offline');
    expect(s.loading).toBe(false);
  });
});

describe('the board', () => {
  it('orders by rank by default, sinking the unplayed', async () => {
    const s = useMatrixStore();
    await s.load('t1', 's1');
    expect(s.boardRows[0].playerId).toBe('p1');
  });

  it('sorts by a column, and reverses on a second click', async () => {
    const s = useMatrixStore();
    await s.load('t1', 's1');

    s.setBoardSort('name');
    expect(s.boardSort).toEqual({ by: 'name', reversed: false });
    const forward = s.boardRows.map(r => r.name);

    s.setBoardSort('name');
    expect(s.boardSort.reversed).toBe(true);
    expect(s.boardRows.map(r => r.name)).toEqual(forward.slice().reverse());
  });

  it('reports which way a column reads, for the header arrow', async () => {
    const s = useMatrixStore();
    await s.load('t1', 's1');
    // Points read highest-first; a name reads lowest-first.
    expect(s.boardDescends('earned')).toBe(true);
    expect(s.boardDescends('name')).toBe(false);
  });
});

describe('the exercise leaderboard', () => {
  it('is empty until an exercise is chosen', async () => {
    const s = useMatrixStore();
    await s.load('t1', 's1');
    expect(s.leaderboard).toEqual([]);
  });

  it('lists only exercises that have results', async () => {
    const s = useMatrixStore();
    await s.load('t1', 's1');
    expect(s.exercises.map(d => d.id)).toEqual([LAPS]);
  });

  it('narrows to the chosen exercise', async () => {
    const s = useMatrixStore();
    await s.load('t1', 's1');
    s.setExerciseFilter(LAPS);
    expect(s.leaderboard.length).toBeGreaterThan(0);
  });

  it('resets the sort when the exercise changes', async () => {
    // The previous column may not exist on this measure.
    const s = useMatrixStore();
    await s.load('t1', 's1');
    s.setExerciseFilter(LAPS);
    s.setExerciseSort('best');
    s.setExerciseFilter(SMALL);
    expect(s.exerciseSort).toEqual({ by: 'earned', reversed: false });
  });
});

describe('a standard, versus a competition', () => {
  beforeEach(() => {
    fetchTeamExercisePoints.mockResolvedValue([
      point({ player_id: 'p1', earned: 1, available: 1 }),        // met
      point({ player_id: 'p2', earned: 0.5, available: 1 }),      // below
      point({ player_id: 'p3', earned: 0, available: 1, raw_value: null }) // no attempt
    ]);
  });

  it('recognises a time-band exercise as a standard', async () => {
    const s = useMatrixStore();
    await s.load('t1', 's1');
    s.setExerciseFilter(LAPS);
    expect(s.isThreshold).toBe(true);
  });

  it('does not treat a competitive exercise as one', async () => {
    const s = useMatrixStore();
    await s.load('t1', 's1');
    s.setExerciseFilter(SMALL);
    expect(s.isThreshold).toBe(false);
    expect(s.shortOfStandard).toEqual([]);
  });

  it('names who fell short, excluding those who never attempted', async () => {
    const s = useMatrixStore();
    await s.load('t1', 's1');
    s.setExerciseFilter(LAPS);

    expect(s.shortOfStandard.map((r: any) => r.playerId)).toEqual(['p2']);
    // Two ran; one did not, and is not counted against the standard.
    expect(s.measuredCount).toBe(2);
  });

  it('KEEPS every row on the leaderboard regardless', async () => {
    // The emphasis is additive. It must never filter the table down to the
    // players who fell short.
    const s = useMatrixStore();
    await s.load('t1', 's1');
    s.setExerciseFilter(LAPS);
    expect(s.leaderboard).toHaveLength(3);
  });

  it('KEEPS every sort working on a standard', async () => {
    // This was the condition on introducing the emphasis at all.
    const s = useMatrixStore();
    await s.load('t1', 's1');
    s.setExerciseFilter(LAPS);

    for (const col of ['number', 'name', 'best', 'earned']) {
      s.setExerciseSort(col);
      expect(s.exerciseSort.by, col).toBe(col);
      expect(s.leaderboard, col).toHaveLength(3);
    }
  });
});

describe('correcting a result', () => {
  it('deletes and reloads, because Postgres re-derives every rank', async () => {
    const s = useMatrixStore();
    await s.load('t1', 's1');
    vi.clearAllMocks();
    fetchTeamRoster.mockResolvedValue([]);
    fetchMatrixStandings.mockResolvedValue([]);
    fetchTeamExercisePoints.mockResolvedValue([]);
    fetchDrillsForWeighting.mockResolvedValue([]);
    fetchMatrixLogs.mockResolvedValue([]);
    deleteMatrixResult.mockResolvedValue({ ok: true });

    const res = await s.removeResult('log1', 't1', 's1');
    expect(res.ok).toBe(true);
    expect(deleteMatrixResult).toHaveBeenCalledWith('log1');
    expect(fetchMatrixStandings).toHaveBeenCalledWith('t1');
  });

  it('refuses without a team', async () => {
    const s = useMatrixStore();
    expect((await s.removeResult('log1', '', 's1')).ok).toBe(false);
    expect(deleteMatrixResult).not.toHaveBeenCalled();
  });

  it('surfaces a refusal', async () => {
    deleteMatrixResult.mockResolvedValue({ ok: false, error: 'not permitted' });
    const s = useMatrixStore();
    await s.load('t1', 's1');
    expect((await s.removeResult('log1', 't1', 's1')).error).toBe('not permitted');
  });
});
