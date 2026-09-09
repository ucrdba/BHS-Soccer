<script setup lang="ts">
/**
 * Every player against every other, once.
 *
 * The schedule itself is `buildRoundRobin` — the circle method, which is what
 * guarantees nobody appears twice in a round and rotates the bye so nobody
 * sits out more than once. This is the sheet a coach reads off.
 *
 * **A pairing already played is marked with its result.** A round robin is
 * run across several sessions rather than in one go, so what a coach most
 * needs from this screen is what is left.
 *
 * Players are labelled by recording number, because the sheet is read beside
 * the paper ones.
 */
import { ref, computed, watch } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { supabaseService } from '../../data/supabase';
import {
  buildRoundRobin, roundRobinLabel, roundRobinCsv
} from '../../domain/round-robin';

const props = defineProps<{
  open: boolean;
  teamId: string | null;
  players: any[];
}>();

const emit = defineEmits<{ close: [] }>();

const logs = ref<any[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

const rounds = computed(() => buildRoundRobin(props.players, logs.value));

const remaining = computed(() =>
  rounds.value.reduce((n, r) =>
    n + r.matches.filter((m: any) => !m.bye && !m.played).length, 0));

const total = computed(() =>
  rounds.value.reduce((n, r) => n + r.matches.filter((m: any) => !m.bye).length, 0));

watch(() => [props.open, props.teamId] as const, async () => {
  if (!props.open) return;
  loadError.value = null;

  if (!props.teamId) { loadError.value = 'Choose a team first.'; return; }

  loading.value = true;
  try {
    const rows = await supabaseService.fetchMatrixLogs(props.teamId);
    // Null is a failed read. Showing every pairing as unplayed would send a
    // coach to run fixtures they have already run.
    if (rows === null) {
      loadError.value = 'Could not load which pairings have been played.';
      logs.value = [];
      return;
    }
    logs.value = rows;
  } finally {
    loading.value = false;
  }
}, { immediate: true });

const label = roundRobinLabel;

/**
 * The schedule as a file.
 *
 * A round robin is run off paper, so this is the sheet that gets printed and
 * carried.
 */
function downloadCsv(): void {
  const csv = roundRobinCsv(rounds.value);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'round-robin.csv';
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <BaseModal :open="open" title="1v1 round robin" wide @close="emit('close')">
    <p class="lede">
      Every player against every other, once. Pairings already recorded in the
      Matrix are marked, so this can be run across several sessions.
    </p>

    <p v-if="loading" class="state">Loading…</p>
    <p v-else-if="loadError" class="state state--bad" role="alert" data-rr-error>{{ loadError }}</p>

    <p v-else-if="rounds.length === 0" class="state" data-rr-empty>
      A round robin needs at least two players on the team.
    </p>

    <template v-else>
      <div class="bar">
        <span data-rr-remaining>{{ remaining }} of {{ total }} still to play</span>
        <span class="spacer" />
        <button type="button" class="btn" data-rr-csv @click="downloadCsv">Download CSV</button>
      </div>

      <section v-for="r in rounds" :key="r.round" class="round" data-rr-round>
        <h3 class="round__h kicker">Round {{ r.round }}</h3>

        <div
          v-for="(m, i) in r.matches" :key="i"
          class="match" :class="{ 'is-played': m.played, 'is-bye': m.bye }"
          data-rr-match
        >
          <template v-if="m.bye">
            <span class="match__who">{{ label(m.a) }}</span>
            <span class="match__bye" data-rr-bye>bye</span>
          </template>
          <template v-else>
            <span class="match__who">{{ label(m.a) }}</span>
            <span class="match__v">v</span>
            <span class="match__who">{{ label(m.b) }}</span>
            <span v-if="m.played" class="match__result" data-rr-result>{{ m.result || 'played' }}</span>
          </template>
        </div>
      </section>
    </template>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Close</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.lede { margin: 0 0 var(--space-3); max-width: 42rem; color: var(--ink-muted); font-size: 13px; line-height: 1.5; }

.state { padding: var(--space-6) 0; color: var(--ink-muted); text-align: center; font-size: 14px; }
.state--bad { color: var(--color-danger); }

.bar { display: flex; gap: var(--space-2); align-items: center; margin-bottom: var(--space-3); color: var(--ink-muted); font-size: 13px; }

.spacer { flex: 1; }

.round { margin-bottom: var(--space-3); }
.round__h { margin: 0 0 var(--space-1); }

.match {
  display: flex;
  gap: var(--space-2);
  align-items: baseline;
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--rule);
  font-size: 13px;
}

.match.is-played { color: var(--ink-muted); }
.match.is-bye { color: var(--ink-muted); font-style: italic; }

.match__who { color: inherit; }
.match__v { color: var(--ink-muted); font-size: 12px; }
.match__bye { color: var(--ink-muted); font-size: 12px; }
.match__result { margin-left: auto; color: var(--rule-strong); font-size: 12px; }
</style>
