/**
 * The one-time account script's guards. Its network half needs a Supabase
 * project; these are the decisions it makes before it touches one.
 */
import { describe, it, expect } from 'vitest';
import { DEMO_EMAILS, refuseTarget, isServiceKey, missingAccounts } from '../scripts/demo-create-accounts.mjs';

const jwt = (role: string) =>
  `x.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.y`;

describe('the demo account script', () => {
  it('knows the nine accounts', () => {
    expect(DEMO_EMAILS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `demo${n}@demo.invalid`));
  });

  it("refuses production's project, and anything that is not a Supabase project", () => {
    expect(refuseTarget('https://arsigevpgpbqluqbnhjr.supabase.co')).toMatch(/production/);
    expect(refuseTarget('')).toMatch(/DEMO_SUPABASE_URL/);
    expect(refuseTarget('https://example.com')).toMatch(/supabase\.co/);
    expect(refuseTarget('https://nzelhvipofeqoteewvhg.supabase.co')).toBeNull();
  });

  it('needs a key that can create users', () => {
    expect(isServiceKey('sb_secret_abc')).toBe(true);
    expect(isServiceKey(jwt('service_role'))).toBe(true);
    expect(isServiceKey('sb_publishable_abc')).toBe(false);
    expect(isServiceKey(jwt('anon'))).toBe(false);
    expect(isServiceKey('')).toBe(false);
  });

  it('creates only the accounts that are missing', () => {
    expect(missingAccounts(['demo1@demo.invalid', 'DEMO2@demo.invalid', 'someone@else.test']))
      .toEqual([3, 4, 5, 6, 7, 8, 9].map(n => `demo${n}@demo.invalid`));
  });
});
