/**
 * Recording a match live.
 *
 * The first block is the reason this file exists. A plus or a minus may only
 * be recorded while the clock is RUNNING -- not merely started -- because
 * every event is stamped with the match clock and both playing time and goal
 * difference are derived from those stamps.
 *
 * Before kick-off everything stamps at 0:00 and every player finishes the
 * match credited with zero minutes. While merely paused an event stamps at a
 * minute that has already passed, against whoever was on the pitch then.
 *
 * Neither says so at the time: the counters go up and the sheet looks right.
 * That is what makes this the one surface in the application where a mistake
 * is silent, and why the guard is asserted from every angle here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { replay, orderEvents } from '../data/plus-minus';

const openStatMatch = vi.fn();
const fetchStatEvents = vi.fn();
const appendStatEvent = vi.fn();
const undoStatEvent = vi.fn();

vi.mock('../data/supabase', () => ({
  supabaseService: {
    openStatMatch: (...a: any[]) => openStatMatch(...a),
    fetchStatEvents: (...a: any[]) => fetchStatEvents(...a),
    appendStatEvent: (...a: any[]) => appendStatEvent(...a),
    undoStatEvent: (...a: any[]) => undoStatEvent(...a)
  }
}));

const { usePlusMinusStore } = await import('./plus-minus');

const TEAM = '11111111-2222-3333-4444-555555555555';
const MATCH = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/** A store with a tracked session already open. */
async function opened() {
  const s = usePlusMinusStore();
  await s.open(TEAM, 's1', MATCH, 'vs Redlands');
  return s;
}

/** A store with the clock running, ready to record. */
async function running() {
  const s = await opened();
  await s.toggleClock();
  return s;
}

const kinds = (s: any) => s.events.map((e: any) => e.kind);

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  openStatMatch.mockResolvedValue({ ok: true, id: 'sm1' });
  fetchStatEvents.mockResolvedValue([]);
  appendStatEvent.mockImplementation(() =>
    Promise.resolve({ ok: true, id: `e${Math.random()}` }));
  undoStatEvent.mockResolvedValue({ ok: true });
});

describe('THE CLOCK GUARD', () => {
  it('refuses a plus before kick-off', async () => {
    const s = await opened();
    const res = await s.append('plus', 'p1');

    expect(res.ok).toBe(false);
    expect(kinds(s)).not.toContain('plus');
    expect(appendStatEvent).not.toHaveBeenCalled();
  });

  it('says WHY, not just that it refused', async () => {
    // A coach who is told "no" and not told the clock is the reason will try
    // again rather than start it.
    const s = await opened();
    await s.append('plus', 'p1');

    expect(s.notice).toMatch(/start the clock/i);
    expect(s.notice).toMatch(/0:00|minutes/i);
  });

  it('refuses a plus while the clock is merely STOPPED', async () => {
    // The distinction this rule turns on: started-then-stopped is as closed
    // for recording as never started.
    const s = await running();
    await s.toggleClock();

    const res = await s.append('plus', 'p1');
    expect(res.ok).toBe(false);
    expect(kinds(s)).not.toContain('plus');
  });

  it('words the two refusals differently', async () => {
    // "Start the clock" and "the clock is stopped" are different situations
    // to somebody standing on a touchline.
    const before = await opened();
    await before.append('plus', 'p1');
    const beforeText = before.notice;

    setActivePinia(createPinia());
    const paused = await running();
    await paused.toggleClock();
    await paused.append('plus', 'p1');

    expect(paused.notice).not.toBe(beforeText);
    expect(paused.notice).toMatch(/stopped/i);
  });

  it('refuses a MINUS in both cases as well', async () => {
    const s = await opened();
    expect((await s.append('minus', 'p1')).ok).toBe(false);

    await s.toggleClock();
    await s.toggleClock();
    expect((await s.append('minus', 'p1')).ok).toBe(false);
  });

  it('gates every clock-stamped statistic, not only plus and minus', async () => {
    // Any new live statistic follows the same rule; the list is in one place
    // so the variants cannot drift.
    const s = await opened();
    for (const kind of ['shot', 'goal', 'assist'] as const) {
      expect((await s.append(kind, 'p1')).ok).toBe(false);
    }
  });

  it('RECORDS a plus once the clock is running', async () => {
    const s = await running();
    const res = await s.append('plus', 'p1');

    expect(res.ok).toBe(true);
    expect(kinds(s)).toContain('plus');
  });
});

describe('what stays OUTSIDE the guard', () => {
  it('lets a player be sent on before kick-off', async () => {
    // Arranging the starting shape is how a coach begins. Gating this would
    // make the tracker unusable before the whistle.
    const s = await opened();
    const res = await s.append('on', 'p1');

    expect(res.ok).toBe(true);
    expect(s.onPitch).toContain('p1');
  });

  it('lets a player be taken off before kick-off', async () => {
    const s = await opened();
    await s.append('on', 'p1');
    expect((await s.append('off', 'p1')).ok).toBe(true);
  });

  it('lets the clock be started, or nothing could ever begin', async () => {
    const s = await opened();
    const res = await s.toggleClock();

    expect(res.ok).toBe(true);
    expect(s.running).toBe(true);
  });

  it('lets a team goal be recorded while the clock runs', async () => {
    const s = await running();
    expect((await s.teamGoal(true)).ok).toBe(true);
    expect(kinds(s)).toContain('goal_for');
  });
});

describe('the notice', () => {
  it('clears once something records successfully', async () => {
    // Leaving "start the clock" on screen after the coach has started it
    // reads as the refusal still standing.
    const s = await opened();
    await s.append('plus', 'p1');
    expect(s.notice).toBeTruthy();

    await s.toggleClock();
    await s.append('plus', 'p1');
    expect(s.notice).toBe('');
  });

  it('clears when an event is armed, which is a fresh intention', async () => {
    const s = await opened();
    await s.append('plus', 'p1');
    s.arm('goal');
    expect(s.notice).toBe('');
  });
});

describe('eleven on the pitch', () => {
  const fill = async (s: any, n: number) => {
    for (let i = 0; i < n; i++) await s.append('on', `p${i}`);
  };

  it('accepts the eleventh', async () => {
    const s = await opened();
    await fill(s, 11);
    expect(s.onPitch).toHaveLength(11);
  });

  it('REFUSES the twelfth, and says what to do', async () => {
    // A twelfth is wrong however they got on, and afterwards the minutes and
    // goal difference of everyone on the pitch are quietly wrong.
    const s = await opened();
    await fill(s, 11);

    const res = await s.append('on', 'p99');
    expect(res.ok).toBe(false);
    expect(s.notice).toMatch(/take one off/i);
    expect(s.onPitch).toHaveLength(11);
  });

  it('treats a player already on as a no-op, not a duplicate', async () => {
    const s = await opened();
    await s.append('on', 'p1');
    await s.append('on', 'p1');

    expect(kinds(s).filter((k: string) => k === 'on')).toHaveLength(1);
  });

  it('lets somebody on again after a substitution', async () => {
    // NFHS rules allow re-entry, and squads rotate heavily.
    const s = await opened();
    await fill(s, 11);
    await s.append('off', 'p0');

    expect((await s.append('on', 'p99')).ok).toBe(true);
  });
});

describe('the event that gets written', () => {
  it('is stamped with the clock, not with zero', async () => {
    // And not a second EARLY: the clock is read against a cached timestamp
    // that only the ticker moves, so starting it has to refresh that reading
    // or the first event after kick-off stamps before the clock began.
    const s = await running();
    s.clockBase = 754;
    s.runningSince = null;
    await s.toggleClock();
    await s.append('plus', 'p1');

    const written = appendStatEvent.mock.calls.map(c => c[1]).find(e => e.kind === 'plus');
    expect(written.atSeconds).toBeGreaterThanOrEqual(754);
  });

  it('carries the period', async () => {
    const s = await running();
    await s.endPeriod();
    await s.toggleClock();
    await s.append('plus', 'p1');

    const written = appendStatEvent.mock.calls.map(c => c[1]).find(e => e.kind === 'plus');
    expect(written.period).toBe(2);
  });

  it('goes to the tracked session', async () => {
    const s = await running();
    await s.append('plus', 'p1');
    expect(appendStatEvent.mock.calls[0][0]).toBe('sm1');
  });

  it('ROLLS BACK off the board when the database refuses it', async () => {
    // A board showing a plus the database rejected is worse than a slow one.
    const s = await running();
    appendStatEvent.mockResolvedValue({ ok: false, error: 'The database refused that event.' });

    const res = await s.append('plus', 'p1');
    expect(res.ok).toBe(false);
    expect(kinds(s)).not.toContain('plus');
    expect(s.notice).toMatch(/refused/i);
  });
});

describe('undo', () => {
  it('takes the last event off', async () => {
    const s = await running();
    await s.append('plus', 'p1');
    await s.undo();

    expect(kinds(s)).not.toContain('plus');
  });

  it('soft-deletes it in the database too', async () => {
    const s = await running();
    await s.append('plus', 'p1');
    await s.undo();

    expect(undoStatEvent).toHaveBeenCalled();
  });

  it('STOPS the clock when a clock_start is undone', async () => {
    // The clock is derived from these events. Leaving them out of step makes
    // it count on from nothing.
    const s = await running();
    expect(s.running).toBe(true);

    await s.undo();
    expect(s.running).toBe(false);
  });

  it('RESTARTS the clock when a clock_stop is undone', async () => {
    const s = await running();
    await s.toggleClock();
    expect(s.running).toBe(false);

    await s.undo();
    expect(s.running).toBe(true);
  });

  it('says so when there is nothing to undo', async () => {
    const s = await opened();
    const res = await s.undo();

    expect(res.ok).toBe(false);
    expect(s.notice).toMatch(/nothing to undo/i);
  });

  it('reports a database refusal without putting the event back', async () => {
    // It is off the coach's board either way; what they need to know is that
    // the record still holds it.
    const s = await running();
    await s.append('plus', 'p1');
    undoStatEvent.mockResolvedValue({ ok: false, error: 'The database refused that undo.' });

    await s.undo();
    expect(kinds(s)).not.toContain('plus');
    expect(s.notice).toMatch(/refused/i);
  });
});

describe('the clock', () => {
  it('starts and stops', async () => {
    const s = await opened();
    await s.toggleClock();
    expect(kinds(s)).toContain('clock_start');

    await s.toggleClock();
    expect(kinds(s)).toContain('clock_stop');
    expect(s.running).toBe(false);
  });

  it('BRACKETS a change with a stop and a start', async () => {
    // The stop credits everyone on the pitch up to the OLD time and the start
    // resumes from the NEW one. Without it, winding forward hands every
    // player on the pitch minutes they did not play.
    const s = await running();
    await s.setClock(600);

    const tail = kinds(s).slice(-2);
    expect(tail).toEqual(['clock_stop', 'clock_start']);
    expect(s.clockBase).toBe(600);
  });

  it('does not bracket a change while it is already stopped', async () => {
    // There is nothing to credit anybody for.
    const s = await opened();
    await s.setClock(600);

    expect(kinds(s)).not.toContain('clock_stop');
    expect(s.clockBase).toBe(600);
  });

  it('refuses a negative time rather than counting backwards', async () => {
    const s = await opened();
    await s.setClock(-30);
    expect(s.clockBase).toBe(0);
  });

  it('reads as mm:ss', async () => {
    const s = await opened();
    await s.setClock(754);
    expect(s.clockText).toBe('12:34');
  });
});

describe('ending a period', () => {
  it('STOPS the clock first', async () => {
    // A half that ends with the clock running keeps crediting everyone on the
    // pitch with time they did not play, and nobody notices until the minutes
    // look wrong at full time.
    const s = await running();
    await s.endPeriod();

    expect(s.running).toBe(false);
    expect(kinds(s)).toContain('clock_stop');
  });

  it('moves to the next period', async () => {
    const s = await running();
    await s.endPeriod();

    expect(s.period).toBe(2);
    expect(kinds(s)).toContain('period');
  });
});

describe('arming an event', () => {
  it('arms, so the next tap records it', async () => {
    const s = await opened();
    s.arm('goal');
    expect(s.armed).toBe('goal');
  });

  it('disarms on a second press, cancelling a mis-press', async () => {
    const s = await opened();
    s.arm('goal');
    s.arm('goal');
    expect(s.armed).toBeNull();
  });
});

describe('opening a session', () => {
  it('opens the tracked match for the fixture', async () => {
    await opened();
    expect(openStatMatch).toHaveBeenCalledWith(TEAM, 's1', MATCH, 'vs Redlands');
  });

  it('reads back what was already recorded', async () => {
    fetchStatEvents.mockResolvedValue([
      { id: 'e1', kind: 'clock_start', player_id: null, at_seconds: 0, period: 1 },
      { id: 'e2', kind: 'plus', player_id: 'p1', at_seconds: 300, period: 1 }
    ]);
    const s = await opened();

    expect(s.events).toHaveLength(2);
    expect(kinds(s)).toContain('plus');
  });

  it('picks the clock up where the log left it, not at zero', async () => {
    fetchStatEvents.mockResolvedValue([
      { id: 'e1', kind: 'clock_stop', player_id: null, at_seconds: 2400, period: 1 }
    ]);
    const s = await opened();

    expect(s.clockBase).toBe(2400);
  });

  it('refuses without an organization rather than opening nothing', async () => {
    const s = usePlusMinusStore();
    const res = await s.open(TEAM, null, MATCH);

    expect(res.ok).toBe(false);
    expect(openStatMatch).not.toHaveBeenCalled();
  });

  it('reports a refusal from the database', async () => {
    openStatMatch.mockResolvedValue({ ok: false, error: 'You must coach this team.' });
    const s = usePlusMinusStore();
    const res = await s.open(TEAM, 's1', MATCH);

    expect(res.error).toMatch(/must coach this team/i);
  });
});

describe('the figures on the board', () => {
  it('are replayed from the log rather than counted', async () => {
    // Which is what makes an undo correct everything downstream of it.
    const s = await running();
    await s.append('on', 'p1');
    await s.append('plus', 'p1');
    await s.append('plus', 'p1');
    await s.append('minus', 'p1');

    const stats = replay(orderEvents(s.events), ['p1']);
    expect(stats.get('p1')!.plus).toBe(2);
    expect(stats.get('p1')!.minus).toBe(1);
  });

  it('include a player who has not been on', async () => {
    // Same rule as the reports: the fringe players are the audience.
    const s = await running();
    const stats = replay(orderEvents(s.events), ['p1', 'p2']);

    expect(stats.has('p2')).toBe(true);
  });

  it('correct themselves after an undo', async () => {
    const s = await running();
    await s.append('on', 'p1');
    await s.append('plus', 'p1');
    await s.undo();

    expect(replay(orderEvents(s.events), ['p1']).get('p1')!.plus).toBe(0);
  });
});
