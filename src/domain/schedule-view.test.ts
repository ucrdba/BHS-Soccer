/**
 * The fixture date round trip.
 *
 * parse_match_date() in the schema reads "MON D YYYY" and returns null for an
 * ISO date — a fact pinned by src/data/testdb/team-membership.test.ts against
 * a real Postgres. So a fixture stored in the wrong format has no match_on and
 * sorts as though it had no date, while still reading correctly on screen.
 * These conversions are what stop that happening.
 */
import { describe, it, expect } from 'vitest';
import {
  formatIsoToDisplayDate, formatDisplayDateToIso,
  format24hTo12h, format12hTo24h, matchDirectionsUrl, displayDate,
  matchOutcome, recentForm
} from './schedule-view';

describe('formatIsoToDisplayDate', () => {
  it('converts a date input value to the stored format', () => {
    expect(formatIsoToDisplayDate('2026-09-04')).toBe('SEP 4, 2026');
  });

  it('reads the ISO date in local time, not UTC', () => {
    // Without T00:00:00 this lands on the previous evening west of Greenwich.
    expect(formatIsoToDisplayDate('2026-01-01')).toBe('JAN 1, 2026');
  });

  it('leaves text a coach typed directly alone', () => {
    expect(formatIsoToDisplayDate('SEP 4 2026')).toBe('SEP 4 2026');
  });

  it('is empty for nothing', () => {
    expect(formatIsoToDisplayDate('')).toBe('');
  });

  it('passes an unreadable value through rather than inventing a date', () => {
    expect(formatIsoToDisplayDate('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDisplayDateToIso', () => {
  it('converts the stored format back for a date input', () => {
    expect(formatDisplayDateToIso('SEP 4, 2026')).toBe('2026-09-04');
  });

  it('leaves an ISO value alone', () => {
    expect(formatDisplayDateToIso('2026-09-04')).toBe('2026-09-04');
  });

  it('returns empty rather than a guess for something unreadable', () => {
    // A wrong day silently shown in the input is worse than a blank one.
    expect(formatDisplayDateToIso('sometime in spring')).toBe('');
    expect(formatDisplayDateToIso('')).toBe('');
  });

  it('round-trips a date without drift', () => {
    for (const iso of ['2026-01-01', '2026-09-04', '2026-12-31']) {
      expect(formatDisplayDateToIso(formatIsoToDisplayDate(iso)), iso).toBe(iso);
    }
  });
});

describe('format24hTo12h', () => {
  it('converts an afternoon time', () => {
    expect(format24hTo12h('18:00')).toBe('6:00 PM');
  });

  it('converts midnight and noon correctly', () => {
    expect(format24hTo12h('00:30')).toBe('12:30 AM');
    expect(format24hTo12h('12:15')).toBe('12:15 PM');
  });

  it('leaves a time that already reads that way alone', () => {
    expect(format24hTo12h('6:00 PM')).toBe('6:00 PM');
  });

  it('is empty for nothing, and passes junk through', () => {
    expect(format24hTo12h('')).toBe('');
    expect(format24hTo12h('kickoff')).toBe('kickoff');
  });
});

describe('matchDirectionsUrl', () => {
  const away = { isHome: false, venueAddress: '123 Cougar Way, Beaumont CA' };

  it('links to an away fixture with a stated address', () => {
    const url = matchDirectionsUrl(away)!;
    expect(url).toContain('google.com/maps/dir/');
    expect(url).toContain(encodeURIComponent(away.venueAddress));
  });

  it('gives no link for a home fixture', () => {
    // A coach knows their own ground.
    expect(matchDirectionsUrl({ isHome: true, venueAddress: 'x' })).toBeNull();
  });

  it('gives no link for an away fixture with no address', () => {
    // 'Redlands' as a map query lands in the middle of a city rather than at
    // a school, and a real schedule holds both 'Redlands' and 'Redlands East
    // Valley'. A link to the wrong town is worse than no link.
    expect(matchDirectionsUrl({ isHome: false, venueAddress: '' })).toBeNull();
    expect(matchDirectionsUrl({ isHome: false, venueAddress: '   ' })).toBeNull();
    expect(matchDirectionsUrl({ isHome: false })).toBeNull();
  });

  it('gives no link when the fixture says nothing about being home', () => {
    // Only an explicit isHome === false is an away fixture.
    expect(matchDirectionsUrl({ venueAddress: 'somewhere' })).toBeNull();
    expect(matchDirectionsUrl(null)).toBeNull();
  });
});

describe('displayDate', () => {
  const match = (over: any = {}) => ({
    date: 'SEP 4, 2026', time: '6:00 PM',
    matchOn: '2026-09-04', kickoffTime: '18:00:00', ...over
  });

  it('shows the stored text with the day of the week', () => {
    // A coach checks which day a fixture falls on more often than the date.
    expect(displayDate(match())).toBe('SEP 4, 2026 (Fri)');
  });

  it('derives the day from the text when match_on is absent', () => {
    expect(displayDate(match({ matchOn: null }))).toBe('SEP 4, 2026 (Fri)');
  });

  it('shows the text alone when no day can be worked out', () => {
    expect(displayDate({ date: 'sometime in spring', matchOn: null }))
      .toBe('sometime in spring');
  });

  it('is empty when there is no date at all', () => {
    expect(displayDate({ date: '' })).toBe('');
    expect(displayDate(null)).toBe('');
  });
});

describe('format12hTo24h', () => {
  it('reads an evening kickoff back as 24-hour', () => {
    expect(format12hTo24h('6:00 PM')).toBe('18:00');
  });

  it('handles noon and midnight, which are the two that go wrong', () => {
    // 12 AM is 00, and 12 PM stays 12. Naive arithmetic gets both backwards.
    expect(format12hTo24h('12:30 AM')).toBe('00:30');
    expect(format12hTo24h('12:15 PM')).toBe('12:15');
  });

  it('passes through something already in 24-hour', () => {
    expect(format12hTo24h('18:00')).toBe('18:00');
  });

  it('round trips with its inverse', () => {
    // A stored slot is written as twelve-hour text and read back as minutes,
    // so a round trip that lost the meridiem would shift practice by twelve
    // hours.
    ['08:15', '12:00', '00:45', '16:30', '23:59'].forEach(t => {
      expect(format12hTo24h(format24hTo12h(t))).toBe(t);
    });
  });

  it('gives nothing back for text that is not a time', () => {
    expect(format12hTo24h('')).toBe('');
    expect(format12hTo24h('kickoff')).toBe('');
  });
});

describe('matchOutcome', () => {
  it('reads the word from the score of a completed fixture', () => {
    expect(matchOutcome({ status: 'COMPLETED', score: '3 - 1' })).toBe('won');
    expect(matchOutcome({ status: 'COMPLETED', score: '1 - 1' })).toBe('drawn');
    expect(matchOutcome({ status: 'COMPLETED', score: '0 - 2' })).toBe('lost');
  });

  it('says nothing for a fixture not yet played or with no readable score', () => {
    expect(matchOutcome({ status: 'UPCOMING', score: null })).toBeNull();
    expect(matchOutcome({ status: 'COMPLETED', score: 'W' })).toBeNull();
    expect(matchOutcome(null)).toBeNull();
  });
});

describe('recentForm', () => {
  const done = (id: string, matchOn: string, score: string) =>
    ({ id, status: 'COMPLETED', score, date: 'x', matchOn });

  it('reads the results oldest first, as letters', () => {
    expect(recentForm([
      done('b', '2026-08-08', '0 - 2'),
      done('a', '2026-08-01', '3 - 1'),
      done('c', '2026-08-15', '1 - 1')
    ])).toEqual(['W', 'L', 'D']);
  });

  it('keeps only the last five', () => {
    const seven = ['01', '02', '03', '04', '05', '06', '07'].map((d, i) =>
      done(`m${i}`, `2026-08-${d}`, i < 2 ? '0 - 1' : '2 - 0'));
    expect(recentForm(seven)).toEqual(['W', 'W', 'W', 'W', 'W']);
  });

  it('counts only completed fixtures', () => {
    expect(recentForm([
      done('a', '2026-08-01', '3 - 1'),
      { id: 'n', status: 'UPCOMING', score: null, date: 'x', matchOn: '2026-09-04' }
    ])).toEqual(['W']);
  });

  /*
   * A score that does not parse is left out rather than guessed. Counting it
   * as a draw would put a result in the form that nobody recorded.
   */
  it('leaves out a score it cannot read, rather than calling it a draw', () => {
    expect(recentForm([
      done('a', '2026-08-01', '3 - 1'),
      done('b', '2026-08-08', 'W')
    ])).toEqual(['W']);
  });

  it('takes a different count', () => {
    expect(recentForm([
      done('a', '2026-08-01', '3 - 1'),
      done('b', '2026-08-08', '0 - 2'),
      done('c', '2026-08-15', '1 - 1')
    ], 2)).toEqual(['L', 'D']);
  });

  it('is empty with no results', () => {
    expect(recentForm([])).toEqual([]);
    expect(recentForm(null as any)).toEqual([]);
  });
});
