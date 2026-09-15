/**
 * What the session grid says about its own units, and what it counts.
 *
 * The two time measures look alike and are not: `4:30` is four minutes
 * thirty and `4.85` is four point eight five seconds. Reading one as the
 * other gives a figure that is wrong without looking wrong, so the screen
 * states which is expected rather than leaving the coach to infer it.
 */
import { describe, it, expect } from 'vitest';
import { entryFormat, entryTally } from './session-format';

describe('entryFormat', () => {
  it('names minutes and seconds for a banded exercise', () => {
    const f = entryFormat('time_bands');
    expect(f?.figure).toBe('m:ss');
    expect(f?.note).toMatch(/minutes and seconds/i);
    expect(f?.note).toContain('10:41');
  });

  it('names decimal seconds for a sprint, and says a colon is refused', () => {
    const f = entryFormat('time_low');
    expect(f?.figure).toBe('0.00');
    expect(f?.note).toMatch(/decimal seconds/i);
    expect(f?.note).toContain('4.85');
    expect(f?.note).toMatch(/colon/i);
  });

  it('names repetitions for a count', () => {
    const f = entryFormat('count_high');
    expect(f?.figure).toBe('count');
    expect(f?.note).toMatch(/whole numbers/i);
  });

  it('says nothing for a measure whose field is not typed', () => {
    // A win or loss is chosen, not typed, so a unit banner would be noise.
    expect(entryFormat('win_loss')).toBeNull();
    expect(entryFormat('head_to_head')).toBeNull();
    expect(entryFormat('')).toBeNull();
    expect(entryFormat('something_new')).toBeNull();
  });

  it('never confuses the two time measures', () => {
    expect(entryFormat('time_bands')!.figure).not.toBe(entryFormat('time_low')!.figure);
  });
});

describe('entryTally', () => {
  const players = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const row = (over: any = {}) => ({ value: '', outcome: '', attendance: 'present', ...over });

  it('counts what is timed, who is out, and what is left', () => {
    const entries = {
      a: row({ value: '10:41' }),
      b: row({ attendance: 'excused' }),
      c: row({ attendance: 'unexcused' }),
      d: row()
    } as any;
    expect(entryTally(players, entries, 'time_bands')).toEqual({ timed: 1, absent: 2, remaining: 1 });
  });

  it('reads a chosen result as recorded for an outcome measure', () => {
    const entries = { a: row({ outcome: 'win' }), b: row(), c: row(), d: row() } as any;
    expect(entryTally(players, entries, 'win_loss')).toEqual({ timed: 1, absent: 0, remaining: 3 });
  });

  it('does not count a value from a player who is not in the squad', () => {
    const entries = { a: row({ value: '9' }), zz: row({ value: '9' }) } as any;
    expect(entryTally(players, entries, 'count_high').timed).toBe(1);
  });

  it('never reports a negative remainder', () => {
    const entries = {
      a: row({ value: '1' }), b: row({ value: '2' }),
      c: row({ value: '3' }), d: row({ value: '4' })
    } as any;
    expect(entryTally(players, entries, 'count_high')).toEqual({ timed: 4, absent: 0, remaining: 0 });
  });

  it('counts nothing for nothing', () => {
    expect(entryTally([], {}, 'count_high')).toEqual({ timed: 0, absent: 0, remaining: 0 });
    expect(entryTally(null as any, null as any, 'count_high')).toEqual({ timed: 0, absent: 0, remaining: 0 });
  });
});

describe('the Goals-by-role banner', () => {
  it('shows the score shape and says whose side it is from', () => {
    const f = entryFormat('role_goals');
    expect(f?.figure).toBe('3-1');
    expect(f?.note).toMatch(/player's side/);
  });

  it('counts a typed score as recorded', () => {
    const t = entryTally(
      [{ id: 'p1' }, { id: 'p2' }],
      { p1: { playerId: 'p1', attendance: 'present', value: '3-1', outcome: '', role: 'attack' },
        p2: { playerId: 'p2', attendance: 'present', value: '', outcome: '', role: 'defend' } },
      'role_goals');
    expect(t).toEqual({ timed: 1, absent: 0, remaining: 1 });
  });
});
