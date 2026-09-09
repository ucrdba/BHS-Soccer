/**
 * Routing for the Vue app.
 *
 * The seven nav routes, in the order the menu reads, plus `/admin` and
 * `/quiz`. The strategy settled that only these get URLs; the app's other
 * modals stay as component state.
 *
 * Neither `/admin` nor `/quiz` is in the nav. `/admin` was never really a
 * modal — several unrelated sections, deep-linkable, and long enough that a
 * dialog fights it — but it is reached on purpose rather than browsed to, and
 * a menu item most visitors cannot open is noise. `/quiz` is a player's
 * screen, linked from the daily message rather than from the menu.
 */
import { createRouter, createWebHistory, type Router } from 'vue-router';
import { auth } from '../auth';
import HomeView from '../views/HomeView.vue';
import PlaceholderView from '../views/PlaceholderView.vue';
import RosterView from '../views/RosterView.vue';
import ScheduleView from '../views/ScheduleView.vue';
import CoachesView from '../views/CoachesView.vue';
import HelpView from '../views/HelpView.vue';
import MatrixView from '../views/MatrixView.vue';
import PlannerView from '../views/PlannerView.vue';
import AdminView from '../views/AdminView.vue';
import QuizView from '../views/QuizView.vue';
import LineupView from '../views/LineupView.vue';
import LiveMatchView from '../views/LiveMatchView.vue';
import SeasonReportView from '../views/SeasonReportView.vue';
import SessionEntryView from '../views/SessionEntryView.vue';
import { groundFor, applyGround } from './ground';

/** The subset of the auth manager the guards need, so they can be tested. */
export interface AuthLike {
  isCoach(): boolean;
  isAdmin(): boolean;
  canAccessRatings(): boolean;
}

export interface NavItem {
  name: string;
  path: string;
  /** The full name, for the router tests and a link's title. */
  label: string;
  /** What a bottom-bar tab has room for. */
  short: string;
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
  { name: 'home',     path: '/',          label: 'Home',               short: 'Home',     icon: '⚽' },
  { name: 'roster',   path: '/roster',    label: 'Roster & Bios',      short: 'Roster',   icon: '👥' },
  { name: 'schedule', path: '/schedule',  label: 'Schedule & Results', short: 'Schedule', icon: '📅' },
  { name: 'matrix',   path: '/matrix',    label: 'Player Ratings',     short: 'Ratings',  icon: '🏆' },
  { name: 'planner',  path: '/planner',   label: 'Coach Planner',      short: 'Planner',  icon: '📋' },
  { name: 'coaches',  path: '/coaches',   label: 'Coaching Staff',     short: 'Staff',    icon: '👔' },
  { name: 'help',     path: '/help',      label: 'Help',               short: 'Help',     icon: '📖' },
  // Last, and only ever visible to a coach or an admin -- AppNav filters this
  // list through routeAllowed(), so nobody else has it in the document. It
  // belongs here rather than being appended to the More sheet on its own: the
  // sheet is display:none at 768px and above, so a link that lived only there
  // could not be reached on a desktop at all.
  { name: 'admin',    path: '/admin',     label: 'Admin',              short: 'Admin',    icon: '⚙️' }
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
  // The touchline tools and session entry write to the record, so they are
  // a coach's. A player may read the ratings board but not record against it.
  if (name === 'lineup' || name === 'live' || name === 'season-report'
      || name === 'session-entry') {
    return a.isCoach() || a.isAdmin();
  }
  // Coach OR admin, deliberately. Gating this on can_access_admin_dashboard
  // would be tighter and wrong: schema_roles.sql grants that to admin alone,
  // while the legacy panel shows the categories, the unassigned players and
  // the quiz bank to any coach. The admin-only SECTIONS carry their own gate.
  if (name === 'admin') return a.isCoach() || a.isAdmin();
  return true;
}

const placeholder = (title: string, phase: string) => ({
  component: PlaceholderView,
  props: { title, phase }
});

export const router: Router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',         name: 'home',     component: HomeView,     meta: { ground: 'paper' } },
    { path: '/roster',   name: 'roster',   component: RosterView,   meta: { ground: 'paper' } },
    { path: '/schedule', name: 'schedule', component: ScheduleView, meta: { ground: 'paper' } },
    // The touchline tools. `chrome: 'tool'` drops the header and nav — a
    // masthead over a match clock is in the way — and the ground makes them
    // navy. Registered before the catch-all, and the lineup before the live
    // board so `/schedule/lineup/...` is never read as a fixture id.
    { path: '/schedule/lineup/:matchId?', name: 'lineup', component: LineupView,
      meta: { ground: 'pitch', chrome: 'tool' } },
    { path: '/schedule/:matchId/live', name: 'live', component: LiveMatchView,
      meta: { ground: 'pitch', chrome: 'tool' } },
    { path: '/schedule/report', name: 'season-report', component: SeasonReportView,
      meta: { ground: 'ledger', chrome: 'tool' } },
    { path: '/matrix/session/:drillId', name: 'session-entry', component: SessionEntryView,
      meta: { ground: 'ledger', chrome: 'tool' } },
    { path: '/matrix',   name: 'matrix',   component: MatrixView,   meta: { ground: 'ledger' } },
    { path: '/planner',  name: 'planner',  component: PlannerView,  meta: { ground: 'paper' } },
    { path: '/coaches',  name: 'coaches',  component: CoachesView,  meta: { ground: 'paper' } },
    { path: '/help',     name: 'help',     component: HelpView,     meta: { ground: 'paper' } },
    { path: '/admin',    name: 'admin',    component: AdminView,    meta: { ground: 'paper' } },
    { path: '/quiz',     name: 'quiz',     component: QuizView,     meta: { ground: 'paper' } },
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

/**
 * The ground follows the route. Set after navigation rather than before so a
 * refused navigation never repaints the page it stayed on.
 */
router.afterEach((to) => {
  applyGround(typeof document === 'undefined' ? undefined : document, groundFor(to.meta));
});
