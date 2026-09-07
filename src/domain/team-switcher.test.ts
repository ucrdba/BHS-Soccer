/**
 * Teams grouped by organization, for the switcher.
 *
 * The grouping is the point of the control: a person may coach a school team
 * and a club team, and confusing the two is the failure the switcher exists
 * to prevent. The label is the organization's name from its own row, never
 * a school code.
 */
import { describe, it, expect } from 'vitest';
import { teamGroups } from './team-switcher';

const SCHOOLS = [
  { id: 's1', name: 'Beaumont High School' },
  { id: 's2', name: 'Legends FC' }
];

describe('teamGroups', () => {
  it('groups teams under their organization, in the order the teams arrive', () => {
    const groups = teamGroups([
      { id: 't1', school_id: 's1', name: 'Varsity', season: '2026' },
      { id: 't2', school_id: 's1', name: 'JV', season: '2026' },
      { id: 't3', school_id: 's2', name: 'U16 Reds', season: null }
    ], SCHOOLS);

    expect(groups).toEqual([
      { id: 's1', label: 'Beaumont High School', teams: [
        { id: 't1', name: 'Varsity', season: '2026' },
        { id: 't2', name: 'JV', season: '2026' }
      ] },
      { id: 's2', label: 'Legends FC', teams: [
        { id: 't3', name: 'U16 Reds', season: '' }
      ] }
    ]);
  });

  it('falls back to the name the team row carries when the school is not loaded', () => {
    const groups = teamGroups([
      { id: 't3', school_id: 's9', name: 'U16', season: '', school_name: 'Riverside SC' }
    ], SCHOOLS);
    expect(groups[0].label).toBe('Riverside SC');
  });

  it('labels an organization it cannot name honestly rather than inventing one', () => {
    const groups = teamGroups([{ id: 't3', school_id: 's9', name: 'U16' }], []);
    expect(groups[0].label).toBe('Organization');
  });

  it('is empty for no teams', () => {
    expect(teamGroups([], SCHOOLS)).toEqual([]);
  });
});
