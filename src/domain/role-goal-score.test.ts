/**
 * What a Goals-by-role score earns, in the browser.
 *
 * A second implementation of 0037's `role_scored` CTE, kept so the sheet can
 * show the points as a score is typed. The agreement block runs the SAME cases
 * the database test runs (role-goal-cases.ts): the two cannot drift silently.
 */
import { describe, it, expect } from 'vitest';
import { roleGoalFactor, roleGoalFeedback, goalBandExample, percentLabel } from './role-goal-score';
import { ROLE_GOAL_CASES } from './role-goal-cases';

const ATTACK = [
  { role: 'attack', kind: 'base', threshold: 1, factor: 0.5 },
  { role: 'attack', kind: 'bonus', threshold: 3, factor: 0.1 }
];

describe('agreement with the database (shared cases)', () => {
  it.each(ROLE_GOAL_CASES)('$name', (c) => {
    const got = roleGoalFactor({ scored: c.scored, conceded: c.conceded }, c.role, c.bands);
    expect(got.hasStandards).toBe(c.expected.hasStandards);
    expect(got.base).toBeCloseTo(c.expected.base, 9);
    expect(got.bonus).toBeCloseTo(c.expected.bonus, 9);
    expect(got.total).toBeCloseTo(c.expected.total, 9);
  });
});

describe('roleGoalFactor', () => {
  it('reads thresholds and factors held as strings', () => {
    const bands = [{ role: 'attack', kind: 'base', threshold: '1', factor: '0.500' }];
    expect(roleGoalFactor({ scored: 2, conceded: 1 }, 'attack', bands).base).toBe(0.5);
  });

  it('earns nothing, but still reports the standards, for no score', () => {
    expect(roleGoalFactor(null, 'attack', ATTACK)).toEqual({ base: 0, bonus: 0, total: 0, hasStandards: true });
  });

  it('has no standards without a role', () => {
    expect(roleGoalFactor({ scored: 3, conceded: 1 }, null, ATTACK).hasStandards).toBe(false);
  });

  it('does not print floating-point noise in the total', () => {
    const bands = [
      { role: 'defend', kind: 'base', threshold: 0, factor: 0.7 },
      { role: 'defend', kind: 'bonus', threshold: 0, factor: 0.1 }
    ];
    expect(roleGoalFactor({ scored: 0, conceded: 0 }, 'defend', bands).total).toBe(0.8);
  });
});

describe('percentLabel', () => {
  it('writes a factor as a percentage without spurious places', () => {
    expect(percentLabel(0.5)).toBe('50%');
    expect(percentLabel(0.125)).toBe('12.5%');
    expect(percentLabel(0)).toBe('0%');
  });
});

describe('roleGoalFeedback', () => {
  it('says nothing for an empty box', () => {
    expect(roleGoalFeedback('', 'attack', ATTACK, 3)).toEqual({ text: '', tone: 'empty' });
  });

  it('shows base, bonus, total and points', () => {
    expect(roleGoalFeedback('3-1', 'attack', ATTACK, 3))
      .toEqual({ text: '50% + 10% = 60% · 1.8 pts', tone: 'good' });
  });

  it('names an unreadable score before the save does', () => {
    expect(roleGoalFeedback('3', 'attack', ATTACK, 3)).toEqual({ text: 'score? e.g. 3-1', tone: 'bad' });
  });

  it('asks for a role when there is none', () => {
    expect(roleGoalFeedback('3-1', '', ATTACK, 3)).toEqual({ text: 'choose a role', tone: 'bad' });
  });

  it('says when the squad has no standards for the role', () => {
    expect(roleGoalFeedback('1-0', 'keeper', ATTACK, 3))
      .toEqual({ text: 'no standards for Goalkeeper', tone: 'none' });
  });

  it('distinguishes met nothing from mistyped', () => {
    expect(roleGoalFeedback('0-4', 'attack', ATTACK, 3))
      .toEqual({ text: '0% + 0% = 0% · 0 pts', tone: 'none' });
  });
});

describe('goalBandExample', () => {
  it("works an attacker's example from the tab's own top bands", () => {
    const bands = [
      { role: 'attack', kind: 'base', threshold: 2, factor: 0.5 },
      { role: 'attack', kind: 'base', threshold: 0, factor: 0.2 },
      { role: 'attack', kind: 'bonus', threshold: 5, factor: 0.1 }
    ];
    expect(goalBandExample('attack', bands)).toBe('+2 with 5 scored → 50% + 10% = 60%');
  });

  it("works a defender's example on goals given up", () => {
    const bands = [
      { role: 'defend', kind: 'base', threshold: 0, factor: 0.6 },
      { role: 'defend', kind: 'bonus', threshold: 1, factor: 0.2 }
    ];
    expect(goalBandExample('defend', bands)).toBe('0 with 1 given up → 60% + 20% = 80%');
  });

  it('asks for a goal-difference band when a role has none', () => {
    expect(goalBandExample('keeper', ATTACK)).toBe('Add a goal-difference band to score Goalkeeper.');
  });
});
