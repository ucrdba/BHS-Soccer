/**
 * The demo warning. Mounted on every route by App.vue; renders nothing unless
 * demo mode is on, which production never sets.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('../../demo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../demo')>();
  return { ...actual, demoConfig: vi.fn() };
});

import { demoConfig } from '../../demo';
import DemoNotice from './DemoNotice.vue';

const setDemo = (enabled: boolean) =>
  vi.mocked(demoConfig).mockReturnValue({ enabled, password: enabled ? 'pw' : '' });

describe('the demo warning', () => {
  it('says nothing on production', () => {
    setDemo(false);
    expect(mount(DemoNotice).find('[data-demo-notice]').exists()).toBe(false);
  });

  it('says the data is made up and restored every night', () => {
    setDemo(true);
    const text = mount(DemoNotice).find('[data-demo-notice]').text();
    expect(text).toContain('made up');
    expect(text).toContain('restored every night');
  });

  // A visitor who hides it can spend an hour believing the roster is real.
  it('offers no way to dismiss it', () => {
    setDemo(true);
    expect(mount(DemoNotice).find('button').exists()).toBe(false);
  });
});
