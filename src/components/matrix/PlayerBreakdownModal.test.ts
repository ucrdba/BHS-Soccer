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
  { id: 'd-laps', name: '3 Laps', measure: 'time_low' },
  { id: 'd-coopers', name: 'Coopers', measure: 'count_high' }
];

/** The watch that fetches is async; let it settle. */
const flush = () => new Promise(r => setTimeout(r, 0));

async function mountModal(rows: any[] | null, playerId: string | null = 'p1') {
  vi.clearAllMocks();
  fetchPlayerBreakdown.mockResolvedValue(rows);

  const w = mount(PlayerBreakdownModal, {
    props: { playerId, teamId: 't1' },
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
