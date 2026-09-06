/**
 * Every player against every other, once.
 *
 * The schedule itself is buildRoundRobin and tested there. What matters here
 * is that a pairing already recorded in the Matrix is MARKED: a round robin
 * runs across several sessions rather than in one go, so what a coach needs
 * from this screen is what is left to play.
 *
 * A failed read is told apart from nothing having been played, because
 * showing every pairing as unplayed would send a coach to run fixtures they
 * have already run.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import RoundRobinModal from './RoundRobinModal.vue';

const fetchMatrixLogs = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: { fetchMatrixLogs: (...a: any[]) => fetchMatrixLogs(...a) }
}));

const TEAM = '11111111-2222-3333-4444-555555555555';

const PLAYERS = [
  { id: 'p1', name: 'Cesar Alva', firstName: 'Cesar', lastName: 'Alva', recordingNumber: 1 },
  { id: 'p2', name: 'Tom Budde', firstName: 'Tom', lastName: 'Budde', recordingNumber: 2 },
  { id: 'p3', name: 'Alain Renteria', firstName: 'Alain', lastName: 'Renteria', recordingNumber: 3 },
  { id: 'p4', name: 'Luis Frias', firstName: 'Luis', lastName: 'Frias', recordingNumber: 4 }
];

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

async function mountRR(opts: { players?: any[]; logs?: any } = {}) {
  const { players = PLAYERS, logs = [] } = opts;
  fetchMatrixLogs.mockResolvedValue(logs);

  const w = mount(RoundRobinModal, {
    props: { open: true, teamId: TEAM, players },
    attachTo: document.body
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  fetchMatrixLogs.mockResolvedValue([]);
});

describe('the schedule', () => {
  it('pairs every player with every other exactly once', async () => {
    // Four players: three rounds of two matches, six pairings.
    const w = await mountRR();
    expect(w.findAll('[data-rr-round]')).toHaveLength(3);
    expect(w.findAll('[data-rr-match]')).toHaveLength(6);
  });

  it('labels players by recording number', async () => {
    // The sheet is read beside the paper ones.
    const w = await mountRR();
    expect(w.find('[data-rr-match]').text()).toMatch(/\(1\)/);
  });

  it('gives an odd squad a bye each round', async () => {
    const w = await mountRR({ players: PLAYERS.slice(0, 3) });
    expect(w.findAll('[data-rr-bye]')).toHaveLength(3);
  });

  it('MOVES the bye, so nobody sits out twice', async () => {
    const w = await mountRR({ players: PLAYERS.slice(0, 3) });
    const sat = w.findAll('[data-rr-match]')
      .filter((m: any) => m.find('[data-rr-bye]').exists())
      .map((m: any) => m.text());

    expect(new Set(sat).size).toBe(3);
  });

  it('says so when there are not enough players', async () => {
    const w = await mountRR({ players: PLAYERS.slice(0, 1) });
    expect(w.find('[data-rr-empty]').text()).toMatch(/at least two/i);
  });
});

describe('what has already been played', () => {
  const beaten = [{ player_a_id: 'p1', player_b_id: 'p2', outcome: 'a' }];

  it('MARKS a pairing already recorded in the Matrix', async () => {
    // The whole reason a coach opens this mid-way through.
    const w = await mountRR({ logs: beaten });
    expect(w.findAll('[data-rr-result]')).toHaveLength(1);
  });

  it('names who won', async () => {
    const w = await mountRR({ logs: beaten });
    expect(w.find('[data-rr-result]').text()).toMatch(/cesar/i);
  });

  it('says Draw rather than inventing a winner', async () => {
    const w = await mountRR({
      logs: [{ player_a_id: 'p1', player_b_id: 'p2', outcome: 'draw' }]
    });
    expect(w.find('[data-rr-result]').text()).toBe('Draw');
  });

  it('reads a result logged the other way round', async () => {
    // "p2 beat p1" is the same fixture as "p1 v p2"; reading it one way only
    // would leave half the schedule looking unplayed.
    const w = await mountRR({
      logs: [{ player_a_id: 'p2', player_b_id: 'p1', outcome: 'a' }]
    });
    expect(w.findAll('[data-rr-result]')).toHaveLength(1);
  });

  it('counts what is left to play', async () => {
    const w = await mountRR({ logs: beaten });
    expect(w.find('[data-rr-remaining]').text()).toContain('5 of 6');
  });

  it('ignores a deleted result', async () => {
    const w = await mountRR({
      logs: [{ player_a_id: 'p1', player_b_id: 'p2', outcome: 'a', is_deleted: true }]
    });
    expect(w.find('[data-rr-result]').exists()).toBe(false);
  });
});

describe('when the read fails', () => {
  it('says so rather than showing everything as unplayed', async () => {
    // Which would send a coach to run fixtures they have already run.
    fetchMatrixLogs.mockResolvedValue(null);
    const w = await mountRR({ logs: null });

    expect(w.find('[data-rr-error]').exists()).toBe(true);
    expect(w.find('[data-rr-match]').exists()).toBe(false);
  });

  it('refuses without a team', async () => {
    const w = mount(RoundRobinModal, {
      props: { open: true, teamId: null, players: PLAYERS }
    });
    await flush();
    await w.vm.$nextTick();

    expect(fetchMatrixLogs).not.toHaveBeenCalled();
    expect(w.find('[data-rr-error]').text()).toMatch(/team/i);
  });
});

describe('the CSV', () => {
  it('is offered', async () => {
    const w = await mountRR();
    expect(w.find('[data-rr-csv]').exists()).toBe(true);
  });

  it('builds a file with every round in it', async () => {
    const created: any[] = [];
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el: any = origCreate(tag);
      if (tag === 'a') { el.click = vi.fn(); created.push(el); }
      return el;
    });
    (URL as any).createObjectURL = vi.fn().mockReturnValue('blob:x');
    (URL as any).revokeObjectURL = vi.fn();

    const w = await mountRR();
    await w.find('[data-rr-csv]').trigger('click');

    expect(created[0].download).toBe('round-robin.csv');
    expect(created[0].click).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
