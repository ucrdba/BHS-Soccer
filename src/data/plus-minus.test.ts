/**
 * Plus/minus, replayed from events.
 *
 * The rules with real consequences:
 *
 *   Goal differential is CONVENTIONAL — our goal is +1 to everyone on the
 *   pitch, theirs is −1. The spec as first written had it inverted, which
 *   would have given the best defenders the highest number for conceding most
 *   and looked entirely plausible for a whole season.
 *
 *   Playing time only accrues while the clock is RUNNING and only for players
 *   who are ON. Both halves of that matter: time counted through half time
 *   flatters everyone equally and hides nothing, but time counted for a player
 *   on the bench is a lie about that player.
 *
 *   Goal differential is computed from who was on AT THAT MOMENT, so a
 *   substitution made a minute late corrects every goal it touched once fixed.
 */

import { describe, it, expect } from 'vitest';
import {
  replay, replayTo, orderEvents, onPitch, clockRunning, currentPeriod,
  scoreLine, formatClock, minutesPlayed, type StatEvent
} from './plus-minus';

const ev = (kind: any, over: Partial<StatEvent> = {}): StatEvent =>
  ({ kind, atSeconds: 0, ...over });

const of = (map: Map<string, any>, id: string) => map.get(id)!;

describe('the statistician\'s plus and minus', () => {
  it('counts each tap', () => {
    const s = replay([
      ev('plus', { playerId: 'p1' }),
      ev('plus', { playerId: 'p1' }),
      ev('minus', { playerId: 'p1' })
    ]);
    expect(of(s, 'p1').plus).toBe(2);
    expect(of(s, 'p1').minus).toBe(1);
  });

  it('scores it as plus minus minus', () => {
    const s = replay([
      ev('plus', { playerId: 'p1' }), ev('plus', { playerId: 'p1' }),
      ev('minus', { playerId: 'p1' })
    ]);
    expect(of(s, 'p1').score).toBe(1);
  });

  it('goes negative when there are more minuses', () => {
    const s = replay([ev('minus', { playerId: 'p1' }), ev('minus', { playerId: 'p1' })]);
    expect(of(s, 'p1').score).toBe(-2);
  });

  it('keeps players separate', () => {
    const s = replay([ev('plus', { playerId: 'p1' }), ev('minus', { playerId: 'p2' })]);
    expect(of(s, 'p1').score).toBe(1);
    expect(of(s, 'p2').score).toBe(-1);
  });

  it('lists a player who did nothing, with zeroes', () => {
    // A sheet missing a player reads as a bug, not as a quiet day.
    const s = replay([], ['p1', 'p2']);
    expect(s.size).toBe(2);
    expect(of(s, 'p1').score).toBe(0);
  });
});

describe('goal differential', () => {
  const onTwo = [
    ev('on', { playerId: 'p1' }),
    ev('on', { playerId: 'p2' })
  ];

  it('rises for everyone on the pitch when WE score', () => {
    const s = replay([...onTwo, ev('goal_for', { atSeconds: 60 })]);
    expect(of(s, 'p1').goalDiff).toBe(1);
    expect(of(s, 'p2').goalDiff).toBe(1);
  });

  it('falls for everyone on the pitch when THEY score', () => {
    const s = replay([...onTwo, ev('goal_against', { atSeconds: 60 })]);
    expect(of(s, 'p1').goalDiff).toBe(-1);
  });

  it('is not the inverted version the spec first described', () => {
    // Written the other way round, a defender who conceded five would finish
    // the season top of the list.
    const s = replay([...onTwo, ev('goal_against', { atSeconds: 60 })]);
    expect(of(s, 'p1').goalDiff).toBeLessThan(0);
  });

  it('leaves a substitute out of it', () => {
    const s = replay([
      ev('on', { playerId: 'p1' }),
      ev('goal_for', { atSeconds: 60 })
    ], ['p1', 'p2']);
    expect(of(s, 'p2').goalDiff).toBe(0);
  });

  it('follows who was on AT THAT MOMENT, not who is on now', () => {
    // The reason the differential is derived rather than stored: a player who
    // came off before the goal must not be credited with it.
    const s = replay([
      ev('on', { playerId: 'p1' }),
      ev('off', { playerId: 'p1', atSeconds: 30 }),
      ev('on', { playerId: 'p2', atSeconds: 30 }),
      ev('goal_for', { atSeconds: 60 })
    ]);
    expect(of(s, 'p1').goalDiff).toBe(0);
    expect(of(s, 'p2').goalDiff).toBe(1);
  });

  it('nets out across a match', () => {
    const s = replay([
      ...onTwo,
      ev('goal_for', { atSeconds: 60 }),
      ev('goal_against', { atSeconds: 120 }),
      ev('goal_for', { atSeconds: 180 })
    ]);
    expect(of(s, 'p1').goalDiff).toBe(1);
  });
});

describe('playing time', () => {
  it('accrues while a player is on and the clock runs', () => {
    const s = replay([
      ev('clock_start'), ev('on', { playerId: 'p1' }),
      ev('clock_stop', { atSeconds: 600 })
    ]);
    expect(of(s, 'p1').secondsPlayed).toBe(600);
  });

  it('does not accrue while the clock is stopped', () => {
    // Half time is not playing time.
    const s = replay([
      ev('clock_start'), ev('on', { playerId: 'p1' }),
      ev('clock_stop', { atSeconds: 600 }),
      ev('clock_start', { atSeconds: 600 }),
      ev('clock_stop', { atSeconds: 900 })
    ]);
    expect(of(s, 'p1').secondsPlayed).toBe(900);
  });

  it('does not accrue before the clock ever starts', () => {
    const s = replay([ev('on', { playerId: 'p1' }), ev('clock_start', { atSeconds: 300 }),
                      ev('clock_stop', { atSeconds: 600 })]);
    expect(of(s, 'p1').secondsPlayed).toBe(300);
  });

  it('stops when the player comes off', () => {
    const s = replay([
      ev('clock_start'), ev('on', { playerId: 'p1' }),
      ev('off', { playerId: 'p1', atSeconds: 300 }),
      ev('clock_stop', { atSeconds: 900 })
    ]);
    expect(of(s, 'p1').secondsPlayed).toBe(300);
  });

  it('gives a substitute only their time on', () => {
    const s = replay([
      ev('clock_start'), ev('on', { playerId: 'p1' }),
      ev('off', { playerId: 'p1', atSeconds: 300 }),
      ev('on', { playerId: 'p2', atSeconds: 300 }),
      ev('clock_stop', { atSeconds: 900 })
    ]);
    expect(of(s, 'p1').secondsPlayed).toBe(300);
    expect(of(s, 'p2').secondsPlayed).toBe(600);
  });

  it('adds up two spells for the same player', () => {
    const s = replay([
      ev('clock_start'), ev('on', { playerId: 'p1' }),
      ev('off', { playerId: 'p1', atSeconds: 200 }),
      ev('on', { playerId: 'p1', atSeconds: 500 }),
      ev('clock_stop', { atSeconds: 800 })
    ]);
    expect(of(s, 'p1').secondsPlayed).toBe(500);
  });

  it('gives a player who never came on none at all', () => {
    const s = replay([ev('clock_start'), ev('clock_stop', { atSeconds: 900 })], ['p1']);
    expect(of(s, 'p1').secondsPlayed).toBe(0);
  });

  it('never counts an interval twice', () => {
    // Two events at the same instant must not each credit the same seconds.
    const s = replay([
      ev('clock_start'), ev('on', { playerId: 'p1' }),
      ev('plus', { playerId: 'p1', atSeconds: 300 }),
      ev('shot', { playerId: 'p1', atSeconds: 300 }),
      ev('clock_stop', { atSeconds: 600 })
    ]);
    expect(of(s, 'p1').secondsPlayed).toBe(600);
  });

  it('ticks forward to now without an event', () => {
    // What the live screen needs between substitutions.
    const s = replayTo([ev('clock_start'), ev('on', { playerId: 'p1' })], ['p1'], 450);
    expect(of(s, 'p1').secondsPlayed).toBe(450);
  });

  it('does not tick forward while paused', () => {
    const s = replayTo([
      ev('clock_start'), ev('on', { playerId: 'p1' }),
      ev('clock_stop', { atSeconds: 300 })
    ], ['p1'], 900);
    expect(of(s, 'p1').secondsPlayed).toBe(300);
  });
});

describe('shots, goals and assists', () => {
  it('counts each against its player', () => {
    const s = replay([
      ev('shot', { playerId: 'p1' }), ev('shot', { playerId: 'p1' }),
      ev('goal', { playerId: 'p1' }),
      ev('assist', { playerId: 'p2' })
    ]);
    expect(of(s, 'p1').shots).toBe(2);
    expect(of(s, 'p1').goals).toBe(1);
    expect(of(s, 'p2').assists).toBe(1);
  });

  it('keeps a player goal separate from the team goal', () => {
    // Scoring credits the scorer AND moves the differential of everyone on;
    // they are different events, so one can be corrected without the other.
    const s = replay([
      ev('on', { playerId: 'p1' }), ev('on', { playerId: 'p2' }),
      ev('goal_for', { atSeconds: 60 }),
      ev('goal', { playerId: 'p1', atSeconds: 60 })
    ]);
    expect(of(s, 'p1').goals).toBe(1);
    expect(of(s, 'p2').goals).toBe(0);
    expect(of(s, 'p2').goalDiff).toBe(1);
  });
});

describe('who is on the pitch', () => {
  it('lists them in the order they went on', () => {
    expect(onPitch([
      ev('on', { playerId: 'p1' }), ev('on', { playerId: 'p2' })
    ])).toEqual(['p1', 'p2']);
  });

  it('drops a player who came off', () => {
    expect(onPitch([
      ev('on', { playerId: 'p1' }), ev('on', { playerId: 'p2' }),
      ev('off', { playerId: 'p1', atSeconds: 10 })
    ])).toEqual(['p2']);
  });

  it('does not list a player twice if sent on twice', () => {
    expect(onPitch([
      ev('on', { playerId: 'p1' }), ev('on', { playerId: 'p1' })
    ])).toEqual(['p1']);
  });

  it('ignores taking off a player who was never on', () => {
    expect(() => onPitch([ev('off', { playerId: 'ghost' })])).not.toThrow();
    expect(onPitch([ev('off', { playerId: 'ghost' })])).toEqual([]);
  });
});

describe('the clock and the score', () => {
  it('knows the clock is running', () => {
    expect(clockRunning([ev('clock_start')])).toBe(true);
  });

  it('knows it stopped', () => {
    expect(clockRunning([ev('clock_start'), ev('clock_stop', { atSeconds: 10 })])).toBe(false);
  });

  it('starts stopped', () => {
    expect(clockRunning([])).toBe(false);
  });

  it('counts the score from team goals only', () => {
    const line = scoreLine([
      ev('goal_for'), ev('goal_for'), ev('goal_against'),
      ev('goal', { playerId: 'p1' })          // the scorer, not another goal
    ]);
    expect(line).toEqual({ for: 2, against: 1 });
  });

  it('tracks the period', () => {
    expect(currentPeriod([ev('period', { period: 2, atSeconds: 2700 })])).toBe(2);
  });

  it('starts in the first period', () => {
    expect(currentPeriod([])).toBe(1);
  });
});

describe('ordering', () => {
  it('replays by clock time, not arrival order', () => {
    // Events can be entered out of order when a statistician catches up.
    const ordered = orderEvents([
      ev('off', { playerId: 'p1', atSeconds: 300 }),
      ev('on', { playerId: 'p1', atSeconds: 0 })
    ]);
    expect(ordered[0].kind).toBe('on');
  });

  it('keeps events sharing a second in the order they arrived', () => {
    const ordered = orderEvents([
      ev('goal_for', { atSeconds: 60 }),
      ev('goal', { playerId: 'p1', atSeconds: 60 })
    ]);
    expect(ordered.map(e => e.kind)).toEqual(['goal_for', 'goal']);
  });

  it('gets the differential right even when a sub arrives late', () => {
    // Recorded after the goal but timed before it: the differential must
    // follow the clock, which is why it is derived.
    const s = replay([
      ev('on', { playerId: 'p1', atSeconds: 0 }),
      ev('goal_for', { atSeconds: 600 }),
      ev('off', { playerId: 'p1', atSeconds: 300 })
    ]);
    expect(of(s, 'p1').goalDiff).toBe(0);
  });
});

describe('reading the numbers', () => {
  it('shows the clock as mm:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(75)).toBe('1:15');
    expect(formatClock(2700)).toBe('45:00');
  });

  it('never shows a negative clock', () => {
    expect(formatClock(-5)).toBe('0:00');
  });

  it('reports whole minutes, because that is how coaches talk', () => {
    expect(minutesPlayed(0)).toBe(0);
    expect(minutesPlayed(600)).toBe(10);
  });

  it('rounds rather than truncating', () => {
    // 89 seconds is a minute and a half played, not one minute.
    expect(minutesPlayed(89)).toBe(1);
    expect(minutesPlayed(91)).toBe(2);
  });
});
