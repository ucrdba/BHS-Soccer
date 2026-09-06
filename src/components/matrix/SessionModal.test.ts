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
import SessionModal from './SessionModal.vue';

const saveMatrixSession = vi.fn();
const fetchTimeBands = vi.fn();
const fetchMatrixSessionResults = vi.fn();
const fetchTeamSessionHistory = vi.fn();
const fetchDrillsForWeighting = vi.fn();
const deleteMatrixSession = vi.fn();
const findPlayerOnTeam = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    saveMatrixSession: (...a: any[]) => saveMatrixSession(...a),
    fetchTimeBands: (...a: any[]) => fetchTimeBands(...a),
    fetchMatrixSessionResults: (...a: any[]) => fetchMatrixSessionResults(...a),
    fetchTeamSessionHistory: (...a: any[]) => fetchTeamSessionHistory(...a),
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

const flush = () => new Promise(r => setTimeout(r, 0));

async function mountGrid(opts: { drillId?: string; open?: boolean } = {}) {
  const { drillId = COOPERS, open = true } = opts;
  vi.clearAllMocks();
  saveMatrixSession.mockResolvedValue({ ok: true, id: 's9' });
  fetchTimeBands.mockResolvedValue(BANDS);
  fetchMatrixSessionResults.mockResolvedValue([]);
  fetchTeamSessionHistory.mockResolvedValue([]);
  fetchDrillsForWeighting.mockResolvedValue(DRILLS);

  const w = mount(SessionModal, {
    props: { open, teamId: 't1', schoolId: 's1', players: PLAYERS, drillId },
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: false,
        initialState: { session: { drills: DRILLS, bands: BANDS } }
      })]
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
    const w = await mountGrid({ drillId: COOPERS });
    await fill(w);
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
