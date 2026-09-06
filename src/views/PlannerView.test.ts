/**
 * The practice timeline.
 *
 * Two assertions here are about things the legacy planner does not do.
 *
 * Reordering has a keyboard path. Drag is the only way to move a drill in the
 * legacy app, which means a coach on a phone at training -- the actual
 * setting -- is dragging a list item with a finger, and anyone using a
 * keyboard cannot reorder at all.
 *
 * And the times stay contiguous through every edit, because the printed plan
 * is read against a watch.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import PlannerView from './PlannerView.vue';

const svc = {
  fetchPracticePlans: vi.fn(),
  saveFullPracticePlan: vi.fn(),
  savePracticePlanItem: vi.fn(),
  deletePracticePlanItem: vi.fn(),
  renamePracticePlan: vi.fn(),
  copyPracticePlan: vi.fn(),
  fetchDrillsBank: vi.fn(),
  teamsCoachedBy: vi.fn()
};
vi.mock('../data/supabase', () => ({
  supabaseService: new Proxy({}, { get: (_t, k) => (...a: any[]) => (svc as any)[k](...a) })
}));

const TEAM = '11111111-2222-3333-4444-555555555555';
const ROW_A = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ROW_B = 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee';

const planRow = (over: any = {}) => ({
  id: ROW_A, team_id: TEAM, name: 'Tuesday Session', drill: 'Rondo',
  time_slot: '4:00 PM - 4:20 PM', duration: '20 min', coach_notes: 'Two touch',
  created_at: '2026-09-01T00:00:00Z', ...over
});

const ROWS = [
  planRow(),
  planRow({ id: ROW_B, drill: 'Shooting', time_slot: '4:20 PM - 4:35 PM', duration: '15 min' })
];

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

async function mountPlanner(opts: { rows?: any[]; items?: any[] } = {}) {
  const { rows = ROWS, items = null } = opts;
  svc.fetchPracticePlans.mockResolvedValue(rows);

  const w = mount(PlannerView, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: false,
        initialState: {
          planner: items ? { items } : {},
          organization: {
            schools: [{ id: 's1', name: 'Legends FC', mascot: 'Lions' }],
            teams: [{ id: TEAM, name: 'U16', school_id: 's1' }],
            activeTeamId: TEAM
          },
          auth: { isCoach: true, isAdmin: false, isGuest: false, canAccessRatings: true }
        }
      })],
      stubs: { RouterLink: true }
    }
  });
  await flush();
  return w;
}

const drillNames = (w: any) => w.findAll('[data-drill-name]').map((n: any) => n.text());

// Defaults live here, not in the mount helper: vi.clearAllMocks() clears
// calls but leaves an implementation in place, so a mockResolvedValue a test
// sets before mounting would be overwritten by the helper's own default.
beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  svc.fetchPracticePlans.mockResolvedValue(ROWS);
  svc.saveFullPracticePlan.mockResolvedValue({ success: true });
  svc.savePracticePlanItem.mockResolvedValue({ id: ROW_A });
  svc.deletePracticePlanItem.mockResolvedValue(undefined);
  svc.fetchDrillsBank.mockResolvedValue([]);
  svc.teamsCoachedBy.mockResolvedValue([]);
});

describe('the timeline', () => {
  it('starts empty and says how to fill it', async () => {
    const w = await mountPlanner({ rows: [] });
    const empty = w.find('[data-plan-empty]');
    expect(empty.exists()).toBe(true);
    // Naming the controls, rather than "nothing here".
    expect(empty.text()).toMatch(/add a drill/i);
  });

  it('lists a loaded plan\'s drills in order', async () => {
    const w = await mountPlanner();
    await w.find('[data-load-plan]').trigger('click');
    await w.findAll('[data-plan-choice]')[0].trigger('click');

    expect(drillNames(w)).toEqual(['Rondo', 'Shooting']);
  });

  it('shows each drill\'s slot, duration and notes', async () => {
    const w = await mountPlanner();
    await w.find('[data-load-plan]').trigger('click');
    await w.findAll('[data-plan-choice]')[0].trigger('click');

    const first = w.findAll('[data-drill-row]')[0];
    expect(first.text()).toContain('4:00 PM - 4:20 PM');
    expect(first.text()).toContain('20 min');
    expect(first.text()).toContain('Two touch');
  });

  it('totals the session, so a coach knows if it fits', async () => {
    const w = await mountPlanner();
    await w.find('[data-load-plan]').trigger('click');
    await w.findAll('[data-plan-choice]')[0].trigger('click');

    expect(w.find('[data-total-time]').text()).toContain('35 min');
    expect(w.find('[data-drill-count]').text()).toContain('2');
  });
});

describe('selecting a drill', () => {
  it('marks the one that is selected', async () => {
    const w = await mountPlanner();
    await w.find('[data-load-plan]').trigger('click');
    await w.findAll('[data-plan-choice]')[0].trigger('click');

    await w.findAll('[data-drill-row]')[1].trigger('click');
    expect(w.findAll('[data-drill-row]')[1].classes()).toContain('is-selected');
  });

  it('follows the drill through a reorder', async () => {
    // The coach moved the drill they were looking at; it is still the one
    // they are looking at.
    const w = await mountPlanner();
    await w.find('[data-load-plan]').trigger('click');
    await w.findAll('[data-plan-choice]')[0].trigger('click');

    await w.findAll('[data-drill-row]')[0].trigger('click');
    await w.findAll('[data-move-down]')[0].trigger('click');
    await flush();

    expect(w.findAll('[data-drill-row]')[1].classes()).toContain('is-selected');
  });
});

describe('reordering from the keyboard', () => {
  it('moves a drill down', async () => {
    const w = await mountPlanner();
    await w.find('[data-load-plan]').trigger('click');
    await w.findAll('[data-plan-choice]')[0].trigger('click');

    await w.findAll('[data-move-down]')[0].trigger('click');
    await flush();
    expect(drillNames(w)).toEqual(['Shooting', 'Rondo']);
  });

  it('moves a drill up', async () => {
    const w = await mountPlanner();
    await w.find('[data-load-plan]').trigger('click');
    await w.findAll('[data-plan-choice]')[0].trigger('click');

    await w.findAll('[data-move-up]')[1].trigger('click');
    await flush();
    expect(drillNames(w)).toEqual(['Shooting', 'Rondo']);
  });

  it('disables the ends rather than leaving a button that does nothing', async () => {
    const w = await mountPlanner();
    await w.find('[data-load-plan]').trigger('click');
    await w.findAll('[data-plan-choice]')[0].trigger('click');

    const ups = w.findAll('[data-move-up]');
    const downs = w.findAll('[data-move-down]');
    expect((ups[0].element as HTMLButtonElement).disabled).toBe(true);
    expect((downs[downs.length - 1].element as HTMLButtonElement).disabled).toBe(true);
  });

  it('reflows the times after a move', async () => {
    // The 15-minute drill is now first, so the 20-minute one starts at 4:15.
    const w = await mountPlanner();
    await w.find('[data-load-plan]').trigger('click');
    await w.findAll('[data-plan-choice]')[0].trigger('click');

    await w.findAll('[data-move-down]')[0].trigger('click');
    await flush();

    const rows = w.findAll('[data-drill-row]');
    expect(rows[0].text()).toContain('4:00 PM - 4:15 PM');
    expect(rows[1].text()).toContain('4:15 PM - 4:35 PM');
  });

  it('writes the new order, because the order is the plan', async () => {
    const w = await mountPlanner();
    await w.find('[data-load-plan]').trigger('click');
    await w.findAll('[data-plan-choice]')[0].trigger('click');

    svc.saveFullPracticePlan.mockClear();
    await w.findAll('[data-move-down]')[0].trigger('click');
    await flush();

    expect(svc.saveFullPracticePlan).toHaveBeenCalled();
  });
});

describe('removing a drill', () => {
  it('asks first', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountPlanner();
    await w.find('[data-load-plan]').trigger('click');
    await w.findAll('[data-plan-choice]')[0].trigger('click');

    await w.findAll('[data-drill-remove]')[0].trigger('click');
    expect(confirmSpy).toHaveBeenCalled();
    expect(drillNames(w)).toEqual(['Rondo', 'Shooting']);
    confirmSpy.mockRestore();
  });

  it('soft-deletes the row, so it does not come back on reload', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountPlanner();
    await w.find('[data-load-plan]').trigger('click');
    await w.findAll('[data-plan-choice]')[0].trigger('click');

    await w.findAll('[data-drill-remove]')[0].trigger('click');
    await flush();

    expect(svc.deletePracticePlanItem).toHaveBeenCalledWith(ROW_A);
    expect(drillNames(w)).toEqual(['Shooting']);
    confirmSpy.mockRestore();
  });
});

describe('who can see it', () => {
  it('names the organization rather than a hardcoded school', async () => {
    const w = await mountPlanner();
    expect(w.text()).toContain('Legends FC');
    expect(w.text()).not.toMatch(/beaumont|cougars/i);
  });

  it('wires its controls as handlers, not as app.* strings', async () => {
    // The legacy planner is onclick="app.openAddPlanDrillModal()" throughout,
    // and nothing checks that boundary when a method is renamed.
    const w = await mountPlanner();
    expect(w.html()).not.toContain('app.');
  });
});

describe('the drill controls', () => {
  it('offers a coach a way to add one', async () => {
    const w = await mountPlanner();
    expect(w.find('[data-add-drill]').exists()).toBe(true);
    expect(w.find('[data-open-library]').exists()).toBe(true);
  });

  it('opens the form on the drill being edited', async () => {
    const w = await mountPlanner();
    await w.find('[data-load-plan]').trigger('click');
    await w.findAll('[data-plan-choice]')[0].trigger('click');

    await w.findAll('[data-drill-edit]')[1].trigger('click');
    expect((w.find('[data-drill-name-input]').element as HTMLInputElement).value)
      .toBe('Shooting');
  });

  it('adds a drill through the form, one row at a time', async () => {
    svc.savePracticePlanItem.mockResolvedValue({ id: ROW_A });
    const w = await mountPlanner();

    await w.find('[data-add-drill]').trigger('click');
    await w.find('[data-drill-name-input]').setValue('Pressing shape');
    await w.find('[data-drill-save]').trigger('click');
    await flush();

    expect(drillNames(w)).toEqual(['Pressing shape']);
    expect(svc.savePracticePlanItem).toHaveBeenCalled();
  });

  it('says so when a drill was added but not saved', async () => {
    // savePracticePlanItem returns null when it refuses. The drill is on the
    // timeline and not in Postgres, and it vanishes on the next reload.
    svc.savePracticePlanItem.mockResolvedValue(null);
    const w = await mountPlanner();

    await w.find('[data-add-drill]').trigger('click');
    await w.find('[data-drill-name-input]').setValue('Pressing shape');
    await w.find('[data-drill-save]').trigger('click');
    await flush();

    expect(w.find('[data-notice]').text()).toMatch(/disappear on reload/i);
  });
});
