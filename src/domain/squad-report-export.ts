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

export interface SquadReportExportOptions {
  organization: string;
  team?: string;
  /** The report's sections, as the screen has them. */
  rows: any[];
}

const TITLE = 'Squad report';

/** Columns that read as words rather than figures. */
const TEXTUAL = new Set(['Player', 'Best', 'Standard', 'Short', 'W-D-L']);

/**
 * Excel refuses : \ / ? * [ ] in a sheet name and caps it at 31 characters, so
 * an exercise called "3-430 / laps" would throw rather than save.
 */
function sheetName(name: string): string {
  return String(name || 'Exercise').replace(/[:\\/?*\[\]]/g, '-').slice(0, 31) || 'Exercise';
}

const figure = (row: any, value: any): string =>
  value === null || value === undefined ? '—' : (row.timed ? formatSecondsAsTime(value) : String(value));

/** One sheet's rows for one exercise, with the columns that measure needs. */
function sheetRows(row: any): Record<string, any>[] {
  return (row.entries || []).map((e: any) => {
    if (row.outcomes) {
      return { Player: e.player?.name, Games: e.attempts, 'W-D-L': e.record ?? '—' };
    }
    const out: Record<string, any> = {
      Player: e.player?.name,
      Attempts: e.attempts,
      Best: figure(row, e.best)
    };
    // Only where the squad has a standard. A column of blanks would read as a
    // standard that failed to load rather than one that was never set.
    if (row.standard !== null && row.standard !== undefined) {
      out.Standard = figure(row, row.standard);
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
    rows: sheetRows(row)
  }));

  return printSectionsDocument({
    title: TITLE,
    where: [options.organization, options.team],
    note: `<p class="note">Every player against every exercise the squad has done, including
       players who have attempted nothing — who has not done an exercise is part of what this
       answers. A standard is a match-readiness mark, not a ranking.</p>`,
    sections
  });
}
