/**
 * The sessions behind the leaderboard.
 *
 * A session is how a whole squad's results get recorded, so it is also how a
 * whole squad's results get wrong. Editing reopens the grid with the session's
 * own id, which is what makes the save upsert rather than write a second
 * session for the same day and double everyone's available.
 *
 * Deleting says what it costs, because it takes every result in the session
 * with it and re-ranks the table.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import SessionHistory from './SessionHistory.vue';

const fetchTeamSessionHistory = vi.fn();
const fetchMatrixSessionResults = vi.fn();
const fetchTimeBands = vi.fn();
const deleteMatrixSession = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchTeamSessionHistory: (...a: any[]) => fetchTeamSessionHistory(...a),
    fetchMatrixSessionResults: (...a: any[]) => fetchMatrixSessionResults(...a),
    fetchTimeBands: (...a: any[]) => fetchTimeBands(...a),
    deleteMatrixSession: (...a: any[]) => deleteMatrixSession(...a)
  }
}));

const SESSIONS = [
  { id: 's1', drill_id: 'd-laps', occurred_on: '2026-09-01', drills_bank: { name: '3 Laps' } },
  { id: 's2', drill_id: 'd-small', occurred_on: '2026-09-05', drills_bank: { name: 'Small Sided' } },
  // The drill was deleted from the library after this was recorded.
  { id: 's3', drill_id: 'd-gone', occurred_on: '2026-09-03', drills_bank: null }
];

const flush = () => new Promise(r => setTimeout(r, 0));

function mountHistory(opts: { canEdit?: boolean; sessions?: any[] } = {}) {
  const { canEdit = true, sessions = SESSIONS } = opts;
  return mount(SessionHistory, {
    props: { canEdit, teamId: 't1' },
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: false,
        initialState: { session: { sessions } }
      })]
    }
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  fetchTeamSessionHistory.mockResolvedValue(SESSIONS);
  fetchMatrixSessionResults.mockResolvedValue([]);
  fetchTimeBands.mockResolvedValue([]);
  deleteMatrixSession.mockResolvedValue({ ok: true });
});

describe('the list', () => {
  it('shows newest first', async () => {
    const w = mountHistory();
    const dates = w.findAll('[data-history-date]').map(d => d.text());
    expect(dates).toEqual(['2026-09-05', '2026-09-03', '2026-09-01']);
  });

  it('names a session whose exercise has since been deleted', async () => {
    // drills_bank comes back null, and "undefined" on screen tells a coach
    // nothing about what the session was.
    const w = mountHistory();
    expect(w.text()).not.toContain('undefined');
    expect(w.findAll('[data-history-row]')[1].text()).toMatch(/exercise/i);
  });

  it('says the leaderboard is calculated from these when there are none', async () => {
    const w = mountHistory({ sessions: [] });
    expect(w.find('[data-history-empty]').exists()).toBe(true);
  });
});

describe('who can use it', () => {
  it('is absent entirely for a player, not merely hidden', async () => {
    // It edits and deletes recorded results, which a player may not do.
    const w = mountHistory({ canEdit: false });
    expect(w.find('[data-history]').exists()).toBe(false);
    expect(w.find('[data-history-delete]').exists()).toBe(false);
  });
});

describe('editing', () => {
  it('asks for the session by id, so the save upserts', async () => {
    const w = mountHistory();
    await w.findAll('[data-history-edit]')[0].trigger('click');
    await flush();

    expect(fetchMatrixSessionResults).toHaveBeenCalledWith('s2');   // the newest
  });

  it('tells the parent which exercise to open the grid on', async () => {
    const w = mountHistory();
    await w.findAll('[data-history-edit]')[0].trigger('click');
    await flush();

    expect(w.emitted('edit')![0]).toEqual(['d-small', 's2']);
  });
});

describe('deleting', () => {
  it('asks first, and says every result goes with it', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mountHistory();
    await w.findAll('[data-history-delete]')[0].trigger('click');

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/every result/i));
    expect(deleteMatrixSession).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('names the exercise and the date it is about to delete', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mountHistory();
    await w.findAll('[data-history-delete]')[0].trigger('click');

    expect(confirmSpy.mock.calls[0][0]).toContain('Small Sided');
    expect(confirmSpy.mock.calls[0][0]).toContain('2026-09-05');
    confirmSpy.mockRestore();
  });

  it('deletes and asks the board to re-read once confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mountHistory();
    await w.findAll('[data-history-delete]')[0].trigger('click');
    await flush();

    expect(deleteMatrixSession).toHaveBeenCalledWith('s2');
    expect(w.emitted('changed')).toBeTruthy();
    confirmSpy.mockRestore();
  });

  it('reports a refusal instead of leaving the row looking deleted', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    deleteMatrixSession.mockResolvedValue({ ok: false, error: 'Only a coach of this team can do that.' });
    const w = mountHistory();
    await w.findAll('[data-history-delete]')[0].trigger('click');
    await flush();

    expect(w.find('[data-history-error]').text()).toMatch(/only a coach/i);
    expect(w.emitted('changed')).toBeFalsy();
    confirmSpy.mockRestore();
  });
});
