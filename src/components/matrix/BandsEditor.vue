<script setup lang="ts">
/**
 * The standards one squad is held to on one exercise.
 *
 * A row is a threshold and what meeting it earns: 4:30 → 1, 4:40 → 0.5. The
 * factor multiplies the exercise's weight, so 1 earns the whole thing.
 *
 * Per squad, deliberately. `drill_time_bands` is keyed on
 * `(drill_id, team_id, max_seconds)`, because a 4:30 that stretches a varsity
 * side is out of reach for an under-14 — and the unique index stops two bands
 * at one threshold making a score ambiguous.
 *
 * There is always at least one row of boxes. Removing the last would leave a
 * section with no way back into it.
 */
import { computed } from 'vue';

export interface BandDraft { time: string; factor: string }

const props = defineProps<{ drillId: string; rows: BandDraft[] }>();
const emit = defineEmits<{ 'update:rows': [BandDraft[]] }>();

const shown = computed<BandDraft[]>(() =>
  props.rows.length ? props.rows : [{ time: '', factor: '' }]);

function set(index: number, field: keyof BandDraft, value: string): void {
  const next = shown.value.map((r, i) => (i === index ? { ...r, [field]: value } : r));
  emit('update:rows', next);
}

function add(): void {
  emit('update:rows', shown.value.concat([{ time: '', factor: '' }]));
}

function remove(index: number): void {
  const kept = shown.value.filter((_, i) => i !== index);
  emit('update:rows', kept.length ? kept : [{ time: '', factor: '' }]);
}
</script>

<template>
  <div class="bands" :data-bands="props.drillId">
    <p class="bands__head">
      Standards for this squad — tightest first. The number earned multiplies
      the exercise's weight, so 1 earns all of it.
    </p>

    <div v-for="(row, i) in shown" :key="i" class="bands__row" data-band-row>
      <input
        class="inp" type="text" placeholder="4:30"
        aria-label="Time"
        :value="row.time" data-band-time
        @input="set(i, 'time', ($event.target as HTMLInputElement).value)"
      />
      <span class="arrow">→</span>
      <input
        class="inp inp--narrow" type="number" step="0.25" min="0" max="1"
        placeholder="1"
        aria-label="Earns"
        :value="row.factor" data-band-factor
        @input="set(i, 'factor', ($event.target as HTMLInputElement).value)"
      />
      <button type="button" class="btn btn--quiet" data-band-remove @click="remove(i)">Remove</button>
    </div>

    <button type="button" class="btn btn--quiet" :data-band-add="props.drillId" @click="add">
      + Add a standard
    </button>
  </div>
</template>

<style scoped>
.bands {
  margin: 0.4rem 0 0.2rem 1rem;
  padding: 0.5rem 0.7rem;
  border-left: 2px solid var(--bhs-navy-border);
}

.bands__head {
  margin: 0 0 0.45rem;
  max-width: 34rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.74rem;
  line-height: 1.5;
}

.bands__row { display: flex; gap: 0.4rem; align-items: center; margin-bottom: 0.35rem; }
.arrow { color: var(--text-muted, #94a3b8); font-size: 0.8rem; }

.inp {
  max-width: 6rem;
  padding: 0.28rem 0.45rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: var(--bhs-navy-bg);
  color: #fff;
  font: inherit;
  font-size: 0.8rem;
}

.inp--narrow { max-width: 4.5rem; }

.btn {
  padding: 0.22rem 0.55rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}
</style>
