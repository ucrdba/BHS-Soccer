import { describe, it, expect } from 'vitest';
import { canFor } from './permissions';

const roles = [
  { name: 'coach', permissions: { can_modify_roster: true, can_manage_schools: false } },
  { name: 'guest', permissions: { can_modify_roster: false, can_manage_schools: false } },
];

describe('canFor', () => {
  it('grants a permission the role has', () => {
    expect(canFor(roles, 'coach', 'can_modify_roster')).toBe(true);
  });

  it('denies a permission the role lacks', () => {
    expect(canFor(roles, 'coach', 'can_manage_schools')).toBe(false);
  });

  it('denies everything for an unknown role', () => {
    expect(canFor(roles, 'nobody', 'can_modify_roster')).toBe(false);
  });

  it('denies when the roles table has not loaded, rather than granting', () => {
    expect(canFor([], 'coach', 'can_modify_roster')).toBe(false);
  });
});
