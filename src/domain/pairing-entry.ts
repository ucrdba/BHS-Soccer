/**
 * 1v1 results, typed the way they are written on the sheet.
 *
 * `1w3` is "number 1 beat number 3"; `1t3` is a tie. Case does not matter and
 * spaces are allowed anywhere, so `1 W 3` and `1w3` are the same entry.
 *
 * The numbers are RECORDING numbers, not shirt numbers and not row positions.
 * That is the whole point of the format: a coach runs a round robin off a
 * paper sheet printed with recording numbers, and retyping names — or picking
 * twenty-five pairs out of two dropdowns — is slower than the paper it is
 * meant to replace.
 *
 * The winner is always written first, which is what makes the format worth
 * having: there is no separate "who won" to get wrong, and `3w1` and `1w3`
 * are different results rather than the same pairing entered two ways.
 */

/** What one line says, before it is matched against a squad. */
export interface PairingParse {
  /** The number written first — the winner, unless it is a tie. */
  a: number;
  b: number;
  tie: boolean;
}

export interface ParseFailure {
  error: string;
}

export type ParseResult = PairingParse | ParseFailure;

/**
 * Generic over what it is narrowing, so it reads both a parse result and a
 * resolve result — the two failure shapes are the same and so is the check.
 */
export function isParseFailure<T>(r: T | ParseFailure): r is ParseFailure {
  return !!r && typeof (r as ParseFailure).error === 'string';
}

/**
 * Spaces anywhere, either case, `w` or `t`.
 *
 * Anchored so `1w3 and also 5w6` is refused rather than half-read: a line
 * that silently drops its second half records one result and loses the other
 * without saying so.
 */
const LINE = /^\s*(\d{1,3})\s*([wt])\s*(\d{1,3})\s*$/i;

export const HOW_TO_ENTER =
  'One pairing per box, by recording number: 1w3 means number 1 beat number 3, '
  + '1t3 means they tied. Spaces and capitals are fine, so 1 W 3 is the same entry.';

/** One line, read. Blank is not an error — it is simply not an entry. */
export function parsePairing(text: string): ParseResult | null {
  const raw = String(text ?? '');
  if (!raw.trim()) return null;

  const m = LINE.exec(raw);
  if (!m) {
    return { error: `"${raw.trim()}" is not a result. Write the winner, then w or t, then the other player — 1w3.` };
  }

  const a = Number(m[1]);
  const b = Number(m[3]);
  const tie = m[2].toLowerCase() === 't';

  if (a === b) return { error: `Number ${a} cannot play themselves.` };

  return { a, b, tie };
}

/** A pairing matched to the squad, ready to be written. */
export interface ResolvedPairing {
  playerA: any;
  playerB: any;
  /**
   * Relative to `playerA`, which is the number written first. `w` therefore
   * always resolves to 'a' — the format puts the winner on the left, so there
   * is no case where the loser is player A.
   */
  outcome: 'a' | 'draw';
  /** The unordered pair, for spotting the same fixture entered twice. */
  key: string;
}

/**
 * Match a parsed line to two players by recording number.
 *
 * A number nobody carries is reported by the number, because that is what the
 * coach typed and what they will look for on the sheet.
 */
export function resolvePairing(parse: PairingParse, players: any[]): ResolvedPairing | ParseFailure {
  const find = (n: number) =>
    (players || []).find(p => p && Number(p.recordingNumber) === n) || null;

  const playerA = find(parse.a);
  const playerB = find(parse.b);

  const missing = [!playerA ? parse.a : null, !playerB ? parse.b : null].filter(n => n !== null);
  if (missing.length) {
    return {
      error: missing.length === 2
        ? `No player has recording number ${missing[0]} or ${missing[1]}.`
        : `No player has recording number ${missing[0]}.`
    };
  }

  return {
    playerA,
    playerB,
    outcome: parse.tie ? 'draw' : 'a',
    key: [playerA.id, playerB.id].sort().join('|')
  };
}

/**
 * The player carrying a recording number, typed as text.
 *
 * Shared with the picker, where a number can be typed instead of hunting a
 * name down a dropdown of twenty-five. Blank is not a miss — it is a box that
 * has not been filled in yet — so it returns null the same as an unknown
 * number does, and the caller decides whether to complain.
 */
export function playerByNumber(players: any[], text: string): any | null {
  const raw = String(text ?? '').trim();
  if (!/^\d{1,3}$/.test(raw)) return null;

  const n = Number(raw);
  return (players || []).find(p => p && Number(p.recordingNumber) === n) || null;
}

/** One entry box, as the screen understands it. */
export interface EntryLine {
  text: string;
  /** Null for a blank box. */
  resolved: ResolvedPairing | null;
  /** Why this line cannot be recorded, or null. */
  error: string | null;
  /** Said aloud, so the coach can check the line without decoding it. */
  reading: string;
}

/**
 * Every box, read together.
 *
 * Together rather than one at a time because two boxes can be individually
 * valid and wrong as a pair: the same fixture typed twice would write two
 * rows and count both players twice.
 */
export function readEntries(
  texts: string[], players: any[], label: (p: any) => string
): EntryLine[] {
  const seen: Record<string, number> = {};

  return (texts || []).map(text => {
    const blank: EntryLine = { text, resolved: null, error: null, reading: '' };

    const parsed = parsePairing(text);
    if (parsed === null) return blank;
    if (isParseFailure(parsed)) return { ...blank, error: parsed.error };

    const resolved = resolvePairing(parsed, players);
    if (isParseFailure(resolved)) return { ...blank, error: resolved.error };

    const count = (seen[resolved.key] || 0) + 1;
    seen[resolved.key] = count;
    if (count > 1) {
      return { ...blank, error: 'That pairing is already in one of the boxes above.' };
    }

    const a = label(resolved.playerA);
    const b = label(resolved.playerB);
    return {
      ...blank,
      resolved,
      reading: resolved.outcome === 'draw' ? `${a} tied with ${b}` : `${a} beat ${b}`
    };
  });
}

/** The lines that would be written, in the order they were typed. */
export const recordable = (lines: EntryLine[]): EntryLine[] =>
  (lines || []).filter(l => l.resolved && !l.error);

/** Whether anything is stopping the batch from being sent. */
export const hasErrors = (lines: EntryLine[]): boolean =>
  (lines || []).some(l => !!l.error);
