<script setup lang="ts">
/**
 * The live plus/minus board, at its own URL.
 *
 * Reached from the Schedule or from a bookmark on a touchline, so the view
 * loads the schedule and the roster itself. Unlike the lineup, this screen
 * always needs a fixture: a board with no match has nothing to write to.
 */
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import LiveMatchScreen from '../components/schedule/LiveMatchScreen.vue';
import ToolNotice from '../components/layout/ToolNotice.vue';
import { useOrganizationStore } from '../stores/organization';
import { useScheduleStore } from '../stores/schedule';
import { useRosterStore } from '../stores/roster';
import { matchById } from '../domain/match-lookup';
import { subjectState } from '../domain/tool-subject';

const route = useRoute();
const org = useOrganizationStore();
const schedule = useScheduleStore();
const roster = useRosterStore();

const matchId = computed(() => (route.params.matchId as string) || null);
const match = computed(() => matchById(schedule.matches, matchId.value));
const schoolId = computed(() => org.school?.id ?? null);

const state = computed(() => subjectState({
  settled: !schedule.loading && schedule.loadedTeamId !== null,
  id: matchId.value,
  found: match.value
}));

watch(() => org.activeTeamId, (id) => {
  schedule.load(id);
  roster.load(id);
}, { immediate: true });
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

  <LiveMatchScreen
    v-else
    :match-id="matchId"
    :match-label="match?.opponent || ''"
    :team-id="org.activeTeamId"
    :school-id="schoolId"
    :players="roster.players"
  />
</template>
