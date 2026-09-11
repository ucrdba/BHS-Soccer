<script setup lang="ts">
/**
 * One 1v1, recorded.
 *
 * A `head_to_head` exercise is scored from pairings in `matrix_logs` — one row
 * naming both players and who won — and not from a session, because a session
 * result is one row per player and has nowhere to put the opponent. The Matrix
 * screen has said "Recorded as pairings, not a session" for some time; this is
 * the screen that sentence promises. `logMatrixResult` and its RLS have been
 * in place throughout, with nothing in the app calling them since the original
 * record modal was deleted in Phase 7.
 *
 * Players are labelled by recording number, the same as the round-robin sheet,
 * because both are read beside the paper one.
 */
import { ref, computed, watch } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { supabaseService } from '../../data/supabase';
import { roundRobinPlayers, roundRobinLabel, roundRobinPlayed } from '../../domain/round-robin';

const props = defineProps<{
  open: boolean;
  teamId: string | null;
  /** The head_to_head exercise being recorded. */
  drillId: string;
  drillName: string;
  players: any[];
  /** Pairings already recorded, to catch a duplicate before it double-counts. */
  logs: any[];
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

const playerAId = ref('');
const playerBId = ref('');
const outcome = ref('');
const scoreText = ref('');
const occurredOn = ref('');
const error = ref<string | null>(null);
const saving = ref(false);

const today = (): string => new Date().toISOString().slice(0, 10);

/** Sorted by recording number and without the deleted, as the sheet reads. */
const roster = computed(() => roundRobinPlayers(props.players));

const playerA = computed(() => roster.value.find(p => p.id === playerAId.value) || null);
const playerB = computed(() => roster.value.find(p => p.id === playerBId.value) || null);

/**
 * The pairing this would record, if it has already been recorded.
 *
 * Keyed on the unordered pair, because "Caleb beat Cesar" is the same fixture
 * as "Cesar v Caleb" — and each side is scored separately, so recording it
 * twice counts both players twice in the standings.
 */
const alreadyPlayed = computed(() => {
  if (!playerAId.value || !playerBId.value) return null;
  const key = [playerAId.value, playerBId.value].sort().join('|');
  return roundRobinPlayed(props.logs)[key] || null;
});

/** What the existing result was, named rather than left as "a" or "b". */
const existingResult = computed(() => {
  const hit = alreadyPlayed.value;
  if (!hit || !hit.outcome) return '';
  if (hit.outcome === 'draw') return 'a draw';

  // The stored outcome names which of the LOGGED pair won, which may be
  // either of the two chosen here.
  const winnerId = hit.outcome === 'a' ? hit.a : hit.b;
  const winner = roster.value.find(p => p.id === winnerId);
  return winner ? `${roundRobinLabel(winner)} winning` : 'a result';
});

/** Reset on each open, so yesterday's pairing is not half-filled in. */
watch(() => props.open, (open) => {
  if (!open) return;
  playerAId.value = '';
  playerBId.value = '';
  outcome.value = '';
  scoreText.value = '';
  occurredOn.value = today();
  error.value = null;
});

const sameTwice = computed(() =>
  !!playerAId.value && playerAId.value === playerBId.value);

const ready = computed(() =>
  !!playerAId.value && !!playerBId.value && !sameTwice.value && !!outcome.value);

/** The three outcomes, named by the players rather than by a or b. */
const outcomes = computed(() => [
  { value: 'a', label: playerA.value ? `${roundRobinLabel(playerA.value)} won` : 'First player won' },
  { value: 'draw', label: 'Draw' },
  { value: 'b', label: playerB.value ? `${roundRobinLabel(playerB.value)} won` : 'Second player won' }
]);

async function onSave(): Promise<void> {
  error.value = null;

  if (sameTwice.value) { error.value = 'A player cannot play themselves.'; return; }
  if (!ready.value) { error.value = 'Choose both players and who won.'; return; }

  saving.value = true;
  try {
    const res = await supabaseService.logMatrixResult(props.teamId || '', {
      playerAId: playerAId.value,
      playerBId: playerBId.value,
      outcome: outcome.value,
      scoreText: scoreText.value.trim() || null,
      occurredOn: occurredOn.value || today(),
      drillId: props.drillId
    });

    if (!res?.ok) { error.value = res?.error || 'Could not record that result.'; return; }

    emit('saved');
    emit('close');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BaseModal :open="open" :title="`Record a 1v1 — ${drillName}`" @close="emit('close')">
    <div class="form">
      <div class="pair">
        <label class="field">
          <span class="field__label">Player</span>
          <select v-model="playerAId" class="input" data-result-player-a>
            <option value="">Choose a player</option>
            <option v-for="p in roster" :key="p.id" :value="p.id">{{ roundRobinLabel(p) }}</option>
          </select>
        </label>

        <span class="pair__v" aria-hidden="true">v</span>

        <label class="field">
          <span class="field__label">Opponent</span>
          <select v-model="playerBId" class="input" data-result-player-b>
            <option value="">Choose a player</option>
            <option v-for="p in roster" :key="p.id" :value="p.id">{{ roundRobinLabel(p) }}</option>
          </select>
        </label>
      </div>

      <p v-if="sameTwice" class="note note--bad" role="alert" data-result-same>
        A player cannot play themselves.
      </p>

      <fieldset class="field field--wide outcomes">
        <legend class="field__label">Result</legend>
        <button
          v-for="o in outcomes" :key="o.value"
          type="button" class="outcome" :class="{ 'is-on': outcome === o.value }"
          :aria-pressed="outcome === o.value"
          :data-result-outcome="o.value" @click="outcome = o.value"
        >{{ o.label }}</button>
      </fieldset>

      <div class="pair">
        <label class="field">
          <span class="field__label">Date</span>
          <input v-model="occurredOn" type="date" class="input" data-result-date />
        </label>

        <label class="field">
          <!--
            Free text, not a pair of numbers: 1v1s are scored on the outcome
            alone, and a score is a note about how it went.
          -->
          <span class="field__label">Score <span class="field__hint">optional</span></span>
          <input
            v-model="scoreText" type="text" class="input"
            placeholder="e.g. 3-1" data-result-score />
        </label>
      </div>

      <!--
        Each side of a pairing is scored separately, so recording the same
        fixture twice counts both players twice. Said rather than refused: a
        replayed fixture is a real thing, and only the coach knows which it is.

        One press, not two. The warning is on screen from the moment the
        pairing is chosen, and the button says "Record anyway", so the press
        is already the informed one -- a confirm step here would ask the coach
        to acknowledge something they are looking at.
      -->
      <p v-if="alreadyPlayed" class="note note--warn" role="status" data-result-duplicate>
        These two are already recorded against each other, with
        {{ existingResult }}. Recording another counts both pairings, which is
        right for a replay and wrong for a second entry of the same one.
      </p>

      <p v-if="error" class="note note--bad" role="alert" data-result-error>{{ error }}</p>
    </div>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button
        type="button" class="btn btn--go" :disabled="saving || !ready"
        data-result-save @click="onSave"
      >{{ saving ? 'Recording…' : (alreadyPlayed ? 'Record anyway' : 'Record result') }}</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--space-3); }

.pair {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: var(--space-2);
  align-items: end;
}

/* The date and score row has no middle column to fill. */
.pair:last-of-type { grid-template-columns: 1fr 1fr; }

.pair__v {
  padding-bottom: var(--space-2);
  color: var(--ink-soft);
  font-size: 13px;
  font-style: italic;
}

.field__label {
  color: var(--ink-muted);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.field__hint { color: var(--ink-soft); letter-spacing: 0; text-transform: none; }

.outcomes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  border: 0;
}

.outcome {
  flex: 1 1 8rem;
  min-height: 38px;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.outcome.is-on { border-color: var(--live); color: var(--live); }

.note--warn { color: var(--color-warning); }

@media (max-width: 520px) {
  .pair, .pair:last-of-type { grid-template-columns: 1fr; }
  .pair__v { padding: 0; }
}
</style>
