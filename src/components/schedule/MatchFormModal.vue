<script setup lang="ts">
/**
 * Add or edit a fixture.
 *
 * Location is required in the markup as well as the store, because
 * `schedule.location` is NOT NULL — better a browser validation message than
 * a round trip that returns a constraint error.
 *
 * The date field is an `<input type="date">`, and the store converts its ISO
 * value to the "MON D YYYY" the schema's trigger can parse. Storing the raw
 * value would leave the fixture with no `match_on`, sorting as though it had
 * no date while reading correctly on screen.
 */
import { ref, watch, computed } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { formatDisplayDateToIso } from '../../domain/schedule-view';
import type { MatchForm } from '../../stores/schedule';
import type { Match } from '../../domain/schedule-row';

const props = defineProps<{
  open: boolean;
  /** Null to add; a fixture to edit. */
  match: Match | null;
  busy?: boolean;
  error?: string | null;
}>();
const emit = defineEmits<{ close: []; save: [MatchForm] }>();

const f = ref<MatchForm>(blank());

function blank(): MatchForm {
  return {
    date: '', time: '', opponent: '', location: '',
    venueAddress: '', status: 'SCHEDULED', isHome: true, score: ''
  };
}

watch(() => [props.open, props.match], () => {
  if (!props.open) return;
  const m = props.match;
  f.value = m
    ? {
        // Back to an input value; the store converts it forward again on save.
        date: formatDisplayDateToIso(m.date) || '',
        time: m.time || '',
        opponent: m.opponent || '',
        location: m.location || '',
        venueAddress: m.venueAddress || '',
        status: m.status || 'SCHEDULED',
        isHome: m.isHome !== false,
        score: m.score || ''
      }
    : blank();
}, { immediate: true });

const title = computed(() => (props.match ? 'Edit fixture' : 'Add a fixture'));
const isCompleted = computed(() => f.value.status === 'COMPLETED');
</script>

<template>
  <BaseModal :open="open" :title="title" wide @close="emit('close')">
    <p v-if="error" class="err" role="alert" data-form-error>{{ error }}</p>

    <form id="match-form" class="grid" @submit.prevent="emit('save', f)">
      <label class="field field--wide">
        <span class="kicker">Opponent</span>
        <input v-model="f.opponent" class="input" required data-field="opponent" />
      </label>

      <label class="field">
        <span class="kicker">Date</span>
        <input v-model="f.date" type="date" class="input" required data-field="date" />
      </label>
      <label class="field">
        <span class="kicker">Kickoff</span>
        <input v-model="f.time" type="time" class="input" data-field="time" />
      </label>

      <label class="field">
        <span class="kicker">Home or away</span>
        <select v-model="f.isHome" class="input" data-field="isHome">
          <option :value="true">Home</option>
          <option :value="false">Away</option>
        </select>
      </label>
      <label class="field">
        <span class="kicker">Status</span>
        <select v-model="f.status" class="input" data-field="status">
          <option value="SCHEDULED">Scheduled</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </label>

      <label class="field field--wide">
        <!-- Required: schedule.location is NOT NULL. -->
        <span class="kicker">Location</span>
        <input v-model="f.location" class="input" required data-field="location" />
      </label>

      <label v-if="f.isHome === false" class="field field--wide">
        <span class="kicker">
          Venue address
          <span class="note">— only an address earns a directions link</span>
        </span>
        <input v-model="f.venueAddress" class="input"
               placeholder="Street, town" data-field="venueAddress" />
      </label>

      <label v-if="isCompleted" class="field field--wide">
        <span class="kicker">Score</span>
        <input v-model="f.score" class="input" placeholder="3 - 1" data-field="score" />
      </label>
    </form>

    <template #footer>
      <button type="button" class="btn btn--plain" @click="emit('close')">Cancel</button>
      <button type="submit" form="match-form" class="btn btn--go" :disabled="busy" data-form-save>
        {{ busy ? 'Saving…' : 'Save' }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: var(--space-3); }
.err { margin: var(--space-3) 0 0; color: var(--color-danger); font-size: 13px; }
</style>
