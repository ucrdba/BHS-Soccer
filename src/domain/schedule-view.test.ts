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
  format24hTo12h, matchDirectionsUrl, displayDate
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
