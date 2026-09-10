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
import { reportFailure, resetNotices, currentNotices, reportConnection } from '../../domain/notices';

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

describe('the connection banner', () => {
  /*
   * The 107 service methods that return null when the client is unconfigured
   * say nothing at all, so an app with no credentials loads empty and reports
   * nothing. This is the one thing that explains an entirely blank site.
   */
  it('is absent while the app is connected', async () => {
    const w = await mountBox();
    expect(w.find('[data-connection]').exists()).toBe(false);
  });

  it('appears on its own, with no failure to accompany it', async () => {
    reportConnection(false, 'Needs a .supabase.co URL. Got: (no URL).');
    const w = await mountBox();

    expect(w.find('[data-connection-message]').text()).toContain('Not connected');
    expect(w.findAll('[data-notice]')).toHaveLength(0);
  });

  it('says what a person can do about it', async () => {
    reportConnection(false, 'no key');
    const w = await mountBox();

    expect(w.find('[data-connection]').text()).toMatch(/admin/i);
  });

  it('keeps the technical reason behind a toggle', async () => {
    reportConnection(false, 'Needs a .supabase.co URL. Got: (no URL).');
    const w = await mountBox();

    expect(w.find('[data-connection-detail]').exists()).toBe(false);
    await w.find('[data-connection-toggle]').trigger('click');
    expect(w.find('[data-connection-detail]').text()).toContain('supabase.co');
  });

  it('cannot be dismissed, because it is a state and not an event', async () => {
    // Dismissing it would hide the only explanation for an empty site, and
    // the state it describes would still be true.
    reportConnection(false, 'no key');
    const w = await mountBox();

    expect(w.find('[data-connection]').find('[data-notice-dismiss]').exists()).toBe(false);
  });

  it('goes away by itself when the connection arrives', async () => {
    // setCredentials rebuilds the client from the admin panel.
    reportConnection(false, 'no key');
    const w = await mountBox();
    expect(w.find('[data-connection]').exists()).toBe(true);

    reportConnection(true);
    await w.vm.$nextTick();

    expect(w.find('[data-connection]').exists()).toBe(false);
  });

  it('sits above the failures, being the one that explains them', async () => {
    reportConnection(false, 'no key');
    reportFailure('fetchTeamRoster', 'timeout');
    const w = await mountBox();

    const html = w.html();
    expect(html.indexOf('data-connection')).toBeLessThan(html.indexOf('data-notice='));
  });

  it('is not capped or counted with the failures', async () => {
    // Three failures already fill the visible column; the banner is extra.
    ['fetchSchedule', 'fetchPlayers', 'fetchCoaches'].forEach(m => reportFailure(m, 'timeout'));
    reportConnection(false, 'no key');
    const w = await mountBox();

    expect(w.find('[data-connection]').exists()).toBe(true);
    expect(w.findAll('[data-notice]')).toHaveLength(3);
  });
});
