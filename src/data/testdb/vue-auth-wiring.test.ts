/**
 * That the Vue entry point wires auth up at all.
 *
 * This exists because it did not, and nothing caught it. AuthManager reaches
 * for `window.supabaseService` in fifteen places — it was written for the
 * legacy app, where src/main.ts publishes that global — and src/vue-main.ts
 * deliberately published none. So every auth call in the Vue app optional-
 * chained to undefined and degraded to a guest, and signing in reported
 * "Cloud authentication is not configured".
 *
 * The component tests all passed throughout, because they mock the store
 * rather than exercising the real path. Only running it would have shown the
 * problem — so this asserts the wiring itself against a live stack.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';

const API = process.env.SUPABASE_LOCAL_URL || 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_LOCAL_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

async function stackIsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/rest/v1/`, {
      headers: { apikey: ANON },
      signal: AbortSignal.timeout(2000)
    });
    return res.ok;
  } catch { return false; }
}

const available = await stackIsUp();

describe('the Vue entry point', () => {
  it('publishes supabaseService, because AuthManager reads it off window', () => {
    // A source assertion rather than a behavioural one: importing vue-main
    // mounts the whole app. The point is that the line cannot be removed
    // without a failing test, since removing it breaks auth silently.
    const src = readFileSync('src/vue-main.ts', 'utf8');
    expect(src).toMatch(/window\s*as\s*any\)\.supabaseService\s*=\s*supabaseService/);
  });

  it('sets it before auth.init() runs', () => {
    const src = readFileSync('src/vue-main.ts', 'utf8');
    const assign = src.indexOf('.supabaseService = supabaseService');
    const init = src.indexOf('auth.init()');
    expect(assign).toBeGreaterThan(-1);
    expect(init).toBeGreaterThan(-1);
    // Otherwise init reads a global that is not there yet.
    expect(assign).toBeLessThan(init);
  });
});

describe.skipIf(!available)('AuthManager against a live stack', () => {
  let auth: any;

  beforeAll(async () => {
    (globalThis as any).window = globalThis;
    (globalThis as any).ENV_SUPABASE_URL = API;
    (globalThis as any).ENV_SUPABASE_ANON_KEY = ANON;

    // The same order vue-main.ts uses: publish the service, then load auth.
    const { supabaseService } = await import('../supabase');
    (globalThis as any).supabaseService = supabaseService;
    auth = (await import('../../auth')).auth;
  }, 60_000);

  it('restores a session without throwing, and reports a guest', async () => {
    await auth.init();
    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.getRole()).toBe('guest');
  });

  it('reaches GoTrue rather than reporting it unconfigured', async () => {
    // The exact symptom the missing global produced: this message came back
    // for every attempt, because isConfigured() was reading undefined.
    const res = await auth.loginUser('nobody@example.test', 'wrong-password');
    expect(res.success).toBe(false);
    expect(res.message).not.toMatch(/not configured/i);
  });
});
