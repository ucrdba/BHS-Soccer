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
import { useMatrixStore } from '../../stores/matrix';

const matrix = useMatrixStore();
const emit = defineEmits<{ openPlayer: [string] }>();

const COLUMNS = [
  { key: 'rank', label: 'Rank', sortable: true },
  { key: 'name', label: 'Player', sortable: true, text: true },
  { key: 'exercises', label: 'Ex', sortable: false, title: 'Exercises taken part in' },
  { key: 'wdl', label: 'W-D-L', sortable: false },
  { key: 'earned', label: 'Pts', sortable: true },
  { key: 'available', label: 'Of', sortable: false, title: 'Points available' },
  { key: 'share', label: 'Share', sortable: true }
];

function arrow(key: string): string {
  if (matrix.boardSort.by !== key) return '';
  return matrix.boardDescends(key) ? ' ▼' : ' ▲';
}
</script>

<template>
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
            <span
              v-if="m.exercises === 0" class="rank rank--none"
              title="Has not taken part in anything yet"
            >—</span>
            <span v-else class="rank" :class="`rank--${m.rank <= 3 ? m.rank : 'other'}`">
              {{ m.rank }}
            </span>
          </td>

          <td class="is-text">
            <button
              type="button" class="who" data-board-player
              title="See how these points were earned"
              @click="emit('openPlayer', m.playerId)"
            >{{ m.name }}</button>
            <span class="num">{{ m.recordingNumber != null ? `(${m.recordingNumber})` : '—' }}</span>
          </td>

          <td>{{ m.exercises }}</td>
          <td class="tabular">{{ m.wins }} - {{ m.draws }} - {{ m.losses }}</td>
          <td class="tabular"><strong>{{ m.earned.toFixed(2) }}</strong></td>
          <td class="tabular muted">{{ m.available.toFixed(2) }}</td>
          <td>
            <span v-if="m.share === null" class="muted">—</span>
            <span v-else class="tabular">{{ m.share.toFixed(1) }}%</span>
            <!-- The bar tracks POINTS against the leader, because points are
                 what the table is ordered by. A bar drawn from share would
                 disagree with the ordering beside it. -->
            <span class="meter"><span class="meter__fill" :style="{ width: `${m.barPct}%` }" /></span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.wrap { overflow-x: auto; }

.board {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
}

.board th, .board td {
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--bhs-navy-border);
  text-align: right;
  white-space: nowrap;
}

.board th.is-text, .board td.is-text { text-align: left; }

.board th {
  color: var(--bhs-cyan-accent);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.th-btn {
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
  padding: 0;
}

.th-btn:hover { color: #fff; }

.tabular { font-variant-numeric: tabular-nums; }
.muted { color: var(--text-muted, #94a3b8); }

.rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.9rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  border: 1px solid var(--bhs-navy-border);
  font-size: 0.78rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.rank--1 { border-color: var(--bhs-gold-accent); color: var(--bhs-gold-accent); }
.rank--2, .rank--3 { border-color: var(--bhs-cyan-accent); color: var(--bhs-cyan-accent); }
.rank--none { color: var(--text-muted, #94a3b8); }

.who {
  border: 0;
  padding: 0;
  background: none;
  color: #fff;
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  border-bottom: 1px dotted var(--bhs-cyan-accent);
}

.num {
  margin-left: 0.4rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.76rem;
}

.meter {
  display: block;
  height: 3px;
  margin-top: 0.3rem;
  border-radius: 999px;
  background: var(--bhs-navy-border);
}

.meter__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--bhs-cyan-accent);
}
</style>
