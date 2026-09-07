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
import { useRoute, useRouter, RouterLink } from 'vue-router';
import LineupScreen from '../components/schedule/LineupScreen.vue';
import { useOrganizationStore } from '../stores/organization';
import { useScheduleStore } from '../stores/schedule';
import { useRosterStore } from '../stores/roster';
import { matchById } from '../domain/match-lookup';
import { seasonFullMatchMinutes } from '../domain/season';

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

/** Settled means a load has happened, so "not found" is a real answer. */
const settled = computed(() => !schedule.loading && schedule.loadedTeamId !== null);
/** A lineup with no fixture is legitimate; a lineup for a missing one is not. */
const missing = computed(() => !!matchId.value && settled.value && !match.value);

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
  <p v-if="!settled" class="state" data-lineup-loading>Loading the fixture…</p>

  <section v-else-if="missing" class="state" data-lineup-missing>
    <p>That fixture is not on this team's schedule.</p>
    <RouterLink :to="{ name: 'schedule' }" class="state__back">Back to the schedule</RouterLink>
  </section>

  <LineupScreen
    v-else
    :match-id="matchId"
    :match-label="match?.opponent || ''"
    :match-minutes="matchMinutes"
    :team-id="org.activeTeamId"
    :school-id="schoolId"
    :players="roster.players"
    @saved="onDone"
    @close="onDone"
  />
</template>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: center;
  justify-content: center;
  height: 100vh;
  height: 100dvh;
  padding: var(--space-4);
  background: var(--ground);
  color: var(--ink-muted);
  font-size: 14px;
  text-align: center;
}

.state__back { color: var(--live); border-bottom: 1px solid var(--live); text-decoration: none; }
</style>
