/**
 * The shell.
 *
 * On an ordinary route the header, nav and footer wrap the view. On a route
 * marked `chrome: 'tool'` — the touchline and session screens — they are
 * gone, because those screens draw their own top and bottom bars and a
 * second header over a match clock is in the way.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { createRouter, createMemoryHistory } from 'vue-router';
import App from './App.vue';
import { useOrganizationStore } from './stores/organization';
import { useAuthStore } from './stores/auth';

const Page = { template: '<p data-page>page</p>' };
const Tool = { template: '<p data-page>tool</p>' };

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Page, meta: { ground: 'paper' } },
      { path: '/tool', component: Tool, meta: { ground: 'pitch', chrome: 'tool' } }
    ]
  });
  await router.push(path);
  await router.isReady();

  const w = mount(App, {
    global: {
      plugins: [router, createTestingPinia({ createSpy: vi.fn })],
      stubs: {
        AppHeader: { template: '<header data-stub-header />' },
        AppNav: { template: '<nav data-stub-nav />' },
        AppFooter: { template: '<footer data-stub-footer />' }
      }
    }
  });
  await flushPromises();
  return w;
}

describe('App', () => {
  it('wraps an ordinary route in the header, nav and footer', async () => {
    const w = await mountAt('/');
    expect(w.find('[data-stub-header]').exists()).toBe(true);
    expect(w.find('[data-stub-nav]').exists()).toBe(true);
    expect(w.find('[data-stub-footer]').exists()).toBe(true);
    expect(w.find('[data-page]').text()).toBe('page');
    expect(w.find('main').classes()).not.toContain('shell__main--tool');
  });

  it('drops all three on a tool route', async () => {
    const w = await mountAt('/tool');
    expect(w.find('[data-stub-header]').exists()).toBe(false);
    expect(w.find('[data-stub-nav]').exists()).toBe(false);
    expect(w.find('[data-stub-footer]').exists()).toBe(false);
    expect(w.find('[data-page]').text()).toBe('tool');
    expect(w.find('main').classes()).toContain('shell__main--tool');
  });

  it('loads the organization once, at the shell', async () => {
    await mountAt('/');
    const org = useOrganizationStore();
    expect(org.load).toHaveBeenCalledTimes(1);
  });

  it('reloads the teams when someone signs in or out, so the switcher is theirs', async () => {
    // The list is whose-teams-are-these, and it was read once as the page
    // opened. Signing in without a reload left a coach -- or an admin -- with
    // the signed-out list: the public default team and nothing else.
    await mountAt('/');
    const org = useOrganizationStore();
    const auth = useAuthStore();

    auth.user = { id: 'u1', role: 'admin' };
    await flushPromises();
    expect(org.load).toHaveBeenCalledTimes(2);

    auth.user = { id: 'user_guest', role: 'guest' };
    await flushPromises();
    expect(org.load).toHaveBeenCalledTimes(3);
  });

  it('does not reload for a fresh read of the same account', async () => {
    // AuthManager re-reads the profile (after connecting an invitation, say),
    // which is a new object for the same person.
    await mountAt('/');
    const org = useOrganizationStore();
    const auth = useAuthStore();

    auth.user = { id: 'u1', role: 'coach' };
    await flushPromises();
    auth.user = { id: 'u1', role: 'coach', name: 'Reloaded' };
    await flushPromises();
    expect(org.load).toHaveBeenCalledTimes(2);
  });
});
