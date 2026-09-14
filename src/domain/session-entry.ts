/**
 * The session grid's state, without a DOM.
 *
 * The legacy grid keeps what has been typed in the inputs themselves and
 * reads it back with `getElementById` — which is why sorting mid-entry has to
 * capture drafts before re-rendering, and why `captureBandDrafts` carries a
 * warning that calling it after a state change silently undoes an added row.
 * None of that is needed here: the state is the state.
 *
 * What remains is the parts that are actually decisions — what a fresh row
 * starts on, what typing does to it, and how a grid becomes the payload
 * `saveMatrixSession` takes.
 *
 * Extracted from public/js/views/matrix-session.view.js during Phase 3b.
 */
import { parseTimeToSeconds, formatSecondsAsTime } from './time';
import { defaultSessionAttendance } from './matrix-session';

export type Attendance = 'present' | 'excused' | 'unexcused';

export interface EntryRow {
  playerId: string;
  attendance: Attendance;
  /** As typed. Parsed on the way out, not on every keystroke. */
  value: string;
  outcome: string;
}

export interface SessionResult {
  playerId: string;
  attendance: Attendance;
  rawValue: number | null;
  outcome: string | null;
}

/** Supabase rows say is_deleted; app state says isDeleted. */
function live(players: any[]): any[] {
  return (players || []).filter(p => !p?.is_deleted && !p?.isDeleted);
}

/**
 * `time_bands` is typed as mm:ss; every other measure is a plain number.
 *
 * Two things ride on getting this the right way round. `parseFloat("4:30")` is
 * 4, which lands under every standard and hands the player full marks for a
 * time they did not run. And `time_low` — a sprint, a shuttle — is entered as
 * DECIMAL SECONDS: 4.85 is four point eight five seconds, not four minutes.
 * `parseTimeToSeconds` refuses that (a single-digit seconds field is
 * ambiguous), so reading it as mm:ss would silently drop every sprint time.
 *
 * The legacy grid draws the same distinction: `time_bands` gets a text box
 * placeholdered "4:30 or 4.30", everything else an `<input type=number>`.
 */
function parseValue(raw: string, measure: string): number | null {
  const typed = String(raw ?? '').trim();
  if (!typed) return null;

  if (measure === 'time_bands') return parseTimeToSeconds(typed);

  const n = parseFloat(typed);
  return Number.isFinite(n) ? n : null;
}

function formatValue(seconds: any, measure: string): string {
  if (seconds === null || seconds === undefined) return '';
  return measure === 'time_bands'
    ? formatSecondsAsTime(seconds)
    : String(Number(seconds));
}

/** A fresh grid for this squad and this measure. */
export function blankEntries(players: any[], measure: string): Record<string, EntryRow> {
  const out: Record<string, EntryRow> = {};
  live(players).forEach(p => {
    out[p.id] = {
      playerId: p.id,
      attendance: defaultSessionAttendance(measure),
      value: '',
      outcome: ''
    };
  });
  return out;
}

/**
 * A saved session, reopened.
 *
 * Built over a blank grid rather than from the stored rows, so a player who
 * joined since gets the measure's default instead of being absent from the
 * screen — and a stored row for somebody no longer on the squad is dropped
 * rather than rendering a row with no name.
 */
export function entriesFromResults(
  players: any[], results: any[], measure: string
): Record<string, EntryRow> {
  const out = blankEntries(players, measure);

  (results || []).forEach(r => {
    const row = out[r?.player_id];
    if (!row) return;
    out[r.player_id] = {
      ...row,
      attendance: (r.attendance as Attendance) || row.attendance,
      value: formatValue(r.raw_value, measure),
      outcome: r.outcome || ''
    };
  });

  return out;
}

/**
 * What typing into a value does to the row's attendance.
 *
 * A recorded time is evidence of attendance and outranks whatever the
 * dropdown said, so this is unconditional on the way in. Clearing it returns
 * the row to the measure's default, so a mistyped entry deleted again does
 * not leave somebody marked present with nothing recorded against them.
 */
export function attendanceAfterInput(value: string, measure: string): Attendance {
  return String(value ?? '').trim() !== ''
    ? 'present'
    : defaultSessionAttendance(measure);
}

/** The grid, as the payload `saveMatrixSession` takes. */
export function toSessionResults(
  players: any[], entries: Record<string, EntryRow>, measure: string
): SessionResult[] {
  return live(players).map(p => {
    const row = entries?.[p.id];
    const attendance: Attendance = row?.attendance || 'present';

    // Not there: whatever is still in the boxes is not a result.
    if (attendance !== 'present') {
      return { playerId: p.id, attendance, rawValue: null, outcome: null };
    }

    if (measure === 'win_loss') {
      return { playerId: p.id, attendance, rawValue: null, outcome: row?.outcome || null };
    }

    return {
      playerId: p.id,
      attendance,
      rawValue: parseValue(row?.value || '', measure),
      outcome: null
    };
  });
}

/**
 * Who is marked present with nothing recorded against them.
 *
 * `saveMatrixSession` refuses this save as well, and is the real guard — but
 * its message names a player by uuid, which is no use to a coach looking at
 * twenty-five rows. This is so the screen can say who.
 */
export function presentWithoutResult(
  players: any[], entries: Record<string, EntryRow>, measure: string
): any[] {
  const byId = new Map(
    toSessionResults(players, entries, measure).map(r => [r.playerId, r]));

  return live(players).filter(p => {
    const r = byId.get(p.id);
    if (!r || r.attendance !== 'present') return false;
    return r.rawValue === null && !r.outcome;
  });
}

/**
 * What the date box opens on.
 *
 * A recorded session shows its own date, and a new one shows today. Neither
 * used to happen: the box started empty and nothing filled it, so a coach who
 * entered twenty-five results and pressed Save was refused with "Pick the
 * date this session happened" -- at the foot of a sheet they had scrolled
 * past, which reads as the button doing nothing.
 *
 * The stored date wins for a reason beyond convenience. Reopening a session
 * to a blank box means the coach retypes it, and typing today MOVES the
 * session: every result in it is re-attributed to a day it did not happen on,
 * and `not_entered` then charges whoever joined the squad in between.
 *
 * Local time, not `toISOString()`, which is UTC -- an evening session west of
 * Greenwich would open on tomorrow, the one date a coach never means.
 */
export function startingSessionDate(stored?: string | null, now: Date = new Date()): string {
  const kept = String(stored ?? '').trim();
  if (kept) return kept;

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Give every player still without a result the same one.
 *
 * A small-sided session is two sides of the same squad, so the fast entry is
 * one press for the whole sheet and then a flip of the side that won —
 * twenty-five dropdowns is exactly the paper-beats-screen problem the grid
 * exists to solve.
 *
 * It fills BLANKS only. A result the coach has already chosen is theirs, so a
 * press late in entry cannot wipe the rows already done; re-setting a sheet
 * means changing those rows by hand, which is the trade that keeps the button
 * safe to press.
 *
 * A player who is not marked `present` is left entirely alone — filling an
 * absent row would credit them for a game they did not play, and (since an
 * outcome implies attendance) quietly mark them there.
 */
export function fillBlankOutcomes(
  entries: Record<string, EntryRow>, outcome: string
): Record<string, EntryRow> {
  const out: Record<string, EntryRow> = {};
  Object.keys(entries || {}).forEach(id => {
    const row = entries[id];
    out[id] = row.attendance === 'present' && !row.outcome
      ? { ...row, outcome }
      : row;
  });
  return out;
}

/**
 * Empty the Result column, and nothing else.
 *
 * Attendance is left exactly as it was: who was there is a separate fact from
 * how their side did, and returning every row to the measure's default would
 * quietly undo absences the coach has already marked.
 */
export function clearOutcomes(entries: Record<string, EntryRow>): Record<string, EntryRow> {
  const out: Record<string, EntryRow> = {};
  Object.keys(entries || {}).forEach(id => {
    const row = entries[id];
    out[id] = row.outcome ? { ...row, outcome: '' } : row;
  });
  return out;
}
