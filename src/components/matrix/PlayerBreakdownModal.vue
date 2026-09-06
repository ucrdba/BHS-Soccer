<script setup lang="ts">
/**
 * Where one player's points came from.
 *
 * The board gives a number; this says why. Every row is phrased for the
 * exercise it came from, because a time read as a bare figure looks like the
 * points column beside it.
 */
import { ref, computed, watch } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { supabaseService } from '../../data/supabase';
import { breakdownDetail } from '../../domain/matrix-breakdown';
import { useMatrixStore } from '../../stores/matrix';

const props = defineProps<{ playerId: string | null; teamId: string | null }>();
const emit = defineEmits<{ close: [] }>();

const matrix = useMatrixStore();
const rows = ref<any[] | null>(null);
const loading = ref(false);
const failed = ref(false);

const player = computed(() =>
  matrix.players.find((p: any) => p.id === props.playerId) || null);

const names = computed(() =>
  new Map(matrix.players.map((p: any) => [p.id, p.name])));

watch(() => props.playerId, async (id) => {
  rows.value = null;
  failed.value = false;
  if (!id || !props.teamId) return;

  loading.value = true;
  try {
    rows.value = await supabaseService.fetchPlayerBreakdown(props.teamId, id);
    // Null is a failed read, not an empty history — the two read very
    // differently to a coach checking why a number is low.
    failed.value = rows.value === null;
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}, { immediate: true });

function detail(row: any): string {
  return breakdownDetail(row, names.value as Map<string, string>, matrix.drillsBank);
}
</script>

<template>
  <BaseModal
    :open="playerId !== null"
    :title="player ? player.name : 'Player'"
    wide
    @close="emit('close')"
  >
    <p v-if="loading" class="state">Loading…</p>

    <p v-else-if="failed" class="state state--bad" role="alert" data-breakdown-error>
      Could not load this player's results.
    </p>

    <p v-else-if="!rows || rows.length === 0" class="state" data-breakdown-empty>
      Nothing recorded for this player yet.
    </p>

    <div v-else class="wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th>Date</th><th class="is-text">Exercise</th>
            <th class="is-text">What happened</th><th>Earned</th><th>Of</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="i" data-breakdown-row>
            <td class="nowrap">{{ r.occurred_on || '—' }}</td>
            <td class="is-text">{{ r.exercise || '—' }}</td>
            <td class="is-text" data-breakdown-detail>{{ detail(r) }}</td>
            <td class="tabular"><strong>{{ Number(r.earned ?? 0).toFixed(2) }}</strong></td>
            <td class="tabular muted">{{ Number(r.available ?? 0).toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </BaseModal>
</template>

<style scoped>
.state { padding: 1.5rem 0; color: var(--text-muted, #94a3b8); text-align: center; font-size: 0.88rem; }
.state--bad { color: var(--color-danger, #f87171); }

.wrap { overflow-x: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 0.85rem; }

.tbl th, .tbl td {
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid var(--bhs-navy-border);
  text-align: right;
}

.tbl th.is-text, .tbl td.is-text { text-align: left; }

.tbl th {
  color: var(--bhs-cyan-accent);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.nowrap { white-space: nowrap; }
.tabular { font-variant-numeric: tabular-nums; }
.muted { color: var(--text-muted, #94a3b8); }
</style>
