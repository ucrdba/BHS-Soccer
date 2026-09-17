/**
 * One printed table, as a document the browser's own print dialog can take.
 *
 * Shared by the exercise export and the board export, which print the same
 * thing in the same house style: a title, who it is for, the date, an optional
 * note explaining a column, and the rows exactly as the coach sorted them.
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

function cell(v: any, numeric: boolean): string {
  return `<td${numeric ? ' class="n"' : ''}>${escapeHtml(v)}</td>`;
}

/** The whole document, or null when there is nothing to print. */
export function printTableDocument(options: PrintTableOptions): string | null {
  const rows = options?.rows || [];
  if (rows.length === 0) return null;

  const columns = Object.keys(rows[0]);
  const textual = options.textual || new Set<string>();

  const head = columns
    .map(c => `<th${textual.has(c) ? '' : ' class="n"'}>${escapeHtml(c)}</th>`)
    .join('');
  const body = rows
    .map(r => `<tr>${columns.map(c => cell(r[c], !textual.has(c))).join('')}</tr>`)
    .join('');

  const when = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const where = (options.where || []).filter(Boolean).map(escapeHtml).join(' · ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(options.title)}</title>
<style>
  @page { margin: 16mm; }
  body { font-family: Georgia, "Times New Roman", serif; color: #201f1d; margin: 0; }
  h1 { font-size: 22pt; margin: 0 0 2mm; font-weight: 500; }
  .where { margin: 0; color: #605d5d; font-size: 10pt; }
  .when { margin: 1mm 0 6mm; color: #605d5d; font-size: 9pt; }
  .note { margin: 0 0 6mm; font-size: 9pt; color: #605d5d; line-height: 1.5; max-width: 60em; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { padding: 2mm 3mm; border-bottom: 0.4pt solid #b8b5b5; text-align: left; }
  th { font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: #605d5d; }
  .n { text-align: right; font-variant-numeric: tabular-nums; }
  /* A long squad breaks across pages; the head repeats so the second page is
     readable on its own. */
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
</style>
</head>
<body>
<h1>${escapeHtml(options.title)}</h1>
<p class="where">${where}</p>
<p class="when">${escapeHtml(when)}</p>
${options.note || ''}
<table>
<thead><tr>${head}</tr></thead>
<tbody>${body}</tbody>
</table>
</body>
</html>`;
}
