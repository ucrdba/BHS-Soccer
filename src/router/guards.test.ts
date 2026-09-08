/**
 * Which routes a visitor may reach.
 *
 * These mirror what updateAuthUI() enforces in the legacy app. They are UI
 * affordances only -- the real enforcement is the RLS policies in
 * supabase_migration_auth.sql, and a new privileged operation needs a policy
 * there, not a guard here.
 *
 * The rules live in a plain function rather than inside a navigation guard so
 * they can be tested without mounting a router.
 */
import { describe, it, expect } from 'vitest';
import { routeAllowed, NAV_ITEMS } from './index';

const guest = { isCoach: () => false, isAdmin: () => false, canAccessRatings: () => false };
const player = { isCoach: () => false, isAdmin: () => false, canAccessRatings: () => true };
const coach = { isCoach: () => true, isAdmin: () => false, canAccessRatings: () => true };
const admin = { isCoach: () => false, isAdmin: () => true, canAccessRatings: () => true };

describe('routeAllowed', () => {
  it('lets anyone reach the public routes', () => {
    for (const name of ['home', 'roster', 'schedule', 'help']) {
      expect(routeAllowed(name, guest), name).toBe(true);
    }
  });

  it('keeps a guest out of ratings, the planner and the staff list', () => {
    expect(routeAllowed('matrix', guest)).toBe(false);
    expect(routeAllowed('planner', guest)).toBe(false);
    expect(routeAllowed('coaches', guest)).toBe(false);
  });

  it('lets a player see ratings but not the planner', () => {
    expect(routeAllowed('matrix', player)).toBe(true);
    expect(routeAllowed('planner', player)).toBe(false);
  });

  it('lets a coach everywhere', () => {
    for (const name of ['matrix', 'planner', 'coaches']) {
      expect(routeAllowed(name, coach), name).toBe(true);
    }
  });

  it('lets an admin reach the staff list without being a coach', () => {
    expect(routeAllowed('coaches', admin)).toBe(true);
  });

  it('does not give an admin the planner unless they are also a coach', () => {
    // Matches the legacy rule: the planner is isCoach() alone.
    expect(routeAllowed('planner', admin)).toBe(false);
  });

  it('allows an unknown route rather than locking the app', () => {
    expect(routeAllowed('nonsense', guest)).toBe(true);
    expect(routeAllowed('', guest)).toBe(true);
  });

  it('keeps the touchline tools to coaches and admins', () => {
    for (const name of ['lineup', 'live', 'season-report']) {
      expect(routeAllowed(name, coach), name).toBe(true);
      expect(routeAllowed(name, admin), name).toBe(true);
      expect(routeAllowed(name, player), name).toBe(false);
      expect(routeAllowed(name, guest), name).toBe(false);
    }
  });

  it('keeps session entry to coaches and admins', () => {
    // A player may read the ratings; recording a session is a coach's.
    expect(routeAllowed('session-entry', coach)).toBe(true);
    expect(routeAllowed('session-entry', admin)).toBe(true);
    expect(routeAllowed('session-entry', player)).toBe(false);
    expect(routeAllowed('session-entry', guest)).toBe(false);
  });
});

describe('NAV_ITEMS', () => {
  it('lists the seven menu items in their established order', () => {
    expect(NAV_ITEMS.map(i => i.label)).toEqual([
      'Home',
      'Roster & Bios',
      'Schedule & Results',
      'Player Ratings',
      'Coach Planner',
      'Coaching Staff',
      'Help'
    ]);
  });

  it('names a route for every item', () => {
    for (const item of NAV_ITEMS) {
      expect(item.name, item.label).toBeTruthy();
      expect(item.path, item.label).toMatch(/^\//);
    }
  });

  it('filters to the four public items for a guest', () => {
    const visible = NAV_ITEMS.filter(i => routeAllowed(i.name, guest)).map(i => i.label);
    expect(visible).toEqual([
      'Home', 'Roster & Bios', 'Schedule & Results', 'Help'
    ]);
  });

  it('filters to everything for a coach', () => {
    expect(NAV_ITEMS.filter(i => routeAllowed(i.name, coach))).toHaveLength(7);
  });
});

describe('the admin route', () => {
  // Deliberately coach-or-admin rather than gated on
  // can_access_admin_dashboard. schema_roles.sql grants that permission to
  // admin alone, but the legacy panel shows the categories, the unassigned
  // players and the quiz bank to any coach -- so gating the route on it would
  // take away access a coach has today. The admin-only SECTIONS carry their
  // own gate instead.
  it('is refused to a guest', () => {
    expect(routeAllowed('admin', guest)).toBe(false);
  });

  it('is refused to a player', () => {
    expect(routeAllowed('admin', player)).toBe(false);
  });

  it('is allowed to a coach', () => {
    expect(routeAllowed('admin', coach)).toBe(true);
  });

  it('is allowed to an admin', () => {
    expect(routeAllowed('admin', admin)).toBe(true);
  });

  it('is NOT in the nav, being reached on purpose', () => {
    // A menu item most visitors cannot open is noise.
    expect(NAV_ITEMS.map(i => i.name)).not.toContain('admin');
  });
});
