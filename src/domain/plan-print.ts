/**
 * The printed practice plan.
 *
 * A rendered HTML document handed to the browser's own print dialog. No PDF
 * library: that would be a dependency for a worse result, and this already
 * prints correctly.
 *
 * Everything a coach typed — the drill names, the notes, the plan's name, a
 * keyframe's label — is escaped on the way in. A drill called `Rondo <3v1>`
 * would otherwise print as an unclosed tag and take the rest of the page with
 * it.
 *
 * Diagrams arrive already rasterized, keyed by drill name. Turning a stored
 * diagram into a PNG needs a canvas, which this module deliberately does not
 * touch — see `src/diagram/` for that half.
 *
 * Extracted from public/js/views/planner.view.js during Phase 4.
 */
import { totalSessionTime, durationMinutes, sessionStartMinutes, type PlanItem } from './practice-plan';
import { format24hTo12h } from './schedule-view';

export interface DiagramStep {
  dataUrl: string;
  label: string;
}

export interface PrintOptions {
  planName: string;
  organization: string;
  team?: string;
  items: PlanItem[];
  /** Rasterized diagram steps, by drill name. */
  diagrams?: Record<string, DiagramStep[]>;
}

/** The ampersand goes first, or every later escape is double-escaped. */
export function escapeHtml(value: any): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clockAt(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = String(Math.floor(wrapped / 60)).padStart(2, '0');
  const m = String(wrapped % 60).padStart(2, '0');
  return format24hTo12h(`${h}:${m}`);
}

function drillBlock(drill: PlanItem, steps: DiagramStep[]): string {
  const notes = drill.coachNotes
    ? `<p class="notes"><strong>Coach focus:</strong>\n${escapeHtml(drill.coachNotes)}</p>`
    : '';

  const diagrams = steps.length
    ? `<div class="steps">${steps.map(s => `
        <figure class="step">
          <img src="${escapeHtml(s.dataUrl)}" alt="" />
          <figcaption>${escapeHtml(s.label)}</figcaption>
        </figure>`).join('')}</div>`
    : '';

  return `
    <tr>
      <td class="when">
        <div class="slot">${escapeHtml(drill.time)}</div>
        <div class="dur">${escapeHtml(drill.duration)}</div>
      </td>
      <td>
        <h2>${escapeHtml(drill.name)}</h2>
        ${notes}
        ${diagrams}
      </td>
    </tr>`;
}

/**
 * The whole document, or null when there is nothing to print.
 *
 * A complete document rather than a fragment: it is written into a print
 * window, which needs one.
 */
export function buildPrintDocument(options: PrintOptions): string | null {
  const items = options?.items || [];
  if (items.length === 0) return null;

  const diagrams = options.diagrams || {};
  const start = sessionStartMinutes(items);
  const minutes = items.reduce((sum, d) => sum + (durationMinutes(d?.duration) || 0), 0);

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const rows = items.map(d => drillBlock(d, diagrams[d.name] || [])).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(options.planName)}</title>
<style>
  body { margin: 0; padding: 24px; color: #111; font: 13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .org { margin: 0; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }
  .meta { margin: 8px 0 0; font-size: 12px; color: #444; }
  .meta span { margin-right: 18px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 10px 8px; border-bottom: 1px solid #ccc; vertical-align: top; }
  .when { width: 130px; white-space: nowrap; }
  .slot { font-weight: 700; }
  .dur { color: #555; font-size: 12px; }
  h2 { margin: 0 0 4px; font-size: 14px; }
  .notes { margin: 4px 0 0; white-space: pre-wrap; color: #333; }
  .steps { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
  .step { margin: 0; width: 260px; }
  .step img { width: 100%; border: 1px solid #999; }
  figcaption { font-size: 11px; color: #555; margin-top: 2px; }
  @media print {
    body { padding: 0; }
    tr { break-inside: avoid; }
  }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(options.planName)}</h1>
  <p class="org">${escapeHtml(options.organization)}${options.team ? ` · ${escapeHtml(options.team)}` : ''}</p>
  <p class="meta">
    <span>${escapeHtml(dateStr)}</span>
    <span>${escapeHtml(clockAt(start))} – ${escapeHtml(clockAt(start + minutes))}</span>
    <span>${escapeHtml(totalSessionTime(items))}</span>
    <span>${items.length} drill${items.length === 1 ? '' : 's'}</span>
  </p>
</header>
<table>${rows}</table>
</body>
</html>`;
}
