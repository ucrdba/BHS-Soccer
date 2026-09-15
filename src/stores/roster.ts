/**
 * The active team's squad, and the writes that change it.
 *
 * These are the first Postgres writes in the Vue app, so the rules the legacy
 * code learned the hard way are kept deliberately:
 *
 * - A write is never attempted without a resolved team. `upsertTeamMembership`
 *   refuses one anyway, but a caller that tries is a caller that will one day
 *   report success over a silent loss.
 * - After a write the roster is RELOADED rather than patched locally, so what
 *   is on screen is what is in Postgres. A write that does not survive a
 *   reload never happened.
 * - Editing is two steps that can half-fail: the person's identity saves, and
 *   this team's number, position and stats do not. That is reported as what it
 *   is, rather than as "nothing saved".
 * - Removing a player deletes their MEMBERSHIP, not the person. They may be on
 *   a club side too, and their Matrix history belongs to them.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabaseService } from '../data/supabase';
import { toRoster, type Player } from '../domain/player-row';
import { sortedPlayers } from '../domain/roster';
import { filterRoster, rosterFilters } from '../domain/roster-view';

export interface PlayerForm {
  firstName: string;
  lastName: string;
  classYear?: string;
  height?: string;
  photo?: string;
  number?: string | number | null;
  recordingNumber?: string | number | null;
  position?: number | null;
  seasonStats?: Record<string, any>;
  ratings?: Record<string, any>;
}

export interface WriteResult { ok: boolean; error?: string; partial?: boolean }

const num = (v: any): number | null => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : null;
};

export const useRosterStore = defineStore('roster', () => {
  const players = ref<Player[]>([]);
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  /** Null until a load has happened, so "no players" is not claimed early. */
  const loadedTeamId = ref<string | null>(null);

  const sortBy = ref<'number' | 'name'>('number');
  const filter = ref('ALL');

  const visible = computed(() =>
    filterRoster(sortedPlayers(players.value, sortBy.value) as Player[], filter.value));
  const filters = computed(() => rosterFilters(players.value));

  async function load(teamId: string | null): Promise<void> {
    if (!teamId) { players.value = []; loadedTeamId.value = null; return; }
    loading.value = true;
    loadError.value = null;
    try {
      // fetchTeamRoster, not fetchPlayers -- the latter defaults schoolId to
      // 'bhs' and would silently serve Beaumont's squad to a club coach.
      players.value = toRoster(await supabaseService.fetchTeamRoster(teamId));
      loadedTeamId.value = teamId;
    } catch (err: any) {
      loadError.value = err?.message || 'Could not load the roster.';
      console.error('Roster load failed:', err);
    } finally {
      loading.value = false;
    }
  }

  /** The membership fields, from a form. */
  function membershipFrom(f: PlayerForm, playerId: string): Record<string, any> {
    return {
      player_id: playerId,
      number: num(f.number),
      recording_number: num(f.recordingNumber),
      position: f.position ?? null,
      season_stats: f.seasonStats ?? {},
      ratings: f.ratings ?? {}
    };
  }

  async function addPlayer(
    f: PlayerForm, teamId: string, schoolId: string
  ): Promise<WriteResult> {
    if (!teamId || !schoolId) return { ok: false, error: 'No active team selected.' };

    const identity = await supabaseService.upsertPlayerIdentity({
      firstName: f.firstName, lastName: f.lastName,
      classYear: f.classYear, height: f.height, photo: f.photo
    });
    // upsertPlayerIdentity returns null for failure, so a caller that ignores
    // the return reports success over a silent loss.
    if (!identity?.id) return { ok: false, error: 'Could not save that player\'s profile.' };

    const res = await supabaseService.upsertTeamMembership(
      teamId, schoolId, membershipFrom(f, identity.id));
    if (!res?.ok) {
      return { ok: false, partial: true, error: res?.error || 'Could not add them to this team.' };
    }

    await load(teamId);
    return { ok: true };
  }

  /**
   * Put an existing person on this team.
   *
   * The likeliest failure is unique (school_id, player_id): they are already
   * on another team in this same organization, which the model forbids.
   */
  async function addExistingPlayer(
    playerId: string, teamId: string, schoolId: string
  ): Promise<WriteResult> {
    if (!teamId || !schoolId) return { ok: false, error: 'No active team selected.' };

    const res = await supabaseService.upsertTeamMembership(
      teamId, schoolId, { player_id: playerId });
    if (!res?.ok) {
      return {
        ok: false,
        error: res?.error
          || 'Could not add that player. They may already be on another team in this organization.'
      };
    }
    await load(teamId);
    return { ok: true };
  }

  async function updatePlayer(
    playerId: string, f: PlayerForm, teamId: string, schoolId: string
  ): Promise<WriteResult> {
    if (!teamId || !schoolId) return { ok: false, error: 'No active team selected.' };

    const identity = await supabaseService.upsertPlayerIdentity({
      id: playerId,
      firstName: f.firstName, lastName: f.lastName,
      classYear: f.classYear, height: f.height, photo: f.photo
    });
    if (!identity?.id) return { ok: false, error: 'Could not save that player\'s profile.' };

    const res = await supabaseService.upsertTeamMembership(
      teamId, schoolId, membershipFrom(f, identity.id));
    if (!res?.ok) {
      // Half-saved, and said so. The profile went in; this team's jersey
      // number, position and stats did not. Reporting it as a total failure
      // would send the coach to re-enter something already stored.
      return {
        ok: false,
        partial: true,
        error: (res?.error || 'Could not save this team\'s roster info.')
          + ' Their profile was updated, but jersey number, position and stats on this team were not.'
      };
    }

    await load(teamId);
    return { ok: true };
  }

  /**
   * Take a player off this team.
   *
   * Deletes the membership, never the person: they may play for a club side
   * too, and their Matrix history belongs to them rather than to this squad.
   */
  async function removePlayer(playerId: string, teamId: string): Promise<WriteResult> {
    if (!teamId) return { ok: false, error: 'No active team selected.' };

    const res = await supabaseService.deleteTeamMembership(teamId, playerId);
    if (!res?.ok) {
      return { ok: false, error: res?.error || 'Could not remove that player from this team.' };
    }
    await load(teamId);
    return { ok: true };
  }

  function setSort(by: 'number' | 'name'): void { sortBy.value = by; }
  function setFilter(key: string): void { filter.value = key; }

  return {
    players, loading, loadError, loadedTeamId, sortBy, filter,
    visible, filters,
    load, addPlayer, addExistingPlayer, updatePlayer, removePlayer, setSort, setFilter
  };
});
