/**
 * Turning a schedule row into the shape the app reads.
 *
 * Supabase rows are snake_case and app state is camelCase, and there is no
 * ORM: every field is hand-mapped. This is the read half for the schedule,
 * lifted out of syncFromSupabase so the Vue app and the legacy one cannot
 * drift into mapping the same table two different ways.
 */
import { describe, it, expect } from 'vitest';
import { toMatch, toSchedule } from './schedule-row';

const row = (over: any = {}) => ({
  id: 'm1',
  match_date: 'SEP 4 2026',
  match_time: '6:00 PM',
  match_on: '2026-09-04',
  kickoff_time: '18:00:00',
  opponent: 'Yucaipa',
  location: 'Home Field',
  venue_address: '123 Cougar Way',
  status: 'UPCOMING',
  is_home: true,
  score: null,
  result: null,
  ...over
});

describe('toMatch', () => {
  it('maps every column the app reads', () => {
    expect(toMatch(row())).toEqual({
      id: 'm1',
      date: 'SEP 4 2026',
      time: '6:00 PM',
      matchOn: '2026-09-04',
      kickoffTime: '18:00:00',
      opponent: 'Yucaipa',
      location: 'Home Field',
      venueAddress: '123 Cougar Way',
      status: 'UPCOMING',
      isHome: true,
      score: null,
      result: null
    });
  });

  it('nulls the derived columns rather than passing undefined through', () => {
    // match_on is null when the text would not parse, and the difference
    // between null and undefined matters to matchDateTime.
    const m = toMatch(row({ match_on: undefined, kickoff_time: undefined }));
    expect(m.matchOn).toBeNull();
    expect(m.kickoffTime).toBeNull();
  });

  it('nulls an absent venue address', () => {
    expect(toMatch(row({ venue_address: undefined })).venueAddress).toBeNull();
  });

  it('keeps is_home false rather than dropping it', () => {
    expect(toMatch(row({ is_home: false })).isHome).toBe(false);
  });
});

describe('toSchedule', () => {
  it('maps a whole list', () => {
    expect(toSchedule([row(), row({ id: 'm2' })]).map(m => m.id)).toEqual(['m1', 'm2']);
  });

  it('is empty for null, which is what fetchSchedule returns on failure', () => {
    expect(toSchedule(null)).toEqual([]);
    expect(toSchedule(undefined)).toEqual([]);
  });

  it('produces rows the schedule domain can read', async () => {
    // The point of the mapping: matchDateTime has to find matchOn/kickoffTime.
    const { matchDateTime } = await import('./schedule');
    expect(matchDateTime(toMatch(row()))).toEqual(new Date(2026, 8, 4, 18, 0));
  });
});
