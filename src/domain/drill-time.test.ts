/**
 * The start / end / duration arithmetic behind a drill's slot.
 *
 * It is three-way, and that is the whole difficulty: typing a start and an
 * end fills the duration, picking a duration fills the end, and either edit
 * has to leave the third field agreeing with the other two. A form where the
 * duration says 20 min and the times say fifteen prints a plan a coach cannot
 * run against a watch.
 */
import { describe, it, expect } from 'vitest';
import {
  slotFromRange, endFromDuration, nextDrillStart, DURATION_PRESETS
} from './drill-time';

describe('a slot from a start and an end', () => {
  it('reads the duration out of the range', () => {
    expect(slotFromRange('16:00', '16:20')).toEqual({
      slot: '4:00 PM - 4:20 PM', duration: '20 min', minutes: 20
    });
  });

  it('displays the slot in twelve-hour time, which is what gets printed', () => {
    expect(slotFromRange('09:05', '09:35').slot).toBe('9:05 AM - 9:35 AM');
  });

  it('rolls over midnight rather than going negative', () => {
    // An end before the start is the next day, not a drill of minus 23 hours.
    expect(slotFromRange('23:40', '00:10').minutes).toBe(30);
  });

  it('gives nothing back when either end is missing', () => {
    expect(slotFromRange('', '16:20')).toBeNull();
    expect(slotFromRange('16:00', '')).toBeNull();
  });

  it('gives nothing back for text that is not a time', () => {
    expect(slotFromRange('soon', '16:20')).toBeNull();
  });
});

describe('an end from a start and a duration', () => {
  it('adds the minutes to the start', () => {
    expect(endFromDuration('16:00', '20 min')).toBe('16:20');
  });

  it('reads a bare number as minutes', () => {
    expect(endFromDuration('16:00', '45')).toBe('16:45');
  });

  it('wraps past midnight', () => {
    expect(endFromDuration('23:50', '30 min')).toBe('00:20');
  });

  it('returns 24-hour text, because that is what a time input holds', () => {
    // The input element only accepts HH:MM; handing it "4:20 PM" clears it.
    expect(endFromDuration('16:00', '20 min')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('gives nothing back without a readable start or duration', () => {
    expect(endFromDuration('', '20 min')).toBeNull();
    expect(endFromDuration('16:00', 'a while')).toBeNull();
  });
});

describe('where the next drill starts', () => {
  it('picks up where the last one ended', () => {
    // A coach adding a drill means "and then this", not "at four o'clock".
    expect(nextDrillStart([
      { name: 'A', time: '4:00 PM - 4:20 PM', duration: '20 min', coachNotes: '' }
    ])).toBe('16:20');
  });

  it('starts an empty plan at 4:00 PM', () => {
    // Practice is after school.
    expect(nextDrillStart([])).toBe('16:00');
  });

  it('falls back to 4:00 PM when the last drill has no readable slot', () => {
    expect(nextDrillStart([
      { name: 'A', time: '', duration: '20 min', coachNotes: '' }
    ])).toBe('16:00');
  });
});

describe('the duration presets', () => {
  it('are the ones a session is actually built from', () => {
    expect(DURATION_PRESETS).toContain('20 min');
    expect(DURATION_PRESETS).toContain('45 min');
  });

  it('do not include a custom entry, which is the form\'s business', () => {
    // The picker adds "custom" itself; a preset list containing it would
    // offer to set a drill's duration to the word "custom".
    expect(DURATION_PRESETS).not.toContain('custom');
  });
});
