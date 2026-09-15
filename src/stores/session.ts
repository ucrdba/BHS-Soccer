/**
 * Recording a session — a whole squad's results for one exercise.
 *
 * Points are derived in Postgres, so a save is never patched into local
 * state: the history is re-read, because `matrix_standings` has re-derived
 * every rank and a locally added row would show a number the database does
 * not hold.
 *
 * The other thing this store is careful about is `editingId`. It is what makes
 * `saveMatrixSession` upsert rather than insert, so it is cleared on success
 * (or the next new session overwrites the one just edited) and kept on
 * failure (or the coach's retry writes a second session for the same day,
 * doubling everyone's `available`).
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabaseService } from '../data/supabase';

export interface WriteResult { ok: boolean; error?: string }

export interface SessionDraft {
  drillId: string;
  occurredOn: string;
  notes?: string;
}

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<any[]>([]);
  const results = ref<any[]>([]);
  const bands = ref<any[]>([]);
  const goalBands = ref<any[]>([]);
  const drills = ref<any[]>([]);
  const editingId = ref<string | null>(null);
  const loading = ref(false);
  const loadError = ref<string | null>(null);

  function drillById(id: string): any {
    return drills.value.find(d => d.id === id) || null;
  }

  async function loadHistory(teamId: string | null): Promise<void> {
    if (!teamId) { loadError.value = 'Choose a team first.'; return; }
    loading.value = true;
    try {
      /*
       * fetchMatrixSessions, NOT fetchTeamSessionHistory.
       *
       * The two read the same table and return different things.
       * fetchMatrixSessions returns one row per SESSION -- id, drill_id,
       * occurred_on and the joined drills_bank -- which is what this store
       * and SessionHistory read. fetchTeamSessionHistory flattens to one row
       * per RESULT in camelCase, for the progress and squad reports.
       *
       * This called the flattened one, so every field the history reads was
       * undefined: the drill name fell back to "Exercise (since removed)" on
       * every row, the dates were blank, the count was results rather than
       * sessions, and Delete sent `undefined` to Postgres as a uuid.
       */
      const rows = await supabaseService.fetchMatrixSessions(teamId);
      // Null is a failed read. Showing an empty history for one would tell a
      // coach their sessions are gone.
      if (rows === null) {
        loadError.value = 'Could not load the recorded sessions.';
        sessions.value = [];
        return;
      }
      loadError.value = null;
      sessions.value = rows;
    } finally {
      loading.value = false;
    }
  }

  /**
   * The exercise library, which belongs to an ORGANIZATION.
   *
   * `fetchDrillsForWeighting` returns null rather than falling back to
   * Beaumont's, so a bare call leaves the picker silently empty instead of
   * showing a club coach somebody else's exercises.
   */
  async function loadDrills(schoolId: string | null): Promise<void> {
    if (!schoolId) { loadError.value = 'No organization for this team.'; return; }
    const rows = await supabaseService.fetchDrillsForWeighting(schoolId);
    if (rows === null) {
      loadError.value = 'Could not load the exercises.';
      return;
    }
    loadError.value = null;
    drills.value = rows;
  }

  /**
   * The standards this squad is held to on this exercise.
   *
   * `time_bands` has time bands and `role_goals` has goal bands; nothing else
   * has any. Fetching for another measure is a wasted round trip whose empty
   * result would then read as "no standards set" for a drill that cannot have
   * them.
   */
  async function loadBands(drillId: string, teamId: string | null): Promise<void> {
    bands.value = [];
    goalBands.value = [];
    if (!drillId || !teamId) return;

    const drill = drillById(drillId);
    if (drill?.measure === 'role_goals') {
      goalBands.value = (await supabaseService.fetchGoalBands(drillId, teamId)) || [];
      return;
    }
    // Unknown drill: the library may not be loaded yet, and a banded exercise
    // with no standards on screen is worse than one extra read.
    if (drill && drill.measure !== 'time_bands') return;

    bands.value = (await supabaseService.fetchTimeBands(drillId, teamId)) || [];
  }

  async function openNew(drillId: string, teamId: string | null): Promise<void> {
    editingId.value = null;
    results.value = [];
    await loadBands(drillId, teamId);
  }

  /**
   * Reopen a recorded session, with the row it was recorded as.
   *
   * The history is read when this store does not already hold the session,
   * because SessionEntryView opens this screen straight from a URL -- the
   * Edit button, a bookmark, a reload -- and never loads it. Without the row
   * there is no date to show and no drill to look the standards up by: the
   * date box opened blank, so the coach retyped it, and typing today MOVED
   * the session, re-attributing every result in it to a day it did not
   * happen on.
   */
  async function openExisting(sessionId: string, teamId: string | null): Promise<void> {
    editingId.value = sessionId;
    results.value = (await supabaseService.fetchMatrixSessionResults(sessionId)) || [];

    if (!sessions.value.some(s => s.id === sessionId) && teamId) await loadHistory(teamId);

    const session = sessions.value.find(s => s.id === sessionId);
    if (session) await loadBands(session.drill_id, teamId);
  }

  /**
   * The session being edited, or null while recording a new one.
   *
   * Guarded against `sessions` being undefined rather than assuming the array:
   * a component that is still mounted when its test's pinia is torn down
   * re-evaluates this against a disposed store, and an unhandled rejection
   * there exits the run non-zero while every test still reports as passing.
   */
  const editing = computed(() =>
    (sessions.value || []).find(s => s.id === editingId.value) || null);

  async function save(
    teamId: string | null, session: SessionDraft, rows: any[]
  ): Promise<WriteResult> {
    if (!teamId) return { ok: false, error: 'Choose a team first.' };

    const payload: SessionDraft & { id?: string } = { ...session };
    if (editingId.value) payload.id = editingId.value;

    const res = await supabaseService.saveMatrixSession(teamId, payload, rows);
    if (!res?.ok) {
      // editingId is deliberately left alone: a retry must still upsert.
      return { ok: false, error: res?.error || 'Could not save that session.' };
    }

    editingId.value = null;
    results.value = [];
    await loadHistory(teamId);
    return { ok: true };
  }

  async function remove(sessionId: string, teamId: string | null): Promise<WriteResult> {
    const res = await supabaseService.deleteMatrixSession(sessionId);
    if (!res?.ok) return { ok: false, error: res?.error || 'Could not delete that session.' };

    await loadHistory(teamId);
    return { ok: true };
  }

  return {
    sessions, results, bands, goalBands, drills, editingId, editing, loading, loadError,
    loadHistory, loadDrills, loadBands, openNew, openExisting, save, remove
  };
});
