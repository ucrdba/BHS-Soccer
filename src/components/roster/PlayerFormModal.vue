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
import { POSITIONS, positionOptionLabel } from '../../domain/position';

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
    number: '', recordingNumber: '', position: null
  };
}

function submit(): void {
  emit('save', f.value);
}

/**
 * The `<select>`'s own DOM value is always a string, so the blank option
 * cannot be bound with `:value="null"` — Vue's prop patcher removes an
 * element's `value` attribute whenever the bound value is `null`, which
 * leaves that `<option>` with no attribute to match against and makes the
 * blank choice unreachable by setting the select's value directly (as a
 * test, or a browser's autofill, might). Binding the blank option to a
 * literal `""` keeps the attribute in place; this computed is what turns
 * that `""` back into the `null` the form (and `PlayerForm.position`) uses.
 */
const positionModel = computed<number | ''>({
  get: () => f.value.position ?? '',
  set: (v) => { f.value.position = v === '' ? null : Number(v); }
});

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
        position: p.position ?? null,
        seasonStats: p.seasonStats, ratings: p.ratings
      }
    : blank();
}, { immediate: true });

const title = computed(() => (props.player ? 'Edit player' : 'Add a player'));
</script>

<template>
  <BaseModal :open="open" :title="title" wide @close="emit('close')">
    <p v-if="error" class="err" role="alert" data-form-error>{{ error }}</p>

    <form id="player-form" class="grid" @submit.prevent="submit">
      <label class="field">
        <span class="kicker">First name</span>
        <input v-model="f.firstName" class="input" required data-field="firstName" />
      </label>
      <label class="field">
        <span class="kicker">Last name</span>
        <input v-model="f.lastName" class="input" required data-field="lastName" />
      </label>

      <label class="field">
        <span class="kicker">Shirt number</span>
        <input v-model="f.number" type="number" min="0" class="input" data-field="number" />
      </label>
      <label class="field">
        <span class="kicker" title="The paper-sheet number, not the shirt">
          Recording number
        </span>
        <input v-model="f.recordingNumber" type="number" min="0" class="input"
               data-field="recordingNumber" />
      </label>

      <label class="field">
        <span class="kicker" title="The soccer position number: 1 goalkeeper, 2-6 defence, 7-11 attack">
          Position
        </span>
        <select v-model="positionModel" class="input" data-field="position">
          <option value="">—</option>
          <option v-for="n in POSITIONS" :key="n" :value="n">{{ positionOptionLabel(n) }}</option>
        </select>
      </label>
      <label class="field">
        <span class="kicker">Class year</span>
        <input v-model="f.classYear" class="input" placeholder="e.g. Senior"
               data-field="classYear" />
      </label>

      <label class="field">
        <span class="kicker">Height</span>
        <input v-model="f.height" class="input" placeholder="e.g. 5-10" data-field="height" />
      </label>
      <label class="field">
        <span class="kicker">Photo URL</span>
        <input v-model="f.photo" class="input" data-field="photo" />
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
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: var(--space-3); }
.err { margin: 0 0 var(--space-3); color: var(--color-danger); font-size: 13px; }
</style>
