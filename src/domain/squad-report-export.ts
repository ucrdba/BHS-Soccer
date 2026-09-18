/**
 * The squad report, taken off the screen.
 *
 * One sheet per exercise, because the columns differ by measure: a timed one
 * reports a best figure against a standard, a W/D/L one a record. Flattening
 * them into a single sheet would put times and records in the same column.
 *
 * As everywhere else here, the rows arrive in the order the coach sorted them
 * and are never re-sorted.
 */
import { formatSecondsAsTime } from './time';
import { printSectionsDocument, type PrintSection } from './print-table';
import { progressLowerIsBetter } from './progress';
import { sparkline, sparkLabel, sparklineSvg } from './sparkline';

export interface SquadReportExportOptions {
  organization: string;
  team?: string;
  /** The report's sections, as the screen has them. */
  rows: any[];
}

const TITLE = 'Squad report';

/** Columns that read as words rather than figures. */
const TEXTUAL = new Set(['Player', 'Best', 'Avg', 'Progress', 'Standard', 'Short', 'W-D-L']);

/** The graphs are drawn here, not typed by anyone. */
const MARKUP = new Set(['Progress']);

/**
 * Excel refuses : \ / ? * [ ] in a sheet name and caps it at 31 characters, so
 * an exercise called "3-430 / laps" would throw rather than save.
 */
function sheetName(name: string): string {
  return String(name || 'Exercise').replace(/[:\\/?*\[\]]/g, '-').slice(0, 31) || 'Exercise';
}

const figure = (row: any, value: any): string =>
  value === null || value === undefined ? '—' : (row.timed ? formatSecondsAsTime(value) : String(value));

/**
 * One player's graph, or a dash when they have no reading -- they stay in the
 * table either way. Print only: a spreadsheet cell cannot hold one.
 */
function progressCell(row: any, e: any): string {
  const series: number[] = e.progress || [];
  const lower = progressLowerIsBetter(row.drill?.measure) || !!row.timed;
  const drawn = sparkline(series, row.range ?? null, { lowerIsBetter: lower, standard: row.standard });
  if (!drawn) return '—';
  return sparklineSvg(drawn, sparkLabel(series, lower, v => figure(row, v)));
}

/**
 * One exercise's rows, with the columns that measure needs. `printed` is the
 * PDF: it gains the progress graphs and drops the Standard column, which says
 * the same figure on every row and is already in the line under the heading.
 * The spreadsheet keeps it, where a column is what a filter or formula reads.
 */
function sheetRows(row: any, printed = false): Record<string, any>[] {
  return (row.entries || []).map((e: any) => {
    if (row.outcomes) {
      return { Player: e.player?.name, Games: e.attempts, 'W-D-L': e.record ?? '—' };
    }
    const out: Record<string, any> = {
      Player: e.player?.name,
      Attempts: e.attempts,
      Best: figure(row, e.best)
    };
    if (row.timed) out.Avg = figure(row, e.avg);
    if (printed && row.timed) out.Progress = progressCell(row, e);
    // Only where the squad has a standard. A column of blanks would read as a
    // standard that failed to load rather than one that was never set.
    if (row.standard !== null && row.standard !== undefined) {
      if (!printed) out.Standard = figure(row, row.standard);
      out.Short = e.short ? '△ short' : '';
    }
    return out;
  });
}

/** The line under an exercise's heading: its standard, and who is short of it. */
function sectionNote(row: any): string | undefined {
  if (row.standard === null || row.standard === undefined) {
    return row.threshold ? 'no standard set for this squad — not scored' : undefined;
  }
  return `standard ${figure(row, row.standard)} — ${row.shortCount} short of the standard`;
}

export function squadReportSheets(
  options: SquadReportExportOptions
): { name: string; rows: Record<string, any>[] }[] {
  return (options?.rows || []).map(row => ({
    name: sheetName(row.drill?.name),
    rows: sheetRows(row)
  }));
}

/**
 * The printable document, or null when nothing has been recorded.
 *
 * Every exercise in one document, in the order the report shows them, so a
 * coach hands over one sheet rather than one per exercise.
 */
export function buildSquadReportPrintDocument(options: SquadReportExportOptions): string | null {
  const sections: PrintSection[] = (options?.rows || []).map(row => ({
    heading: row.drill?.name || 'Exercise',
    note: sectionNote(row),
    textual: TEXTUAL,
    markup: MARKUP,
    rows: sheetRows(row, true)
  }));

  return printSectionsDocument({
    title: TITLE,
    where: [options.organization, options.team],
    note: `<p class="note">Every player against every exercise the squad has done, including
       players who have attempted nothing — who has not done an exercise is part of what this
       answers. A standard is a match-readiness mark, not a ranking.</p>`,
    // Tables as wide as their contents, not the page: at full width the
    // Player column took the slack and pushed the figures away from the names.
    style: `
  table { width: auto; min-width: 55%; }
  th, td { padding: 2mm 5mm; }`,
    sections
  });
}
