/**
 * Player Ratings.
 *
 * The assertions that matter most here are about the threshold emphasis, and
 * they are deliberately about what it does NOT do: it must not narrow the
 * table and must not disable a sort. That was the condition on introducing it,
 * and it is the kind of thing a later tidy-up would quietly undo.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import MatrixView from './MatrixView.vue';

// The store's real load() runs on mount. Mocked so it populates from these
// fixtures rather than wiping the seeded state with empty results.
const svc = {
  fetchTeamRoster: vi.fn(),
  fetchMatrixStandings: vi.fn(),
  fetchTeamExercisePoints: vi.fn(),
  fetchDrillsForWeighting: vi.fn(),
  fetchMatrixLogs: vi.fn(),
  deleteMatrixResult: vi.fn()
};
vi.mock('../data/supabase', () => ({ supabaseService: new Proxy({}, { get: (_t, k) => (...a: any[]) => (svc as any)[k](...a) }) }));

const LAPS = 'd-laps';     // time_bands — a standard
const SMALL = 'd-small';   // win_loss — competitive

const point = (over: any = {}) => ({
  player_id: 'p1', drill_id: LAPS, raw_value: 250, weight: 1,
  earned: 1, available: 1, w: 0, dr: 0, ls: 0, attempts: 1, ...over
});

/** Met, below, and never attempted — one of each. */
const BAND_POINTS = [
  point({ player_id: 'p1', earned: 1, available: 1, raw_value: 250 }),
  point({ player_id: 'p2', earned: 0.5, available: 1, raw_value: 280 }),
  point({ player_id: 'p3', earned: 0, available: 1, raw_value: null })
];

const DRILLS = [
  { id: LAPS, name: '3 Laps', measure: 'time_bands' },
  { id: SMALL, name: 'Small Sided', measure: 'win_loss' }
];

/** The raw rows the store's load() maps, rather than the mapped result. */
const ROSTER_ROWS = [
  { id: 'tp-p1', number: 1, recording_number: 1, position: 'Mid', season_stats: {}, ratings: {},
    players: { id: 'p1', name: 'Alva', first_name: 'Alva', last_name: '', class_year: 'Senior' } },
  { id: 'tp-p2', number: 2, recording_number: 2, position: 'Mid', season_stats: {}, ratings: {},
    players: { id: 'p2', name: 'Budde', first_name: 'Budde', last_name: '', class_year: 'Senior' } },
  { id: 'tp-p3', number: 3, recording_number: 3, position: 'Mid', season_stats: {}, ratings: {},
    players: { id: 'p3', name: 'Renteria', first_name: 'Renteria', last_name: '', class_year: 'Senior' } }
];

const STANDINGS = [
  { player_id: 'p1', wins: 2, draws: 0, losses: 0, games: 2, exercises: 2,
    earned: 2, available: 2, share: 100, rank: 1 }
];

/** Two macrotasks: load() is async and fired by a watch on mount. */
async function flush(): Promise<void> {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
}

async function mountMatrix(opts: {
  roster?: any[]; points?: any[]; filter?: string;
  coach?: boolean; failWith?: string | null;
} = {}) {
  const {
    roster = ROSTER_ROWS, points = [point()], filter = '',
    coach = false, failWith = null
  } = opts;

  vi.clearAllMocks();
  if (failWith) {
    svc.fetchTeamRoster.mockRejectedValue(new Error(failWith));
  } else {
    svc.fetchTeamRoster.mockResolvedValue(roster);
  }
  svc.fetchMatrixStandings.mockResolvedValue(STANDINGS);
  svc.fetchTeamExercisePoints.mockResolvedValue(points);
  svc.fetchDrillsForWeighting.mockResolvedValue(DRILLS);
  svc.fetchMatrixLogs.mockResolvedValue([]);

  const w = mount(MatrixView, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        // The real actions run: sorting is the behaviour under test, and the
        // client above is what is faked instead.
        stubActions: false,
        initialState: {
          matrix: { exerciseFilter: filter },
          organization: {
            schools: [{ id: 's1', name: 'Legends FC', mascot: 'Lions' }],
            teams: [{ id: 't1', name: 'U16', school_id: 's1' }],
            activeTeamId: 't1'
          },
          auth: { isCoach: coach, isAdmin: false, isGuest: false, canAccessRatings: true }
        }
      })]
    }
  });

  // load() is async and fired by a watch on mount.
  await flush();
  return w;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('the board', () => {
  it('renders every player, including one who has taken part in nothing', async () => {
    const w = await mountMatrix();
    expect(w.findAll('[data-board-row]')).toHaveLength(3);
    expect(w.text()).toContain('Renteria');
  });

  it('shows a dash instead of a rank for an unplayed player', async () => {
    // They are not last on merit; there is nothing to compare.
    const w = await mountMatrix();
    expect(w.text()).toContain('—');
  });

  it('sorts by a column and reverses on a second click', async () => {
    const w = await mountMatrix();
    const names = () => w.findAll('[data-board-player]').map(b => b.text());

    await w.find('[data-board-sort="name"]').trigger('click');
    const forward = names();
    await w.find('[data-board-sort="name"]').trigger('click');
    expect(names()).toEqual(forward.slice().reverse());
  });

  it('names the organization, with no hardcoded name', async () => {
    const w = await mountMatrix();
    expect(w.text()).toContain('Legends FC');
    expect(w.text()).not.toMatch(/beaumont|cougars/i);
  });

  it('says the squad is empty once a load has actually finished', async () => {
    const w = await mountMatrix({ roster: [] });
    expect(w.find('[data-empty]').exists()).toBe(true);
  });

  it('surfaces a load failure', async () => {
    const w = await mountMatrix({ failWith: 'offline' });
    expect(w.find('[data-load-error]').text()).toContain('offline');
  });
});

describe('a competitive exercise', () => {
  it('shows the leaderboard instead of the board', async () => {
    const w = await mountMatrix({ filter: SMALL, points: [point({ drill_id: SMALL })] });
    expect(w.find('[data-exercise-leaderboard]').exists()).toBe(true);
    expect(w.find('[data-matrix-board]').exists()).toBe(false);
  });

  it('shows no standard summary, because spread is the point there', async () => {
    const w = await mountMatrix({ filter: SMALL, points: [point({ drill_id: SMALL })] });
    expect(w.find('[data-standard-summary]').exists()).toBe(false);
    expect(w.find('[data-below-standard]').exists()).toBe(false);
  });
});

describe('a fitness standard', () => {
  const opts = { filter: LAPS, points: BAND_POINTS };

  it('says how many fell below it, of those measured', async () => {
    const w = await mountMatrix(opts);
    const summary = w.find('[data-standard-summary]');
    expect(summary.exists()).toBe(true);
    // One below; the player who never ran is not counted against the standard.
    expect(summary.text()).toMatch(/1\b/);
    expect(summary.text()).toMatch(/2 measured/);
  });

  it('marks the rows that fell short', async () => {
    const w = await mountMatrix(opts);
    expect(w.findAll('[data-below-standard]')).toHaveLength(1);
  });

  it('does not mark a player who never attempted as failing', async () => {
    const w = await mountMatrix(opts);
    const standings = w.findAll('[data-leaderboard-row]').map(r => r.attributes('data-standing'));
    expect(standings).toContain('none');
    expect(standings.filter(s => s === 'missed')).toHaveLength(0);
  });

  it('says so when the whole squad met the standard', async () => {
    // A bunched result is the good outcome, and worth stating rather than
    // leaving the reader to notice an absence.
    const w = await mountMatrix({
      filter: LAPS,
      points: [point({ player_id: 'p1', earned: 1, available: 1 }),
               point({ player_id: 'p2', earned: 1, available: 1 })]
    });
    expect(w.find('[data-standard-summary]').text()).toMatch(/all 2 measured/i);
  });

  it('KEEPS every player on the table', async () => {
    // Emphasis, never a filter.
    const w = await mountMatrix(opts);
    expect(w.findAll('[data-leaderboard-row]')).toHaveLength(3);
  });

  it('KEEPS every column sortable', async () => {
    // This was the condition on introducing the emphasis at all.
    const w = await mountMatrix(opts);
    for (const col of ['number', 'name', 'best', 'earned']) {
      const th = w.find(`[data-exercise-sort="${col}"]`);
      expect(th.exists(), col).toBe(true);
      expect(th.attributes('disabled'), col).toBeUndefined();

      await th.trigger('click');
      // Still everyone, after sorting by anything.
      expect(w.findAll('[data-leaderboard-row]'), col).toHaveLength(3);
    }
  });

  it('shows a best time as a time, not a number of seconds', async () => {
    const w = await mountMatrix(opts);
    expect(w.text()).toContain('4:10');   // 250 seconds
  });
});
