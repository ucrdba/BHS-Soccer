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
 *
 * Closing this discards whatever is on the board, and the board looks the
 * same saved or not — so a close that would throw work away asks first.
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

/**
 * Close, unless that would lose a diagram nobody has saved.
 *
 * Every way out of this modal arrives here — Cancel, Escape and a click on
 * the backdrop — because BaseModal emits one `close` for all three.
 */
function onClose(): void {
  if (board.value?.isDirty?.()) {
    const ok = window.confirm(
      'This diagram has changes that have not been saved.\n\n'
      + 'Close it and lose them?'
    );
    if (!ok) return;
  }
  emit('close');
}

async function onSave(): Promise<void> {
  error.value = null;

  const data = board.value?.diagramData?.();
  if (!data) { error.value = 'The board is not ready yet.'; return; }
  const image = board.value?.image?.() || null;

  /*
   * Whether the board was holding unsaved work when Save was pressed.
   *
   * Restored on a refusal, because saving to a drill on the timeline goes
   * through the planner store, which writes the drill into its local list
   * BEFORE it persists -- and that write feeds back down into the board as a
   * load, which clears the flag. Without this, a refused write leaves a
   * diagram that only exists in the canvas looking saved.
   */
  const wasDirty = board.value?.isDirty?.() === true;
  const refuse = (message: string): void => {
    error.value = message;
    if (wasDirty) board.value?.markDirty?.();
  };

  saving.value = true;
  try {
    if (planDrill.value && props.index !== null && props.index !== undefined) {
      const res = await planner.editDrill(props.teamId, props.index, {
        ...planDrill.value, diagramData: data, diagramImage: image
      });
      if (!res?.ok) { refuse(res?.error || 'Could not save that diagram.'); return; }
    } else if (props.libraryDrill) {
      if (!props.schoolId) {
        refuse('No organization for this team, so there is no library to save to.');
        return;
      }
      const saved = await supabaseService.upsertDrillBankItem(props.schoolId, {
        id: props.libraryDrill.id,
        name: props.libraryDrill.name,
        category: props.libraryDrill.category,
        diagramData: data,
        diagramImage: image
      });
      if (!saved) { refuse('Could not save that diagram.'); return; }
      await planner.loadDrillsBank(props.schoolId);
    } else {
      refuse('Nothing to save this diagram to.');
      return;
    }

    // Saved, so the board is no longer holding anything that would be lost.
    board.value?.markSaved?.();
    emit('saved');
    emit('close');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BaseModal :open="open" :title="title" wide @close="onClose">
    <TacticalBoard
      v-if="open" ref="board"
      :diagram="diagram" :active="open"
      data-diagram-board />

    <p v-if="error" class="note note--bad" role="alert" data-diagram-error>{{ error }}</p>

    <template #footer>
      <button type="button" class="btn" @click="onClose">Cancel</button>
      <button
        type="button" class="btn btn--go" :disabled="saving"
        data-diagram-save @click="onSave"
      >{{ saving ? 'Saving…' : 'Save diagram' }}</button>
    </template>
  </BaseModal>
</template>
