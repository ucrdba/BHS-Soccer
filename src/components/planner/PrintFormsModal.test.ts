/**
 * Choosing which blank forms to print, and for which days.
 *
 * The planner opens it with the day's plan already ticked; Player Ratings
 * opens it with nothing ticked and the whole library to choose from. Either
 * way a week is one press: a date and a number of days.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import PrintFormsModal from './PrintFormsModal.vue';

const fetchTeamRoster = vi.fn();
const fetchTimeBands = vi.fn();
const fetchDrillsForWeighting = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    fetchTeamRoster: (...a: any[]) => fetchTeamRoster(...a),
    fetchTimeBands: (...a: any[]) => fetchTimeBands(...a),
    fetchDrillsForWeighting: (...a: any[]) => fetchDrillsForWeighting(...a)
  }
}));

const TEAM = '11111111-2222-3333-4444-555555555555';

const DRILLS = [
  { id: 'laps', name: '3-430', measure: 'time_bands', points: 1 },
  { id: 'flying', name: 'Flying Fours', measure: 'win_loss', points: 2 },
  { id: 'coopers', name: 'Coopers', measure: 'count_high', points: 1.5 }
];

const ROSTER = [
  { id: 'm1', recording_number: 1, position: 4, players: { id: 'p1', name: 'Tom Budde' } },
  { id: 'm2', recording_number: 2, position: 9, players: { id: 'p2', name: 'Cesar Alva' } }
];

let printed: string;

beforeEach(() => {
  printed = '';
  vi.clearAllMocks();
  fetchTeamRoster.mockResolvedValue(ROSTER);
  fetchTimeBands.mockResolvedValue([{ max_seconds: 270, factor: 1 }]);
  fetchDrillsForWeighting.mockResolvedValue(DRILLS);
  vi.spyOn(window, 'open').mockImplementation(() => ({
    document: { write: (html: string) => { printed = html; }, close: () => {} },
    focus: () => {}, print: () => {}
  }) as any);
});

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

async function mountModal(props: any = {}) {
  const w = mount(PrintFormsModal, {
    props: { open: true, teamId: TEAM, schoolId: 'school-1', ...props },
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn, stubActions: false,
        initialState: { organization: {} }
      })]
    },
    attachTo: document.body
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

const ticked = (w: any) => w.findAll('[data-form-drill]')
  .filter((c: any) => (c.element as HTMLInputElement).checked)
  .map((c: any) => c.attributes('data-form-drill'));

describe('choosing the exercises', () => {
  it('lists the library with nothing ticked by default', async () => {
    const w = await mountModal();
    expect(w.findAll('[data-form-drill]').map((c: any) => c.attributes('data-form-drill')))
      .toEqual(['laps', 'flying', 'coopers']);
    expect(ticked(w)).toEqual([]);
  });

  it('ticks the plan’s drills when the planner opens it, matching by name', async () => {
    // A plan row stores the drill's NAME, not its id.
    const w = await mountModal({ preselectNames: ['Flying Fours', '3-430'] });
    expect(ticked(w).sort()).toEqual(['flying', 'laps']);
  });

  it('says so when a plan names something the library does not have', async () => {
    const w = await mountModal({ preselectNames: ['Rondo 4v2'] });
    expect(w.find('[data-form-unmatched]').text()).toContain('Rondo 4v2');
  });

  it('refuses to print with nothing ticked', async () => {
    const w = await mountModal();
    await w.find('[data-forms-print]').trigger('click');
    expect(w.find('[data-forms-error]').text()).toMatch(/choose at least one/i);
    expect(printed).toBe('');
  });
});

describe('printing', () => {
  it('prints the ticked exercises for the chosen day', async () => {
    const w = await mountModal();
    await w.find('[data-form-drill="flying"]').setValue(true);
    await w.find('[data-forms-date]').setValue('2026-09-17');
    await w.find('[data-forms-print]').trigger('click');
    await flush();

    expect(printed).toContain('Flying Fours');
    expect(printed).toContain('Thursday, September 17, 2026');
    expect(printed).toContain('Tom Budde');
    expect(printed).not.toContain('Coopers');
  });

  it('prints a run of days from one press', async () => {
    const w = await mountModal();
    await w.find('[data-form-drill="coopers"]').setValue(true);
    await w.find('[data-forms-date]').setValue('2026-09-17');
    await w.find('[data-forms-days]').setValue('3');
    await w.find('[data-forms-print]').trigger('click');
    await flush();

    expect(printed).toContain('Thursday, September 17, 2026');
    expect(printed).toContain('Friday, September 18, 2026');
    expect(printed).toContain('Saturday, September 19, 2026');
    expect(printed.match(/Coopers/g)).toHaveLength(3);
  });

  it('carries the squad’s standard onto a banded sheet', async () => {
    const w = await mountModal();
    await w.find('[data-form-drill="laps"]').setValue(true);
    await w.find('[data-forms-print]').trigger('click');
    await flush();

    expect(fetchTimeBands).toHaveBeenCalledWith('laps', TEAM);
    expect(printed).toContain('standard 4:30');
  });

  it('says so when the print window is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const w = await mountModal();
    await w.find('[data-form-drill="coopers"]').setValue(true);
    await w.find('[data-forms-print]').trigger('click');
    await flush();
    expect(w.find('[data-forms-error]').text()).toMatch(/pop-?up/i);
  });

  it('says so when the squad could not be read', async () => {
    fetchTeamRoster.mockResolvedValue(null);
    const w = await mountModal();
    expect(w.find('[data-forms-error]').text()).toMatch(/could not load the squad/i);
  });
});
