import { describe, expect, it } from 'vitest';
import { isPublishableAnonKey } from './anon-key';

describe('isPublishableAnonKey', () => {
  it('accepts a legacy JWT anon key', () => {
    expect(isPublishableAnonKey('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def')).toBe(true);
  });

  // The format every project created after the 2025 key rotation gets — the
  // demo project among them. Rejecting it left the client null and the app
  // silently reading nothing.
  it('accepts a publishable key', () => {
    expect(isPublishableAnonKey('sb_publishable_l9J4lQrJ0CIMPgMBcn9siA_eTtEWmOY')).toBe(true);
  });

  it('ignores surrounding whitespace, as a paste from the dashboard carries', () => {
    expect(isPublishableAnonKey('  sb_publishable_abc  ')).toBe(true);
  });

  it('rejects nothing at all', () => {
    expect(isPublishableAnonKey('')).toBe(false);
    expect(isPublishableAnonKey(null)).toBe(false);
    expect(isPublishableAnonKey(undefined)).toBe(false);
  });

  // The mistake worth catching: a secret key in the browser bypasses RLS.
  it('rejects a new-format secret key', () => {
    expect(isPublishableAnonKey('sb_secret_l9J4lQrJ0CIMPgMBcn9siA')).toBe(false);
  });

  it('rejects a project URL pasted into the key box', () => {
    expect(isPublishableAnonKey('https://nzelhvipofeqoteewvhg.supabase.co')).toBe(false);
  });
});
