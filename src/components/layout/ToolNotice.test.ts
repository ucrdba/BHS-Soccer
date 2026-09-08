/**
 * What a tool route shows instead of its screen.
 *
 * Both cases need a way out: a tool route has no header and no navigation,
 * so a coach who lands on one from a stale link is otherwise stranded.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ToolNotice from './ToolNotice.vue';

const RouterLinkStub = { props: ['to'], template: '<a><slot /></a>' };

const mountNotice = (props: { kind: 'loading' | 'missing'; message: string; backLabel?: string }) => mount(ToolNotice, {
  props: { backTo: { name: 'schedule' }, ...props },
  global: { stubs: { RouterLink: RouterLinkStub } }
});

describe('ToolNotice', () => {
  it('shows the message it was given', () => {
    const w = mountNotice({ kind: 'loading', message: 'Loading the fixture…' });
    expect(w.find('[data-tool-notice-message]').text()).toBe('Loading the fixture…');
  });

  it('says which kind it is, so a test and a stylesheet can tell them apart', () => {
    expect(mountNotice({ kind: 'loading', message: 'x' }).find('[data-tool-notice]').attributes('data-tool-notice')).toBe('loading');
    expect(mountNotice({ kind: 'missing', message: 'x' }).find('[data-tool-notice]').attributes('data-tool-notice')).toBe('missing');
  });

  it('offers a way out of a missing subject', () => {
    const w = mountNotice({ kind: 'missing', message: 'That fixture is gone.' });
    expect(w.find('[data-tool-notice-back]').text()).toBe('Back to the schedule');
  });

  it('does not offer a way out while still loading', () => {
    // Nothing has gone wrong yet; a way out would read as one.
    const w = mountNotice({ kind: 'loading', message: 'Loading…' });
    expect(w.find('[data-tool-notice-back]').exists()).toBe(false);
  });

  it('lets the way out be named for where it goes', () => {
    const w = mountNotice({ kind: 'missing', message: 'x', backLabel: 'Back to the ratings' });
    expect(w.find('[data-tool-notice-back]').text()).toBe('Back to the ratings');
  });
});
