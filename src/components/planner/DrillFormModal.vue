<script setup lang="ts">
/**
 * One drill in the session — added or edited.
 *
 * The times are three-way and that is the whole of the difficulty here.
 * Typing a start and an end fills the duration; picking a duration fills the
 * end; and either edit leaves the third field agreeing with the other two,
 * because a form where the duration says 20 min and the times say fifteen
 * prints a plan a coach cannot run against a watch.
 *
 * A new drill starts where the last one ended: adding a drill means "and then
 * this", not "at four o'clock".
 */
import { ref, computed, watch } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { usePlannerStore } from '../../stores/planner';
import { formatDuration, type PlanItem } from '../../domain/practice-plan';
import {
  slotFromRange, endFromDuration, nextDrillStart, DURATION_PRESETS
} from '../../domain/drill-time';
import { format12hTo24h } from '../../domain/schedule-view';

const props = defineProps<{
  open: boolean;
  /** Null to add; an index to edit the drill already there. */
  index: number | null;
}>();

const emit = defineEmits<{ close: []; save: [PlanItem] }>();

const planner = usePlannerStore();

const name = ref('');
const notes = ref('');
const start = ref('16:00');
const end = ref('16:20');
const durationChoice = ref('20 min');
const fromLibrary = ref('');
const error = ref<string | null>(null);

const editing = computed(() => props.index !== null);
const current = computed(() =>
  (props.index === null ? null : planner.items[props.index] || null));

const slot = computed(() => slotFromRange(start.value, end.value));

/** The library, for starting from a drill the organization already has. */
const library = computed(() => planner.drillsBank || []);

function startOf(slotText: string): string | null {
  if (!slotText || !slotText.includes('-')) return null;
  return format12hTo24h(slotText.split('-')[0].trim()) || null;
}

function endOf(slotText: string): string | null {
  if (!slotText || !slotText.includes('-')) return null;
  const parts = slotText.split('-');
  return format12hTo24h(parts[parts.length - 1].trim()) || null;
}

watch(() => [props.open, props.index] as const, () => {
  if (!props.open) return;
  error.value = null;
  fromLibrary.value = '';

  const drill = current.value;
  if (drill) {
    name.value = drill.name;
    notes.value = drill.coachNotes || '';
    start.value = startOf(drill.time) || '16:00';
    end.value = endOf(drill.time) || endFromDuration(start.value, drill.duration) || '16:20';
  } else {
    name.value = '';
    notes.value = '';
    start.value = nextDrillStart(planner.items);
    end.value = endFromDuration(start.value, '20 min') || '16:20';
  }
  syncChoice();
}, { immediate: true });

/**
 * Keep the preset picker honest.
 *
 * A duration the list does not hold selects "custom" rather than the nearest
 * preset, which would quietly change the drill the coach just timed.
 */
function syncChoice(): void {
  const mins = slot.value?.duration || '';
  durationChoice.value = DURATION_PRESETS.includes(mins) ? mins : 'custom';
}

function onTimesChanged(): void {
  syncChoice();
}

function onDurationPicked(value: string): void {
  durationChoice.value = value;
  if (value === 'custom') return;

  const next = endFromDuration(start.value, value);
  if (next) end.value = next;
}

/** Starting from a library drill copies its name, timing and diagram. */
function onPickFromLibrary(id: string): void {
  fromLibrary.value = id;
  const drill = library.value.find((d: any) => d.id === id);
  if (!drill) return;

  name.value = drill.name || '';
  notes.value = drill.coach_notes || drill.coachNotes || '';
  if (drill.duration) onDurationPicked(formatDuration(drill.duration));
}

function onSave(): void {
  const trimmed = name.value.trim();
  if (!trimmed) { error.value = 'Give the drill a name.'; return; }
  if (!slot.value) { error.value = 'Set a start and an end time.'; return; }

  const picked = library.value.find((d: any) => d.id === fromLibrary.value);

  emit('save', {
    ...(current.value || {}),
    name: trimmed,
    time: slot.value.slot,
    duration: slot.value.duration,
    coachNotes: notes.value,
    // A library drill brings its diagram with it; an edit keeps its own.
    diagramImage: picked?.diagram_image ?? current.value?.diagramImage ?? null,
    diagramData: picked?.diagram_data ?? current.value?.diagramData ?? null
  });
}
</script>

<template>
  <BaseModal
    :open="open"
    :title="editing ? 'Edit drill' : 'Add a drill'"
    wide
    @close="emit('close')"
  >
    <label v-if="!editing && library.length" class="field">
      <span class="fld__label kicker">Start from a drill in the library</span>
      <select
        class="input" data-drill-library
        :value="fromLibrary"
        @change="onPickFromLibrary(($event.target as HTMLSelectElement).value)"
      >
        <option value="">— write a new one —</option>
        <option v-for="d in library" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>
    </label>

    <label class="field">
      <span class="fld__label kicker">Drill</span>
      <input v-model="name" type="text" class="input input--wide" data-drill-name-input />
    </label>

    <div class="times">
      <label class="field">
        <span class="fld__label kicker">Starts</span>
        <input
          v-model="start" type="time" class="input" data-drill-start
          @change="onTimesChanged"
        />
      </label>

      <label class="field">
        <span class="fld__label kicker">Ends</span>
        <input
          v-model="end" type="time" class="input" data-drill-end
          @change="onTimesChanged"
        />
      </label>

      <label class="field">
        <span class="fld__label kicker">Runs for</span>
        <select
          class="input" data-drill-duration
          :value="durationChoice"
          @change="onDurationPicked(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="d in DURATION_PRESETS" :key="d" :value="d">{{ d }}</option>
          <option value="custom">Custom</option>
        </select>
      </label>
    </div>

    <p class="slot" data-drill-slot>
      {{ slot ? `${slot.slot} · ${slot.duration}` : 'Set a start and an end time.' }}
    </p>

    <label class="field">
      <span class="fld__label kicker">Coach focus and notes</span>
      <textarea v-model="notes" class="input input--wide" rows="4" data-drill-notes />
    </label>

    <p v-if="error" class="note note--bad" role="alert" data-drill-error>{{ error }}</p>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="button" class="btn btn--go" data-drill-save @click="onSave">
        {{ editing ? 'Save drill' : 'Add to the plan' }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.field { margin-bottom: var(--space-3); }

.times { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.times .field { margin-bottom: var(--space-2); }

.slot { margin: 0 0 var(--space-3); color: var(--ink-muted); font-size: 13px; }
</style>
