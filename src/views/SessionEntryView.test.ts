/**
 * Session entry at its own URL.
 *
 * The cold cases are what matter: a bookmark to an exercise that has since
 * been retired must say so, and an unloaded drill library must not claim the
 * exercise is gone.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { createRouter, createMemoryHistory } from 'vue-router';
import SessionEntryView from './SessionEntryView.vue';

const DRILLS = [{ id: 'd1', name: '1.5-Mile Run', measure: 'time_bands' }];

async function mountAt(path: string, sessionState: Record<string, any> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/matrix', name: 'matrix', component: { template: '<p />' } },
      { path: '/matrix/session/:drillId', name: 'session-entry', component: SessionEntryView }
    ]
  });
  await router.push(path);
  await router.isReady();

  const w = mount(SessionEntryView, {
    global: {
      plugins: [router, createTestingPinia({
        createSpy: vi.fn,
        initialState: {
          session: { drills: DRILLS, sessions: [], results: [], bands: [], editingId: null, loading: false, loadError: null, ...sessionState },
          organization: {
            schools: [{ id: 's1', name: 'Legends FC', mascot: 'Lions' }],
            teams: [{ id: 't1', name: 'U16', school_id: 's1' }],
            activeTeamId: 't1'
          },
          roster: { players: [{ id: 'p1', name: 'Cesar Alva', recordingNumber: 1 }], loadedTeamId: 't1' }
        }
      })],
      stubs: { SessionEntryScreen: { props: ['drillId'], template: '<div data-screen :data-drill="drillId" />' } }
    }
  });
  await flushPromises();
  return w;
}

describe('SessionEntryView', () => {
  it('renders the grid for an exercise in the library', async () => {
    const w = await mountAt('/matrix/session/d1');
    expect(w.find('[data-screen]').attributes('data-drill')).toBe('d1');
  });

  it('says so when the exercise is not in the library', async () => {
    const w = await mountAt('/matrix/session/gone');
    expect(w.find('[data-tool-notice="missing"]').exists()).toBe(true);
    expect(w.find('[data-screen]').exists()).toBe(false);
  });

  it('claims nothing before the library has loaded', async () => {
    const w = await mountAt('/matrix/session/gone', { drills: [], loading: true });
    expect(w.find('[data-tool-notice="loading"]').exists()).toBe(true);
    expect(w.find('[data-tool-notice="missing"]').exists()).toBe(false);
  });

  it('reopens a named session rather than starting a blank one', async () => {
    const w = await mountAt('/matrix/session/d1?session=s9');
    const store = (w.vm as any).$pinia._s.get('session');
    expect(store.openExisting).toHaveBeenCalled();
    expect(store.openNew).not.toHaveBeenCalled();
  });

  it('starts a blank sheet when no session is named', async () => {
    const w = await mountAt('/matrix/session/d1');
    const store = (w.vm as any).$pinia._s.get('session');
    expect(store.openNew).toHaveBeenCalled();
    expect(store.openExisting).not.toHaveBeenCalled();
  });
});
