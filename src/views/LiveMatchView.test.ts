/**
 * The live board at its own URL.
 *
 * A board always needs a fixture: unlike a lineup, there is nothing to write
 * to without one. The cold cases are what matter — a stale bookmark says so,
 * and an unloaded schedule claims nothing.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { createRouter, createMemoryHistory } from 'vue-router';
import LiveMatchView from './LiveMatchView.vue';

const MATCHES = [{ id: 'm1', opponent: 'Yucaipa', isHome: true }];

async function mountAt(matchId: string, schedule: Record<string, any> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/schedule', name: 'schedule', component: { template: '<p />' } },
      { path: '/schedule/:matchId/live', name: 'live', component: LiveMatchView }
    ]
  });
  await router.push(`/schedule/${matchId}/live`);
  await router.isReady();

  const w = mount(LiveMatchView, {
    global: {
      plugins: [router, createTestingPinia({
        createSpy: vi.fn,
        initialState: {
          schedule: { matches: MATCHES, loading: false, loadError: null, loadedTeamId: 't1', ...schedule },
          organization: {
            schools: [{ id: 's1', name: 'Legends FC', mascot: 'Lions' }],
            teams: [{ id: 't1', name: 'U16', school_id: 's1' }],
            activeTeamId: 't1'
          },
          roster: { players: [{ id: 'p1', name: 'Cesar Alva', number: 1 }], loadedTeamId: 't1' }
        }
      })],
      stubs: { LiveMatchScreen: { props: ['matchId', 'matchLabel'], template: '<div data-screen :data-label="matchLabel" />' } }
    }
  });
  await flushPromises();
  return w;
}

describe('LiveMatchView', () => {
  it('renders the board for a fixture on the schedule', async () => {
    const w = await mountAt('m1');
    expect(w.find('[data-screen]').attributes('data-label')).toBe('Yucaipa');
  });

  it('says so when the id names no fixture this team has', async () => {
    const w = await mountAt('gone');
    expect(w.find('[data-tool-notice="missing"]').exists()).toBe(true);
    expect(w.find('[data-screen]').exists()).toBe(false);
  });

  it('claims nothing about a missing fixture before the schedule has loaded', async () => {
    const w = await mountAt('gone', { loadedTeamId: null, loading: true });
    expect(w.find('[data-tool-notice="loading"]').exists()).toBe(true);
    expect(w.find('[data-tool-notice="missing"]').exists()).toBe(false);
  });
});
