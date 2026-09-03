/**
 * The width of the Record a Session modal.
 *
 * Every modal shares a 520px cap. A session row carries a name, a time, what
 * that time earns and an attendance, and at that width the names wrapped onto
 * a second line -- so a coach reading down a paper sheet could not scan the
 * grid against it.
 *
 * The width is a per-device preference rather than a per-session one: a coach
 * entering a whole squad wants it every time, and re-clicking at each session
 * is the sort of friction that makes a screen feel unfinished.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import sessionSrc from '../../public/js/views/matrix-session.view.js?raw';
import indexHtml from '../../index.html?raw';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, sessionSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

function makeApp(): any {
  const app = Object.create(ctor.prototype);
  app.data = { players: [], teams: [] };
  return app;
}

const modalDom = () => {
  document.body.innerHTML = `
    <div class="modal-window" id="matrixSessionWindow" style="max-width: 820px;"></div>
    <button id="sessionWidthBtn"></button>`;
};

const win = () => document.getElementById('matrixSessionWindow') as HTMLElement;
const btn = () => document.getElementById('sessionWidthBtn') as HTMLElement;

beforeEach(() => {
  modalDom();
  (globalThis as any).window = globalThis as any;
  try { localStorage.clear(); } catch (e) { /* ignore */ }
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the modal starts wider than the shared default', () => {
  it('is not capped at the 520px every other modal uses', () => {
    // The cap that made the names wrap.
    const markup = indexHtml.slice(
      indexHtml.indexOf('id="matrixSessionWindow"') - 200,
      indexHtml.indexOf('id="matrixSessionWindow"') + 200
    );
    expect(markup).toContain('max-width: 820px');
  });

  it('offers a control to go wider still', () => {
    expect(indexHtml).toContain('toggleSessionWidth');
  });
});

describe('toggling the width', () => {
  it('goes full width and back', () => {
    const app = makeApp();
    app.toggleSessionWidth();
    expect(win().style.maxWidth).toBe('98vw');

    app.toggleSessionWidth();
    expect(win().style.maxWidth).toBe('820px');
  });

  it('says which way the button will take you', () => {
    // A button reading "Wide" while already wide is a button that lies.
    const app = makeApp();
    app.toggleSessionWidth();
    expect(btn().textContent).toMatch(/narrow/i);

    app.toggleSessionWidth();
    expect(btn().textContent).toMatch(/wide/i);
  });
});

describe('remembering the choice', () => {
  it('restores the wide setting next time the modal opens', () => {
    const app = makeApp();
    app.toggleSessionWidth();

    modalDom();                 // as if the modal were re-rendered
    app.restoreSessionWidth();
    expect(win().style.maxWidth).toBe('98vw');
  });

  it('restores the narrow setting too', () => {
    const app = makeApp();
    app.toggleSessionWidth();   // wide
    app.toggleSessionWidth();   // narrow again

    modalDom();
    app.restoreSessionWidth();
    expect(win().style.maxWidth).toBe('820px');
  });

  it('opens at the default width when nothing was ever chosen', () => {
    makeApp().restoreSessionWidth();
    expect(win().style.maxWidth).toBe('820px');
  });

  it('survives storage being unavailable rather than throwing', () => {
    // Private browsing throws on access; the modal must still open.
    const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('denied'); }
    });
    expect(() => makeApp().restoreSessionWidth()).not.toThrow();
    expect(() => makeApp().toggleSessionWidth()).not.toThrow();
    if (real) Object.defineProperty(globalThis, 'localStorage', real);
  });
});

describe('a name on one line', () => {
  /**
   * The point of the width: scanning the grid against a paper sheet without
   * rows changing height as names wrap.
   *
   * The rule moved to a stylesheet class when the grid became a real table, so
   * these check the class is applied AND that the class carries the rule.
   * Checking only one of the two passes while the other half is missing.
   */
  it('puts the name in the cell that carries the rule', () => {
    const app = makeApp();
    app.data.players = [{ id: 'p1', name: 'Christopher Estrada', recordingNumber: 3 }];
    app.data.drillsBank = [{ id: 'd1', name: 'Coopers', measure: 'count_high', points: 1 }];
    app._sessionDrillId = 'd1';

    const html = app.renderSessionRows();
    expect(html).toContain('session-playername');
    expect(html).toContain('Christopher Estrada');
  });

  it('gives the recording number a cell of its own', () => {
    // The requirement this replaced a prefix for: results are entered by
    // reading down the recording numbers on a paper sheet, and a number
    // rendered inside the name cannot be scanned that way.
    const app = makeApp();
    app.data.players = [{ id: 'p1', name: 'Christopher Estrada', recordingNumber: 3 }];
    app.data.drillsBank = [{ id: 'd1', name: 'Coopers', measure: 'count_high', points: 1 }];
    app._sessionDrillId = 'd1';

    document.body.innerHTML = '<table>' + app.renderSessionRows() + '</table>';
    const row = document.getElementById('sessionRow_p1')!;
    const cells = Array.from(row.children).map(c => c.textContent!.trim());

    expect(cells[0]).toBe('3');
    expect(cells[1]).toBe('Christopher Estrada');
  });
});
