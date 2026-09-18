/**
 * The blank sheets a coach carries to practice.
 *
 * Paper is what the session grid competes with, so a sheet is built to be
 * filled one-handed and typed in afterwards: the roster in RECORDING number
 * order -- the numbers the grid and the Matrix board are read against -- and
 * boxes shaped for the measure.
 *
 * A small-sided game is the exception and deliberately so. There the coach
 * writes "won: 1, 5, 3, 7" along a line rather than circling a result beside
 * twenty-five names, and the session sheet's Won / Tie / Lost boxes take
 * exactly that. The roster still prints underneath, to mark who was absent and
 * to look up a number.
 *
 * 1v1 is left out: the round robin already prints its pairings.
 */
import { formatSecondsAsTime } from './time';
import { roleOfPosition, roleLabel } from './position';
import { printSectionsDocument, type PrintSection } from './print-table';

export interface PracticeFormOptions {
  organization: string;
  team?: string;
  /** One day per sheet set, so a week prints in one press. */
  dates: string[];
  /** The exercises to print, in the order they should appear. */
  drills: any[];
  /** The squad. Sorted here, so a caller cannot print them out of order. */
  players: any[];
  /** Per drill id, the squad's standard in seconds. Only banded drills have one. */
  standards: Record<string, number | null>;
}

const TITLE = 'Practice forms';

/** Three for a figure a player posts more than once in a session; one otherwise. */
const BOXES = 3;

const MEASURE_LABEL: Record<string, string> = {
  time_bands: 'Timed against a standard',
  time_low: 'Timed, fastest wins',
  count_high: 'Counted, high wins',
  win_loss: 'Small-sided (W/D/L)',
  role_goals: 'Goals by role'
};

const BOX_LABEL: Record<string, string> = {
  time_bands: 'Time',
  time_low: 'Seconds',
  count_high: 'Count'
};

/** Columns that read as words rather than figures, so they sit left. */
const TEXTUAL = new Set(['Player', 'Here', 'Usual', 'Role (circle)', 'Score']);

/** The recording number is what the paper sheets carry; unnumbered players sink. */
function squad(players: any[]): any[] {
  return (players || [])
    .filter(p => !p?.is_deleted && !p?.isDeleted)
    .slice()
    .sort((a, b) => {
      const x = a?.recordingNumber, y = b?.recordingNumber;
      if (x == null && y == null) return String(a?.name || '').localeCompare(String(b?.name || ''));
      if (x == null) return 1;
      if (y == null) return -1;
      return Number(x) - Number(y);
    });
}

function formatStandard(seconds: number | null | undefined): string {
  return seconds === null || seconds === undefined ? '' : formatSecondsAsTime(seconds);
}

/** The ruled lines a small-sided result is actually written on. */
function outcomeLines(): string {
  const line = '<div class="rule"></div>';
  return `<div class="lines">
<p class="lines__row"><span class="lines__label">WON</span>${line}${line}</p>
<p class="lines__row"><span class="lines__label">TIE</span>${line}</p>
<p class="lines__row"><span class="lines__label">LOST</span>${line}${line}</p>
<p class="lines__hint">Write recording numbers, e.g. 1, 5, 3, 7, 12, 18, 14</p>
</div>`;
}

function rowsFor(drill: any, players: any[]): Record<string, any>[] {
  const measure = drill?.measure;
  return players.map(p => {
    const base: Record<string, any> = {
      '#': p.recordingNumber == null ? '—' : Number(p.recordingNumber),
      Player: p.name,
      Here: '☐'
    };

    if (measure === 'win_loss') return base;

    if (measure === 'role_goals') {
      const role = roleOfPosition(p.position);
      return {
        ...base,
        Usual: role ? roleLabel(role) : '—',
        'Role (circle)': 'A   D   GK',
        Score: '____ – ____'
      };
    }

    const label = BOX_LABEL[measure] || 'Result';
    for (let i = 1; i <= BOXES; i++) base[`${label} ${i}`] = '';
    return base;
  });
}

function noteFor(drill: any, standards: Record<string, number | null>): string | undefined {
  const measure = drill?.measure;
  const weight = Number(drill?.points);
  const parts: string[] = [];

  if (measure === 'time_bands') {
    const standard = standards?.[drill.id];
    parts.push(standard === null || standard === undefined
      ? 'no standard set for this squad'
      : `standard ${formatStandard(standard)}`);
  }
  if (!MEASURE_LABEL[measure]) parts.push('measure not set — blank boxes');
  if (Number.isFinite(weight)) parts.push(`weight ${weight.toFixed(1)}`);

  return parts.length ? parts.join(' · ') : undefined;
}

/** One printable section per drill: its heading, its note, and the blank rows. */
export function practiceFormSections(options: PracticeFormOptions): PrintSection[] {
  const players = squad(options?.players || []);
  if (players.length === 0) return [];

  return (options?.drills || [])
    // The round robin prints pairings; a per-player sheet would be a second,
    // different answer to the same session.
    .filter(d => d?.measure !== 'head_to_head')
    .map(d => ({
      heading: `${d?.name || 'Exercise'} — ${MEASURE_LABEL[d?.measure] || 'Exercise'}`,
      note: noteFor(d, options.standards || {}),
      preamble: d?.measure === 'win_loss' ? outcomeLines() : undefined,
      textual: TEXTUAL,
      rows: rowsFor(d, players)
    }));
}

/** A date as it reads on a sheet, or the raw text when it is not a date. */
function longDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? String(date)
    : parsed.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Every sheet for every day, or null when there is nothing to print.
 *
 * A day at a time, each sheet carrying its own date, so a week printed in one
 * press cannot be shuffled into the wrong practice.
 */
export function buildPracticeFormsDocument(options: PracticeFormOptions): string | null {
  const dates = (options?.dates || []).filter(Boolean);
  const perDay = practiceFormSections(options);
  if (dates.length === 0 || perDay.length === 0) return null;

  const sections: PrintSection[] = [];
  dates.forEach(date => {
    perDay.forEach(section => {
      sections.push({
        ...section,
        heading: section.heading,
        note: [longDate(date), section.note].filter(Boolean).join(' · ')
      });
    });
  });

  return printSectionsDocument({
    title: TITLE,
    where: [options.organization, options.team],
    // No heading over the sheets: each one names its own exercise, and the
    // space is better spent on rows. The document is still titled, which is
    // what the print dialog and a saved PDF use.
    showTitle: false,
    // Filled in on the day, not stamped with the day it was printed. Each
    // sheet still carries the day it is FOR, under its own heading.
    topLine: '<p class="fill">Date: <span class="fill__rule"></span></p>',
    pageBreaks: true,
    sections,
    style: `
  .lines { margin: 0 0 4mm; }
  .lines__row { display: flex; align-items: flex-end; gap: 3mm; margin: 0 0 3mm; }
  .lines__label { width: 14mm; flex: none; font-size: 9pt; letter-spacing: 0.08em; color: #605d5d; }
  .rule { flex: 1; border-bottom: 0.6pt solid #201f1d; height: 7mm; }
  .lines__hint { margin: 0 0 4mm; font-size: 8.5pt; color: #605d5d; }
  .fill { display: flex; align-items: flex-end; gap: 2mm; margin: 1mm 0 6mm; font-size: 10pt; }
  .fill__rule { width: 70mm; border-bottom: 0.6pt solid #201f1d; height: 5mm; }`
  });
}
