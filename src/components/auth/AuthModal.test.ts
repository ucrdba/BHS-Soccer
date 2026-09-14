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

const fetchJoinableTeams = vi.fn();
vi.mock('../../data/supabase', () => ({
  supabaseService: { fetchJoinableTeams: (...a: any[]) => fetchJoinableTeams(...a) }
}));
const TEAMS = [
  { id: 't1', name: 'U14', season: null, schoolName: 'Hawks FC' },
  { id: 't2', name: 'Varsity', season: '2026', schoolName: 'Riverside High' }
];
const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(r => setTimeout(r, 0)); };

function mountAuth(props: Record<string, any> = {}) {
  const wrapper = mount(AuthModal, {
    props: { open: true, ...props },
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
  beforeEach(() => {
    document.body.innerHTML = '';
    fetchJoinableTeams.mockResolvedValue([]);
  });

  async function fillRegister(w: any, email = 'coach@club.test') {
    await w.find('[data-tab="register"]').trigger('click');
    await setValue(w, '[data-field="regName"]', 'A Coach');
    await setValue(w, '[data-field="regEmail"]', email);
    await setValue(w, '[data-field="regPassword"]', 'secret123');
  }

  it('refuses an address that cannot be one, without calling register', async () => {
    const { wrapper, store } = mountAuth();

    await fillRegister(wrapper, 'nonsense');
    await setValue(wrapper, '[data-field="regRole"]', 'guest');
    await wrapper.find('[data-register-submit]').trigger('submit');
    await new Promise(r => setTimeout(r, 0));

    expect(store.register).not.toHaveBeenCalled();
    expect(wrapper.find('[data-feedback]').text()).toContain('does not look like');
  });

  it('offers a correction with both answers equally available', async () => {
    const { wrapper, store } = mountAuth();

    await fillRegister(wrapper, 'coach@gmial.com');
    await setValue(wrapper, '[data-field="regRole"]', 'guest');
    await wrapper.find('[data-register-submit]').trigger('submit');
    await new Promise(r => setTimeout(r, 0));

    // Offered, not enforced: nothing was sent yet, and both paths are present.
    expect(store.register).not.toHaveBeenCalled();
    expect(wrapper.find('[data-use-suggestion]').exists()).toBe(true);
    expect(wrapper.find('[data-keep-typed]').exists()).toBe(true);
  });

  it('registers with the typed address when that is chosen', async () => {
    const { wrapper, store } = mountAuth();
    (store.register as any).mockResolvedValue({ success: true, requiresVerification: true });

    await fillRegister(wrapper, 'coach@gmial.com');
    await setValue(wrapper, '[data-field="regRole"]', 'guest');
    await wrapper.find('[data-register-submit]').trigger('submit');
    await new Promise(r => setTimeout(r, 0));

    await wrapper.find('[data-keep-typed]').trigger('click');
    await new Promise(r => setTimeout(r, 0));

    expect(store.register).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'coach@gmial.com' }));
  });

  it('registers with the correction when that is chosen', async () => {
    const { wrapper, store } = mountAuth();
    (store.register as any).mockResolvedValue({ success: true, requiresVerification: true });

    await fillRegister(wrapper, 'coach@gmial.com');
    await setValue(wrapper, '[data-field="regRole"]', 'guest');
    await wrapper.find('[data-register-submit]').trigger('submit');
    await new Promise(r => setTimeout(r, 0));

    await wrapper.find('[data-use-suggestion]').trigger('click');
    await new Promise(r => setTimeout(r, 0));

    expect(store.register).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'coach@gmail.com' }));
  });

  it('shows a registration failure inline', async () => {
    const { wrapper, store } = mountAuth();
    (store.register as any).mockResolvedValue({ success: false, message: 'Already registered.' });

    await fillRegister(wrapper);
    await setValue(wrapper, '[data-field="regRole"]', 'guest');
    await wrapper.find('[data-register-submit]').trigger('submit');
    await new Promise(r => setTimeout(r, 0));

    expect(wrapper.find('[data-feedback]').text()).toContain('Already registered.');
  });
});

describe('registering', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    fetchJoinableTeams.mockResolvedValue(TEAMS);
  });

  async function openRegister(props: Record<string, any> = {}) {
    const m = mountAuth(props);
    await m.wrapper.find('[data-tab="register"]').trigger('click');
    await flush();
    return m;
  }

  it('lists teams grouped by organization', async () => {
    const { wrapper } = await openRegister();
    expect(wrapper.findAll('[data-field="regTeam"] optgroup').map(g => g.attributes('label')))
      .toEqual(['Hawks FC', 'Riverside High']);
  });

  it('asks which team a player or coach is joining', async () => {
    const { wrapper, store } = await openRegister();
    await setValue(wrapper, '[data-field="regName"]', 'Ana Ruiz');
    await setValue(wrapper, '[data-field="regEmail"]', 'ana@example.com');
    await setValue(wrapper, '[data-field="regPassword"]', 'secret123');
    await setValue(wrapper, '[data-field="regRole"]', 'player');
    await wrapper.find('[data-register-submit]').trigger('submit');
    expect(store.register).not.toHaveBeenCalled();
    expect(wrapper.find('[data-feedback]').text()).toMatch(/Choose the team/);
  });

  it('does not ask a fan for a team', async () => {
    const { wrapper } = await openRegister();
    await setValue(wrapper, '[data-field="regRole"]', 'guest');
    expect(wrapper.find('[data-field="regTeam"]').exists()).toBe(false);
  });

  it('sends the team with the registration, and then says to check for a link', async () => {
    const { wrapper, store } = await openRegister();
    (store.register as any).mockResolvedValue({ success: true, requiresVerification: true });
    await setValue(wrapper, '[data-field="regName"]', 'Ana Ruiz');
    await setValue(wrapper, '[data-field="regEmail"]', 'ana@example.com');
    await setValue(wrapper, '[data-field="regPassword"]', 'secret123');
    await setValue(wrapper, '[data-field="regRole"]', 'player');
    await setValue(wrapper, '[data-field="regTeam"]', 't1');
    await wrapper.find('[data-register-submit]').trigger('submit');
    await flush();

    expect(store.register).toHaveBeenCalledWith({
      name: 'Ana Ruiz', email: 'ana@example.com', password: 'secret123', role: 'player', teamId: 't1'
    });
    expect(wrapper.find('[data-tab-panel="sent"]').text()).toContain('ana@example.com');
    expect(wrapper.text()).not.toMatch(/6-digit|code/i);
  });

  it('opens on registration with the invited address filled in', async () => {
    const { wrapper } = mountAuth({ open: false, initialTab: 'register', initialEmail: 'kid@example.com' });
    await wrapper.setProps({ open: true });
    await flush();
    expect(wrapper.find('[data-tab-panel="register"]').exists()).toBe(true);
    expect((wrapper.find('[data-field="regEmail"]').element as HTMLInputElement).value).toBe('kid@example.com');
  });

  it('assumes an invited address is a player joining a team', async () => {
    // Most invitations are a coach's, for a roster entry; the form still lets them change it.
    const { wrapper } = mountAuth({ open: false, initialTab: 'register', initialEmail: 'kid@example.com' });
    await wrapper.setProps({ open: true });
    await flush();
    expect((wrapper.find('[data-field="regRole"]').element as HTMLSelectElement).value).toBe('player');
  });

  it('keeps the usual default when registration opens without an address', async () => {
    const { wrapper } = mountAuth({ open: false, initialTab: 'register' });
    await wrapper.setProps({ open: true });
    await flush();
    expect((wrapper.find('[data-field="regRole"]').element as HTMLSelectElement).value).toBe('coach');
  });

  it('says the team list could not be loaded, and tries again next time', async () => {
    fetchJoinableTeams.mockClear();
    fetchJoinableTeams.mockResolvedValueOnce(null).mockResolvedValueOnce(TEAMS);
    const { wrapper } = await openRegister();
    const alert = wrapper.find('[data-teams-error]');
    expect(alert.exists()).toBe(true);
    expect(alert.attributes('role')).toBe('alert');
    expect(alert.text()).toBe('The list of teams could not be loaded. Close this and try again.');

    // Nothing was cached: opening registration again reads the list again.
    await wrapper.find('[data-tab="signin"]').trigger('click');
    await wrapper.find('[data-tab="register"]').trigger('click');
    await flush();
    expect(fetchJoinableTeams).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-teams-error]').exists()).toBe(false);
    expect(wrapper.findAll('[data-field="regTeam"] optgroup')).toHaveLength(2);
  });
});

describe('a forgotten password', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('is reached from sign in', async () => {
    const { wrapper } = mountAuth();
    await wrapper.find('[data-forgot]').trigger('click');
    expect(wrapper.find('[data-tab-panel="reset"]').exists()).toBe(true);
  });

  it('sends the link and shows the same answer for any address', async () => {
    const { wrapper, store } = mountAuth();
    (store.requestPasswordReset as any).mockResolvedValue({
      success: true, message: 'If a@example.com has an account, a link to set a new password is on its way.'
    });
    await wrapper.find('[data-forgot]').trigger('click');
    await setValue(wrapper, '[data-field="resetEmail"]', 'a@example.com');
    await wrapper.find('[data-reset-submit]').trigger('submit');
    await flush();
    expect(store.requestPasswordReset).toHaveBeenCalledWith('a@example.com');
    expect(wrapper.find('[data-feedback]').text()).toMatch(/If a@example.com has an account/);
  });

  it('asks for the new password when a reset link was opened', async () => {
    const { wrapper, store } = mountAuth({ open: false });
    (store as any).recovering = true;
    await wrapper.setProps({ open: true });
    expect(wrapper.find('[data-tab-panel="newpassword"]').exists()).toBe(true);
  });

  it('asks a person who just confirmed their email to choose a password', async () => {
    const { wrapper, store } = mountAuth({ open: false });
    (store as any).recovering = true;
    (store as any).passwordPurpose = 'setup';
    await wrapper.setProps({ open: true });
    expect(wrapper.find('[data-tab-panel="newpassword"]').exists()).toBe(true);
    expect(wrapper.find('[data-newpassword-setup]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Choose your password');
    expect(wrapper.find('[data-newpassword-cancel]').text()).toBe('Later');
  });

  it('does not describe a reset as a first password', async () => {
    const { wrapper, store } = mountAuth({ open: false });
    (store as any).recovering = true;
    (store as any).passwordPurpose = 'reset';
    await wrapper.setProps({ open: true });
    expect(wrapper.find('[data-newpassword-setup]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Set a new password');
    expect(wrapper.find('[data-newpassword-cancel]').text()).toBe('Not now');
  });

  it('refuses two passwords that differ, before sending either', async () => {
    const { wrapper, store } = mountAuth({ open: false });
    (store as any).recovering = true;
    await wrapper.setProps({ open: true });
    await setValue(wrapper, '[data-field="newPassword"]', 'secret123');
    await setValue(wrapper, '[data-field="newPasswordAgain"]', 'secret124');
    await wrapper.find('[data-newpassword-submit]').trigger('submit');
    expect(store.completePasswordReset).not.toHaveBeenCalled();
    expect(wrapper.find('[data-feedback]').text()).toMatch(/do not match/);
  });

  it('sets the password and closes', async () => {
    const { wrapper, store } = mountAuth({ open: false });
    (store as any).recovering = true;
    (store.completePasswordReset as any).mockResolvedValue({ success: true, message: 'Password changed.' });
    await wrapper.setProps({ open: true });
    await setValue(wrapper, '[data-field="newPassword"]', 'secret123');
    await setValue(wrapper, '[data-field="newPasswordAgain"]', 'secret123');
    await wrapper.find('[data-newpassword-submit]').trigger('submit');
    await flush();
    expect(store.completePasswordReset).toHaveBeenCalledWith('secret123');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('offers a way out, back to sign in, without setting a password', async () => {
    const { wrapper, store } = mountAuth({ open: false });
    (store as any).recovering = true;
    await wrapper.setProps({ open: true });
    await wrapper.find('[data-newpassword-cancel]').trigger('click');
    expect(store.cancelPasswordRecovery).toHaveBeenCalled();
    expect(wrapper.find('[data-tab-panel="signin"]').exists()).toBe(true);
  });
});
