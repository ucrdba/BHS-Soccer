/**
 * Player Ratings.
 *
 * The assertions that matter most here are about the threshold emphasis, and
 * they are deliberately about what it does NOT do: it must not narrow the
 * table and must not disable a sort. That was the condition on introducing it,
 * and it is the kind of thing a later tidy-up would quietly undo.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import MatrixView from './MatrixView.vue';
import ExerciseLeaderboard from '../components/matrix/ExerciseLeaderboard.vue';

/**
 * A real router, so useRouter() inside the view actually returns something
 * and RouterLink resolves. The RouterLink stub keeps the resolved href
 * readable without a full route match, the way ScheduleView.test.ts's does.
 */
function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/matrix', name: 'matrix', component: { template: '<p />' } },
      { path: '/matrix/session/:drillId', name: 'session-entry', component: { template: '<p />' } }
    ]
  });
}

const routerLinkStub = {
  props: ['to'],
  template: '<a :href="href"><slot /></a>',
  computed: {
    href(): string {
      const to: any = (this as any).to;
      if (to?.name === 'session-entry') return `/matrix/session/${to.params?.drillId}`;
      return '#';
    }
  }
};

// The store's real load() runs on mount. Mocked so it populates from these
// fixtures rather than wiping the seeded state with empty results.
const svc = {
  fetchTeamRoster: vi.fn(),
  fetchMatrixStandings: vi.fn(),
  fetchTeamExercisePoints: vi.fn(),
  fetchDrillsForWeighting: vi.fn(),
  fetchMatrixLogs: vi.fn(),
  deleteMatrixResult: vi.fn(),
  fetchTeamSessionHistory: vi.fn(),
  fetchMatrixSessionResults: vi.fn(),
  fetchTimeBands: vi.fn(),
  saveMatrixSession: vi.fn(),
  deleteMatrixSession: vi.fn(),
  updateDrillWeights: vi.fn(),
  findPlayerOnTeam: vi.fn()
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

/**
 * Panels are behind a segmented control now, so a test after a specific one
 * (the exercise picker, the results panel, the session history) must select
 * its tab before looking for it. Order is fixed by PANELS: board, exercise,
 * results, history — the latter two collapse away for a player.
 */
async function switchTo(w: any, label: 'Board' | 'Exercise' | 'Results' | 'History'): Promise<void> {
  const tabs = w.findAll('[data-panel-tab]');
  const tab = tabs.find((t: any) => t.text() === label);
  if (!tab) throw new Error(`No "${label}" tab is offered`);
  await tab.trigger('click');
}

async function mountMatrix(opts: {
  roster?: any[]; points?: any[]; filter?: string;
  coach?: boolean; failWith?: string | null; logs?: any[]; drills?: any[];
  router?: Router; stubs?: Record<string, any>;
} = {}) {
  const {
    roster = ROSTER_ROWS, points = [point()], filter = '',
    coach = false, failWith = null, logs = [], drills = DRILLS,
    router = createTestRouter(), stubs = {}
  } = opts;

  vi.clearAllMocks();
  if (failWith) {
    svc.fetchTeamRoster.mockRejectedValue(new Error(failWith));
  } else {
    svc.fetchTeamRoster.mockResolvedValue(roster);
  }
  svc.fetchMatrixStandings.mockResolvedValue(STANDINGS);
  svc.fetchTeamExercisePoints.mockResolvedValue(points);
  svc.fetchDrillsForWeighting.mockResolvedValue(drills);
  svc.fetchMatrixLogs.mockResolvedValue(logs);
  svc.fetchTeamSessionHistory.mockResolvedValue([]);
  svc.fetchMatrixSessionResults.mockResolvedValue([]);
  svc.fetchTimeBands.mockResolvedValue([]);

  await router.push('/matrix');
  await router.isReady();

  const w = mount(MatrixView, {
    global: {
      plugins: [router, createTestingPinia({
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
      })],
      stubs: { RouterLink: routerLinkStub, ...stubs }
    }
  });

  // load() is async and fired by a watch on mount.
  await flush();
  return w;
}

/**
 * The band emphasis is a property of the leaderboard's own inputs, not of a
 * full load() — this mounts ExerciseLeaderboard directly, with the matrix
 * store's raw state seeded synchronously, so a test can read it without
 * waiting on a fetch that never happens here. It follows mountMatrix's own
 * seeding (LAPS, BAND_POINTS): one row that met the standard (p1), one that
 * fell below it (p2), and one that never attempted (p3).
 */
function mountMatrixWithBandedExercise() {
  return mount(ExerciseLeaderboard, {
    global: {
      plugins: [createTestRouter(), createTestingPinia({
        createSpy: vi.fn,
        stubActions: false,
        initialState: {
          matrix: {
            exerciseFilter: LAPS,
            drillsBank: DRILLS,
            players: [
              { id: 'p1', name: 'Alva', recordingNumber: 1 },
              { id: 'p2', name: 'Budde', recordingNumber: 2 },
              { id: 'p3', name: 'Renteria', recordingNumber: 3 }
            ],
            exercisePoints: BAND_POINTS
          },
          auth: { isCoach: true, isAdmin: false, isGuest: false, canAccessRatings: true }
        }
      })],
      stubs: { RouterLink: routerLinkStub }
    }
  });
}

beforeEach(() => { document.body.innerHTML = ''; });

/**
 * How consistently, beside whether at all.
 *
 * Ashton ran 4:29 and 4:40 against a 4:30 bar. The fastest cleared it, so he
 * has proved he can — but a coach picking a squad wants the 4:40 too, and a
 * bare "met" hides it.
 */
describe('the run ratio beside a standard', () => {
  function mountWith(points: any[]) {
    return mount(ExerciseLeaderboard, {
      global: {
        plugins: [createTestRouter(), createTestingPinia({
          createSpy: vi.fn,
          stubActions: false,
          initialState: {
            matrix: {
              exerciseFilter: LAPS,
              drillsBank: DRILLS,
              players: [{ id: 'p1', name: 'Lanza', recordingNumber: 1 }],
              exercisePoints: points
            }
          }
        })],
        stubs: { RouterLink: routerLinkStub }
      }
    });
  }

  it('says how many runs cleared the bar when not all of them did', () => {
    const w = mountWith([
      point({ player_id: 'p1', earned: 1, available: 1, raw_value: 269 }),
      point({ player_id: 'p1', earned: 0.5, available: 1, raw_value: 280 })
    ]);
    expect(w.find('[data-standard-runs]').text()).toContain('1 of 2');
  });

  it('shows the average beside the best, so a ceiling is not read as a norm', () => {
    const w = mountWith([
      point({ player_id: 'p1', earned: 1, available: 1, raw_value: 269 }),
      point({ player_id: 'p1', earned: 0.5, available: 1, raw_value: 281 })
    ]);
    // Best 4:29, average of 269 and 281 is 275 -> 4:35.
    expect(w.text()).toContain('4:29');
    expect(w.find('[data-exercise-avg]').text()).toBe('4:35');
  });

  it('offers no average column for a win-loss exercise, having nothing to average', () => {
    const w = mount(ExerciseLeaderboard, {
      global: {
        plugins: [createTestRouter(), createTestingPinia({
          createSpy: vi.fn,
          stubActions: false,
          initialState: {
            matrix: {
              exerciseFilter: SMALL,
              drillsBank: DRILLS,
              players: [{ id: 'p1', name: 'Lanza', recordingNumber: 1 }],
              exercisePoints: [point({ player_id: 'p1', drill_id: SMALL, w: 1, raw_value: null })]
            }
          }
        })],
        stubs: { RouterLink: routerLinkStub }
      }
    });
    expect(w.find('[data-exercise-avg]').exists()).toBe(false);
  });

  it('says nothing when every run cleared it, having nothing to add', () => {
    const w = mountWith([
      point({ player_id: 'p1', earned: 1, available: 1, raw_value: 250 }),
      point({ player_id: 'p1', earned: 1, available: 1, raw_value: 245 })
    ]);
    expect(w.find('[data-standard-runs]').exists()).toBe(false);
  });
});

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
    await switchTo(w, 'Exercise');
    expect(w.find('[data-exercise-leaderboard]').exists()).toBe(true);
    expect(w.find('[data-matrix-board]').exists()).toBe(false);
  });

  it('shows no standard summary, because spread is the point there', async () => {
    const w = await mountMatrix({ filter: SMALL, points: [point({ drill_id: SMALL })] });
    await switchTo(w, 'Exercise');
    expect(w.find('[data-standard-summary]').exists()).toBe(false);
    expect(w.find('[data-below-standard]').exists()).toBe(false);
  });
});

describe('a fitness standard', () => {
  const opts = { filter: LAPS, points: BAND_POINTS };

  it('says how many fell below it, of those measured', async () => {
    const w = await mountMatrix(opts);
    await switchTo(w, 'Exercise');
    const summary = w.find('[data-standard-summary]');
    expect(summary.exists()).toBe(true);
    // One below; the player who never ran is not counted against the standard.
    expect(summary.text()).toMatch(/1\b/);
    expect(summary.text()).toMatch(/2 measured/);
  });

  it('marks the rows that fell short', async () => {
    const w = await mountMatrix(opts);
    await switchTo(w, 'Exercise');
    expect(w.findAll('[data-below-standard]')).toHaveLength(1);
  });

  it('does not mark a player who never attempted as failing', async () => {
    const w = await mountMatrix(opts);
    await switchTo(w, 'Exercise');
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
    await switchTo(w, 'Exercise');
    expect(w.find('[data-standard-summary]').text()).toMatch(/all 2 measured/i);
  });

  it('KEEPS every player on the table', async () => {
    // Emphasis, never a filter.
    const w = await mountMatrix(opts);
    await switchTo(w, 'Exercise');
    expect(w.findAll('[data-leaderboard-row]')).toHaveLength(3);
  });

  it('KEEPS every column sortable', async () => {
    // This was the condition on introducing the emphasis at all.
    const w = await mountMatrix(opts);
    await switchTo(w, 'Exercise');
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
    await switchTo(w, 'Exercise');
    expect(w.text()).toContain('4:10');   // 250 seconds
  });

  it('marks a below-standard player in words, not colour alone', () => {
    // Status must never be carried by colour alone; the word is the signal.
    const w = mountMatrixWithBandedExercise();
    const flags = w.findAll('[data-below-standard]').map(f => f.text().toLowerCase());
    expect(flags.length).toBeGreaterThan(0);
    for (const f of flags) expect(f).toMatch(/below|no band/);
  });

  it('keeps every player on a banded exercise, and keeps the sort working', async () => {
    // The band emphasis is additive: it may never narrow the table.
    const w = mountMatrixWithBandedExercise();
    const before = w.findAll('[data-leaderboard-row]').length;
    expect(before).toBe(w.vm.$pinia._s.get('matrix').leaderboard.length);

    await w.find('[data-exercise-sort="earned"]').trigger('click');
    expect(w.findAll('[data-leaderboard-row]').length).toBe(before);
  });
});

describe('the results panel', () => {
  const LOGS = [
    { id: 'l1', player_a_id: 'p1', player_b_id: 'p2', outcome: 'a',
      score_text: '2-1', occurred_on: 'SEP 4 2026', drill_id: SMALL },
    { id: 'l2', player_a_id: 'p2', player_b_id: 'p3', outcome: 'draw',
      score_text: null, occurred_on: 'SEP 5 2026', drill_id: SMALL }
  ];

  it('is absent entirely for a player, not merely hidden', async () => {
    // It exists to correct results, which a player may not do.
    const w = await mountMatrix({ coach: false, logs: LOGS });
    expect(w.find('[data-results-panel]').exists()).toBe(false);
    expect(w.find('[data-result-remove]').exists()).toBe(false);
  });

  it('lists every logged result for a coach', async () => {
    const w = await mountMatrix({ coach: true, logs: LOGS });
    await switchTo(w, 'Results');
    expect(w.findAll('[data-result-row]')).toHaveLength(2);
  });

  it('marks the winner rather than leaving a reader to decode a and b', async () => {
    const w = await mountMatrix({ coach: true, logs: LOGS });
    await switchTo(w, 'Results');
    const first = w.findAll('[data-result-row]')[0];
    expect(first.text()).toContain('beat');
    expect(first.find('.won').text()).toContain('Alva');
  });

  it('names a draw without inventing a winner', async () => {
    const w = await mountMatrix({ coach: true, logs: LOGS });
    await switchTo(w, 'Results');
    expect(w.findAll('[data-result-row]')[1].text()).toContain('drew with');
  });

  it('uses the recording number beside a name', async () => {
    // The Matrix is read alongside paper sheets, which carry those numbers.
    const w = await mountMatrix({ coach: true, logs: LOGS });
    await switchTo(w, 'Results');
    expect(w.find('[data-result-row]').text()).toContain('(1)');
  });

  it('says what an empty panel is for', async () => {
    const w = await mountMatrix({ coach: true, logs: [] });
    await switchTo(w, 'Results');
    expect(w.find('[data-results-empty]').text()).toMatch(/leaderboard is calculated from/i);
  });

  it('warns that deleting recalculates every rank', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountMatrix({ coach: true, logs: LOGS });
    await switchTo(w, 'Results');
    await w.find('[data-result-remove]').trigger('click');

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/recalculated/i));
    confirmSpy.mockRestore();
  });
});

describe('recording a session', () => {
  it('offers a coach somewhere to record one', async () => {
    const w = await mountMatrix({ coach: true });
    expect(w.find('[data-record-session]').exists()).toBe(true);
    expect(w.find('[data-open-weights]').exists()).toBe(true);
  });

  it('offers a player neither control, absent rather than hidden', async () => {
    const w = await mountMatrix({ coach: false });
    expect(w.find('[data-record-session]').exists()).toBe(false);
    expect(w.find('[data-open-weights]').exists()).toBe(false);
    expect(w.find('[data-history]').exists()).toBe(false);
  });

  /*
   * One picker, not two.
   *
   * There used to be an exercise dropdown here that only chose what "Record a
   * session" would open, and a second one on the Exercise panel that chose
   * what the leaderboard showed. Picking in the obvious one appeared to do
   * nothing, because its only effect was a link's href.
   *
   * They list different drills for real reasons, which is why merging them
   * needs care rather than a changed binding: the recording list carries
   * brand-new exercises that have no results yet, and the viewing list
   * carries 1v1s, which cannot be recorded as a session at all.
   */
  const ONE_V_ONE = { id: 'd-1v1', name: 'One v One', measure: 'head_to_head' };

  it('offers every exercise, including a 1v1 that cannot be recorded', async () => {
    const w = await mountMatrix({ coach: true, drills: DRILLS.concat([ONE_V_ONE]) });
    const names = w.find('[data-session-drill]').findAll('option').map(o => o.text());
    expect(names).toContain('One v One');
    expect(names).toContain('3 Laps');
  });

  it('shows that exercise\'s ratings as soon as one is chosen', async () => {
    // LAPS is the drill the fixture records points against.
    const w = await mountMatrix({ coach: true });
    await w.find('[data-session-drill]').setValue(LAPS);

    // The choice moves the screen to the exercise panel rather than leaving
    // the coach to find a tab -- "nothing happens" was the whole complaint.
    expect(w.find('[data-panel]').attributes('data-panel')).toBe('exercise');
    expect(w.find('[data-exercise-leaderboard]').exists()).toBe(true);
  });

  it('says so rather than showing an empty table for an exercise never recorded', async () => {
    // SMALL is offered -- it is a live exercise, and recording it is exactly
    // what a coach would come here to do -- but nothing has been recorded
    // against it, so there is no leaderboard to draw.
    const w = await mountMatrix({ coach: true });
    await w.find('[data-session-drill]').setValue(SMALL);

    expect(w.find('[data-exercise-leaderboard]').exists()).toBe(false);
    expect(w.find('[data-no-results]').text()).toContain('Small Sided');
  });

  it('does not offer to record a 1v1, and says why', async () => {
    // Those are entered as pairings. Offering both routes for one drill would
    // let the same day's competition be counted twice.
    const w = await mountMatrix({ coach: true, drills: DRILLS.concat([ONE_V_ONE]) });
    await w.find('[data-session-drill]').setValue('d-1v1');

    expect(w.find('[data-record-session]').exists()).toBe(false);
    expect(w.find('[data-record-pairings]').text()).toMatch(/pairing/i);
  });

  it('offers to record an exercise that can be, targeting the chosen one', async () => {
    const w = await mountMatrix({ coach: true, drills: DRILLS.concat([ONE_V_ONE]) });
    await w.find('[data-session-drill]').setValue(SMALL);
    expect(w.find('[data-record-session]').attributes('href')).toBe(`/matrix/session/${SMALL}`);
  });

  /*
   * Clicking a name on an exercise's leaderboard asks about THAT exercise.
   * The same modal opened from the overall board is not scoped, because the
   * question there has no exercise in it. The wiring is the part that can
   * silently regress, so it is asserted through the view rather than the
   * modal alone.
   */
  it('opens a player scoped to the exercise being read', async () => {
    const w = await mountMatrix({ coach: true });
    await w.find('[data-session-drill]').setValue(LAPS);
    await w.find('[data-leaderboard-player]').trigger('click');

    const modal = w.findComponent({ name: 'PlayerBreakdownModal' });
    expect(modal.props('drillId')).toBe(LAPS);
  });

  it('opens a player from the board unscoped', async () => {
    const w = await mountMatrix({ coach: true });
    await w.find('[data-board-player]').trigger('click');

    const modal = w.findComponent({ name: 'PlayerBreakdownModal' });
    expect(modal.props('drillId')).toBeNull();
  });

  it('carries no second picker on the exercise panel', async () => {
    const w = await mountMatrix({ coach: true });
    await switchTo(w, 'Exercise');
    expect(w.find('[data-exercise-filter]').exists()).toBe(false);
  });

  it('reads the session history for the team', async () => {
    const w = await mountMatrix({ coach: true });
    expect(svc.fetchTeamSessionHistory).toHaveBeenCalledWith('t1');
    await switchTo(w, 'History');
    expect(w.find('[data-history]').exists()).toBe(true);
  });

  it('links "Record a session" to the session-entry route for the chosen exercise', async () => {
    const w = await mountMatrix({ coach: true });
    // sessionDrillId starts blank, so the link falls back to the first
    // offered exercise -- LAPS, since DRILLS lists it before SMALL.
    expect(w.find('[data-record-session]').attributes('href')).toBe(`/matrix/session/${LAPS}`);
  });

  /*
   * Reported as "nothing happens when you click on them". If the v-model is
   * wired, choosing the second exercise must retarget the link. Whether a
   * coach can SEE that it did is a separate question, and the answer is no:
   * the link's href is the only thing the choice changes.
   */
  it('retargets "Record a session" when a different exercise is chosen', async () => {
    const w = await mountMatrix({ coach: true });
    expect(w.find('[data-record-session]').attributes('href')).toBe(`/matrix/session/${LAPS}`);

    await w.find('[data-session-drill]').setValue(SMALL);
    expect(w.find('[data-record-session]').attributes('href')).toBe(`/matrix/session/${SMALL}`);
  });

  it('pushes the recorded session\'s id in the query when a coach edits it', async () => {
    // This is the exact wiring the plan's pre-flight scan flagged: without
    // the session id in the query, opening a recorded session for editing
    // hands the coach a blank sheet over their saved results.
    const router = createTestRouter();
    const w = await mountMatrix({
      coach: true, router,
      stubs: { SessionHistory: { name: 'SessionHistory', template: '<div data-history-stub />' } }
    });
    const push = vi.spyOn(router, 'push');

    await switchTo(w, 'History');
    w.findComponent({ name: 'SessionHistory' }).vm.$emit('edit', LAPS, 's9');
    await flushPromises();

    expect(push).toHaveBeenCalledWith({
      name: 'session-entry', params: { drillId: LAPS }, query: { session: 's9' }
    });
  });
});

describe('the reports', () => {
  it('offers a coach the squad report and the progress chart', async () => {
    const w = await mountMatrix({ coach: true });
    expect(w.find('[data-open-squad]').exists()).toBe(true);
    expect(w.find('[data-open-progress]').exists()).toBe(true);
  });

  it('offers a player neither, absent rather than hidden', async () => {
    const w = await mountMatrix({ coach: false });
    expect(w.find('[data-open-squad]').exists()).toBe(false);
    expect(w.find('[data-open-progress]').exists()).toBe(false);
  });

  it('opens the squad report on this team', async () => {
    svc.fetchTeamSessionHistory.mockResolvedValue([]);
    const w = await mountMatrix({ coach: true });
    await w.find('[data-open-squad]').trigger('click');
    await flush();

    expect(w.find('[data-modal]').text()).toMatch(/squad report/i);
  });

  it('opens the progress chart on this team', async () => {
    svc.fetchTeamSessionHistory.mockResolvedValue([]);
    const w = await mountMatrix({ coach: true });
    await w.find('[data-open-progress]').trigger('click');
    await flush();

    expect(w.find('[data-modal]').text()).toMatch(/progress/i);
  });
});

describe('the panels', () => {
  it('offers a coach four panels and a player two', async () => {
    const coach = await mountMatrix({ coach: true });
    expect(coach.findAll('[data-panel-tab]').map(t => t.text()))
      .toEqual(['Board', 'Exercise', 'Results', 'History']);

    const player = await mountMatrix({ coach: false });
    expect(player.findAll('[data-panel-tab]').map(t => t.text()))
      .toEqual(['Board', 'Exercise']);
  });

  it('shows the board first and switches on a tab', async () => {
    const w = await mountMatrix({ coach: true });
    expect(w.find('[data-panel]').attributes('data-panel')).toBe('board');

    await w.findAll('[data-panel-tab]')[1].trigger('click');
    expect(w.find('[data-panel]').attributes('data-panel')).toBe('exercise');
  });
});
