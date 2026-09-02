/**
 * The "Players not on a team" admin section.
 *
 * The one rule worth protecting: someone who still owns Matrix results must not
 * be retirable. Soft-deleting them would leave that history pointing at a
 * person no screen can reach, and the coach would have no way to notice.
 * Everything else here is convenience; that is correctness.
 *
 * Executes the real classic script -- a source-text check would pass with the
 * guard inverted.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import adminSrc from '../../public/js/admin.js?raw';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, adminSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

const TEAM = { id: 'team-varsity', school_id: 'school-bhs', name: 'Varsity' };

let deleted: string[];
let memberships: any[];

function makeApp(unassigned: any[] = []): any {
  const app = Object.create(ctor.prototype);
  app.data = { players: [{ id: 'p-onteam', name: 'Kai Nakamura' }], teams: [TEAM] };
  app.activeTeamId = TEAM.id;
  app._unassignedPlayers = unassigned;
  app.renderAdminModalContent = vi.fn();
  app.syncFromSupabase = vi.fn(async () => {});
  app.loadUnassignedPlayers = vi.fn(async () => {});
  return app;
}

const CLEAN = { id: 'p-clean', name: 'Caleb Carver', class_year: 'Senior', resultCount: 0 };
const WITH_RESULTS = { id: 'p-hist', name: 'Cesar Alva', class_year: 'Junior', resultCount: 4 };

beforeEach(() => {
  deleted = [];
  memberships = [];
  (globalThis as any).window = globalThis as any;
  (window as any).auth = { isCoach: () => true, isAdmin: () => false };
  (window as any).supabaseService = {
    isConfigured: () => true,
    deletePlayer: async (id: string) => { deleted.push(id); return [{ id }]; },
    upsertTeamMembership: async (teamId: string, schoolId: string, m: any) => {
      memberships.push({ teamId, ...m });
      return { ok: true };
    }
  };
  (globalThis as any).confirm = () => true;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('what the section shows', () => {
  it('lists a person who is on no team', () => {
    const html = makeApp([CLEAN]).renderUnassignedPlayersSection();
    expect(html).toContain('Caleb Carver');
    expect(html).toContain('No results on record');
  });

  it('says so plainly when everyone is on a team', () => {
    expect(makeApp([]).renderUnassignedPlayersSection())
      .toContain('Everyone in the program is on a team');
  });

  it('flags a name that another player already has', () => {
    // "Cesar Alva" exists twice in the live database, one copy on a team.
    const app = makeApp([{ ...CLEAN, name: 'Kai Nakamura' }]);
    expect(app.renderUnassignedPlayersSection()).toContain('SAME NAME AS ANOTHER');
  });

  it('does not flag a name nobody else holds', () => {
    expect(makeApp([CLEAN]).renderUnassignedPlayersSection())
      .not.toContain('SAME NAME AS ANOTHER');
  });

  it('is hidden from a signed-out visitor', () => {
    (window as any).auth = { isCoach: () => false, isAdmin: () => false };
    expect(makeApp([CLEAN]).renderUnassignedPlayersSection()).toBe('');
  });
});

describe('someone who still owns results', () => {
  it('gets no Retire button', () => {
    // The whole point. Retiring them would strand that history.
    const html = makeApp([WITH_RESULTS]).renderUnassignedPlayersSection();
    expect(html).toContain('4 Matrix results on record');
    expect(html).not.toContain(`retireUnassignedPlayer('p-hist'`);
  });

  it('is refused even if the call is made anyway', async () => {
    // The rendered button is not the guard: the panel may have been open while
    // a result was recorded elsewhere.
    const app = makeApp([WITH_RESULTS]);
    await app.retireUnassignedPlayer('p-hist', 'Cesar Alva');
    expect(deleted).toHaveLength(0);
    expect(app._unassignedError).toMatch(/cannot be retired/i);
  });
});

describe('someone with no results', () => {
  it('gets a Retire button, and retiring soft-deletes them', async () => {
    const app = makeApp([CLEAN]);
    expect(app.renderUnassignedPlayersSection()).toContain(`retireUnassignedPlayer('p-clean'`);

    await app.retireUnassignedPlayer('p-clean', 'Caleb Carver');
    expect(deleted).toEqual(['p-clean']);
  });

  it('does nothing when the coach declines the confirmation', async () => {
    (globalThis as any).confirm = () => false;
    await makeApp([CLEAN]).retireUnassignedPlayer('p-clean', 'Caleb Carver');
    expect(deleted).toHaveLength(0);
  });

  it('reports a database refusal instead of claiming success', async () => {
    (window as any).supabaseService.deletePlayer = async () => [];
    const app = makeApp([CLEAN]);
    await app.retireUnassignedPlayer('p-clean', 'Caleb Carver');
    expect(app._unassignedError).toMatch(/refused/i);
    expect(app._unassignedNotice).toBeFalsy();
  });
});

describe('when the result history could not be read', () => {
  // This nearly shipped: fetchUnassignedPlayers asked matrix_session_results
  // for an is_deleted column that table does not have, so the query 400'd and
  // every session result silently counted as zero -- which reads exactly like
  // "safe to retire". Unknown history must never look like no history.
  const UNKNOWN = { ...CLEAN, resultCount: 0, historyUnknown: true };

  it('offers no Retire button', () => {
    const html = makeApp([UNKNOWN]).renderUnassignedPlayersSection();
    expect(html).not.toContain(`retireUnassignedPlayer('p-clean'`);
    expect(html).toContain('Result history unavailable');
  });

  it('refuses the retire even if the call is made anyway', async () => {
    const app = makeApp([UNKNOWN]);
    await app.retireUnassignedPlayer('p-clean', 'Caleb Carver');
    expect(deleted).toHaveLength(0);
    expect(app._unassignedError).toMatch(/not safe|could not read/i);
  });

  it('still lets them be added to a team, which is always safe', () => {
    const html = makeApp([UNKNOWN]).renderUnassignedPlayersSection();
    expect(html).toContain('addUnassignedPlayerToTeam');
  });
});

describe('adding one back to a team', () => {
  it('writes the membership for the active team', async () => {
    const app = makeApp([CLEAN]);
    await app.addUnassignedPlayerToTeam('p-clean', 'Caleb Carver');
    expect(memberships).toEqual([{ teamId: TEAM.id, player_id: 'p-clean' }]);
    expect(app._unassignedNotice).toContain('Varsity');
  });

  it('surfaces a refusal rather than reporting a join that did not happen', async () => {
    (window as any).supabaseService.upsertTeamMembership = async () =>
      ({ ok: false, error: 'Already on another team in this organization.' });
    const app = makeApp([CLEAN]);
    await app.addUnassignedPlayerToTeam('p-clean', 'Caleb Carver');
    expect(app._unassignedError).toContain('Already on another team');
    expect(app._unassignedNotice).toBeFalsy();
  });
});
