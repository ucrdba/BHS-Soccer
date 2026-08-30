/**
 * Player CRUD against the team_players membership model (Task 5).
 *
 * Same technique as matrix-results-panel.test.ts and team-scope.test.ts: load
 * the real classic scripts from public/js rather than reimplementing their
 * logic, so there is no second copy to drift out of sync with the one the
 * browser actually runs.
 *
 * What is worth testing behaviourally here, not by grepping source text:
 *
 * 1. searchExistingPlayers() must filter out anyone already on the active
 *    team — adding them again hits `unique (team_id, player_id)` and the
 *    error surfaced to the coach would be an opaque Postgres message.
 * 2. addPlayer() writes the identity, then the membership, in that order,
 *    and a membership failure must be surfaced (window.alert), not swallowed
 *    the way the pre-migration upsertPlayer('bhs', …) call was — that call
 *    started failing outright once migration 0005 dropped the columns it
 *    wrote, and the failure went straight to console.error while the form
 *    looked like it had done nothing.
 * 3. deletePlayer() must soft-delete the team_players membership row for the
 *    active team only, never the shared players identity row — the person
 *    may also play for a club team, and removing them from varsity must not
 *    remove them from that team too.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import rosterSrc from '../../public/js/views/roster.view.js?raw';

interface RosterApp {
  data: { players: any[]; teams: any[] };
  activeTeamId: string | null;
  searchExistingPlayers(): Promise<void>;
  addExistingPlayerToTeam(playerId: string): Promise<void>;
  addPlayer(playerData: any): Promise<void>;
  saveEditPlayer(playerId: string, playerData: any): Promise<void>;
  deletePlayer(playerId: string): Promise<void>;
  syncFromSupabase(): Promise<void>;
  renderCurrentView(): void;
  closeModals(): void;
}

let ctor: any;

beforeAll(() => {
  // Constructor is never invoked (Object.create, not `new`), so app.core.js's
  // constructor-time dependency on SoccerTacticalBoard never needs to resolve
  // — same reasoning as team-scope.test.ts's switcher fixture.
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  const sources = [appCoreSrc, rosterSrc];
  ctor = new Function(sources.map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;')();
});

function makeApp(): RosterApp {
  const app = Object.create(ctor.prototype) as RosterApp;
  app.data = { players: [], teams: [{ id: 't-varsity', school_id: 's-bhs' }] };
  app.activeTeamId = 't-varsity';
  // Own-property overrides: syncFromSupabase/renderCurrentView/closeModals
  // live in utils.js, which isn't loaded here — these are pure spies so the
  // CRUD methods under test can be exercised without booting the whole app.
  app.syncFromSupabase = vi.fn(async () => {});
  app.renderCurrentView = vi.fn();
  app.closeModals = vi.fn();
  return app;
}

const newPlayerData = (over: Record<string, any> = {}) => ({
  number: '10', name: 'New Kid', position: 'Winger', classYear: 'Junior',
  height: "5'9\"", photo: '', stat1: '0', stat2: '0',
  tech: '80', tact: '80', phys: '80', ment: '80',
  ...over
});

describe('searchExistingPlayers', () => {
  beforeEach(() => {
    document.body.innerHTML = '<input id="playerSearchInput" /><div id="playerSearchResults"></div>';
  });

  it('filters out a result who is already on the active team', async () => {
    const app = makeApp();
    app.data.players = [{ id: 'p-onteam' }];
    (window as any).supabaseService = {
      searchPlayersByName: vi.fn(async () => ([
        { id: 'p-onteam', name: 'Already Here', class_year: 'Senior' },
        { id: 'p-elsewhere', name: 'Plays For Rivals', class_year: 'Junior' }
      ]))
    };
    (document.getElementById('playerSearchInput') as HTMLInputElement).value = 'a';

    await app.searchExistingPlayers();

    const html = document.getElementById('playerSearchResults')!.innerHTML;
    expect(html).toContain('Plays For Rivals');
    expect(html).not.toContain('Already Here');
  });

  it('says so when every match is already on this team, rather than showing an empty box', async () => {
    const app = makeApp();
    app.data.players = [{ id: 'p-onteam' }];
    (window as any).supabaseService = {
      searchPlayersByName: vi.fn(async () => ([{ id: 'p-onteam', name: 'Already Here', class_year: 'Senior' }]))
    };
    (document.getElementById('playerSearchInput') as HTMLInputElement).value = 'a';

    await app.searchExistingPlayers();

    expect(document.getElementById('playerSearchResults')!.innerHTML).toContain('Already on this team');
  });
});

describe('addPlayer', () => {
  it('writes the identity, then the membership — in that order', async () => {
    const order: string[] = [];
    const app = makeApp();
    (window as any).supabaseService = {
      isConfigured: () => true,
      upsertPlayerIdentity: vi.fn(async () => { order.push('identity'); return { id: 'p-new' }; }),
      upsertTeamMembership: vi.fn(async (teamId: string, schoolId: string, membership: any) => {
        order.push('membership');
        return { ok: true };
      })
    };

    await app.addPlayer(newPlayerData());

    expect(order).toEqual(['identity', 'membership']);
    expect((window as any).supabaseService.upsertTeamMembership).toHaveBeenCalledWith(
      't-varsity', 's-bhs', expect.objectContaining({ player_id: 'p-new' })
    );
    expect(app.syncFromSupabase).toHaveBeenCalled();
  });

  it('surfaces a membership failure with an alert instead of swallowing it', async () => {
    const app = makeApp();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    (window as any).supabaseService = {
      isConfigured: () => true,
      upsertPlayerIdentity: vi.fn(async () => ({ id: 'p-new' })),
      upsertTeamMembership: vi.fn(async () => ({ ok: false, error: 'That player is already on another team in this organization.' }))
    };

    await app.addPlayer(newPlayerData());

    expect(alertSpy).toHaveBeenCalled();
    expect(String(alertSpy.mock.calls[0][0])).toContain('already on another team');
    // The person was created but the coach must be told to finish the job
    // from search — the view must not pretend the add succeeded.
    expect(app.syncFromSupabase).not.toHaveBeenCalled();
    expect(app.closeModals).not.toHaveBeenCalled();
  });

  it('does not attempt a membership write when the identity write fails', async () => {
    const app = makeApp();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    const upsertTeamMembership = vi.fn(async () => ({ ok: true }));
    (window as any).supabaseService = {
      isConfigured: () => true,
      upsertPlayerIdentity: vi.fn(async () => null),
      upsertTeamMembership
    };

    await app.addPlayer(newPlayerData());

    expect(upsertTeamMembership).not.toHaveBeenCalled();
  });
});

describe('saveEditPlayer', () => {
  it('splits identity fields from per-team fields across the two writes', async () => {
    const app = makeApp();
    app.data.players = [{
      id: 'p-1', name: 'Old Name', number: 7, position: 'Center Back', classYear: 'Senior',
      height: "5'11\"", photo: '', seasonStats: { goals: 0, assists: 0, games: 3 },
      ratings: { technical: 70, tactical: 70, physical: 70, mental: 70 }
    }];
    (window as any).supabaseService = {
      isConfigured: () => true,
      upsertPlayerIdentity: vi.fn(async (player: any) => ({ id: player.id })),
      upsertTeamMembership: vi.fn(async () => ({ ok: true }))
    };

    await app.saveEditPlayer('p-1', newPlayerData({ number: '9', name: 'New Name', position: 'Center Back' }));

    const identityArg = (window as any).supabaseService.upsertPlayerIdentity.mock.calls[0][0];
    expect(identityArg).not.toHaveProperty('number');
    expect(identityArg).not.toHaveProperty('position');
    expect(identityArg.name).toBe('New Name');

    const membershipArg = (window as any).supabaseService.upsertTeamMembership.mock.calls[0][2];
    expect(membershipArg.number).toBe(9);
    expect(membershipArg.position).toBe('Center Back');
    expect(membershipArg).toHaveProperty('season_stats');
    expect(membershipArg).toHaveProperty('ratings');
  });

  it('surfaces a membership failure rather than reporting success', async () => {
    const app = makeApp();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    app.data.players = [{
      id: 'p-1', name: 'Old Name', number: 7, position: 'Center Back', classYear: 'Senior',
      seasonStats: { goals: 0, assists: 0, games: 3 },
      ratings: { technical: 70, tactical: 70, physical: 70, mental: 70 }
    }];
    (window as any).supabaseService = {
      isConfigured: () => true,
      upsertPlayerIdentity: vi.fn(async (player: any) => ({ id: player.id })),
      upsertTeamMembership: vi.fn(async () => ({ ok: false, error: 'boom' }))
    };

    await app.saveEditPlayer('p-1', newPlayerData());

    expect(alertSpy).toHaveBeenCalled();
    expect(app.syncFromSupabase).not.toHaveBeenCalled();
  });
});

describe('deletePlayer', () => {
  it('soft-deletes the team_players membership for the active team, not the players identity row', async () => {
    const app = makeApp();
    app.data.players = [{ id: 'p-1' }];

    const eqPlayer = vi.fn(async () => ({ error: null }));
    const eqTeam = vi.fn(() => ({ eq: eqPlayer }));
    const update = vi.fn(() => ({ eq: eqTeam }));
    const from = vi.fn(() => ({ update }));
    const deletePlayerIdentity = vi.fn(async () => null);
    (window as any).supabaseService = {
      isConfigured: () => true,
      client: { from },
      deletePlayer: deletePlayerIdentity
    };

    await app.deletePlayer('p-1');

    expect(from).toHaveBeenCalledWith('team_players');
    expect(update).toHaveBeenCalledWith({ is_deleted: true });
    expect(eqTeam).toHaveBeenCalledWith('team_id', 't-varsity');
    expect(eqPlayer).toHaveBeenCalledWith('player_id', 'p-1');
    // The identity-level delete (which would remove the person from every
    // team) must never be reached from this path.
    expect(deletePlayerIdentity).not.toHaveBeenCalled();
    expect(app.syncFromSupabase).toHaveBeenCalled();
  });

  it('alerts and does not refresh when the membership update fails', async () => {
    const app = makeApp();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    app.data.players = [{ id: 'p-1' }];

    const eqPlayer = vi.fn(async () => ({ error: { message: 'RLS denied' } }));
    const eqTeam = vi.fn(() => ({ eq: eqPlayer }));
    const update = vi.fn(() => ({ eq: eqTeam }));
    const from = vi.fn(() => ({ update }));
    (window as any).supabaseService = {
      isConfigured: () => true,
      client: { from }
    };

    await app.deletePlayer('p-1');

    expect(alertSpy).toHaveBeenCalled();
    expect(app.syncFromSupabase).not.toHaveBeenCalled();
  });
});
