/**
 * The practice plan a coach is building.
 *
 * Four things about the storage shape have to be held at once here, and each
 * is a real failure the legacy app either hit or has a comment warning about:
 *
 *  - The save upserts and never deletes, so a removed drill needs its row
 *    soft-deleted or it comes back on the next reload.
 *  - A team's plans replace the picker; merging let a coach load another
 *    team's plan, which copied that team's row ids into the working plan and
 *    MOVED its rows on the next edit.
 *  - saveFullPracticePlan reports { success }, not { ok }.
 *  - Copy-to-team matches on the plan NAME, so it only works when the active
 *    name is a plan that really exists.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const fetchPracticePlans = vi.fn();
const saveFullPracticePlan = vi.fn();
const deletePracticePlanItem = vi.fn();
const renamePracticePlan = vi.fn();
const copyPracticePlan = vi.fn();
const fetchDrillsBank = vi.fn();
const teamsCoachedBy = vi.fn();

vi.mock('../data/supabase', () => ({
  supabaseService: {
    fetchPracticePlans: (...a: any[]) => fetchPracticePlans(...a),
    saveFullPracticePlan: (...a: any[]) => saveFullPracticePlan(...a),
    deletePracticePlanItem: (...a: any[]) => deletePracticePlanItem(...a),
    renamePracticePlan: (...a: any[]) => renamePracticePlan(...a),
    copyPracticePlan: (...a: any[]) => copyPracticePlan(...a),
    fetchDrillsBank: (...a: any[]) => fetchDrillsBank(...a),
    teamsCoachedBy: (...a: any[]) => teamsCoachedBy(...a)
  }
}));

const { usePlannerStore } = await import('./planner');

const TEAM = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-8888-7777-6666-555555555555';
const ROW_A = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ROW_B = 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee';

const planRow = (over: any = {}) => ({
  id: ROW_A, team_id: TEAM, name: 'Tuesday Session', drill: 'Rondo',
  time_slot: '4:00 PM - 4:20 PM', duration: '20 min', coach_notes: 'Two touch',
  created_at: '2026-09-01T00:00:00Z', diagram_image: null, diagram_data: null, ...over
});

const ROWS = [planRow(), planRow({ id: ROW_B, drill: 'Shooting', time_slot: '4:20 PM - 4:40 PM' })];

const DRILLS = [
  { id: 'd1', name: 'Rondo', duration: '20 min', coach_notes: 'Two touch' },
  { id: 'd2', name: 'Shooting', duration: '15 min' }
];

const drill = (over: any = {}) => ({
  name: 'New Drill', time: '', duration: '20 min', coachNotes: '', ...over
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  fetchPracticePlans.mockResolvedValue(ROWS);
  saveFullPracticePlan.mockResolvedValue({ success: true });
  deletePracticePlanItem.mockResolvedValue(undefined);
  renamePracticePlan.mockResolvedValue({ ok: true, slots: 2 });
  copyPracticePlan.mockResolvedValue({ ok: true, slots: 2 });
  fetchDrillsBank.mockResolvedValue(DRILLS);
  teamsCoachedBy.mockResolvedValue([{ id: OTHER, name: 'JV' }]);
});

describe('loading', () => {
  it('groups the team\'s rows into named plans', async () => {
    const s = usePlannerStore();
    await s.load(TEAM, 's1');
    expect(fetchPracticePlans).toHaveBeenCalledWith(TEAM);
    expect(s.savedPlans).toHaveLength(1);
    expect(s.savedPlans[0].drills).toHaveLength(2);
  });

  it('reads the drill library for the ORGANIZATION', async () => {
    const s = usePlannerStore();
    await s.load(TEAM, 's1');
    expect(fetchDrillsBank).toHaveBeenCalledWith('s1');
  });

  it('REPLACES the plan list on a team change rather than merging', async () => {
    // Merging let a coach load another team's plan, which copied that team's
    // practice_plans row ids into the working plan -- and the next edit
    // upserted on those ids with the new team's id, moving the other team's
    // rows. An empty team must produce an empty picker.
    const s = usePlannerStore();
    await s.load(TEAM, 's1');
    expect(s.savedPlans).toHaveLength(1);

    fetchPracticePlans.mockResolvedValue([]);
    await s.load(OTHER, 's1');
    expect(s.savedPlans).toEqual([]);
  });

  it('clears the working plan when the team changes', async () => {
    const s = usePlannerStore();
    await s.load(TEAM, 's1');
    s.items = [drill({ id: ROW_A })];

    fetchPracticePlans.mockResolvedValue([]);
    await s.load(OTHER, 's1');
    expect(s.items).toEqual([]);
    expect(s.activePlanName).toBe('');
  });

  it('reports a failed read rather than showing an empty planner', async () => {
    fetchPracticePlans.mockResolvedValue(null);
    const s = usePlannerStore();
    await s.load(TEAM, 's1');
    expect(s.loadError).toBeTruthy();
  });

  it('refuses to read without a team', async () => {
    const s = usePlannerStore();
    await s.load(null, 's1');
    expect(fetchPracticePlans).not.toHaveBeenCalled();
  });
});

describe('building the timeline', () => {
  it('reflows the times when a drill is added', async () => {
    const s = usePlannerStore();
    s.items = [drill({ time: '4:00 PM - 4:20 PM', duration: '20 min' })];
    await s.addDrill(TEAM, drill({ duration: '30 min', time: '' }));

    expect(s.items[1].time).toBe('4:20 PM - 4:50 PM');
  });

  it('reflows the times when a drill is edited shorter', async () => {
    // The drill after it has to move up, or the printed plan disagrees with
    // the watch a coach is holding.
    const s = usePlannerStore();
    s.items = [
      drill({ time: '4:00 PM - 4:20 PM', duration: '20 min' }),
      drill({ time: '4:20 PM - 4:40 PM', duration: '20 min' })
    ];
    await s.editDrill(TEAM, 0, { ...s.items[0], duration: '10 min' });

    expect(s.items[1].time).toBe('4:10 PM - 4:30 PM');
  });

  it('writes the whole plan on a reorder', async () => {
    // The order IS the plan. A coach who drags two drills and closes the tab
    // has otherwise changed nothing.
    const s = usePlannerStore();
    s.items = [drill({ name: 'A', id: ROW_A }), drill({ name: 'B', id: ROW_B })];
    await s.move(TEAM, 0, 1);

    expect(s.items.map(i => i.name)).toEqual(['B', 'A']);
    expect(saveFullPracticePlan).toHaveBeenCalled();
  });

  it('carries the selection through a reorder', async () => {
    const s = usePlannerStore();
    s.items = [drill({ name: 'A' }), drill({ name: 'B' }), drill({ name: 'C' })];
    s.selectedIndex = 0;
    await s.move(TEAM, 0, 2);

    expect(s.selectedIndex).toBe(2);
  });

  it('deletes nothing on a reorder', async () => {
    const s = usePlannerStore();
    s.items = [drill({ id: ROW_A }), drill({ id: ROW_B })];
    await s.move(TEAM, 0, 1);

    expect(deletePracticePlanItem).not.toHaveBeenCalled();
  });
});

describe('removing a drill', () => {
  it('soft-deletes its row, or it comes back on the next reload', async () => {
    // saveFullPracticePlan upserts and never deletes.
    const s = usePlannerStore();
    s.items = [drill({ id: ROW_A }), drill({ id: ROW_B })];
    await s.removeDrill(TEAM, 0);

    expect(deletePracticePlanItem).toHaveBeenCalledWith(ROW_A);
    expect(s.items).toHaveLength(1);
  });

  it('does not try to delete a drill that was never saved', async () => {
    const s = usePlannerStore();
    s.items = [drill({ id: 'p_1724567890' })];
    await s.removeDrill(TEAM, 0);

    expect(deletePracticePlanItem).not.toHaveBeenCalled();
    expect(s.items).toEqual([]);
  });

  it('pulls the selection back inside the plan', async () => {
    const s = usePlannerStore();
    s.items = [drill(), drill()];
    s.selectedIndex = 1;
    await s.removeDrill(TEAM, 1);

    expect(s.selectedIndex).toBe(0);
  });

  it('leaves the last drill removable', async () => {
    const s = usePlannerStore();
    s.items = [drill()];
    await s.removeDrill(TEAM, 0);
    expect(s.items).toEqual([]);
    expect(s.selectedIndex).toBe(0);
  });
});

describe('saving a plan', () => {
  it('reports success on what the client actually returns', async () => {
    // saveFullPracticePlan predates the { ok } convention. Reading res.ok on
    // it is always undefined, so every successful save would report failure.
    const s = usePlannerStore();
    s.items = [drill()];
    const res = await s.savePlan(TEAM, 'Tuesday Session');

    expect(res.ok).toBe(true);
    expect(s.saveError).toBeNull();
  });

  it('reports the client\'s message when it refuses', async () => {
    saveFullPracticePlan.mockResolvedValue({ success: false, error: 'No team selected; refusing to save an unscoped practice plan.' });
    const s = usePlannerStore();
    s.items = [drill()];
    const res = await s.savePlan(TEAM, 'Tuesday Session');

    expect(res.ok).toBe(false);
    expect(s.saveError).toMatch(/unscoped/);
  });

  it('makes the saved name the active one', async () => {
    // Copy-to-team matches on the name, so it only works once this is real.
    const s = usePlannerStore();
    s.items = [drill()];
    await s.savePlan(TEAM, 'Tuesday Session');
    expect(s.activePlanName).toBe('Tuesday Session');
  });

  it('will not save an empty plan', async () => {
    const s = usePlannerStore();
    s.items = [];
    const res = await s.savePlan(TEAM, 'Tuesday Session');

    expect(res.ok).toBe(false);
    expect(saveFullPracticePlan).not.toHaveBeenCalled();
  });

  it('will not save without a name', async () => {
    const s = usePlannerStore();
    s.items = [drill()];
    expect((await s.savePlan(TEAM, '  ')).ok).toBe(false);
  });
});

describe('loading a saved plan', () => {
  it('replaces the timeline and names the plan', async () => {
    const s = usePlannerStore();
    await s.load(TEAM, 's1');
    s.loadPlan(s.savedPlans[0].id);

    expect(s.items).toHaveLength(2);
    expect(s.activePlanName).toBe('Tuesday Session');
  });

  it('reflows the times it loaded', async () => {
    const s = usePlannerStore();
    await s.load(TEAM, 's1');
    s.loadPlan(s.savedPlans[0].id);
    expect(s.items[1].time).toBe('4:20 PM - 4:40 PM');
  });

  it('does nothing for a plan that is not there', async () => {
    const s = usePlannerStore();
    await s.load(TEAM, 's1');
    s.loadPlan('plan_db_nothing');
    expect(s.items).toEqual([]);
  });
});

describe('copying a plan to another team', () => {
  it('is only offered once the active name is a plan that exists', async () => {
    // copyPracticePlan matches on the name. The default heading names a plan
    // no write path ever stores, so the control failed for every coach who
    // had not just loaded one.
    const s = usePlannerStore();
    await s.load(TEAM, 's1');
    expect(s.copyablePlan).toBeNull();

    s.loadPlan(s.savedPlans[0].id);
    expect(s.copyablePlan?.name).toBe('Tuesday Session');
  });

  it('offers only the teams the coach may write to', async () => {
    // is_team_coach() refuses the write regardless, so offering a team the
    // coach cannot write to is a control that always fails.
    const s = usePlannerStore();
    await s.loadCopyTargets();
    expect(teamsCoachedBy).toHaveBeenCalled();
    expect(s.copyTargets).toHaveLength(1);
  });

  it('sends the plan name and both teams', async () => {
    const s = usePlannerStore();
    await s.load(TEAM, 's1');
    s.loadPlan(s.savedPlans[0].id);
    await s.copyToTeam(TEAM, OTHER);

    expect(copyPracticePlan).toHaveBeenCalledWith('Tuesday Session', TEAM, OTHER);
  });

  it('passes on a refusal in the client\'s own words', async () => {
    copyPracticePlan.mockResolvedValue({ ok: false, error: 'Those teams belong to different organizations.' });
    const s = usePlannerStore();
    await s.load(TEAM, 's1');
    s.loadPlan(s.savedPlans[0].id);
    const res = await s.copyToTeam(TEAM, OTHER);

    expect(res.error).toMatch(/different organizations/);
  });
});

describe('renaming and deleting a plan', () => {
  it('renames on the team, and re-reads', async () => {
    const s = usePlannerStore();
    await s.load(TEAM, 's1');
    await s.renamePlan(TEAM, 'Tuesday Session', 'Wednesday Session');

    expect(renamePracticePlan).toHaveBeenCalledWith(TEAM, 'Tuesday Session', 'Wednesday Session');
    expect(fetchPracticePlans).toHaveBeenCalledTimes(2);
  });

  it('follows the plan when the active one is the one renamed', async () => {
    const s = usePlannerStore();
    await s.load(TEAM, 's1');
    s.loadPlan(s.savedPlans[0].id);
    await s.renamePlan(TEAM, 'Tuesday Session', 'Wednesday Session');

    expect(s.activePlanName).toBe('Wednesday Session');
  });

  it('reports a name clash rather than pretending it renamed', async () => {
    renamePracticePlan.mockResolvedValue({ ok: false, error: 'This team already has a plan called "Wednesday Session".' });
    const s = usePlannerStore();
    const res = await s.renamePlan(TEAM, 'Tuesday Session', 'Wednesday Session');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/already has a plan/);
  });

  it('deletes every row of a plan, then re-reads', async () => {
    const s = usePlannerStore();
    await s.load(TEAM, 's1');
    await s.deletePlan(s.savedPlans[0].id, TEAM);

    expect(deletePracticePlanItem).toHaveBeenCalledWith(ROW_A);
    expect(deletePracticePlanItem).toHaveBeenCalledWith(ROW_B);
    expect(fetchPracticePlans).toHaveBeenCalledTimes(2);
  });

  it('clears the working plan when the deleted one was active', async () => {
    const s = usePlannerStore();
    await s.load(TEAM, 's1');
    s.loadPlan(s.savedPlans[0].id);
    await s.deletePlan(s.savedPlans[0].id, TEAM);

    expect(s.activePlanName).toBe('');
    expect(s.items).toEqual([]);
  });
});
