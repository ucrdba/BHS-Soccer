/**
 * Turning a fixture's stored text into what a coach reads, and back.
 *
 * The stored format is load-bearing. `parse_match_date()` in the schema reads
 * "MON D YYYY" (a comma after the day is fine), and returns null for anything
 * else — including an ISO date. A fixture stored as "2026-09-04" therefore has
 * no `match_on`, which means it sorts and filters as though it had no date at
 * all while still reading correctly on screen. That is why these conversions
 * exist rather than the input's own value being stored.
 *
 * Extracted from public/js/views/schedule.view.js during Phase 2 of the Vue
 * migration.
 */

import { matchDateTime } from './schedule';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
                'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * An `<input type="date">` value to the text column's format.
 *
 * Anything that is not an ISO date is passed through untouched: a coach who
 * typed "SEP 4 2026" directly should not have it mangled.
 */
export function formatIsoToDisplayDate(isoStr: string): string {
  if (!isoStr) return '';
  if (!isoStr.includes('-') && isoStr.length < 15) return isoStr;

  // T00:00:00 forces local time. Without it a bare ISO date parses as UTC and
  // lands on the previous evening west of Greenwich.
  const d = new Date(isoStr + 'T00:00:00');
  if (isNaN(d.getTime())) return isoStr;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** The text column's format back to an `<input type="date">` value. */
export function formatDisplayDateToIso(displayStr: string): string {
  if (!displayStr) return '';
  if (displayStr.includes('-') && displayStr.length === 10) return displayStr;

  const d = new Date(displayStr);
  // Empty rather than a guess: the input would silently show a wrong day.
  if (isNaN(d.getTime())) return '';

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** 18:00 to 6:00 PM. Passed through if it already reads that way. */
export function format24hTo12h(timeStr: string): string {
  if (!timeStr) return '';
  const lower = timeStr.toLowerCase();
  if (lower.includes('am') || lower.includes('pm')) return timeStr;

  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;

  let hrs = parseInt(parts[0], 10);
  if (!Number.isFinite(hrs)) return timeStr;
  const mins = parts[1];
  const ampm = hrs >= 12 ? 'PM' : 'AM';
  hrs = hrs % 12;
  if (hrs === 0) hrs = 12;
  return `${hrs}:${mins} ${ampm}`;
}

/**
 * 6:00 PM to 18:00. Passed through if it already reads that way.
 *
 * The inverse of `format24hTo12h`, and it lives beside it so the two cannot
 * drift: a stored slot is written in twelve-hour text and read back as
 * minutes, so a round trip that loses the meridiem shifts practice by twelve
 * hours.
 */
export function format12hTo24h(timeStr: string): string {
  if (!timeStr) return '';

  const lower = timeStr.toLowerCase();
  if (timeStr.includes(':') && !lower.includes('am') && !lower.includes('pm')) return timeStr;

  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!m) return '';

  let hrs = parseInt(m[1], 10);
  const mins = m[2];
  const ampm = (m[3] || '').toUpperCase();
  if (ampm === 'PM' && hrs < 12) hrs += 12;
  if (ampm === 'AM' && hrs === 12) hrs = 0;
  return `${String(hrs).padStart(2, '0')}:${mins}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * A fixture's date as the schedule is read.
 *
 * The stored text, plus the day of the week — a coach checks which day a
 * fixture falls on far more often than the date itself.
 *
 * The day comes from `matchDateTime`, which prefers the trigger-derived
 * `match_on` and falls back to parsing the text. The legacy version asked the
 * Supabase client for this, which meant the schedule could not be rendered
 * without a configured database; here it is arithmetic on data already loaded.
 */
export function displayDate(match: any): string {
  const raw = String(match?.date ?? '').trim();
  if (!raw) return '';

  const when = matchDateTime(match);
  if (!when) return raw;
  return `${raw} (${DAYS[when.getDay()]})`;
}

/**
 * A maps link for a fixture, or null when there is nothing to point at.
 *
 * Null for a home fixture — a coach knows their own ground — and null when no
 * address was recorded. That second case is the important one: `location` on
 * an away fixture is usually just the opponent's name, and 'Redlands' as a map
 * query lands in the middle of a city rather than at a school. A real schedule
 * contains both 'Redlands' and 'Redlands East Valley'. A link to the wrong
 * town is worse than no link, so only an address the coach stated earns one.
 *
 * The /dir/ form gives turn-by-turn from wherever the reader is standing,
 * which is what "directions" means to a parent leaving the house.
 */
export function matchDirectionsUrl(match: any): string | null {
  if (!match || match.isHome !== false) return null;
  const address = String(match.venueAddress == null ? '' : match.venueAddress).trim();
  if (!address) return null;
  return 'https://www.google.com/maps/dir/?api=1&destination='
    + encodeURIComponent(address);
}
