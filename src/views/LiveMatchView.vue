<script setup lang="ts">
/**
 * The live plus/minus board, at its own URL.
 *
 * Reached from the Schedule or from a bookmark on a touchline, so the view
 * loads the schedule and the roster itself. Unlike the lineup, this screen
 * always needs a fixture: a board with no match has nothing to write to.
 */
import { computed, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import LiveMatchScreen from '../components/schedule/LiveMatchScreen.vue';
import { useOrganizationStore } from '../stores/organization';
import { useScheduleStore } from '../stores/schedule';
import { useRosterStore } from '../stores/roster';
import { matchById } from '../domain/match-lookup';

const route = useRoute();
const org = useOrganizationStore();
const schedule = useScheduleStore();
const roster = useRosterStore();

const matchId = computed(() => (route.params.matchId as string) || null);
const match = computed(() => matchById(schedule.matches, matchId.value));
const schoolId = computed(() => org.school?.id ?? null);

const settled = computed(() => !schedule.loading && schedule.loadedTeamId !== null);
const missing = computed(() => settled.value && !match.value);

watch(() => org.activeTeamId, (id) => {
  schedule.load(id);
  roster.load(id);
}, { immediate: true });
</script>

<template>
  <p v-if="!settled" class="state" data-live-loading>Loading the fixture…</p>

  <section v-else-if="missing" class="state" data-live-missing>
    <p>That fixture is not on this team's schedule.</p>
    <RouterLink :to="{ name: 'schedule' }" class="state__back">Back to the schedule</RouterLink>
  </section>

  <LiveMatchScreen
    v-else
    :match-id="matchId"
    :match-label="match?.opponent || ''"
    :team-id="org.activeTeamId"
    :school-id="schoolId"
    :players="roster.players"
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
