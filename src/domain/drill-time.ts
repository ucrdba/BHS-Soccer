/**
 * The start / end / duration arithmetic behind a drill's slot.
 *
 * Three-way, and that is the difficulty: a start and an end give the
 * duration, a start and a duration give the end, and either edit has to leave
 * the third field agreeing with the other two. A form where the duration says
 * 20 min and the times say fifteen prints a plan a coach cannot run against a
 * watch.
 *
 * Times move between two representations on purpose. A `<input type="time">`
 * holds 24-hour `HH:MM` and nothing else, while the stored slot is the
 * twelve-hour text the printed plan is read in.
 *
 * Extracted from public/js/views/planner.view.js during Phase 4.
 */
import { format24hTo12h, format12hTo24h } from './schedule-view';
import { durationMinutes, type PlanItem } from './practice-plan';

/** What a session is actually built from. "Custom" is the form's own. */
export const DURATION_PRESETS = [
  '5 min', '10 min', '15 min', '20 min', '25 min', '30 min', '45 min', '60 min'
];

const DEFAULT_START = '16:00';
const DAY = 24 * 60;

/** "16:20" → 980. Null when it is not a time. */
function minutesOf(hhmm: string): number | null {
  const parts = String(hhmm ?? '').split(':');
  if (parts.length < 2) return null;

  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** 980 → "16:20", the only shape a time input accepts. */
function hhmm(total: number): string {
  const wrapped = ((total % DAY) + DAY) % DAY;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

export interface Slot {
  /** The stored, printable text: "4:00 PM - 4:20 PM". */
  slot: string;
  duration: string;
  minutes: number;
}

/**
 * The slot two times describe.
 *
 * An end before the start is the next day rather than a drill of minus
 * twenty-three hours — a session running past midnight is unusual but a
 * negative duration is wrong.
 */
export function slotFromRange(start: string, end: string): Slot | null {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === null || e === null) return null;

  const minutes = (e < s ? e + DAY : e) - s;
  return {
    slot: `${format24hTo12h(start)} - ${format24hTo12h(end)}`,
    duration: `${minutes} min`,
    minutes
  };
}

/** Where a drill ends, given where it starts and how long it runs. */
export function endFromDuration(start: string, duration: any): string | null {
  const s = minutesOf(start);
  const mins = durationMinutes(duration);
  if (s === null || mins === null) return null;
  return hhmm(s + mins);
}

/**
 * Where the next drill should start.
 *
 * At the end of the last one: a coach adding a drill means "and then this",
 * not "at four o'clock". An empty plan starts at 4:00 PM, because practice is
 * after school.
 */
export function nextDrillStart(items: PlanItem[]): string {
  const last = (items || [])[(items || []).length - 1];
  if (!last?.time || !last.time.includes('-')) return DEFAULT_START;

  const parts = last.time.split('-');
  const as24h = format12hTo24h(parts[parts.length - 1].trim());
  return minutesOf(as24h) === null ? DEFAULT_START : as24h;
}
