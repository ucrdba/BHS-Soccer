/**
 * Regression for the drillsBank mapping in syncFromSupabase().
 *
 * The mapping used to list drillsBank fields explicitly and omit `measure`,
 * so every drill loaded from Supabase looked like `undefined` to code that
 * read `d.measure`. matrix-session.view.js:87 filters the session picker on
 * `(d.measure || 'head_to_head') !== 'head_to_head'`, so with the field
 * missing every drill was treated as head_to_head and "Record a session"
 * offered nothing, forever.
 *
 * This is deliberately driven through the real syncFromSupabase() against a
 * snake_case row shaped like what Postgres actually returns (`measure:
 * 'count_high'`), rather than a hand-built camelCase drillsBank array —
 * a hand-built object with `measure` already present on it cannot fail this
 * way, which is exactly why the existing session-grid tests never caught the
 * bug in the first place.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';

interface CoreApp {
  data: Record<string, any>;
  activeTeamId: string | null;
  syncFromSupabase(): Promise<void>;
  updateHeaderBranding(): void;
  loadData(): Record<string, any>;
}

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

let app: CoreApp;

beforeEach(() => {
  const w = globalThis as any;
  w.auth = {
    isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
    canAccessRatings: () => true, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'admin', status: 'active' }),
    getRole: () => 'admin'
  };
  w.can = () => true;

  // A minimal but real service surface: every table syncFromSupabase reads
  // unconditionally must be present, or the try/catch would swallow a
  // "not a function" before we get to assert anything.
  w.supabaseService = {
    isConfigured: () => true,
    fetchTeamsForViewer: async () => [],
    fetchSchool: async () => null,
    fetchSchools: async () => null,
    // The database row: snake_case, exactly as Postgres returns it.
    fetchDrillsBank: async () => ([
      {
        id: 'd1', name: "Cooper's", duration: '12 min', category: 'Fitness',
        points: 1.5, measure: 'count_high', coach_notes: '', diagram_image: null,
        diagram_data: null
      }
    ]),
    fetchPracticePlans: async () => null,
    fetchCoaches: async () => null,
    fetchDailyThoughts: async () => null,
    fetchSoccerCategories: async () => null
  };

  const ctor = new Function(strip(appCoreSrc) + '\nreturn BHSSoccerApp;')() as { prototype: CoreApp };
  app = Object.create(ctor.prototype) as CoreApp;
  app.data = app.loadData();
  app.activeTeamId = null;
  app.updateHeaderBranding = () => {};
});

describe('drillsBank mapping in syncFromSupabase', () => {
  it('carries the measure column from a snake_case database row into app state', async () => {
    await app.syncFromSupabase();
    expect(app.data.drillsBank).toHaveLength(1);
    expect(app.data.drillsBank[0].measure).toBe('count_high');
  });

  it('defaults measure to head_to_head only when the database omits it', async () => {
    (globalThis as any).supabaseService.fetchDrillsBank = async () => ([
      { id: 'd2', name: '1v1 Gauntlet', duration: '20 min', category: 'Technical', points: 3 }
    ]);
    await app.syncFromSupabase();
    expect(app.data.drillsBank[0].measure).toBe('head_to_head');
  });
});
