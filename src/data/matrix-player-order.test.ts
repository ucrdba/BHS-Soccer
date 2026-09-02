/**
 * The order of the 1v1 player pickers.
 *
 * The options were sorted by name while the LABEL leads with the recording
 * number, so the list read "1 — Alva, 12 — Lanza, 13 — Lozano, 5 —
 * Bustillos…". Numbered but unordered, which is worse than either on its own:
 * a coach reading a number off a paper sheet has to scan the whole list for it.
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

function makeApp(players?: any[]): any {
  const app = Object.create(ctor.prototype);
  app.data = {
    players: players || [
      { id: 'p12', name: 'Ashton Lanza', lastName: 'Lanza', recordingNumber: 12 },
      { id: 'p1', name: 'Cesar Alva', lastName: 'Alva', recordingNumber: 1 },
      { id: 'p5', name: 'Luis Bustillos', lastName: 'Bustillos', recordingNumber: 5 },
      { id: 'p2', name: 'Dencel Barajas', lastName: 'Barajas', recordingNumber: 2 }
    ]
  };
  return app;
}

/** The player ids, in the order the options were written. */
const idsFrom = (html: string) =>
  Array.from(html.matchAll(/<option value="([^"]+)"/g))
    .map(m => m[1])
    .filter(Boolean);

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the order the pickers list players in', () => {
  it('runs by recording number, matching the paper sheet', () => {
    expect(idsFrom(makeApp().matrixPlayerOptions())).toEqual(['p1', 'p2', 'p5', 'p12']);
  });

  it('sorts numerically, not as text', () => {
    // As text, 12 sorts before 5. The whole point of the sheet is scanning to
    // a number, so 5 must come first.
    const ids = idsFrom(makeApp().matrixPlayerOptions());
    expect(ids.indexOf('p5')).toBeLessThan(ids.indexOf('p12'));
  });

  it('switches to SURNAME order when asked', () => {
    // Not full-name order: that puts "Ashton Lanza" before "Cesar Alva",
    // alphabetical by first name and not how anyone looks a player up.
    const app = makeApp();
    app._matrixSort = 'name';
    // Alva, Barajas, Bustillos, Lanza
    expect(idsFrom(app.matrixPlayerOptions())).toEqual(['p1', 'p2', 'p5', 'p12']);
  });

  it('puts a player with no recording number last', () => {
    // Number(null) is 0, which would otherwise put them at the very top.
    const app = makeApp([
      { id: 'pX', name: 'Zach Unassigned', recordingNumber: null },
      { id: 'p1', name: 'Cesar Alva', recordingNumber: 1 }
    ]);
    expect(idsFrom(app.matrixPlayerOptions())).toEqual(['p1', 'pX']);
  });

  it('still leads with a blank, so no pair is chosen by default', () => {
    // A pre-filled pair means one stray click records a result between two
    // arbitrary players.
    expect(makeApp().matrixPlayerOptions()).toMatch(/^<option value="">/);
  });

  it('labels each option with its recording number', () => {
    expect(makeApp().matrixPlayerOptions()).toContain('1 — Cesar Alva');
  });
});

describe('re-sorting mid-entry', () => {
  const dom = () => {
    document.body.innerHTML = `
      <select id="matrixPlayerA"></select>
      <select id="matrixPlayerB"></select>
      <span data-matrix-sort="number" class="active"></span>
      <span data-matrix-sort="name"></span>`;
  };

  it('KEEPS the players already chosen', () => {
    // Rewriting innerHTML drops a select's value, so a coach who had picked
    // both players and then re-sorted would silently lose them and could
    // record the result against nobody.
    const app = makeApp();
    dom();
    app.setMatrixSort('number');
    (document.getElementById('matrixPlayerA') as HTMLSelectElement).value = 'p5';
    (document.getElementById('matrixPlayerB') as HTMLSelectElement).value = 'p12';

    app.setMatrixSort('name');

    expect((document.getElementById('matrixPlayerA') as HTMLSelectElement).value).toBe('p5');
    expect((document.getElementById('matrixPlayerB') as HTMLSelectElement).value).toBe('p12');
  });

  it('marks which order is active', () => {
    const app = makeApp();
    dom();
    app.setMatrixSort('name');
    expect(document.querySelector('[data-matrix-sort="name"]')!.classList.contains('active')).toBe(true);
    expect(document.querySelector('[data-matrix-sort="number"]')!.classList.contains('active')).toBe(false);
  });
});
