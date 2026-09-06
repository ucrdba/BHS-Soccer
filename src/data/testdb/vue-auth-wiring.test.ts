/**
 * How auth reaches the database client.
 *
 * This exists because it went wrong and nothing caught it. AuthManager read
 * `window.supabaseService` in fifteen places — it was written for the legacy
 * app, where src/main.ts publishes that global — while src/vue-main.ts
 * published none. So every auth call in the Vue app optional-chained to
 * undefined and degraded to a guest, and signing in reported "Cloud
 * authentication is not configured".
 *
 * Every component test passed throughout, because they mock the store rather
 * than exercising the real path. The dependency was invisible to the compiler
 * too, since `window.supabaseService` is typed by the looser ambient
 * declaration in globals.d.ts rather than by the client's own signatures.
 *
 * auth.ts now imports the client directly, which is the invariant these guard.
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

/** Source without comments, so a line describing the old way is not a match. */
function codeOf(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(l => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('how auth reaches the database client', () => {
  it('imports the client rather than reaching for a global', () => {
    expect(codeOf('src/auth.ts'))
      .toMatch(/import \{[^}]*supabaseService[^}]*\} from '\.\/data\/supabase'/);
  });

  it('reads it off window nowhere', () => {
    // Fifteen call sites did, and the Vue app silently had no auth because
    // of it.
    expect(codeOf('src/auth.ts')).not.toMatch(/window\.supabaseService/);
  });

  it('leaves the Vue entry point publishing no globals', () => {
    // src/main.ts still publishes the client, because the classic scripts
    // under public/js cannot import. This entry has no reason to.
    expect(codeOf('src/vue-main.ts')).not.toMatch(/\.supabaseService\s*=/);
  });
});

describe.skipIf(!available)('AuthManager against a live stack', () => {
  let auth: any;

  beforeAll(async () => {
    (globalThis as any).window = globalThis;
    (globalThis as any).ENV_SUPABASE_URL = API;
    (globalThis as any).ENV_SUPABASE_ANON_KEY = ANON;
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
