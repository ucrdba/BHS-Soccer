/**
 * Why one player's number is what it is.
 *
 * Two of the assertions below are about telling a coach the truth rather than
 * a convenient default. A failed read is not an empty history -- one means the
 * database did not answer, the other means nobody has entered anything -- and
 * showing "nothing recorded" for a broken query would send a coach looking for
 * results that are already there. And a time is rendered as a time, because
 * 250 sitting beside the points column reads as points.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import PlayerBreakdownModal from './PlayerBreakdownModal.vue';

const fetchPlayerBreakdown = vi.fn();
vi.mock('../../data/supabase', () => ({
  supabaseService: { fetchPlayerBreakdown: (...a: any[]) => fetchPlayerBreakdown(...a) }
}));

const PLAYERS = [
  { id: 'p1', name: 'Cesar Alva', recordingNumber: 7 },
  { id: 'p2', name: 'Tom Budde', recordingNumber: 8 }
];

const DRILLS = [
  { id: 'd-laps', name: '3 Laps', measure: 'time_bands' },
  { id: 'd-coopers', name: 'Coopers', measure: 'count_high' }
];

/** The watch that fetches is async; let it settle. */
const flush = () => new Promise(r => setTimeout(r, 0));

async function mountModal(
  rows: any[] | null, playerId: string | null = 'p1', drillId: string | null = null
) {
  vi.clearAllMocks();
  fetchPlayerBreakdown.mockResolvedValue(rows);

  const w = mount(PlayerBreakdownModal, {
    props: { playerId, teamId: 't1', drillId },
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: true,
        initialState: { matrix: { players: PLAYERS, drillsBank: DRILLS } }
      })]
    },
    attachTo: document.body
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('what it asks for', () => {
  it('fetches the breakdown scoped to the team, not just the player', async () => {
    // The same person can be on a school team and a club team with separate
    // statistics, so a player id alone would merge two seasons.
    await mountModal([]);
    expect(fetchPlayerBreakdown).toHaveBeenCalledWith('t1', 'p1');
  });

  it('asks for nothing until a player is chosen', async () => {
    await mountModal([], null);
    expect(fetchPlayerBreakdown).not.toHaveBeenCalled();
  });

  it('titles itself with the player, not a generic heading', async () => {
    const w = await mountModal([]);
    expect(w.text()).toContain('Cesar Alva');
  });
});

describe('a read that did not answer', () => {
  it('says so, rather than claiming nothing is recorded', async () => {
    const w = await mountModal(null);
    expect(w.find('[data-breakdown-error]').exists()).toBe(true);
    expect(w.find('[data-breakdown-empty]').exists()).toBe(false);
  });

  it('says so when the call throws as well', async () => {
    vi.clearAllMocks();
    fetchPlayerBreakdown.mockRejectedValue(new Error('network'));
    const w = mount(PlayerBreakdownModal, {
      props: { playerId: 'p1', teamId: 't1' },
      global: {
        plugins: [createTestingPinia({
          createSpy: vi.fn, stubActions: true,
          initialState: { matrix: { players: PLAYERS, drillsBank: DRILLS } }
        })]
      }
    });
    await flush();
    await w.vm.$nextTick();
    expect(w.find('[data-breakdown-error]').exists()).toBe(true);
  });

  it('distinguishes an empty history from a failure', async () => {
    const w = await mountModal([]);
    expect(w.find('[data-breakdown-empty]').exists()).toBe(true);
    expect(w.find('[data-breakdown-error]').exists()).toBe(false);
  });
});

describe('the rows', () => {
  const ROWS = [
    { occurred_on: 'SEP 4 2026', exercise: 'Small Sided', kind: 'head_to_head',
      detail: 'win', opponent_id: 'p2', earned: 1, available: 1 },
    { occurred_on: 'SEP 5 2026', exercise: '3 Laps', kind: 'measured',
      drill_id: 'd-laps', raw_value: 250, earned: 0.5, available: 1 },
    { occurred_on: 'SEP 5 2026', exercise: 'Coopers', kind: 'measured',
      drill_id: 'd-coopers', raw_value: 2800, earned: 1, available: 1 }
  ];

  it('shows one row per recorded result', async () => {
    const w = await mountModal(ROWS);
    expect(w.findAll('[data-breakdown-row]')).toHaveLength(3);
  });

  it('names the opponent a head-to-head was against', async () => {
    const w = await mountModal(ROWS);
    const details = w.findAll('[data-breakdown-detail]').map(d => d.text());
    expect(details[0]).toBe('beat Tom Budde');
  });

  it('renders a timed exercise as a time, not a bare number', async () => {
    const w = await mountModal(ROWS);
    const details = w.findAll('[data-breakdown-detail]').map(d => d.text());
    expect(details[1]).toBe('4:10');
  });

  it('leaves a counted exercise as its count', async () => {
    // 2800 metres and 2800 seconds want very different formatting.
    const w = await mountModal(ROWS);
    const details = w.findAll('[data-breakdown-detail]').map(d => d.text());
    expect(details[2]).toBe('2800');
  });

  it('shows what each result earned, and out of what', async () => {
    const w = await mountModal(ROWS);
    expect(w.findAll('[data-breakdown-row]')[1].text()).toContain('0.50');
  });
});

describe('closing', () => {
  it('emits close rather than clearing its own prop', async () => {
    const w = await mountModal([]);
    await w.find('[data-modal-close]').trigger('click');
    expect(w.emitted('close')).toBeTruthy();
  });
});


/**
 * Opened from one exercise's leaderboard, it answers about that exercise.
 *
 * A coach reading the 3-430 board and clicking a name has a question with an
 * exercise already in it -- what did he run? Handing back every exercise makes
 * them find the rows themselves. Opened from the overall board there is no
 * exercise in the question, so nothing is scoped away.
 */
describe('scoped to one exercise', () => {
  const MIXED = [
    { drill_id: 'd-laps', exercise: '3 Laps', occurred_on: '2026-09-08',
      kind: 'time', raw_value: 224, earned: 1, available: 1 },
    { drill_id: 'd-coopers', exercise: 'Coopers', occurred_on: '2026-09-07',
      kind: 'count', raw_value: 40, earned: 1, available: 1 },
    { drill_id: 'd-laps', exercise: '3 Laps', occurred_on: '2026-09-01',
      kind: 'time', raw_value: null, attendance: 'absent', earned: 0, available: 1 }
  ];

  it('shows only that exercise when one is given', async () => {
    const w = await mountModal(MIXED, 'p1', 'd-laps');
    const dates = w.findAll('[data-breakdown-row]')
      .map((r: any) => r.text());
    expect(dates.length).toBe(2);
    expect(dates.join(' ')).not.toContain('Coopers');
  });

  it('names the exercise in the title, so the scope is not a surprise', async () => {
    const w = await mountModal(MIXED, 'p1', 'd-laps');
    expect(w.text()).toContain('3 Laps');
  });

  it('drops the exercise column, which would repeat one value down the table', async () => {
    const w = await mountModal(MIXED, 'p1', 'd-laps');
    const heads = w.findAll('th').map((h: any) => h.text());
    expect(heads).not.toContain('Exercise');
  });

  it('shows every exercise when none is given, as the board does', async () => {
    const w = await mountModal(MIXED, 'p1', null);
    expect(w.findAll('[data-breakdown-row]').length).toBe(3);
    expect(w.findAll('th').map((h: any) => h.text())).toContain('Exercise');
  });

  it('says nothing is recorded when that player has none of THIS exercise', async () => {
    const w = await mountModal(
      [MIXED[1]], 'p1', 'd-laps');
    expect(w.find('[data-breakdown-empty]').exists()).toBe(true);
  });
});
