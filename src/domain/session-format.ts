/**
 * What the session grid states about its units, and what it counts.
 *
 * The unit banner exists because the two time measures are plausible-looking
 * numbers in each other's format: `time_bands` takes `4:30`, four minutes
 * thirty, and `time_low` takes `4.85`, decimal seconds. A coach who enters
 * one in the other's shape gets a result that is wrong and does not look
 * wrong, so the screen names the unit rather than relying on them to
 * remember which exercise is which.
 *
 * The parsing itself is `domain/session-entry.ts`; this only says what to
 * expect and counts what has arrived.
 */
import type { EntryRow } from './session-entry';

export interface EntryFormat {
  /** The unit as a figure, shown large. */
  figure: string;
  /** One sentence naming the unit and an example. */
  note: string;
}

const FORMATS: Record<string, EntryFormat> = {
  time_bands: {
    figure: 'm:ss',
    note: 'Minutes and seconds — 10:41. This exercise is banded, not a sprint.'
  },
  time_low: {
    figure: '0.00',
    note: 'Decimal seconds — 4.85. A colon is refused here, not silently read as a time.'
  },
  count_high: {
    figure: 'count',
    note: 'Repetitions — whole numbers.'
  }
};

/** The banner for a measure, or null when its field is chosen rather than typed. */
export function entryFormat(measure: string): EntryFormat | null {
  return FORMATS[measure] || null;
}

export interface EntryTally {
  /** Players with a recorded result. */
  timed: number;
  /** Players marked out of the session. */
  absent: number;
  /** Players still to account for. Never negative. */
  remaining: number;
}

function recorded(row: EntryRow | undefined, measure: string): boolean {
  if (!row) return false;
  if (measure === 'win_loss' || measure === 'head_to_head') return !!row.outcome;
  return !!(row.value && String(row.value).trim());
}

export function entryTally(
  players: any[], entries: Record<string, EntryRow>, measure: string
): EntryTally {
  const squad = players || [];
  const rows = entries || {};

  let timed = 0;
  let absent = 0;

  for (const p of squad) {
    const row = rows[p?.id];
    if (recorded(row, measure)) { timed += 1; continue; }
    if (row && row.attendance !== 'present') absent += 1;
  }

  return { timed, absent, remaining: Math.max(0, squad.length - timed - absent) };
}
