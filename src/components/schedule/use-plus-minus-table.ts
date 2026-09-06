/**
 * The plus/minus sheet's columns and rows.
 *
 * A thin composable over `pmColumns` and `pmSortedRows`, which already decide
 * what the columns are, how each sorts, and how ties break. Kept out of the
 * component because two screens read this sheet — the live board and the
 * printed one — and out of the store because it is a pure function of the
 * stats and the squad.
 *
 * **Every player in the squad has a row**, including one who has not been on.
 * Unlimited substitution means a coach is reading this to decide who to bring
 * on, so the players with nothing yet are the ones the sheet is for.
 */
import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { pmColumns, pmSortedRows, type PmColumn } from '../../domain/plus-minus-court';
import { toMinutes } from '../../data/season-stats';

export interface SheetRow {
  player: any;
  stat: any;
  minutes: number;
  /** One display value per column, in column order. */
  cells: string[];
}

export function usePlusMinusTable(
  stats: ComputedRef<Map<string, any>> | Ref<Map<string, any>>,
  squad: ComputedRef<any[]> | Ref<any[]>
) {
  const columns: PmColumn[] = pmColumns();
  // Minutes first: on a live board it is what a coach checks against the
  // rotation they are planning.
  const sortKey = ref('mins');
  const reversed = ref(false);

  const rows = computed<SheetRow[]>(() =>
    pmSortedRows(stats.value, squad.value, sortKey.value, reversed.value)
      .map(({ p, s }) => ({
        player: p,
        stat: s,
        minutes: toMinutes(s.secondsPlayed || 0),
        cells: columns.map(c => {
          const value = c.get(p, s);
          if (value === null || value === undefined) return '—';
          // Seconds are what the engine holds; minutes are what a coach reads.
          if (c.key === 'mins') return String(toMinutes(s.secondsPlayed || 0));
          return String(value);
        })
      })));

  function sortBy(key: string): void {
    if (sortKey.value === key) { reversed.value = !reversed.value; return; }
    sortKey.value = key;
    reversed.value = false;
  }

  return { columns, sortKey, reversed, rows, sortBy };
}
