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
});
