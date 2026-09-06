/**
 * Signing in, registering, and verifying.
 *
 * The Vue app had no way in at all before this: every guarded route was
 * unreachable and no coach-facing screen could be exercised rather than
 * assumed.
 *
 * Two behaviours here are not cosmetic. Feedback is inline rather than an
 * alert(), which blocks the page and cannot be styled or asserted. And the
 * email suggestion is an OFFER -- keeping what was typed stays an equally
 * reachable path, because an unfamiliar domain is ordinary for a club coach.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import AuthModal from './AuthModal.vue';
import { useAuthStore } from '../../stores/auth';

function mountAuth() {
  const wrapper = mount(AuthModal, {
    props: { open: true },
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: true })]
    },
    attachTo: document.body
  });
  return { wrapper, store: useAuthStore() };
}

const setValue = async (w: any, sel: string, value: string) => {
  const el = w.find(sel);
  await el.setValue(value);
};

describe('the tabs', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('opens on sign in', () => {
    const { wrapper } = mountAuth();
    expect(wrapper.find('[data-tab-panel="signin"]').exists()).toBe(true);
    expect(wrapper.find('[data-tab-panel="register"]').exists()).toBe(false);
  });

  it('switches to register and back', async () => {
    const { wrapper } = mountAuth();
    await wrapper.find('[data-tab="register"]').trigger('click');
    expect(wrapper.find('[data-tab-panel="register"]').exists()).toBe(true);

    await wrapper.find('[data-tab="signin"]').trigger('click');
    expect(wrapper.find('[data-tab-panel="signin"]').exists()).toBe(true);
  });

  it('offers the three roles registration allows', async () => {
    const { wrapper } = mountAuth();
    await wrapper.find('[data-tab="register"]').trigger('click');
    const values = wrapper.findAll('[data-role-option]').map(o => (o.element as HTMLOptionElement).value);
    expect(values).toEqual(['coach', 'player', 'guest']);
  });
});

describe('signing in', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('closes on success', async () => {
    const { wrapper, store } = mountAuth();
    (store.login as any).mockResolvedValue({ success: true, user: { name: 'Bob' } });

    await setValue(wrapper, '[data-field="email"]', 'coach@club.test');
    await setValue(wrapper, '[data-field="password"]', 'secret');
    await wrapper.find('[data-signin-submit]').trigger('submit');
    await new Promise(r => setTimeout(r, 0));

    expect(store.login).toHaveBeenCalledWith('coach@club.test', 'secret');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('shows a failure inline and stays open', async () => {
    const { wrapper, store } = mountAuth();
    (store.login as any).mockResolvedValue({ success: false, message: 'Wrong password.' });

    await setValue(wrapper, '[data-field="email"]', 'coach@club.test');
    await setValue(wrapper, '[data-field="password"]', 'nope');
    await wrapper.find('[data-signin-submit]').trigger('submit');
    await new Promise(r => setTimeout(r, 0));

    expect(wrapper.find('[data-feedback]').text()).toContain('Wrong password.');
    expect(wrapper.emitted('close')).toBeFalsy();
  });

  it('opens the verify tab when the account is unverified', async () => {
    const { wrapper, store } = mountAuth();
    (store.login as any).mockResolvedValue({
      success: false, isPendingVerification: true, user: { email: 'coach@club.test' }
    });

    await setValue(wrapper, '[data-field="email"]', 'coach@club.test');
    await setValue(wrapper, '[data-field="password"]', 'secret');
    await wrapper.find('[data-signin-submit]').trigger('submit');
    await new Promise(r => setTimeout(r, 0));

    expect(wrapper.find('[data-tab-panel="verify"]').exists()).toBe(true);
    expect(wrapper.find('[data-verify-target]').text()).toContain('coach@club.test');
  });

  it('never uses a blocking alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const { wrapper, store } = mountAuth();
    (store.login as any).mockResolvedValue({ success: true, user: { name: 'Bob' } });

    await setValue(wrapper, '[data-field="email"]', 'a@b.test');
    await setValue(wrapper, '[data-field="password"]', 'x');
    await wrapper.find('[data-signin-submit]').trigger('submit');
    await new Promise(r => setTimeout(r, 0));

    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe('registering', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  async function fillRegister(w: any, email = 'coach@club.test') {
    await w.find('[data-tab="register"]').trigger('click');
    await setValue(w, '[data-field="regName"]', 'A Coach');
    await setValue(w, '[data-field="regEmail"]', email);
    await setValue(w, '[data-field="regPassword"]', 'secret123');
  }

  it('registers and opens the verify tab', async () => {
    const { wrapper, store } = mountAuth();
    (store.inspectEmail as any).mockReturnValue({ valid: true, suggestion: null, reason: null });
    (store.register as any).mockResolvedValue({ success: true, requiresVerification: true });

    await fillRegister(wrapper);
    await wrapper.find('[data-register-submit]').trigger('submit');
    await new Promise(r => setTimeout(r, 0));

    expect(store.register).toHaveBeenCalled();
    expect(wrapper.find('[data-tab-panel="verify"]').exists()).toBe(true);
  });

  it('refuses an address that cannot be one, without calling register', async () => {
    const { wrapper, store } = mountAuth();
    (store.inspectEmail as any).mockReturnValue({
      valid: false, suggestion: null, reason: 'That does not look like an email address.'
    });

    await fillRegister(wrapper, 'nonsense');
    await wrapper.find('[data-register-submit]').trigger('submit');
    await new Promise(r => setTimeout(r, 0));

    expect(store.register).not.toHaveBeenCalled();
    expect(wrapper.find('[data-feedback]').text()).toContain('does not look like');
  });

  it('offers a correction with both answers equally available', async () => {
    const { wrapper, store } = mountAuth();
    (store.inspectEmail as any).mockReturnValue({
      valid: true, suggestion: 'coach@gmail.com', reason: 'Did you mean gmail.com?'
    });

    await fillRegister(wrapper, 'coach@gmial.com');
    await wrapper.find('[data-register-submit]').trigger('submit');
    await new Promise(r => setTimeout(r, 0));

    // Offered, not enforced: nothing was sent yet, and both paths are present.
    expect(store.register).not.toHaveBeenCalled();
    expect(wrapper.find('[data-use-suggestion]').exists()).toBe(true);
    expect(wrapper.find('[data-keep-typed]').exists()).toBe(true);
  });

  it('registers with the typed address when that is chosen', async () => {
    const { wrapper, store } = mountAuth();
    (store.inspectEmail as any).mockReturnValue({
      valid: true, suggestion: 'coach@gmail.com', reason: 'Did you mean gmail.com?'
    });
    (store.register as any).mockResolvedValue({ success: true, requiresVerification: true });

    await fillRegister(wrapper, 'coach@gmial.com');
    await wrapper.find('[data-register-submit]').trigger('submit');
    await new Promise(r => setTimeout(r, 0));

    await wrapper.find('[data-keep-typed]').trigger('click');
    await new Promise(r => setTimeout(r, 0));

    expect(store.register).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'coach@gmial.com' }));
  });

  it('registers with the correction when that is chosen', async () => {
    const { wrapper, store } = mountAuth();
    (store.inspectEmail as any).mockReturnValue({
      valid: true, suggestion: 'coach@gmail.com', reason: 'Did you mean gmail.com?'
    });
    (store.register as any).mockResolvedValue({ success: true, requiresVerification: true });

    await fillRegister(wrapper, 'coach@gmial.com');
    await wrapper.find('[data-register-submit]').trigger('submit');
    await new Promise(r => setTimeout(r, 0));

    await wrapper.find('[data-use-suggestion]').trigger('click');
    await new Promise(r => setTimeout(r, 0));

    expect(store.register).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'coach@gmail.com' }));
  });

  it('shows a registration failure inline', async () => {
    const { wrapper, store } = mountAuth();
    (store.inspectEmail as any).mockReturnValue({ valid: true, suggestion: null, reason: null });
    (store.register as any).mockResolvedValue({ success: false, message: 'Already registered.' });

    await fillRegister(wrapper);
    await wrapper.find('[data-register-submit]').trigger('submit');
    await new Promise(r => setTimeout(r, 0));

    expect(wrapper.find('[data-feedback]').text()).toContain('Already registered.');
  });
});

describe('verifying', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('closes once the code is accepted', async () => {
    const { wrapper, store } = mountAuth();
    (store.login as any).mockResolvedValue({
      success: false, isPendingVerification: true, user: { email: 'c@club.test' }
    });
    await setValue(wrapper, '[data-field="email"]', 'c@club.test');
    await setValue(wrapper, '[data-field="password"]', 'x');
    await wrapper.find('[data-signin-submit]').trigger('submit');
    await new Promise(r => setTimeout(r, 0));

    (store.verifyOtp as any).mockResolvedValue({ success: true, user: { name: 'C' } });
    await setValue(wrapper, '[data-field="otp"]', '123456');
    await wrapper.find('[data-verify-submit]').trigger('submit');
    await new Promise(r => setTimeout(r, 0));

    expect(store.verifyOtp).toHaveBeenCalledWith('c@club.test', '123456');
    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
