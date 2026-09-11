/**
 * Demo mode: what makes the demo deployment a demo, in the browser.
 *
 * The flag is a build-time variable, so it cannot be switched on at runtime
 * and cannot follow a user from one deployment to another. Production sets no
 * VITE_ variable, and every value but the exact string 'true' fails closed
 * onto production's behaviour: the one thing that must never happen is the
 * real site telling a parent their child's record is made up.
 *
 * Everything else about the demo lives in its own database, which is rebuilt
 * every night (docs/superpowers/specs/2026-09-11-demo-accounts-design.md).
 */

export interface DemoConfig {
  enabled: boolean;
  /**
   * The nine demo accounts' shared password. Baked into the demo build, so it
   * is public — acceptable only because the demo database holds nothing real
   * and the accounts are locked. Empty whenever demo mode is off.
   */
  password: string;
}

export function readDemoConfig(env: Record<string, string | undefined>): DemoConfig {
  const enabled = env.VITE_DEMO_MODE === 'true';
  return { enabled, password: enabled ? (env.VITE_DEMO_PASSWORD ?? '').trim() : '' };
}

/** This build's demo mode. A function rather than a constant, so a test can mock it. */
export function demoConfig(): DemoConfig {
  return readDemoConfig(import.meta.env as Record<string, string | undefined>);
}

/**
 * The warning's words. It names no time of day: GitHub schedules the rebuild
 * in UTC, so any stated hour would be wrong for half the year.
 */
export const DEMO_NOTICE_TEXT =
  "Demo site. Everything here is made up, and it's restored every night. Change anything you like.";

export interface DemoAccount {
  n: number;
  email: string;
  role: 'coach' | 'player' | 'admin';
  label: string;
  /** What signing in as this account shows, in the visitor's words. */
  sees: string;
}

const COACH_SEES = 'The full command centre: Matrix, planner, diagrams, lineup, live match.';

/**
 * The nine accounts, in the order the picker shows them. demo_accounts.sql
 * gives each the matching role, and src/data/testdb/demo-accounts.test.ts
 * checks the database against this list, so the two cannot drift apart.
 */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  ...[1, 2, 3, 4, 5, 6, 7].map((n): DemoAccount => ({
    n, email: `demo${n}@demo.invalid`, role: 'coach', label: `Coach ${n}`, sees: COACH_SEES
  })),
  { n: 8, email: 'demo8@demo.invalid', role: 'player', label: 'Player',
    sees: "The squad's side: the daily thought and the quiz." },
  { n: 9, email: 'demo9@demo.invalid', role: 'admin', label: 'Admin',
    sees: 'The organization profile, colours, logo, photo, import and export.' }
];
