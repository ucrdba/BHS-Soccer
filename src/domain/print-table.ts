/**
 * Printed tables, as a document the browser's own print dialog can take.
 *
 * Shared by the exercise export, the board export and the squad report, which
 * print the same thing in the same house style: a title, who it is for, the
 * date, an optional note explaining a column, and the rows exactly as the
 * coach sorted them.
 *
 * Printing follows `plan-print.ts`: rendered HTML handed to the print dialog,
 * where "Save as PDF" is one of the destinations. No PDF library, for the
 * reason that module gives -- a dependency for a worse result.
 *
 * Which columns are text rather than figures is the caller's business: only it
 * knows that "W-D-L" reads as words and "Pts" as a number.
 */
import { escapeHtml } from './plan-print';

export interface PrintTableOptions {
  /** The heading, and the document title. */
  title: string;
  /** Organization and team, already in the order they should read. */
  where: string[];
  /** Columns that are text, so they are left-aligned rather than right. */
  textual: Set<string>;
  /** One object per row, keys in column order. */
  rows: Record<string, any>[];
  /** An optional paragraph under the date, as HTML the caller controls. */
  note?: string;
}

export interface PrintSection {
  /** The exercise's name, as its own heading. */
  heading: string;
  /** An optional line under the heading: the standard, and who is short of it. */
  note?: string;
  /**
   * Optional HTML between the note and the table -- ruled lines for a
   * hand-written result, say. The caller controls it, as with `note`.
   */
  preamble?: string;
  textual: Set<string>;
  /**
   * Columns whose values are markup the caller built -- the squad report's
   * progress graphs. Everything else is escaped; nothing typed by a coach
   * belongs in one of these.
   */
  markup?: Set<string>;
  rows: Record<string, any>[];
}

function cell(v: any, numeric: boolean, raw = false): string {
  return `<td${numeric ? ' class="n"' : ''}>${raw ? String(v ?? '') : escapeHtml(v)}</td>`;
}

/** One table, head and body, for rows whose keys are the columns. */
function table(
  rows: Record<string, any>[], textual: Set<string>, markup: Set<string> = new Set()
): string {
  const columns = Object.keys(rows[0]);
  const head = columns
    .map(c => `<th${textual.has(c) ? '' : ' class="n"'}>${escapeHtml(c)}</th>`)
    .join('');
  const body = rows
    .map(r => `<tr>${columns.map(c => cell(r[c], !textual.has(c), markup.has(c))).join('')}</tr>`)
    .join('');
  return `<table>
<thead><tr>${head}</tr></thead>
<tbody>${body}</tbody>
</table>`;
}

const STYLE = `
  @page { margin: 16mm; }
  body { font-family: Georgia, "Times New Roman", serif; color: #201f1d; margin: 0; }
  h1 { font-size: 22pt; margin: 0 0 2mm; font-weight: 500; }
  h2 { font-size: 13pt; font-weight: 500; margin: 0 0 1mm; }
  .where { margin: 0; color: #605d5d; font-size: 10pt; }
  .when { margin: 1mm 0 6mm; color: #605d5d; font-size: 9pt; }
  .note { margin: 0 0 6mm; font-size: 9pt; color: #605d5d; line-height: 1.5; max-width: 60em; }
  .secnote { margin: 0 0 2mm; font-size: 9pt; color: #605d5d; }
  .sec { margin-bottom: 8mm; }
  /* One sheet per section, for forms a coach carries page by page. */
  .sec--page { break-before: page; page-break-before: always; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { padding: 2mm 3mm; border-bottom: 0.4pt solid #b8b5b5; text-align: left; }
  th { font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: #605d5d; }
  .n { text-align: right; font-variant-numeric: tabular-nums; }
  /* A long squad breaks across pages; the head repeats so the second page is
     readable on its own. */
  thead { display: table-header-group; }
  tr { break-inside: avoid; }`;

/** The page around one or more tables. */
function page(
  title: string, where: string[], note: string | undefined, body: string,
  extraStyle = '', showTitle = true, topLine?: string
): string {
  // The day it was printed, which is what dates a report. A blank form says
  // "Date: ____" instead: the sheet is filled in on the day, not printed on it.
  const when = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const who = (where || []).filter(Boolean).map(escapeHtml).join(' · ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${STYLE}${extraStyle}
</style>
</head>
<body>
${showTitle ? `<h1>${escapeHtml(title)}</h1>` : ''}
<p class="where">${who}</p>
${topLine || `<p class="when">${escapeHtml(when)}</p>`}
${note || ''}
${body}
</body>
</html>`;
}

/** One table's document, or null when there is nothing to print. */
export function printTableDocument(options: PrintTableOptions): string | null {
  const rows = options?.rows || [];
  if (rows.length === 0) return null;
  return page(options.title, options.where, options.note,
              table(rows, options.textual || new Set<string>()));
}

/**
 * Several titled tables in one document -- the squad report, which is one
 * table per exercise and whose columns differ by measure.
 *
 * A section with no rows is dropped rather than printing a heading over an
 * empty table.
 */
export function printSectionsDocument(options: {
  title: string;
  where: string[];
  note?: string;
  sections: PrintSection[];
  /** Start each section after the first on a fresh page. */
  pageBreaks?: boolean;
  /** Extra CSS a caller's preamble needs. */
  style?: string;
  /**
   * Print the title above the tables. Off for forms, where each sheet already
   * names its exercise and the page is wanted for rows.
   */
  showTitle?: boolean;
  /** Replaces the printed-on date under the names -- a blank to fill in, say. */
  topLine?: string;
}): string | null {
  const sections = (options.sections || []).filter(s => (s.rows || []).length > 0);
  if (sections.length === 0) return null;

  const body = sections.map((s, i) => `<section class="sec${options.pageBreaks && i > 0 ? ' sec--page' : ''}">
<h2>${escapeHtml(s.heading)}</h2>
${s.note ? `<p class="secnote">${escapeHtml(s.note)}</p>` : ''}
${s.preamble || ''}
${table(s.rows, s.textual || new Set<string>(), s.markup)}
</section>`).join('\n');

  return page(options.title, options.where, options.note, body, options.style || '',
              options.showTitle !== false, options.topLine);
}
