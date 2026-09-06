/**
 * Reading the coaching staff.
 *
 * `name` and `level` are NOT NULL in the database, checked against a running
 * Postgres rather than the schema file, which drifts. `level` is nonetheless
 * free text, so ordering by seniority matches keywords rather than an enum.
 */
import { describe, it, expect } from 'vitest';
import { toCoach, toCoaches, coachRank, sortedCoaches } from './coach-row';

const row = (over: any = {}) => ({
  id: 'c1',
  school_id: 's1',
  name: 'A Coach',
  level: 'Head Coach',
  phone: '555-0100',
  address: '1 Way',
  email: 'coach@club.test',
  photo_url: 'https://example.test/c.jpg',
  bio: 'Twenty years.',
  is_deleted: false,
  ...over
});

describe('toCoach', () => {
  it('maps every column the app reads', () => {
    expect(toCoach(row())).toEqual({
      id: 'c1',
      schoolId: 's1',
      name: 'A Coach',
      level: 'Head Coach',
      phone: '555-0100',
      address: '1 Way',
      email: 'coach@club.test',
      photo: 'https://example.test/c.jpg',
      bio: 'Twenty years.'
    });
  });

  it('nulls the optional columns rather than passing undefined through', () => {
    const c = toCoach({ id: 'c1', name: 'A', level: 'Head' });
    expect(c.phone).toBeNull();
    expect(c.email).toBeNull();
    expect(c.photo).toBeNull();
    expect(c.bio).toBeNull();
    expect(c.schoolId).toBeNull();
  });
});

describe('toCoaches', () => {
  it('maps a whole staff list', () => {
    expect(toCoaches([row(), row({ id: 'c2' })]).map(c => c.id)).toEqual(['c1', 'c2']);
  });

  it('omits soft-deleted rows, in either spelling', () => {
    expect(toCoaches([row(), row({ id: 'c2', is_deleted: true })])).toHaveLength(1);
    expect(toCoaches([row({ isDeleted: true })])).toHaveLength(0);
  });

  it('drops a row with no id rather than rendering an uneditable card', () => {
    expect(toCoaches([row(), { name: 'Ghost', level: 'Head' }])).toHaveLength(1);
  });

  it('is empty for null, which is what fetchCoaches returns on failure', () => {
    // Not an empty staff -- a failed read.
    expect(toCoaches(null)).toEqual([]);
    expect(toCoaches(undefined)).toEqual([]);
  });
});

describe('coachRank', () => {
  it('ranks head, assistant, then keeper coaches', () => {
    expect(coachRank('Head Coach')).toBeLessThan(coachRank('Assistant Coach'));
    expect(coachRank('Assistant Coach')).toBeLessThan(coachRank('Keeper Coach'));
  });

  it('ignores case and surrounding words', () => {
    expect(coachRank('head coach')).toBe(coachRank('HEAD COACH'));
    expect(coachRank('Interim Head Coach')).toBe(coachRank('Head'));
  });

  it('reads either spelling of a goalkeeping role', () => {
    expect(coachRank('Goalkeeping Coach')).toBe(coachRank('Keeper Coach'));
  });

  it('puts an unrecognised title after the ranks, not before', () => {
    // Free text: a title nobody anticipated must not lead the list.
    expect(coachRank('Team Liaison')).toBeGreaterThan(coachRank('Keeper Coach'));
    expect(coachRank('')).toBeGreaterThan(coachRank('Head Coach'));
  });
});

describe('sortedCoaches', () => {
  const staff = [
    toCoach(row({ id: 'k', name: 'Keeper Person', level: 'Keeper Coach' })),
    toCoach(row({ id: 'z', name: 'Zed Liaison', level: 'Team Liaison' })),
    toCoach(row({ id: 'h', name: 'Head Person', level: 'Head Coach' })),
    toCoach(row({ id: 'a2', name: 'Betty Assistant', level: 'Assistant Coach' })),
    toCoach(row({ id: 'a1', name: 'Alan Assistant', level: 'Assistant Coach' }))
  ];

  it('orders by seniority, then by name', () => {
    expect(sortedCoaches(staff).map(c => c.id)).toEqual(['h', 'a1', 'a2', 'k', 'z']);
  });

  it('does not mutate the list it was given', () => {
    const before = staff.map(c => c.id);
    sortedCoaches(staff);
    expect(staff.map(c => c.id)).toEqual(before);
  });

  it('copes with an empty staff', () => {
    expect(sortedCoaches([])).toEqual([]);
  });
});
