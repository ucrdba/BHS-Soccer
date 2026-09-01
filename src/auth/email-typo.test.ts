/**
 * Sign-up typo detection.
 *
 * The failure this guards against is quiet: a player registers as
 * jsmith@gmial.com, a coach approves them because the NAME is right, and the
 * player can never reset their password. Nothing errors; the account is simply
 * unreachable forever.
 *
 * The more important half of these tests is the second block. Coaches outside
 * Beaumont High School use this site, so an address on an unfamiliar domain is
 * ordinary rather than suspicious. A check that nags a club coach about a
 * perfectly good address is worse than no check, because they will learn to
 * dismiss it — including the time it is right.
 */

import { describe, it, expect } from 'vitest';
import { checkEmail } from './email-typo';

describe('addresses that are not addresses', () => {
  it('rejects empty input', () => {
    expect(checkEmail('').valid).toBe(false);
    expect(checkEmail('   ').valid).toBe(false);
  });

  it('rejects text with no @ or no domain', () => {
    expect(checkEmail('jsmith').valid).toBe(false);
    expect(checkEmail('jsmith@').valid).toBe(false);
    expect(checkEmail('@gmail.com').valid).toBe(false);
    expect(checkEmail('jsmith@gmail').valid).toBe(false);
  });

  it('rejects an address with a space in it', () => {
    // Pasting from a roster document is where this comes from.
    expect(checkEmail('j smith@gmail.com').valid).toBe(false);
  });

  it('rejects a domain with a leading or trailing dot', () => {
    expect(checkEmail('jsmith@.com').valid).toBe(false);
    expect(checkEmail('jsmith@gmail.').valid).toBe(false);
  });
});

describe('addresses that must pass silently', () => {
  // These are the cases where a false suggestion does real harm.
  it('accepts the common providers unchanged', () => {
    for (const d of ['gmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'hotmail.com']) {
      const r = checkEmail(`jsmith@${d}`);
      expect(r.valid, d).toBe(true);
      expect(r.suggestion, d).toBeNull();
    }
  });

  it('accepts a club domain it has never seen', () => {
    // The reason this check only ever suggests: no list of valid domains can
    // be complete, and club coaches are exactly who it cannot anticipate.
    for (const d of ['legendsfc.org', 'revclub.net', 'riversidesurf.com', 'ussoccer.com']) {
      const r = checkEmail(`coach@${d}`);
      expect(r.suggestion, d).toBeNull();
    }
  });

  it('accepts a school domain', () => {
    expect(checkEmail('jsmith@beaumont.edu').suggestion).toBeNull();
    expect(checkEmail('jsmith@busd.k12.ca.us').suggestion).toBeNull();
  });

  it('accepts a plus-addressed and a dotted local part', () => {
    expect(checkEmail('j.smith+soccer@gmail.com').suggestion).toBeNull();
  });

  it('does not confuse two real domains that look alike', () => {
    // me.com and aol.com are both real and short; a distance-2 match between
    // short domains would turn one real address into another.
    expect(checkEmail('coach@me.com').suggestion).toBeNull();
    expect(checkEmail('coach@aol.com').suggestion).toBeNull();
  });
});

describe('typos it should catch', () => {
  const suggests = (typed: string, expected: string) => {
    const r = checkEmail(typed);
    expect(r.valid, typed).toBe(true);          // never blocks
    expect(r.suggestion, typed).toBe(expected);
  };

  it('catches the common Gmail misspellings', () => {
    suggests('jsmith@gmial.com', 'jsmith@gmail.com');
    suggests('jsmith@gmai.com', 'jsmith@gmail.com');
    suggests('jsmith@gnail.com', 'jsmith@gmail.com');
  });

  it('catches transposed letters, which are one slip and not two', () => {
    suggests('jsmith@hotmial.com', 'jsmith@hotmail.com');
  });

  it('catches the other big providers', () => {
    suggests('jsmith@yahooo.com', 'jsmith@yahoo.com');
    suggests('jsmith@outlok.com', 'jsmith@outlook.com');
    suggests('jsmith@iclould.com', 'jsmith@icloud.com');
  });

  it('catches a slipped top-level domain on ANY domain', () => {
    // Checked before the near-miss pass, so a club domain with a bad TLD is
    // corrected rather than compared against Gmail and dismissed.
    suggests('jsmith@gmail.con', 'jsmith@gmail.com');
    suggests('coach@legendsfc.con', 'coach@legendsfc.com');
    suggests('coach@beaumont.edut', 'coach@beaumont.edu');
  });

  it('rejects a trailing dot rather than trying to correct it', () => {
    // The TLD table cannot help here — the tld is read from the last dot
    // onward, so a trailing dot leaves nothing to look up. Saying the address
    // is malformed is more useful than guessing at a correction.
    expect(checkEmail('coach@beaumont.eu.').valid).toBe(false);
  });

  it('preserves the local part exactly when suggesting', () => {
    // Rewriting the name half would be worse than the typo.
    expect(checkEmail('J.Smith+Team@gmial.com').suggestion).toBe('j.smith+team@gmail.com');
  });

  it('never blocks, only offers', () => {
    // Every suggestion must be declinable: the person may genuinely own an
    // address one character from Gmail.
    const r = checkEmail('jsmith@gmial.com');
    expect(r.valid).toBe(true);
    expect(r.reason).toContain('Did you mean');
  });
});

describe('the suggestion reaches the sign-up form', () => {
  // The pure check is useless if the UI swallows it, so these assert the
  // wiring: both answers must be offered, and "use what I typed" must work.
  it('offers both answers, not just the correction', async () => {
    const src = (await import('../../public/js/views/coaches.view.js?raw')).default;
    expect(src).toContain('showEmailSuggestion');
    expect(src).toContain('Yes, use that');
    expect(src).toContain('No, use what I typed');
  });

  it('passes acceptTypedEmail through so the person can overrule it', async () => {
    // Without this the "No, use what I typed" button would re-run the same
    // check and offer the same suggestion forever.
    const src = (await import('../../public/js/views/coaches.view.js?raw')).default;
    expect(src).toContain('handleRegister(true)');
    expect(src).toContain('acceptTypedEmail');
  });

  it('does not re-offer after applying a correction', async () => {
    // A corrected address could itself be one character from another provider.
    const src = (await import('../../public/js/views/coaches.view.js?raw')).default;
    // Slice from the DEFINITION, not the first mention: openVerifyTab is
    // called earlier than it is defined, which inverts a naive range.
    const start = src.indexOf('useSuggestedEmail(suggestion) {');
    const fn = src.slice(start, start + 420);
    expect(fn).toContain('this.handleRegister(true)');
  });
});
