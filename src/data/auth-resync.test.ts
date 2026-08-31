/**
 * Signing in must re-fetch, not merely repaint.
 *
 * This is the bug that reached a live database: a coach assigned to JV signed
 * in on a page that had loaded signed-out, and kept seeing Varsity. The auth
 * subscriber called updateAuthUI() and renderCurrentView() and stopped there, so
 * this.data.teams still held what an anonymous visitor had been given — the
 * public default team.
 *
 * It survived every review because each one traced syncFromSupabase's internals
 * and nobody asked what happens when auth changes AFTER boot. Before multi-team
 * nothing in this.data was user-scoped, so a repaint genuinely was enough; the
 * team model is what turned a harmless omission into a wrong roster.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';

interface CoreApp {
  data: Record<string, any>;
  init(): Promise<void>;
  syncFromSupabase(): Promise<void>;
  updateAuthUI(): void;
  renderCurrentView(): void;
  bindEvents(): void;
  populateCategoryDropdowns(): void;
  startCountdownTimer(): void;
  loadData(): Record<string, any>;
}

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

let app: CoreApp;
let subscriber: ((u: any) => void) | null;
let syncCalls: number;
let renderCalls: number;
let currentUser: any;

beforeEach(() => {
  subscriber = null;
  syncCalls = 0;
  renderCalls = 0;
  currentUser = { id: 'anon', role: 'guest', status: 'active' };

  const w = globalThis as any;
  w.auth = {
    isCoach: () => false, isAdmin: () => false, isLoggedIn: () => false,
    canAccessRatings: () => false,
    getCurrentUser: () => currentUser,
    getRole: () => currentUser.role,
    subscribe: (cb: (u: any) => void) => { subscriber = cb; }
  };
  w.can = () => true;
  w.supabaseService = { isConfigured: () => true };
  w.authReady = Promise.resolve();

  const ctor = new Function(strip(appCoreSrc) + '\nreturn BHSSoccerApp;')() as { prototype: CoreApp };
  app = Object.create(ctor.prototype) as CoreApp;

  // Stub the parts of init() that need a live DOM, leaving the subscriber
  // wiring — the thing under test — as the real implementation.
  app.data = app.loadData();
  app.syncFromSupabase = async () => { syncCalls += 1; };
  app.updateAuthUI = () => {};
  app.renderCurrentView = () => { renderCalls += 1; };
  app.bindEvents = () => {};
  app.populateCategoryDropdowns = () => {};
  app.startCountdownTimer = () => {};
});

describe('auth changes re-fetch, not just repaint', () => {
  it('re-syncs when a different user signs in', async () => {
    await app.init();
    const before = syncCalls;

    currentUser = { id: 'coach-dean', role: 'coach', status: 'active' };
    subscriber!(currentUser);

    // Without this, a coach who signs in keeps whichever team the page was
    // showing while signed out — the public default, not their own.
    expect(syncCalls).toBeGreaterThan(before);
  });

  it('still repaints on the same auth change', async () => {
    await app.init();
    const before = renderCalls;
    currentUser = { id: 'coach-dean', role: 'coach', status: 'active' };
    subscriber!(currentUser);
    expect(renderCalls).toBeGreaterThan(before);
  });

  it('does nothing when the auth key has not actually changed', async () => {
    // onAuthStateChange fires on token refresh too. Re-fetching every team and
    // roster on a refresh that changed nothing would be pure waste.
    await app.init();
    const before = syncCalls;
    subscriber!(currentUser);
    expect(syncCalls).toBe(before);
  });

  it('re-syncs on sign-out as well as sign-in', async () => {
    await app.init();
    currentUser = { id: 'coach-dean', role: 'coach', status: 'active' };
    subscriber!(currentUser);
    const afterSignIn = syncCalls;

    currentUser = { id: 'anon', role: 'guest', status: 'active' };
    subscriber!(currentUser);

    // Signing out must drop back to the public default rather than leaving the
    // previous coach's teams on screen.
    expect(syncCalls).toBeGreaterThan(afterSignIn);
  });

  it('survives a re-sync that rejects', async () => {
    await app.init();
    app.syncFromSupabase = async () => { syncCalls += 1; throw new Error('network'); };
    currentUser = { id: 'coach-dean', role: 'coach', status: 'active' };
    // An unhandled rejection here would surface as an error with no context.
    expect(() => subscriber!(currentUser)).not.toThrow();
  });
});
