/**
 * Which nav items a visitor sees.
 *
 * The legacy app hides three of the seven from a guest by setting
 * style.display on each <li>, which leaves them in the document. Here the
 * list is filtered, so an item a visitor may not reach is not rendered at all.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import AppNav from './AppNav.vue';

const PUBLIC = ['Home', 'Roster & Bios', 'Schedule & Results', 'Help'];
const GUARDED = ['Player Ratings', 'Coach Planner', 'Coaching Staff'];

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

const labels = (w: any) =>
  w.findAll('[data-nav-item]').map((n: any) => n.text().replace(/^[^\w]+\s*/, ''));

describe('AppNav', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('shows all seven items to a coach', () => {
    const w = mountAs({ isCoach: true, canAccessRatings: true, isGuest: false });
    for (const label of [...PUBLIC, ...GUARDED]) {
      expect(labels(w), label).toContain(label);
    }
  });

  it('shows a guest only the four public items', () => {
    const w = mountAs({});
    expect(labels(w)).toEqual(expect.arrayContaining(PUBLIC));
    for (const label of GUARDED) {
      expect(labels(w), label).not.toContain(label);
    }
  });

  it('shows a player the ratings but not the planner', () => {
    const w = mountAs({ canAccessRatings: true, isGuest: false });
    expect(labels(w)).toContain('Player Ratings');
    expect(labels(w)).not.toContain('Coach Planner');
  });

  it('shows an admin the staff list without their being a coach', () => {
    const w = mountAs({ isAdmin: true, canAccessRatings: true, isGuest: false });
    expect(labels(w)).toContain('Coaching Staff');
    // The planner is isCoach() alone, matching the legacy rule.
    expect(labels(w)).not.toContain('Coach Planner');
  });

  it('keeps the seven in their established order', () => {
    const w = mountAs({ isCoach: true, isAdmin: true, canAccessRatings: true, isGuest: false });
    expect(labels(w)).toEqual([
      'Home', 'Roster & Bios', 'Schedule & Results',
      'Player Ratings', 'Coach Planner', 'Coaching Staff', 'Help'
    ]);
  });

  it('opens the drawer and closes it again', async () => {
    const w = mountAs({});
    expect(w.find('[data-nav-drawer]').classes()).not.toContain('is-open');

    await w.find('[data-nav-toggle]').trigger('click');
    expect(w.find('[data-nav-drawer]').classes()).toContain('is-open');

    await w.find('[data-nav-toggle]').trigger('click');
    expect(w.find('[data-nav-drawer]').classes()).not.toContain('is-open');
  });

  it('closes the drawer when an item is chosen', async () => {
    // A drawer left open over the page it just navigated to reads as a bug.
    const w = mountAs({});
    await w.find('[data-nav-toggle]').trigger('click');
    await w.findAll('[data-nav-item]')[1].trigger('click');
    expect(w.find('[data-nav-drawer]').classes()).not.toContain('is-open');
  });

  it('says whether the drawer is open, for a screen reader', () => {
    const w = mountAs({});
    expect(w.find('[data-nav-toggle]').attributes('aria-expanded')).toBe('false');
  });
});
