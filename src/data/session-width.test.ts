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
  it('does not wrap the player name', () => {
    // The whole point of the width: scanning the grid against a paper sheet.
    expect(sessionSrc).toContain('white-space:nowrap');
    expect(sessionSrc).toContain('text-overflow:ellipsis');
  });
});
