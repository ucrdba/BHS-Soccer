/**
 * Which nav items a visitor sees, and where.
 *
 * The list is filtered by the same rule the router guards on, so an item a
 * visitor may not reach is not rendered at all. On a phone the bar holds
 * five: a guest's four public items fit, a coach's seven become four plus a
 * More sheet holding the rest and the admin screen.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import AppNav from './AppNav.vue';

const PUBLIC = ['Home', 'Roster', 'Schedule', 'Help'];
const ALL = ['Home', 'Roster', 'Schedule', 'Ratings', 'Planner', 'Staff', 'Help'];

/** Mount with the auth store seeded to a role. */
function mountAs(state: Record<string, boolean>) {
  return mount(AppNav, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: false,
        initialState: {
          auth: {
            isCoach: false, isAdmin: false, canAccessRatings: false,
            isGuest: true, isLoggedIn: false, role: 'guest', user: null,
            ...state
          }
        }
      })],
      stubs: {
        RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' }
      }
    }
  });
}

const barLabels = (w: any) => w.findAll('[data-nav-item]').map((n: any) => n.text());
const sheetLabels = (w: any) => w.findAll('[data-nav-sheet-item]').map((n: any) => n.text());

describe('AppNav', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('shows all seven items to a coach, in their established order', () => {
    const w = mountAs({ isCoach: true, canAccessRatings: true, isGuest: false });
    expect(barLabels(w)).toEqual(ALL);
  });

  it('shows a guest only the four public items', () => {
    const w = mountAs({});
    expect(barLabels(w)).toEqual(PUBLIC);
  });

  it('shows a player the ratings but not the planner', () => {
    const w = mountAs({ canAccessRatings: true, isGuest: false });
    expect(barLabels(w)).toContain('Ratings');
    expect(barLabels(w)).not.toContain('Planner');
  });

  it('shows an admin the staff list without their being a coach', () => {
    const w = mountAs({ isAdmin: true, canAccessRatings: true, isGuest: false });
    expect(barLabels(w)).toContain('Staff');
    // The planner is isCoach() alone, matching the legacy rule.
    expect(barLabels(w)).not.toContain('Planner');
  });

  it('gives a guest no More tab — four items fit the bar', () => {
    const w = mountAs({});
    expect(w.find('[data-nav-toggle]').exists()).toBe(false);
    expect(w.find('[data-nav-drawer]').exists()).toBe(false);
  });

  it('puts a coach\'s overflow behind More, with the admin screen', () => {
    const w = mountAs({ isCoach: true, canAccessRatings: true, isGuest: false });
    expect(w.find('[data-nav-toggle]').exists()).toBe(true);
    expect(sheetLabels(w)).toEqual(['Planner', 'Staff', 'Help', 'Admin']);
    // The bar marks which of its items are behind More on a phone.
    const overflowed = w.findAll('[data-nav-item][data-nav-overflow]').map((n: any) => n.text());
    expect(overflowed).toEqual(['Planner', 'Staff', 'Help']);
  });

  it('offers Admin in the sheet to an admin who is not a coach', () => {
    const w = mountAs({ isAdmin: true, canAccessRatings: true, isGuest: false });
    expect(w.find('[data-nav-admin]').exists()).toBe(true);
  });

  it('opens the sheet and closes it again', async () => {
    const w = mountAs({ isCoach: true, canAccessRatings: true, isGuest: false });
    expect(w.find('[data-nav-drawer]').classes()).not.toContain('is-open');
    expect(w.find('[data-nav-toggle]').attributes('aria-expanded')).toBe('false');

    await w.find('[data-nav-toggle]').trigger('click');
    expect(w.find('[data-nav-drawer]').classes()).toContain('is-open');
    expect(w.find('[data-nav-toggle]').attributes('aria-expanded')).toBe('true');

    await w.find('[data-nav-toggle]').trigger('click');
    expect(w.find('[data-nav-drawer]').classes()).not.toContain('is-open');
  });

  it('closes the sheet when an item is chosen', async () => {
    // A sheet left open over the page it just navigated to reads as a bug.
    const w = mountAs({ isCoach: true, canAccessRatings: true, isGuest: false });
    await w.find('[data-nav-toggle]').trigger('click');
    await w.findAll('[data-nav-sheet-item]')[0].trigger('click');
    expect(w.find('[data-nav-drawer]').classes()).not.toContain('is-open');
  });

  it('closes the sheet on the backdrop', async () => {
    const w = mountAs({ isCoach: true, canAccessRatings: true, isGuest: false });
    await w.find('[data-nav-toggle]').trigger('click');
    await w.find('[data-nav-backdrop]').trigger('click');
    expect(w.find('[data-nav-drawer]').classes()).not.toContain('is-open');
  });

  it('keeps the full name on each link for assistive tech', () => {
    const w = mountAs({});
    const roster = w.findAll('[data-nav-item]')[1];
    expect(roster.attributes('title')).toBe('Roster & Bios');
  });

  it('closes the sheet on Escape', async () => {
    const w = mountAs({ isCoach: true, canAccessRatings: true, isGuest: false });
    await w.find('[data-nav-toggle]').trigger('click');
    expect(w.find('[data-nav-drawer]').classes()).toContain('is-open');
    await w.find('[data-nav-drawer]').trigger('keydown', { key: 'Escape' });
    expect(w.find('[data-nav-drawer]').classes()).not.toContain('is-open');
  });

  it('moves focus into the sheet on open and back to the toggle on close', async () => {
    // Mounted with attachTo so document.activeElement follows .focus().
    const live = mount(AppNav, {
      attachTo: document.body,
      global: {
        plugins: [createTestingPinia({
          createSpy: vi.fn, stubActions: false,
          initialState: { auth: { isCoach: true, isAdmin: false, canAccessRatings: true, isGuest: false, isLoggedIn: true, role: 'coach', user: null } }
        })],
        stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } }
      }
    });

    await live.find('[data-nav-toggle]').trigger('click');
    await live.vm.$nextTick();
    expect(document.activeElement).toBe(live.find('[data-nav-sheet-item]').element);

    await live.find('[data-nav-drawer]').trigger('keydown', { key: 'Escape' });
    await live.vm.$nextTick();
    expect(document.activeElement).toBe(live.find('[data-nav-toggle]').element);
    live.unmount();
  });
});
