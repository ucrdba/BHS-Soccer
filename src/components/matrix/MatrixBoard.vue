<script setup lang="ts">
/**
 * The overall board.
 *
 * Rank first, because that is the board's own answer to "who is ahead". Every
 * other column answers a different question, and each is sortable — the arrow
 * shows the order actually in force rather than merely that a column is sorted.
 *
 * A player who has taken part in nothing shows a dash rather than a rank, and
 * sinks whichever way a column points. They are not last on merit; there is
 * nothing to compare.
 */
import { ref } from 'vue';
import { useMatrixStore } from '../../stores/matrix';
import { useOrganizationStore } from '../../stores/organization';
import { boardSheet, buildBoardPrintDocument } from '../../domain/board-export';

const matrix = useMatrixStore();
const org = useOrganizationStore();
const emit = defineEmits<{ openPlayer: [string] }>();

const exportError = ref<string | null>(null);

/** What both exports describe: this board, as the coach has it sorted. */
function exportOptions() {
  return {
    organization: org.branding.name || '',
    team: org.activeTeam?.name || '',
    // Straight off the store, so the order is whatever column the coach
    // sorted by. Re-sorting here would throw away their answer.
    rows: matrix.boardRows
  };
}

/**
 * Printed through the browser's own dialog, where Save as PDF is one of the
 * destinations -- the same route the exercise leaderboard and the practice
 * plan take.
 */
function onPrint(): void {
  exportError.value = null;
  const html = buildBoardPrintDocument(exportOptions());
  if (!html) { exportError.value = 'There is nothing to print yet.'; return; }

  const win = window.open('', '_blank');
  if (!win) {
    // A blocked pop-up is silent otherwise, and the coach just sees nothing
    // happen when they press print.
    exportError.value = 'Your browser blocked the print window. Allow pop-ups for this site and try again.';
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function onExcel(): void {
  exportError.value = null;
  const XLSX = (window as any).XLSX;
  if (typeof XLSX === 'undefined') {
    // The CDN may not have answered yet. Said, not thrown.
    exportError.value = 'The spreadsheet library has not loaded yet. Wait a moment and try again.';
    return;
  }

  const rows = boardSheet(exportOptions());
  if (rows.length === 0) { exportError.value = 'There is nothing to export yet.'; return; }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Player ratings');
  XLSX.writeFile(wb, 'Player_ratings.xlsx');
}

// Every column sorts; compareBoardRows in domain/matrix.ts holds how each one
// reads, shared with the squad report's overall ratings.
const COLUMNS = [
  { key: 'rank', label: 'Rank', sortable: true },
  { key: 'name', label: 'Player', sortable: true, text: true },
  { key: 'recordingNumber', label: 'No', sortable: true, title: 'Recording number, not the shirt number' },
  { key: 'exercises', label: 'Ex', sortable: true, title: 'Exercises taken part in' },
  { key: 'wdl', label: 'W-D-L', sortable: true },
  { key: 'earned', label: 'Pts', sortable: true },
  { key: 'available', label: 'Of', sortable: true, title: 'Points available' },
  { key: 'share', label: 'Share', sortable: true }
];

function arrow(key: string): string {
  if (matrix.boardSort.by !== key) return '';
  return matrix.boardDescends(key) ? ' ▼' : ' ▲';
}
</script>

<template>
  <div>
    <!-- Beside the board, because they export THIS table as it is sorted. -->
    <div v-if="matrix.boardRows.length" class="acts">
      <button type="button" class="btn btn--small" data-board-print @click="onPrint">
        Print / PDF
      </button>
      <button type="button" class="btn btn--small" data-board-excel @click="onExcel">
        Excel
      </button>
    </div>

    <p v-if="exportError" class="note note--bad" role="alert" data-board-export-error>
      {{ exportError }}
    </p>

    <div class="wrap">
    <table class="board" data-matrix-board>
      <thead>
        <tr>
          <th
            v-for="c in COLUMNS" :key="c.key"
            :class="{ 'is-text': c.text, 'is-sortable': c.sortable }"
            :title="c.title || (c.sortable ? `Sort by ${c.label}` : undefined)"
            :aria-sort="matrix.boardSort.by === c.key
              ? (matrix.boardDescends(c.key) ? 'descending' : 'ascending')
              : undefined"
          >
            <button
              v-if="c.sortable" type="button" class="th-btn"
              :data-board-sort="c.key" @click="matrix.setBoardSort(c.key)"
            >{{ c.label }}{{ arrow(c.key) }}</button>
            <span v-else>{{ c.label }}</span>
          </th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="m in matrix.boardRows" :key="m.playerId" data-board-row>
          <td>
            <span v-if="m.exercises === 0" class="rank rank--none" title="Has not taken part in anything yet">—</span>
            <span v-else class="rank tnum">{{ m.rank }}</span>
          </td>

          <td class="is-text">
            <button
              type="button" class="who" data-board-player
              title="See how these points were earned"
              @click="emit('openPlayer', m.playerId)"
            >{{ m.name }}</button>
          </td>

          <td class="tnum muted">{{ m.recordingNumber != null ? m.recordingNumber : '—' }}</td>
          <td class="tnum">{{ m.exercises }}</td>
          <td class="tnum">{{ m.wins }} - {{ m.draws }} - {{ m.losses }}</td>
          <td class="tnum points">{{ m.earned.toFixed(2) }}</td>
          <td class="tnum muted">{{ m.available.toFixed(2) }}</td>
          <td class="tnum">
            <span v-if="m.share === null" class="muted">—</span>
            <span v-else>{{ m.share.toFixed(1) }}%</span>
          </td>
        </tr>
      </tbody>
    </table>

    <p class="foot">
      The No column is the recording number — the one on the coach's paper
      sheets — which is not the shirt number. The exercises column sits beside
      the points so a small sample is visible rather than hidden: no player is
      left out of this table for having taken part in little.
    </p>
  </div>
  </div>
</template>

<style scoped>
.acts { display: flex; gap: var(--space-2); margin-bottom: var(--space-3); }

.btn {
  min-height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.btn--small { font-size: 11.5px; }
.note { margin: 0 0 var(--space-2); font-size: 12px; line-height: 1.5; color: var(--ink-muted); }
.note--bad { color: var(--color-warning); }

.wrap { overflow-x: auto; }
.board { width: 100%; border-collapse: collapse; font-size: 13px; }

.board th, .board td {
  padding: 9px 8px;
  border-bottom: 1px solid var(--rule);
  text-align: right;
  white-space: nowrap;
}

.board th { border-bottom-color: var(--rule-strong); }
.board th.is-text, .board td.is-text { text-align: left; }

.board th {
  color: var(--ink-muted);
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.th-btn {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}

.th-btn:hover { color: var(--ink); }

.tnum { font-variant-numeric: tabular-nums; }
.muted { color: var(--ink-muted); }

.rank { font-family: var(--heading-face); font-size: 15px; color: var(--mark); }
.rank--none { color: var(--ink-muted); }

.who {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.who:hover, .who:focus-visible { color: var(--live); }

.points { font-family: var(--heading-face); font-size: 16px; color: var(--ink); }

.foot {
  padding: var(--space-3) 0 0;
  font-size: 11.5px;
  line-height: 1.5;
  font-style: italic;
  color: var(--ink-muted);
}

/* The name column stays put while the figures scroll on a narrow screen. */
@media (max-width: 767.98px) {
  .board td.is-text, .board th.is-text {
    position: sticky;
    left: 0;
    background: var(--ground);
  }
}
</style>
