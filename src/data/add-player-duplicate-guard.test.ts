/**
 * Adding a player who is already in the program.
 *
 * The roster already has an "Already in the system?" search that reuses an
 * existing person, and its help text asks coaches to use it. But it is opt-in:
 * a coach who simply types a name into the form and submits gets a SECOND
 * identity row for the same human. That is how "Cesar Alva" came to exist twice
 * in the live database.
 *
 * It matters because `players` is identity and `team_players` is membership.
 * Removing someone from a team deletes only the membership -- correctly, since
 * they may play for a club side too -- so re-adding them through the form is
 * the everyday path into a duplicate, and their Matrix history then splits
 * across two records that look identical on screen.
 *
 * Two people in one program CAN share a name, so the guard asks rather than
 * merging silently. Both answers stay available.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import rosterSrc from '../../public/js/views/roster.view.js?raw';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, rosterSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

const TEAM = { id: 'team-varsity', school_id: 'school-bhs', name: 'Varsity' };
const EXISTING = { id: 'player-caleb', name: 'Caleb Carver', class_year: 'Junior' };

let identityWrites: any[];
let membershipWrites: any[];
let searchResults: any[];

function makeApp(playersOnTeam: any[] = []): any {
  const app = Object.create(ctor.prototype);
  app.data = { players: playersOnTeam, teams: [TEAM] };
  app.activeTeamId = TEAM.id;
  app.syncFromSupabase = vi.fn(async () => {});
  app.renderCurrentView = vi.fn();
  app.closeModals = vi.fn();
  return app;
}

const formData = (over: any = {}) => ({
  number: '10', firstName: 'Caleb', lastName: 'Carver', position: 'Midfielder',
  classYear: 'Junior', height: "5'10\"", photo: '',
  stat1: '0', stat2: '0', tech: '80', tact: '80', phys: '80', ment: '80',
  ...over
});

beforeEach(() => {
  identityWrites = [];
  membershipWrites = [];
  searchResults = [];
  (globalThis as any).window = globalThis as any;
  (window as any).supabaseService = {
    isConfigured: () => true,
    searchPlayersByName: async () => searchResults,
    upsertPlayerIdentity: async (p: any) => {
      identityWrites.push(p);
      return { id: p.id || 'new-identity-' + identityWrites.length };
    },
    upsertTeamMembership: async (teamId: string, schoolId: string, m: any) => {
      membershipWrites.push({ teamId, schoolId, ...m });
      return { ok: true };
    }
  };
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('when nobody of that name exists', () => {
  it('creates the player exactly as before', async () => {
    searchResults = [];
    const app = makeApp();
    await app.addPlayer(formData());

    expect(identityWrites).toHaveLength(1);
    expect(identityWrites[0].firstName).toBe('Caleb');
    expect(identityWrites[0].id).toBeUndefined();   // a new person
    expect(membershipWrites).toHaveLength(1);
  });

  it('does not ask the coach anything', async () => {
    searchResults = [];
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await makeApp().addPlayer(formData());
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe('when that name is already on THIS team', () => {
  it('refuses instead of writing a membership the database would reject', async () => {
    // unique (team_id, player_id) would reject it anyway, with an opaque error.
    searchResults = [EXISTING];
    const app = makeApp([{ id: EXISTING.id, name: 'Caleb Carver' }]);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    await app.addPlayer(formData());

    expect(identityWrites).toHaveLength(0);
    expect(membershipWrites).toHaveLength(0);
    expect(alertSpy.mock.calls[0][0]).toMatch(/already on this team/i);
  });
});

describe('when that name exists but is on no team, or another team', () => {
  it('asks the coach rather than deciding for them', async () => {
    searchResults = [EXISTING];
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await makeApp().addPlayer(formData());

    expect(confirmSpy).toHaveBeenCalled();
    const asked = String(confirmSpy.mock.calls[0][0]);
    expect(asked).toContain('Caleb Carver');
    // Both answers have to be spelled out, or the coach is guessing at which
    // button keeps their history.
    expect(asked).toMatch(/separate/i);
  });

  it('reuses the existing person when the coach agrees', async () => {
    // The whole point: one human, one row, history intact.
    searchResults = [EXISTING];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const app = makeApp();

    await app.addPlayer(formData());

    expect(identityWrites).toHaveLength(1);
    expect(identityWrites[0].id).toBe(EXISTING.id);
    expect(membershipWrites).toHaveLength(1);
    expect(membershipWrites[0].player_id).toBe(EXISTING.id);
  });

  it('keeps the number and position typed on the form when reusing', async () => {
    // Reusing the person must not throw away what the coach just entered.
    searchResults = [EXISTING];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await makeApp().addPlayer(formData({ number: '23', position: 'Goalkeeper' }));

    expect(membershipWrites[0].number).toBe(23);
    expect(membershipWrites[0].position).toBe('Goalkeeper');
    // Goalkeeper stats take the keeper shape, as they do on the normal path.
    expect(membershipWrites[0].season_stats).toHaveProperty('saves');
  });

  it('creates a genuinely separate person when the coach declines', async () => {
    // Two people in one program can share a name. Declining must still work.
    searchResults = [EXISTING];
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await makeApp().addPlayer(formData());

    expect(identityWrites).toHaveLength(1);
    expect(identityWrites[0].id).toBeUndefined();
    expect(membershipWrites[0].player_id).toBe('new-identity-1');
  });
});

describe('matching is on the whole name, not a fragment', () => {
  it('ignores a search hit that is merely similar', async () => {
    // searchPlayersByName does a partial match, so "Caleb Carver" would also
    // return "Caleb Carverton". Only an exact full-name match is a duplicate.
    searchResults = [{ id: 'other', name: 'Caleb Carverton', class_year: 'Senior' }];
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await makeApp().addPlayer(formData());

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(identityWrites[0].id).toBeUndefined();
  });

  it('matches regardless of case and spacing', async () => {
    searchResults = [{ id: 'player-caleb', name: '  caleb   CARVER ' }];
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await makeApp().addPlayer(formData());

    expect(confirmSpy).toHaveBeenCalled();
    expect(identityWrites[0].id).toBe('player-caleb');
  });
});
