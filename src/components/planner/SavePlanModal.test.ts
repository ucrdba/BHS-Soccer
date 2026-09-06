/**
 * Named plans — saving, renaming, deleting and copying one.
 *
 * The assertion that matters most is that "Copy to team" is not offered until
 * the active plan is one that really exists. copyPracticePlan matches on the
 * plan NAME, and the legacy planner's heading defaults to a name no write
 * path ever stores -- so the control returned `No plan named "Standard
 * Practice Session" on that team` for every coach who had not just loaded
 * one, on a team with a full set of rows.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import SavePlanModal from './SavePlanModal.vue';

const fetchPracticePlans = vi.fn();
const saveFullPracticePlan = vi.fn();
const savePracticePlanItem = vi.fn();
const deletePracticePlanItem = vi.fn();
const renamePracticePlan = vi.fn();
const copyPracticePlan = vi.fn();
const teamsCoachedBy = vi.fn();
const fetchDrillsBank = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchPracticePlans: (...a: any[]) => fetchPracticePlans(...a),
    saveFullPracticePlan: (...a: any[]) => saveFullPracticePlan(...a),
    savePracticePlanItem: (...a: any[]) => savePracticePlanItem(...a),
    deletePracticePlanItem: (...a: any[]) => deletePracticePlanItem(...a),
    renamePracticePlan: (...a: any[]) => renamePracticePlan(...a),
    copyPracticePlan: (...a: any[]) => copyPracticePlan(...a),
    teamsCoachedBy: (...a: any[]) => teamsCoachedBy(...a),
    fetchDrillsBank: (...a: any[]) => fetchDrillsBank(...a)
  }
}));

const TEAM = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-8888-7777-6666-555555555555';
const ROW_A = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const PLAN = {
  id: 'plan_db_tuesday_session',
  name: 'Tuesday Session',
  date: 'SEP 1, 2026',
  drills: [
    { id: ROW_A, name: 'Rondo', time: '4:00 PM - 4:20 PM', duration: '20 min', coachNotes: '' }
  ]
};

const flush = () => new Promise(r => setTimeout(r, 0));

async function mountSave(opts: { active?: string; plans?: any[] } = {}) {
  const { active = '', plans = [PLAN] } = opts;

  const w = mount(SavePlanModal, {
    props: { open: true, teamId: TEAM },
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: false,
        initialState: {
          planner: { savedPlans: plans, activePlanName: active, items: PLAN.drills }
        }
      })]
    },
    attachTo: document.body
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  fetchPracticePlans.mockResolvedValue([]);
  saveFullPracticePlan.mockResolvedValue({ success: true });
  renamePracticePlan.mockResolvedValue({ ok: true, slots: 1 });
  copyPracticePlan.mockResolvedValue({ ok: true, slots: 1 });
  deletePracticePlanItem.mockResolvedValue(undefined);
  teamsCoachedBy.mockResolvedValue([{ id: OTHER, name: 'JV' }]);
  fetchDrillsBank.mockResolvedValue([]);
});

describe('saving under a name', () => {
  it('opens on the active plan\'s name', async () => {
    const w = await mountSave({ active: 'Tuesday Session' });
    expect((w.find('[data-plan-name]').element as HTMLInputElement).value)
      .toBe('Tuesday Session');
  });

  it('warns that saving over an existing plan replaces it', async () => {
    // A plan is the rows sharing a name, so this really is a replacement.
    const w = await mountSave();
    await w.find('[data-plan-name]').setValue('Tuesday Session');
    expect(w.find('[data-plan-replace]').exists()).toBe(true);
  });

  it('does not warn for a name nothing uses', async () => {
    const w = await mountSave();
    await w.find('[data-plan-name]').setValue('Friday Session');
    expect(w.find('[data-plan-replace]').exists()).toBe(false);
  });

  it('saves, and reports success on what the client returns', async () => {
    // saveFullPracticePlan reports { success }, not { ok }.
    const w = await mountSave();
    await w.find('[data-plan-name]').setValue('Friday Session');
    await w.find('[data-plan-save]').trigger('click');
    await flush();

    expect(saveFullPracticePlan).toHaveBeenCalled();
    expect(w.find('[data-plan-notice]').exists()).toBe(true);
  });

  it('reports the client\'s refusal rather than a generic message', async () => {
    saveFullPracticePlan.mockResolvedValue({
      success: false, error: 'No team selected; refusing to save an unscoped practice plan.'
    });
    const w = await mountSave();
    await w.find('[data-plan-name]').setValue('Friday Session');
    await w.find('[data-plan-save]').trigger('click');
    await flush();

    expect(w.find('[data-plan-error]').text()).toMatch(/unscoped/);
  });
});

describe('copy to team', () => {
  it('is not offered until a real saved plan is active', async () => {
    // The whole reason copyablePlan exists.
    const w = await mountSave({ active: '' });
    expect(w.find('[data-plan-copy]').exists()).toBe(false);
    expect(w.find('[data-plan-none-active]').text()).toMatch(/matches on the plan/i);
  });

  it('is not offered for an active name that matches no saved plan', async () => {
    // Exactly the legacy failure: the heading said "Standard Practice
    // Session", which no write path stores.
    const w = await mountSave({ active: 'Standard Practice Session' });
    expect(w.find('[data-plan-copy]').exists()).toBe(false);
  });

  it('appears once a saved plan is loaded', async () => {
    const w = await mountSave({ active: 'Tuesday Session' });
    expect(w.find('[data-plan-active]').text()).toContain('Tuesday Session');
    expect(w.find('[data-plan-copy]').exists()).toBe(true);
  });

  it('lists only teams the coach may write to', async () => {
    // is_team_coach() refuses any other write, so offering one would be a
    // control that always fails.
    const w = await mountSave({ active: 'Tuesday Session' });
    expect(teamsCoachedBy).toHaveBeenCalled();
    expect(w.find('[data-plan-copy-target]').findAll('option')).toHaveLength(2);
  });

  it('will not copy without a destination', async () => {
    const w = await mountSave({ active: 'Tuesday Session' });
    await w.find('[data-plan-copy]').trigger('click');

    expect(copyPracticePlan).not.toHaveBeenCalled();
    expect(w.find('[data-plan-error]').text()).toMatch(/pick a team/i);
  });

  it('sends the plan name and both teams', async () => {
    const w = await mountSave({ active: 'Tuesday Session' });
    await w.find('[data-plan-copy-target]').setValue(OTHER);
    await w.find('[data-plan-copy]').trigger('click');
    await flush();

    expect(copyPracticePlan).toHaveBeenCalledWith('Tuesday Session', TEAM, OTHER);
  });

  it('passes a refusal on in the client\'s own words', async () => {
    copyPracticePlan.mockResolvedValue({
      ok: false, error: 'Those teams belong to different organizations.'
    });
    const w = await mountSave({ active: 'Tuesday Session' });
    await w.find('[data-plan-copy-target]').setValue(OTHER);
    await w.find('[data-plan-copy]').trigger('click');
    await flush();

    expect(w.find('[data-plan-error]').text()).toMatch(/different organizations/);
  });
});

describe('renaming', () => {
  it('sends the old and the new name', async () => {
    const w = await mountSave({ active: 'Tuesday Session' });
    await w.find('[data-plan-rename-to]').setValue('Wednesday Session');
    await w.find('[data-plan-rename]').trigger('click');
    await flush();

    expect(renamePracticePlan).toHaveBeenCalledWith(TEAM, 'Tuesday Session', 'Wednesday Session');
  });

  it('will not rename to nothing', async () => {
    const w = await mountSave({ active: 'Tuesday Session' });
    await w.find('[data-plan-rename]').trigger('click');

    expect(renamePracticePlan).not.toHaveBeenCalled();
    expect(w.find('[data-plan-error]').exists()).toBe(true);
  });

  it('reports a name clash rather than pretending it worked', async () => {
    // Two plans sharing a name become one session.
    renamePracticePlan.mockResolvedValue({
      ok: false, error: 'This team already has a plan called "Wednesday Session".'
    });
    const w = await mountSave({ active: 'Tuesday Session' });
    await w.find('[data-plan-rename-to]').setValue('Wednesday Session');
    await w.find('[data-plan-rename]').trigger('click');
    await flush();

    expect(w.find('[data-plan-error]').text()).toMatch(/already has a plan/);
  });
});

describe('deleting', () => {
  it('asks first, and says how many drills go with it', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountSave({ active: 'Tuesday Session' });
    await w.find('[data-plan-delete]').trigger('click');

    expect(confirmSpy.mock.calls[0][0]).toContain('Tuesday Session');
    expect(confirmSpy.mock.calls[0][0]).toContain('1 drills');
    expect(deletePracticePlanItem).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('deletes every row of the plan once confirmed', async () => {
    // A plan is its rows; there is nothing else to delete.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountSave({ active: 'Tuesday Session' });
    await w.find('[data-plan-delete]').trigger('click');
    await flush();

    expect(deletePracticePlanItem).toHaveBeenCalledWith(ROW_A);
    confirmSpy.mockRestore();
  });
});
