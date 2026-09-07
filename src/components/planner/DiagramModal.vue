<script setup lang="ts">
/**
 * Drawing a drill.
 *
 * Opened from a drill on the timeline or from one in the library, and it
 * saves back to whichever it came from — a plan row through the planner
 * store, a library drill through `upsertDrillBankItem`.
 *
 * Both a `diagramData` blob and a `diagramImage` thumbnail are written. The
 * blob is the diagram; the image is what the timeline and the printed plan
 * show without instantiating a board.
 */
import { ref, computed, watch } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import TacticalBoard from './TacticalBoard.vue';
import { supabaseService } from '../../data/supabase';
import { usePlannerStore } from '../../stores/planner';

const props = defineProps<{
  open: boolean;
  /** A drill on the timeline, by index. */
  index?: number | null;
  /** Or a drill in the library. */
  libraryDrill?: any | null;
  teamId: string | null;
  schoolId: string | null;
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

const planner = usePlannerStore();
const board = ref<any>(null);
const error = ref<string | null>(null);
const saving = ref(false);

const planDrill = computed(() =>
  (props.index === null || props.index === undefined ? null : planner.items[props.index] || null));

const title = computed(() =>
  planDrill.value?.name || props.libraryDrill?.name || 'Tactical diagram');

/** Whichever diagram this was opened on. */
const diagram = computed(() =>
  planDrill.value?.diagramData
  ?? props.libraryDrill?.diagram_data
  ?? props.libraryDrill?.diagramData
  ?? null);

watch(() => props.open, (open) => { if (open) error.value = null; });

async function onSave(): Promise<void> {
  error.value = null;

  const data = board.value?.diagramData?.();
  if (!data) { error.value = 'The board is not ready yet.'; return; }
  const image = board.value?.image?.() || null;

  saving.value = true;
  try {
    if (planDrill.value && props.index !== null && props.index !== undefined) {
      const res = await planner.editDrill(props.teamId, props.index, {
        ...planDrill.value, diagramData: data, diagramImage: image
      });
      if (!res?.ok) { error.value = res?.error || 'Could not save that diagram.'; return; }
    } else if (props.libraryDrill) {
      if (!props.schoolId) {
        error.value = 'No organization for this team, so there is no library to save to.';
        return;
      }
      const saved = await supabaseService.upsertDrillBankItem(props.schoolId, {
        id: props.libraryDrill.id,
        name: props.libraryDrill.name,
        category: props.libraryDrill.category,
        diagramData: data,
        diagramImage: image
      });
      if (!saved) { error.value = 'Could not save that diagram.'; return; }
      await planner.loadDrillsBank(props.schoolId);
    } else {
      error.value = 'Nothing to save this diagram to.';
      return;
    }

    emit('saved');
    emit('close');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BaseModal :open="open" :title="title" wide @close="emit('close')">
    <TacticalBoard
      v-if="open" ref="board"
      :diagram="diagram" :active="open"
      data-diagram-board />

    <p v-if="error" class="hint hint--bad" role="alert" data-diagram-error>{{ error }}</p>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button
        type="button" class="btn btn--primary" :disabled="saving"
        data-diagram-save @click="onSave"
      >{{ saving ? 'Saving…' : 'Save diagram' }}</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.hint { margin: 0.6rem 0 0; font-size: 0.8rem; line-height: 1.5; }
.hint--bad { color: var(--color-danger, #f87171); }

.btn {
  padding: 0.3rem 0.65rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.btn--primary { border-color: var(--bhs-cyan-accent); color: var(--bhs-cyan-accent); }
.btn:disabled { opacity: 0.55; cursor: default; }
</style>
