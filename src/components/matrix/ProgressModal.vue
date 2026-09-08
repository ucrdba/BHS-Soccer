<script setup lang="ts">
/**
 * One player's readings for one exercise, over the season.
 *
 * **A session a player missed is left out, not plotted as zero.** Not
 * attending is not a result of nothing, and drawing it as one shows a
 * collapse that never happened — `progressSeries` already drops them and
 * this must not put them back.
 *
 * **A single reading gets no trend.** One result is not a trend, and calling
 * it "level" puts a verdict on a player who has done the exercise once. The
 * player is still shown; it is the verdict that is withheld.
 *
 * The chart is an SVG polyline drawn from the series. A charting library for
 * one line would be a dependency for a worse result — the same call the
 * printed plan made about PDFs.
 */
import { ref, computed, watch } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { supabaseService } from '../../data/supabase';
import { useMatrixStore } from '../../stores/matrix';
import { progressSeries, progressTrend, progressLowerIsBetter } from '../../domain/progress';
import { formatSecondsAsTime } from '../../domain/time';

const props = defineProps<{ open: boolean; teamId: string | null }>();
const emit = defineEmits<{ close: [] }>();

const matrix = useMatrixStore();

const history = ref<any[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const playerId = ref('');
const drillId = ref('');

const players = computed(() => matrix.players || []);
const drills = computed(() => matrix.drillsBank || []);

const drill = computed(() => drills.value.find((d: any) => d.id === drillId.value) || null);
const measure = computed(() => drill.value?.measure || 'count_high');
const timed = computed(() => measure.value === 'time_low' || measure.value === 'time_bands');
const lowerIsBetter = computed(() => progressLowerIsBetter(measure.value));

const series = computed(() =>
  (playerId.value && drillId.value)
    ? progressSeries(history.value, playerId.value, drillId.value)
    : []);

const trend = computed(() => progressTrend(series.value, lowerIsBetter.value));

const shown = (v: number) => (timed.value ? formatSecondsAsTime(v) : String(v));

/** The polyline, in a 100x40 viewBox. Flat when every reading is the same. */
const polyline = computed(() => {
  const pts = series.value;
  if (pts.length === 0) return '';

  const values = pts.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  return pts.map((p, i) => {
    const x = pts.length === 1 ? 50 : (i / (pts.length - 1)) * 100;
    // Better is up, whichever direction the measure runs.
    const share = (p.value - min) / span;
    const y = 40 - (lowerIsBetter.value ? 1 - share : share) * 36 - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
});

watch(() => [props.open, props.teamId] as const, async () => {
  if (!props.open) return;
  loadError.value = null;

  if (!props.teamId) { loadError.value = 'Choose a team first.'; return; }

  loading.value = true;
  try {
    const rows = await supabaseService.fetchTeamSessionHistory(props.teamId);
    if (rows === null) {
      loadError.value = 'Could not load the session history.';
      history.value = [];
      return;
    }
    history.value = rows;
    if (!playerId.value && players.value.length) playerId.value = players.value[0].id;
    if (!drillId.value && drills.value.length) drillId.value = drills.value[0].id;
  } finally {
    loading.value = false;
  }
}, { immediate: true });
</script>

<template>
  <BaseModal :open="open" title="Progress" wide @close="emit('close')">
    <p class="lede">
      One player's readings for one exercise, oldest first. Sessions they
      missed are left out rather than drawn as a zero — not being there is not
      a result.
    </p>

    <div class="pickers">
      <label class="fld">
        <span class="fld__label">Player</span>
        <select v-model="playerId" class="inp" data-progress-player>
          <option v-for="p in players" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>

      <label class="fld">
        <span class="fld__label">Exercise</span>
        <select v-model="drillId" class="inp" data-progress-drill>
          <option v-for="d in drills" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </label>
    </div>

    <p v-if="loading" class="state">Loading…</p>
    <p v-else-if="loadError" class="state state--bad" role="alert" data-progress-error>{{ loadError }}</p>

    <p v-else-if="series.length === 0" class="state" data-progress-empty>
      No readings for this player on this exercise yet.
    </p>

    <template v-else>
      <svg class="chart" viewBox="0 0 100 40" preserveAspectRatio="none" data-progress-chart>
        <polyline :points="polyline" fill="none" stroke="currentColor" stroke-width="0.8" />
      </svg>

      <p class="trend" data-progress-trend>
        <template v-if="trend">
          <strong :class="`is-${trend.direction}`">
            {{ trend.direction === 'better' ? 'Improving'
             : trend.direction === 'worse' ? 'Slipping' : 'Level' }}
          </strong>
          — {{ shown(trend.first) }} to {{ shown(trend.last) }}
          across {{ series.length }} readings
        </template>
        <template v-else>
          <!-- One result is not a trend; calling it "level" would put a
               verdict on a player who has done this once. -->
          One reading so far — not enough for a trend.
        </template>
      </p>

      <ol class="readings">
        <li v-for="(p, i) in series" :key="i" data-progress-reading>
          <span class="readings__on">{{ p.on }}</span>
          <span class="readings__v">{{ shown(p.value) }}</span>
        </li>
      </ol>
    </template>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Close</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.lede {
  margin: 0 0 0.9rem;
  max-width: 42rem;
  color: var(--ink-muted);
  font-size: 0.82rem;
  line-height: 1.5;
}

.pickers { display: flex; flex-wrap: wrap; gap: 0.8rem; margin-bottom: 0.9rem; }

.fld { display: block; }

.fld__label {
  display: block;
  margin-bottom: 0.25rem;
  color: var(--ink-muted);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.inp {
  min-width: 11rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--rule);
  border-radius: 5px;
  background: var(--surface-deep);
  color: var(--ink);
  font: inherit;
  font-size: 0.85rem;
}

.state { padding: 2rem 0; color: var(--ink-muted); text-align: center; font-size: 0.88rem; }
.state--bad { color: var(--color-danger); }

.chart {
  display: block;
  width: 100%;
  height: 9rem;
  color: var(--live);
  border: 1px solid var(--rule);
  border-radius: 8px;
  background: var(--surface-deep);
}

.trend { margin: 0.6rem 0; color: var(--ink-muted); font-size: 0.85rem; }
.is-better { color: var(--live); }
.is-worse { color: var(--color-danger); }
.is-level { color: var(--rule-strong); }

.readings { margin: 0; padding: 0; list-style: none; }

.readings li {
  display: flex;
  gap: 0.8rem;
  justify-content: space-between;
  padding: 0.22rem 0.1rem;
  border-bottom: 1px solid var(--rule);
  font-size: 0.8rem;
}

.readings__on { color: var(--ink-muted); }
.readings__v { color: var(--ink); font-variant-numeric: tabular-nums; }

.btn {
  padding: 0.3rem 0.65rem;
  border: 1px solid var(--rule);
  border-radius: 5px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}
</style>
