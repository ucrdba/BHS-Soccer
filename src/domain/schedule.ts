/**
 * Fixture dates, and which match is next.
 *
 * Extracted from public/js/utils.js during the Vue migration (Phase 0). The
 * behaviour is unchanged; the data arrives as parameters instead of through
 * `this.data`.
 */

export type ScheduleState = 'upcoming' | 'empty' | 'complete' | 'stale';
export interface Countdown { days: string; hours: string; mins: string }

/**
 * A match stays "next" for a few hours after kickoff, so the site does not
 * flip to the following fixture while the game is still being played.
 */
const GRACE_MS = 3 * 60 * 60 * 1000;

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
};

export function parseMatchDateTime(dateStr: string, timeStr?: string): Date | null {
  if (!dateStr) return null;
  const combined = `${dateStr} ${timeStr || ''}`.trim();
  const parsed = new Date(combined);
  if (!isNaN(parsed.getTime())) return parsed;

  try {
    const parts = dateStr.replace(/,/g, '').split(/\s+/);
    if (parts.length >= 3) {
      const monthIndex = MONTHS[parts[0].substring(0, 3).toUpperCase()];
      const day = parseInt(parts[1]);
      const year = parseInt(parts[2]);

      let hours = 18, minutes = 0;
      if (timeStr) {
        const timeMatch = timeStr.match(/(\d+):?(\d+)?\s*(AM|PM)?/i);
        if (timeMatch) {
          hours = parseInt(timeMatch[1]);
          minutes = parseInt(timeMatch[2] || '0');
          const ampm = (timeMatch[3] || '').toUpperCase();
          if (ampm === 'PM' && hours < 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;
        }
      }
      if (monthIndex !== undefined && !isNaN(day) && !isNaN(year)) {
        return new Date(year, monthIndex, day, hours, minutes);
      }
    }
  } catch (e) { /* fall through to null */ }
  return null;
}

/**
 * When a fixture happens, as a Date.
 *
 * Prefers match_on/kickoff_time, which a database trigger derives from the
 * text columns (migration 0008) and which are therefore already normalised.
 * Falls back to parsing the free text, so the app still works against a
 * database where 0008 has not been applied.
 */
export function matchDateTime(m: any): Date | null {
  if (!m) return null;
  if (m.matchOn) {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(m.matchOn));
    if (d) {
      // Split rather than new Date(iso): a bare ISO date parses as UTC and
      // lands on the previous evening west of Greenwich, which would show
      // the wrong day for every fixture.
      const t = /^(\d{2}):(\d{2})/.exec(String(m.kickoffTime || ''));
      return new Date(
        Number(d[1]), Number(d[2]) - 1, Number(d[3]),
        t ? Number(t[1]) : 18, t ? Number(t[2]) : 0
      );
    }
  }
  return parseMatchDateTime(m.date, m.time);
}

/**
 * The next match by DATE, not by row order.
 *
 * This used to be `schedule.find(m => m.status !== 'COMPLETED')`, which
 * returns whichever row happens to sit first in the array. fetchSchedule
 * orders by created_at, so that was really "the fixture typed in first" --
 * and match_date is a TEXT column, so even ordering by it would put SEP 11
 * before SEP 4. A match that had already been played but never marked
 * COMPLETED stayed pinned as "next" forever, with the countdown reading
 * 00/00/00 because its target was in the past.
 */
export function getNextMatch(schedule: any[], now: number = Date.now()): any | null {
  const upcoming = upcomingMatches(schedule, now);
  if (upcoming.length) return upcoming[0];

  // Nothing we could read is still ahead. A row whose date would not parse
  // might be, so it beats announcing the season is over on a parse failure.
  const undated = (schedule || []).filter(m => m && m.status !== 'COMPLETED' && !matchDateTime(m));
  return undated.length ? undated[0] : null;
}

/**
 * Every fixture still ahead, soonest first.
 *
 * The rule getNextMatch uses -- not completed, dated, and still inside the
 * grace period after kick-off -- so "next match" and "coming up" cannot
 * disagree: getNextMatch is this list's first entry. Undated rows are not
 * listed; getNextMatch falls back to one only when nothing dated remains.
 */
export function upcomingMatches(schedule: any[], now: number = Date.now()): any[] {
  return (schedule || [])
    .filter(m => m && m.status !== 'COMPLETED')
    .map(m => ({ m, t: matchDateTime(m) }))
    .filter((x): x is { m: any; t: Date } => !!x.t && x.t.getTime() + GRACE_MS > now)
    .sort((a, b) => a.t.getTime() - b.t.getTime())
    .map(x => x.m);
}

/**
 * Why there is no next match, when there isn't one.
 *
 * The home page used to have two states -- a fixture, or "SEASON COMPLETE" --
 * so every other reason read as the season being over. At the start of a
 * season, with one past friendly on the books and the rest of the fixtures
 * not yet entered, that is precisely backwards.
 */
export function scheduleState(schedule: any[], now: number = Date.now()): ScheduleState {
  const rows = (schedule || []).filter(m => m);
  if (getNextMatch(rows, now)) return 'upcoming';
  if (rows.length === 0) return 'empty';
  // Every fixture on record has been played AND written up.
  if (rows.every(m => m.status === 'COMPLETED')) return 'complete';
  // Fixtures exist and are in the past, but were never marked COMPLETED.
  // The season is not over; the schedule has just run out.
  return 'stale';
}

/** The most recent match already played, for the 'stale' message. */
export function lastPlayedMatch(schedule: any[]): any | null {
  const dated = (schedule || [])
    .filter(m => m)
    .map(m => ({ m, t: matchDateTime(m) }))
    .filter(x => x.t)
    .sort((a, b) => (b.t as Date).getTime() - (a.t as Date).getTime());
  return dated.length ? dated[0].m : null;
}

export function nextMatchCountdown(schedule: any[], now: Date = new Date()): Countdown | null {
  const nextMatch = getNextMatch(schedule, now.getTime());
  if (!nextMatch) return null;

  const targetDate = parseMatchDateTime(nextMatch.date, nextMatch.time);
  if (!targetDate) return null;

  const diffMs = targetDate.getTime() - now.getTime();
  if (diffMs <= 0) return { days: '00', hours: '00', mins: '00' };

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / (3600 * 24));
  const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);

  return {
    days: String(days).padStart(2, '0'),
    hours: String(hours).padStart(2, '0'),
    mins: String(mins).padStart(2, '0')
  };
}

/**
 * The countdown as one figure: "3d 04h", "04h 12m" inside a day, "12m"
 * inside an hour. The canvas shows a single figure beside the kick-off time
 * rather than three boxes, because a parent glancing at a phone wants one
 * number.
 */
export function shortCountdown(c: Countdown | null): string {
  if (!c) return '';
  const days = Number(c.days) || 0;
  const hours = Number(c.hours) || 0;
  const mins = Number(c.mins) || 0;
  const two = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${two(hours)}h`;
  if (hours > 0) return `${two(hours)}h ${two(mins)}m`;
  return `${mins}m`;
}

export interface LongCountdown {
  /** The figures and their units, largest first: "88" "days", "21" "hrs". */
  parts: { value: string; unit: string }[];
  /** The whole countdown as a sentence, for a screen reader. */
  spoken: string;
  /** Kick-off has passed but the match is still the next one. */
  underway: boolean;
}

/**
 * The countdown as the home page band sets it (spec
 * 2026-09-10-home-hero-design.md §4.4).
 *
 * Two figures at most, as the short countdown: days and hours, hours and
 * minutes inside a day, or minutes inside an hour. Units are words, because
 * the band sets the figures large and a lone "d" beside them reads as a
 * typo; singular at one.
 */
export function longCountdown(c: Countdown | null): LongCountdown | null {
  if (!c) return null;
  const days = Number(c.days) || 0;
  const hours = Number(c.hours) || 0;
  const mins = Number(c.mins) || 0;

  if (days === 0 && hours === 0 && mins === 0) {
    return { parts: [], spoken: 'Under way', underway: true };
  }

  const said = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  if (days > 0) {
    return {
      parts: [
        { value: String(days), unit: days === 1 ? 'day' : 'days' },
        { value: String(hours), unit: hours === 1 ? 'hr' : 'hrs' }
      ],
      spoken: `${said(days, 'day', 'days')} and ${said(hours, 'hour', 'hours')} until kick-off`,
      underway: false
    };
  }
  if (hours > 0) {
    return {
      parts: [
        { value: String(hours), unit: hours === 1 ? 'hr' : 'hrs' },
        { value: String(mins), unit: 'min' }
      ],
      spoken: `${said(hours, 'hour', 'hours')} and ${said(mins, 'minute', 'minutes')} until kick-off`,
      underway: false
    };
  }
  return {
    parts: [{ value: String(mins), unit: 'min' }],
    spoken: `${said(mins, 'minute', 'minutes')} until kick-off`,
    underway: false
  };
}

/**
 * The most recent completed fixture, or null.
 *
 * Not `lastPlayedMatch`: that is the latest fixture on the calendar, which
 * includes next week's, and is what the "stale schedule" state wants. A
 * result is only ever a completed fixture.
 */
export function lastCompletedMatch(schedule: any[]): any | null {
  const done = (schedule || [])
    .filter(m => m && m.status === 'COMPLETED')
    .map(m => ({ m, t: matchDateTime(m) }))
    .filter(x => x.t)
    .sort((a, b) => (b.t as Date).getTime() - (a.t as Date).getTime());
  return done.length ? done[0].m : null;
}
