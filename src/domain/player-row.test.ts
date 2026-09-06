/**
 * Turning a team_players row into a player.
 *
 * The row is a MEMBERSHIP with the person nested under `players`: `players`
 * is pure identity, and everything that varies by team -- number, position,
 * season stats, ratings -- lives on the membership. That is what lets one
 * person appear on a school team and a club team with separate statistics,
 * so the two ids must not be confused.
 */
import { describe, it, expect } from 'vitest';
import {
  toPlayer, toRoster, photoOrPlaceholder,
  PLAYER_SILHOUETTE, COACH_SILHOUETTE
} from './player-row';

const row = (over: any = {}) => ({
  id: 'tp1',
  team_id: 't1',
  school_id: 's1',
  number: 7,
  recording_number: 21,
  position: 'Midfielder',
  season_stats: { games: 12, goals: 3 },
  ratings: { technical: 4 },
  is_deleted: false,
  players: {
    id: 'p1',
    name: 'Cesar Alva',
    first_name: 'Cesar',
    last_name: 'Alva',
    class_year: 'Senior',
    height: '5-10',
    photo_url: 'https://example.test/a.jpg'
  },
  ...over
});

describe('toPlayer', () => {
  it('takes the person\'s id from the join and keeps the membership id apart', () => {
    // Confusing these writes one team's number onto another team's membership.
    const p = toPlayer(row());
    expect(p.id).toBe('p1');
    expect(p.membershipId).toBe('tp1');
  });

  it('maps the identity columns', () => {
    const p = toPlayer(row());
    expect(p.name).toBe('Cesar Alva');
    expect(p.firstName).toBe('Cesar');
    expect(p.lastName).toBe('Alva');
    expect(p.classYear).toBe('Senior');
    expect(p.height).toBe('5-10');
    expect(p.photo).toBe('https://example.test/a.jpg');
  });

  it('maps the per-team columns', () => {
    const p = toPlayer(row());
    expect(p.number).toBe(7);
    expect(p.position).toBe('Midfielder');
    expect(p.seasonStats).toEqual({ games: 12, goals: 3 });
    expect(p.ratings).toEqual({ technical: 4 });
  });

  it('keeps the recording number distinct from the shirt number', () => {
    // The paper-sheet number, which is not the shirt (0021).
    const p = toPlayer(row());
    expect(p.recordingNumber).toBe(21);
    expect(p.number).toBe(7);
  });

  it('defaults the name parts to empty strings rather than undefined', () => {
    // `name` is maintained by a trigger from the parts; the parts come along
    // for the editor, which edits them rather than the whole.
    const p = toPlayer(row({ players: { id: 'p1', name: 'Solo' } }));
    expect(p.firstName).toBe('');
    expect(p.lastName).toBe('');
  });

  it('defaults the JSON columns to empty objects', () => {
    const p = toPlayer(row({ season_stats: null, ratings: null }));
    expect(p.seasonStats).toEqual({});
    expect(p.ratings).toEqual({});
  });

  it('does not throw when the join produced no person', () => {
    expect(() => toPlayer({ id: 'tp1' })).not.toThrow();
    expect(toPlayer({ id: 'tp1' }).id).toBeUndefined();
  });
});

describe('toRoster', () => {
  it('maps a whole roster', () => {
    expect(toRoster([row(), row({ id: 'tp2', players: { id: 'p2', name: 'B' } })])
      .map(p => p.id)).toEqual(['p1', 'p2']);
  });

  it('drops a membership whose join produced no person', () => {
    // Rendering it would put a blank card on the roster with no way to fix it.
    expect(toRoster([row(), { id: 'orphan' }])).toHaveLength(1);
  });

  it('is empty for null, which is what fetchTeamRoster returns on failure', () => {
    // Not an empty squad -- a failed read.
    expect(toRoster(null)).toEqual([]);
    expect(toRoster(undefined)).toEqual([]);
  });
});

describe('photoOrPlaceholder', () => {
  it('uses the photo when there is one', () => {
    expect(photoOrPlaceholder('https://example.test/a.jpg')).toBe('https://example.test/a.jpg');
  });

  it('falls back for null, undefined and whitespace alike', () => {
    // Imports and manual edits all leave photo_url an empty string, not null.
    expect(photoOrPlaceholder(null)).toBe(PLAYER_SILHOUETTE);
    expect(photoOrPlaceholder(undefined)).toBe(PLAYER_SILHOUETTE);
    expect(photoOrPlaceholder('')).toBe(PLAYER_SILHOUETTE);
    expect(photoOrPlaceholder('   ')).toBe(PLAYER_SILHOUETTE);
  });

  it('has a separate placeholder for a coach', () => {
    expect(photoOrPlaceholder('', 'coach')).toBe(COACH_SILHOUETTE);
    expect(COACH_SILHOUETTE).not.toBe(PLAYER_SILHOUETTE);
  });
});
