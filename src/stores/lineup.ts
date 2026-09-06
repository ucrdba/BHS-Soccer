/**
 * A fixture's team sheet.
 *
 * The rules all live in `domain/lineup.ts`, tested since Phase 0 — which
 * slots a formation has, what a drop should do, who is starting and who is
 * dressed. This store holds the state they operate on and the two client
 * calls around it.
 *
 * Two things it is careful about:
 *
 * **Changing formation keeps the players it can.** A 4-4-2 to 4-3-3 move is a
 * few slots changing, not a sheet thrown away; a coach adjusting shape
 * mid-thought must not lose ten placements.
 *
 * **`saveLineup` needs both a team and an organization.** It refuses without
 * either, so a bare call saves nothing and says so only in a console warning.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabaseService } from '../data/supabase';
import {
  lineupSlots, lineupSquad, assignLineupSlot, clearLineupSlot,
  lineupStarters, lineupBench, lineupRowsForSave,
  resolveLineupDrop, applyLineupDrop,
  type DropTarget
} from '../domain/lineup';

export interface WriteResult { ok: boolean; error?: string }

export const useLineupStore = defineStore('lineup', () => {
  const formation = ref('4-4-2');
  /** slot → playerId. */
  const assignments = ref<Record<string, string>>({});
  /** playerId → true. Null means everyone is dressed. */
  const dressed = ref<Record<string, boolean> | null>(null);
  const notes = ref('');
  const matchId = ref<string | null>(null);
  const index = ref<any[]>([]);
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  const saveError = ref<string | null>(null);

  const slots = computed(() => lineupSlots(formation.value));

  function squadOf(players: any[]): any[] { return lineupSquad(players); }

  function starters(players: any[]): any[] {
    return lineupStarters(assignments.value, squadOf(players), formation.value);
  }

  function bench(players: any[]): any[] {
    return lineupBench(assignments.value, squadOf(players), formation.value, dressed.value);
  }

  function reset(): void {
    formation.value = '4-4-2';
    assignments.value = {};
    notes.value = '';
  }

  async function load(teamId: string | null, forMatchId: string | null): Promise<void> {
    if (!teamId) { loadError.value = 'Choose a team first.'; return; }

    loading.value = true;
    matchId.value = forMatchId;
    try {
      const row = await supabaseService.fetchLineup(teamId, forMatchId);
      // Null is both "no lineup yet" and "the read failed", and the client
      // does not distinguish them. A blank sheet is the safe reading: the
      // coach fills it in, and saving replaces whatever was there.
      if (!row) { reset(); loadError.value = null; return; }

      formation.value = row.formation || '4-4-2';
      notes.value = row.notes || '';

      const next: Record<string, string> = {};
      (row.players || []).forEach((p: any) => {
        if (p.role === 'starter' && p.slot) next[p.slot] = p.player_id;
      });
      assignments.value = next;
      loadError.value = null;
    } finally {
      loading.value = false;
    }
  }

  /** The fixtures that already have a sheet, for marking the ones that do not. */
  async function loadIndex(teamId: string | null): Promise<void> {
    if (!teamId) return;
    index.value = (await supabaseService.fetchTeamLineups(teamId)) || [];
  }

  /**
   * Keep every player whose slot still exists in the new shape.
   *
   * A player whose slot is gone comes off the pitch rather than being
   * dropped from the squad — they are on the bench, which is where a coach
   * changing shape expects to find them.
   */
  function setFormation(next: string): void {
    const kept: Record<string, string> = {};
    const available = new Set(lineupSlots(next).map(s => s.slot));

    Object.keys(assignments.value).forEach(slot => {
      if (available.has(slot)) kept[slot] = assignments.value[slot];
    });

    formation.value = next;
    assignments.value = kept;
  }

  function place(playerId: string, slot: string): void {
    // assignLineupSlot mutates; reassign so Vue sees the change.
    const next = { ...assignments.value };
    assignLineupSlot(next, slot, playerId);
    assignments.value = next;
  }

  function clear(slot: string): void {
    const next = { ...assignments.value };
    clearLineupSlot(next, slot);
    assignments.value = next;
  }

  /** A drag, resolved by the domain rules rather than by the handler. */
  function drop(target: DropTarget): boolean {
    const next = { ...assignments.value };
    const changed = applyLineupDrop(next, resolveLineupDrop(target));
    if (changed) assignments.value = next;
    return changed;
  }

  /** Which slot a player currently holds, if any. */
  function slotOf(playerId: string): string | null {
    return Object.keys(assignments.value).find(s => assignments.value[s] === playerId) || null;
  }

  async function save(
    teamId: string | null, schoolId: string | null, players: any[]
  ): Promise<WriteResult> {
    if (!teamId) return { ok: false, error: 'Choose a team first.' };
    // saveLineup refuses without an organization and says so only to the
    // console, so the sheet would appear to save and be gone on reload.
    if (!schoolId) return { ok: false, error: 'No organization for this team.' };

    const rows = lineupRowsForSave(
      assignments.value, squadOf(players), formation.value, dressed.value);

    const res = await supabaseService.saveLineup(
      teamId, schoolId, matchId.value, formation.value, rows, notes.value || null);

    if (!res?.ok) {
      saveError.value = res?.error || 'Could not save that lineup.';
      return { ok: false, error: saveError.value };
    }

    saveError.value = null;
    await loadIndex(teamId);
    return { ok: true };
  }

  return {
    formation, assignments, dressed, notes, matchId, index,
    loading, loadError, saveError, slots,
    load, loadIndex, setFormation, place, clear, drop, slotOf, save,
    squadOf, starters, bench, reset
  };
});
