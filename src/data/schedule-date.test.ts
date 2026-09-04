/**
 * Reading whatever a coach typed for a fixture date.
 *
 * Schedules arrive as spreadsheets other people made, so one column holds
 * "8-Dec", "09/Dec", "Dec 8 2026", "12/8/2026", a real Excel date and an Excel
 * serial number — all meaning a day, none written the way this app stores one.
 *
 * The output has to be "MON D YYYY", because that is what parse_match_date()
 * in migration 0008 reads to derive match_on. Anything else stores a fixture
 * whose real date is null, which then sorts and filters as though it had no
 * date at all — visible only much later, and not as an error.
 */

import { describe, it, expect } from 'vitest';
import { supabaseService } from './supabase';

const parse = (v: any, ref?: Date) => supabaseService.parseScheduleDate(v, ref);

/** A fixed "today" so year inference is deterministic. */
const SEP_2026 = new Date(2026, 8, 4);      // 4 September 2026

describe('the formats that prompted this', () => {
  it('reads "8-Dec"', () => {
    expect(parse('8-Dec', SEP_2026)).toBe('DEC 8 2026');
  });

  it('reads "09/Dec", keeping the leading zero as a day', () => {
    expect(parse('09/Dec', SEP_2026)).toBe('DEC 9 2026');
  });
});

describe('day-then-month', () => {
  it('accepts a space', () => {
    expect(parse('8 Dec', SEP_2026)).toBe('DEC 8 2026');
  });

  it('accepts a full month name', () => {
    expect(parse('8 December', SEP_2026)).toBe('DEC 8 2026');
  });

  it('accepts a two-digit year', () => {
    expect(parse('8-Dec-27', SEP_2026)).toBe('DEC 8 2027');
  });

  it('accepts a four-digit year', () => {
    expect(parse('8-Dec-2028', SEP_2026)).toBe('DEC 8 2028');
  });

  it('is case-insensitive', () => {
    expect(parse('8-DEC', SEP_2026)).toBe('DEC 8 2026');
    expect(parse('8-dec', SEP_2026)).toBe('DEC 8 2026');
  });
});

describe('month-then-day', () => {
  it('reads "Dec 8"', () => {
    expect(parse('Dec 8', SEP_2026)).toBe('DEC 8 2026');
  });

  it('reads "December 8, 2026", commas and all', () => {
    expect(parse('December 8, 2026', SEP_2026)).toBe('DEC 8 2026');
  });

  it('reads the house format back unchanged', () => {
    // Re-importing an export must not shift a single date.
    expect(parse('SEP 4 2026', SEP_2026)).toBe('SEP 4 2026');
  });
});

describe('numbers only', () => {
  it('reads 12/8/2026 as month first, US convention', () => {
    expect(parse('12/8/2026', SEP_2026)).toBe('DEC 8 2026');
  });

  it('reads a bare 12/8 the same way', () => {
    expect(parse('12/8', SEP_2026)).toBe('DEC 8 2026');
  });

  it('reads an ISO date', () => {
    expect(parse('2026-12-08', SEP_2026)).toBe('DEC 8 2026');
  });
});

describe('what a spreadsheet hands over', () => {
  it('reads a real Date', () => {
    expect(parse(new Date(2026, 11, 8), SEP_2026)).toBe('DEC 8 2026');
  });

  it('reads an Excel serial number', () => {
    // 8 December 2026 is 46365 days after Excel's 1899-12-30 epoch.
    const serial = Math.round(
      (Date.UTC(2026, 11, 8) - Date.UTC(1899, 11, 30)) / 86400000);
    expect(parse(serial, SEP_2026)).toBe('DEC 8 2026');
  });

  it('does not mistake a small number for a serial date', () => {
    expect(parse(0, SEP_2026)).toBeNull();
  });
});

describe('working out the year when none is written', () => {
  /**
   * A season spans the new year, so "Dec" and "Feb" in one sheet belong to
   * different years. The rule is whichever year puts the fixture nearest to
   * now, which gives exactly that without anyone stating a season.
   */
  it('puts December in the current year when typed in September', () => {
    expect(parse('8-Dec', SEP_2026)).toBe('DEC 8 2026');
  });

  it('puts February in the NEXT year when typed in September', () => {
    expect(parse('14-Feb', SEP_2026)).toBe('FEB 14 2027');
  });

  it('puts November in the PREVIOUS year when typed in January', () => {
    const JAN_2027 = new Date(2027, 0, 20);
    expect(parse('20-Nov', JAN_2027)).toBe('NOV 20 2026');
  });

  it('leaves an explicit year alone even when it is far away', () => {
    expect(parse('8-Dec-2030', SEP_2026)).toBe('DEC 8 2030');
  });
});

describe('refusing rather than guessing', () => {
  /**
   * A fixture on the wrong day is worse than one the importer named and
   * skipped: nobody re-reads a schedule that looks plausible.
   */
  it('refuses an empty cell', () => {
    expect(parse('')).toBeNull();
    expect(parse(null)).toBeNull();
    expect(parse(undefined)).toBeNull();
  });

  it('refuses a month that does not exist', () => {
    expect(parse('8-Foo', SEP_2026)).toBeNull();
    expect(parse('13/8/2026', SEP_2026)).toBeNull();
  });

  it('refuses a day the month does not have', () => {
    // new Date(2026, 1, 30) rolls into March, so without a check this would
    // become a real date on the wrong day rather than an error.
    expect(parse('30-Feb', SEP_2026)).toBeNull();
    expect(parse('31-Apr', SEP_2026)).toBeNull();
  });

  it('allows 29 February in a leap year and refuses it otherwise', () => {
    expect(parse('29-Feb-2028', SEP_2026)).toBe('FEB 29 2028');
    expect(parse('29-Feb-2027', SEP_2026)).toBeNull();
  });

  it('refuses text that is not a date at all', () => {
    expect(parse('TBD', SEP_2026)).toBeNull();
    expect(parse('next Tuesday', SEP_2026)).toBeNull();
    expect(parse('Homecoming', SEP_2026)).toBeNull();
  });

  it('refuses a day of zero', () => {
    expect(parse('0-Dec', SEP_2026)).toBeNull();
  });
});

describe('the shape the database needs', () => {
  it('always returns MON D YYYY, which is what the trigger parses', () => {
    ['8-Dec', '09/Dec', 'Dec 8', '12/8/2026', '2026-12-08'].forEach(input => {
      expect(parse(input, SEP_2026)).toMatch(/^[A-Z]{3} \d{1,2} \d{4}$/);
    });
  });

  it('uppercases the month, as the stored rows do', () => {
    expect(parse('8 december 2026', SEP_2026)).toBe('DEC 8 2026');
  });

  it('does not pad the day, matching "SEP 4 2026"', () => {
    expect(parse('04/Sep/2026', SEP_2026)).toBe('SEP 4 2026');
  });
});

describe('a day of the week written beside the date', () => {
  /**
   * A DOW column is for the person reading the sheet. It is DERIVED from the
   * date, so the date is the authority — a label that disagrees is a typo in
   * the label, not a different fixture. It is dropped rather than checked.
   */
  it('reads "8-Dec-26 (Tue)"', () => {
    expect(parse('8-Dec-26 (Tue)', SEP_2026)).toBe('DEC 8 2026');
  });

  it('accepts the long form', () => {
    expect(parse('8-Dec-26 (Tuesday)', SEP_2026)).toBe('DEC 8 2026');
  });

  it('accepts square brackets', () => {
    expect(parse('8-Dec-26 [Tue]', SEP_2026)).toBe('DEC 8 2026');
  });

  it('accepts it in front', () => {
    expect(parse('Tue 8-Dec-26', SEP_2026)).toBe('DEC 8 2026');
  });

  it('accepts it trailing without brackets', () => {
    expect(parse('8-Dec-26 Tue', SEP_2026)).toBe('DEC 8 2026');
  });

  it('ignores a label that disagrees with the date', () => {
    // 8 December 2026 is a Tuesday. A sheet saying Friday is a typo in the
    // label; the date still means the eighth.
    expect(parse('8-Dec-26 (Fri)', SEP_2026)).toBe('DEC 8 2026');
  });

  it('does not mistake a month for a day name', () => {
    // "Mar" starts like no weekday, but "Sat"/"Sun" and "Sep" are close
    // enough to be worth pinning.
    expect(parse('8-Sep-26', SEP_2026)).toBe('SEP 8 2026');
    expect(parse('8-Mar-27', SEP_2026)).toBe('MAR 8 2027');
  });

  it('still refuses a cell that is only a day name', () => {
    expect(parse('Tuesday', SEP_2026)).toBeNull();
  });
});

describe('deriving the day of the week', () => {
  const dow = (v: any) => supabaseService.scheduleDayOfWeek(v);

  it('knows 8 December 2026 is a Tuesday', () => {
    expect(dow('8-Dec-2026')).toBe('Tue');
  });

  it('agrees whatever format the date arrived in', () => {
    ['8-Dec-2026', 'Dec 8 2026', '12/8/2026', '2026-12-08']
      .forEach(input => expect(dow(input)).toBe('Tue'));
  });

  it('gives nothing for a date it cannot read', () => {
    expect(dow('TBD')).toBeNull();
    expect(dow('')).toBeNull();
  });
});
