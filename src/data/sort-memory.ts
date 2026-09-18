/**
 * How a coach last sorted each table, remembered on this device.
 *
 * A sort is a viewing preference, like the active team, so it lives in the
 * browser rather than in Postgres: instant, and it works signed out. It is per
 * person rather than per team -- a coach who reads the board by points reads
 * every team's that way.
 *
 * Nothing saved here can break a screen. A column the screen no longer offers,
 * a value that does not parse, or storage the browser refuses (a private
 * window, a sandboxed frame -- where the accessor itself throws) all read as
 * the screen's own starting sort, silently: there is nothing for the coach to
 * do about any of them.
 */
export interface SortState { by: string; reversed: boolean }

const PREFIX = 'bhs.sort.v1.';

/**
 * The saved sort for `screen`, or `fallback` when there is none that fits.
 * `columns` is what the screen offers now; a saved column outside it is stale.
 */
export function readSort(screen: string, columns: readonly string[], fallback: SortState): SortState {
  try {
    const raw = localStorage.getItem(PREFIX + screen);
    if (raw !== null) {
      const saved = JSON.parse(raw);
      if (saved && typeof saved.by === 'string' && columns.includes(saved.by)) {
        return { by: saved.by, reversed: saved.reversed === true };
      }
    }
  } catch {
    // Unreadable or refused: the screen's own sort.
  }
  return { ...fallback };
}

export function writeSort(screen: string, state: SortState): void {
  try {
    localStorage.setItem(PREFIX + screen, JSON.stringify({ by: state.by, reversed: !!state.reversed }));
  } catch {
    // Quota or refused storage. The sort still applies; it just is not kept.
  }
}
