<script setup lang="ts">
/**
 * One exercise at a time.
 *
 * The columns differ by measure because the natural figure does: wins and
 * draws for a head-to-head or small-sided drill, a best count or a best time
 * otherwise. Showing all of them for every exercise fills the table with
 * columns that are always zero.
 *
 * For a `time_bands` exercise there is an extra layer, and it is ADDITIVE.
 * That measure is a fitness standard rather than a competition — it asks
 * whether a player can last a full match, scored against absolute per-squad
 * thresholds — so most of a fit squad landing on full marks is the good
 * outcome, and what is worth seeing is who fell short. The summary and the row
 * marks say so.
 *
 * What this must never do is narrow the table or disable a sort. Every player
 * stays on screen, ordered however the reader chooses. That was the condition
 * on introducing the emphasis at all.
 */
import { computed } from 'vue';
import { useMatrixStore } from '../../stores/matrix';
import { bandStanding } from '../../domain/matrix-threshold';
import { formatSecondsAsTime } from '../../domain/time';

const matrix = useMatrixStore();

const isWinLoss = computed(() =>
  matrix.measure === 'win_loss' || matrix.measure === 'head_to_head');
const isTimed = computed(() =>
  matrix.measure === 'time_low' || matrix.measure === 'time_bands');

const bestLabel = computed(() => (isTimed.value ? 'Best time' : 'Best'));

const columns = computed(() => [
  { key: 'number', label: '#' },
  { key: 'name', label: 'Player', text: true },
  isWinLoss.value ? { key: 'wins', label: 'W-D-L' } : { key: 'best', label: bestLabel.value },
  { key: 'earned', label: 'Points' }
]);

function arrow(key: string): string {
  if (matrix.exerciseSort.by !== key) return '';
  return matrix.exerciseDescends(key) ? ' ▼' : ' ▲';
}

/** A player's best figure, phrased for the exercise they did it in. */
function best(row: any): string {
  if (row.best === null || row.best === undefined) return '—';
  return row.timed ? formatSecondsAsTime(row.best) : String(row.best);
}

function standing(row: any): string {
  return matrix.isThreshold ? bandStanding(row) : 'met';
}
</script>

<template>
  <div>
    <!--
      Only for a standard. A competitive exercise gets no summary, because
      spread across the squad is the point there rather than a shortfall.
    -->
    <p
      v-if="matrix.isThreshold && matrix.leaderboard.length"
      class="standard"
      :class="matrix.shortOfStandard.length ? 'standard--short' : 'standard--met'"
      data-standard-summary
    >
      <template v-if="matrix.shortOfStandard.length">
        <strong>{{ matrix.shortOfStandard.length }}</strong>
        of {{ matrix.measuredCount }} measured
        {{ matrix.shortOfStandard.length === 1 ? 'player is' : 'players are' }}
        below the standard.
      </template>
      <template v-else>
        All {{ matrix.measuredCount }} measured
        {{ matrix.measuredCount === 1 ? 'player meets' : 'players meet' }}
        the standard.
      </template>
      <span class="standard__note">
        This exercise is a fitness standard, not a ranking — everyone is still listed.
      </span>
    </p>

    <p v-if="matrix.leaderboard.length === 0" class="empty" data-leaderboard-empty>
      No results recorded for
      {{ matrix.selectedDrill ? matrix.selectedDrill.name : 'this exercise' }} yet.
    </p>

    <div v-else class="wrap">
      <table class="lb" data-exercise-leaderboard>
        <thead>
          <tr>
            <th
              v-for="c in columns" :key="c.key"
              :class="{ 'is-text': c.text }"
              :title="`Sort by ${c.label}`"
              :aria-sort="matrix.exerciseSort.by === c.key
                ? (matrix.exerciseDescends(c.key) ? 'descending' : 'ascending')
                : undefined"
            >
              <button
                type="button" class="th-btn"
                :data-exercise-sort="c.key" @click="matrix.setExerciseSort(c.key)"
              >{{ c.label }}{{ arrow(c.key) }}</button>
            </th>
            <th title="Points available from this exercise">Of</th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="r in matrix.leaderboard" :key="r.playerId"
            :class="`row--${standing(r)}`"
            :data-standing="standing(r)"
            data-leaderboard-row
          >
            <td class="muted">{{ r.recordingNumber != null ? `(${r.recordingNumber})` : '—' }}</td>
            <td class="is-text">
              <strong>{{ r.name }}</strong>
              <span
                v-if="matrix.isThreshold && (standing(r) === 'below' || standing(r) === 'missed')"
                class="flag" data-below-standard
              >{{ standing(r) === 'missed' ? 'no band' : 'below' }}</span>
            </td>
            <td class="tabular">
              <template v-if="isWinLoss">{{ r.wins }} - {{ r.draws }} - {{ r.losses }}</template>
              <template v-else>{{ best(r) }}</template>
            </td>
            <td class="tabular"><strong>{{ r.earned.toFixed(2) }}</strong></td>
            <td class="tabular muted">{{ r.available.toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.wrap { overflow-x: auto; }

.standard {
  margin: 0 0 0.9rem;
  padding: 0.6rem 0.8rem;
  border-left: 3px solid var(--bhs-cyan-accent);
  border-radius: 0 6px 6px 0;
  background: color-mix(in srgb, var(--ink) 3%, transparent);
  font-size: 0.85rem;
  color: var(--ink);
}

.standard--short { border-left-color: var(--bhs-gold-accent); }
.standard--met { border-left-color: var(--bhs-cyan-accent); }

.standard__note {
  display: block;
  margin-top: 0.2rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.76rem;
}

.lb { width: 100%; border-collapse: collapse; font-size: 0.86rem; }

.lb th, .lb td {
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--bhs-navy-border);
  text-align: right;
  white-space: nowrap;
}

.lb th.is-text, .lb td.is-text { text-align: left; }

.lb th {
  color: var(--bhs-cyan-accent);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.th-btn {
  border: 0; padding: 0; background: none; color: inherit;
  font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer;
}

.th-btn:hover { color: var(--ink); }

.tabular { font-variant-numeric: tabular-nums; }
.muted { color: var(--text-muted, #94a3b8); }

/* Marked, not moved. The row stays exactly where the chosen sort puts it. */
.row--below td, .row--missed td { background: rgb(234 179 8 / 0.07); }

.flag {
  margin-left: 0.5rem;
  padding: 0.05rem 0.4rem;
  border: 1px solid var(--bhs-gold-accent);
  border-radius: 999px;
  color: var(--bhs-gold-accent);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.empty { padding: 2rem 1rem; color: var(--text-muted, #94a3b8); text-align: center; }
</style>
