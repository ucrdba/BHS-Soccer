/**
 * Catch mistyped email addresses at sign-up.
 *
 * Why this exists. A coach approves every account by name before it can see
 * anything, so a fake address does not grant access — approval is the real
 * gate. What a wrong address DOES cause is a player who registers as
 * `jsmith@gmial.com`, is approved because the name looks right, and can then
 * never reset their password. So the job here is catching typos, not proving
 * identity.
 *
 * Why it only ever suggests. Coaches outside Beaumont High School use this
 * site — club coaches on personal or unfamiliar domains — so no list of
 * "valid" domains can be complete, and blocking an address this file does not
 * recognise would lock out exactly the people it cannot anticipate. Every
 * check below returns a suggestion the person can decline.
 *
 * Pure functions with no DOM and no network: the app stays static, and these
 * are testable on their own.
 */

/** Providers common enough that a near-miss is almost certainly a typo. */
const COMMON_DOMAINS = [
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com',
  'comcast.net', 'verizon.net', 'sbcglobal.net', 'att.net', 'msn.com'
];

/**
 * Misspellings seen often enough to name outright, where edit distance alone
 * would be ambiguous or would miss them.
 */
const KNOWN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmaul.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'homail.com': 'hotmail.com',
  'yahooo.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'iclould.com': 'icloud.com',
  'icloud.co': 'icloud.com',
  'iclod.com': 'icloud.com'
};

/** Top-level slips that apply whatever the domain is. */
const TLD_TYPOS: Record<string, string> = {
  'con': 'com',
  'cim': 'com',
  'cmo': 'com',
  'ocm': 'com',
  'comm': 'com',
  'ogr': 'org',
  'orgg': 'org',
  'edut': 'edu',
  'ed': 'edu',
  'ne': 'net',
  'nte': 'net'
};
// Entries like 'co.m' or 'eu.' are deliberately absent: the TLD is taken from
// the last dot onward, and a domain ending in a dot is rejected as malformed
// before this table is consulted, so such keys could never match.

/** Damerau-Levenshtein, capped: anything past `max` is not a near-miss. */
function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      // Transposition: "gmial" for "gmail" is one slip, not two.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, (prev[j - 2] ?? Infinity) + 1);
      }
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;   // whole row already too far
    prev = cur;
  }
  return prev[b.length];
}

export interface EmailCheck {
  /** false only when the text cannot be an address at all. */
  valid: boolean;
  /** A corrected address to offer, or null when nothing looks wrong. */
  suggestion: string | null;
  /** Why, in words a player can act on. */
  reason: string | null;
}

/**
 * Inspect an address without sending anything anywhere.
 *
 * A `suggestion` is an offer, never a verdict: the caller must let the person
 * keep what they typed. An unfamiliar domain is not a typo — a club coach's
 * address is legitimate and unknowable from here.
 */
export function checkEmail(input: string): EmailCheck {
  const email = String(input || '').trim().toLowerCase();
  const none: EmailCheck = { valid: true, suggestion: null, reason: null };

  if (!email) return { valid: false, suggestion: null, reason: 'Enter an email address.' };

  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1 || email.indexOf(' ') > -1) {
    return { valid: false, suggestion: null, reason: 'That does not look like an email address.' };
  }

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
    return { valid: false, suggestion: null, reason: 'That does not look like an email address.' };
  }

  // 1. A misspelling we can name outright.
  if (KNOWN_TYPOS[domain]) {
    return { valid: true, suggestion: `${local}@${KNOWN_TYPOS[domain]}`, reason: 'Did you mean' };
  }

  // 2. A slipped top-level domain, whatever the rest is. Checked before the
  //    near-miss pass so `beaumont.con` is corrected rather than compared
  //    against Gmail and dismissed.
  const dot = domain.lastIndexOf('.');
  const stem = domain.slice(0, dot);
  const tld = domain.slice(dot + 1);
  if (TLD_TYPOS[tld]) {
    return { valid: true, suggestion: `${local}@${stem}.${TLD_TYPOS[tld]}`, reason: 'Did you mean' };
  }

  // 3. One or two characters off a common provider. Only worth suggesting when
  //    the domain is genuinely close: an unfamiliar domain is far from all of
  //    them and passes silently, which is what a club coach needs.
  if (!COMMON_DOMAINS.includes(domain)) {
    for (const known of COMMON_DOMAINS) {
      const d = editDistance(domain, known, 2);
      // A distance of 2 is only convincing on a longer domain; on a short one
      // it can turn a real address into a different real address.
      const close = d === 1 || (d === 2 && known.length >= 9);
      if (close) {
        return { valid: true, suggestion: `${local}@${known}`, reason: 'Did you mean' };
      }
    }
  }

  return none;
}
