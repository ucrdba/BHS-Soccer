import { describe, expect, it } from 'vitest';
import { resolveCredential } from './credentials';

const FALLBACK = 'https://production.supabase.co';

describe('resolveCredential', () => {
  it('falls back to production when nothing is configured', () => {
    expect(resolveCredential({}, FALLBACK)).toBe(FALLBACK);
  });

  // The one that matters for the demo deployment: without this, a demo build
  // reads and writes the real database and nothing reports a problem.
  it('prefers the build-time value over the production fallback', () => {
    expect(resolveCredential({ build: 'https://demo.supabase.co' }, FALLBACK))
      .toBe('https://demo.supabase.co');
  });

  // A deployment built for one database should not be redirected by whatever
  // a browser happens to have in localStorage.
  it('prefers the build-time value over a stored one', () => {
    const url = resolveCredential(
      { build: 'https://demo.supabase.co', stored: 'https://someone-elses.supabase.co' },
      FALLBACK
    );

    expect(url).toBe('https://demo.supabase.co');
  });

  it('lets a host-injected runtime value win over everything', () => {
    const url = resolveCredential(
      { runtime: 'https://host.supabase.co', build: 'https://demo.supabase.co', stored: 'https://stored.supabase.co' },
      FALLBACK
    );

    expect(url).toBe('https://host.supabase.co');
  });

  it('still honours localStorage when no build value is set — production is unchanged', () => {
    expect(resolveCredential({ stored: 'https://stored.supabase.co' }, FALLBACK))
      .toBe('https://stored.supabase.co');
  });

  // A Vercel variable defined with nothing pasted into the box arrives as '',
  // which must not win and disconnect the app.
  it('treats empty and whitespace-only values as absent', () => {
    expect(resolveCredential({ build: '', stored: '   ' }, FALLBACK)).toBe(FALLBACK);
    expect(resolveCredential({ build: '   ', stored: 'https://stored.supabase.co' }, FALLBACK))
      .toBe('https://stored.supabase.co');
  });

  it('trims a pasted value', () => {
    expect(resolveCredential({ build: '  https://demo.supabase.co \n' }, FALLBACK))
      .toBe('https://demo.supabase.co');
  });

  it('accepts null from a blocked localStorage read', () => {
    expect(resolveCredential({ stored: null, build: null, runtime: null }, FALLBACK)).toBe(FALLBACK);
  });
});
