/**
 * The Supabase CLIENT against a real stack.
 *
 * Everything in src/data/testdb/ up to now has tested SQL through a direct
 * Postgres connection, which cannot exercise src/data/supabase.ts at all:
 * that client speaks HTTP to PostgREST and GoTrue. So "the constraints are
 * right" was covered and "the client sends the right thing" was not — the
 * largest untested seam in the Vue migration, since every write goes through
 * it.
 *
 * Needs `supabase start`. Skipped otherwise, like the rest of this directory,
 * so a machine without the stack still runs the whole suite.
 *
 * The URL and key come from the environment or the CLI's published local
 * defaults. They are not secret — the local anon key is the same fixed
 * development value on every machine — but they are read rather than hardcoded
 * as a fallback, so nothing here can accidentally become a deployment default.
 */
import { describe, it, expect, beforeAll } from 'vitest';

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
  } catch {
    return false;
  }
}

const available = await stackIsUp();

/**
 * The client is a module singleton that resolves its credentials at
 * evaluation time, so the globals have to be in place before the import.
 */
async function loadService() {
  (globalThis as any).window = globalThis;
  (globalThis as any).ENV_SUPABASE_URL = API;
  (globalThis as any).ENV_SUPABASE_ANON_KEY = ANON;
  const mod = await import('../supabase');
  return mod.supabaseService;
}

describe.skipIf(!available)('SupabaseService against a local stack', () => {
  let service: any;

  beforeAll(async () => { service = await loadService(); }, 60_000);

  it('builds a client for a loopback URL', () => {
    // The guard used to require '.supabase.co', so this was impossible: the
    // client was null and every method returned null with no error.
    expect(service.isConfigured()).toBe(true);
  });

  it('reaches PostgREST rather than only constructing a client', async () => {
    // fetchSchools returns null on any failure, so a non-null array is proof
    // the request went out and came back understood.
    const schools = await service.fetchSchools();
    expect(Array.isArray(schools)).toBe(true);
  });

  it('reads the schedule for a team without throwing', async () => {
    // A uuid that matches nothing: the point is the round trip, not the rows.
    const rows = await service.fetchSchedule('00000000-0000-0000-0000-000000000000');
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(0);
  });

  it('refuses a schedule read for a non-uuid team, without a round trip', async () => {
    // The guard exists because a school code here returned null via a 22P02
    // round trip, with the reason visible only in a Postgres log.
    expect(await service.fetchSchedule('bhs')).toBeNull();
  });

  it('refuses to write a fixture with no valid team', async () => {
    // upsertMatch returns null rather than {ok,error} deliberately: admin.js
    // does `return !!(await upsertMatch(...))`, so an object would make every
    // refusal count as a success.
    expect(await service.upsertMatch('', { opponent: 'Nobody' })).toBeNull();
    expect(await service.upsertMatch('bhs', { opponent: 'Nobody' })).toBeNull();
  });

  it('reports an anonymous session rather than inventing one', async () => {
    const res = await service.getSession();
    expect(res?.data?.session ?? null).toBeNull();
  });
});

describe.skipIf(available)('without a local stack', () => {
  it('says so rather than failing the suite', () => {
    expect(available).toBe(false);
  });
});
