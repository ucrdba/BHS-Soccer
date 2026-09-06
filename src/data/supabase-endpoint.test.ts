/**
 * Which URLs get a Supabase client.
 *
 * The check used to be `url.includes('.supabase.co')` alone, which silently
 * refused every local URL. `supabase start` serves its API on
 * http://127.0.0.1:54321, so the app logged "Operating in Local Database
 * Mode" and every service method returned null — making it impossible to
 * develop or test against a local stack, with the reason buried in a console
 * line nobody reads.
 *
 * The rule is deliberately narrow. Loopback only: a typo in a deployment's
 * configuration must still fail loudly rather than half-connecting to
 * something that happens to answer.
 */
import { describe, it, expect } from 'vitest';
import { isSupabaseEndpoint } from './supabase';

describe('isSupabaseEndpoint', () => {
  it('accepts a hosted project', () => {
    expect(isSupabaseEndpoint('https://arsigevpgpbqluqbnhjr.supabase.co')).toBe(true);
  });

  it('accepts the local stack the CLI runs', () => {
    expect(isSupabaseEndpoint('http://127.0.0.1:54321')).toBe(true);
    expect(isSupabaseEndpoint('http://localhost:54321')).toBe(true);
    expect(isSupabaseEndpoint('http://[::1]:54321')).toBe(true);
  });

  it('accepts loopback with a trailing path or no port', () => {
    expect(isSupabaseEndpoint('http://127.0.0.1:54321/')).toBe(true);
    expect(isSupabaseEndpoint('http://localhost')).toBe(true);
  });

  it('refuses an empty or missing url', () => {
    expect(isSupabaseEndpoint('')).toBe(false);
    expect(isSupabaseEndpoint(undefined as any)).toBe(false);
  });

  it('refuses a host that merely looks local', () => {
    // localhost.evil.test resolves wherever its owner points it.
    expect(isSupabaseEndpoint('http://localhost.evil.test')).toBe(false);
    expect(isSupabaseEndpoint('http://127.0.0.1.evil.test')).toBe(false);
  });

  it('refuses any other host', () => {
    expect(isSupabaseEndpoint('https://example.test')).toBe(false);
    expect(isSupabaseEndpoint('https://supabase.co.evil.test/x')).toBe(false);
  });

  it('refuses a private address that is not loopback', () => {
    // A stack on another machine is not what this exception is for.
    expect(isSupabaseEndpoint('http://192.168.1.10:54321')).toBe(false);
  });
});
