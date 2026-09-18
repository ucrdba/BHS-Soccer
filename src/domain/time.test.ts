/**
 * Times, as a coach reads and writes them.
 *
 * Stored as seconds, because comparing "10:00" against "4:30" as text puts the
 * slower one first.
 *
 * These assert the SAME rules the Supabase client already applies, verified
 * against it below. A parser that disagreed would score an identical time
 * against a different band depending on which app recorded it.
 */
import { describe, it, expect } from 'vitest';
import { formatSecondsAsTime, parseTimeToSeconds, formatTimeFor } from './time';

describe('formatSecondsAsTime', () => {
  it('reads seconds as minutes and seconds', () => {
    expect(formatSecondsAsTime(270)).toBe('4:30');
    expect(formatSecondsAsTime(65)).toBe('1:05');
  });

  it('pads the seconds, so 4:05 does not read as 4:5', () => {
    expect(formatSecondsAsTime(245)).toBe('4:05');
  });

  it('handles under a minute, and over ten', () => {
    expect(formatSecondsAsTime(45)).toBe('0:45');
    expect(formatSecondsAsTime(600)).toBe('10:00');
  });

  it('rounds fractional seconds rather than showing them', () => {
    expect(formatSecondsAsTime(270.4)).toBe('4:30');
  });

  it('is empty for a negative or unreadable value', () => {
    expect(formatSecondsAsTime('abc')).toBe('');
    expect(formatSecondsAsTime(-5)).toBe('');
  });

  it('renders zero as a time, since a zero-second result is still a result', () => {
    expect(formatSecondsAsTime(0)).toBe('0:00');
  });
});

describe('parseTimeToSeconds', () => {
  it('reads a colon time', () => {
    expect(parseTimeToSeconds('4:30')).toBe(270);
    expect(parseTimeToSeconds('10:00')).toBe(600);
  });

  it('reads a full stop as a colon', () => {
    // A stopwatch reads 4:30 and a coach reaches for whichever key is nearer.
    expect(parseTimeToSeconds('4.30')).toBe(270);
  });

  it('does NOT read a full stop as decimal minutes', () => {
    // "4.30" is four minutes thirty, not four and a third. Reading it the
    // other way scores a player against the wrong band.
    expect(parseTimeToSeconds('4.30')).not.toBe(4.3);
    expect(parseTimeToSeconds('4.30')).not.toBe(258);
  });

  it('reads bare seconds', () => {
    expect(parseTimeToSeconds('270')).toBe(270);
    expect(parseTimeToSeconds(270)).toBe(270);
  });

  it('trims what was typed', () => {
    expect(parseTimeToSeconds('  4:30  ')).toBe(270);
  });

  it('refuses a single digit after the separator', () => {
    // "4:5" could be 4:05 or 4:50 and there is no way to tell, so it is
    // refused rather than resolved one way and scored.
    expect(parseTimeToSeconds('4:5')).toBeNull();
    expect(parseTimeToSeconds('4.5')).toBeNull();
  });

  it('refuses sixty seconds or more in the seconds place', () => {
    expect(parseTimeToSeconds('4:75')).toBeNull();
    expect(parseTimeToSeconds('4:60')).toBeNull();
  });

  it('returns null rather than guessing at nonsense', () => {
    expect(parseTimeToSeconds('')).toBeNull();
    expect(parseTimeToSeconds('fast')).toBeNull();
    expect(parseTimeToSeconds('4:30:15')).toBeNull();
    expect(parseTimeToSeconds(null)).toBeNull();
  });

  it('round-trips every time it accepts', () => {
    for (const s of [0, 45, 245, 270, 600]) {
      expect(parseTimeToSeconds(formatSecondsAsTime(s)), String(s)).toBe(s);
    }
  });
});

describe('agreement with the Supabase client', () => {
  /**
   * The same inputs through both implementations.
   *
   * They must not drift: the legacy app records times through the client and
   * the Vue app through this module, and the same stopwatch reading has to
   * earn the same band either way.
   */
  it('parses identically', async () => {
    const { supabaseService } = await import('../data/supabase');
    const inputs = ['4:30', '4.30', '270', '0:00', '4:5', '4.5', '4:75',
                    'fast', '', '  4:30  ', '10:00', '4:30:15'];

    for (const raw of inputs) {
      expect(parseTimeToSeconds(raw), JSON.stringify(raw))
        .toEqual(supabaseService.parseTimeToSeconds(raw));
    }
  });

  it('formats identically', async () => {
    const { supabaseService } = await import('../data/supabase');
    for (const s of [0, 45, 245, 270, 600, 270.4, -5, NaN]) {
      expect(formatSecondsAsTime(s), String(s))
        .toEqual(supabaseService.formatSecondsAsTime(s));
    }
  });
});

describe('formatTimeFor', () => {
  // A sprint (time_low) is stored in decimal seconds, a banded run (time_bands)
  // in whole seconds read as m:ss. Formatting a 5.05s sprint as m:ss gave
  // "0:05" on every screen, and "5.40 to 5.05" read "0:05 to 0:05".
  it('shows a sprint as decimal seconds, to the hundredth', () => {
    expect(formatTimeFor(5.05, 'time_low')).toBe('5.05s');
    expect(formatTimeFor(5.1, 'time_low')).toBe('5.10s');
    expect(formatTimeFor(12, 'time_low')).toBe('12.00s');
  });

  it('keeps the hundredths of an average rather than rounding them away', () => {
    expect(formatTimeFor(5.1234, 'time_low')).toBe('5.12s');
  });

  it('shows a banded run as minutes and seconds', () => {
    expect(formatTimeFor(270, 'time_bands')).toBe('4:30');
  });

  it('reads an unknown measure as minutes and seconds, as before', () => {
    expect(formatTimeFor(270, undefined)).toBe('4:30');
  });

  it('is empty for no value', () => {
    expect(formatTimeFor(null, 'time_low')).toBe('');
    expect(formatTimeFor('x', 'time_low')).toBe('');
  });
});
