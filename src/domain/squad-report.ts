/**
 * Ordering one exercise's rows in the squad report.
 *
 * The report's own rule holds through every sort: **every player stays in the
 * table**. A player who has attempted nothing is the reason a coach opens this
 * -- so they sink to the bottom rather than dropping out, and they sink
 * whichever way the column points, because there is nothing to compare them
 * on. That is the same bargain the leaderboard's below-standard emphasis makes.
 *
 * Each exercise sorts on its own: a coach reading the Cooper's by best figure
 * is not thereby reordering the small-sided section above it.
 */

export interface SquadSortOptions {
  /** A timed exercise reads fastest-first; a counted one highest-first. */
  timed?: boolean;
  /** A W/D/L exercise has a record rather than a figure. */
  outcomes?: boolean;
}

/** Whether a first click on this column reads downward. Arrows only. */
export function squadSortDescends(by: string): boolean {
  return by !== 'name';
}

function played(row: any): boolean {
  return (Number(row?.attempts) || 0) > 0;
}

export function sortSquadEntries(
  entries: any[], by: string, reversed: boolean, options: SquadSortOptions = {}
): any[] {
  const rows = (entries || []).slice();
  if (!by) return rows;

  const flip = reversed ? -1 : 1;

  return rows.sort((x, y) => {
    if (by === 'name') {
      return flip * String(x.player?.name || '').localeCompare(String(y.player?.name || ''));
    }

    // Nothing recorded is not a low score: those rows sink either way.
    if (played(x) !== played(y)) return played(x) ? -1 : 1;
    if (!played(x)) return 0;

    if (by === 'attempts') {
      if (y.attempts !== x.attempts) return flip * (y.attempts - x.attempts);
      return String(x.player?.name || '').localeCompare(String(y.player?.name || ''));
    }

    if (by === 'record' || options.outcomes) {
      const wins = (Number(y.wins) || 0) - (Number(x.wins) || 0);
      if (wins) return flip * wins;
      const draws = (Number(y.draws) || 0) - (Number(x.draws) || 0);
      if (draws) return flip * draws;
      return String(x.player?.name || '').localeCompare(String(y.player?.name || ''));
    }

    // 'best' or 'avg', read the same way. A dash has already sunk above, so
    // both sides have a figure.
    const field = by === 'avg' ? 'avg' : 'best';
    const a = Number(x[field]);
    const b = Number(y[field]);
    if (a !== b) return flip * (options.timed ? a - b : b - a);
    return String(x.player?.name || '').localeCompare(String(y.player?.name || ''));
  });
}
