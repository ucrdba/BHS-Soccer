/**
 * Why a player's number is what it is.
 *
 * A breakdown answers "where did those points come from?", so every row is
 * phrased for the exercise it came from. The distinctions below are not
 * cosmetic: a time read as a bare number looks like points earned, which is
 * the column next to it, and "no-show" and "not entered" tell a coach to do
 * two different things.
 */
import { describe, it, expect } from 'vitest';
import { breakdownDetail, resultVerdict, resultLabel } from './matrix-breakdown';

const names = new Map([['p2', 'Tom Budde'], ['p3', 'Alain Renteria']]);
const drills = [
  { id: 'd-laps', measure: 'time_low' },
  { id: 'd-coopers', measure: 'count_high' }
];

const detail = (row: any) => breakdownDetail(row, names, drills);

describe('a head-to-head result', () => {
  it('names who they beat', () => {
    expect(detail({ kind: 'head_to_head', detail: 'win', opponent_id: 'p2' }))
      .toBe('beat Tom Budde');
  });

  it('names who beat them', () => {
    expect(detail({ kind: 'head_to_head', detail: 'loss', opponent_id: 'p2' }))
      .toBe('lost to Tom Budde');
  });

  it('names a draw', () => {
    expect(detail({ kind: 'head_to_head', detail: 'draw', opponent_id: 'p3' }))
      .toBe('drew with Alain Renteria');
  });

  it('copes with an opponent no longer on the roster', () => {
    expect(detail({ kind: 'head_to_head', detail: 'win', opponent_id: 'gone' }))
      .toBe('beat an opponent');
  });
});

describe('a small-sided result', () => {
  it('says only the outcome, since there is no single opponent', () => {
    expect(detail({ kind: 'win_loss', detail: 'win' })).toBe('won');
    expect(detail({ kind: 'win_loss', detail: 'draw' })).toBe('drew');
    expect(detail({ kind: 'win_loss', detail: 'loss' })).toBe('lost');
  });
});

describe('an absence, versus an omission', () => {
  it('calls a recorded absence a no-show', () => {
    expect(detail({ kind: 'absent' })).toBe('no-show');
  });

  it('calls a missing row not entered', () => {
    // Different from a no-show: nobody marked them absent, they were simply
    // never given a row. Naming it tells the coach to go back and fill it in.
    expect(detail({ kind: 'not_entered' })).toBe('not entered');
  });
});

describe('a timed result against bands', () => {
  const band = (over: any = {}) =>
    ({ kind: 'time_band', raw_value: 250, earned: 1, available: 1, ...over });

  it('shows the time AND what it earned', () => {
    // The whole question a breakdown answers is "why that number?".
    expect(detail(band())).toBe('4:10 — earned 1 of the exercise');
  });

  it('shows a partial share as it was earned', () => {
    expect(detail(band({ earned: 0.5, available: 1 }))).toBe('4:10 — earned 0.5 of the exercise');
  });

  it('says outright when a time met no standard', () => {
    expect(detail(band({ earned: 0, available: 1, raw_value: 400 })))
      .toBe('6:40 — met no standard');
  });

  it('does not divide by an absent denominator', () => {
    expect(() => detail(band({ available: 0 }))).not.toThrow();
    expect(detail(band({ earned: 0, available: 0 }))).toContain('met no standard');
  });
});

describe('a measured result', () => {
  it('formats a timed exercise as a time', () => {
    // 250 read as a bare number looks like points earned.
    expect(detail({ kind: 'measured', drill_id: 'd-laps', raw_value: 250 })).toBe('4:10');
  });

  it('leaves a counted exercise as a number', () => {
    // Both arrive as 'measured'; only the drill knows which it is, and 2800
    // metres and 2800 seconds want very different formatting.
    expect(detail({ kind: 'measured', drill_id: 'd-coopers', raw_value: 2800 })).toBe('2800');
  });

  it('says they took part when there is no value at all', () => {
    expect(detail({ kind: 'measured', drill_id: 'd-coopers', raw_value: null }))
      .toBe('took part');
  });

  it('treats a drill it cannot find as counted rather than timed', () => {
    expect(detail({ kind: 'measured', drill_id: 'gone', raw_value: 42 })).toBe('42');
  });
});

describe('resultVerdict', () => {
  const log = (outcome: string) =>
    ({ player_a_id: 'p1', player_b_id: 'p2', outcome });

  it('resolves a stored position into a winner', () => {
    // 'a' and 'b' name a column, not a person.
    expect(resultVerdict(log('a')).winnerId).toBe('p1');
    expect(resultVerdict(log('b')).winnerId).toBe('p2');
  });

  it('names the loser too, so the panel need not work it out', () => {
    expect(resultVerdict(log('a')).loserId).toBe('p2');
  });

  it('marks a draw with no winner rather than an arbitrary one', () => {
    const v = resultVerdict(log('draw'));
    expect(v.drew).toBe(true);
    expect(v.winnerId).toBeNull();
    expect(v.loserId).toBeNull();
  });

  it('keeps both ids either way, for rendering the pair', () => {
    const v = resultVerdict(log('draw'));
    expect(v.aId).toBe('p1');
    expect(v.bId).toBe('p2');
  });
});

describe('resultLabel', () => {
  const byId = new Map<string, any>([
    ['p1', { id: 'p1', name: 'Cesar Alva', recordingNumber: 7 }],
    ['p2', { id: 'p2', name: 'Tom Budde', recordingNumber: null }]
  ]);

  it('uses the RECORDING number, not the shirt', () => {
    // The Matrix is read alongside paper sheets, which carry recording
    // numbers, and 0021 cleared the shirt number for the whole squad.
    expect(resultLabel('p1', byId)).toBe('(7) Cesar Alva');
  });

  it('omits the number when there is none', () => {
    expect(resultLabel('p2', byId)).toBe('Tom Budde');
  });

  it('says a player has been removed rather than showing a blank', () => {
    expect(resultLabel('gone', byId)).toBe('(removed player)');
  });
});

describe('a Goals-by-role result', () => {
  it('reads role, score, goal difference and the two shares', () => {
    expect(detail({ kind: 'role_goals', role: 'attack', goals_for: 3, goals_against: 1,
      base_factor: '0.500', bonus_factor: '0.100', raw_value: 2 }))
      .toBe('Attack · 3-1 (+2) · 50% + 10%');
  });

  it('signs nothing for an even game and names a defender in roster words', () => {
    expect(detail({ kind: 'role_goals', role: 'defend', goals_for: 1, goals_against: 1,
      base_factor: 0.6, bonus_factor: 0, raw_value: 0 }))
      .toBe('Defence · 1-1 (0) · 60% + 0%');
  });
});
