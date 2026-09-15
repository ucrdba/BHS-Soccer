/**
 * The standards editor's drafts, turned into what save_goal_bands takes.
 *
 * Every refusal here is also made by the database; checking first lets the
 * editor say what is wrong beside the boxes, before a round trip.
 */
import { describe, it, expect } from 'vitest';
import { draftsToGoalBands, goalDraftsFromBands, emptyGoalDrafts, GOAL_ROLES } from './goal-bands-draft';

const d = (threshold: string, percent: string) => ({ threshold, percent });

describe('draftsToGoalBands', () => {
  it('turns percentages into factors and text into whole numbers', () => {
    expect(draftsToGoalBands({ base: [d('2', '50'), d(' -1 ', '12.5')], bonus: [d('5', '10')] })).toEqual({
      ok: true,
      bands: [
        { kind: 'base', threshold: 2, factor: 0.5 },
        { kind: 'base', threshold: -1, factor: 0.125 },
        { kind: 'bonus', threshold: 5, factor: 0.1 }
      ]
    });
  });

  it('skips an untouched blank row', () => {
    expect(draftsToGoalBands({ base: [d('', ''), d('1', '50')], bonus: [d('  ', '')] }))
      .toEqual({ ok: true, bands: [{ kind: 'base', threshold: 1, factor: 0.5 }] });
  });

  it('allows a role with no bands at all', () => {
    expect(draftsToGoalBands({ base: [], bonus: [] })).toEqual({ ok: true, bands: [] });
  });

  it('refuses a threshold that is not a whole number', () => {
    expect(draftsToGoalBands({ base: [d('1.5', '50')], bonus: [] })).toEqual({
      ok: false, error: '"1.5" is not a whole number. A threshold is a count of goals, like 2 or -1.'
    });
  });

  it('refuses a percentage outside 0-100, or missing', () => {
    expect(draftsToGoalBands({ base: [d('1', '150')], bonus: [] })).toEqual({
      ok: false, error: 'A percentage must be between 0 and 100 (found "150").'
    });
    expect(draftsToGoalBands({ base: [d('1', '')], bonus: [] })).toEqual({
      ok: false, error: 'A percentage must be between 0 and 100 (found "").'
    });
  });

  it('refuses two bands in one list at one threshold', () => {
    expect(draftsToGoalBands({ base: [d('1', '50'), d('1', '30')], bonus: [] })).toEqual({
      ok: false, error: 'Two goal-difference bands share the threshold 1. Two bands at one threshold cannot both apply.'
    });
  });

  it('refuses a top base plus top bonus over 100%', () => {
    expect(draftsToGoalBands({ base: [d('1', '70'), d('0', '20')], bonus: [d('3', '40')] })).toEqual({
      ok: false,
      error: 'The top goal-difference band (70%) and the top bonus band (40%) add up to more than 100% of the weight. Lower one of them.'
    });
  });

  it('accepts exactly 100%', () => {
    expect(draftsToGoalBands({ base: [d('1', '80')], bonus: [d('3', '20')] }).ok).toBe(true);
  });
});

describe('goalDraftsFromBands', () => {
  it('splits stored bands by role and kind, as percentages, highest first', () => {
    const drafts = goalDraftsFromBands([
      { role: 'attack', kind: 'base', threshold: 0, factor: '0.250' },
      { role: 'attack', kind: 'base', threshold: 2, factor: 0.5 },
      { role: 'defend', kind: 'bonus', threshold: 0, factor: 0.4 }
    ]);
    expect(drafts.attack.base).toEqual([d('2', '50'), d('0', '25')]);
    expect(drafts.defend.bonus).toEqual([d('0', '40')]);
    expect(drafts.keeper).toEqual({ base: [], bonus: [] });
  });

  it('starts every role empty', () => {
    expect(emptyGoalDrafts()).toEqual({
      attack: { base: [], bonus: [] }, defend: { base: [], bonus: [] }, keeper: { base: [], bonus: [] }
    });
    expect(GOAL_ROLES).toEqual(['attack', 'defend', 'keeper']);
  });
});
