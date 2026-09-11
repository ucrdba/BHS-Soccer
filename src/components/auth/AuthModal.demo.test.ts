/**
 * The sign-in modal on the demo deployment: nine accounts to pick from,
 * nothing to type. The ordinary modal is covered by AuthModal.test.ts, which
 * leaves demo mode off.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';

vi.mock('../../demo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../demo')>();
  return { ...actual, demoConfig: vi.fn() };
});

import { demoConfig } from '../../demo';
import AuthModal from './AuthModal.vue';
import { useAuthStore } from '../../stores/auth';

function mountDemo() {
  vi.mocked(demoConfig).mockReturnValue({ enabled: true, password: 'demo-pass' });
  const wrapper = mount(AuthModal, {
    props: { open: true },
    global: { plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: true })] },
    attachTo: document.body
  });
  return { wrapper, store: useAuthStore() };
}

const flush = () => new Promise(r => setTimeout(r, 0));

describe('the demo account picker', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('offers the nine accounts by role, in order', () => {
    const { wrapper } = mountDemo();
    const labels = wrapper.findAll('[data-demo-account]').map(b => b.find('.demo-account__label').text());
    expect(labels).toEqual(
      ['Coach 1', 'Coach 2', 'Coach 3', 'Coach 4', 'Coach 5', 'Coach 6', 'Coach 7', 'Player', 'Admin']);
  });

  it("signs in as the account picked, with the build's shared password", async () => {
    const { wrapper, store } = mountDemo();
    (store.login as any).mockResolvedValue({ success: true });

    await wrapper.find('[data-demo-account="3"]').trigger('click');
    await flush();

    expect(store.login).toHaveBeenCalledWith('demo3@demo.invalid', 'demo-pass');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('shows a failure inline and stays open', async () => {
    const { wrapper, store } = mountDemo();
    (store.login as any).mockResolvedValue({ success: false, message: 'Invalid login credentials' });

    await wrapper.find('[data-demo-account="8"]').trigger('click');
    await flush();

    expect(wrapper.find('[data-feedback]').text()).toContain('Invalid login credentials');
    expect(wrapper.emitted('close')).toBeFalsy();
  });

  it('hides registration and the email form', () => {
    const { wrapper } = mountDemo();
    expect(wrapper.find('[data-tab="register"]').exists()).toBe(false);
    expect(wrapper.find('[data-field="email"]').exists()).toBe(false);
  });
});
