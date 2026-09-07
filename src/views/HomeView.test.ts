/**
 * The home page's four states.
 *
 * The legacy version had two -- a fixture, or "SEASON COMPLETE" -- so every
 * other reason read as the season being over. At the start of a season, with
 * one past friendly on the books and the rest of the fixtures not yet entered,
 * that is precisely backwards.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import HomeView from './HomeView.vue';
import { toMatch } from '../domain/schedule-row';

const NOW = new Date(2026, 8, 1, 12, 0);

const row = (over: any = {}) => toMatch({
  id: 'm1', match_date: 'SEP 4 2026', match_time: '6:00 PM',
  match_on: '2026-09-04', kickoff_time: '18:00:00',
  opponent: 'Yucaipa', location: 'Home Field', venue_address: null,
  status: 'SCHEDULED', is_home: true, score: null, result: null, ...over
});

function mountHome(
  scheduleState: Record<string, any>,
  orgState: Record<string, any> = {},
  extra: Record<string, any> = {}
) {
  return mount(HomeView, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: true,
        initialState: {
          schedule: { matches: [], loading: false, loadError: null, loadedTeamId: 't1', ...scheduleState },
          organization: {
            schools: [{ id: 's1', name: 'Legends FC', mascot: 'Lions' }],
            teams: [{ id: 't1', name: 'U16', school_id: 's1' }],
            activeTeamId: 't1',
            ...orgState
          },
          auth: { isCoach: false, isAdmin: false, isGuest: true, canAccessRatings: false },
          ...extra
        }
      })],
      stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } }
    }
  });
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

describe('an upcoming fixture', () => {
  it('names the opponent', () => {
    // Case-insensitively: the headline uppercases it, which is presentation.
    const w = mountHome({ matches: [row()] });
    expect(w.text()).toMatch(/yucaipa/i);
  });

  it('shows where and when', () => {
    const w = mountHome({ matches: [row()] });
    expect(w.text()).toContain('SEP 4 2026');
    expect(w.text()).toContain('Home Field');
  });

  it('counts down as one figure rather than reading all zeroes', () => {
    // NOW is Sep 1 12:00; kick-off is Sep 4 18:00 — three days and six hours.
    const w = mountHome({ matches: [row()] });
    expect(w.find('[data-countdown]').text()).toBe('3d 06h');
  });

  it('shows the last result in words beside the score', () => {
    const w = mountHome({
      matches: [
        row({ id: 'p', match_date: 'AUG 21 2026', match_on: '2026-08-21', opponent: 'Millbrook',
              status: 'COMPLETED', score: '3 - 1', is_home: true }),
        row()
      ]
    });
    const last = w.find('[data-last-result]');
    expect(last.text()).toContain('Millbrook');
    expect(last.text()).toMatch(/won/i);
    expect(last.text()).toContain('3 - 1');
  });
});

describe('the other three states', () => {
  it('says the schedule is coming rather than that the season ended', () => {
    const w = mountHome({ matches: [] });
    expect(w.text()).toMatch(/coming soon/i);
    expect(w.text()).not.toMatch(/season complete/i);
  });

  it('tells a coach where to add fixtures, and does not tell a guest', () => {
    const coachView = mountHome({ matches: [] }, {});
    expect(coachView.text()).not.toMatch(/add them from/i);

    const w = mount(HomeView, {
      global: {
        plugins: [createTestingPinia({
          createSpy: vi.fn, stubActions: true,
          initialState: {
            schedule: { matches: [], loadedTeamId: 't1' },
            organization: { schools: [], teams: [], activeTeamId: 't1' },
            auth: { isCoach: true, isGuest: false }
          }
        })],
        stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } }
      }
    });
    expect(w.text()).toMatch(/add them from/i);
  });

  it('names the last match played when the schedule has run out', () => {
    // Stale, not complete: fixtures exist, are past, and were never written up.
    const w = mountHome({
      matches: [row({ match_date: 'AUG 21 2026', match_on: '2026-08-21', opponent: 'Redlands' })]
    });
    expect(w.text()).toContain('Redlands');
    expect(w.text()).not.toMatch(/season complete/i);
  });

  it('says the season is complete only when every fixture is written up', () => {
    const w = mountHome({
      matches: [row({
        match_date: 'AUG 21 2026', match_on: '2026-08-21',
        status: 'COMPLETED', score: '3 - 1'
      })]
    });
    expect(w.text()).toMatch(/season complete/i);
  });
});

describe('the record', () => {
  it('reads wins - losses - draws from the completed fixtures', () => {
    const w = mountHome({
      matches: [
        row({ id: 'a', match_on: '2026-08-01', status: 'COMPLETED', score: '3 - 1' }),
        row({ id: 'b', match_on: '2026-08-08', status: 'COMPLETED', score: '0 - 2' }),
        row({ id: 'c', match_on: '2026-08-15', status: 'COMPLETED', score: '1 - 1' })
      ]
    });
    expect(w.text()).toContain('1 - 1 - 1');
  });
});

describe('branding', () => {
  it('shows the organization from the store', () => {
    const w = mountHome({ matches: [row()] });
    expect(w.text()).toContain('Legends FC');
    expect(w.text()).toMatch(/lions/i);
  });

  it('names no organization at all rather than a hardcoded one', () => {
    // Beaumont is the first organization, not the only one.
    const w = mountHome({ matches: [row()] }, { schools: [], teams: [], activeTeamId: null });
    expect(w.text()).not.toMatch(/beaumont|cougars/i);
  });
});

describe('loading and failure', () => {
  it('says nothing about an empty season while still loading', () => {
    const w = mountHome({ matches: [], loading: true, loadedTeamId: null });
    expect(w.text()).not.toMatch(/coming soon/i);
  });

  it('surfaces a load failure instead of an empty season', () => {
    const w = mountHome({ matches: [], loadError: 'offline', loadedTeamId: null });
    expect(w.text()).toContain('offline');
  });
});

describe("the coach's message", () => {
  const MESSAGE = {
    id: 'd1', title: 'Press together', thoughts_text: 'Squeeze the space.',
    coach_name: 'Coach Bob', is_active: true
  };

  it('is on Home, where the squad looks', () => {
    // It lived in the practice planner only as an artefact of the app.js
    // split; a message to the squad belongs on the page the squad opens.
    const w = mountHome({}, {}, { thoughts: { thoughts: [MESSAGE] } });
    expect(w.find('[data-thought-text]').text()).toBe('Squeeze the space.');
  });

  it('shows a guest no controls for it', () => {
    const w = mountHome({}, {}, { thoughts: { thoughts: [MESSAGE] } });
    expect(w.find('[data-thought-new]').exists()).toBe(false);
  });

  it('takes no room at all when no message is set', () => {
    const w = mountHome({}, {}, { thoughts: { thoughts: [] } });
    expect(w.find('[data-daily-thought]').exists()).toBe(false);
  });

  it('offers a coach a way to write one', () => {
    const w = mountHome({}, {}, {
      thoughts: { thoughts: [] },
      auth: { isCoach: true, isAdmin: false, isGuest: false, canAccessRatings: true }
    });
    expect(w.find('[data-thought-new]').exists()).toBe(true);
  });
});
