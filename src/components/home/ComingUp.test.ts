/**
 * The fixtures after the next one. HomeView hands over at most three
 * (upcomingMatches, less the first); this renders what it is given.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ComingUp from './ComingUp.vue';

const m = (id: string, opponent: string, isHome: boolean) =>
  ({ id, opponent, isHome, date: 'DEC 11 2026', time: '6:00 PM', matchOn: '2026-12-11', status: 'UPCOMING' });

const mountList = (over: Record<string, any> = {}) => {
  const defaultProps = { matches: [], total: 0, ...over };
  return mount(ComingUp, {
    props: defaultProps,
    global: { stubs: { RouterLink: { props: ['to'], template: '<a :data-to="JSON.stringify(to)"><slot /></a>' } } }
  });
};

describe('coming up', () => {
  it('lists each fixture with its opponent and side', () => {
    const w = mountList({ matches: [m('a', 'El Toro', false), m('b', 'Loyola', true)], total: 19 });
    const rows = w.findAll('[data-coming-row]');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('El Toro');
    expect(rows[0].text()).toMatch(/away/i);
    expect(rows[1].text()).toMatch(/home/i);
  });

  it('dates each row as the schedule does', () => {
    const w = mountList({ matches: [m('a', 'El Toro', false)], total: 19 });
    expect(w.find('[data-coming-row]').text()).toContain('DEC 11 2026');
  });

  it('links to every fixture, and says how many', () => {
    const link = mountList({ matches: [m('a', 'El Toro', false)], total: 19 }).find('[data-all-fixtures]');
    expect(link.text()).toContain('All 19 fixtures');
    expect(link.attributes('data-to')).toContain('schedule');
  });

  it('takes no room when nothing follows the next match', () => {
    expect(mountList({ matches: [], total: 1 }).find('[data-coming-up]').exists()).toBe(false);
  });
});
