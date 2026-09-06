/**
 * Routing for the Vue app.
 *
 * The seven nav routes, in the order the menu reads. The strategy settled that
 * only these get URLs; the app's thirty-six modals stay as component state.
 */
import { createRouter, createWebHistory, type Router } from 'vue-router';
import { auth } from '../auth';
import HomeView from '../views/HomeView.vue';
import PlaceholderView from '../views/PlaceholderView.vue';
import RosterView from '../views/RosterView.vue';
import ScheduleView from '../views/ScheduleView.vue';
import CoachesView from '../views/CoachesView.vue';
import HelpView from '../views/HelpView.vue';

/** The subset of the auth manager the guards need, so they can be tested. */
export interface AuthLike {
  isCoach(): boolean;
  isAdmin(): boolean;
  canAccessRatings(): boolean;
}

export interface NavItem {
  name: string;
  path: string;
  label: string;
  icon: string;
}

/**
 * The menu, in its established order.
 *
 * Exported so the nav renders from the same list the router is built from --
 * in the legacy app the two were separate, and `index.html` carried a
 * hand-written `<li>` per view that nothing kept in step with the router.
 */
export const NAV_ITEMS: NavItem[] = [
  { name: 'home',     path: '/',          label: 'Home',               icon: '⚽' },
  { name: 'roster',   path: '/roster',    label: 'Roster & Bios',      icon: '👥' },
  { name: 'schedule', path: '/schedule',  label: 'Schedule & Results', icon: '📅' },
  { name: 'matrix',   path: '/matrix',    label: 'Player Ratings',     icon: '🏆' },
  { name: 'planner',  path: '/planner',   label: 'Coach Planner',      icon: '📋' },
  { name: 'coaches',  path: '/coaches',   label: 'Coaching Staff',     icon: '👔' },
  { name: 'help',     path: '/help',      label: 'Help',               icon: '📖' }
];

/**
 * May this visitor reach this route?
 *
 * UI affordances only. Real enforcement is the RLS policies in
 * supabase_migration_auth.sql; a guard here stops a screen rendering, not a
 * query running.
 *
 * An unknown route is allowed rather than refused: a typo in a route name
 * should not lock someone out of the application.
 */
export function routeAllowed(name: string, a: AuthLike): boolean {
  if (name === 'matrix') return a.canAccessRatings();
  if (name === 'planner') return a.isCoach();
  if (name === 'coaches') return a.isCoach() || a.isAdmin();
  return true;
}

const placeholder = (title: string, phase: string) => ({
  component: PlaceholderView,
  props: { title, phase }
});

export const router: Router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',         name: 'home',     component: HomeView },
    { path: '/roster',   name: 'roster',   component: RosterView },
    { path: '/schedule', name: 'schedule', component: ScheduleView },
    { path: '/matrix',   name: 'matrix',   ...placeholder('Player Ratings', 'Phase 3') },
    { path: '/planner',  name: 'planner',  ...placeholder('Coach Planner', 'Phase 4') },
    { path: '/coaches',  name: 'coaches',  component: CoachesView },
    { path: '/help',     name: 'help',     component: HelpView },
    // Anything else is the home page rather than a dead end.
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ],
  // The legacy app scrolls to the top on every view swap; keep that.
  scrollBehavior: () => ({ top: 0, behavior: 'smooth' })
});

router.beforeEach((to) => {
  if (routeAllowed(String(to.name || ''), auth)) return true;
  return { name: 'home' };
});
