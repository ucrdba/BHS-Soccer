/**
 * Recording a match live.
 *
 * The two assertions that matter are that the clock refusal reaches the
 * SCREEN rather than an alert, and that every gesture has a plain control
 * beside it. Two fingers and the right mouse button are the fast paths for a
 * minus, but a coach holding a phone in one hand -- or anyone using a
 * keyboard -- needs a button. Same reasoning as the planner's move buttons
 * and the lineup's tap-to-place.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import PlusMinusModal from './PlusMinusModal.vue';

const openStatMatch = vi.fn();
const fetchStatEvents = vi.fn();
const appendStatEvent = vi.fn();
const undoStatEvent = vi.fn();

vi.mock('../../data/supabase', () => ({
  supabaseService: {
    openStatMatch: (...a: any[]) => openStatMatch(...a),
    fetchStatEvents: (...a: any[]) => fetchStatEvents(...a),
    appendStatEvent: (...a: any[]) => appendStatEvent(...a),
    undoStatEvent: (...a: any[]) => undoStatEvent(...a)
  }
}));

const TEAM = '11111111-2222-3333-4444-555555555555';
const MATCH = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const PLAYERS = [
  { id: 'p1', name: 'Cesar Alva', number: 1 },
  { id: 'p2', name: 'Tom Budde', number: 2 },
  { id: 'p3', name: 'Alain Renteria', number: 3 }
];

const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

async function mountBoard() {
  const w = mount(PlusMinusModal, {
    props: {
      open: true, matchId: MATCH, matchLabel: 'vs Redlands',
      teamId: TEAM, schoolId: 's1', players: PLAYERS
    },
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: false })]
    },
    attachTo: document.body
  });
  await flush();
  await w.vm.$nextTick();
  return w;
}

/** Send a player on, which works before kick-off. */
async function sendOn(w: any, id: string) {
  await w.find(`[data-pm-bench="${id}"]`).trigger('click');
  await flush();
  await w.vm.$nextTick();
}

/** Start the clock, so recording is allowed. */
async function startClock(w: any) {
  await w.find('[data-pm-clock-toggle]').trigger('click');
  await flush();
  await w.vm.$nextTick();
}

const kindsWritten = () => appendStatEvent.mock.calls.map(c => c[1].kind);

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  openStatMatch.mockResolvedValue({ ok: true, id: 'sm1' });
  fetchStatEvents.mockResolvedValue([]);
  appendStatEvent.mockImplementation(() =>
    Promise.resolve({ ok: true, id: `e${Math.random()}` }));
  undoStatEvent.mockResolvedValue({ ok: true });
});

describe('the clock', () => {
  it('opens at zero and reads as mm:ss', async () => {
    const w = await mountBoard();
    expect(w.find('[data-pm-clock]').text()).toBe('0:00');
  });

  it('starts and stops', async () => {
    const w = await mountBoard();
    expect(w.find('[data-pm-clock-toggle]').text()).toMatch(/start/i);

    await startClock(w);
    expect(w.find('[data-pm-clock-toggle]').text()).toMatch(/stop/i);
  });

  it('shows the period and the running score', async () => {
    const w = await mountBoard();
    expect(w.text()).toContain('Period 1');
    expect(w.find('[data-pm-score]').text()).toBe('0 – 0');
  });

  it('counts a team goal into the score', async () => {
    const w = await mountBoard();
    await startClock(w);
    await w.find('[data-pm-goal-for]').trigger('click');
    await flush();
    await w.vm.$nextTick();

    expect(w.find('[data-pm-score]').text()).toBe('1 – 0');
  });
});

describe('THE REFUSAL IS ON SCREEN', () => {
  it('appears when a plus is pressed before kick-off', async () => {
    // Not an alert: it must be readable at a touchline, and testable here.
    const w = await mountBoard();
    await sendOn(w, 'p1');

    await w.find('[data-pm-plus="p1"]').trigger('click');
    await flush();
    await w.vm.$nextTick();

    expect(w.find('[data-pm-notice]').text()).toMatch(/start the clock/i);
    expect(kindsWritten()).not.toContain('plus');
  });

  it('says the other thing when the clock has merely been stopped', async () => {
    const w = await mountBoard();
    await sendOn(w, 'p1');
    await startClock(w);
    await startClock(w);   // toggles it back off

    await w.find('[data-pm-plus="p1"]').trigger('click');
    await flush();
    await w.vm.$nextTick();

    expect(w.find('[data-pm-notice]').text()).toMatch(/stopped/i);
  });

  it('clears once something records', async () => {
    const w = await mountBoard();
    await sendOn(w, 'p1');
    await w.find('[data-pm-plus="p1"]').trigger('click');
    await flush();
    await w.vm.$nextTick();
    expect(w.find('[data-pm-notice]').exists()).toBe(true);

    await startClock(w);
    await w.find('[data-pm-plus="p1"]').trigger('click');
    await flush();
    await w.vm.$nextTick();

    expect(w.find('[data-pm-notice]').exists()).toBe(false);
  });
});

describe('EVERY GESTURE HAS A BUTTON', () => {
  it('offers plus and minus controls on a player who is on', async () => {
    const w = await mountBoard();
    await sendOn(w, 'p1');

    expect(w.find('[data-pm-plus="p1"]').exists()).toBe(true);
    expect(w.find('[data-pm-minus="p1"]').exists()).toBe(true);
  });

  it('records a plus from the button', async () => {
    const w = await mountBoard();
    await sendOn(w, 'p1');
    await startClock(w);

    await w.find('[data-pm-plus="p1"]').trigger('click');
    await flush();

    expect(kindsWritten()).toContain('plus');
  });

  it('records a minus from the button, with no two-finger press', async () => {
    // The gesture stays as the fast path; this is the one that always works.
    const w = await mountBoard();
    await sendOn(w, 'p1');
    await startClock(w);

    await w.find('[data-pm-minus="p1"]').trigger('click');
    await flush();

    expect(kindsWritten()).toContain('minus');
  });

  it('still records a minus from a right click', async () => {
    const w = await mountBoard();
    await sendOn(w, 'p1');
    await startClock(w);

    await w.find('[data-pm-player="p1"]').trigger('contextmenu');
    await flush();

    expect(kindsWritten()).toContain('minus');
  });

  it('records a plus from a plain tap on the chip', async () => {
    const w = await mountBoard();
    await sendOn(w, 'p1');
    await startClock(w);

    await w.find('[data-pm-player="p1"]').trigger('click');
    await flush();

    expect(kindsWritten()).toContain('plus');
  });
});

describe('sending players on and off', () => {
  it('moves a player from the bench to the pitch', async () => {
    const w = await mountBoard();
    await sendOn(w, 'p1');

    expect(w.find('[data-pm-player="p1"]').exists()).toBe(true);
    expect(w.find('[data-pm-bench="p1"]').exists()).toBe(false);
  });

  it('works BEFORE kick-off, because that is how a coach begins', async () => {
    const w = await mountBoard();
    await sendOn(w, 'p1');

    expect(kindsWritten()).toContain('on');
    expect(w.find('[data-pm-notice]').exists()).toBe(false);
  });

  it('takes a player back off', async () => {
    const w = await mountBoard();
    await sendOn(w, 'p1');

    await w.find('[data-pm-off="p1"]').trigger('click');
    await flush();
    await w.vm.$nextTick();

    expect(w.find('[data-pm-bench="p1"]').exists()).toBe(true);
  });

  it('counts who is on, against the limit', async () => {
    const w = await mountBoard();
    await sendOn(w, 'p1');
    expect(w.find('[data-pm-on-count]').text()).toBe('1 / 11');
  });

  it('says what to do when nobody is on yet', async () => {
    const w = await mountBoard();
    expect(w.find('[data-pm-empty-pitch]').text()).toMatch(/before kick-off/i);
  });
});

describe('the running figures', () => {
  it('show a player\'s net score on their chip', async () => {
    const w = await mountBoard();
    await sendOn(w, 'p1');
    await startClock(w);

    await w.find('[data-pm-plus="p1"]').trigger('click');
    await flush();
    await w.vm.$nextTick();

    expect(w.find('[data-pm-score-for="p1"]').text()).toContain('1');
  });

  it('give EVERY player in the squad a row, not only those who played', async () => {
    // The same rule as the reports: a coach is reading this to decide who to
    // bring on, so the players with nothing yet are who it is for.
    const w = await mountBoard();
    expect(w.findAll('[data-pm-row]')).toHaveLength(PLAYERS.length);
  });

  it('put minutes on the row beside plus and minus', async () => {
    const w = await mountBoard();
    expect(w.find('[data-pm-cell="mins"]').exists()).toBe(true);
    expect(w.find('[data-pm-cell="plus"]').exists()).toBe(true);
  });

  it('sort by a column and reverse on a second click', async () => {
    const w = await mountBoard();
    const names = () => w.findAll('[data-pm-cell="name"]').map((c: any) => c.text());

    await w.find('[data-pm-sort="name"]').trigger('click');
    const forward = names();
    await w.find('[data-pm-sort="name"]').trigger('click');

    expect(names()).toEqual(forward.slice().reverse());
  });

  it('correct themselves after an undo', async () => {
    // Every figure is replayed from the log rather than counted, which is
    // what makes an undo fix everything downstream of it.
    const w = await mountBoard();
    await sendOn(w, 'p1');
    await startClock(w);
    await w.find('[data-pm-plus="p1"]').trigger('click');
    await flush();
    await w.vm.$nextTick();

    await w.find('[data-pm-undo]').trigger('click');
    await flush();
    await w.vm.$nextTick();

    expect(w.find('[data-pm-score-for="p1"]').text().trim()).toBe('0');
  });
});

describe('opening', () => {
  it('opens the tracked session for the fixture', async () => {
    await mountBoard();
    expect(openStatMatch).toHaveBeenCalledWith(TEAM, 's1', MATCH, 'vs Redlands');
  });

  it('reports a refusal rather than showing an empty board', async () => {
    openStatMatch.mockResolvedValue({ ok: false, error: 'You must coach this team.' });
    const w = await mountBoard();

    expect(w.find('[data-pm-open-error]').text()).toMatch(/must coach this team/i);
  });
});
