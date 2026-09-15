/**
 * What each exercise is worth, what kind of thing it measures, and the
 * standards a squad is held to on a banded one.
 *
 * Two assertions here are about restraint rather than function. Standards are
 * replaced rather than merged, because editing 4:30 to 4:25 must change the
 * standard and not leave both in place -- the looser one would then be the one
 * that pays out. And nothing on this screen suggests tightening a band to
 * spread scores: a bunched threshold result is the good outcome, and that is
 * the coach's stated position, not an oversight to be helpfully corrected.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import WeightsModal from './WeightsModal.vue';

const updateDrillWeights = vi.fn();
const saveTimeBands = vi.fn();
const fetchTimeBands = vi.fn();
const fetchDrillsForWeighting = vi.fn();
const fetchGoalBands = vi.fn();
const saveGoalBands = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    updateDrillWeights: (...a: any[]) => updateDrillWeights(...a),
    saveTimeBands: (...a: any[]) => saveTimeBands(...a),
    fetchTimeBands: (...a: any[]) => fetchTimeBands(...a),
    fetchDrillsForWeighting: (...a: any[]) => fetchDrillsForWeighting(...a),
    fetchGoalBands: (...a: any[]) => fetchGoalBands(...a),
    saveGoalBands: (...a: any[]) => saveGoalBands(...a)
  }
}));

const LAPS = 'd-laps';
const SMALL = 'd-small';

const DRILLS = [
  { id: LAPS, name: '3 Laps', category: 'Fitness', measure: 'time_bands', points: 3 },
  { id: SMALL, name: 'Small Sided', category: 'Possession', measure: 'win_loss', points: 2 }
];

const BANDS = [
  { id: 'b1', drill_id: LAPS, team_id: 't1', max_seconds: 270, factor: 1 },
  { id: 'b2', drill_id: LAPS, team_id: 't1', max_seconds: 280, factor: 0.5 }
];

const flush = () => new Promise(r => setTimeout(r, 0));

async function mountWeights(drills = DRILLS) {
  updateDrillWeights.mockResolvedValue({ ok: true, updated: drills.length });
  fetchDrillsForWeighting.mockResolvedValue(drills);

  const w = mount(WeightsModal, {
    props: { open: true, teamId: 't1', schoolId: 's1' },
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: false,
        initialState: { session: { drills } }
      })]
    },
    attachTo: document.body
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

const bandRows = (w: any) => w.findAll(`[data-bands="${LAPS}"] [data-band-row]`);

// Defaults live here, not in the mount helper: vi.clearAllMocks() clears
// calls but leaves an implementation in place, so a mockResolvedValue set by
// one test would otherwise still be answering in the next one.
beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  updateDrillWeights.mockResolvedValue({ ok: true, updated: 2 });
  saveTimeBands.mockResolvedValue({ ok: true, saved: 2 });
  fetchTimeBands.mockResolvedValue(BANDS);
  fetchDrillsForWeighting.mockResolvedValue(DRILLS);
  fetchGoalBands.mockResolvedValue(GOAL_BANDS);
  saveGoalBands.mockResolvedValue({ ok: true });
});

describe('the exercise list', () => {
  it('lists every exercise in the organization library', async () => {
    const w = await mountWeights();
    expect(w.findAll('[data-weight-row]')).toHaveLength(2);
    expect(w.text()).toContain('3 Laps');
  });

  it('reads the library for the ORGANIZATION, never bare', async () => {
    // A bare fetchDrillsForWeighting returns null rather than falling back to
    // Beaumont's, so the modal would open empty for a club coach.
    await mountWeights();
    expect(fetchDrillsForWeighting).toHaveBeenCalledWith('s1');
  });

  it('says what to do when the library is empty', async () => {
    const w = await mountWeights([]);
    expect(w.find('[data-weights-empty]').text()).toMatch(/planner/i);
  });

  it('offers all six measures', async () => {
    const w = await mountWeights();
    const opts = w.find('[data-measure]').findAll('option').map((o: any) => o.attributes('value'));
    expect(opts).toEqual(['head_to_head', 'win_loss', 'count_high', 'time_low', 'time_bands', 'role_goals']);
  });
});

describe('the standards editor', () => {
  it('is shown for a banded exercise and not for the others', async () => {
    const w = await mountWeights();
    expect(w.find(`[data-bands="${LAPS}"]`).exists()).toBe(true);
    expect(w.find(`[data-bands="${SMALL}"]`).exists()).toBe(false);
  });

  it('appears when a measure is changed to a standard', async () => {
    const w = await mountWeights();
    await w.find(`[data-weight-row="${SMALL}"] [data-measure]`).setValue('time_bands');
    expect(w.find(`[data-bands="${SMALL}"]`).exists()).toBe(true);
  });

  it('shows a stored threshold as a time, not as seconds', async () => {
    const w = await mountWeights();
    expect((bandRows(w)[0].find('[data-band-time]').element as HTMLInputElement).value)
      .toBe('4:30');
  });

  it('keeps a typed row when the measure is switched away and back', async () => {
    // Held in state rather than toggled with CSS, so a coach who changes their
    // mind twice does not lose what they typed.
    const w = await mountWeights();
    await bandRows(w)[0].find('[data-band-time]').setValue('4:25');
    await w.find(`[data-weight-row="${LAPS}"] [data-measure]`).setValue('win_loss');
    await w.find(`[data-weight-row="${LAPS}"] [data-measure]`).setValue('time_bands');

    expect((bandRows(w)[0].find('[data-band-time]').element as HTMLInputElement).value)
      .toBe('4:25');
  });

  it('always leaves at least one row of boxes', async () => {
    // Removing the last one would leave a section with no way back into it.
    const w = await mountWeights();
    await bandRows(w)[1].find('[data-band-remove]').trigger('click');
    await bandRows(w)[0].find('[data-band-remove]').trigger('click');
    expect(bandRows(w)).toHaveLength(1);
  });

  it('adds a row on request', async () => {
    const w = await mountWeights();
    await w.find(`[data-band-add="${LAPS}"]`).trigger('click');
    expect(bandRows(w)).toHaveLength(3);
  });

  it('does not suggest tightening a standard', async () => {
    // The point of a threshold is match-readiness, not separation. Seventeen
    // of nineteen on 1.0 is the good outcome, and a hint offering to spread
    // them out would be arguing with the coach.
    const w = await mountWeights();
    expect(w.text()).not.toMatch(/spread|bunch|separat|too easy|tighten/i);
  });
});

describe('saving', () => {
  it('sends every exercise with its weight and measure', async () => {
    const w = await mountWeights();
    await w.find('[data-weights-save]').trigger('click');
    await flush();

    expect(updateDrillWeights).toHaveBeenCalledWith([
      { id: LAPS, points: 3, measure: 'time_bands' },
      { id: SMALL, points: 2, measure: 'win_loss' }
    ]);
  });

  it('saves standards for the ACTIVE SQUAD', async () => {
    // A JV standard is not a Varsity standard: drill_time_bands is keyed on
    // (drill_id, team_id, max_seconds).
    const w = await mountWeights();
    await w.find('[data-weights-save]').trigger('click');
    await flush();

    expect(saveTimeBands).toHaveBeenCalledWith(LAPS, 't1', expect.any(Array));
  });

  it('sends standards only for exercises measured against one', async () => {
    const w = await mountWeights();
    await w.find('[data-weights-save]').trigger('click');
    await flush();

    expect(saveTimeBands).toHaveBeenCalledTimes(1);
  });

  it('sends the rows as typed, so the save replaces rather than merges', async () => {
    // Editing 4:30 to 4:25 must change the standard. Leaving both would make
    // the easier one the one that pays out.
    const w = await mountWeights();
    await bandRows(w)[0].find('[data-band-time]').setValue('4:25');
    await w.find('[data-weights-save]').trigger('click');
    await flush();

    expect(saveTimeBands.mock.calls[0][2][0]).toEqual({ time: '4:25', factor: '1' });
  });

  it('skips an untouched blank row rather than refusing the save', async () => {
    // A spare empty row is how the editor always looks.
    const w = await mountWeights();
    await w.find(`[data-band-add="${LAPS}"]`).trigger('click');
    await w.find('[data-weights-save]').trigger('click');
    await flush();

    expect(saveTimeBands.mock.calls[0][2]).toHaveLength(2);
  });

  it('names the exercise when its standards are refused', async () => {
    // Weights saved, standards did not: reported by name rather than lost
    // behind a success message about the weights.
    const w = await mountWeights();
    saveTimeBands.mockResolvedValue({ ok: false, error: '"4:x" is not a time.' });
    await w.find('[data-weights-save]').trigger('click');
    await flush();

    const msg = w.find('[data-weights-error]').text();
    expect(msg).toContain('3 Laps');
    expect(msg).toMatch(/not a time/);
  });

  it('reports a refused weight in the words the client gave', async () => {
    const w = await mountWeights();
    updateDrillWeights.mockResolvedValue({ ok: false, error: 'Weight for drill d-laps must be between 0 and 10.', updated: 0 });
    await w.find('[data-weights-save]').trigger('click');
    await flush();

    expect(w.find('[data-weights-error]').text()).toMatch(/between 0 and 10/);
  });

  it('does not write standards when the weights were refused', async () => {
    // A band is meaningless until the measure is stored.
    const w = await mountWeights();
    updateDrillWeights.mockResolvedValue({ ok: false, error: 'no', updated: 0 });
    await w.find('[data-weights-save]').trigger('click');
    await flush();

    expect(saveTimeBands).not.toHaveBeenCalled();
  });

  it('says standards need a squad rather than writing them to nobody', async () => {
    const w = mount(WeightsModal, {
      props: { open: true, teamId: null, schoolId: 's1' },
      global: {
        plugins: [createTestingPinia({
          createSpy: vi.fn, stubActions: false,
          initialState: { session: { drills: DRILLS } }
        })]
      }
    });
    await flush();
    await w.find('[data-weights-save]').trigger('click');
    await flush();

    expect(saveTimeBands).not.toHaveBeenCalled();
    expect(w.find('[data-weights-error]').text()).toMatch(/team|squad/i);
  });

  it('tells the parent to re-read, because every past result re-scores', async () => {
    // Weights are looked up live by matrix_standings, so changing one
    // re-scores history. The board on screen would otherwise contradict it.
    const w = await mountWeights();
    await w.find('[data-weights-save]').trigger('click');
    await flush();

    expect(w.emitted('saved')).toBeTruthy();
  });

  it('says how many exercises were saved, and that the standings moved', async () => {
    const w = await mountWeights();
    await w.find('[data-weights-save]').trigger('click');
    await flush();

    expect(w.find('[data-weights-notice]').text()).toMatch(/re-scored/i);
  });
});

const GOALS = 'd-goals';
const GOAL_DRILLS = [...DRILLS, { id: GOALS, name: '1v1 Attack', category: 'Finishing', measure: 'role_goals', points: 3 }];
const GOAL_BANDS = [
  { role: 'attack', kind: 'base', threshold: 1, factor: 0.5 },
  { role: 'attack', kind: 'bonus', threshold: 3, factor: 0.1 },
  { role: 'defend', kind: 'base', threshold: 0, factor: 1 }
];

describe('Goals by role', () => {
  it('shows the per-role editor for a Goals-by-role exercise only', async () => {
    const w = await mountWeights(GOAL_DRILLS);
    expect(w.find(`[data-goal-bands="${GOALS}"]`).exists()).toBe(true);
    expect(w.find(`[data-goal-bands="${LAPS}"]`).exists()).toBe(false);
    expect(fetchGoalBands).toHaveBeenCalledWith(GOALS, 't1');
    expect(w.find(`[data-goal-bands="${GOALS}"] [data-goal-example]`).text()).toBe('+1 with 3 scored → 50% + 10% = 60%');
  });

  it("saves every role's bands for the ACTIVE SQUAD, as factors", async () => {
    const w = await mountWeights(GOAL_DRILLS);
    await w.find('[data-weights-save]').trigger('click');
    await flush();

    expect(saveGoalBands).toHaveBeenCalledTimes(3);
    expect(saveGoalBands).toHaveBeenCalledWith(GOALS, 't1', 'attack', [
      { kind: 'base', threshold: 1, factor: 0.5 },
      { kind: 'bonus', threshold: 3, factor: 0.1 }
    ]);
    expect(saveGoalBands).toHaveBeenCalledWith(GOALS, 't1', 'defend', [{ kind: 'base', threshold: 0, factor: 1 }]);
    expect(saveGoalBands).toHaveBeenCalledWith(GOALS, 't1', 'keeper', []);
  });

  it('names the exercise and the role when the database refuses', async () => {
    const w = await mountWeights(GOAL_DRILLS);
    saveGoalBands.mockResolvedValueOnce({ ok: false, error: 'Only a coach of this team can set its standards.' });
    await w.find('[data-weights-save]').trigger('click');
    await flush();

    expect(w.find('[data-weights-error]').text())
      .toBe('Weights saved. Attack standards for 1v1 Attack: Only a coach of this team can set its standards.');
  });

  it('refuses a pair over 100% without sending it', async () => {
    const w = await mountWeights(GOAL_DRILLS);
    await w.find(`[data-goal-bands="${GOALS}"] [data-goal-kind="bonus"] [data-goal-percent]`).setValue('60');
    await w.find('[data-weights-save]').trigger('click');
    await flush();

    expect(saveGoalBands).not.toHaveBeenCalled();
    expect(w.find('[data-weights-error]').text()).toMatch(/Attack standards for 1v1 Attack: .*more than 100%/);
  });

  it('does not write goal standards when the weights were refused', async () => {
    const w = await mountWeights(GOAL_DRILLS);
    updateDrillWeights.mockResolvedValue({ ok: false, error: 'no', updated: 0 });
    await w.find('[data-weights-save]').trigger('click');
    await flush();
    expect(saveGoalBands).not.toHaveBeenCalled();
  });
});
