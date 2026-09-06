<script setup lang="ts">
/**
 * Add or edit a member of the coaching staff.
 *
 * Name and role are required in the markup as well as the store, because both
 * columns are NOT NULL — and because `upsertCoach` would otherwise substitute
 * 'Coach' and 'Staff' for blanks, putting a person called "Coach" on the page.
 *
 * There is no organization picker. A coach belongs to the organization being
 * looked at; the legacy form offered a dropdown of every school, which is an
 * invitation to file someone under the wrong one.
 */
import { ref, watch, computed } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import type { Coach } from '../../domain/coach-row';
import type { CoachForm } from '../../stores/coaches';

const props = defineProps<{
  open: boolean;
  coach: Coach | null;
  busy?: boolean;
  error?: string | null;
}>();
const emit = defineEmits<{ close: []; save: [CoachForm] }>();

const f = ref<CoachForm>(blank());

function blank(): CoachForm {
  return { name: '', level: '', phone: '', address: '', email: '', photo: '', bio: '' };
}

watch(() => [props.open, props.coach], () => {
  if (!props.open) return;
  const c = props.coach;
  f.value = c
    ? {
        name: c.name || '', level: c.level || '',
        phone: c.phone || '', address: c.address || '',
        email: c.email || '', photo: c.photo || '', bio: c.bio || ''
      }
    : blank();
}, { immediate: true });

const title = computed(() => (props.coach ? 'Edit coach' : 'Add a coach'));
</script>

<template>
  <BaseModal :open="open" :title="title" wide @close="emit('close')">
    <p v-if="error" class="err" role="alert" data-form-error>{{ error }}</p>

    <form id="coach-form" class="grid" @submit.prevent="emit('save', f)">
      <label class="field">
        <span class="field__label">Name</span>
        <input v-model="f.name" class="field__input" required data-field="name" />
      </label>
      <label class="field">
        <span class="field__label">Role</span>
        <input v-model="f.level" class="field__input" required
               placeholder="e.g. Head Coach" data-field="level" />
      </label>

      <label class="field">
        <span class="field__label">Email</span>
        <input v-model="f.email" type="email" class="field__input" data-field="email" />
      </label>
      <label class="field">
        <span class="field__label">Phone</span>
        <input v-model="f.phone" class="field__input" data-field="phone" />
      </label>

      <label class="field field--wide">
        <span class="field__label">Photo URL</span>
        <input v-model="f.photo" class="field__input" data-field="photo" />
      </label>

      <label class="field field--wide">
        <span class="field__label">Bio</span>
        <textarea v-model="f.bio" class="field__input field__input--area"
                  rows="4" data-field="bio"></textarea>
      </label>
    </form>

    <template #footer>
      <button type="button" class="btn btn--plain" @click="emit('close')">Cancel</button>
      <button type="submit" form="coach-form" class="btn btn--go" :disabled="busy" data-form-save>
        {{ busy ? 'Saving…' : 'Save' }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem 1rem; }
.field--wide { grid-column: 1 / -1; }

@media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }

.err {
  margin: 0 0 0.9rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--color-danger, #f87171);
  border-radius: 6px;
  color: var(--color-danger, #f87171);
  font-size: 0.84rem;
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
  color: #fff;
  font: inherit;
  font-size: 0.9rem;
}

.field__input--area { resize: vertical; font-family: inherit; }

.btn {
  padding: 0.55rem 1.1rem;
  border: 1px solid transparent;
  border-radius: 6px;
  font: inherit;
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
}

.btn:disabled { opacity: 0.6; cursor: progress; }
.btn--go { background: var(--bhs-cyan-accent); color: var(--bhs-navy-bg); }
.btn--plain { border-color: var(--bhs-navy-border); background: transparent; color: var(--text-muted, #94a3b8); }
</style>
