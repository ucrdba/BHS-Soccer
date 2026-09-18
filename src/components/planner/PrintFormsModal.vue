<script setup lang="ts">
/**
 * Blank forms for practice, chosen and printed.
 *
 * Two doors into the same sheet builder: the planner opens it with the day's
 * plan already ticked, and Player Ratings opens it with the library to choose
 * from. A plan stores its drills by NAME (`practice_plans.drill` is text), so
 * the preselection matches on name -- and says which names the library does
 * not have rather than quietly printing fewer sheets than the plan has drills.
 *
 * A date and a number of days, so a week of practice prints in one press with
 * every sheet carrying its own date.
 */
import { ref, computed, watch } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import { supabaseService } from '../../data/supabase';
import { useOrganizationStore } from '../../stores/organization';
import { toRoster } from '../../domain/player-row';
import { reportStandardSeconds } from '../../domain/report';
import { startingSessionDate } from '../../domain/session-entry';
import { buildPracticeFormsDocument } from '../../domain/practice-form';

const props = defineProps<{
  open: boolean;
  teamId: string | null;
  schoolId: string | null;
  /** Drill names to tick on opening — the planner passes its plan's rows. */
  preselectNames?: string[];
}>();
const emit = defineEmits<{ close: [] }>();

const org = useOrganizationStore();

const drills = ref<any[]>([]);
const players = ref<any[]>([]);
const standards = ref<Record<string, number | null>>({});
const chosen = ref<Record<string, boolean>>({});
const unmatched = ref<string[]>([]);
const date = ref('');
const days = ref('1');
const error = ref<string | null>(null);
const loading = ref(false);

/** The library, minus 1v1: the round robin already prints its pairings. */
const printable = computed(() => drills.value.filter((d: any) => d.measure !== 'head_to_head'));

const dates = computed(() => {
  const start = date.value;
  const count = Math.max(1, Math.min(14, Number(days.value) || 1));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(`${start}T00:00:00`);
    if (Number.isNaN(d.getTime())) return [start];
    d.setDate(d.getDate() + i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
});

watch(() => [props.open, props.teamId, props.schoolId, props.preselectNames] as const, async () => {
  if (!props.open) return;
  error.value = null;
  date.value = startingSessionDate(date.value || null);

  if (!props.teamId) { error.value = 'Choose a team first.'; return; }

  loading.value = true;
  try {
    const [bank, roster] = await Promise.all([
      supabaseService.fetchDrillsForWeighting(props.schoolId || undefined),
      supabaseService.fetchTeamRoster(props.teamId)
    ]);

    if (roster === null) { error.value = 'Could not load the squad.'; return; }
    players.value = toRoster(roster);
    drills.value = bank || [];

    // Names, because that is all a plan row carries.
    const wanted = (props.preselectNames || []).map(n => String(n || '').trim().toLowerCase());
    const byName = new Map(drills.value.map((d: any) => [String(d.name || '').toLowerCase(), d]));
    const ticks: Record<string, boolean> = {};
    const missing: string[] = [];
    (props.preselectNames || []).forEach((name, i) => {
      const found = byName.get(wanted[i]);
      if (found) ticks[found.id] = true;
      else if (String(name || '').trim()) missing.push(name);
    });
    chosen.value = ticks;
    unmatched.value = missing;
  } finally {
    loading.value = false;
  }
}, { immediate: true });

/** Only a banded exercise has a standard, and only for this squad. */
async function loadStandards(ids: string[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (const id of ids) {
    const drill = drills.value.find((d: any) => d.id === id);
    if (drill?.measure !== 'time_bands' || !props.teamId) continue;
    const bands = await supabaseService.fetchTimeBands(id, props.teamId);
    out[id] = reportStandardSeconds({ [id]: bands || [] }, id);
  }
  return out;
}

async function onPrint(): Promise<void> {
  error.value = null;

  const picked = printable.value.filter((d: any) => chosen.value[d.id]);
  if (picked.length === 0) { error.value = 'Choose at least one exercise to print.'; return; }
  if (players.value.length === 0) { error.value = 'This squad has no players yet.'; return; }

  standards.value = await loadStandards(picked.map((d: any) => d.id));

  const html = buildPracticeFormsDocument({
    organization: org.branding.name || '',
    team: org.activeTeam?.name || '',
    dates: dates.value,
    drills: picked,
    players: players.value,
    standards: standards.value
  });
  if (!html) { error.value = 'There is nothing to print yet.'; return; }

  const win = window.open('', '_blank');
  if (!win) {
    error.value = 'Your browser blocked the print window. Allow pop-ups for this site and try again.';
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
</script>

<template>
  <BaseModal :open="open" title="Print practice forms" @close="emit('close')">
    <p class="lede">
      Blank sheets to carry to practice: the squad in recording-number order,
      with boxes shaped for how each exercise is measured. A small-sided game
      gets lines to write the winners' numbers on.
    </p>

    <div class="when">
      <label class="fld">
        <span class="fld__label">First day</span>
        <input v-model="date" type="date" class="fld__input" data-forms-date />
      </label>
      <label class="fld">
        <span class="fld__label">Days</span>
        <input v-model="days" type="number" min="1" max="14" class="fld__input fld__input--narrow" data-forms-days />
      </label>
    </div>

    <p v-if="loading" class="hint">Loading…</p>

    <p v-if="unmatched.length" class="hint hint--bad" data-form-unmatched>
      Not in the drill library, so no sheet: {{ unmatched.join(', ') }}.
    </p>

    <ul class="list">
      <li v-for="d in printable" :key="d.id" class="list__row">
        <label class="pick">
          <input
            type="checkbox" :checked="!!chosen[d.id]" :data-form-drill="d.id"
            @change="chosen = { ...chosen, [d.id]: ($event.target as HTMLInputElement).checked }"
          />
          <span class="pick__name">{{ d.name }}</span>
          <span class="pick__measure">{{ d.measure }}</span>
        </label>
      </li>
    </ul>

    <p v-if="!loading && printable.length === 0" class="hint" data-forms-empty>
      No exercises in the library yet. Add drills in the practice planner first.
    </p>

    <p v-if="error" class="hint hint--bad" role="alert" data-forms-error>{{ error }}</p>

    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Close</button>
      <button type="button" class="btn btn--primary" data-forms-print @click="onPrint">Print / PDF</button>
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

.when { display: flex; gap: var(--space-3); margin-bottom: var(--space-3); }
.fld { display: flex; flex-direction: column; gap: 4px; }

.fld__label {
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.fld__input {
  min-height: 36px;
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--rule);
  border-radius: 5px;
  background: var(--surface-deep);
  color: var(--ink);
  font: inherit;
  font-size: 0.8rem;
}

.fld__input--narrow { max-width: 5rem; }

.list { margin: 0; padding: 0; list-style: none; }
.list__row { border-bottom: 1px solid var(--rule); }

.pick { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0; cursor: pointer; }
.pick__name { flex: 1; color: var(--ink); font-size: 0.85rem; }
.pick__measure { color: var(--ink-muted); font-size: 0.72rem; }

.hint { margin: 0.7rem 0 0; color: var(--ink-muted); font-size: 0.8rem; line-height: 1.5; }
.hint--bad { color: var(--color-warning); }

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
</style>
