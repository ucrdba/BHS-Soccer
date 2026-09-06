/**
 * What a time earns against a squad's standards.
 *
 * This is the only scoring the browser does. Everywhere else the points come
 * from `matrix_standings`, derived in Postgres — but a coach entering
 * twenty-five times wants to see what each one is worth as it is typed, not
 * after the save.
 *
 * `factorForTime` therefore duplicates `SupabaseService.factorForTime`
 * deliberately, and `band-score.test.ts` runs both over the same inputs to
 * prove they agree. Two readings of "the tightest band it fits" that differ
 * would show one number and store another.
 *
 * Extracted from public/js/views/matrix-session.view.js during Phase 3b.
 */
import { parseTimeToSeconds } from './time';

export interface Band {
  max_seconds: number | string;
  factor: number | string;
}

export type FeedbackTone = 'good' | 'none' | 'bad' | 'empty';

/**
 * The tightest band a time still fits under, or nothing.
 *
 * Tightest, not first or loosest: a player who beats the hardest standard
 * would otherwise be paid whatever the easiest one is worth, which makes
 * having three of them pointless. `<=` because a standard of 4:30 means 4:30
 * passes — anything else makes the number on the sheet wrong by a second.
 */
export function factorForTime(seconds: any, bands: Band[]): number {
  // An absent value is not a fast time. Number(null) and Number('') are both
  // 0, which fits under every band and would earn the top one.
  if (seconds === null || seconds === undefined || String(seconds).trim() === '') return 0;

  const n = Number(seconds);
  if (!Number.isFinite(n)) return 0;

  const fitting = (bands || [])
    .filter(b => n <= Number(b.max_seconds))
    .sort((a, b) => Number(a.max_seconds) - Number(b.max_seconds));

  return fitting.length ? Number(fitting[0].factor) : 0;
}

/**
 * What sits beside the input as a time is typed.
 *
 * Four states, and the two that look alike are the point: `bad` means the
 * entry could not be read, `none` means it was read fine and met no standard.
 * Telling a coach their entry looks wrong when the player was simply slow
 * would have them retype a correct time.
 */
export function bandFeedback(
  raw: string, bands: Band[]
): { text: string; tone: FeedbackTone } {
  const typed = String(raw ?? '').trim();
  if (!typed) return { text: '', tone: 'empty' };

  const seconds = parseTimeToSeconds(typed);
  // Named here rather than at save time: finding out then means re-reading a
  // sheet of twenty-five entries to work out which one it was.
  if (seconds === null) return { text: 'mm:ss?', tone: 'bad' };

  const factor = factorForTime(seconds, bands);
  return factor > 0
    ? { text: `earns ${+factor.toFixed(2)}`, tone: 'good' }
    : { text: 'no band', tone: 'none' };
}
