/**
 * Task 6: the session grid — recording a whole squad's results for one
 * exercise in a single save.
 *
 * head_to_head drills are recorded as pairings in the Record Result modal
 * (out of scope here); offering them here too would let the same day's
 * competition be counted twice with no error anywhere, so the session picker
 * must exclude them.
 *
 * collectSessionResults() is split out from saveSession() so the DOM-reading
 * half can be tested without a service call standing in the way. The
 * important edge case: a player's number/outcome input can still hold a
 * value the coach typed before switching their attendance away from
 * "present" — that stale value must never be read for a non-present player.
 */
/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, vi } from 'vitest';
import appCoreSrc from '../../public/js/app.core.js?raw';
import sessionSrc from '../../public/js/views/matrix-session.view.js?raw';

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

let app: any;
let saved: any[];
let saveResult: { ok: boolean; error?: string; id?: string };

beforeEach(() => {
  saved = [];
  saveResult = { ok: true, id: 's1' };
  document.body.innerHTML = `
    <select id="sessionDrill"></select>
    <input id="sessionDate" type="date" />
    <div id="sessionRows"></div>
    <div id="sessionError"></div>
    <div id="matrixSessionModal"></div>`;

  const w = globalThis as any;
  w.auth = {
    isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
    canAccessRatings: () => true, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'admin', status: 'active' }),
    getRole: () => 'admin'
  };
  w.can = () => true;
  w.supabaseService = {
    isConfigured: () => true,
    saveMatrixSession: async (t: string, s: any, r: any[]) => { saved.push({ t, s, r }); return saveResult; }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  const ctor = new Function(
    [strip(appCoreSrc), strip(sessionSrc)].join('\n;\n') + '\nreturn BHSSoccerApp;'
  )() as any;
  app = Object.create(ctor.prototype);
  app.activeTeamId = 't1';
  app.syncFromSupabase = async () => {};
  app.renderCurrentView = () => {};
  app.closeModals = () => {};
  app.data = {
    players: [
      { id: 'p1', name: 'Cesar Alva', number: 9 },
      { id: 'p2', name: 'Caleb Carver', number: 10 }
    ],
    drillsBank: [
      { id: 'd1', name: "Cooper's", measure: 'count_high', points: 1.5 },
      { id: 'd2', name: 'SSG', measure: 'win_loss', points: 2.5 },
      { id: 'd3', name: '1v1', measure: 'head_to_head', points: 3 }
    ]
  };
});

describe('session grid', () => {
  it('offers only drills that are recorded as sessions', () => {
    // A head_to_head drill goes through the Record Result modal. Offering it
    // here would let one day's competition be counted twice.
    app._sessionDrillId = 'd1';
    const html = app.renderSessionRows();
    expect(html).toContain('Cesar Alva');
    const opts = app.sessionDrillOptions();
    expect(opts).toContain('d1');
    expect(opts).toContain('d2');
    expect(opts).not.toContain('d3');
  });

  it('asks for a number when the drill is measured', () => {
    app._sessionDrillId = 'd1';
    const html = app.renderSessionRows();
    expect(html).toContain('type="number"');
    expect(html).not.toContain('sessionOutcome_p1');
  });

  it('asks for win, draw or loss when the drill is a small-sided game', () => {
    app._sessionDrillId = 'd2';
    const html = app.renderSessionRows();
    expect(html).toContain('sessionOutcome_p1');
    expect(html).toContain('value="win"');
  });

  it('marks everyone present by default', () => {
    app._sessionDrillId = 'd1';
    document.getElementById('sessionRows')!.innerHTML = app.renderSessionRows();
    const results = app.collectSessionResults();
    expect(results.every((r: any) => r.attendance === 'present')).toBe(true);
  });

  it('reads a value and an absence out of the grid', () => {
    app._sessionDrillId = 'd1';
    document.getElementById('sessionRows')!.innerHTML = app.renderSessionRows();
    (document.getElementById('sessionValue_p1') as HTMLInputElement).value = '2800';
    (document.getElementById('sessionAttend_p2') as HTMLSelectElement).value = 'excused';
    const results = app.collectSessionResults();
    expect(results[0]).toMatchObject({ playerId: 'p1', attendance: 'present', rawValue: 2800 });
    expect(results[1]).toMatchObject({ playerId: 'p2', attendance: 'excused' });
  });

  it('drops a stale number left in the box after the player is marked excused', () => {
    // A coach types a result, then realizes the player didn't actually train
    // and marks them excused without clearing the number field. The stale
    // 2800 must never be sent as that player's result.
    app._sessionDrillId = 'd1';
    document.getElementById('sessionRows')!.innerHTML = app.renderSessionRows();
    (document.getElementById('sessionValue_p1') as HTMLInputElement).value = '2800';
    (document.getElementById('sessionAttend_p1') as HTMLSelectElement).value = 'excused';
    const results = app.collectSessionResults();
    expect(results[0]).toMatchObject({ playerId: 'p1', attendance: 'excused', rawValue: null });
  });

  it('drops a stale outcome left selected after the player is marked a no-show', () => {
    app._sessionDrillId = 'd2';
    document.getElementById('sessionRows')!.innerHTML = app.renderSessionRows();
    (document.getElementById('sessionOutcome_p1') as HTMLSelectElement).value = 'win';
    (document.getElementById('sessionAttend_p1') as HTMLSelectElement).value = 'unexcused';
    const results = app.collectSessionResults();
    expect(results[0]).toMatchObject({ playerId: 'p1', attendance: 'unexcused', outcome: null });
  });

  it('refuses to save with no drill chosen', async () => {
    app._sessionDrillId = '';
    await app.saveSession();
    expect(saved).toHaveLength(0);
    expect(document.getElementById('sessionError')!.textContent).toContain('exercise');
  });

  it('names the player when the service refuses the save', async () => {
    saveResult = { ok: false, error: 'p1 is marked present but has no result.' };
    app._sessionDrillId = 'd1';
    document.getElementById('sessionRows')!.innerHTML = app.renderSessionRows();
    (document.getElementById('sessionDate') as HTMLInputElement).value = '2026-08-31';
    await app.saveSession();
    expect(document.getElementById('sessionError')!.textContent).toContain('p1');
  });

  it('re-syncs after a successful save so the leaderboard moves', async () => {
    // Standings are derived in Postgres; without a re-read the coach records a
    // session and sees nothing change.
    let synced = false;
    app.syncFromSupabase = async () => { synced = true; };
    app._sessionDrillId = 'd1';
    document.getElementById('sessionRows')!.innerHTML = app.renderSessionRows();
    (document.getElementById('sessionDate') as HTMLInputElement).value = '2026-08-31';
    (document.getElementById('sessionValue_p1') as HTMLInputElement).value = '2800';
    (document.getElementById('sessionValue_p2') as HTMLInputElement).value = '2650';
    await app.saveSession();
    expect(synced).toBe(true);
  });
});

describe('session history', () => {
  it('lists recorded sessions newest first', () => {
    app._sessions = [
      { id: 's2', occurred_on: '2026-08-30', drills_bank: { name: "Cooper's" } },
      { id: 's1', occurred_on: '2026-08-20', drills_bank: { name: 'SSG' } }
    ];
    const html = app.renderSessionHistory();
    expect(html.indexOf("Cooper's")).toBeLessThan(html.indexOf('SSG'));
  });

  it('offers delete on each session', () => {
    app._sessions = [{ id: 's1', occurred_on: '2026-08-20', drills_bank: { name: 'SSG' } }];
    expect(app.renderSessionHistory()).toContain("app.removeSession('s1')");
  });

  it('says so when nothing has been recorded', () => {
    app._sessions = [];
    expect(app.renderSessionHistory()).toContain('No sessions');
  });

  it('asks before deleting, naming what will be lost', async () => {
    // Deleting a session removes every result in it and re-ranks the table.
    let asked = '';
    (globalThis as any).confirm = (m: string) => { asked = m; return false; };
    app._sessions = [{ id: 's1', occurred_on: '2026-08-20', drills_bank: { name: 'SSG' } }];
    await app.removeSession('s1');
    expect(asked).toContain('SSG');
    expect(asked).toContain('2026-08-20');
  });
});
