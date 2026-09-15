/**
 * A Goals-by-role score is typed in one box, from the player's side.
 *
 * Refusing is the point: "3" could be three scored or three given up, and a
 * guess would score a defender as an attacker's result without anyone seeing.
 */
import { describe, it, expect } from 'vitest';
import { parseGoalScore, formatGoalScore, formatGoalDifference } from './goal-score';

describe('parseGoalScore', () => {
  it.each([
    ['3-1', 3, 1], ['3:1', 3, 1], ['3 1', 3, 1], [' 3 - 1 ', 3, 1],
    ['0-0', 0, 0], ['12-11', 12, 11], ['99-0', 99, 0], ['3  1', 3, 1]
  ])('reads %j as scored %i, gave up %i', (text, scored, conceded) => {
    expect(parseGoalScore(text)).toEqual({ scored, conceded });
  });

  it.each(['', '3', '3-', '-1', 'a-b', '3-1-2', '100-0', '3.5-1', null, undefined])(
    'refuses %j', (text) => {
      expect(parseGoalScore(text)).toBeNull();
    });
});

describe('formatting', () => {
  it('writes a score the way it is typed', () => {
    expect(formatGoalScore({ scored: 3, conceded: 1 })).toBe('3-1');
    expect(formatGoalScore(null)).toBe('');
  });

  it('signs a positive goal difference and leaves zero and negatives alone', () => {
    expect(formatGoalDifference(2)).toBe('+2');
    expect(formatGoalDifference(0)).toBe('0');
    expect(formatGoalDifference(-1)).toBe('-1');
  });
});
