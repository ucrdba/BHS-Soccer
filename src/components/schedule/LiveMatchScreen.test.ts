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
import { setActivePinia } from 'pinia';
import LiveMatchScreen from './LiveMatchScreen.vue';
import { usePlusMinusStore } from '../../stores/plus-minus';

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

/**
 * Wait until the screen's own open() has settled.
 *
 * The component opens the match on mount, and open() resets the events and
 * clears the notice. A test that drives the store before that lands has its
 * work wiped — which is a race, not a failure, and shows up only under load.
 */
async function openSettled(pm: any, tries = 20): Promise<void> {
  for (let i = 0; i < tries && !pm.statMatchId; i++) await flush();
  if (!pm.statMatchId) throw new Error('the board never opened');
}

async function mountBoard() {
  const w = mount(LiveMatchScreen, {
    props: {
      matchId: MATCH, matchLabel: 'vs Redlands',
      teamId: TEAM, schoolId: 's1', players: PLAYERS
    },
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: false })],
      stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } }
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
    // Screen redesign: the kicker reads "1st half" rather than "Period 1"
    // for the first two periods (still "Period N" for extra time).
    const w = await mountBoard();
    expect(w.text()).toMatch(/1st half/i);
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

    // The row now carries minutes alongside the net score in one string.
    expect(w.find('[data-pm-score-for="p1"]').text()).toContain('net 0');
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

describe('the screen at its own URL', () => {
  it('says the clock is not started before kick-off, and says it differently once stopped', async () => {
    const w = await mountBoard();
    expect(w.find('[data-pm-status]').text()).toMatch(/not started/i);

    await startClock(w);
    expect(w.find('[data-pm-status]').text()).toMatch(/running/i);

    await w.find('[data-pm-clock-toggle]').trigger('click');
    await flush();
    await w.vm.$nextTick();
    expect(w.find('[data-pm-status]').text()).toMatch(/stopped/i);
  });

  it('shows the refusal as a card headed for the case it is', async () => {
    // Before kick-off the mistake is different from a mid-match stoppage,
    // and the coach is told which one they are in.
    const w = await mountBoard();
    await sendOn(w, 'p1');
    await w.find('[data-pm-plus="p1"]').trigger('click');
    await flush();
    await w.vm.$nextTick();

    expect(w.find('[data-pm-refusal]').exists()).toBe(true);
    expect(w.find('[data-pm-refusal-title]').text()).toMatch(/hasn't kicked off|has not kicked off/i);
    // The words are the store's, not the screen's.
    expect(w.find('[data-pm-notice]').text()).toMatch(/start the clock/i);
  });

  it('heads the refusal differently once the match has started', async () => {
    const w = await mountBoard();
    await sendOn(w, 'p1');
    await startClock(w);
    await w.find('[data-pm-clock-toggle]').trigger('click');
    await flush();
    await w.vm.$nextTick();

    await w.find('[data-pm-plus="p1"]').trigger('click');
    await flush();
    await w.vm.$nextTick();

    expect(w.find('[data-pm-refusal-title]').text()).toMatch(/stopped/i);
  });

  it('does not blame the clock for a refusal that happened while it ran', async () => {
    // The fixture only carries three players -- short of the eleven-player
    // limit that trips this refusal from the bench -- so the full-pitch
    // refusal is driven straight through the store's own door (the one a
    // bench tap goes through) instead. `usePlusMinusStore` is called with
    // this test's own pinia instance so it resolves to the same store the
    // mounted screen reads.
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false });
    const w = mount(LiveMatchScreen, {
      props: {
        matchId: MATCH, matchLabel: 'vs Redlands',
        teamId: TEAM, schoolId: 's1', players: PLAYERS
      },
      global: {
        plugins: [pinia],
        stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } }
      },
      attachTo: document.body
    });
    await flush();
    await w.vm.$nextTick();

    // Pinia's `useStore(pinia)` ignores the explicit argument whenever it is
    // called outside a component's setup context while a *testing* pinia is
    // active (see pinia's own useStore: it substitutes `null` for the
    // passed-in pinia in that case and falls back to the ambient
    // `activePinia`). Left alone, that fallback can resolve to whichever
    // pinia instance happened to be active most recently -- other tests in
    // this file never unmount their screens, so their tickers keep running
    // and can flip the ambient active pinia between this mount and this
    // line. Reasserting it immediately before the lookup closes that gap and
    // guarantees `pm` is the exact store this screen already created.
    setActivePinia(pinia);
    const pm = usePlusMinusStore(pinia as any);
    await openSettled(pm);
    await startClock(w);
    for (let i = 0; i < 11; i++) await pm.append('on', `x${i}`);
    await pm.append('on', 'x11');
    await flush();
    await w.vm.$nextTick();

    expect(pm.running).toBe(true);
    expect(w.find('[data-pm-refusal]').exists()).toBe(true);
    expect(w.find('[data-pm-refusal-title]').text()).toMatch(/not recorded/i);
    expect(w.find('[data-pm-refusal-title]').text()).not.toMatch(/clock is stopped/i);
  });

  it('offers a way back to the schedule', async () => {
    const w = await mountBoard();
    expect(w.find('[data-tool-back]').exists()).toBe(true);
  });

  it('arms an event kind from the footer bar', async () => {
    const w = await mountBoard();
    await startClock(w);
    await w.find('[data-pm-arm="goal"]').trigger('click');
    await w.vm.$nextTick();
    expect(w.find('[data-pm-arm="goal"]').classes()).toContain('is-armed');
  });
});
