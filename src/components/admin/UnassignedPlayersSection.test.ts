/**
 * People with no squad.
 *
 * The two guards are the point of this file, and both are about not
 * destroying history.
 *
 * historyUnknown means one of the history queries failed, so the app cannot
 * say what this person owns -- and reporting zero results in that case reads
 * identically to "safe to retire", which is the dangerous reading.
 *
 * resultCount above zero means they have Matrix results on record, which
 * retiring them would strand.
 *
 * Both are re-checked on the press rather than trusted from the rendered
 * button, because the panel may have been open while a result was recorded
 * elsewhere.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import UnassignedPlayersSection from './UnassignedPlayersSection.vue';

const fetchUnassignedPlayers = vi.fn();
const upsertTeamMembership = vi.fn();
const deletePlayer = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchUnassignedPlayers: (...a: any[]) => fetchUnassignedPlayers(...a),
    upsertTeamMembership: (...a: any[]) => upsertTeamMembership(...a),
    deletePlayer: (...a: any[]) => deletePlayer(...a)
  }
}));

const TEAMS = [{ id: 't1', name: 'Varsity', school_id: 's1' }];

const PEOPLE = [
  { id: 'p1', name: 'Ana Ruiz', class_year: 'Junior', resultCount: 0, historyUnknown: false },
  { id: 'p2', name: 'Sam Cole', class_year: 'Senior', resultCount: 4, historyUnknown: false }
];

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

async function mountSection(opts: { people?: any; teamId?: string | null } = {}) {
  const { people = PEOPLE, teamId = 't1' } = opts;
  fetchUnassignedPlayers.mockResolvedValue(people);

  const w = mount(UnassignedPlayersSection, {
    props: { teamId, teams: TEAMS },
    attachTo: document.body
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  upsertTeamMembership.mockResolvedValue({ ok: true });
  deletePlayer.mockResolvedValue([{ id: 'p1' }]);
});

describe('the list', () => {
  it('shows everybody on no team', async () => {
    const w = await mountSection();
    expect(w.findAll('[data-unassigned-row]')).toHaveLength(2);
  });

  it('says how many results somebody has', async () => {
    // Which is what makes retiring them a decision rather than a guess.
    const w = await mountSection();
    expect(w.find('[data-unassigned-results]').text()).toContain('4');
  });

  it('says when everybody is on a squad', async () => {
    const w = await mountSection({ people: [] });
    expect(w.find('[data-unassigned-empty]').exists()).toBe(true);
  });

  it('reports a failed read rather than claiming nobody is unassigned', async () => {
    const w = await mountSection({ people: null });
    expect(w.find('[data-unassigned-error]').exists()).toBe(true);
    expect(w.find('[data-unassigned-empty]').exists()).toBe(false);
  });
});

describe('adding somebody to a team', () => {
  it('adds them to the active team', async () => {
    const w = await mountSection();
    await w.find('[data-unassigned-add="p1"]').trigger('click');
    await flush();

    expect(upsertTeamMembership).toHaveBeenCalledWith('t1', 's1', { player_id: 'p1' });
  });

  it('says what to do next, since a membership alone is not a roster row', async () => {
    const w = await mountSection();
    await w.find('[data-unassigned-add="p1"]').trigger('click');
    await flush();

    expect(w.find('[data-unassigned-notice]').text()).toMatch(/number and position/i);
  });

  it('refuses without a team rather than writing unscoped', async () => {
    const w = await mountSection({ teamId: null });
    await w.find('[data-unassigned-add="p1"]').trigger('click');
    await flush();

    expect(upsertTeamMembership).not.toHaveBeenCalled();
    expect(w.find('[data-unassigned-action-error]').text()).toMatch(/choose a team/i);
  });

  it('explains the likeliest refusal in words', async () => {
    // unique (school_id, player_id): already on another team in this
    // organization, which the design forbids.
    upsertTeamMembership.mockResolvedValue({ ok: false });
    const w = await mountSection();
    await w.find('[data-unassigned-add="p1"]').trigger('click');
    await flush();

    expect(w.find('[data-unassigned-action-error]').text())
      .toMatch(/already be on another team/i);
  });
});

describe('THE RETIRE GUARDS', () => {
  it('does not offer to retire somebody with results', async () => {
    // Not merely disabled -- absent. A disabled button invites a coach to
    // look for the way round it.
    const w = await mountSection();
    expect(w.find('[data-unassigned-retire="p2"]').exists()).toBe(false);
    expect(w.find('[data-unassigned-retire="p1"]').exists()).toBe(true);
  });

  it('does not offer to retire anybody whose history could not be read', async () => {
    // Reporting zero results for an unreadable history reads identically to
    // "safe to retire", which is the dangerous reading.
    const w = await mountSection({
      people: [{ id: 'p1', name: 'Ana Ruiz', resultCount: 0, historyUnknown: true }]
    });
    expect(w.find('[data-unassigned-retire="p1"]').exists()).toBe(false);
  });

  it('marks that a history could not be read', async () => {
    const w = await mountSection({
      people: [{ id: 'p1', name: 'Ana Ruiz', resultCount: 0, historyUnknown: true }]
    });
    expect(w.find('[data-unassigned-unknown]').exists()).toBe(true);
  });
});

describe('retiring', () => {
  it('says they stay in the program', async () => {
    // They are a person rather than a row -- the same wording the roster uses.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountSection();
    await w.find('[data-unassigned-retire="p1"]').trigger('click');

    const asked = confirmSpy.mock.calls[0][0];
    expect(asked).toContain('Ana Ruiz');
    expect(asked).toMatch(/stay in the program/i);
    expect(deletePlayer).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('retires and re-reads once confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountSection();
    await w.find('[data-unassigned-retire="p1"]').trigger('click');
    await flush();

    expect(deletePlayer).toHaveBeenCalledWith('p1');
    expect(fetchUnassignedPlayers).toHaveBeenCalledTimes(2);
    confirmSpy.mockRestore();
  });

  it('reports a refusal in words rather than appearing to work', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    deletePlayer.mockResolvedValue([]);
    const w = await mountSection();
    await w.find('[data-unassigned-retire="p1"]').trigger('click');
    await flush();

    expect(w.find('[data-unassigned-action-error]').text()).toMatch(/refused/i);
    confirmSpy.mockRestore();
  });
});
