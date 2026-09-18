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
import { roleOfPosition } from './position';
import { parseGoalScore, formatGoalScore } from './goal-score';

/**
 * `dnp` is "did not play": there, but did not do the exercise. It costs what
 * a no-show costs -- 0 of the weight, since they did not do it -- and is kept
 * apart from one so a breakdown does not accuse them of missing practice.
 */
export type Attendance = 'present' | 'excused' | 'unexcused' | 'dnp';

export interface EntryRow {
  playerId: string;
  attendance: Attendance;
  /** As typed. Parsed on the way out, not on every keystroke. For role_goals, the score: "3-1". */
  value: string;
  outcome: string;
  /**
   * Goals by role only: 'attack' | 'defend' | 'keeper', or '' for none chosen.
   * Absent for every other measure, so their rows are unchanged.
   */
  role?: string;
}

export interface SessionResult {
  playerId: string;
  attendance: Attendance;
  rawValue: number | null;
  outcome: string | null;
  role?: string | null;
  goalsFor?: number | null;
  goalsAgainst?: number | null;
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
    const row: EntryRow = {
      playerId: p.id,
      attendance: defaultSessionAttendance(measure),
      value: '',
      outcome: ''
    };
    // Pre-filled from the roster position number and changeable for this
    // session only; nothing is written back to the roster.
    if (measure === 'role_goals') row.role = roleOfPosition(p.position) || '';
    out[p.id] = row;
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
    out[r.player_id] = measure === 'role_goals'
      ? {
          ...row,
          attendance: (r.attendance as Attendance) || row.attendance,
          // The role stored with the result, not the roster's current one: a
          // player who defended in that session defended, whatever the roster
          // says now. An absence stored no role, so the roster's stands.
          role: r.role || row.role,
          value: r.goals_for != null && r.goals_against != null
            ? formatGoalScore({ scored: Number(r.goals_for), conceded: Number(r.goals_against) })
            : '',
          outcome: ''
        }
      : {
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

    if (measure === 'role_goals') {
      if (attendance !== 'present') {
        return { playerId: p.id, attendance, rawValue: null, outcome: null, role: null, goalsFor: null, goalsAgainst: null };
      }
      const score = parseGoalScore(row?.value || '');
      return {
        playerId: p.id, attendance, rawValue: null, outcome: null,
        role: row?.role || null,
        goalsFor: score ? score.scored : null,
        goalsAgainst: score ? score.conceded : null
      };
    }

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
    // A Goals-by-role row needs both: the database scores neither half alone.
    if (measure === 'role_goals') return !r.role || r.goalsFor == null || r.goalsAgainst == null;
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

export interface OutcomeLists {
  win: string;
  draw: string;
  loss: string;
}

// What the boxes are called on screen and on the printed form. The stored
// value stays 'draw'; only the word a coach reads is 'Tie'.
const LIST_NAMES: Record<keyof OutcomeLists, string> = { win: 'Won', draw: 'Tie', loss: 'Lost' };

/**
 * Set a small-sided sheet from three lists of recording numbers.
 *
 * The paper sheet already says "won: 17, 21, 11, 19", so typing that once
 * beats finding each row. RECORDING numbers, the ones on those sheets and in
 * the grid's # column -- not shirt numbers.
 *
 * Unlike `fillBlankOutcomes`, a listed player's result is REPLACED: naming the
 * number is the coach's choice for that player, and it marks them here, as
 * picking the result in the row does. Anyone not listed is left exactly as
 * they were, so the lists and the row dropdowns can be mixed freely.
 *
 * All or nothing. Anything unreadable, a number in two lists, or a number
 * nobody on the sheet has is refused before a single row changes -- half a
 * sheet applied is harder to notice than a sentence saying why nothing was.
 */
export function applyOutcomeLists(
  players: any[], entries: Record<string, EntryRow>, lists: OutcomeLists
): { ok: true; entries: Record<string, EntryRow>; applied: number } | { ok: false; error: string } {
  const byNumber = new Map<number, any>();
  live(players).forEach(p => {
    if (p.recordingNumber === null || p.recordingNumber === undefined || p.recordingNumber === '') return;
    const n = Number(p.recordingNumber);
    if (Number.isFinite(n)) byNumber.set(n, p);
  });

  const wanted = new Map<number, keyof OutcomeLists>();
  for (const outcome of ['win', 'draw', 'loss'] as const) {
    const tokens = String(lists?.[outcome] ?? '').split(/[\s,]+/).filter(Boolean);
    for (const token of tokens) {
      if (!/^\d+$/.test(token)) return { ok: false, error: `"${token}" is not a recording number.` };
      const n = Number(token);
      const earlier = wanted.get(n);
      if (earlier && earlier !== outcome) {
        return { ok: false, error: `${n} is in both ${LIST_NAMES[earlier]} and ${LIST_NAMES[outcome]}.` };
      }
      wanted.set(n, outcome);
    }
  }

  for (const n of wanted.keys()) {
    if (!byNumber.has(n)) return { ok: false, error: `No player with recording number ${n}.` };
  }

  if (wanted.size === 0) return { ok: true, entries, applied: 0 };

  const out: Record<string, EntryRow> = { ...entries };
  wanted.forEach((outcome, n) => {
    const p = byNumber.get(n);
    const row = out[p.id] || { playerId: p.id, attendance: 'present', value: '', outcome: '' };
    out[p.id] = { ...row, outcome, attendance: 'present' };
  });
  return { ok: true, entries: out, applied: wanted.size };
}
