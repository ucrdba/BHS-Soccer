<script setup lang="ts">
/**
 * Session entry, at its own URL.
 *
 * The drill is in the path and an existing session may be named in the query,
 * so a coach can return to a half-entered sheet from a bookmark. The view
 * loads the exercises and the squad itself rather than assuming the ratings
 * screen filled the stores first.
 */
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ToolNotice from '../components/layout/ToolNotice.vue';
import SessionEntryScreen from '../components/matrix/SessionEntryScreen.vue';
import { useOrganizationStore } from '../stores/organization';
import { useRosterStore } from '../stores/roster';
import { useSessionStore } from '../stores/session';
import { subjectState } from '../domain/tool-subject';

const route = useRoute();
const router = useRouter();
const org = useOrganizationStore();
const roster = useRosterStore();
const session = useSessionStore();

const drillId = computed(() => (route.params.drillId as string) || null);
const sessionId = computed(() => (route.query.session as string) || null);
const schoolId = computed(() => org.school?.id ?? null);

const drill = computed(() =>
  session.drills.find((d: any) => String(d.id) === String(drillId.value)) || null);

/**
 * Settled means the exercises have actually been read, so "no such exercise"
 * is an answer rather than a race.
 */
const state = computed(() => subjectState({
  settled: !session.loading && session.drills.length > 0,
  id: drillId.value,
  found: drill.value
}));

/**
 * Opening the sheet: an existing session is reopened with its results, a new
 * one starts blank. Both are the store's own calls; the view only decides
 * which the URL asked for.
 */
watch(
  () => [org.activeTeamId, drillId.value, sessionId.value] as const,
  async ([teamId, id, existing]) => {
    if (!teamId) return;
    roster.load(teamId);
    await session.loadDrills(schoolId.value);
    if (!id) return;
    if (existing) await session.openExisting(existing, teamId);
    else await session.openNew(id, teamId);
  },
  { immediate: true }
);

function onDone(): void {
  router.push({ name: 'matrix' });
}
</script>

<template>
  <ToolNotice
    v-if="state === 'loading'" kind="loading"
    message="Loading the exercise…" :back-to="{ name: 'matrix' }"
  />

  <ToolNotice
    v-else-if="state === 'missing'" kind="missing"
    message="That exercise is not in this organization's drill library."
    :back-to="{ name: 'matrix' }" back-label="Back to the ratings"
  />

  <SessionEntryScreen
    v-else
    :drill-id="drillId!"
    :team-id="org.activeTeamId"
    :school-id="schoolId"
    :players="roster.players"
    @close="onDone"
  />
</template>
