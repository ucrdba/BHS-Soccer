/**
 * The session grid — the screen this phase exists for.
 *
 * What it has to beat is paper. A coach with a clipboard and a stopwatch
 * enters twenty-five times in a row, one hand on the number pad and the other
 * holding the sheet; reaching for the mouse between every player is the slow
 * part. The keyboard block below is therefore not a convenience test, it is
 * the requirement: Enter moves on, the order it moves in is the order on
 * screen, and past the last player it stops at Save rather than looping back
 * to overwrite the first entry.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import SessionEntryScreen from './SessionEntryScreen.vue';

const saveMatrixSession = vi.fn();
const fetchTimeBands = vi.fn();
const fetchMatrixSessionResults = vi.fn();
const fetchTeamSessionHistory = vi.fn();
const fetchMatrixSessions = vi.fn();
const fetchDrillsForWeighting = vi.fn();
const deleteMatrixSession = vi.fn();
const findPlayerOnTeam = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    saveMatrixSession: (...a: any[]) => saveMatrixSession(...a),
    fetchTimeBands: (...a: any[]) => fetchTimeBands(...a),
    fetchMatrixSessionResults: (...a: any[]) => fetchMatrixSessionResults(...a),
    fetchTeamSessionHistory: (...a: any[]) => fetchTeamSessionHistory(...a),
    fetchMatrixSessions: (...a: any[]) => fetchMatrixSessions(...a),
    fetchDrillsForWeighting: (...a: any[]) => fetchDrillsForWeighting(...a),
    deleteMatrixSession: (...a: any[]) => deleteMatrixSession(...a),
    findPlayerOnTeam: (...a: any[]) => findPlayerOnTeam(...a)
  }
}));

const LAPS = 'd-laps';       // time_bands
const COOPERS = 'd-coopers'; // count_high
const SMALL = 'd-small';     // win_loss

const DRILLS = [
  { id: LAPS, name: '3 Laps', measure: 'time_bands', points: 3 },
  { id: COOPERS, name: 'Coopers', measure: 'count_high', points: 2 },
  { id: SMALL, name: 'Small Sided', measure: 'win_loss', points: 2 }
];

/** Deliberately NOT in recording-number order, so a sort visibly reorders. */
const PLAYERS = [
  { id: 'p1', name: 'Cesar Alva', recordingNumber: 3 },
  { id: 'p2', name: 'Tom Budde', recordingNumber: 1 },
  { id: 'p3', name: 'Alain Renteria', recordingNumber: 2 }
];

const BANDS = [
  { max_seconds: 270, factor: 1 },
  { max_seconds: 280, factor: 0.5 }
];

/** Attack only: +1 earns 50%, three scored earns a 10% bonus. No keeper standards. */
const GOAL_BANDS = [
  { role: 'attack', kind: 'base', threshold: 1, factor: 0.5 },
  { role: 'attack', kind: 'bonus', threshold: 3, factor: 0.1 },
  { role: 'defend', kind: 'base', threshold: 0, factor: 1 }
];

const SQUAD = [
  { id: 'g1', name: 'Kay Keeper', recordingNumber: 1, position: 1 },
  { id: 'g2', name: 'Dee Defender', recordingNumber: 2, position: 4 },
  { id: 'g3', name: 'Ash Attacker', recordingNumber: 3, position: 9 },
  { id: 'g4', name: 'Nat Noposition', recordingNumber: 4, position: null }
];

/** COOPERS, measured as Goals by role, weight 2. */
const goalsGrid = (over: any = {}) =>
  mountGrid({ drillId: COOPERS, measure: 'role_goals', players: SQUAD, ...over });

const rowOf = (w: any, id: string) => w.find(`[data-grid-row="${id}"]`);

const flush = () => new Promise(r => setTimeout(r, 0));

/**
 * `measure` overrides the measure of the drill under test (COOPERS by
 * default), the way the fixed DRILLS list already seeds one per id — it lets
 * a test choose a measure without inventing a fourth drill.
 */
async function mountGrid(
  opts: { drillId?: string; measure?: string; editing?: any; players?: any[]; results?: any[]; goalBands?: any[] } = {}
) {
  const { drillId = COOPERS, measure, editing, players = PLAYERS, results = [], goalBands = GOAL_BANDS } = opts;
  vi.clearAllMocks();
  saveMatrixSession.mockResolvedValue({ ok: true, id: 's9' });
  fetchTimeBands.mockResolvedValue(BANDS);
  fetchMatrixSessionResults.mockResolvedValue([]);
  fetchTeamSessionHistory.mockResolvedValue([]);
  const drills = measure
    ? DRILLS.map(d => (d.id === drillId ? { ...d, measure } : d))
    : DRILLS;
  fetchDrillsForWeighting.mockResolvedValue(drills);

  const w = mount(SessionEntryScreen, {
    props: { teamId: 't1', schoolId: 's1', players, drillId },
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: false,
        initialState: {
          session: {
            drills, bands: BANDS, goalBands, results,
            sessions: editing ? [editing] : [],
            editingId: editing ? editing.id : null
          }
        }
      })],
      stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } }
    },
    attachTo: document.body
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

/** The value/outcome inputs, in the order they appear on screen. */
const fields = (w: any) => w.findAll('[data-entry-field]');
const names = (w: any) => w.findAll('[data-grid-name]').map((n: any) => n.text());

beforeEach(() => { document.body.innerHTML = ''; });

describe('the keyboard', () => {
  it('moves to the next entry field on Enter', async () => {
    const w = await mountGrid();
    const f = fields(w);
    (f[0].element as HTMLInputElement).focus();
    await f[0].trigger('keydown', { key: 'Enter' });

    expect(document.activeElement).toBe(f[1].element);
  });

  it('does not submit the form', async () => {
    // Otherwise the modal submits and the session saves half-entered.
    const w = await mountGrid();
    await fields(w)[0].trigger('keydown', { key: 'Enter' });
    expect(saveMatrixSession).not.toHaveBeenCalled();
  });

  it('follows the ORDER ON SCREEN, not the roster order', async () => {
    // This is the assertion that catches a rebuild walking the players array.
    // After sorting by name the two orders differ, and tabbing has to follow
    // what the eye follows.
    const w = await mountGrid();
    await w.find('[data-grid-sort="name"]').trigger('click');

    const shown = names(w);
    expect(shown[0]).toContain('Alain');   // sorted, not recording order

    const f = fields(w);
    (f[0].element as HTMLInputElement).focus();
    await f[0].trigger('keydown', { key: 'Enter' });

    // The second field belongs to the second row as displayed.
    expect(document.activeElement)
      .toBe(w.findAll('[data-grid-row]')[1].find('[data-entry-field]').element);
  });

  it('stops at Save past the last player', async () => {
    // Looping back to the top would overwrite the first entry with the next
    // keystroke, and the coach would not see it happen.
    const w = await mountGrid();
    const f = fields(w);
    const last = f[f.length - 1];
    (last.element as HTMLInputElement).focus();
    await last.trigger('keydown', { key: 'Enter' });

    expect(document.activeElement).toBe(w.find('[data-session-save]').element);
  });
});

describe('attendance follows what is typed', () => {
  it('marks a player present when a value is entered', async () => {
    const w = await mountGrid({ drillId: LAPS });   // starts every row at no-show
    const row = w.findAll('[data-grid-row]')[0];
    expect((row.find('[data-attendance]').element as HTMLSelectElement).value).toBe('unexcused');

    await row.find('[data-entry-field]').setValue('4:10');
    expect((row.find('[data-attendance]').element as HTMLSelectElement).value).toBe('present');
  });

  it('returns the row to the default when the value is cleared', async () => {
    const w = await mountGrid({ drillId: LAPS });
    const row = w.findAll('[data-grid-row]')[0];
    await row.find('[data-entry-field]').setValue('4:10');
    await row.find('[data-entry-field]').setValue('');
    expect((row.find('[data-attendance]').element as HTMLSelectElement).value).toBe('unexcused');
  });

  it('starts a counted exercise with everyone present', async () => {
    const w = await mountGrid({ drillId: COOPERS });
    const row = w.findAll('[data-grid-row]')[0];
    expect((row.find('[data-attendance]').element as HTMLSelectElement).value).toBe('present');
  });

  it('excuses a row when it is cleared, rather than marking a no-show', async () => {
    // An excused row is in neither the earned nor the available column, so
    // undoing a typo costs the player nothing. A no-show would score 0 of the
    // weight -- a penalty for the coach's mistake.
    const w = await mountGrid({ drillId: COOPERS });
    const row = w.findAll('[data-grid-row]')[0];
    await row.find('[data-entry-field]').setValue('2800');
    await row.find('[data-grid-clear]').trigger('click');

    expect((row.find('[data-attendance]').element as HTMLSelectElement).value).toBe('excused');
    expect((row.find('[data-entry-field]').element as HTMLInputElement).value).toBe('');
  });
});

describe('sorting mid-entry', () => {
  it('keeps what has already been typed', async () => {
    // The legacy grid needed an explicit capture for this, because the values
    // lived in the DOM. Here it should be free -- and this test is what stops
    // a later refactor putting the state back in the inputs.
    const w = await mountGrid({ drillId: COOPERS });
    const first = w.findAll('[data-grid-row]')[0];
    const id = first.attributes('data-grid-row');
    await first.find('[data-entry-field]').setValue('2800');

    await w.find('[data-grid-sort="name"]').trigger('click');

    const moved = w.findAll('[data-grid-row]').find((r: any) => r.attributes('data-grid-row') === id);
    expect((moved!.find('[data-entry-field]').element as HTMLInputElement).value).toBe('2800');
  });
});

describe('the jump box', () => {
  it('scrolls and focuses without filtering the list', async () => {
    // A session is entered for the whole squad. Hiding the rest makes it easy
    // to save with players silently left out.
    findPlayerOnTeam.mockResolvedValue({ ok: true, player: { id: 'p3', name: 'Alain Renteria' } });
    const w = await mountGrid();
    await w.find('[data-jump-input]').setValue('2');
    await w.find('[data-jump-go]').trigger('click');
    await flush();

    expect(w.findAll('[data-grid-row]')).toHaveLength(3);
    expect(document.activeElement)
      .toBe(w.find('[data-grid-row="p3"]').find('[data-entry-field]').element);
  });

  it('says when a player is on the team but not in this list', async () => {
    findPlayerOnTeam.mockResolvedValue({ ok: true, player: { id: 'p9', name: 'New Signing' } });
    const w = await mountGrid();
    await w.find('[data-jump-input]').setValue('9');
    await w.find('[data-jump-go]').trigger('click');
    await flush();

    expect(w.find('[data-jump-error]').text()).toContain('New Signing');
  });

  it('passes on the reason a lookup was refused', async () => {
    // An ambiguous surname is refused rather than guessed, and the coach needs
    // to know which two players it could be.
    findPlayerOnTeam.mockResolvedValue({ ok: false, error: 'More than one player is called Alva.' });
    const w = await mountGrid();
    await w.find('[data-jump-input]').setValue('Alva');
    await w.find('[data-jump-go]').trigger('click');
    await flush();

    expect(w.find('[data-jump-error]').text()).toMatch(/more than one/i);
  });
});

describe('a banded exercise', () => {
  it('says what a time earns as it is typed', async () => {
    const w = await mountGrid({ drillId: LAPS });
    await w.findAll('[data-grid-row]')[0].find('[data-entry-field]').setValue('4:35');
    expect(w.findAll('[data-grid-row]')[0].find('[data-band-earned]').text()).toBe('earns 0.5');
  });

  it('says no band rather than nothing for a time that met none', async () => {
    // Read perfectly well; simply slower than every standard. A blank here
    // reads as "this did not register".
    const w = await mountGrid({ drillId: LAPS });
    await w.findAll('[data-grid-row]')[0].find('[data-entry-field]').setValue('5:10');
    expect(w.findAll('[data-grid-row]')[0].find('[data-band-earned]').text()).toBe('no band');
  });

  it('names an unreadable time before the save does', async () => {
    const w = await mountGrid({ drillId: LAPS });
    await w.findAll('[data-grid-row]')[0].find('[data-entry-field]').setValue('4:5');
    expect(w.findAll('[data-grid-row]')[0].find('[data-band-earned]').text()).toBe('mm:ss?');
  });

  it('shows nothing at all beside an empty box', async () => {
    const w = await mountGrid({ drillId: LAPS });
    expect(w.findAll('[data-grid-row]')[0].find('[data-band-earned]').text()).toBe('');
  });

  it('does not offer a band hint on an exercise that has none', async () => {
    const w = await mountGrid({ drillId: COOPERS });
    expect(w.find('[data-band-earned]').exists()).toBe(false);
  });
});

describe('a small-sided exercise', () => {
  it('offers an outcome instead of a value', async () => {
    const w = await mountGrid({ drillId: SMALL });
    const row = w.findAll('[data-grid-row]')[0];
    expect(row.find('select[data-entry-field]').exists()).toBe(true);
  });
});

describe('filling a small-sided sheet in one press', () => {
  const outcomes = (w: any) =>
    fields(w).map((f: any) => (f.element as HTMLSelectElement).value);

  it('offers Won, Tie and Lost on a W/D/L exercise', async () => {
    const w = await mountGrid({ drillId: SMALL, measure: 'win_loss' });
    expect(w.findAll('[data-fill-outcome]').map((b: any) => b.text()))
      .toEqual(['Won', 'Tie', 'Lost']);
  });

  it('offers nothing of the sort on a counted exercise', async () => {
    // There is no sensible squad-wide Cooper's distance, and a button that
    // wrote one would be filling in results nobody ran.
    const w = await mountGrid({ drillId: COOPERS });
    expect(w.findAll('[data-fill-outcome]')).toHaveLength(0);
  });

  it('offers nothing of the sort on a banded exercise', async () => {
    const w = await mountGrid({ drillId: LAPS, measure: 'time_bands' });
    expect(w.findAll('[data-fill-outcome]')).toHaveLength(0);
  });

  it('gives every untouched player the result', async () => {
    const w = await mountGrid({ drillId: SMALL, measure: 'win_loss' });
    await w.findAll('[data-fill-outcome]')[2].trigger('click');   // Lost
    expect(outcomes(w)).toEqual(['loss', 'loss', 'loss']);
  });

  it('KEEPS a result already chosen', async () => {
    const w = await mountGrid({ drillId: SMALL, measure: 'win_loss' });
    await fields(w)[0].setValue('win');
    await w.findAll('[data-fill-outcome]')[2].trigger('click');   // Lost

    const got = outcomes(w);
    expect(got[0]).toBe('win');
    expect(got.slice(1)).toEqual(['loss', 'loss']);
  });

  it('leaves a player who was not there out of it', async () => {
    const w = await mountGrid({ drillId: SMALL, measure: 'win_loss' });
    await w.findAll('[data-attendance]')[0].setValue('excused');
    await w.findAll('[data-fill-outcome]')[0].trigger('click');   // Won
    await flush();

    expect(saveMatrixSession).not.toHaveBeenCalled();
    expect(outcomes(w)[0]).toBe('');
  });

  it('leaves the sheet ready to save', async () => {
    // The whole point: one press instead of twenty-five dropdowns.
    const w = await mountGrid({ drillId: SMALL, measure: 'win_loss' });
    await w.findAll('[data-fill-outcome]')[1].trigger('click');   // Tie
    await w.find('[data-session-save]').trigger('click');
    await flush();

    expect(saveMatrixSession).toHaveBeenCalled();
    expect(saveMatrixSession.mock.calls[0][2].map((r: any) => r.outcome))
      .toEqual(['draw', 'draw', 'draw']);
  });
});

describe('entering a small-sided sheet as lists of numbers', () => {
  // PLAYERS carry recording numbers 3 (Cesar), 1 (Tom) and 2 (Alain), and the
  // grid shows them in that recording order: Tom, Alain, Cesar.
  const outcomes = (w: any) =>
    fields(w).map((f: any) => (f.element as HTMLSelectElement).value);
  const small = () => mountGrid({ drillId: SMALL, measure: 'win_loss' });

  it('offers Won, Tie and Lost boxes that explain themselves, on a W/D/L exercise only', async () => {
    const w = await small();
    const boxes = w.findAll('[data-outcome-list]');
    expect(boxes.map((b: any) => b.attributes('data-outcome-list'))).toEqual(['win', 'draw', 'loss']);
    expect(boxes[0].attributes('placeholder')).toBe('Recording numbers that won, e.g. 17, 21, 11, 19');
    expect(boxes[1].attributes('placeholder')).toBe('Recording numbers that tied, e.g. 1, 6, 7, 9');
    expect(boxes[2].attributes('placeholder')).toBe('Recording numbers that lost, e.g. 21, 22, 23');
    expect(w.find('[data-outcome-lists-hint]').text()).toMatch(/Optional/);

    expect((await mountGrid({ drillId: COOPERS })).find('[data-outcome-list]').exists()).toBe(false);
  });

  it('sets each listed player on Apply, by recording number', async () => {
    const w = await small();
    await w.find('[data-outcome-list="win"]').setValue('3');
    await w.find('[data-outcome-list="loss"]').setValue('1, 2');
    expect(outcomes(w)).toEqual(['', '', '']);          // nothing until Apply

    await w.find('[data-outcome-lists-apply]').trigger('click');
    expect(outcomes(w)).toEqual(['loss', 'loss', 'win']);
  });

  it('applies on Enter in a box, and marks a listed player here', async () => {
    const w = await small();
    await w.findAll('[data-attendance]')[0].setValue('excused');   // Tom, number 1
    const box = w.find('[data-outcome-list="draw"]');
    await box.setValue('1');
    await box.trigger('keydown', { key: 'Enter' });
    expect(outcomes(w)[0]).toBe('draw');
    expect((w.findAll('[data-attendance]')[0].element as HTMLSelectElement).value).toBe('present');
  });

  it('refuses the whole list, saying why, and changes nothing', async () => {
    const w = await small();
    await fields(w)[0].setValue('draw');
    await w.find('[data-outcome-list="win"]').setValue('1, 2');
    await w.find('[data-outcome-list="loss"]').setValue('2');
    await w.find('[data-outcome-lists-apply]').trigger('click');

    expect(w.find('[data-outcome-lists-error]').text()).toBe('2 is in both Won and Lost.');
    expect(outcomes(w)).toEqual(['draw', '', '']);
  });

  it('says how many it set', async () => {
    const w = await small();
    await w.find('[data-outcome-list="win"]').setValue('1 2 3');
    await w.find('[data-outcome-lists-apply]').trigger('click');
    expect(w.find('[data-outcome-lists-notice]').text()).toBe('Set 3 results.');
    expect(w.find('[data-outcome-lists-error]').exists()).toBe(false);
  });

  it('leaves the sheet ready to save', async () => {
    const w = await small();
    await w.find('[data-outcome-list="win"]').setValue('1');
    await w.find('[data-outcome-list="draw"]').setValue('2,3');
    await w.find('[data-outcome-lists-apply]').trigger('click');
    await w.find('[data-session-save]').trigger('click');
    await flush();

    const rows = saveMatrixSession.mock.calls[0][2];
    expect(Object.fromEntries(rows.map((r: any) => [r.playerId, r.outcome])))
      .toEqual({ p2: 'win', p3: 'draw', p1: 'draw' });
  });
});

describe('resetting the Result column', () => {
  const outcomes = (w: any) =>
    fields(w).map((f: any) => (f.element as HTMLSelectElement).value);

  it('sits with the fill buttons on a W/D/L exercise, and nowhere else', async () => {
    const small = await mountGrid({ drillId: SMALL, measure: 'win_loss' });
    expect(small.find('[data-fill-reset]').text()).toBe('Reset');

    const coopers = await mountGrid({ drillId: COOPERS });
    expect(coopers.find('[data-fill-reset]').exists()).toBe(false);
  });

  it('clears every result once the coach confirms', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountGrid({ drillId: SMALL, measure: 'win_loss' });
    await w.findAll('[data-fill-outcome]')[2].trigger('click');   // Lost
    await fields(w)[0].setValue('win');

    await w.find('[data-fill-reset]').trigger('click');

    expect(confirm).toHaveBeenCalled();
    expect(outcomes(w)).toEqual(['', '', '']);
    confirm.mockRestore();
  });

  it('keeps every result when the coach backs out', async () => {
    // One tap beside Lost would otherwise wipe a sheet already entered.
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await mountGrid({ drillId: SMALL, measure: 'win_loss' });
    await w.findAll('[data-fill-outcome]')[2].trigger('click');   // Lost

    await w.find('[data-fill-reset]').trigger('click');

    expect(outcomes(w)).toEqual(['loss', 'loss', 'loss']);
    confirm.mockRestore();
  });

  it('does not ask when there is nothing to clear', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountGrid({ drillId: SMALL, measure: 'win_loss' });
    await w.find('[data-fill-reset]').trigger('click');
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('leaves attendance alone', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountGrid({ drillId: SMALL, measure: 'win_loss' });
    await w.findAll('[data-attendance]')[1].setValue('excused');
    await w.findAll('[data-fill-outcome]')[0].trigger('click');   // Won
    await w.find('[data-fill-reset]').trigger('click');

    expect(w.findAll('[data-attendance]')
      .map((a: any) => (a.element as HTMLSelectElement).value))
      .toEqual(['present', 'excused', 'present']);
    confirm.mockRestore();
  });
});

describe('the date', () => {
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      + `-${String(d.getDate()).padStart(2, '0')}`;
  };

  it('opens a new session on today', async () => {
    // It used to open blank, so a coach who filled in twenty-five results and
    // pressed Save was refused for a field at the top of the sheet -- which
    // reads as the button doing nothing.
    const w = await mountGrid({ drillId: SMALL, measure: 'win_loss' });
    expect((w.find('[data-session-date]').element as HTMLInputElement).value)
      .toBe(todayIso());
  });

  it('saves a new session on today without the coach touching the box', async () => {
    const w = await mountGrid({ drillId: SMALL, measure: 'win_loss' });
    for (const f of fields(w)) await f.setValue('win');
    await w.find('[data-session-save]').trigger('click');
    await flush();

    expect(saveMatrixSession).toHaveBeenCalled();
    expect(saveMatrixSession.mock.calls[0][1].occurredOn).toBe(todayIso());
  });

  it('opens a recorded session on ITS date, not today', async () => {
    // Retyping it is how a correction silently MOVES a session, which
    // re-attributes every result in it to a day it did not happen on.
    const w = await mountGrid({
      drillId: SMALL, measure: 'win_loss',
      editing: { id: 's1', drill_id: SMALL, occurred_on: '2026-09-04' }
    });
    expect((w.find('[data-session-date]').element as HTMLInputElement).value)
      .toBe('2026-09-04');
  });

  it('keeps a date the coach has typed over', async () => {
    const w = await mountGrid({ drillId: COOPERS });
    await w.find('[data-session-date]').setValue('2026-08-30');
    for (const f of fields(w)) await f.setValue('2800');
    await w.find('[data-session-save]').trigger('click');
    await flush();

    expect(saveMatrixSession.mock.calls[0][1].occurredOn).toBe('2026-08-30');
  });
});

describe('saving', () => {
  const fill = async (w: any, value = '2800') => {
    for (const f of fields(w)) await f.setValue(value);
  };

  it('sends every player, including the ones who were not there', async () => {
    // An absent row is a recorded fact. Omitting it scores them as excused.
    const w = await mountGrid({ drillId: COOPERS });
    await fill(w);
    await w.find('[data-session-date]').setValue('2026-09-06');
    await w.find('[data-session-save]').trigger('click');
    await flush();

    expect(saveMatrixSession.mock.calls[0][2]).toHaveLength(3);
  });

  it('refuses a present player with nothing recorded, naming them', async () => {
    // The client refuses this too, but its message carries a uuid.
    const w = await mountGrid({ drillId: COOPERS });   // everyone present, all blank
    await w.find('[data-session-date]').setValue('2026-09-06');
    await w.find('[data-session-save]').trigger('click');
    await flush();

    expect(saveMatrixSession).not.toHaveBeenCalled();
    expect(w.find('[data-session-error]').text()).toContain('Cesar Alva');
  });

  it('will not save without a date', async () => {
    // The box opens on today, so this is a coach who has cleared it.
    const w = await mountGrid({ drillId: COOPERS });
    await fill(w);
    await w.find('[data-session-date]').setValue('');
    await w.find('[data-session-save]').trigger('click');
    await flush();

    expect(saveMatrixSession).not.toHaveBeenCalled();
    expect(w.find('[data-session-error]').text()).toMatch(/date/i);
  });

  it('disables Save for the duration of the request', async () => {
    // A double-click would write two sessions and double everyone's available.
    const w = await mountGrid({ drillId: COOPERS });
    // After mounting: mountGrid resets the mocks, and vi.clearAllMocks clears
    // calls without clearing an implementation set before it.
    let release: (v: any) => void = () => {};
    saveMatrixSession.mockReturnValue(new Promise(r => { release = r; }));
    await fill(w);
    await w.find('[data-session-date]').setValue('2026-09-06');
    await w.find('[data-session-save]').trigger('click');
    await w.vm.$nextTick();

    expect((w.find('[data-session-save]').element as HTMLButtonElement).disabled).toBe(true);
    release({ ok: true, id: 's9' });
  });

  it('re-enables Save when the database refuses', async () => {
    // Otherwise a refused save leaves the coach unable to try again without
    // reopening the modal and re-entering the sheet.
    const w = await mountGrid({ drillId: COOPERS });
    saveMatrixSession.mockResolvedValue({ ok: false, error: 'Only a coach of this team can record sessions.' });
    await fill(w);
    await w.find('[data-session-date]').setValue('2026-09-06');
    await w.find('[data-session-save]').trigger('click');
    await flush();
    await w.vm.$nextTick();

    expect((w.find('[data-session-save]').element as HTMLButtonElement).disabled).toBe(false);
    expect(w.find('[data-session-error]').text()).toMatch(/only a coach/i);
  });

  it('tells the parent to re-read once it is saved', async () => {
    // Points are derived in Postgres; the board shows nothing new until then.
    const w = await mountGrid({ drillId: COOPERS });
    await fill(w);
    await w.find('[data-session-date]').setValue('2026-09-06');
    await w.find('[data-session-save]').trigger('click');
    await flush();

    expect(w.emitted('saved')).toBeTruthy();
  });
});

describe('the screen', () => {
  it('states the unit a banded exercise is entered in', async () => {
    const w = await mountGrid({ measure: 'time_bands' });
    expect(w.find('[data-entry-format]').text()).toContain('m:ss');
    expect(w.find('[data-entry-format]').text()).toMatch(/minutes and seconds/i);
  });

  it('states decimal seconds for a sprint instead', async () => {
    const w = await mountGrid({ measure: 'time_low' });
    expect(w.find('[data-entry-format]').text()).toContain('0.00');
    expect(w.find('[data-entry-format]').text()).toMatch(/colon/i);
  });

  it('states no unit for a result that is chosen rather than typed', async () => {
    const w = await mountGrid({ measure: 'win_loss' });
    expect(w.find('[data-entry-format]').exists()).toBe(false);
  });

  it('counts what is entered, who is out and what is left', async () => {
    const w = await mountGrid({ measure: 'count_high' });
    expect(w.find('[data-entry-tally]').text()).toMatch(/to go/i);
  });

  it('offers a way back to the ratings', async () => {
    const w = await mountGrid({ measure: 'count_high' });
    expect(w.find('[data-tool-back]').exists()).toBe(true);
  });
});

describe('a Goals-by-role exercise', () => {
  it('pre-fills each role from the position number', async () => {
    const w = await goalsGrid();
    const roles = SQUAD.map(p => (rowOf(w, p.id).find('[data-role-select]').element as HTMLSelectElement).value);
    expect(roles).toEqual(['keeper', 'defend', 'attack', '']);
    expect(rowOf(w, 'g2').find('[data-role-select]').text()).toContain('Defence');
  });

  it('keeps a role the coach changed while the score is typed', async () => {
    const w = await goalsGrid();
    await rowOf(w, 'g2').find('[data-role-select]').setValue('attack');
    await rowOf(w, 'g2').find('[data-goal-score]').setValue('3-1');
    expect((rowOf(w, 'g2').find('[data-role-select]').element as HTMLSelectElement).value).toBe('attack');
  });

  it('reopens a saved session with the role stored with the result', async () => {
    const w = await goalsGrid({
      editing: { id: 's1', drill_id: COOPERS, occurred_on: '2026-09-10' },
      results: [{ player_id: 'g3', attendance: 'present', role: 'defend', goals_for: 0, goals_against: 2 }]
    });
    expect((rowOf(w, 'g3').find('[data-role-select]').element as HTMLSelectElement).value).toBe('defend');
    expect((rowOf(w, 'g3').find('[data-goal-score]').element as HTMLInputElement).value).toBe('0-2');
  });

  it('moves role → score → next row on Enter, in on-screen order', async () => {
    const w = await goalsGrid();
    const f = fields(w);
    expect(f[0].attributes('data-role-select')).toBeDefined();
    expect(f[1].attributes('data-goal-score')).toBeDefined();
    (f[0].element as HTMLElement).focus();
    await f[0].trigger('keydown', { key: 'Enter' });
    expect(document.activeElement).toBe(f[1].element);
    await f[1].trigger('keydown', { key: 'Enter' });
    expect(document.activeElement).toBe(rowOf(w, 'g2').find('[data-role-select]').element);
  });

  it('marks a player present when a score is typed', async () => {
    const w = await goalsGrid();
    await rowOf(w, 'g3').find('[data-attendance]').setValue('excused');
    await rowOf(w, 'g3').find('[data-goal-score]').setValue('2-0');
    expect((rowOf(w, 'g3').find('[data-attendance]').element as HTMLSelectElement).value).toBe('present');
  });

  it('shows what a score earns as it is typed', async () => {
    const w = await goalsGrid();
    await rowOf(w, 'g3').find('[data-goal-score]').setValue('3-1');
    expect(rowOf(w, 'g3').find('[data-goal-earned]').text()).toBe('50% + 10% = 60% · 1.2 pts');
  });

  it('says when the squad has no standards for the role', async () => {
    const w = await goalsGrid();
    await rowOf(w, 'g1').find('[data-goal-score]').setValue('1-0');
    expect(rowOf(w, 'g1').find('[data-goal-earned]').text()).toBe('no standards for Goalkeeper');
  });

  it('refuses to save a present row without a role or a readable score, naming who', async () => {
    const w = await goalsGrid();
    await rowOf(w, 'g1').find('[data-goal-score]').setValue('0-1');
    await rowOf(w, 'g2').find('[data-goal-score]').setValue('3');
    await rowOf(w, 'g3').find('[data-goal-score]').setValue('2-1');
    await rowOf(w, 'g4').find('[data-goal-score]').setValue('1-1');
    await w.find('[data-session-save]').trigger('click');
    await flush();

    const msg = w.find('[data-session-error]').text();
    expect(msg).toContain('Dee Defender');
    expect(msg).toContain('Nat Noposition');
    expect(msg).not.toContain('Ash Attacker');
    expect(msg).toMatch(/role and a score like 3-1/);
    expect(saveMatrixSession).not.toHaveBeenCalled();
  });

  it('saves each role and both counts', async () => {
    const w = await goalsGrid({ players: SQUAD.slice(0, 3) });
    await rowOf(w, 'g1').find('[data-goal-score]').setValue('0-1');
    await rowOf(w, 'g2').find('[data-goal-score]').setValue('1-1');
    await rowOf(w, 'g3').find('[data-goal-score]').setValue('3:1');
    await w.find('[data-session-save]').trigger('click');
    await flush();

    const rows = saveMatrixSession.mock.calls[0][2];
    expect(rows.find((r: any) => r.playerId === 'g3')).toEqual({
      playerId: 'g3', attendance: 'present', rawValue: null, outcome: null, role: 'attack', goalsFor: 3, goalsAgainst: 1
    });
  });

  it('says so when the squad has no standards yet, and only then', async () => {
    expect((await goalsGrid({ goalBands: [] })).find('[data-no-goal-bands]').exists()).toBe(true);
    expect((await goalsGrid()).find('[data-no-goal-bands]').exists()).toBe(false);
  });
});

describe('the attendance column', () => {
  it('offers DNP beside Here, Excused and No-show', async () => {
    const w = await mountGrid();
    const options = w.find('[data-attendance]').findAll('option');
    expect(options.map((o: any) => o.attributes('value'))).toEqual(['present', 'excused', 'unexcused', 'dnp']);
    expect(options.map((o: any) => o.text())).toEqual(['Here', 'Excused', 'No-show', 'DNP (did not play)']);
  });

  it('saves a DNP row with no result and does not refuse the sheet', async () => {
    const w = await mountGrid();
    await w.findAll('[data-attendance]')[0].setValue('dnp');
    await fields(w)[1].setValue('40');
    await fields(w)[2].setValue('42');
    await w.find('[data-session-save]').trigger('click');
    await flush();

    const rows = saveMatrixSession.mock.calls[0][2];
    expect(rows.find((r: any) => r.attendance === 'dnp')).toMatchObject({ rawValue: null });
  });
});

