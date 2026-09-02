/**
 * Finding a player in Record a Session by recording number or name.
 *
 * Results are read off paper at the touchline, where a player is written as a
 * recording number or a scribbled surname. One box takes either, so the coach
 * never has to say which kind of thing they are typing — the same behaviour
 * RECORD DRILL RESULT already had.
 *
 * The rule worth protecting: this SCROLLS AND FOCUSES rather than filtering.
 * A session is entered for the whole squad, and hiding the other rows would
 * make it easy to save with players silently left out.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import sessionSrc from '../../public/js/views/matrix-session.view.js?raw';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, sessionSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

const FRIAS = { id: 'p2', name: 'Brendon Frias', recordingNumber: 34 };

let looked: string[];
let lookupResult: any;

function makeApp(): any {
  const app = Object.create(ctor.prototype);
  app.activeTeamId = 't1';
  app.data = { players: [{ id: 'p1', name: 'Kevin Corona', recordingNumber: 30 }, FRIAS] };
  return app;
}

/** The grid as it is rendered: a row and a value input per player. */
function mountGrid(ids: string[]) {
  document.body.innerHTML =
    '<input id="sessionQuick" /><span id="sessionQuickError"></span>' +
    ids.map(id =>
      `<div id="sessionRow_${id}" class="session-row"><input id="sessionValue_${id}" /></div>`
    ).join('');
}

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  looked = [];
  lookupResult = { ok: true, player: FRIAS };
  (window as any).supabaseService = {
    isConfigured: () => true,
    findPlayerOnTeam: async (_teamId: string, typed: string) => {
      looked.push(typed);
      return lookupResult;
    }
  };
  // jsdom implements neither of these on elements.
  (window as any).HTMLElement.prototype.scrollIntoView = function () {};
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('finding a player', () => {
  it('looks up whatever was typed, number or name', async () => {
    mountGrid(['p1', 'p2']);
    const app = makeApp();
    (document.getElementById('sessionQuick') as HTMLInputElement).value = '34';
    await app.jumpToSessionPlayer();
    expect(looked).toEqual(['34']);
  });

  it('accepts a surname just as readily', async () => {
    mountGrid(['p1', 'p2']);
    const app = makeApp();
    (document.getElementById('sessionQuick') as HTMLInputElement).value = 'Frias';
    await app.jumpToSessionPlayer();
    expect(looked).toEqual(['Frias']);
  });

  it('focuses that player\'s field, ready to type the result', async () => {
    mountGrid(['p1', 'p2']);
    const app = makeApp();
    (document.getElementById('sessionQuick') as HTMLInputElement).value = '34';
    await app.jumpToSessionPlayer();
    expect(document.activeElement?.id).toBe('sessionValue_p2');
  });

  it('marks the row so it can be seen among 25', async () => {
    mountGrid(['p1', 'p2']);
    const app = makeApp();
    (document.getElementById('sessionQuick') as HTMLInputElement).value = '34';
    await app.jumpToSessionPlayer();
    expect(document.getElementById('sessionRow_p2')!.classList.contains('session-row-found')).toBe(true);
  });

  it('clears the box, so the next number can be typed straight in', async () => {
    mountGrid(['p1', 'p2']);
    const app = makeApp();
    (document.getElementById('sessionQuick') as HTMLInputElement).value = '34';
    await app.jumpToSessionPlayer();
    expect((document.getElementById('sessionQuick') as HTMLInputElement).value).toBe('');
  });

  it('leaves every other row on screen', async () => {
    // The whole point of jumping rather than filtering: a session covers the
    // squad, and hidden rows would be saved as absent without anyone noticing.
    mountGrid(['p1', 'p2']);
    const app = makeApp();
    (document.getElementById('sessionQuick') as HTMLInputElement).value = '34';
    await app.jumpToSessionPlayer();
    expect(document.getElementById('sessionRow_p1')).not.toBeNull();
    expect(document.querySelectorAll('.session-row')).toHaveLength(2);
  });
});

describe('when it cannot be found', () => {
  it('says what the lookup said, rather than guessing', async () => {
    mountGrid(['p1', 'p2']);
    lookupResult = { ok: false, error: 'Two players are called Frias.' };
    const app = makeApp();
    (document.getElementById('sessionQuick') as HTMLInputElement).value = 'Frias';
    await app.jumpToSessionPlayer();
    expect(document.getElementById('sessionQuickError')!.textContent).toContain('Two players');
  });

  it('does not clear the box, so the entry can be corrected', async () => {
    mountGrid(['p1', 'p2']);
    lookupResult = { ok: false, error: 'No player with recording number 99.' };
    const app = makeApp();
    (document.getElementById('sessionQuick') as HTMLInputElement).value = '99';
    await app.jumpToSessionPlayer();
    expect((document.getElementById('sessionQuick') as HTMLInputElement).value).toBe('99');
  });

  it('says so when the player is on the team but not in this session', async () => {
    // Found on the squad, no row on screen: they joined after this session was
    // recorded. Silently doing nothing would read as a broken button.
    mountGrid(['p1']);
    const app = makeApp();
    (document.getElementById('sessionQuick') as HTMLInputElement).value = '34';
    await app.jumpToSessionPlayer();
    expect(document.getElementById('sessionQuickError')!.textContent).toContain('Brendon Frias');
  });

  it('does nothing at all on an empty box', async () => {
    mountGrid(['p1', 'p2']);
    const app = makeApp();
    await app.jumpToSessionPlayer();
    expect(looked).toEqual([]);
  });

  it('asks for a team before looking anything up', async () => {
    mountGrid(['p1', 'p2']);
    const app = makeApp();
    app.activeTeamId = null;
    (document.getElementById('sessionQuick') as HTMLInputElement).value = '34';
    await app.jumpToSessionPlayer();
    expect(looked).toEqual([]);
    expect(document.getElementById('sessionQuickError')!.textContent).toContain('team');
  });

  it('clears a previous error once a player is found', async () => {
    mountGrid(['p1', 'p2']);
    const app = makeApp();
    document.getElementById('sessionQuickError')!.textContent = 'Could not find that player.';
    (document.getElementById('sessionQuick') as HTMLInputElement).value = '34';
    await app.jumpToSessionPlayer();
    expect(document.getElementById('sessionQuickError')!.textContent).toBe('');
  });
});
