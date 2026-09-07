/**
 * Turning a route's fixture id into a fixture.
 *
 * A touchline screen can be reached from a bookmark, a shared link or a
 * reload, so the id in the URL is not guaranteed to name a fixture this team
 * still has. Answering "no" clearly is the point: the screen then says so
 * instead of rendering a board for a match that is not there.
 */
import { describe, it, expect } from 'vitest';
import { matchById } from './match-lookup';

const MATCHES = [
  { id: 'm1', opponent: 'Yucaipa' },
  { id: 'm2', opponent: 'Redlands' }
];

describe('matchById', () => {
  it('finds the fixture', () => {
    expect(matchById(MATCHES, 'm2').opponent).toBe('Redlands');
  });

  it('compares as text, since a route parameter is always a string', () => {
    expect(matchById([{ id: 7, opponent: 'Oakmont' }] as any, '7').opponent).toBe('Oakmont');
  });

  it('is null for an id this team does not have', () => {
    expect(matchById(MATCHES, 'gone')).toBeNull();
  });

  it('is null when there is no id, which is a lineup not tied to a fixture', () => {
    expect(matchById(MATCHES, null)).toBeNull();
    expect(matchById(MATCHES, undefined)).toBeNull();
    expect(matchById(MATCHES, '')).toBeNull();
  });

  it('is null before the schedule has loaded', () => {
    expect(matchById([], 'm1')).toBeNull();
    expect(matchById(null as any, 'm1')).toBeNull();
  });
});
