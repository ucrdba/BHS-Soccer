/**
 * The practice plan a coach is building.
 *
 * Four facts about the storage shape are held here, and each is a failure the
 * legacy app either hit or carries a warning comment about:
 *
 * 1. `saveFullPracticePlan` **upserts and never deletes**, so a removed drill
 *    needs its row soft-deleted separately or it returns on the next reload.
 * 2. A team's plans **replace** the picker. Merging let a coach load another
 *    team's plan, which copied that team's `practice_plans` row ids into the
 *    working plan — and the next edit upserted on those ids with the new
 *    team's id, moving the other team's rows.
 * 3. `saveFullPracticePlan` reports `{ success }`, not `{ ok }`. Reading
 *    `res.ok` is always `undefined`, so every save would report as a failure.
 * 4. Copy-to-team matches on the plan NAME, so it can only work when the
 *    active name is a plan that really exists.
 *
 * Times are never typed twice: every mutation reflows the timeline before it
 * writes, because a printed plan is read on a touchline against a watch.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabaseService } from '../data/supabase';
import {
  groupPracticePlans, recalculateTimeline, moveItem, totalSessionTime,
  sessionStartMinutes,
  type PlanItem, type SavedPlan
} from '../domain/practice-plan';
import { toPlanRows, removedItemIds } from '../domain/plan-row';

export interface WriteResult { ok: boolean; error?: string }

export const usePlannerStore = defineStore('planner', () => {
  const items = ref<PlanItem[]>([]);
  const savedPlans = ref<SavedPlan[]>([]);
  const drillsBank = ref<any[]>([]);
  const copyTargets = ref<any[]>([]);
  const activePlanName = ref('');
  const selectedIndex = ref(0);
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  const saveError = ref<string | null>(null);

  const totalTime = computed(() => totalSessionTime(items.value));

  /**
   * The plan "Copy to team…" can actually send.
   *
   * Null until the active name matches a saved plan, because the copy matches
   * on that name — and the planner's default heading names a plan no write
   * path ever stores, so the control failed for every coach who had not just
   * loaded one.
   */
  const copyablePlan = computed(() =>
    (activePlanName.value && savedPlans.value.find(p => p.name === activePlanName.value)) || null);

  async function readPlans(teamId: string): Promise<boolean> {
    const rows = await supabaseService.fetchPracticePlans(teamId);
    if (rows === null) {
      loadError.value = 'Could not load this team\'s practice plans.';
      return false;
    }
    // Replaced, never merged. See note 2 above.
    savedPlans.value = groupPracticePlans(rows);
    loadError.value = null;
    return true;
  }

  async function load(teamId: string | null, schoolId: string | null): Promise<void> {
    if (!teamId) { loadError.value = 'Choose a team first.'; return; }

    loading.value = true;
    try {
      // A team switch takes the working plan with it: those rows belong to the
      // team that was active, and editing them under another team moves them.
      items.value = [];
      activePlanName.value = '';
      selectedIndex.value = 0;

      await readPlans(teamId);

      if (schoolId) {
        drillsBank.value = (await supabaseService.fetchDrillsBank(schoolId)) || [];
      }
    } finally {
      loading.value = false;
    }
  }

  async function loadDrillsBank(schoolId: string | null): Promise<void> {
    if (!schoolId) return;
    drillsBank.value = (await supabaseService.fetchDrillsBank(schoolId)) || [];
  }

  async function loadCopyTargets(): Promise<void> {
    copyTargets.value = (await supabaseService.teamsCoachedBy()) || [];
  }

  /** Write the working plan as it now stands. Reflowed first, always. */
  async function persist(teamId: string | null): Promise<WriteResult> {
    if (!teamId) return { ok: false, error: 'Choose a team first.' };
    if (items.value.length === 0) return { ok: true };

    const name = activePlanName.value || 'Current Practice Session';
    const res = await supabaseService.saveFullPracticePlan(
      teamId, { name, items: items.value });

    // { success }, not { ok } — see note 3 above.
    if (!res?.success) {
      saveError.value = res?.error || 'Could not save that plan.';
      return { ok: false, error: saveError.value! };
    }
    saveError.value = null;
    return { ok: true };
  }

  function reflow(): void {
    items.value = recalculateTimeline(items.value);
  }

  /**
   * Add one drill, and keep the row id the database assigns it.
   *
   * Written a row at a time rather than through the full-plan save, because
   * that is what returns the id. Without it the drill has none, so the next
   * save upserts a row with no key and INSERTS a second one — the coach sees
   * the drill twice, and only after a reload.
   *
   * `planName` is always sent: `savePracticePlanItem` otherwise falls back to
   * `window.app.data.activePlanName`, a global the Vue app does not set, and
   * files the drill under "Standard Practice Plan".
   */
  async function addDrill(teamId: string | null, item: PlanItem): Promise<WriteResult> {
    if (!teamId) return { ok: false, error: 'Choose a team first.' };

    const planName = activePlanName.value || 'Current Practice Session';
    const withTimes = recalculateTimeline(
      items.value.concat([item]), sessionStartMinutes(items.value));
    const added = withTimes[withTimes.length - 1];

    const saved = await supabaseService.savePracticePlanItem(
      teamId, { ...added, planName });

    // The drill is on the timeline either way; it just is not in Postgres,
    // and it would vanish on the next reload without a word.
    if (!saved?.id) {
      items.value = withTimes;
      selectedIndex.value = items.value.length - 1;
      saveError.value = `"${added.name}" was added to the timeline but NOT saved. `
        + 'It will disappear on reload — check a team is selected.';
      return { ok: false, error: saveError.value };
    }

    saveError.value = null;
    items.value = withTimes.map((d, i) =>
      (i === withTimes.length - 1 ? { ...d, id: saved.id } : d));
    selectedIndex.value = items.value.length - 1;
    return { ok: true };
  }

  async function editDrill(teamId: string | null, index: number, item: PlanItem): Promise<WriteResult> {
    items.value = items.value.map((d, i) => (i === index ? item : d));
    reflow();
    return persist(teamId);
  }

  /**
   * Take a drill out, and take its row with it.
   *
   * The save upserts and never deletes, so without the soft delete the drill
   * is back after the next reload.
   */
  async function removeDrill(teamId: string | null, index: number): Promise<WriteResult> {
    const before = items.value;
    // Captured first: removing the drill that happens to be at the top would
    // otherwise move practice itself to whenever the second one started.
    const start = sessionStartMinutes(before);
    const after = before.filter((_, i) => i !== index);

    for (const id of removedItemIds(before, after)) {
      await supabaseService.deletePracticePlanItem(id);
    }

    items.value = recalculateTimeline(after, start);
    if (selectedIndex.value >= items.value.length) {
      selectedIndex.value = Math.max(0, items.value.length - 1);
    }
    return persist(teamId);
  }

  /** A reorder is a save: the order is the plan. */
  async function move(teamId: string | null, from: number, to: number): Promise<WriteResult> {
    // The session's start belongs to the session, not to whichever drill is
    // first. Read before the move, or dragging the 4:00 drill down moves
    // practice to 4:20.
    const start = sessionStartMinutes(items.value);
    const moved = moveItem(items.value, from, to);
    items.value = recalculateTimeline(moved.items, start);
    selectedIndex.value = moved.selected(selectedIndex.value);
    return persist(teamId);
  }

  async function savePlan(teamId: string | null, name: string): Promise<WriteResult> {
    const planName = (name || '').trim();
    if (!planName) return { ok: false, error: 'Give the plan a name.' };
    if (items.value.length === 0) return { ok: false, error: 'Add a drill before saving the plan.' };
    if (!teamId) return { ok: false, error: 'Choose a team first.' };

    const res = await supabaseService.saveFullPracticePlan(
      teamId, { name: planName, items: recalculateTimeline(items.value) });

    if (!res?.success) {
      saveError.value = res?.error || 'Could not save that plan.';
      return { ok: false, error: saveError.value! };
    }

    saveError.value = null;
    activePlanName.value = planName;
    await readPlans(teamId);
    return { ok: true };
  }

  function loadPlan(planId: string): void {
    const plan = savedPlans.value.find(p => p.id === planId);
    if (!plan) return;

    items.value = recalculateTimeline(plan.drills);
    activePlanName.value = plan.name;
    selectedIndex.value = 0;
  }

  async function renamePlan(
    teamId: string | null, oldName: string, newName: string
  ): Promise<WriteResult> {
    if (!teamId) return { ok: false, error: 'Choose a team first.' };

    const res = await supabaseService.renamePracticePlan(teamId, oldName, newName);
    if (!res?.ok) return { ok: false, error: res?.error || 'Could not rename that plan.' };

    if (activePlanName.value === oldName) activePlanName.value = newName.trim();
    await readPlans(teamId);
    return { ok: true };
  }

  async function deletePlan(planId: string, teamId: string | null): Promise<WriteResult> {
    const plan = savedPlans.value.find(p => p.id === planId);
    if (!plan) return { ok: false, error: 'That plan is no longer there.' };
    if (!teamId) return { ok: false, error: 'Choose a team first.' };

    // A plan is its rows; there is nothing else to delete.
    for (const d of plan.drills) {
      if (d.id) await supabaseService.deletePracticePlanItem(d.id);
    }

    if (activePlanName.value === plan.name) {
      activePlanName.value = '';
      items.value = [];
      selectedIndex.value = 0;
    }

    await readPlans(teamId);
    return { ok: true };
  }

  async function copyToTeam(fromTeamId: string | null, toTeamId: string): Promise<WriteResult> {
    const plan = copyablePlan.value;
    if (!plan) return { ok: false, error: 'Load a saved plan first.' };
    if (!fromTeamId) return { ok: false, error: 'Choose a team first.' };

    const res = await supabaseService.copyPracticePlan(plan.name, fromTeamId, toTeamId);
    return res?.ok ? { ok: true } : { ok: false, error: res?.error || 'Could not copy that plan.' };
  }

  return {
    items, savedPlans, drillsBank, copyTargets, activePlanName, selectedIndex,
    loading, loadError, saveError, totalTime, copyablePlan,
    load, loadDrillsBank, loadCopyTargets,
    addDrill, editDrill, removeDrill, move,
    savePlan, loadPlan, renamePlan, deletePlan, copyToTeam
  };
});
