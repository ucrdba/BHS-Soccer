/**
 * Tagging packing from video.
 *
 * A coach has the video in another window and the keyboard under their
 * hands, so Enter walks the row and saves from its last box — the session
 * grid's rule. And a match recorded live as well must say, before and after,
 * that the tags replace the taps.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PackingTagScreen from './PackingTagScreen.vue';

const findStatMatch = vi.fn();
const openStatMatch = vi.fn();
const fetchStatEvents = vi.fn();
const fetchPackingTags = vi.fn();
const addPackingTag = vi.fn();
const removePackingTag = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    findStatMatch: (...a: any[]) => findStatMatch(...a),
    openStatMatch: (...a: any[]) => openStatMatch(...a),
    fetchStatEvents: (...a: any[]) => fetchStatEvents(...a),
    fetchPackingTags: (...a: any[]) => fetchPackingTags(...a),
    addPackingTag: (...a: any[]) => addPackingTag(...a),
    removePackingTag: (...a: any[]) => removePackingTag(...a)
  }
}));

const TEAM = '11111111-2222-3333-4444-555555555555';
const MATCH = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PLAYERS = [
  { id: 'p9', name: 'Nine Alva', number: 9, recordingNumber: 4 },
  { id: 'p11', name: 'Eleven Budde', number: 11 },
  { id: 'p7a', name: 'Seven One', number: 7 },
  { id: 'p7b', name: 'Seven Two', number: 7 }
];

const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0));
};

async function mountTags() {
  const w = mount(PackingTagScreen, {
    props: { matchId: MATCH, matchLabel: 'Redlands', teamId: TEAM, schoolId: 's1', players: PLAYERS },
    attachTo: document.body,
    global: { stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } }
  });
  await flush();
  return w;
}

const field = (w: any, name: string) => w.find(`[data-pt-field="${name}"]`);

async function typeAndEnter(w: any, name: string, value: string) {
  await field(w, name).setValue(value);
  await field(w, name).trigger('keydown', { key: 'Enter' });
  await flush();
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  findStatMatch.mockResolvedValue({ ok: true, id: 'sm1' });
  openStatMatch.mockResolvedValue({ ok: true, id: 'sm1' });
  fetchStatEvents.mockResolvedValue([]);
  fetchPackingTags.mockResolvedValue([]);
  addPackingTag.mockImplementation(() => Promise.resolve({ ok: true, id: `t${Math.random()}`, createdAt: '2026-11-15T00:00:00Z' }));
  removePackingTag.mockResolvedValue({ ok: true });
});

describe('the entry row', () => {
  it('walks time → player → receiver → bypassed on Enter and saves from the last', async () => {
    const w = await mountTags();
    await typeAndEnter(w, 'time', '23:41');
    expect(document.activeElement).toBe(field(w, 'player').element);
    await typeAndEnter(w, 'player', '9');
    expect(document.activeElement).toBe(field(w, 'receiver').element);
    await typeAndEnter(w, 'receiver', '11');
    expect(document.activeElement).toBe(field(w, 'bypassed').element);
    expect(addPackingTag).not.toHaveBeenCalled();
    await typeAndEnter(w, 'bypassed', '3');

    expect(addPackingTag).toHaveBeenCalledWith('sm1', {
      playerId: 'p9', receiverId: 'p11', action: 'pass', bypassed: 3, videoSeconds: 1421
    });
    expect(w.findAll('[data-pt-tag]')).toHaveLength(1);
    // Ready for the next one: the players and count clear, the time and action stay.
    expect((field(w, 'player').element as HTMLInputElement).value).toBe('');
    expect((field(w, 'time').element as HTMLInputElement).value).toBe('23:41');
    expect(document.activeElement).toBe(field(w, 'time').element);
  });

  it('hides Receiver for a dribble and saves without one', async () => {
    const w = await mountTags();
    await w.find('[data-pt-action="dribble"]').trigger('click');
    expect(field(w, 'receiver').exists()).toBe(false);
    await typeAndEnter(w, 'player', '9');
    expect(document.activeElement).toBe(field(w, 'bypassed').element);
    await typeAndEnter(w, 'bypassed', '2');
    expect(addPackingTag).toHaveBeenCalledWith('sm1', expect.objectContaining({
      action: 'dribble', receiverId: null, videoSeconds: null
    }));
  });

  it('offers a choice when two players wear the number, and saves the one chosen', async () => {
    const w = await mountTags();
    await w.find('[data-pt-action="dribble"]').trigger('click');
    await typeAndEnter(w, 'player', '7');
    const pick = w.find('[data-pt-pick="player"]');
    expect(pick.exists()).toBe(true);
    expect(pick.findAll('option').map((o: any) => o.attributes('value'))).toEqual(['', 'p7a', 'p7b']);
    await pick.setValue('p7b');
    await typeAndEnter(w, 'bypassed', '1');
    expect(addPackingTag).toHaveBeenCalledWith('sm1', expect.objectContaining({ playerId: 'p7b' }));
  });

  it.each([
    ['time', '23:5', /m:ss/],
    ['bypassed', '12', /1 to 11/],
    ['bypassed', '0', /1 to 11/]
  ])('refuses %s = %s beside the row and saves nothing', async (name, value, message) => {
    const w = await mountTags();
    await w.find('[data-pt-action="dribble"]').trigger('click');
    await field(w, 'player').setValue('9');
    await field(w, 'time').setValue(name === 'time' ? value : '');
    await field(w, 'bypassed').setValue(name === 'bypassed' ? value : '2');
    await field(w, 'bypassed').trigger('keydown', { key: 'Enter' });
    await flush();
    expect(addPackingTag).not.toHaveBeenCalled();
    expect(w.find('[data-pt-error]').text()).toMatch(message);
  });

  it('refuses a pass to the passer', async () => {
    const w = await mountTags();
    await field(w, 'player').setValue('9');
    await field(w, 'receiver').setValue('9');
    await field(w, 'bypassed').setValue('2');
    await field(w, 'bypassed').trigger('keydown', { key: 'Enter' });
    await flush();
    expect(addPackingTag).not.toHaveBeenCalled();
    expect(w.find('[data-pt-error]').text()).toMatch(/somebody else/);
  });

  it('creates the tracking session on the first save when the fixture has none', async () => {
    findStatMatch.mockResolvedValue({ ok: true, id: null });
    const w = await mountTags();
    expect(openStatMatch).not.toHaveBeenCalled();
    await w.find('[data-pt-action="dribble"]').trigger('click');
    await field(w, 'player').setValue('9');
    await typeAndEnter(w, 'bypassed', '2');
    expect(openStatMatch).toHaveBeenCalledWith(TEAM, 's1', MATCH, 'Redlands');
    expect(addPackingTag).toHaveBeenCalledWith('sm1', expect.anything());
  });
});

describe('saying what replaces what', () => {
  it('warns before the first tag when there are live taps, and confirms after', async () => {
    fetchStatEvents.mockResolvedValue([
      { kind: 'packing', playerId: 'p9', bypassed: 2 },
      { kind: 'packing', playerId: 'p11', bypassed: 1 },
      { kind: 'plus', playerId: 'p9' }
    ]);
    const w = await mountTags();
    expect(w.find('[data-pt-notice]').text()).toContain('2 live packing taps');
    expect(w.find('[data-pt-notice]').text()).toMatch(/instead/);

    await w.find('[data-pt-action="dribble"]').trigger('click');
    await field(w, 'player').setValue('9');
    await typeAndEnter(w, 'bypassed', '2');
    expect(w.find('[data-pt-notice]').text()).toMatch(/now count these video tags/);
  });

  it('says nothing when there were no live taps', async () => {
    const w = await mountTags();
    expect(w.find('[data-pt-notice]').exists()).toBe(false);
  });
});

describe('the list and the summary', () => {
  it('lists tags in video order and removes one', async () => {
    fetchPackingTags.mockResolvedValue([
      { id: 't1', playerId: 'p9', receiverId: null, action: 'dribble', bypassed: 1, videoSeconds: null },
      { id: 't2', playerId: 'p11', receiverId: 'p9', action: 'pass', bypassed: 4, videoSeconds: 90 }
    ]);
    const w = await mountTags();
    const tags = w.findAll('[data-pt-tag]');
    expect(tags[0].text()).toContain('1:30');
    await tags[0].find('[data-pt-remove]').trigger('click');
    await flush();
    expect(removePackingTag).toHaveBeenCalledWith('t2');
    expect(w.findAll('[data-pt-tag]')).toHaveLength(1);
  });

  it('drops the old fixture’s tags when the next one fails to load', async () => {
    fetchPackingTags.mockResolvedValue([
      { id: 't2', playerId: 'p11', receiverId: 'p9', action: 'pass', bypassed: 4, videoSeconds: 90 }
    ]);
    const w = await mountTags();
    expect(w.findAll('[data-pt-tag]')).toHaveLength(1);
    findStatMatch.mockResolvedValue({ ok: false, error: 'x' });
    await w.setProps({ matchId: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee' });
    await flush();
    expect(w.findAll('[data-pt-tag]')).toHaveLength(0);
    expect(w.find('[data-pt-load-error]').text()).toContain('x');
  });

  it('lists every player in the summary, including those with nothing', async () => {
    fetchPackingTags.mockResolvedValue([
      { id: 't2', playerId: 'p11', receiverId: 'p9', action: 'pass', bypassed: 4, videoSeconds: 90 }
    ]);
    const w = await mountTags();
    expect(w.findAll('[data-pt-summary-row]')).toHaveLength(PLAYERS.length);
  });
});
