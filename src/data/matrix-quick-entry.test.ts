/**
 * Entering a Matrix result from a paper sheet.
 *
 * The sheet carries recording numbers, not names, because handwriting is not
 * always readable. Scrolling a list of 24 names for each of a session's results
 * is the wrong shape for that, so a number can be typed instead.
 *
 * The property that matters: an entry that does not resolve must CLEAR the
 * selected player, not leave the previous one chosen. Otherwise a mistyped
 * number records the result against whoever was selected a moment ago, the
 * standings move, and nobody knows to look.
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

const TEAM = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b';
const CARVER = { id: 'p-carver', name: 'Caleb Carver', recordingNumber: 6 };

let lookupResult: any;
let lookedUp: any[];

function makeApp(): any {
  const app = Object.create(ctor.prototype);
  app.activeTeamId = TEAM;
  app.data = { players: [], teams: [{ id: TEAM, name: 'Varsity', school_id: 's1' }] };
  return app;
}

function entryDom(preselected = '') {
  document.body.innerHTML = `
    <input id="matrixQuickA" value="" />
    <select id="matrixPlayerA">
      <option value=""></option>
      <option value="p-carver">6 — Caleb Carver</option>
      <option value="p-alva">1 — Cesar Alva</option>
    </select>
    <div id="matrixFormError"></div>`;
  (document.getElementById('matrixPlayerA') as HTMLSelectElement).value = preselected;
}

beforeEach(() => {
  lookedUp = [];
  lookupResult = { ok: true, player: CARVER };
  (globalThis as any).window = globalThis as any;
  (window as any).supabaseService = {
    isConfigured: () => true,
    findPlayerOnTeam: async (t: string, v: any) => { lookedUp.push(v); return lookupResult; }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('typing a recording number', () => {
  it('selects the player holding that number', async () => {
    entryDom();
    const app = makeApp();
    (document.getElementById('matrixQuickA') as HTMLInputElement).value = '6';
    await app.resolveMatrixPlayer('A');

    expect(lookedUp).toEqual(['6']);
    expect((document.getElementById('matrixPlayerA') as HTMLSelectElement).value).toBe('p-carver');
  });

  it('accepts a name in the same box', async () => {
    entryDom();
    (document.getElementById('matrixQuickA') as HTMLInputElement).value = 'Carver';
    await makeApp().resolveMatrixPlayer('A');
    expect(lookedUp).toEqual(['Carver']);
    expect((document.getElementById('matrixPlayerA') as HTMLSelectElement).value).toBe('p-carver');
  });

  it('normalises the box to the recording number once resolved', async () => {
    // So the coach can see the sheet and the screen agree.
    entryDom();
    (document.getElementById('matrixQuickA') as HTMLInputElement).value = 'Caleb Carver';
    await makeApp().resolveMatrixPlayer('A');
    expect((document.getElementById('matrixQuickA') as HTMLInputElement).value).toBe('6');
  });

  it('clears any earlier error on success', async () => {
    entryDom();
    document.getElementById('matrixFormError')!.textContent = 'No player with recording number 17.';
    (document.getElementById('matrixQuickA') as HTMLInputElement).value = '6';
    await makeApp().resolveMatrixPlayer('A');
    expect(document.getElementById('matrixFormError')!.textContent).toBe('');
  });
});

describe('an entry that does not resolve', () => {
  it('CLEARS the selected player rather than leaving the last one', async () => {
    // The dangerous case. A mistyped number over a previous selection would
    // otherwise record the result against the wrong player.
    entryDom('p-alva');
    lookupResult = { ok: false, error: 'No player with recording number 17 on this team.' };
    (document.getElementById('matrixQuickA') as HTMLInputElement).value = '17';
    await makeApp().resolveMatrixPlayer('A');

    expect((document.getElementById('matrixPlayerA') as HTMLSelectElement).value).toBe('');
  });

  it('shows the reason, naming the number', async () => {
    entryDom();
    lookupResult = { ok: false, error: 'No player with recording number 17 on this team.' };
    (document.getElementById('matrixQuickA') as HTMLInputElement).value = '17';
    await makeApp().resolveMatrixPlayer('A');
    expect(document.getElementById('matrixFormError')!.textContent).toContain('17');
  });

  it('does nothing at all when the box is empty', async () => {
    entryDom('p-alva');
    await makeApp().resolveMatrixPlayer('A');
    expect(lookedUp).toHaveLength(0);
    expect((document.getElementById('matrixPlayerA') as HTMLSelectElement).value).toBe('p-alva');
  });

  it('asks for a team rather than searching without one', async () => {
    entryDom();
    const app = makeApp();
    app.activeTeamId = null;
    (document.getElementById('matrixQuickA') as HTMLInputElement).value = '6';
    await app.resolveMatrixPlayer('A');
    expect(lookedUp).toHaveLength(0);
    expect(document.getElementById('matrixFormError')!.textContent).toMatch(/team/i);
  });
});
