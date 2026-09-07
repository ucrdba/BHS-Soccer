<script setup lang="ts">
/**
 * The season report, at its own URL.
 *
 * Read at a desk rather than a touchline, but it is a tool screen for the
 * same reason the others are: it is a wide table that wants the whole
 * window. It needs no fixture — the report is the season.
 */
import { computed, watch } from 'vue';
import SeasonReportScreen from '../components/schedule/SeasonReportScreen.vue';
import { useOrganizationStore } from '../stores/organization';
import { useRosterStore } from '../stores/roster';

const org = useOrganizationStore();
const roster = useRosterStore();

const teamId = computed(() => org.activeTeamId);

watch(() => org.activeTeamId, (id) => { roster.load(id); }, { immediate: true });
</script>

<template>
  <SeasonReportScreen :team-id="teamId" :teams="org.teams" :players="roster.players" />
</template>
