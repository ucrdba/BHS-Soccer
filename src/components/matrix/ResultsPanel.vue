<script setup lang="ts">
/**
 * Every logged head-to-head result, with somewhere to correct one.
 *
 * This panel is not optional. Points are derived in Postgres rather than
 * stored, and the argument for that design is that correcting a mis-entered
 * result re-derives every rank — which only holds if there is somewhere to
 * correct it. Without this, a typo needs the SQL editor.
 *
 * Coach only, and absent from anyone else's document rather than hidden.
 */
import { computed } from 'vue';
import { useMatrixStore } from '../../stores/matrix';
import { resultVerdict, resultLabel } from '../../domain/matrix-breakdown';

const matrix = useMatrixStore();
const props = defineProps<{ canEdit: boolean }>();
const emit = defineEmits<{ remove: [any] }>();

const byId = computed(() => new Map(matrix.players.map((p: any) => [p.id, p])));
const drillById = computed(() => new Map(matrix.drillsBank.map((d: any) => [d.id, d])));

const rows = computed(() => matrix.logs.map((l: any) => {
  const v = resultVerdict(l);
  return {
    log: l,
    drew: v.drew,
    a: resultLabel(v.aId, byId.value),
    b: resultLabel(v.bId, byId.value),
    winner: v.winnerId ? resultLabel(v.winnerId, byId.value) : null,
    loser: v.loserId ? resultLabel(v.loserId, byId.value) : null,
    drill: drillById.value.get(l.drill_id)?.name || null
  };
}));
</script>

<template>
  <section v-if="props.canEdit" class="results" data-results-panel>
    <h2 class="results__title">
      Logged results
      <span v-if="rows.length" class="results__count">{{ rows.length }}</span>
    </h2>

    <p v-if="rows.length === 0" class="results__empty" data-results-empty>
      No results recorded yet. Every result logged here is what the leaderboard
      is calculated from.
    </p>

    <div v-else class="wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th>Date</th><th class="is-text">Result</th>
            <th>Score</th><th>Exercise</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.log.id" data-result-row>
            <td class="nowrap">{{ r.log.occurred_on || '—' }}</td>
            <td class="is-text">
              <!-- The winner is marked, rather than leaving a reader to decode
                   which of 'a' and 'b' the stored outcome named. -->
              <template v-if="r.drew">
                {{ r.a }} <span class="muted">drew with</span> {{ r.b }}
              </template>
              <template v-else>
                <strong class="won">{{ r.winner }}</strong>
                <span class="muted"> beat </span>{{ r.loser }}
              </template>
            </td>
            <td>{{ r.log.score_text || '—' }}</td>
            <td>{{ r.drill || '—' }}</td>
            <td class="nowrap">
              <button
                type="button" class="btn btn--danger" data-result-remove
                @click="emit('remove', r)"
              >Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.results { margin-top: 2rem; }

.results__title {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  margin: 0 0 0.7rem;
  color: var(--live);
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.results__count {
  padding: 0.05rem 0.45rem;
  border: 1px solid var(--rule);
  border-radius: 999px;
  color: var(--ink-muted);
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
}

.results__empty {
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.85rem;
  line-height: 1.5;
}

.wrap { overflow-x: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 0.85rem; }

.tbl th, .tbl td {
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid var(--rule);
  text-align: right;
}

.tbl th.is-text, .tbl td.is-text { text-align: left; }

.tbl th {
  color: var(--live);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.nowrap { white-space: nowrap; }
.muted { color: var(--ink-muted); }
.won { color: var(--rule-strong); }

.btn {
  padding: 0.25rem 0.55rem;
  border: 1px solid var(--rule);
  border-radius: 5px;
  background: transparent;
  color: var(--ink-muted);
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}

.btn--danger:hover { border-color: var(--color-danger); color: var(--color-danger); }
</style>
