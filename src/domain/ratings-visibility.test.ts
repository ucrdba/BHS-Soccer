/**
 * Who may see a player's skill ratings.
 *
 * The ratings are a coach's assessment of a player, and most players are
 * minors, so they are not public: coaches and admins see them, and so do the
 * players of the team being looked at. A signed-out visitor does not, and
 * neither does a signed-in player looking at some other team's roster.
 */
import { describe, it, expect } from 'vitest';
import { canSeeTeamRatings } from './ratings-visibility';

const base = {
  isCoach: false, isAdmin: false, canAccessRatings: false,
  viewerPlayerId: null as string | null, teamPlayerIds: [] as string[]
};

describe('canSeeTeamRatings', () => {
  it('shows them to a coach and to an admin', () => {
    expect(canSeeTeamRatings({ ...base, isCoach: true, canAccessRatings: true })).toBe(true);
    expect(canSeeTeamRatings({ ...base, isAdmin: true, canAccessRatings: true })).toBe(true);
  });

  it('shows them to a player of this team', () => {
    expect(canSeeTeamRatings({
      ...base, canAccessRatings: true, viewerPlayerId: 'p2', teamPlayerIds: ['p1', 'p2', 'p3']
    })).toBe(true);
  });

  it('hides them from a player looking at a team they are not on', () => {
    expect(canSeeTeamRatings({
      ...base, canAccessRatings: true, viewerPlayerId: 'p9', teamPlayerIds: ['p1', 'p2']
    })).toBe(false);
  });

  it('hides them from a signed-out visitor', () => {
    expect(canSeeTeamRatings({ ...base, teamPlayerIds: ['p1'] })).toBe(false);
  });

  it('hides them from an account still awaiting approval', () => {
    // canAccessRatings is false until a coach or admin approves the signup.
    expect(canSeeTeamRatings({
      ...base, canAccessRatings: false, viewerPlayerId: 'p1', teamPlayerIds: ['p1']
    })).toBe(false);
  });

  it('hides them from a signed-in player with no player record', () => {
    expect(canSeeTeamRatings({
      ...base, canAccessRatings: true, viewerPlayerId: null, teamPlayerIds: ['p1']
    })).toBe(false);
    expect(canSeeTeamRatings({
      ...base, canAccessRatings: true, viewerPlayerId: undefined, teamPlayerIds: ['p1']
    })).toBe(false);
  });

  it('compares ids as text, since one side comes from a profile row', () => {
    expect(canSeeTeamRatings({
      ...base, canAccessRatings: true, viewerPlayerId: 7 as any, teamPlayerIds: ['7']
    })).toBe(true);
  });

  it('hides them from a coach whose account is not active', () => {
    // isCoach() already requires an active status; this pins the pairing.
    expect(canSeeTeamRatings({ ...base, isCoach: true, canAccessRatings: false })).toBe(false);
  });
});
