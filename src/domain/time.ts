/**
 * Times, as a coach reads and writes them.
 *
 * Stored as seconds because `raw_value` is numeric and because comparing
 * "10:00" against "4:30" as text puts the slower one first.
 *
 * Moved verbatim off the Supabase client during the Vue migration's Phase 3 —
 * a view should be able to format a number without a database. The rules are
 * the client's, unchanged, because a parser that disagrees with the one the
 * legacy app uses would score the same time against a different band.
 */

/**
 * Read a time a coach typed into seconds, or null if it is not a time.
 *
 * Null rather than a guess: a silently wrong time is scored against the wrong
 * band, and the standings move with nothing on screen to show for it.
 */
export function parseTimeToSeconds(value: any): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) return parseInt(raw, 10);

  // A full stop means the same as a colon. A stopwatch reads 4:30 and a coach
  // writing it down reaches for whichever key is nearer, so refusing one of
  // the two is friction with nothing behind it.
  //
  // NOT decimal minutes: "4.30" is four minutes thirty, not four and a third.
  //
  // Two digits are required after the separator. "4:5" could be 4:05 or 4:50,
  // and there is no way to tell — so it is refused rather than resolved one
  // way and scored.
  const m = /^(\d+)[:.]([0-5]\d)$/.exec(raw);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Seconds back to mm:ss, zero-padded, for display and for editing. */
export function formatSecondsAsTime(seconds: any): string {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return '';
  return `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}`;
}
