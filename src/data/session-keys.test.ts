/**
 * Entering a session from the number pad.
 *
 * Results come off a paper sheet with one hand on the keys and the other
 * holding the sheet. Reaching for the mouse between every player is the slow
 * part, so Enter moves to the next field.
 *
 * Two rules matter. The order followed is the ORDER ON SCREEN, not the roster
 * order — the grid can be sorted, and tabbing has to follow what the eye
 * follows. And Enter must not submit: the modal is a form, and a stray submit
 * saves a half-entered session.
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

function makeApp(): any {
  const app = Object.create(ctor.prototype);
  app.activeTeamId = 't1';
  app.data = { players: [], drillsBank: [], teams: [] };
  return app;
}

/** The grid as it renders: a value input and an attendance select per row. */
function mount(ids: string[], kind: 'value' | 'outcome' = 'value') {
  document.body.innerHTML =
    '<div id="sessionRows">' +
    ids.map(id => kind === 'value'
      ? `<input id="sessionValue_${id}" />`
      : `<select id="sessionOutcome_${id}"><option value=""></option></select>`
    ).join('') +
    '</div><button id="sessionSaveBtn">Save</button>';
}

/** Press Enter on a field, the way a keyboard actually delivers it. */
function pressEnter(id: string, code = 'Enter') {
  const el = document.getElementById(id)!;
  el.focus();
  const ev = new KeyboardEvent('keydown', {
    key: 'Enter', code, bubbles: true, cancelable: true
  });
  el.dispatchEvent(ev);
  return ev;
}

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  (window as any).HTMLElement.prototype.scrollIntoView = function () {};
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('Enter moves to the next player', () => {
  it('moves down one field', () => {
    mount(['p1', 'p2', 'p3']);
    makeApp().attachSessionKeys();
    pressEnter('sessionValue_p1');
    expect(document.activeElement?.id).toBe('sessionValue_p2');
  });

  it('keeps going down the grid', () => {
    mount(['p1', 'p2', 'p3']);
    makeApp().attachSessionKeys();
    pressEnter('sessionValue_p1');
    pressEnter('sessionValue_p2');
    expect(document.activeElement?.id).toBe('sessionValue_p3');
  });

  it('works from the number pad, which reports a different code', () => {
    // Same key, different physical code. Both have to work or the feature
    // misses the keyboard it was asked for.
    mount(['p1', 'p2']);
    makeApp().attachSessionKeys();
    pressEnter('sessionValue_p1', 'NumpadEnter');
    expect(document.activeElement?.id).toBe('sessionValue_p2');
  });

  it('works on a win/draw/loss exercise too', () => {
    mount(['p1', 'p2'], 'outcome');
    makeApp().attachSessionKeys();
    pressEnter('sessionOutcome_p1');
    expect(document.activeElement?.id).toBe('sessionOutcome_p2');
  });

  it('never submits the form', () => {
    // The modal is a form. A stray submit saves a half-entered session.
    mount(['p1', 'p2']);
    makeApp().attachSessionKeys();
    const ev = pressEnter('sessionValue_p1');
    expect(ev.defaultPrevented).toBe(true);
  });

  it('goes to Save after the last player, not back to the top', () => {
    // Wrapping would put the cursor on the first player, whose value the next
    // keystroke would overwrite without anyone seeing it happen.
    mount(['p1', 'p2']);
    makeApp().attachSessionKeys();
    pressEnter('sessionValue_p2');
    expect(document.activeElement?.id).toBe('sessionSaveBtn');
  });

  it('follows the order on screen, not the roster order', () => {
    // After sorting by name the two differ, and the cursor has to follow what
    // the eye follows.
    mount(['p3', 'p1', 'p2']);
    makeApp().attachSessionKeys();
    pressEnter('sessionValue_p3');
    expect(document.activeElement?.id).toBe('sessionValue_p1');
  });

  it('ignores keys other than Enter', () => {
    mount(['p1', 'p2']);
    makeApp().attachSessionKeys();
    const el = document.getElementById('sessionValue_p1')!;
    el.focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement?.id).toBe('sessionValue_p1');
  });

  it('ignores Enter pressed somewhere that is not an entry field', () => {
    mount(['p1', 'p2']);
    document.getElementById('sessionRows')!.insertAdjacentHTML(
      'afterbegin', '<input id="sessionQuick" />');
    makeApp().attachSessionKeys();
    const ev = pressEnter('sessionQuick');
    // The Find box has its own Enter behaviour and must keep it.
    expect(ev.defaultPrevented).toBe(false);
  });

  it('still lands on the next field after the grid is redrawn repeatedly', () => {
    // The rows are replaced by innerHTML on every sort, so the binding runs
    // again each time. Stacked listeners happen to be harmless here — each
    // recomputes the index from the same e.target and focuses the same field —
    // but the guard keeps them from accumulating for the life of the modal.
    mount(['p1', 'p2', 'p3']);
    const app = makeApp();
    app.attachSessionKeys();
    app.attachSessionKeys();
    app.attachSessionKeys();
    pressEnter('sessionValue_p1');
    expect(document.activeElement?.id).toBe('sessionValue_p2');
  });
});

describe('the fields it walks', () => {
  it('finds every entry field in the grid', () => {
    mount(['p1', 'p2', 'p3']);
    expect(makeApp().sessionEntryFields()).toHaveLength(3);
  });

  it('is empty when the grid is not on screen', () => {
    document.body.innerHTML = '';
    expect(makeApp().sessionEntryFields()).toEqual([]);
  });

  it('leaves the attendance selects out of the walk', () => {
    // Attendance defaults to Here and is rarely touched; stopping at each one
    // would double the number of key presses for the common case.
    mount(['p1', 'p2']);
    document.getElementById('sessionRows')!.insertAdjacentHTML(
      'beforeend', '<select id="sessionAttend_p1"></select>');
    expect(makeApp().sessionEntryFields()).toHaveLength(2);
  });
});
