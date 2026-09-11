/**
 * One 1v1, recorded.
 *
 * A head_to_head exercise is scored from pairings in matrix_logs, not from a
 * session -- a session result is one row per player and has nowhere to put
 * the opponent. The Matrix screen said "Recorded as pairings, not a session"
 * while offering no way to record one, because the original record modal went
 * with the legacy app in Phase 7. This is that screen, rebuilt.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import RecordResultModal from './RecordResultModal.vue';

const logMatrixResult = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    logMatrixResult: (...a: any[]) => logMatrixResult(...a)
  }
}));

const TEAM = '11111111-2222-3333-4444-555555555555';

const PLAYERS = [
  { id: 'p1', name: 'Cesar Aguilar', firstName: 'Cesar', lastName: 'Aguilar', recordingNumber: 7 },
  { id: 'p2', name: 'Caleb Ruiz', firstName: 'Caleb', lastName: 'Ruiz', recordingNumber: 3 },
  { id: 'p3', name: 'Dylan Pena', firstName: 'Dylan', lastName: 'Pena', recordingNumber: 12 }
];

const flush = () => new Promise(r => setTimeout(r, 0));

async function mountModal(props: any = {}) {
  const w = mount(RecordResultModal, {
    props: {
      open: true, teamId: TEAM,
      drillId: 'd1', drillName: '1v1 Attacking',
      players: PLAYERS, logs: [], ...props
    },
    attachTo: document.body
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

const choose = async (w: any, a: string, b: string) => {
  await w.find('[data-result-player-a]').setValue(a);
  await w.find('[data-result-player-b]').setValue(b);
};

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  (window as any).matchMedia = vi.fn().mockReturnValue({ matches: false });
  logMatrixResult.mockResolvedValue({ ok: true });
});

describe('choosing the pairing', () => {
  it('lists the squad by recording number, as the paper sheet reads', async () => {
    const w = await mountModal();
    const options = w.find('[data-result-player-a]').findAll('option')
      .map(o => o.text())
      .filter(t => t !== 'Choose a player');

    // Sorted by recording number, not by name: 3, 7, 12.
    expect(options).toEqual(['(3) Caleb R.', '(7) Cesar A.', '(12) Dylan P.']);
  });

  it('names the outcomes by the players rather than by a and b', async () => {
    // "Player A won" means nothing on a sheet; the coach is looking at names.
    const w = await mountModal();
    await choose(w, 'p1', 'p2');

    expect(w.find('[data-result-outcome="a"]').text()).toBe('(7) Cesar A. won');
    expect(w.find('[data-result-outcome="b"]').text()).toBe('(3) Caleb R. won');
    expect(w.find('[data-result-outcome="draw"]').text()).toBe('Draw');
  });

  it('refuses a player against themselves', async () => {
    const w = await mountModal();
    await choose(w, 'p1', 'p1');

    expect(w.find('[data-result-same]').exists()).toBe(true);
    expect(w.find('[data-result-save]').attributes('disabled')).toBeDefined();
  });

  it('will not record until both players and an outcome are chosen', async () => {
    const w = await mountModal();
    expect(w.find('[data-result-save]').attributes('disabled')).toBeDefined();

    await choose(w, 'p1', 'p2');
    expect(w.find('[data-result-save]').attributes('disabled')).toBeDefined();

    await w.find('[data-result-outcome="a"]').trigger('click');
    expect(w.find('[data-result-save]').attributes('disabled')).toBeUndefined();
  });
});

describe('recording it', () => {
  it('writes the pairing against the exercise and the team', async () => {
    const w = await mountModal();
    await choose(w, 'p1', 'p2');
    await w.find('[data-result-outcome="a"]').trigger('click');
    await w.find('[data-result-save]').trigger('click');
    await flush();

    expect(logMatrixResult).toHaveBeenCalledWith(TEAM, expect.objectContaining({
      playerAId: 'p1', playerBId: 'p2', outcome: 'a', drillId: 'd1'
    }));
  });

  it('defaults the date to today rather than leaving it empty', async () => {
    // An undated pairing has no place in a progress chart.
    const w = await mountModal();
    await choose(w, 'p1', 'p2');
    await w.find('[data-result-outcome="draw"]').trigger('click');
    await w.find('[data-result-save]').trigger('click');
    await flush();

    expect(logMatrixResult.mock.calls[0][1].occurredOn)
      .toBe(new Date().toISOString().slice(0, 10));
  });

  it('carries a score when one was typed, and null when it was not', async () => {
    const w = await mountModal();
    await choose(w, 'p1', 'p2');
    await w.find('[data-result-outcome="a"]').trigger('click');
    await w.find('[data-result-score]').setValue('3-1');
    await w.find('[data-result-save]').trigger('click');
    await flush();

    expect(logMatrixResult.mock.calls[0][1].scoreText).toBe('3-1');

    const w2 = await mountModal();
    await choose(w2, 'p1', 'p2');
    await w2.find('[data-result-outcome="a"]').trigger('click');
    await w2.find('[data-result-save]').trigger('click');
    await flush();

    expect(logMatrixResult.mock.calls[1][1].scoreText).toBeNull();
  });

  it('tells its parent to re-read, so the standings move', async () => {
    // Weights and scoring are computed by the view, so the board is re-read
    // rather than patched.
    const w = await mountModal();
    await choose(w, 'p1', 'p2');
    await w.find('[data-result-outcome="a"]').trigger('click');
    await w.find('[data-result-save]').trigger('click');
    await flush();

    expect(w.emitted('saved')).toBeTruthy();
    expect(w.emitted('close')).toBeTruthy();
  });

  it('reports a refused write rather than closing over it', async () => {
    logMatrixResult.mockResolvedValue({
      ok: false, error: 'The database refused that write. Coach or admin access is required.'
    });
    const w = await mountModal();
    await choose(w, 'p1', 'p2');
    await w.find('[data-result-outcome="a"]').trigger('click');
    await w.find('[data-result-save]').trigger('click');
    await flush();

    expect(w.find('[data-result-error]').text()).toMatch(/coach or admin/i);
    expect(w.emitted('close')).toBeFalsy();
  });
});

describe('a pairing already recorded', () => {
  /*
   * Each side of a pairing is scored separately, so recording the same
   * fixture twice counts BOTH players twice in the standings. Said rather
   * than refused: a replayed fixture is a real thing and only the coach
   * knows which this is.
   */
  const PLAYED = [{ player_a_id: 'p2', player_b_id: 'p1', outcome: 'a', is_deleted: false }];

  it('says so, and names what the existing result was', async () => {
    const w = await mountModal({ logs: PLAYED });
    await choose(w, 'p1', 'p2');

    expect(w.find('[data-result-duplicate]').text()).toContain('already recorded');
    // The stored outcome names the LOGGED pair's winner, which is p2 here
    // even though p2 was chosen second this time.
    expect(w.find('[data-result-duplicate]').text()).toContain('(3) Caleb R. winning');
  });

  it('matches the fixture whichever way round it is entered', async () => {
    // "Caleb beat Cesar" is the same fixture as "Cesar v Caleb".
    const w = await mountModal({ logs: PLAYED });
    await choose(w, 'p2', 'p1');

    expect(w.find('[data-result-duplicate]').exists()).toBe(true);
  });

  it('says on the button that this one is a repeat', async () => {
    /*
     * One press, not two. The warning is on screen from the moment the
     * pairing is chosen, so a confirm step would ask the coach to
     * acknowledge something they are already looking at. The button carries
     * the warning instead, and the press is the informed one.
     */
    const w = await mountModal({ logs: PLAYED });
    await choose(w, 'p1', 'p2');
    await w.find('[data-result-outcome="a"]').trigger('click');

    expect(w.find('[data-result-save]').text()).toContain('Record anyway');

    await w.find('[data-result-save]').trigger('click');
    await flush();
    expect(logMatrixResult).toHaveBeenCalledTimes(1);
  });

  it('reads as an ordinary save again once the pairing is a new one', async () => {
    const w = await mountModal({ logs: PLAYED });
    await choose(w, 'p1', 'p2');
    expect(w.find('[data-result-save]').text()).toContain('Record anyway');

    await w.find('[data-result-player-b]').setValue('p3');
    expect(w.find('[data-result-save]').text()).toContain('Record result');
  });

  it('says nothing about a pairing that has not been played', async () => {
    const w = await mountModal({ logs: PLAYED });
    await choose(w, 'p1', 'p3');

    expect(w.find('[data-result-duplicate]').exists()).toBe(false);
  });

  it('ignores a deleted pairing, which is no longer scored', async () => {
    const w = await mountModal({
      logs: [{ player_a_id: 'p1', player_b_id: 'p2', outcome: 'a', is_deleted: true }]
    });
    await choose(w, 'p1', 'p2');

    expect(w.find('[data-result-duplicate]').exists()).toBe(false);
  });
});

describe('opening it again', () => {
  it('starts empty, so yesterday\'s pairing is not half-filled in', async () => {
    const w = await mountModal({ open: false });
    await w.setProps({ open: true });
    await w.vm.$nextTick();

    expect((w.find('[data-result-player-a]').element as HTMLSelectElement).value).toBe('');
    expect(w.find('[data-result-save]').attributes('disabled')).toBeDefined();
  });
});
