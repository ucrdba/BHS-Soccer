/**
 * The active team's fixtures.
 *
 * Scoped to the team, not the organization: a programme runs Varsity and JV,
 * and a club runs age groups, each with its own schedule.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabaseService } from '../data/supabase';
import { toSchedule, type Match } from '../domain/schedule-row';
import {
  getNextMatch, scheduleState, lastPlayedMatch,
  type ScheduleState
} from '../domain/schedule';
import { seasonRecord, type SeasonRecord } from '../domain/season-record';

export const useScheduleStore = defineStore('schedule', () => {
  const matches = ref<Match[]>([]);
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  /** Null until a load has actually happened, so "no fixtures" is not claimed early. */
  const loadedTeamId = ref<string | null>(null);

  const nextMatch = computed(() => getNextMatch(matches.value));
  const state = computed<ScheduleState>(() => scheduleState(matches.value));
  const lastPlayed = computed(() => lastPlayedMatch(matches.value));
  const record = computed<SeasonRecord>(() => seasonRecord(matches.value));

  async function load(teamId: string | null): Promise<void> {
    if (!teamId) { matches.value = []; loadedTeamId.value = null; return; }

    loading.value = true;
    loadError.value = null;
    try {
      matches.value = toSchedule(await supabaseService.fetchSchedule(teamId));
      loadedTeamId.value = teamId;
    } catch (err: any) {
      loadError.value = err?.message || 'Could not load the schedule.';
      console.error('Schedule load failed:', err);
    } finally {
      loading.value = false;
    }
  }

  return {
    matches, loading, loadError, loadedTeamId,
    nextMatch, state, lastPlayed, record, load
  };
});
