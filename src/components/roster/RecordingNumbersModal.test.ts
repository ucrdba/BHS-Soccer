/**
 * The squad's recording numbers.
 *
 * The first assertion is the rule: suggesting a block writes NOTHING. A
 * recording number is assigned by the coach in a block per squad and is what
 * the paper sheets carry through a season, so a number that moved on its own
 * would silently disagree with every sheet already written -- and both the
 * Matrix board and the session grid are read against those sheets.
 *
 * The rest is about not leaving a squad half-renumbered. recording_number is
 * unique per team, so a duplicate is refused before any write starts, a swap
 * clears both sides first, and a partial failure names who did not save.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import RecordingNumbersModal from './RecordingNumbersModal.vue';

const setRecordingNumber = vi.fn();
const fetchTeamRoster = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    setRecordingNumber: (...a: any[]) => setRecordingNumber(...a),
    fetchTeamRoster: (...a: any[]) => fetchTeamRoster(...a)
  }
}));

const TEAM = '11111111-2222-3333-4444-555555555555';

const PLAYERS = [
  { id: 'p1', name: 'Cesar Alva', lastName: 'Alva', recordingNumber: 7 },
  { id: 'p2', name: 'Tom Budde', lastName: 'Budde', recordingNumber: 8 },
  { id: 'p3', name: 'Alain Renteria', lastName: 'Renteria', recordingNumber: null }
];

const flush = () => new Promise(r => setTimeout(r, 0));

async function mountNumbers(players = PLAYERS) {
  const w = mount(RecordingNumbersModal, {
    props: { open: true, teamId: TEAM, players },
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: true })]
    },
    attachTo: document.body
  });
  await w.vm.$nextTick();
  return w;
}

const valueIn = (w: any, id: string) =>
  (w.find(`[data-rn-input="${id}"]`).element as HTMLInputElement).value;

const writes = () => setRecordingNumber.mock.calls.map(c => ({ playerId: c[1], value: c[2] }));

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  setRecordingNumber.mockResolvedValue({ ok: true });
  fetchTeamRoster.mockResolvedValue([]);
});

describe('PROPOSING WRITES NOTHING', () => {
  it('fills the draft without touching the database', async () => {
    // The whole rule. A coach reads the suggestion, adjusts it, and only then
    // saves -- nothing renumbers a squad on its own.
    const w = await mountNumbers();
    await w.find('[data-rn-propose]').trigger('click');

    expect(setRecordingNumber).not.toHaveBeenCalled();
    expect(valueIn(w, 'p3')).not.toBe('');
  });

  it('says so on screen, so nobody assumes it saved', async () => {
    const w = await mountNumbers();
    await w.find('[data-rn-propose]').trigger('click');

    expect(w.find('[data-rn-notice]').text()).toMatch(/nothing is saved/i);
  });

  it('keeps a number a player already has', async () => {
    // Anyone already numbered keeps theirs; the proposal fills the gaps.
    const w = await mountNumbers();
    await w.find('[data-rn-propose]').trigger('click');

    expect(valueIn(w, 'p1')).toBe('7');
    expect(valueIn(w, 'p2')).toBe('8');
  });

  it('continues the squad\'s own block rather than restarting at 1', async () => {
    const w = await mountNumbers([
      { id: 'p1', name: 'Alva', lastName: 'Alva', recordingNumber: 40 },
      { id: 'p2', name: 'Budde', lastName: 'Budde', recordingNumber: null }
    ]);
    expect((w.find('[data-rn-start]').element as HTMLInputElement).value).toBe('40');
  });
});

describe('what the modal opens on', () => {
  it('shows what the squad already has', async () => {
    const w = await mountNumbers();
    expect(valueIn(w, 'p1')).toBe('7');
    expect(w.find('[data-rn-current]').text()).toBe('7');
  });

  it('leaves an unnumbered player blank rather than at zero', async () => {
    const w = await mountNumbers();
    expect(valueIn(w, 'p3')).toBe('');
  });

  it('has nothing to save before anything is edited', async () => {
    const w = await mountNumbers();
    expect(w.find('[data-rn-pending]').text()).toContain('0');
  });

  it('lists every player in the squad', async () => {
    const w = await mountNumbers();
    expect(w.findAll('[data-rn-row]')).toHaveLength(PLAYERS.length);
  });
});

describe('refusing before it writes', () => {
  it('REFUSES a duplicate without writing anything', async () => {
    // The database would stop halfway and leave the squad part-renumbered --
    // a state the coach then unpicks by hand.
    const w = await mountNumbers();
    await w.find('[data-rn-input="p3"]').setValue('7');
    await w.find('[data-rn-save]').trigger('click');
    await flush();

    expect(setRecordingNumber).not.toHaveBeenCalled();
    expect(w.find('[data-rn-error]').text()).toContain('7');
  });

  it('warns about the duplicate as it is typed', async () => {
    const w = await mountNumbers();
    await w.find('[data-rn-input="p3"]').setValue('7');
    expect(w.find('[data-rn-dupes]').exists()).toBe(true);
  });

  it('refuses a number that is not a whole number of 1 or more', async () => {
    const w = await mountNumbers();
    await w.find('[data-rn-input="p3"]').setValue('0');
    await w.find('[data-rn-save]').trigger('click');
    await flush();

    expect(setRecordingNumber).not.toHaveBeenCalled();
    expect(w.find('[data-rn-error]').text()).toContain('Alain Renteria');
  });

  it('writes nothing at all when nothing changed', async () => {
    const w = await mountNumbers();
    await w.find('[data-rn-save]').trigger('click');
    await flush();

    expect(setRecordingNumber).not.toHaveBeenCalled();
    expect(w.emitted('close')).toBeTruthy();
  });
});

describe('saving', () => {
  it('writes only what changed', async () => {
    const w = await mountNumbers();
    await w.find('[data-rn-input="p3"]').setValue('9');
    await w.find('[data-rn-save]').trigger('click');
    await flush();

    expect(writes()).toEqual([{ playerId: 'p3', value: 9 }]);
  });

  it('CLEARS BOTH SIDES OF A SWAP FIRST', async () => {
    // recording_number is unique per team: writing one side first hits the
    // constraint even though the final state is legal.
    const w = await mountNumbers();
    await w.find('[data-rn-input="p1"]').setValue('8');
    await w.find('[data-rn-input="p2"]').setValue('7');
    await w.find('[data-rn-save]').trigger('click');
    await flush();

    expect(writes().slice(0, 2)).toEqual([
      { playerId: 'p1', value: null },
      { playerId: 'p2', value: null }
    ]);
    expect(writes().slice(2)).toEqual([
      { playerId: 'p1', value: 8 },
      { playerId: 'p2', value: 7 }
    ]);
  });

  it('sends the team with every write', async () => {
    const w = await mountNumbers();
    await w.find('[data-rn-input="p3"]').setValue('9');
    await w.find('[data-rn-save]').trigger('click');
    await flush();

    expect(setRecordingNumber.mock.calls[0][0]).toBe(TEAM);
  });

  it('NAMES the players that did not save, not a count', async () => {
    // A partial save is recoverable only if the coach knows what is missing.
    setRecordingNumber.mockResolvedValue({
      ok: false, error: 'Recording number 9 is already used by someone on this team.'
    });
    const w = await mountNumbers();
    await w.find('[data-rn-input="p3"]').setValue('9');
    await w.find('[data-rn-save]').trigger('click');
    await flush();

    expect(w.find('[data-rn-error]').text()).toContain('Alain Renteria');
    expect(w.find('[data-rn-error]').text()).toMatch(/already used/i);
    expect(w.emitted('close')).toBeFalsy();
  });

  it('re-reads the roster rather than patching it', async () => {
    const w = await mountNumbers();
    await w.find('[data-rn-input="p3"]').setValue('9');
    await w.find('[data-rn-save]').trigger('click');
    await flush();

    expect(w.emitted('saved')).toBeTruthy();
    expect(w.emitted('close')).toBeTruthy();
  });

  it('refuses without a team rather than writing unscoped', async () => {
    const w = mount(RecordingNumbersModal, {
      props: { open: true, teamId: null, players: PLAYERS },
      global: { plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: true })] }
    });
    await w.vm.$nextTick();
    await w.find('[data-rn-input="p3"]').setValue('9');
    await w.find('[data-rn-save]').trigger('click');
    await flush();

    expect(setRecordingNumber).not.toHaveBeenCalled();
    expect(w.find('[data-rn-error]').text()).toMatch(/team/i);
  });
});
