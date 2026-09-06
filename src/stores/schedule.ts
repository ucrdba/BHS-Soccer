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
import { formatIsoToDisplayDate, format24hTo12h } from '../domain/schedule-view';

export interface MatchForm {
  /** An `<input type="date">` value, or the stored text. */
  date: string;
  time: string;
  opponent: string;
  /** NOT NULL in the database. */
  location: string;
  /** Absent means "leave as is"; empty means "clear it". */
  venueAddress?: string;
  status: string;
  isHome: boolean | string;
  score?: string | null;
}

export interface WriteResult { ok: boolean; error?: string }

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

  // ── Writes ────────────────────────────────────────────────────────────────

  /**
   * A fixture from a form, in the shape the client and the schema expect.
   *
   * The date is converted rather than passed through. `parse_match_date()`
   * reads "MON D YYYY" and returns null for an ISO date, so storing the date
   * input's own value would leave `match_on` null and the fixture would sort
   * as though it had no date — while still reading correctly on screen.
   */
  function matchFrom(f: MatchForm): Record<string, any> {
    const payload: Record<string, any> = {
      date: formatIsoToDisplayDate(f.date) || String(f.date || '').toUpperCase(),
      time: format24hTo12h(f.time) || f.time,
      opponent: f.opponent,
      location: f.location,
      status: f.status,
      isHome: f.isHome === true || String(f.isHome) === 'true',
      score: f.score || null,
      result: f.status === 'COMPLETED' ? (f.score || '') : null
    };

    // Emptying the box CLEARS the address, which must reach the database as
    // null rather than being dropped -- a coach removing a wrong address needs
    // the link to disappear. Only a caller that never supplied the key leaves
    // it untouched, which is what the importer relies on.
    if (f.venueAddress !== undefined) {
      payload.venueAddress = String(f.venueAddress || '').trim() || null;
    }
    return payload;
  }

  async function addMatch(f: MatchForm, teamId: string): Promise<WriteResult> {
    if (!teamId) return { ok: false, error: 'No active team selected.' };
    if (!String(f.location || '').trim()) {
      // schedule.location is NOT NULL. Refused here so the coach gets a
      // sentence rather than a Postgres constraint error.
      return { ok: false, error: 'A location is required.' };
    }

    // Returns null for failure rather than {ok,error}, deliberately: admin.js
    // does `return !!(await upsertMatch(...))`, so a caller ignoring the
    // return reports success over a refusal.
    const res = await supabaseService.upsertMatch(teamId, matchFrom(f));
    if (!res?.id) return { ok: false, error: 'Could not save that fixture.' };

    await load(teamId);
    return { ok: true };
  }

  async function updateMatch(id: string, f: MatchForm, teamId: string): Promise<WriteResult> {
    if (!teamId) return { ok: false, error: 'No active team selected.' };
    if (!String(f.location || '').trim()) return { ok: false, error: 'A location is required.' };

    const res = await supabaseService.upsertMatch(teamId, { id, ...matchFrom(f) });
    if (!res?.id) return { ok: false, error: 'Could not save that fixture.' };

    await load(teamId);
    return { ok: true };
  }

  async function removeMatch(id: string, teamId: string): Promise<WriteResult> {
    if (!teamId) return { ok: false, error: 'No active team selected.' };

    const res = await supabaseService.deleteMatch(id);
    if (!res || res.ok === false) {
      return { ok: false, error: res?.error || 'Could not delete that fixture.' };
    }
    await load(teamId);
    return { ok: true };
  }

  return {
    matches, loading, loadError, loadedTeamId,
    nextMatch, state, lastPlayed, record,
    load, addMatch, updateMatch, removeMatch
  };
});
