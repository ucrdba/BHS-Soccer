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
    <header v-if="matrix.selectedDrill" class="lb__head">
      <p class="kicker">Exercise · {{ matrix.measure.replace('_', ' ') }}</p>
      <h2 class="lb__name">{{ matrix.selectedDrill.name }}</h2>
    </header>

    <!--
      Only for a standard. A competitive exercise gets no summary, because
      spread across the squad is the point there rather than a shortfall.
    -->
    <div
      v-if="matrix.isThreshold && matrix.leaderboard.length"
      class="standard" data-standard-summary
    >
      <p class="kicker standard__kicker">Match-readiness standard, not a ranking</p>
      <p class="standard__line">
        <template v-if="matrix.shortOfStandard.length">
          <span class="standard__count tnum">{{ matrix.shortOfStandard.length }}</span>
          of {{ matrix.measuredCount }} measured
          {{ matrix.shortOfStandard.length === 1 ? 'player is' : 'players are' }}
          below the standard. The rest have cleared it.
        </template>
        <template v-else>
          All {{ matrix.measuredCount }} measured
          {{ matrix.measuredCount === 1 ? 'player meets' : 'players meet' }}
          the standard.
        </template>
      </p>
    </div>

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
            <th v-if="matrix.isThreshold">Standard</th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="r in matrix.leaderboard" :key="r.playerId"
            :data-standing="standing(r)"
            data-leaderboard-row
          >
            <td class="tnum muted">{{ r.recordingNumber != null ? r.recordingNumber : '—' }}</td>
            <td class="is-text">{{ r.name }}</td>
            <td class="tnum">
              <template v-if="isWinLoss">{{ r.wins }} - {{ r.draws }} - {{ r.losses }}</template>
              <template v-else>{{ best(r) }}</template>
            </td>
            <td class="tnum points">{{ r.earned.toFixed(2) }}</td>
            <td class="tnum muted">{{ r.available.toFixed(2) }}</td>
            <td v-if="matrix.isThreshold" class="tnum">
              <span
                v-if="standing(r) === 'below' || standing(r) === 'missed'"
                class="mark mark--short" data-below-standard
              >{{ standing(r) === 'missed' ? 'no band' : '△ below' }}</span>
              <span v-else-if="standing(r) === 'met'" class="mark">met</span>
              <span v-else class="mark mark--none">—</span>
            </td>
          </tr>
        </tbody>
      </table>

      <p class="foot">
        Below-standard players are marked in words as well as colour, and stay
        where the sort puts them. The table is never narrowed — a squad where
        everyone passes is a fit squad, not a broken exercise.
      </p>
    </div>
  </div>
</template>

<style scoped>
.lb__head { margin-bottom: var(--space-3); }

.lb__name {
  margin-top: 6px;
  font-family: var(--heading-face);
  font-weight: 400;
  font-size: 25px;
  line-height: 1.15;
  color: var(--ink);
}

.standard {
  margin-bottom: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius-md);
}

.standard__kicker { color: var(--rule-strong); }
.standard__line { margin-top: 8px; font-size: 13.5px; line-height: 1.4; color: var(--ink); }
.standard__count { font-family: var(--heading-face); font-size: 34px; line-height: 1; margin-right: 6px; }

.wrap { overflow-x: auto; }
.lb { width: 100%; border-collapse: collapse; font-size: 13px; }

.lb th, .lb td {
  padding: 9px 8px;
  border-bottom: 1px solid var(--rule);
  text-align: right;
  white-space: nowrap;
}

.lb th { border-bottom-color: var(--rule-strong); }
.lb th.is-text, .lb td.is-text { text-align: left; }

.lb th {
  color: var(--ink-muted);
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.th-btn {
  padding: 0; border: 0; background: none; color: inherit;
  font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer;
}

.th-btn:hover { color: var(--ink); }

.tnum { font-variant-numeric: tabular-nums; }
.muted { color: var(--ink-muted); }
.points { font-family: var(--heading-face); font-size: 16px; color: var(--ink); }

/* Marked, never moved: the row stays exactly where the chosen sort puts it. */
.mark { font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-muted); }
.mark--short { color: var(--color-warning); }
.mark--none { color: var(--ink-muted); }

.foot {
  padding: var(--space-3) 0 0;
  font-size: 11.5px;
  line-height: 1.55;
  font-style: italic;
  color: var(--ink-muted);
}

.empty { padding: var(--space-8) var(--space-3); text-align: center; color: var(--ink-muted); }

@media (max-width: 767.98px) {
  .lb td.is-text, .lb th.is-text { position: sticky; left: 0; background: var(--ground); }
}
</style>
