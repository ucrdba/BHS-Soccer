/**
 * The record-a-result form must not arrive with two players already chosen.
 *
 * It used to preselect Player A as the first name and Player B as the second,
 * so a coach who opened the modal and clicked through recorded a head-to-head
 * result between two arbitrary players. Nothing in the roster view corrects a
 * wrong entry — only the LOGGED RESULTS panel does, and only once someone
 * notices the standings are wrong.
 *
 * Runs the real openAddDrillModal against a jsdom document rather than grepping
 * for a blank <option>, because what matters is the value the select ends up
 * holding, not the markup that produced it.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import adminSrc from '../../public/js/admin.js?raw';

interface DrillApp {
  data: Record<string, any>;
  activeTeamId: string | null;
  openAddDrillModal(logId?: string): void;
  submitMatrixResult(): Promise<void>;
  syncFromSupabase(): Promise<void>;
  renderCurrentView(): void;
  closeModals(): void;
}

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

let app: DrillApp;
let closed: boolean;
let logged: any[];

beforeEach(() => {
  closed = false;
  logged = [];
  document.body.innerHTML = `
    <div id="addDrillScoreModal">
      <h3 id="matrixModalTitle"></h3>
      <input id="matrixLogId" type="hidden" />
      <select id="matrixDrill"></select>
      <select id="matrixPlayerA"></select>
      <select id="matrixPlayerB"></select>
      <select id="matrixOutcome">
        <option value="a">A won</option><option value="b">B won</option><option value="draw">Draw</option>
      </select>
      <input id="matrixScoreText" />
      <input id="matrixOccurredOn" type="date" />
      <div id="matrixFormError"></div>
      <button id="matrixSubmitBtn"></button>
    </div>`;

  const w = globalThis as any;
  w.auth = {
    isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
    canAccessRatings: () => true, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'admin', status: 'active' }),
    getRole: () => 'admin'
  };
  w.can = () => true;
  w.supabaseService = {
    isConfigured: () => false,
    logMatrixResult: async (_teamId: string, payload: any) => { logged.push(payload); return { ok: true }; },
    updateMatrixResult: async (_id: string, payload: any) => { logged.push(payload); return { ok: true }; }
  };

  const ctor = new Function(
    [strip(appCoreSrc), strip(adminSrc)].join('\n;\n') + '\nreturn BHSSoccerApp;'
  )() as { prototype: DrillApp };

  app = Object.create(ctor.prototype) as DrillApp;
  app.syncFromSupabase = async () => {};
  app.renderCurrentView = () => {};
  app.closeModals = () => { closed = true; };
  app.activeTeamId = 't-varsity';
  app.data = {
    players: [
      { id: 'p1', name: 'Cesar Alva', number: 9 },
      { id: 'p2', name: 'Caleb Carver', number: 10 },
      { id: 'p3', name: 'Dylan Strothers', number: 1 }
    ],
    drillsBank: [{ id: 'd1', name: '1v1 Gauntlet' }],
    matrixLogs: [],
    teams: [{ id: 't-varsity', school_id: 's-bhs', name: 'Varsity' }]
  };
});

const sel = (id: string) => document.getElementById(id) as HTMLSelectElement;

describe('record-a-result modal defaults', () => {
  it('opens with no player chosen', () => {
    app.openAddDrillModal();
    // The whole point: a coach must make two deliberate choices, so clicking
    // straight through cannot record a result between arbitrary players.
    expect(sel('matrixPlayerA').value).toBe('');
    expect(sel('matrixPlayerB').value).toBe('');
  });

  it('still lists every player to choose from', () => {
    app.openAddDrillModal();
    const a = sel('matrixPlayerA');
    // Three players plus the blank placeholder.
    expect(a.options.length).toBe(4);
    expect(a.innerHTML).toContain('Cesar Alva');
    expect(a.innerHTML).toContain('Dylan Strothers');
  });

  it('shows the jersey number alongside the name', () => {
    app.openAddDrillModal();
    expect(sel('matrixPlayerA').innerHTML).toContain('(#9)');
  });

  it('leaves the drill optional, as it already was', () => {
    app.openAddDrillModal();
    expect(sel('matrixDrill').value).toBe('');
  });

  it('still prefills both players when editing an existing result', () => {
    // A blank first option must not break the edit path, which sets .value to
    // a real id after the options are built.
    app.data.matrixLogs = [{
      id: 'log-1', player_a_id: 'p1', player_b_id: 'p3',
      outcome: 'a', score_text: '3 - 2', occurred_on: '2026-08-20', drill_id: 'd1'
    }];
    app.openAddDrillModal('log-1');
    expect(sel('matrixPlayerA').value).toBe('p1');
    expect(sel('matrixPlayerB').value).toBe('p3');
    expect(sel('matrixDrill').value).toBe('d1');
  });

  it('stays open after recording, so several results can be entered at once', async () => {
    // A coach runs one drill and comes away with a dozen head-to-heads. The
    // form used to close on every save, and reopening it lost the drill and
    // the date each time.
    app.openAddDrillModal();
    sel('matrixPlayerA').value = 'p1';
    sel('matrixPlayerB').value = 'p2';
    await app.submitMatrixResult();
    expect(closed).toBe(false);
    expect(logged).toHaveLength(1);
  });

  it('clears both players so the next result cannot repeat the last one', async () => {
    app.openAddDrillModal();
    sel('matrixPlayerA').value = 'p1';
    sel('matrixPlayerB').value = 'p2';
    await app.submitMatrixResult();
    expect(sel('matrixPlayerA').value).toBe('');
    expect(sel('matrixPlayerB').value).toBe('');
  });

  it('keeps the drill and the date, which do not change between results', async () => {
    app.openAddDrillModal();
    sel('matrixDrill').value = 'd1';
    (document.getElementById('matrixOccurredOn') as HTMLInputElement).value = '2026-08-30';
    sel('matrixPlayerA').value = 'p1';
    sel('matrixPlayerB').value = 'p2';
    await app.submitMatrixResult();
    expect(sel('matrixDrill').value).toBe('d1');
    expect((document.getElementById('matrixOccurredOn') as HTMLInputElement).value).toBe('2026-08-30');
  });

  it('confirms each result and counts them', async () => {
    app.openAddDrillModal();
    sel('matrixPlayerA').value = 'p1';
    sel('matrixPlayerB').value = 'p2';
    await app.submitMatrixResult();
    const msg = document.getElementById('matrixFormError')!;
    expect(msg.textContent).toContain('Cesar Alva');
    expect(msg.textContent).toContain('1 result');

    sel('matrixPlayerA').value = 'p1';
    sel('matrixPlayerB').value = 'p3';
    await app.submitMatrixResult();
    expect(msg.textContent).toContain('2 results');
  });

  it('resets the count when the form is reopened', async () => {
    app.openAddDrillModal();
    sel('matrixPlayerA').value = 'p1';
    sel('matrixPlayerB').value = 'p2';
    await app.submitMatrixResult();
    app.openAddDrillModal();
    sel('matrixPlayerA').value = 'p1';
    sel('matrixPlayerB').value = 'p3';
    await app.submitMatrixResult();
    expect(document.getElementById('matrixFormError')!.textContent).toContain('1 result');
  });

  it('still closes after editing an existing result', async () => {
    // An edit is one deliberate correction, not a run of entries.
    app.data.matrixLogs = [{
      id: 'log-1', player_a_id: 'p1', player_b_id: 'p3',
      outcome: 'a', score_text: '', occurred_on: '2026-08-20', drill_id: null
    }];
    app.openAddDrillModal('log-1');
    await app.submitMatrixResult();
    expect(closed).toBe(true);
  });

  it('reports a refusal in red rather than claiming success', async () => {
    (globalThis as any).supabaseService.logMatrixResult =
      async () => ({ ok: false, error: 'Only a coach of this team can record results.' });
    app.openAddDrillModal();
    sel('matrixPlayerA').value = 'p1';
    sel('matrixPlayerB').value = 'p2';
    await app.submitMatrixResult();
    const msg = document.getElementById('matrixFormError')!;
    expect(msg.textContent).toContain('Only a coach');
    expect(msg.style.color).toContain('danger');
    // A refusal must not leave the players cleared, or the coach retypes them.
    expect(sel('matrixPlayerA').value).toBe('p1');
  });

  it('clears a previous edit when reopened for a new result', () => {
    // Reopening after an edit must not carry that result's players over, or
    // "record" would silently overwrite the row just edited.
    app.data.matrixLogs = [{
      id: 'log-1', player_a_id: 'p1', player_b_id: 'p3',
      outcome: 'a', score_text: '', occurred_on: '2026-08-20', drill_id: null
    }];
    app.openAddDrillModal('log-1');
    app.openAddDrillModal();
    expect(sel('matrixPlayerA').value).toBe('');
    expect(sel('matrixPlayerB').value).toBe('');
    expect((document.getElementById('matrixLogId') as HTMLInputElement).value).toBe('');
  });
});
