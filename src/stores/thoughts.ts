/**
 * The daily message a coach puts in front of the squad.
 *
 * One message is active at a time per team, and setting a new one stands the
 * old one down — `setActiveDailyThought` clears the team's flag before
 * setting the new row, scoped to the team so it cannot clear another squad's.
 *
 * A message can carry a title and an import key, which is how a quiz question
 * names the message it tests: `fetchTeamQuiz` only asks such a question while
 * that message is the active one. So deleting a message quietly stops some
 * questions being asked, and the UI has to say so.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabaseService } from '../data/supabase';

export interface WriteResult { ok: boolean; error?: string }

export const useThoughtsStore = defineStore('thoughts', () => {
  const thoughts = ref<any[]>([]);
  const copyTargets = ref<any[]>([]);
  const loading = ref(false);
  const loadError = ref<string | null>(null);

  const active = computed(() => thoughts.value.find(t => t.is_active) || null);

  async function load(teamId: string | null): Promise<void> {
    if (!teamId) { loadError.value = 'Choose a team first.'; thoughts.value = []; return; }

    loading.value = true;
    try {
      const rows = await supabaseService.fetchDailyThoughts(teamId);
      // Null is a failed read. An empty list would say the coach has written
      // nothing, which is a different thing.
      if (rows === null) {
        loadError.value = 'Could not load the daily messages.';
        thoughts.value = [];
        return;
      }
      loadError.value = null;
      thoughts.value = rows as any[];
    } finally {
      loading.value = false;
    }
  }

  async function loadCopyTargets(): Promise<void> {
    copyTargets.value = (await supabaseService.teamsCoachedBy()) || [];
  }

  async function save(teamId: string | null, thought: any): Promise<WriteResult> {
    if (!teamId) return { ok: false, error: 'Choose a team first.' };

    const res = await supabaseService.upsertDailyThought(teamId, thought);
    if (res?.error) return { ok: false, error: res.error };

    await load(teamId);
    return { ok: true };
  }

  /** Make one message the active one; the rest stand down. */
  async function setActive(teamId: string | null, id: string): Promise<WriteResult> {
    if (!teamId) return { ok: false, error: 'Choose a team first.' };

    await supabaseService.setActiveDailyThought(teamId, id);
    await load(teamId);
    return { ok: true };
  }

  async function remove(teamId: string | null, id: string): Promise<WriteResult> {
    const res = await supabaseService.deleteDailyThought(id);
    if (res?.error) return { ok: false, error: res.error };

    await load(teamId);
    return { ok: true };
  }

  async function copyToTeam(thoughtId: string, toTeamId: string): Promise<WriteResult> {
    const res = await supabaseService.copyDailyThought(thoughtId, toTeamId);
    return res?.ok ? { ok: true } : { ok: false, error: res?.error || 'Could not copy that message.' };
  }

  return {
    thoughts, copyTargets, loading, loadError, active,
    load, loadCopyTargets, save, setActive, remove, copyToTeam
  };
});
