/**
 * Roster & Bios.
 *
 * Two things here are not cosmetic. A guest must not merely have the write
 * controls hidden -- they must not be in the document, because "hidden" is a
 * CSS property and this is the screen a coach edits their squad from. And the
 * Phase 5 entry points the legacy roster carries are absent rather than
 * stubbed, so nothing on screen promises a feature that is not built.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import RosterView from './RosterView.vue';
import { toPlayer } from '../domain/player-row';

const row = (id: string, name: string, over: any = {}) => toPlayer({
  id: 'tp-' + id, number: 7, recording_number: 21, position: 8,
  season_stats: { goals: 3 }, ratings: {},
  players: {
    id, name,
    first_name: name.split(' ')[0], last_name: name.split(' ')[1] || '',
    class_year: 'Senior', height: '5-10', photo_url: ''
  },
  ...over
});

const SQUAD = [
  row('p1', 'Cesar Alva', { number: 9, position: 9 }),
  row('p2', 'Tom Budde', { number: 2, position: 4 })
];

function mountRoster(opts: {
  players?: any[]; coach?: boolean; loading?: boolean;
  loadedTeamId?: string | null; loadError?: string | null; sortBy?: 'number' | 'name';
} = {}) {
  const {
    players = SQUAD, coach = false, loading = false,
    loadedTeamId = 't1', loadError = null, sortBy = 'number'
  } = opts;

  return mount(RosterView, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: true,
        initialState: {
          roster: { players, loading, loadError, loadedTeamId, sortBy, filter: 'ALL' },
          organization: {
            schools: [{ id: 's1', name: 'Legends FC', mascot: 'Lions' }],
            teams: [{ id: 't1', name: 'U16', school_id: 's1' }],
            activeTeamId: 't1'
          },
          auth: { isCoach: coach, isAdmin: false, isGuest: !coach, canAccessRatings: coach }
        }
      })]
    }
  });
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('the squad', () => {
  it('renders every player on the active team', () => {
    const w = mountRoster();
    expect(w.text()).toContain('Cesar Alva');
    expect(w.text()).toContain('Tom Budde');
  });

  it('names the organization from the store, with no hardcoded name', () => {
    const w = mountRoster();
    expect(w.text()).toContain('Legends FC');
    expect(w.text()).not.toMatch(/beaumont|cougars/i);
  });

  it('offers a chip per position group, with counts', () => {
    const w = mountRoster();
    expect(w.findAll('[data-filter-chip]').map(c => c.text().replace(/\s+/g, ' ').trim()))
      .toEqual(expect.arrayContaining([expect.stringContaining('Defence'), expect.stringContaining('Attack')]));
    expect(w.text()).not.toMatch(/Midfield/);
  });

  it('says the roster is empty only once it has loaded', () => {
    expect(mountRoster({ players: [], loading: true, loadedTeamId: null })
      .find('[data-empty]').exists()).toBe(false);
    expect(mountRoster({ players: [], loadedTeamId: 't1' })
      .find('[data-empty]').exists()).toBe(true);
  });

  it('surfaces a load failure', () => {
    const w = mountRoster({ loadError: 'offline' });
    expect(w.find('[data-load-error]').text()).toContain('offline');
  });
});

describe('what a guest may do', () => {
  it('sees no add, edit or remove control at all', () => {
    // Not hidden -- absent. "Hidden" is a CSS property.
    const w = mountRoster({ coach: false });
    expect(w.find('[data-add-player]').exists()).toBe(false);
    expect(w.find('[data-player-edit]').exists()).toBe(false);
    expect(w.find('[data-player-remove]').exists()).toBe(false);
  });

  it('can still open a player\'s bio', async () => {
    const w = mountRoster({ coach: false });
    await w.findAll('[data-player-open]')[0].trigger('click');
    expect(w.text()).toContain('Cesar Alva');
  });
});

describe('what a coach may do', () => {
  it('sees add, edit and remove', () => {
    const w = mountRoster({ coach: true });
    expect(w.find('[data-add-player]').exists()).toBe(true);
    expect(w.findAll('[data-player-edit]').length).toBe(2);
    expect(w.findAll('[data-player-remove]').length).toBe(2);
  });

  it('opens an empty form to add', async () => {
    const w = mountRoster({ coach: true });
    await w.find('[data-add-player]').trigger('click');
    expect(w.find('[data-field="firstName"]').exists()).toBe(true);
    expect((w.find('[data-field="firstName"]').element as HTMLInputElement).value).toBe('');
  });

  it('opens the form filled in to edit', async () => {
    // The grid is number-sorted, so Budde (2) is first and Alva (9) second --
    // which is also worth asserting, since a card editing the wrong player is
    // exactly the silent failure this screen must not have.
    const w = mountRoster({ coach: true });
    expect(w.findAll('[data-player-open]')[0].text()).toContain('Tom Budde');

    await w.findAll('[data-player-edit]')[0].trigger('click');
    expect((w.find('[data-field="firstName"]').element as HTMLInputElement).value).toBe('Tom');
  });

  it('asks before removing, and says the person stays in the program', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mountRoster({ coach: true });
    await w.findAll('[data-player-remove]')[0].trigger('click');

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/stay in the program/i));
    confirmSpy.mockRestore();
  });
});

describe('the Phase 5 entry points', () => {
  it('has the recording numbers, and leaves the rest to the Schedule', () => {
    // The legacy roster links to the lineup, plus/minus and the season report
    // as well. Those three belong to a fixture rather than to the squad, so
    // in the rebuild they hang off Schedule, which is where a coach looks for
    // them.
    const w = mountRoster({ coach: true });
    const text = w.text().toLowerCase();

    expect(text).toContain('recording number');
    for (const elsewhere of ['lineup', 'plus/minus', 'season report']) {
      expect(text, elsewhere).not.toContain(elsewhere);
    }
  });
});

describe('recording numbers', () => {
  it('offers a coach the block editor', () => {
    const w = mountRoster({ coach: true });
    expect(w.find('[data-open-numbers]').exists()).toBe(true);
  });

  it('is absent for a guest, not merely hidden', () => {
    expect(mountRoster({ coach: false }).find('[data-open-numbers]').exists()).toBe(false);
  });

  it('opens on the squad, proposing nothing until asked', async () => {
    // Nothing renumbers a squad on its own.
    const w = mountRoster({ coach: true });
    await w.find('[data-open-numbers]').trigger('click');
    await w.vm.$nextTick();

    expect(w.find('[data-rn-propose]').exists()).toBe(true);
    expect(w.find('[data-rn-pending]').text()).toContain('0');
  });
});

describe('resetting the sort', () => {
  it('offers no reset while the roster is in number order', () => {
    expect(mountRoster().find('[data-sort-reset]').exists()).toBe(false);
  });

  it('offers one once it is sorted by name, and resets through the store', async () => {
    const w = mountRoster({ sortBy: 'name' });
    const reset = w.find('[data-sort-reset]');
    expect(reset.text()).toBe('Reset sort');
    await reset.trigger('click');
    const { useRosterStore } = await import('../stores/roster');
    expect(useRosterStore().resetSort).toHaveBeenCalled();
  });
});
