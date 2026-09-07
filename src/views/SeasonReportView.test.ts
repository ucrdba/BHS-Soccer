/**
 * The season report at its own URL.
 *
 * It needs no fixture, so the only thing to prove is that it hands the
 * screen this team and this squad — a report built from another team's
 * roster names the wrong players.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import SeasonReportView from './SeasonReportView.vue';

describe('SeasonReportView', () => {
  it('hands the screen the active team, its teams and its squad', async () => {
    const w = mount(SeasonReportView, {
      global: {
        plugins: [createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            organization: {
              schools: [{ id: 's1', name: 'Legends FC' }],
              teams: [{ id: 't1', name: 'U16', school_id: 's1', match_minutes: 80 }],
              activeTeamId: 't1'
            },
            roster: { players: [{ id: 'p1', name: 'Cesar Alva' }], loadedTeamId: 't1' }
          }
        })],
        stubs: {
          SeasonReportScreen: {
            props: ['teamId', 'teams', 'players'],
            template: '<div data-screen :data-team="teamId" :data-players="players.length" />'
          }
        }
      }
    });
    await flushPromises();

    expect(w.find('[data-screen]').attributes('data-team')).toBe('t1');
    expect(w.find('[data-screen]').attributes('data-players')).toBe('1');
  });
});
