/**
 * What went wrong, said on the page.
 *
 * The data layer reports failures to domain/notices; this renders them. The
 * point of the whole channel is that a coach never opens a console, so the
 * assertions here are mostly about what a coach can actually read and do.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import NoticeBox from './NoticeBox.vue';
import { reportFailure, resetNotices, currentNotices } from '../../domain/notices';

beforeEach(() => { resetNotices(); });
afterEach(() => { resetNotices(); });

const flush = () => new Promise(r => setTimeout(r, 0));

async function mountBox() {
  const w = mount(NoticeBox, { attachTo: document.body });
  await flush();
  await w.vm.$nextTick();
  return w;
}

describe('when nothing has failed', () => {
  it('is not on the page at all', async () => {
    const w = await mountBox();
    expect(w.find('[data-notices]').exists()).toBe(false);
  });
});

describe('showing a failure', () => {
  it('leads with the sentence, not the method name', async () => {
    reportFailure('fetchTeamRoster', 'permission denied for table team_players');
    const w = await mountBox();

    expect(w.find('[data-notice-message]').text()).toBe('The roster could not be loaded.');
  });

  it('keeps the technical text closed until it is asked for', async () => {
    reportFailure('fetchTeamRoster', 'permission denied for table team_players');
    const w = await mountBox();

    expect(w.find('[data-notice-detail]').exists()).toBe(false);

    await w.find('[data-notice-toggle]').trigger('click');
    expect(w.find('[data-notice-detail]').text()).toContain('permission denied');
    // Named, because a coach forwarding this is how the cause gets found.
    expect(w.find('[data-notice-detail]').text()).toContain('fetchTeamRoster');
  });

  it('closes the details again', async () => {
    reportFailure('fetchTeamRoster', 'permission denied');
    const w = await mountBox();

    await w.find('[data-notice-toggle]').trigger('click');
    await w.find('[data-notice-toggle]').trigger('click');
    expect(w.find('[data-notice-detail]').exists()).toBe(false);
  });

  it('offers no details when there are none to offer', async () => {
    reportFailure('fetchTeamRoster');
    const w = await mountBox();

    expect(w.find('[data-notice-message]').exists()).toBe(true);
    expect(w.find('[data-notice-toggle]').exists()).toBe(false);
  });

  it('appears for a failure that arrives after it is on screen', async () => {
    const w = await mountBox();
    expect(w.find('[data-notices]').exists()).toBe(false);

    reportFailure('fetchSchedule', 'timeout');
    await w.vm.$nextTick();

    expect(w.find('[data-notice-message]').text()).toBe('The schedule could not be loaded.');
  });

  it('shows a failure that happened before it mounted', async () => {
    // The shell mounts after the first fetches have run, so a box that only
    // heard new failures would open blank over a broken page.
    reportFailure('fetchSchedule', 'timeout');
    const w = await mountBox();

    expect(w.find('[data-notice-message]').exists()).toBe(true);
  });
});

describe('several at once', () => {
  it('puts the newest first', async () => {
    reportFailure('fetchSchedule', 'a');
    reportFailure('fetchTeamRoster', 'b');
    const w = await mountBox();

    const messages = w.findAll('[data-notice-message]').map(n => n.text());
    expect(messages[0]).toContain('roster');
  });

  it('caps the column and says how many it is not showing', async () => {
    // A column of boxes tall enough to cover the page is a second problem,
    // not a clearer report of the first.
    ['fetchSchedule', 'fetchPlayers', 'fetchCoaches', 'fetchQuizBank', 'fetchRoles']
      .forEach(m => reportFailure(m, 'timeout'));
    const w = await mountBox();

    expect(w.findAll('[data-notice]')).toHaveLength(3);
    expect(w.find('[data-notices-more]').text()).toContain('2 more');
  });

  it('counts a repeat instead of stacking it', async () => {
    reportFailure('fetchTeamRoster', 'timeout');
    reportFailure('fetchTeamRoster', 'timeout');
    reportFailure('fetchTeamRoster', 'timeout');
    const w = await mountBox();

    expect(w.findAll('[data-notice]')).toHaveLength(1);
    expect(w.find('[data-notice-count]').text()).toContain('3 times');
  });

  it('says nothing about a count of one', async () => {
    reportFailure('fetchTeamRoster', 'timeout');
    const w = await mountBox();

    expect(w.find('[data-notice-count]').exists()).toBe(false);
  });
});

describe('dismissing', () => {
  it('takes the failure off the page and out of the record', async () => {
    reportFailure('fetchTeamRoster', 'timeout');
    const w = await mountBox();

    await w.find('[data-notice-dismiss]').trigger('click');

    expect(w.find('[data-notices]').exists()).toBe(false);
    expect(currentNotices()).toHaveLength(0);
  });

  it('dismisses only the one asked for', async () => {
    reportFailure('fetchSchedule', 'a');
    reportFailure('fetchTeamRoster', 'b');
    const w = await mountBox();

    // The newest is first, so this dismisses the roster.
    await w.findAll('[data-notice-dismiss]')[0].trigger('click');

    expect(w.findAll('[data-notice]')).toHaveLength(1);
    expect(w.find('[data-notice-message]').text()).toContain('schedule');
  });

  it('clears the lot from the overflow line', async () => {
    ['fetchSchedule', 'fetchPlayers', 'fetchCoaches', 'fetchQuizBank']
      .forEach(m => reportFailure(m, 'timeout'));
    const w = await mountBox();

    await w.find('[data-notices-clear]').trigger('click');
    expect(w.find('[data-notices]').exists()).toBe(false);
  });

  it('names what it dismisses, for a reader who cannot see the box', async () => {
    reportFailure('fetchTeamRoster', 'timeout');
    const w = await mountBox();

    expect(w.find('[data-notice-dismiss]').attributes('aria-label'))
      .toContain('The roster could not be loaded.');
  });
});

describe('leaving the page', () => {
  it('stops listening, so an unmounted box is not still being told', async () => {
    const w = await mountBox();
    w.unmount();

    // Would throw on a component rendering after unmount.
    expect(() => reportFailure('fetchSchedule', 'timeout')).not.toThrow();
  });
});
