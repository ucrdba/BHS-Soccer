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
    <div id="matrixSessionModal"></div>
    <button id="sessionSaveBtn"></button>`;

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

  it('explains an empty picker instead of showing a bare prompt', () => {
    // Every drill starts as head_to_head, so on a fresh install the picker is
    // legitimately empty. "Pick an exercise" with nothing to pick reads as a
    // broken feature, and a coach has no way to learn that the fix is to set a
    // measurement type on the weights screen.
    app._sessionDrillId = '';
    app.data.drillsBank = [{ id: 'd3', name: '1v1', measure: 'head_to_head', points: 3 }];
    const html = app.renderSessionRows();
    expect(html).toContain('No exercises are set up');
    expect(html).toContain('Exercise weights');
  });

  it('shows the ordinary prompt when exercises do exist', () => {
    app._sessionDrillId = '';
    const html = app.renderSessionRows();
    expect(html).toContain('Pick an exercise');
    expect(html).not.toContain('No exercises are set up');
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

  it('defaults the win/draw/loss select to no result, not a win', () => {
    // The select's first option used to be "Won" with nothing blank ahead of
    // it, so a coach who scrolled past a player without touching their row
    // silently awarded them a full-weight win. There must be a selected
    // blank option ahead of "win".
    app._sessionDrillId = 'd2';
    document.getElementById('sessionRows')!.innerHTML = app.renderSessionRows();
    const select = document.getElementById('sessionOutcome_p1') as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('reads an untouched win/draw/loss player as no result, not a win', () => {
    app._sessionDrillId = 'd2';
    document.getElementById('sessionRows')!.innerHTML = app.renderSessionRows();
    const results = app.collectSessionResults();
    // p1 and p2 are both left untouched (present, no outcome chosen).
    expect(results.every((r: any) => r.outcome === null)).toBe(true);
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

  it('disables the save button while the request is in flight, then re-enables it', async () => {
    // A double-click while the first save is still pending must not fire a
    // second saveMatrixSession call and double everyone's `available`.
    let resolveSave!: (v: any) => void;
    (globalThis as any).supabaseService.saveMatrixSession = () => new Promise(res => { resolveSave = res; });
    app._sessionDrillId = 'd1';
    document.getElementById('sessionRows')!.innerHTML = app.renderSessionRows();
    (document.getElementById('sessionDate') as HTMLInputElement).value = '2026-08-31';
    (document.getElementById('sessionValue_p1') as HTMLInputElement).value = '2800';
    (document.getElementById('sessionValue_p2') as HTMLInputElement).value = '2650';

    const pending = app.saveSession();
    const btn = document.getElementById('sessionSaveBtn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    resolveSave({ ok: true, id: 's1' });
    await pending;
    expect(btn.disabled).toBe(false);
  });

  it('re-enables the save button after a refused save too', async () => {
    saveResult = { ok: false, error: 'p1 is marked present but has no result.' };
    app._sessionDrillId = 'd1';
    document.getElementById('sessionRows')!.innerHTML = app.renderSessionRows();
    (document.getElementById('sessionDate') as HTMLInputElement).value = '2026-08-31';
    await app.saveSession();
    const btn = document.getElementById('sessionSaveBtn') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
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

describe('editing a recorded session', () => {
  beforeEach(() => {
    app._sessions = [{ id: 's1', drill_id: 'd1', occurred_on: '2026-08-20', drills_bank: { name: "Coopers" } }];
    (globalThis as any).supabaseService.fetchMatrixSessionResults = async () => ([
      { player_id: 'p1', attendance: 'present', raw_value: 2800, outcome: null },
      { player_id: 'p2', attendance: 'unexcused', raw_value: null, outcome: null }
    ]);
  });

  it('prefills each player with what was stored', async () => {
    await app.editSession('s1');
    expect((document.getElementById('sessionValue_p1') as HTMLInputElement).value).toBe('2800');
    expect((document.getElementById('sessionAttend_p2') as HTMLSelectElement).value).toBe('unexcused');
  });

  it('restores the date the session actually happened', async () => {
    await app.editSession('s1');
    expect((document.getElementById('sessionDate') as HTMLInputElement).value).toBe('2026-08-20');
  });

  it('locks the exercise, because the drill decides how values are scored', async () => {
    // Switching a count_high session to win_loss would leave stored numbers
    // that mean nothing. Wrong exercise is a delete-and-re-enter.
    await app.editSession('s1');
    expect((document.getElementById('sessionDrill') as HTMLSelectElement).disabled).toBe(true);
  });

  it('updates in place rather than creating a second session', async () => {
    await app.editSession('s1');
    await app.saveSession();
    expect(saved).toHaveLength(1);
    expect(saved[0].s.id).toBe('s1');
  });

  it('defaults a player who joined since to excused, not present', async () => {
    // p3 has no stored row: they were not there. Defaulting to present would
    // block the save on a blank value, and marking them present would be a lie.
    app.data.players.push({ id: 'p3', name: 'New Kid', number: 5 });
    await app.editSession('s1');
    expect((document.getElementById('sessionAttend_p3') as HTMLSelectElement).value).toBe('excused');
  });

  it('still shows a player who has left the squad', async () => {
    // Their result is still scoring. Hiding them would let a coach save the
    // session while silently keeping a result they cannot see.
    app.data.players = [{ id: 'p1', name: 'Cesar Alva', number: 9 }];
    await app.editSession('s1');
    expect(document.getElementById('sessionAttend_p2')).not.toBeNull();
    expect(document.getElementById('sessionRows')!.innerHTML).toContain('no longer on this team');
  });

  it('clears edit state after saving, so the next record is a new session', async () => {
    await app.editSession('s1');
    await app.saveSession();
    expect(app._editingSessionId).toBeNull();
    expect(app._sessionPrefill).toBeNull();
  });

  it('does not carry an edit into a fresh Record a session', async () => {
    // The bug this replaces: after editing, "Record a session" reopened the
    // SAME session for editing, so a coach could not record a new one at all.
    // It was inferred from whether a prefill existed, which is exactly what is
    // set after an edit -- so it never cleared.
    await app.editSession('s1');
    expect(app._editingSessionId).toBe('s1');

    await app.newSession();
    expect(app._editingSessionId).toBeNull();
    expect(app._sessionPrefill).toBeNull();
  });

  it('clears the previous exercise when starting a new session', async () => {
    // Otherwise the new session silently inherits the edited session's drill.
    await app.editSession('s1');
    await app.newSession();
    expect(app._sessionDrillId).toBe('');
  });

  it('resets the date to today for a new session', async () => {
    // An edited session restores its own date; a new one must not keep it.
    await app.editSession('s1');
    expect((document.getElementById('sessionDate') as HTMLInputElement).value).toBe('2026-08-20');
    await app.newSession();
    const today = new Date().toISOString().slice(0, 10);
    expect((document.getElementById('sessionDate') as HTMLInputElement).value).toBe(today);
  });

  it('renders blank inputs after an edit, not the edited values', async () => {
    await app.editSession('s1');
    await app.newSession();
    app._sessionDrillId = 'd1';
    document.getElementById('sessionRows')!.innerHTML = app.renderSessionRows();
    expect((document.getElementById('sessionValue_p1') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('sessionAttend_p1') as HTMLSelectElement).value).toBe('present');
  });
});

describe('session history placement', () => {
  // A coach could not find this panel on the live site: it rendered correctly
  // but sat below a 14-row leaderboard AND the logged-results panel, so it was
  // off-screen and reaching it took a console command.
  let matrixApp: any;

  beforeEach(async () => {
    const matrixSrc = (await import('../../public/js/views/matrix.view.js?raw')).default;
    const appCore = (await import('../../public/js/app.core.js?raw')).default;
    const sessionView = (await import('../../public/js/views/matrix-session.view.js?raw')).default;
    const clean = (x: string) => (x.charCodeAt(0) === 0xfeff ? x.slice(1) : x);
    const ctor = new Function(
      [clean(appCore), clean(matrixSrc), clean(sessionView)].join('\n;\n') + '\nreturn BHSSoccerApp;'
    )() as any;
    matrixApp = Object.create(ctor.prototype);
    matrixApp.data = { players: [], matrixLogs: [], drillsBank: [], currentPracticePlan: [] };
    matrixApp._sessions = [{ id: 's1', occurred_on: '2026-08-31', drills_bank: { name: "Coopers" } }];
    matrixApp.renderMatrixResultsPanel = () => '<div>LOGGED RESULTS</div>';
    matrixApp.activeTeamLabel = () => 'Varsity';
  });

  it('puts recorded sessions ABOVE logged results', () => {
    const html = matrixApp.renderMatrixView();
    expect(html.indexOf('RECORDED SESSIONS')).toBeLessThan(html.indexOf('LOGGED RESULTS'));
  });

  it('shows the session count so it can be read without scrolling', () => {
    const html = matrixApp.renderMatrixView();
    const head = html.slice(html.indexOf('RECORDED SESSIONS'), html.indexOf('RECORDED SESSIONS') + 200);
    expect(head).toContain('>1<');
  });

  it('shows zero rather than hiding the panel when nothing is recorded', () => {
    // An absent panel reads as a missing feature; a zero reads as "nothing yet".
    matrixApp._sessions = [];
    const html = matrixApp.renderMatrixView();
    expect(html).toContain('RECORDED SESSIONS');
    expect(html).toContain('>0<');
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
