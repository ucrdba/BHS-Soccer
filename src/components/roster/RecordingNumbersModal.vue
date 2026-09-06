<script setup lang="ts">
/**
 * The squad's recording numbers.
 *
 * **Numbers are PROPOSED, never assigned.** Pressing "Suggest a block" fills
 * the draft on screen and writes nothing; the coach reads it, changes what
 * they want, and saves. A number that moved on its own would silently
 * disagree with every paper sheet already written, and both the Matrix board
 * and the session grid are read against those sheets.
 *
 * The save is planned before it starts. `recording_number` is unique per
 * team, so a duplicate would stop the write halfway and leave the squad
 * part-renumbered — and a straight swap needs both sides cleared first or the
 * very first write hits the constraint.
 */
import { ref, computed, watch } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { supabaseService } from '../../data/supabase';
import { useRosterStore } from '../../stores/roster';
import {
  rosterForNumbering, suggestedNumberStart, proposeRecordingNumbers,
  duplicateNumbers, planNumberWrites, type Assignment
} from '../../domain/recording-numbers';

const props = defineProps<{ open: boolean; teamId: string | null; players: any[] }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const roster = useRosterStore();

/** playerId → what the coach wants, as typed. */
const draft = ref<Record<string, string>>({});
const startAt = ref(1);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const saving = ref(false);

const squad = computed(() => rosterForNumbering(props.players));

const assignments = computed<Assignment[]>(() => squad.value.map((p: any) => {
  const typed = String(draft.value[p.id] ?? '').trim();
  return {
    playerId: p.id,
    name: p.name,
    current: p.recordingNumber == null ? null : Number(p.recordingNumber),
    value: typed === '' ? null : Number(typed)
  };
}));

const dupes = computed(() => duplicateNumbers(assignments.value));
const pending = computed(() => planNumberWrites(assignments.value).length);

watch(() => props.open, (open) => {
  if (!open) return;
  error.value = null;
  notice.value = null;
  startAt.value = suggestedNumberStart(squad.value);
  // Opens on what the squad already has, so saving with no edits writes
  // nothing at all.
  draft.value = Object.fromEntries(squad.value.map((p: any) =>
    [p.id, p.recordingNumber == null ? '' : String(p.recordingNumber)]));
}, { immediate: true });

/**
 * Fill the draft with a suggested block. Writes nothing.
 *
 * Anyone already numbered keeps their number; the proposal fills the gaps
 * around them.
 */
function propose(): void {
  const proposed = proposeRecordingNumbers(squad.value, startAt.value);
  draft.value = Object.fromEntries(squad.value.map((p: any) =>
    [p.id, String(proposed.get(p.id) ?? '')]));
  error.value = null;
  notice.value = 'Suggested — nothing is saved until you press Save numbers.';
}

async function onSave(): Promise<void> {
  error.value = null;
  notice.value = null;

  const bad = assignments.value.find(a =>
    a.value !== null && (!Number.isInteger(a.value) || a.value < 1));
  if (bad) {
    error.value = `${bad.name}: a recording number must be a whole number of 1 or more.`;
    return;
  }

  // Refused before writing: the database would stop halfway and leave the
  // squad part-renumbered.
  if (dupes.value.length) {
    error.value = `Two players share ${dupes.value.length === 1 ? 'number' : 'numbers'} `
      + `${dupes.value.join(', ')}. Every number must be different.`;
    return;
  }

  if (!props.teamId) { error.value = 'Choose a team first.'; return; }

  const writes = planNumberWrites(assignments.value);
  if (writes.length === 0) { emit('close'); return; }

  saving.value = true;
  try {
    const failures: string[] = [];
    for (const w of writes) {
      const res = await supabaseService.setRecordingNumber(props.teamId, w.playerId, w.value);
      if (!res?.ok) {
        const who = assignments.value.find(a => a.playerId === w.playerId);
        failures.push(`${who?.name || 'A player'}: ${res?.error || 'refused'}`);
      }
    }

    if (failures.length) {
      // Which ones, not how many. A partial save is recoverable only if the
      // coach knows what did not land.
      error.value = failures.slice(0, 3).join(' · ')
        + (failures.length > 3 ? ` · and ${failures.length - 3} more` : '');
      return;
    }

    // Re-read rather than patching: the numbers live in Postgres now and
    // every screen reads them from there.
    await roster.load(props.teamId);
    emit('saved');
    emit('close');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BaseModal :open="open" title="Recording numbers" wide @close="emit('close')">
    <p class="lede">
      Recording numbers are what the paper sheets carry, and what the Matrix
      board and the session grid are read against. Suggesting a block fills
      this list — nothing is written until you save.
    </p>

    <div class="head">
      <label class="fld">
        <span class="fld__label">Start the block at</span>
        <input v-model.number="startAt" type="number" min="1" class="inp inp--narrow" data-rn-start />
      </label>
      <button type="button" class="btn" data-rn-propose @click="propose">Suggest a block</button>
      <span class="head__pending" data-rn-pending>
        {{ pending }} to save
      </span>
    </div>

    <div class="wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th class="is-text">Player</th>
            <th>Now</th>
            <th>Recording number</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in squad" :key="p.id" data-rn-row>
            <td class="is-text" data-rn-name>{{ p.name }}</td>
            <td class="tabular muted" data-rn-current>
              {{ p.recordingNumber == null ? '—' : p.recordingNumber }}
            </td>
            <td>
              <input
                v-model="draft[p.id]" type="number" min="1"
                class="inp inp--narrow" :data-rn-input="p.id"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="dupes.length" class="hint hint--bad" data-rn-dupes>
      Two players share {{ dupes.length === 1 ? 'number' : 'numbers' }}
      {{ dupes.join(', ') }}. Every number must be different.
    </p>

    <p v-if="notice" class="hint hint--good" role="status" data-rn-notice>{{ notice }}</p>
    <p v-if="error" class="hint hint--bad" role="alert" data-rn-error>{{ error }}</p>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button
        type="button" class="btn btn--primary" :disabled="saving"
        data-rn-save @click="onSave"
      >{{ saving ? 'Saving…' : 'Save numbers' }}</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.lede {
  margin: 0 0 0.9rem;
  max-width: 42rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.82rem;
  line-height: 1.5;
}

.head { display: flex; flex-wrap: wrap; gap: 0.7rem; align-items: flex-end; margin-bottom: 0.8rem; }
.head__pending { color: var(--text-muted, #94a3b8); font-size: 0.76rem; }

.fld { display: block; }

.fld__label {
  display: block;
  margin-bottom: 0.25rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.inp {
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: var(--bhs-navy-bg);
  color: #fff;
  font: inherit;
  font-size: 0.85rem;
}

.inp--narrow { max-width: 6rem; }

.wrap { overflow-x: auto; max-height: 55vh; overflow-y: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 0.85rem; }

.tbl th, .tbl td {
  padding: 0.3rem 0.5rem;
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

.tabular { font-variant-numeric: tabular-nums; }
.muted { color: var(--text-muted, #94a3b8); }

.hint { margin: 0.6rem 0 0; font-size: 0.8rem; line-height: 1.5; }
.hint--good { color: var(--bhs-cyan-accent); }
.hint--bad { color: var(--color-danger, #f87171); }

.btn {
  padding: 0.3rem 0.65rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.btn--primary { border-color: var(--bhs-cyan-accent); color: var(--bhs-cyan-accent); }
.btn:disabled { opacity: 0.55; cursor: default; }
</style>
