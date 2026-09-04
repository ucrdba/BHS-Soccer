/**
 * The phone navigation drawer.
 *
 * Under 640px the nav is a drawer rather than a bar. What it replaced was a
 * strip that scrolled sideways with its scrollbar hidden — the worst of both
 * worlds, because the items past the edge were there and nothing on screen
 * said so.
 *
 * The desktop bar is unchanged; everything here is about the drawer opening,
 * closing, and saying which it is.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import utilsSrc from '../../public/js/utils.js?raw';

let ctor: any;

beforeAll(() => {
  const w = globalThis as any;
  w.window = w;
  w.auth = {
    isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
    canAccessRatings: () => true, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'admin', status: 'active' }),
    getRole: () => 'admin'
  };
  w.can = () => true;
  // utils.js boots the app on DOM ready and reaches for the canvas class.
  w.SoccerTacticalBoard = function () { return {}; };

  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, utilsSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

function makeApp(): any {
  const app = Object.create(ctor.prototype);
  app.data = { players: [], teams: [], schedule: [], drillsBank: [] };
  app.activeTeamId = 't1';
  app.renderCurrentView = () => {};
  (globalThis as any).app = app;
  (window as any).app = app;
  return app;
}

/** The navbar as index.html declares it. */
function mount() {
  document.body.innerHTML = `
    <header class="navbar">
      <button id="navToggle" aria-expanded="false" aria-controls="navLinks">&#9776;</button>
      <ul class="nav-links" id="navLinks">
        <li class="nav-item" data-view="home">Home</li>
        <li class="nav-item" data-view="roster">Roster</li>
      </ul>
    </header>
    <main id="mainAppContainer"></main>`;
}

const list = () => document.getElementById('navLinks')!;
const btn = () => document.getElementById('navToggle')!;
const isOpen = () => list().classList.contains('open');

beforeEach(() => {
  mount();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('opening and closing', () => {
  it('starts closed', () => {
    makeApp();
    expect(isOpen()).toBe(false);
  });

  it('opens on the button', () => {
    const app = makeApp();
    app.toggleNavMenu();
    expect(isOpen()).toBe(true);
  });

  it('closes on a second press', () => {
    const app = makeApp();
    app.toggleNavMenu();
    app.toggleNavMenu();
    expect(isOpen()).toBe(false);
  });

  it('closes when told to, whether or not it was open', () => {
    const app = makeApp();
    app.closeNavMenu();
    expect(isOpen()).toBe(false);
    app.toggleNavMenu();
    app.closeNavMenu();
    expect(isOpen()).toBe(false);
  });

  it('does not throw when the navbar is not on the page', () => {
    // Every modal and print window is a document without this markup.
    document.body.innerHTML = '';
    const app = makeApp();
    expect(() => app.toggleNavMenu()).not.toThrow();
    expect(() => app.closeNavMenu()).not.toThrow();
  });
});

describe('saying which it is', () => {
  it('reports itself expanded when open', () => {
    // aria-expanded is not decoration: without it the button gives a screen
    // reader no way to tell an open menu from a closed one.
    const app = makeApp();
    app.toggleNavMenu();
    expect(btn().getAttribute('aria-expanded')).toBe('true');
  });

  it('reports itself collapsed when closed', () => {
    const app = makeApp();
    app.toggleNavMenu();
    app.toggleNavMenu();
    expect(btn().getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the attribute in step with the class', () => {
    const app = makeApp();
    [true, false, true].forEach(want => {
      app.setNavMenuOpen(want);
      expect(isOpen()).toBe(want);
      expect(btn().getAttribute('aria-expanded')).toBe(String(want));
    });
  });
});

describe('closing on the way out', () => {
  it('closes when a page is chosen', () => {
    // A drawer left open over the page it just navigated to reads as a bug.
    const app = makeApp();
    app.toggleNavMenu();
    app.switchView('roster');
    expect(isOpen()).toBe(false);
  });

  it('closes on Escape', () => {
    const app = makeApp();
    app.toggleNavMenu();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isOpen()).toBe(false);
  });

  it('closes on a tap outside it', () => {
    // A menu closable only by the button that opened it traps anyone who
    // opened it by accident.
    const app = makeApp();
    app.toggleNavMenu();
    document.getElementById('mainAppContainer')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }));
    expect(isOpen()).toBe(false);
  });

  it('stays open when the drawer itself is tapped', () => {
    const app = makeApp();
    app.toggleNavMenu();
    list().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(isOpen()).toBe(true);
  });

  it('stays open when the button is tapped, so it can toggle', () => {
    // The document listener runs on the same click as the button's own
    // handler. Without the guard the drawer would close as fast as it opened.
    const app = makeApp();
    app.toggleNavMenu();
    btn().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(isOpen()).toBe(true);
  });

  it('ignores a stray Escape when it is already closed', () => {
    makeApp();
    expect(() => document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))).not.toThrow();
    expect(isOpen()).toBe(false);
  });
});
