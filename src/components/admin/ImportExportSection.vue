<script setup lang="ts">
/**
 * Opens the workbook round trip, and gathers what it exports.
 *
 * **Every read is scoped to the active team or organization.** Ten methods on
 * `SupabaseService` default their `schoolId` to `'bhs'`, and calling one bare
 * here would hand a club admin an export of Beaumont's roster, staff and
 * drills — which they would then re-import over their own. The roster is read
 * with `fetchTeamRoster(teamId)` in particular, because it has no default to
 * fall through.
 *
 * Nothing is read until the modal is opened: this is eight round trips, and
 * the admin screen should not pay for them to render a button.
 *
 * A failed read becomes an empty collection rather than a missing key, so an
 * export still produces a workbook — an empty sheet with its headers is a
 * truthful statement that the table is empty, and a half-built workbook is
 * not.
 *
 * **The Profiles sheet is not filled.** There is no read path for an
 * organization's profiles, so it exports with its headers and no rows. That
 * is said on screen rather than left to be misread as "this organization has
 * no users" — the same treatment the Matrix sheet gets on the import side.
 */
import { ref } from 'vue';
import SectionShell from './SectionShell.vue';
import ImportExportModal from './ImportExportModal.vue';
import { supabaseService } from '../../data/supabase';
import type { ExportData } from '../../domain/workbook';

const props = defineProps<{
  isAdmin: boolean;
  teamId: string | null;
  schoolId: string | null;
  /** `schools.code` — what `fetchSchool` keys on. */
  schoolCode: string | null;
  teamName: string | null;
  teams: any[];
}>();

const open = ref(false);
const loading = ref(false);
const loadError = ref<string | null>(null);
const data = ref<ExportData>({});

/** Null or a failure becomes an empty list. See the module comment. */
const list = (v: any): any[] => (Array.isArray(v) ? v : []);

async function onOpen(): Promise<void> {
  loadError.value = null;

  if (!props.teamId) {
    loadError.value = 'Choose a team first — the export is of one team’s season.';
    return;
  }

  loading.value = true;
  try {
    const [school, players, schedule, drillsBank, coaches, thoughts, quiz, categories, matrixLogs] =
      await Promise.all([
        props.schoolCode ? supabaseService.fetchSchool(props.schoolCode) : Promise.resolve(null),
        supabaseService.fetchTeamRoster(props.teamId),
        supabaseService.fetchSchedule(props.teamId),
        props.schoolId ? supabaseService.fetchDrillsBank(props.schoolId) : Promise.resolve([]),
        props.schoolId ? supabaseService.fetchCoaches(props.schoolId) : Promise.resolve([]),
        supabaseService.fetchDailyThoughts(props.teamId),
        supabaseService.fetchTeamQuiz(props.teamId),
        props.schoolId ? supabaseService.fetchSoccerCategories(props.schoolId) : Promise.resolve([]),
        supabaseService.fetchMatrixLogs(props.teamId)
      ]);

    data.value = {
      school: school || null,
      players: list(players),
      schedule: list(schedule),
      drillsBank: list(drillsBank),
      coaches: list(coaches),
      thoughts: list(thoughts),
      quiz: list(quiz),
      categories: list(categories),
      matrixLogs: list(matrixLogs),
      teamName: props.teamName || ''
    };
    open.value = true;
  } catch (e: any) {
    loadError.value = e?.message || 'The data to export could not be read.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <SectionShell v-if="isAdmin" title="Import and export">
    <p class="note">
      Exports this team's season as a spreadsheet, and imports one back after
      showing what it would change.
    </p>

    <button type="button" class="btn" data-ie-open :disabled="loading" @click="onOpen">
      {{ loading ? 'Reading…' : 'Import / export data' }}
    </button>

    <p v-if="loadError" class="error" data-ie-load-error>{{ loadError }}</p>

    <p v-if="open" class="note" data-ie-profiles-note>
      The Profiles sheet exports with its headings and no rows — there is no
      read path for an organization's user accounts yet, so an empty sheet
      here does not mean the organization has no users.
    </p>

    <ImportExportModal
      :open="open"
      :team-id="teamId"
      :school-id="schoolId"
      :teams="teams"
      :data="data"
      @close="open = false" />
  </SectionShell>

  <p v-else class="note">
    Only an admin can export or import the organization's data.
  </p>
</template>

<style scoped>

.error { color: var(--color-danger); }
</style>
