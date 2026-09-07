<script setup lang="ts">
/**
 * Add or edit a player.
 *
 * One form for both, because the fields are identical and two forms drift.
 * The identity fields (name parts, class year, height, photo) belong to the
 * PERSON; number, recording number, position and stats belong to this team's
 * membership. Editing writes both, and the store reports it when only the
 * first of the two succeeds.
 */
import { ref, watch, computed } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import type { Player } from '../../domain/player-row';
import type { PlayerForm } from '../../stores/roster';

const props = defineProps<{
  open: boolean;
  /** Null to add; a player to edit. */
  player: Player | null;
  busy?: boolean;
  error?: string | null;
}>();
const emit = defineEmits<{ close: []; save: [PlayerForm] }>();

const f = ref<PlayerForm>(blank());

function blank(): PlayerForm {
  return {
    firstName: '', lastName: '', classYear: '', height: '', photo: '',
    number: '', recordingNumber: '', position: ''
  };
}

// Re-seeded whenever the modal opens, so a cancelled edit does not leak into
// the next one.
watch(() => [props.open, props.player], () => {
  if (!props.open) return;
  const p = props.player;
  f.value = p
    ? {
        firstName: p.firstName, lastName: p.lastName,
        classYear: p.classYear || '', height: p.height || '', photo: p.photo || '',
        number: p.number ?? '', recordingNumber: p.recordingNumber ?? '',
        position: p.position || '',
        seasonStats: p.seasonStats, ratings: p.ratings
      }
    : blank();
}, { immediate: true });

const title = computed(() => (props.player ? 'Edit player' : 'Add a player'));
</script>

<template>
  <BaseModal :open="open" :title="title" wide @close="emit('close')">
    <p v-if="error" class="err" role="alert" data-form-error>{{ error }}</p>

    <form id="player-form" class="grid" @submit.prevent="emit('save', f)">
      <label class="field">
        <span class="field__label">First name</span>
        <input v-model="f.firstName" class="field__input" required data-field="firstName" />
      </label>
      <label class="field">
        <span class="field__label">Last name</span>
        <input v-model="f.lastName" class="field__input" required data-field="lastName" />
      </label>

      <label class="field">
        <span class="field__label">Shirt number</span>
        <input v-model="f.number" type="number" min="0" class="field__input" data-field="number" />
      </label>
      <label class="field">
        <span class="field__label" title="The paper-sheet number, not the shirt">
          Recording number
        </span>
        <input v-model="f.recordingNumber" type="number" min="0" class="field__input"
               data-field="recordingNumber" />
      </label>

      <label class="field">
        <span class="field__label">Position</span>
        <input v-model="f.position" class="field__input" placeholder="e.g. Center Back"
               data-field="position" />
      </label>
      <label class="field">
        <span class="field__label">Class year</span>
        <input v-model="f.classYear" class="field__input" placeholder="e.g. Senior"
               data-field="classYear" />
      </label>

      <label class="field">
        <span class="field__label">Height</span>
        <input v-model="f.height" class="field__input" placeholder="e.g. 5-10" data-field="height" />
      </label>
      <label class="field">
        <span class="field__label">Photo URL</span>
        <input v-model="f.photo" class="field__input" data-field="photo" />
      </label>
    </form>

    <template #footer>
      <button type="button" class="btn btn--plain" @click="emit('close')">Cancel</button>
      <button type="submit" form="player-form" class="btn btn--go" :disabled="busy"
              data-form-save>
        {{ busy ? 'Saving…' : 'Save' }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem 1rem;
}

@media (max-width: 560px) {
  .grid { grid-template-columns: 1fr; }
}

.err {
  margin: 0 0 0.9rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--color-danger, #f87171);
  border-radius: 6px;
  color: var(--color-danger, #f87171);
  font-size: 0.84rem;
  line-height: 1.45;
}

.field { display: block; margin-bottom: 0.85rem; }

.field__label {
  display: block;
  margin-bottom: 0.3rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.field__input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 6px;
  background: var(--bhs-navy-bg);
  color: var(--ink);
  font: inherit;
  font-size: 0.9rem;
}

.btn {
  padding: 0.55rem 1.1rem;
  border-radius: 6px;
  border: 1px solid transparent;
  font: inherit;
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
}

.btn:disabled { opacity: 0.6; cursor: progress; }
.btn--go { background: var(--bhs-cyan-accent); color: var(--bhs-navy-bg); }
.btn--plain { border-color: var(--bhs-navy-border); background: transparent; color: var(--text-muted, #94a3b8); }
</style>
