/**
 * Schedule & Results.
 *
 * As on the Roster, a guest must not merely have the write controls hidden —
 * they must not be in the document. And the directions link appears only for
 * an away fixture whose address a coach actually stated, because a map query
 * of "Redlands" lands in the middle of a city rather than at a school.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import ScheduleView from './ScheduleView.vue';
import { toMatch } from '../domain/schedule-row';

// Pinned before the Yucaipa fixture below, as HomeView.test.ts does for the
// same fixture data — otherwise "the next fixture" drifts into the past as
// real time passes Sep 4, 2026 and schedule.nextMatch goes null.
const NOW = new Date(2026, 8, 1, 12, 0);

const row = (over: any = {}) => toMatch({
  id: 'm1', match_date: 'SEP 4, 2026', match_time: '6:00 PM',
  match_on: '2026-09-04', kickoff_time: '18:00:00',
  opponent: 'Yucaipa', location: 'Home Field', venue_address: null,
  status: 'SCHEDULED', is_home: true, score: null, result: null, ...over
});

const FIXTURES = [
  row(),
  row({ id: 'm2', opponent: 'Redlands', match_date: 'AUG 21, 2026',
        match_on: '2026-08-21', status: 'COMPLETED', score: '3 - 1' })
];

function mountSchedule(opts: {
  matches?: any[]; coach?: boolean; loading?: boolean;
  loadedTeamId?: string | null; loadError?: string | null;
  lineupIndex?: any[];
} = {}) {
  const {
    matches = FIXTURES, coach = false, loading = false,
    loadedTeamId = 't1', loadError = null, lineupIndex = []
  } = opts;

  return mount(ScheduleView, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: true,
        initialState: {
          schedule: { matches, loading, loadError, loadedTeamId },
          roster: { players: [{ id: 'p1', name: 'Cesar Alva', number: 1 }] },
          lineup: { index: lineupIndex },
          organization: {
            schools: [{ id: 's1', name: 'Legends FC', mascot: 'Lions' }],
            teams: [{ id: 't1', name: 'U16', school_id: 's1' }],
            activeTeamId: 't1'
          },
          auth: { isCoach: coach, isAdmin: false, isGuest: !coach, canAccessRatings: coach }
        }
      })],
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a :href="href"><slot /></a>',
          computed: {
            href(): string {
              const to: any = (this as any).to;
              if (typeof to === 'string') return to;
              if (to?.name === 'lineup') {
                return to.params?.matchId ? `/schedule/lineup/${to.params.matchId}` : '/schedule/lineup';
              }
              if (to?.name === 'live') return `/schedule/${to.params?.matchId}/live`;
              if (to?.name === 'season-report') return '/schedule/report';
              return '#';
            }
          }
        }
      }
    }
  });
}

beforeEach(() => { document.body.innerHTML = ''; vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

describe('the fixtures', () => {
  it('renders upcoming and completed fixtures', () => {
    const w = mountSchedule();
    expect(w.text()).toContain('Yucaipa');
    expect(w.text()).toContain('Redlands');
    expect(w.findAll('[data-fixture]')).toHaveLength(2);
  });

  it('separates upcoming from results', () => {
    const w = mountSchedule();
    expect(w.text()).toMatch(/upcoming/i);
    expect(w.text()).toMatch(/results/i);
  });

  it('shows a score for a completed fixture only', () => {
    const w = mountSchedule();
    const scores = w.findAll('[data-score]');
    expect(scores).toHaveLength(1);
    expect(scores[0].text()).toBe('3 - 1');
  });

  it('shows the day of the week with the date', () => {
    expect(mountSchedule().text()).toContain('SEP 4, 2026 (Fri)');
  });

  it('names the organization, with no hardcoded name', () => {
    const w = mountSchedule();
    expect(w.text()).toContain('Legends FC');
    expect(w.text()).not.toMatch(/beaumont|cougars/i);
  });

  it('says the schedule is empty only once it has loaded', () => {
    expect(mountSchedule({ matches: [], loading: true, loadedTeamId: null })
      .find('[data-empty]').exists()).toBe(false);
    expect(mountSchedule({ matches: [], loadedTeamId: 't1' })
      .find('[data-empty]').exists()).toBe(true);
  });

  it('surfaces a load failure', () => {
    expect(mountSchedule({ loadError: 'offline' }).find('[data-load-error]').text())
      .toContain('offline');
  });

  it('lifts the next fixture into its own card and says the result in words', () => {
    const w = mountSchedule();
    const next = w.find('[data-next-fixture]');
    expect(next.exists()).toBe(true);
    expect(next.text()).toContain('Yucaipa');
    // The word carries the outcome; colour never does alone.
    expect(w.find('[data-outcome]').text()).toMatch(/won/i);
  });
});

describe('the directions link', () => {
  it('appears for an away fixture with a stated address', () => {
    const w = mountSchedule({
      matches: [row({ is_home: false, venue_address: '1 Cougar Way, Beaumont CA' })]
    });
    const link = w.find('[data-directions]');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toContain('google.com/maps/dir/');
  });

  it('does not appear for a home fixture', () => {
    expect(mountSchedule({ matches: [row({ is_home: true, venue_address: 'x' })] })
      .find('[data-directions]').exists()).toBe(false);
  });

  it('does not appear for an away fixture with no address', () => {
    // 'Redlands' as a map query lands in the middle of a city, and this
    // schedule holds both 'Redlands' and 'Redlands East Valley'.
    expect(mountSchedule({ matches: [row({ is_home: false, venue_address: null })] })
      .find('[data-directions]').exists()).toBe(false);
  });
});

describe('what a guest may do', () => {
  it('sees no add, edit or delete control at all', () => {
    const w = mountSchedule({ coach: false });
    expect(w.find('[data-add-match]').exists()).toBe(false);
    expect(w.find('[data-match-edit]').exists()).toBe(false);
    expect(w.find('[data-match-remove]').exists()).toBe(false);
  });
});

describe('what a coach may do', () => {
  it('sees add, edit and delete', () => {
    const w = mountSchedule({ coach: true });
    expect(w.find('[data-add-match]').exists()).toBe(true);
    expect(w.findAll('[data-match-edit]')).toHaveLength(2);
  });

  it('opens an empty form to add', async () => {
    const w = mountSchedule({ coach: true });
    await w.find('[data-add-match]').trigger('click');
    expect((w.find('[data-field="opponent"]').element as HTMLInputElement).value).toBe('');
  });

  it('opens the form filled in to edit, with the date as an input value', async () => {
    const w = mountSchedule({ coach: true });
    await w.findAll('[data-match-edit]')[0].trigger('click');
    expect((w.find('[data-field="opponent"]').element as HTMLInputElement).value)
      .toBe('Yucaipa');
    // Converted back to ISO for the date input; the store converts it forward
    // again on save, because the trigger cannot read an ISO date.
    expect((w.find('[data-field="date"]').element as HTMLInputElement).value)
      .toBe('2026-09-04');
  });

  it('requires a location in the markup, not only in the store', async () => {
    // schedule.location is NOT NULL; a browser message beats a round trip
    // that returns a constraint error.
    const w = mountSchedule({ coach: true });
    await w.find('[data-add-match]').trigger('click');
    expect(w.find('[data-field="location"]').attributes('required')).toBeDefined();
  });

  it('asks before deleting, naming the fixture', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mountSchedule({ coach: true });
    await w.findAll('[data-match-remove]')[0].trigger('click');
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Yucaipa'));
    confirmSpy.mockRestore();
  });
});

describe('plus / minus', () => {
  it('is offered on every fixture, for a coach', () => {
    const w = mountSchedule({ coach: true });
    expect(w.findAll('[data-fixture-pm]')).toHaveLength(FIXTURES.length);
  });

  it('is absent for a guest, not merely hidden', () => {
    expect(mountSchedule({ coach: false }).find('[data-fixture-pm]').exists()).toBe(false);
  });

  it('links each fixture to its live board', () => {
    const w = mountSchedule({ coach: true });
    expect(w.findAll('[data-fixture-pm]')[0].attributes('href')).toMatch(/^\/schedule\/.+\/live$/);
  });
});

describe('the match tools', () => {
  it('offers a coach a lineup on every fixture', () => {
    const w = mountSchedule({ coach: true });
    expect(w.findAll('[data-fixture-lineup]')).toHaveLength(FIXTURES.length);
  });

  it('offers the season report, and a lineup with no fixture attached', () => {
    const w = mountSchedule({ coach: true });
    expect(w.find('[data-open-season]').exists()).toBe(true);
    expect(w.find('[data-open-lineup]').exists()).toBe(true);
  });

  it('offers a guest none of it, absent rather than hidden', () => {
    const w = mountSchedule({ coach: false });
    expect(w.find('[data-fixture-lineup]').exists()).toBe(false);
    expect(w.find('[data-open-season]').exists()).toBe(false);
    expect(w.find('[data-open-lineup]').exists()).toBe(false);
  });

  it('MARKS a fixture that has no team sheet yet', () => {
    // The whole reason the lineup index is read: a coach checking on a
    // Thursday which of the weekend's games still needs one.
    const w = mountSchedule({ coach: true, lineupIndex: [] });
    expect(w.findAll('[data-lineup-missing]')).toHaveLength(FIXTURES.length);
  });

  it('does not mark a fixture that already has one', () => {
    const w = mountSchedule({
      coach: true,
      lineupIndex: FIXTURES.map(m => ({ id: `l-${m.id}`, match_id: m.id }))
    });
    expect(w.find('[data-lineup-missing]').exists()).toBe(false);
  });

  it('marks only the fixtures that are actually missing one', () => {
    const w = mountSchedule({
      coach: true,
      lineupIndex: [{ id: 'l-m1', match_id: 'm1' }]
    });
    expect(w.findAll('[data-lineup-missing]')).toHaveLength(1);
  });

  it('links each fixture to its lineup, and the header to a sheet with no fixture', () => {
    const w = mountSchedule({ coach: true });
    const first = w.findAll('[data-fixture-lineup]')[0];
    expect(first.attributes('href')).toContain('/schedule/lineup/');
    expect(w.find('[data-open-lineup]').attributes('href')).toBe('/schedule/lineup');
  });
});
