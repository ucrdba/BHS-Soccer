/**
 * Matrix session entry.
 *
 * Two rules a coach notices at once: a player with no recording number sorts
 * last whichever way the column is pointed, and a timed exercise defaults
 * everyone to absent rather than present -- because a time that was never run
 * is not a slow time, and defaulting to present would silently award the
 * bottom band to a player who was not there.
 */
import { describe, it, expect } from 'vitest';
import {
  compareSessionPlayers, defaultSessionAttendance, isTimedExercise
} from './matrix-session';

const p = (name: string, recordingNumber: any) => ({ name, recordingNumber });

describe('compareSessionPlayers', () => {
  it('orders by recording number by default', () => {
    expect(compareSessionPlayers(p('Budde', 4), p('Alva', 1), '', false))
      .toBeGreaterThan(0);
  });

  it('sorts an unnumbered player last, in both directions', () => {
    expect(compareSessionPlayers(p('Nobody', null), p('Alva', 1), '', false))
      .toBeGreaterThan(0);
    expect(compareSessionPlayers(p('Nobody', null), p('Alva', 1), '', true))
      .toBeGreaterThan(0);
  });

  it('orders by name when asked', () => {
    expect(compareSessionPlayers(p('Alva', 9), p('Budde', 1), 'name', false))
      .toBeLessThan(0);
  });

  it('reverses a name sort', () => {
    expect(compareSessionPlayers(p('Alva', 9), p('Budde', 1), 'name', true))
      .toBeGreaterThan(0);
  });

  it('falls back to the name when two players share a number', () => {
    expect(compareSessionPlayers(p('Alva', 3), p('Budde', 3), '', false))
      .toBeLessThan(0);
  });
});

describe('defaultSessionAttendance', () => {
  it('defaults a timed exercise to absent', () => {
    expect(defaultSessionAttendance('time_low')).toBe('unexcused');
    expect(defaultSessionAttendance('time_bands')).toBe('unexcused');
  });

  it('defaults a counted exercise to present', () => {
    expect(defaultSessionAttendance('count_high')).toBe('present');
    expect(defaultSessionAttendance('win_loss')).toBe('present');
  });
});

describe('isTimedExercise', () => {
  const bank = [
    { id: 'd1', measure: 'time_low' },
    { id: 'd2', measure: 'count_high' },
    { id: 'd3', measure: 'time_bands' }
  ];

  it('is true for both timed measures', () => {
    expect(isTimedExercise({ drill_id: 'd1' }, bank)).toBe(true);
    expect(isTimedExercise({ drill_id: 'd3' }, bank)).toBe(true);
  });

  it('is false for a counted measure', () => {
    expect(isTimedExercise({ drill_id: 'd2' }, bank)).toBe(false);
  });

  it('is false for a drill no longer in the bank', () => {
    expect(isTimedExercise({ drill_id: 'gone' }, bank)).toBe(false);
  });
});
