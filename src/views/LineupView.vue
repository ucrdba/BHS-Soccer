<script setup lang="ts">
/**
 * The lineup, reached at its own URL.
 *
 * A tool route can be arrived at cold — a bookmark, a reload, a link a coach
 * sent themselves — so the view loads what the screen needs rather than
 * assuming the Schedule filled the stores first. A fixture id that names
 * nothing is said out loud instead of rendering a sheet for a match that is
 * not there.
 */
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import LineupScreen from '../components/schedule/LineupScreen.vue';
import ToolNotice from '../components/layout/ToolNotice.vue';
import { useOrganizationStore } from '../stores/organization';
import { useScheduleStore } from '../stores/schedule';
import { useRosterStore } from '../stores/roster';
import { matchById } from '../domain/match-lookup';
import { seasonFullMatchMinutes } from '../domain/season';
import { subjectState } from '../domain/tool-subject';

const route = useRoute();
const router = useRouter();
const org = useOrganizationStore();
const schedule = useScheduleStore();
const roster = useRosterStore();

const matchId = computed(() => (route.params.matchId as string) || null);
const match = computed(() => matchById(schedule.matches, matchId.value));
const schoolId = computed(() => org.school?.id ?? null);
const matchMinutes = computed(() =>
  seasonFullMatchMinutes(org.teams, org.activeTeamId || ''));

/**
 * A lineup may legitimately have no fixture, so a missing id is ready
 * rather than missing; only an id that names nothing is a dead link.
 */
const state = computed(() => subjectState({
  settled: !schedule.loading && schedule.loadedTeamId !== null,
  id: matchId.value,
  found: match.value,
  idOptional: true
}));

watch(() => org.activeTeamId, (id) => {
  schedule.load(id);
  roster.load(id);
}, { immediate: true });

/**
 * A saved sheet returns to the schedule.
 *
 * The screen has no in-place close now that it is a route, so the view owns
 * what "done" means: the coach lands back on the fixture list, where the
 * marker for a fixture still missing a sheet is re-read on arrival.
 */
function onDone(): void {
  router.push({ name: 'schedule' });
}
</script>

<template>
  <ToolNotice
    v-if="state === 'loading'" kind="loading"
    message="Loading the fixture…" :back-to="{ name: 'schedule' }"
  />

  <ToolNotice
    v-else-if="state === 'missing'" kind="missing"
    message="That fixture is not on this team's schedule."
    :back-to="{ name: 'schedule' }"
  />

  <!-- Only @close: the screen emits `saved` and then `close` on a
       successful save, so binding both would push the same route twice. -->
  <LineupScreen
    v-else
    :match-id="matchId"
    :match-label="match?.opponent || ''"
    :match-minutes="matchMinutes"
    :team-id="org.activeTeamId"
    :school-id="schoolId"
    :players="roster.players"
    @close="onDone"
  />
</template>
