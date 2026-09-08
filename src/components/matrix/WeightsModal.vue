<script setup lang="ts">
/**
 * What each exercise is worth, and what kind of thing it measures.
 *
 * Weights are looked up live by `matrix_standings` rather than copied onto a
 * result, so changing one re-scores every past session. That is why saving
 * here asks the board to re-read rather than patching a number on screen.
 *
 * Standards are saved after the weights, because a band is meaningless until
 * the measure that uses it is stored — and reported by the exercise's name on
 * failure, rather than being lost behind a success message about the weights.
 *
 * Nothing on this screen proposes tightening a standard to spread scores out.
 * A threshold asks whether a player can last a full match; seventeen of
 * nineteen on 1.0 is the good outcome.
 */
import { ref, computed, watch } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import BandsEditor, { type BandDraft } from './BandsEditor.vue';
import { supabaseService } from '../../data/supabase';
import { useSessionStore } from '../../stores/session';
import { formatSecondsAsTime } from '../../domain/time';

const props = defineProps<{ open: boolean; teamId: string | null; schoolId: string | null }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const session = useSessionStore();

const MEASURES: [string, string][] = [
  ['head_to_head', '1v1 (pairings)'],
  ['win_loss', 'Small-sided (W/D/L)'],
  ['count_high', 'Counted, high wins'],
  ['time_low', 'Timed, fastest wins'],
  ['time_bands', 'Timed against a standard']
];

interface WeightDraft { id: string; name: string; category: string; points: string; measure: string }

const drafts = ref<WeightDraft[]>([]);
/**
 * Kept per drill and never discarded when the measure changes, so a coach who
 * switches away and back has not lost what they typed.
 */
const bandDrafts = ref<Record<string, BandDraft[]>>({});
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const saving = ref(false);

const banded = computed(() => drafts.value.filter(d => d.measure === 'time_bands'));

function toDrafts(drills: any[]): WeightDraft[] {
  return (drills || []).map(d => ({
    id: d.id,
    name: d.name,
    category: d.category || '',
    points: String(Number(d.points ?? 3)),
    measure: d.measure || 'head_to_head'
  }));
}

/** Saved bands arrive as seconds; the editor works in mm:ss. */
function toBandDrafts(rows: any[]): BandDraft[] {
  return (rows || []).map(b => ({
    time: formatSecondsAsTime(b.max_seconds),
    factor: String(b.factor ?? '')
  }));
}

async function load(): Promise<void> {
  error.value = null;
  notice.value = null;

  await session.loadDrills(props.schoolId);
  drafts.value = toDrafts(session.drills);

  if (!props.teamId) return;
  for (const d of banded.value) {
    const rows = await supabaseService.fetchTimeBands(d.id, props.teamId);
    bandDrafts.value = { ...bandDrafts.value, [d.id]: toBandDrafts(rows || []) };
  }
}

watch(() => props.open, (open) => { if (open) load(); }, { immediate: true });

function setMeasure(id: string, measure: string): void {
  drafts.value = drafts.value.map(d => (d.id === id ? { ...d, measure } : d));
}

function setPoints(id: string, points: string): void {
  drafts.value = drafts.value.map(d => (d.id === id ? { ...d, points } : d));
}

function setBands(id: string, rows: BandDraft[]): void {
  bandDrafts.value = { ...bandDrafts.value, [id]: rows };
}

function bandsFor(id: string): BandDraft[] {
  return bandDrafts.value[id] || [];
}

/** An untouched blank row is how the editor always looks; it is not an error. */
function filled(rows: BandDraft[]): BandDraft[] {
  return rows.filter(r => String(r.time).trim() !== '' || String(r.factor).trim() !== '');
}

async function onSave(): Promise<void> {
  error.value = null;
  notice.value = null;

  if (drafts.value.length === 0) { error.value = 'Nothing to save.'; return; }

  saving.value = true;
  try {
    const rows = drafts.value.map(d => ({
      id: d.id, points: parseFloat(d.points), measure: d.measure
    }));

    const res = await supabaseService.updateDrillWeights(rows);
    if (!res?.ok) { error.value = res?.error || 'Could not save those weights.'; return; }

    for (const d of banded.value) {
      if (!props.teamId) {
        error.value = 'Weights saved, but standards need a team. Choose one in the header.';
        return;
      }
      const bandRes = await supabaseService.saveTimeBands(d.id, props.teamId, filled(bandsFor(d.id)));
      if (!bandRes?.ok) {
        // Named, or a coach reading "saved" has no idea which exercise's
        // standards did not land.
        error.value = `Weights saved. Standards for ${d.name}: ${bandRes?.error || 'could not be saved.'}`;
        return;
      }
      // Re-read so the saved standards, and a fresh spare row, are there to
      // carry on with.
      const fresh = await supabaseService.fetchTimeBands(d.id, props.teamId);
      bandDrafts.value = { ...bandDrafts.value, [d.id]: toBandDrafts(fresh || []) };
    }

    const n = res.updated ?? rows.length;
    notice.value = `Saved ${n} exercise${n === 1 ? '' : 's'}. Standings re-scored.`;
    emit('saved');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BaseModal :open="open" title="Weights and standards" wide @close="emit('close')">
    <p class="lede">
      A weight is what an exercise is worth against the others. Changing one
      re-scores every session already recorded, because the standings read the
      weight rather than a copy of it.
    </p>

    <p v-if="drafts.length === 0" class="hint" data-weights-empty>
      No exercises yet. Add drills in the practice planner first.
    </p>

    <div v-for="d in drafts" :key="d.id" class="row" :data-weight-row="d.id">
      <div class="row__top">
        <span class="row__name">
          {{ d.name }}
          <span v-if="d.category" class="row__cat">{{ d.category }}</span>
        </span>

        <input
          class="inp inp--narrow" type="number" step="0.5" min="0" max="10"
          aria-label="Weight"
          :value="d.points" data-weight-points
          @input="setPoints(d.id, ($event.target as HTMLInputElement).value)"
        />

        <select
          class="inp inp--wide" aria-label="Measured as"
          :value="d.measure" data-measure
          @change="setMeasure(d.id, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="[value, label] in MEASURES" :key="value" :value="value">{{ label }}</option>
        </select>
      </div>

      <BandsEditor
        v-if="d.measure === 'time_bands'"
        :drill-id="d.id" :rows="bandsFor(d.id)"
        @update:rows="setBands(d.id, $event)"
      />
    </div>

    <p v-if="notice" class="hint hint--good" role="status" data-weights-notice>{{ notice }}</p>
    <p v-if="error" class="hint hint--bad" role="alert" data-weights-error>{{ error }}</p>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Close</button>
      <button
        type="button" class="btn btn--primary" :disabled="saving"
        data-weights-save @click="onSave"
      >{{ saving ? 'Saving…' : 'Save' }}</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.lede {
  margin: 0 0 0.9rem;
  max-width: 40rem;
  color: var(--ink-muted);
  font-size: 0.82rem;
  line-height: 1.5;
}

.row { padding: 0.4rem 0; border-bottom: 1px solid var(--rule); }
.row__top { display: flex; gap: 0.5rem; align-items: center; }
.row__name { flex: 1; color: var(--ink); font-size: 0.85rem; }
.row__cat { margin-left: 0.4rem; color: var(--ink-muted); font-size: 0.72rem; }

.inp {
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--rule);
  border-radius: 5px;
  background: var(--surface-deep);
  color: var(--ink);
  font: inherit;
  font-size: 0.8rem;
}

.inp--narrow { max-width: 5rem; }
.inp--wide { max-width: 12rem; }

.hint { margin: 0.7rem 0 0; color: var(--ink-muted); font-size: 0.8rem; line-height: 1.5; }
.hint--good { color: var(--live); }
.hint--bad { color: var(--color-danger); }

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

.btn--primary { border-color: var(--live); color: var(--live); }
.btn:disabled { opacity: 0.55; cursor: default; }
</style>
