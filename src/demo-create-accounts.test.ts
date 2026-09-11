/**
 * The one-time account script's guards. Its network half needs a Supabase
 * project; these are the decisions it makes before and after it touches one.
 */
import { describe, it, expect } from 'vitest';
import {
  DEMO_EMAILS, refuseTarget, isServiceKey, missingAccounts, readDemoPassword, readOptions, signInReport
} from '../scripts/demo-create-accounts.mjs';
import { readDemoConfig } from './demo';

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

  describe('the password', () => {
    // The picker sends VITE_DEMO_PASSWORD trimmed; an account given the
    // untrimmed value would be one the picker cannot open.
    it('is trimmed exactly as the app trims the one the picker sends', () => {
      const raw = '  correct horse \n';
      expect(readDemoPassword({ DEMO_PASSWORD: raw }))
        .toBe(readDemoConfig({ VITE_DEMO_MODE: 'true', VITE_DEMO_PASSWORD: raw }).password);
      expect(readDemoPassword({ DEMO_PASSWORD: '\tpassword1 ' })).toBe('password1');
    });

    it('is refused under 8 characters once trimmed, without repeating it', () => {
      expect(() => readDemoPassword({ DEMO_PASSWORD: '  seven7  ' })).toThrow(/at least 8 characters/);
      expect(() => readDemoPassword({ DEMO_PASSWORD: '   ' })).toThrow(/at least 8 characters/);
      expect(() => readDemoPassword({})).toThrow(/DEMO_PASSWORD/);
      expect(() => readDemoPassword({ DEMO_PASSWORD: ' seven7 ' })).not.toThrow(/seven7/);
      expect(readDemoPassword({ DEMO_PASSWORD: 'eight888' })).toBe('eight888');
    });
  });

  it('writes nothing without --confirm', () => {
    expect(readOptions([])).toEqual({ confirm: false, resetPasswords: false });
    expect(readOptions(['--reset-passwords'])).toEqual({ confirm: false, resetPasswords: true });
    expect(readOptions(['--reset-passwords', '--confirm'])).toEqual({ confirm: true, resetPasswords: true });
  });

  describe('the sign-in check', () => {
    const all = (over: Record<string, object> = {}) =>
      DEMO_EMAILS.map(email => ({ email, exists: true, signsIn: true, ...over[email] }));

    it('passes when all nine sign in, one line each', () => {
      const r = signInReport(all());
      expect(r.problem).toBeNull();
      expect(r.lines).toHaveLength(9);
      expect(r.lines[0]).toBe('  demo1@demo.invalid  signs in');
    });

    it('fails naming an account that cannot, and says to delete it and run again', () => {
      const r = signInReport(all({
        'demo4@demo.invalid': { signsIn: false, reason: 'Invalid login credentials' }
      }));
      expect(r.lines[3]).toBe('  demo4@demo.invalid  cannot sign in (Invalid login credentials)');
      expect(r.problem).toMatch(/^demo4@demo\.invalid: cannot sign in/);
      expect(r.problem).toMatch(/registered by someone else, or with another password/);
      expect(r.problem).toMatch(/Authentication -> Users/);
      expect(r.problem).not.toMatch(/demo1@/);
    });

    // A dry run that would create an account cannot sign in to it yet; that is
    // what --confirm is for, not a failure.
    it('does not count an account a dry run would create', () => {
      const r = signInReport(all({ 'demo9@demo.invalid': { exists: false, signsIn: false } }));
      expect(r.lines[8]).toBe('  demo9@demo.invalid  does not exist yet');
      expect(r.problem).toBeNull();
    });

    it('in a --reset-passwords dry run, says the reset sets it rather than to delete', () => {
      const r = signInReport(all({ 'demo2@demo.invalid': { signsIn: false } }), { resetPending: true });
      expect(r.problem).toMatch(/--reset-passwords --confirm sets it/);
      expect(r.problem).not.toMatch(/delete/);
    });
  });
});
