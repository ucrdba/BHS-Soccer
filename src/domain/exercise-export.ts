/**
 * One exercise's leaderboard, taken off the screen.
 *
 * A coach reads the board sorted the way the question needs — fastest first to
 * pick a squad, slowest first to plan a session — and then wants that, printed
 * or in a spreadsheet. So both exports take the rows they are given, in the
 * order they are given them, and never re-sort. The sort already happened on
 * screen and is the coach's answer, not a detail to normalise away.
 *
 * Printing follows `plan-print.ts`: a rendered HTML document handed to the
 * browser's own print dialog, where "Save as PDF" is one of the destinations.
 * No PDF library, for the reason that module already gives — it would be a
 * dependency for a worse result.
 */
import { formatSecondsAsTime } from './time';
import { escapeHtml } from './plan-print';
import { bandStanding, isThresholdMeasure } from './matrix-threshold';

export interface ExerciseExportOptions {
  exercise: string;
  measure: string;
  organization: string;
  team?: string;
  /** Leaderboard rows, already in the order the coach sorted them. */
  rows: any[];
}

const isWinLoss = (m: string) => m === 'win_loss' || m === 'head_to_head';

/** A figure phrased for the exercise it was measured in, or a dash. */
function figure(row: any, value: any): string {
  if (value === null || value === undefined) return '—';
  return row.timed ? formatSecondsAsTime(Math.round(value)) : String(value);
}

/** The verdict, in the words the screen uses. */
function verdict(row: any): string {
  const s = bandStanding(row);
  if (s === 'met') return 'met';
  if (s === 'below') return 'below';
  if (s === 'missed') return 'no band';
  return 'no runs';
}

/**
 * How many runs cleared the bar, where that adds something.
 *
 * A player who cleared every run he made needs no ratio — the verdict already
 * says it — and one who never ran has no runs to count.
 */
function runs(row: any): string {
  const met = Number(row?.metRuns) || 0;
  const short = Number(row?.shortRuns) || 0;
  const total = met + short;
  return total === 0 || short === 0 ? '' : `${met} of ${total}`;
}

/**
 * The rows as a spreadsheet, one object per player, keys in column order.
 *
 * Times are written as times. A sheet full of raw seconds is not the sheet the
 * coach was reading, and 269 does not mean anything to the person it is handed
 * to.
 */
export function exerciseSheet(options: ExerciseExportOptions): Record<string, any>[] {
  const rows = options?.rows || [];
  if (rows.length === 0) return [];

  const winLoss = isWinLoss(options.measure);
  const threshold = isThresholdMeasure(options.measure);

  return rows.map(r => {
    const out: Record<string, any> = {
      '#': r.recordingNumber == null ? '' : r.recordingNumber,
      Player: r.name
    };

    if (winLoss) {
      out['W-D-L'] = `${r.wins || 0} - ${r.draws || 0} - ${r.losses || 0}`;
    } else {
      out['Best time'] = figure(r, r.best);
      out.Average = figure(r, r.avg);
    }

    out.Points = Number(r.earned ?? 0).toFixed(2);
    out.Of = Number(r.available ?? 0).toFixed(2);

    // Only where the measure is a standard. A competitive exercise has no
    // verdict to report, and an empty column would imply it failed to load.
    if (threshold) {
      out.Standard = verdict(r);
      out.Runs = runs(r);
    }

    return out;
  });
}

function cell(v: any, numeric: boolean): string {
  return `<td${numeric ? ' class="n"' : ''}>${escapeHtml(v)}</td>`;
}

/**
 * The printable document, or null when there is nothing to print.
 *
 * Self-contained on purpose: off screen there is no summary box to explain
 * what the standard column means, so the sheet says it.
 */
export function buildExercisePrintDocument(options: ExerciseExportOptions): string | null {
  const sheet = exerciseSheet(options);
  if (sheet.length === 0) return null;

  const columns = Object.keys(sheet[0]);
  const textual = new Set(['Player', 'Standard', 'Runs', 'W-D-L']);

  const head = columns
    .map(c => `<th${textual.has(c) ? '' : ' class="n"'}>${escapeHtml(c)}</th>`)
    .join('');
  const body = sheet
    .map(r => `<tr>${columns.map(c => cell(r[c], !textual.has(c))).join('')}</tr>`)
    .join('');

  const when = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const standardNote = isThresholdMeasure(options.measure)
    ? `<p class="note">A match-readiness standard, not a ranking. A player meets it
       once his fastest run clears the bar; “runs” says how many of his runs did.
       “No runs” means the exercise has not been attempted.</p>`
    : '';

  const where = [options.organization, options.team].filter(Boolean).map(escapeHtml).join(' · ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(options.exercise)}</title>
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
<h1>${escapeHtml(options.exercise)}</h1>
<p class="where">${where}</p>
<p class="when">${escapeHtml(when)}</p>
${standardNote}
<table>
<thead><tr>${head}</tr></thead>
<tbody>${body}</tbody>
</table>
</body>
</html>`;
}
