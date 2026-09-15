/**
 * A position is the soccer position number 1-11, and this module is the only
 * place that knows what the numbers mean: 1 goalkeeper, 2-6 defence, 7-11
 * attack. There is no midfield role.
 */
import { describe, it, expect } from 'vitest';
import {
  POSITIONS, isPosition, roleOfPosition, roleLabel, positionOptionLabel,
  positionCardLabel, positionBioLabel, toPosition, parsePositionCell
} from './position';

describe('the numbers', () => {
  it('are 1 to 11', () => {
    expect(POSITIONS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('accept only whole numbers 1-11', () => {
    expect([1, 6, 7, 11].every(isPosition)).toBe(true);
    expect([0, 12, 1.5, -1, NaN, '4', null, undefined].some(isPosition)).toBe(false);
  });
});

describe('roleOfPosition', () => {
  it('1 is the goalkeeper, 2-6 defence, 7-11 attack', () => {
    expect(POSITIONS.map(roleOfPosition)).toEqual([
      'keeper', 'defend', 'defend', 'defend', 'defend', 'defend',
      'attack', 'attack', 'attack', 'attack', 'attack'
    ]);
  });

  it('has no role for anything that is not a position', () => {
    for (const v of [null, undefined, 0, 12, 1.5]) expect(roleOfPosition(v as any)).toBeNull();
  });
});

describe('labels', () => {
  it('names each role', () => {
    expect([roleLabel('keeper'), roleLabel('defend'), roleLabel('attack')])
      .toEqual(['Goalkeeper', 'Defence', 'Attack']);
  });

  it('labels a picker option with its number and role', () => {
    expect([1, 4, 9].map(positionOptionLabel)).toEqual(['1 · Goalkeeper', '4 · Defence', '9 · Attack']);
  });

  it('labels the card and the bio, and says nothing for no position', () => {
    expect(positionCardLabel(4)).toBe('Defence (4)');
    expect(positionBioLabel(9)).toBe('Position 9 · Attack');
    expect(positionCardLabel(null)).toBe('');
    expect(positionBioLabel(undefined)).toBe('');
  });
});

describe('toPosition', () => {
  it('reads a number or numeric text, and nothing else', () => {
    expect([toPosition(4), toPosition('4'), toPosition(' 11 ')]).toEqual([4, 4, 11]);
    for (const v of ['FB', '', null, undefined, 12, '1.5']) expect(toPosition(v)).toBeNull();
  });
});

describe('parsePositionCell', () => {
  it('treats a blank cell as no position', () => {
    for (const v of ['', '   ', null, undefined]) expect(parsePositionCell(v)).toEqual({ ok: true, position: null });
  });

  it('accepts 1-11 as a number or text', () => {
    expect(parsePositionCell(4)).toEqual({ ok: true, position: 4 });
    expect(parsePositionCell('4')).toEqual({ ok: true, position: 4 });
    expect(parsePositionCell(' 11 ')).toEqual({ ok: true, position: 11 });
  });

  it('refuses anything else, rather than guessing', () => {
    for (const v of ['FB', 'Goalkeeper', 12, '0', '1.5', 'four']) expect(parsePositionCell(v)).toEqual({ ok: false });
  });
});
