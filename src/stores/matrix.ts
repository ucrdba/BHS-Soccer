/**
 * The Competitive Matrix.
 *
 * Points are derived in Postgres, not stored: `matrix_standings` and
 * `matrix_exercise_points` are views over the logged results. Two consequences
 * shape this store.
 *
 * A write is never patched into local state — after correcting a result the
 * whole thing reloads, because the database has re-derived every rank and a
 * local edit would show an ordering it does not agree with.
 *
 * And the standings are LEFT-joined onto the roster, so a player who has taken
 * part in nothing still appears on their own squad's board.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabaseService } from '../data/supabase';
import { toRoster } from '../domain/player-row';
import { joinStandings } from '../domain/matrix-standings';
import {
  matrixBoardRows, exerciseLeaderboard, exercisesWithResults,
  boardSortDescends, exerciseSortDescends, nextSortState,
  BOARD_SORT_KEYS, exerciseSortKind, exerciseSortKeys,
  type SortState
} from '../domain/matrix';
import { readSort, writeSort } from '../data/sort-memory';
import { isThresholdMeasure, belowStandard, roleGoalShortfall } from '../domain/matrix-threshold';

export interface WriteResult { ok: boolean; error?: string }

export const useMatrixStore = defineStore('matrix', () => {
  const players = ref<any[]>([]);
  const exercisePoints = ref<any[]>([]);
  const drillsBank = ref<any[]>([]);
  const logs = ref<any[]>([]);
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  const loadedTeamId = ref<string | null>(null);

  // Both sorts open as the coach last left them on this device.
  const boardSort = ref<SortState>(readSort('board', BOARD_SORT_KEYS, { by: 'rank', reversed: false }));
  const exerciseSort = ref<SortState>({ by: 'earned', reversed: false });
  const exerciseFilter = ref('');

  const boardRows = computed(() =>
    matrixBoardRows(players.value, boardSort.value.by, boardSort.value.reversed));

  const ctx = computed(() => ({
    points: exercisePoints.value,
    players: players.value,
    drillsBank: drillsBank.value
  }));

  /** The drills that actually have results, for the picker. */
  const exercises = computed(() => exercisesWithResults(ctx.value));

  const selectedDrill = computed(() =>
    drillsBank.value.find(d => d.id === exerciseFilter.value) || null);

  const measure = computed(() => selectedDrill.value?.measure || '');

  const leaderboard = computed(() =>
    exerciseFilter.value
      ? exerciseLeaderboard(ctx.value, exerciseFilter.value,
                            exerciseSort.value.by, exerciseSort.value.reversed)
      : []);

  /**
   * Whether the selected exercise is a standard rather than a competition.
   *
   * Drives emphasis only. The table keeps every row and every sort.
   */
  const isThreshold = computed(() => isThresholdMeasure(measure.value));
  const shortOfStandard = computed(() =>
    isThreshold.value ? belowStandard(leaderboard.value) : []);

  /**
   * Goals by role: "2 of 6 attackers below the standard", per role.
   *
   * Emphasis only. Players in a role the squad has no standards for have no
   * scored line, so they are not counted.
   */
  const roleShortfall = computed(() =>
    measure.value === 'role_goals' ? roleGoalShortfall(leaderboard.value) : []);
  /**
   * Everyone the standard applies to, which is what "7 of 24" counts against.
   *
   * Every player on the board, not just those who ran: a player who has never
   * run it is now counted as short of the standard, and leaving him out of the
   * denominator while counting him in the numerator would let the fraction
   * exceed itself.
   */
  const measuredCount = computed(() =>
    isThreshold.value ? leaderboard.value.length : 0);

  /**
   * The team scopes the results; the organization scopes the drill library.
   *
   * Both are needed. fetchDrillsForWeighting refuses without a school rather
   * than defaulting to one -- so a bare call returns null and the exercise
   * picker is silently empty.
   */
  async function load(teamId: string | null, schoolId: string | null): Promise<void> {
    if (!teamId) { players.value = []; loadedTeamId.value = null; return; }
    loading.value = true;
    loadError.value = null;
    try {
      const [roster, standings, points, bank, matrixLogs] = await Promise.all([
        supabaseService.fetchTeamRoster(teamId),
        supabaseService.fetchMatrixStandings(teamId),
        supabaseService.fetchTeamExercisePoints(teamId),
        supabaseService.fetchDrillsForWeighting(schoolId || undefined),
        supabaseService.fetchMatrixLogs(teamId)
      ]);

      players.value = joinStandings(toRoster(roster), standings);
      exercisePoints.value = points || [];
      drillsBank.value = bank || [];
      logs.value = matrixLogs || [];
      loadedTeamId.value = teamId;
    } catch (err: any) {
      loadError.value = err?.message || 'Could not load the ratings.';
      console.error('Matrix load failed:', err);
    } finally {
      loading.value = false;
    }
  }

  // The decision moves to the domain module; the assignment stays here.
  function setBoardSort(by: string): void {
    boardSort.value = nextSortState(boardSort.value, by);
    writeSort('board', boardSort.value);
  }

  /** Remembered per kind of leaderboard, since their columns differ. */
  const exerciseSortName = () => `exercise.${exerciseSortKind(measure.value)}`;

  function setExerciseSort(by: string): void {
    exerciseSort.value = nextSortState(exerciseSort.value, by);
    writeSort(exerciseSortName(), exerciseSort.value);
  }

  function setExerciseFilter(id: string): void {
    exerciseFilter.value = id || '';
    // A new exercise opens on the sort last used for its kind, never on the
    // last exercise's, which may be a column this measure does not have.
    exerciseSort.value = readSort(exerciseSortName(), exerciseSortKeys(measure.value),
      { by: 'earned', reversed: false });
  }

  /** Which way a column reads on its first click, for the header arrow. */
  function boardDescends(by: string): boolean {
    return boardSortDescends(by) !== boardSort.value.reversed;
  }

  function exerciseDescends(by: string): boolean {
    const timed = measure.value === 'time_low' || measure.value === 'time_bands';
    return exerciseSortDescends(by, timed) !== exerciseSort.value.reversed;
  }

  /**
   * Remove a mis-entered result.
   *
   * Reloads rather than splicing: the standings view re-derives every player's
   * rank from the remaining rows, so patching locally would show an ordering
   * Postgres does not agree with.
   */
  async function removeResult(
    logId: string, teamId: string, schoolId: string | null
  ): Promise<WriteResult> {
    if (!teamId) return { ok: false, error: 'No active team selected.' };

    const res = await supabaseService.deleteMatrixResult(logId);
    if (!res?.ok) {
      return { ok: false, error: res?.error || 'Could not delete that result.' };
    }
    await load(teamId, schoolId);
    return { ok: true };
  }

  return {
    players, exercisePoints, drillsBank, logs,
    loading, loadError, loadedTeamId,
    boardSort, exerciseSort, exerciseFilter,
    boardRows, exercises, leaderboard, selectedDrill, measure,
    isThreshold, shortOfStandard, roleShortfall, measuredCount,
    load, setBoardSort, setExerciseSort, setExerciseFilter,
    boardDescends, exerciseDescends, removeResult
  };
});
