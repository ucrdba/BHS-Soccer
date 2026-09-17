/**
 * The overall board, taken off the screen.
 *
 * The same bargain `exercise-export.ts` makes: the rows arrive in the order the
 * coach sorted them and are never re-sorted here, because that order is the
 * answer they were looking at.
 *
 * A player who has taken part in nothing keeps the dash the board shows. The
 * stored rank for them is 999 -- a sink value that keeps them last whichever
 * way a column points -- and writing that into a spreadsheet would read as a
 * real placing.
 */
import { printTableDocument } from './print-table';

export interface BoardExportOptions {
  organization: string;
  team?: string;
  /** Board rows, already in the order the coach sorted them. */
  rows: any[];
}

const TITLE = 'Player ratings';

/** Columns that read as words rather than figures. */
const TEXTUAL = new Set(['Player', 'W-D-L', 'Rank', 'Share']);

/** The rows as a spreadsheet, one object per player, keys in column order. */
export function boardSheet(options: BoardExportOptions): Record<string, any>[] {
  const rows = options?.rows || [];
  if (rows.length === 0) return [];

  return rows.map(r => {
    const took = Number(r.exercises) || 0;
    return {
      // Nothing taken part in is not a placing: the board shows a dash and so
      // does this.
      Rank: took === 0 ? '—' : Number(r.rank),
      Player: r.name,
      'No': r.recordingNumber == null ? '' : r.recordingNumber,
      Ex: took,
      'W-D-L': `${r.wins || 0} - ${r.draws || 0} - ${r.losses || 0}`,
      Pts: Number(r.earned ?? 0).toFixed(2),
      Of: Number(r.available ?? 0).toFixed(2),
      Share: r.share === null || r.share === undefined ? '' : `${Number(r.share).toFixed(1)}%`
    };
  });
}

/**
 * The printable document, or null when there is nothing to print.
 *
 * Self-contained: off screen there is no header to say whose board this is or
 * what "Of" counts, so the sheet says both.
 */
export function buildBoardPrintDocument(options: BoardExportOptions): string | null {
  return printTableDocument({
    title: TITLE,
    where: [options.organization, options.team],
    textual: TEXTUAL,
    rows: boardSheet(options),
    note: `<p class="note">Every exercise recorded, weighted. “Pts” is what each player earned
       and “Of” what was available to them, so a player who missed a session is measured
       against what they could have earned. A dash means they have taken part in nothing yet.</p>`
  });
}
