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
        <span class="kicker">Name</span>
        <input v-model="f.name" class="input" required data-field="name" />
      </label>
      <label class="field">
        <span class="kicker">Role</span>
        <input v-model="f.level" class="input" required
               placeholder="e.g. Head Coach" data-field="level" />
      </label>

      <label class="field">
        <span class="kicker">Email</span>
        <input v-model="f.email" type="email" class="input" data-field="email" />
      </label>
      <label class="field">
        <span class="kicker">Phone</span>
        <input v-model="f.phone" class="input" data-field="phone" />
      </label>

      <label class="field field--wide">
        <span class="kicker">Photo URL</span>
        <input v-model="f.photo" class="input" data-field="photo" />
      </label>

      <label class="field field--wide">
        <span class="kicker">Bio</span>
        <textarea v-model="f.bio" class="input"
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
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: var(--space-3); }
.err { margin: var(--space-3) 0 0; color: var(--color-danger); font-size: 13px; }
</style>
