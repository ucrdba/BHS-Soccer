/**
 * The lineup at its own URL.
 *
 * The cases that matter are the cold ones: a bookmark to a fixture that has
 * since been deleted must say so, and one that has not loaded yet must not
 * claim the fixture is missing.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { createRouter, createMemoryHistory } from 'vue-router';
import LineupView from './LineupView.vue';

const MATCHES = [{ id: 'm1', opponent: 'Yucaipa', isHome: true }];

async function mountAt(matchId: string | null, schedule: Record<string, any> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/schedule', name: 'schedule', component: { template: '<p />' } },
      { path: '/schedule/lineup/:matchId?', name: 'lineup', component: LineupView },
      { path: '/schedule/:matchId/live', name: 'live', component: { template: '<p />' } }
    ]
  });
  await router.push(matchId ? `/schedule/lineup/${matchId}` : '/schedule/lineup');
  await router.isReady();

  const w = mount(LineupView, {
    global: {
      plugins: [router, createTestingPinia({
        createSpy: vi.fn,
        initialState: {
          schedule: { matches: MATCHES, loading: false, loadError: null, loadedTeamId: 't1', ...schedule },
          organization: {
            schools: [{ id: 's1', name: 'Legends FC', mascot: 'Lions' }],
            teams: [{ id: 't1', name: 'U16', school_id: 's1', match_minutes: 80 }],
            activeTeamId: 't1'
          },
          roster: { players: [{ id: 'p1', name: 'Cesar Alva', number: 1 }], loadedTeamId: 't1' }
        }
      })],
      stubs: { LineupScreen: { props: ['matchId', 'matchLabel', 'matchMinutes'], template: '<div data-screen :data-label="matchLabel" :data-minutes="matchMinutes" />' } }
    }
  });
  await flushPromises();
  return w;
}

describe('LineupView', () => {
  it('renders the screen for a fixture on the schedule', async () => {
    const w = await mountAt('m1');
    expect(w.find('[data-screen]').attributes('data-label')).toBe('Yucaipa');
  });

  it('passes the team\'s own match length, not a constant', async () => {
    const w = await mountAt('m1');
    expect(w.find('[data-screen]').attributes('data-minutes')).toBe('80');
  });

  it('renders the screen with no fixture, which is a sheet not tied to one', async () => {
    const w = await mountAt(null);
    expect(w.find('[data-screen]').exists()).toBe(true);
    expect(w.find('[data-tool-notice="missing"]').exists()).toBe(false);
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

  it('returns to the schedule when the screen is done', async () => {
    // Parked in phase 3: a saved sheet used to navigate twice and nothing
    // tested that it navigated at all.
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/schedule', name: 'schedule', component: { template: '<p />' } },
        { path: '/schedule/lineup/:matchId?', name: 'lineup', component: LineupView },
        { path: '/schedule/:matchId/live', name: 'live', component: { template: '<p />' } }
      ]
    });
    await router.push('/schedule/lineup/m1');
    await router.isReady();

    const w = mount(LineupView, {
      global: {
        plugins: [router, createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            schedule: { matches: MATCHES, loading: false, loadError: null, loadedTeamId: 't1' },
            organization: {
              schools: [{ id: 's1', name: 'Legends FC', mascot: 'Lions' }],
              teams: [{ id: 't1', name: 'U16', school_id: 's1', match_minutes: 80 }],
              activeTeamId: 't1'
            },
            roster: { players: [{ id: 'p1', name: 'Cesar Alva', number: 1 }], loadedTeamId: 't1' }
          }
        })],
        stubs: { LineupScreen: { name: 'LineupScreen', template: '<div data-screen />' } }
      }
    });
    await flushPromises();

    const push = vi.spyOn(router, 'push');
    w.findComponent({ name: 'LineupScreen' }).vm.$emit('close');
    await flushPromises();

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({ name: 'schedule' });
  });
});
