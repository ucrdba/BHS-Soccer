/**
 * Ordering the Record a Session grid.
 *
 * Results are entered from a paper sheet by reading down the recording
 * numbers, so that is the default order and the recording number is a column
 * of its own with a heading that sorts it.
 *
 * The rule that must survive: a player with no recording number stays last
 * whichever direction is asked for. Number(null) is 0, so the naive comparison
 * puts them above the whole squad, and a run of blanks at the top of a
 * data-entry grid reads as broken data.
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

/** Names and numbers deliberately disagree, so the two orders are distinct. */
const squad = () => [
  { id: 'p1', name: 'Zoe Alvarez', recordingNumber: 1 },
  { id: 'p2', name: 'Adam Corona', recordingNumber: 7 },
  { id: 'p3', name: 'Mia Davila', recordingNumber: 4 }
];

function makeApp(players: any[] = squad()): any {
  const app = Object.create(ctor.prototype);
  app.activeTeamId = 't1';
  app.data = {
    players,
    drillsBank: [{ id: 'd1', name: 'Coopers', measure: 'count_high', points: 1 }]
  };
  app._sessionDrillId = 'd1';
  return app;
}

/** The order the grid actually renders in. */
function rendered(app: any): string[] {
  document.body.innerHTML = '<table>' + app.renderSessionRows() + '</table>';
  return Array.from(document.querySelectorAll('.session-row')).map(r => r.id.replace('sessionRow_', ''));
}

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  document.body.innerHTML = '';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the default order', () => {
  it('is by recording number, because that is how the paper sheet reads', () => {
    expect(rendered(makeApp())).toEqual(['p1', 'p3', 'p2']);
  });

  it('is not name order, so the two cannot be confused', () => {
    const byName = squad().slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => p.id);
    expect(byName).not.toEqual(['p1', 'p3', 'p2']);
  });
});

describe('sorting the column', () => {
  const sorted = (by: string, clicks = 1) => {
    const app = makeApp();
    for (let i = 0; i < clicks; i++) app.setSessionSort(by);
    return rendered(app);
  };

  it('reverses on the FIRST click of #, since the grid already opens that way', () => {
    // _sessionSort starts unset while the grid is already in number order.
    // Comparing to the raw property rather than the order in force made this
    // click a no-op: the coach clicked and nothing moved.
    expect(sorted('number', 1)).toEqual(['p2', 'p3', 'p1']);
  });

  it('returns to ascending on the second', () => {
    expect(sorted('number', 2)).toEqual(['p1', 'p3', 'p2']);
  });

  it('sorts by name A to Z', () => {
    expect(sorted('name')).toEqual(['p2', 'p3', 'p1']);
  });

  it('reverses the name on a second click', () => {
    expect(sorted('name', 2)).toEqual(['p1', 'p3', 'p2']);
  });

  it('starts a newly clicked column in its own order', () => {
    // Carrying a reversal across would silently invert the new column.
    const app = makeApp();
    app.setSessionSort('name');
    app.setSessionSort('name');       // name, reversed
    app.setSessionSort('number');     // number, should be ascending
    expect(rendered(app)).toEqual(['p1', 'p3', 'p2']);
  });
});

describe('a player with no recording number', () => {
  const withBlank = () => [...squad(), { id: 'p4', name: 'Bea Nolast', recordingNumber: null }];

  it('sorts last ascending', () => {
    expect(rendered(makeApp(withBlank())).slice(-1)).toEqual(['p4']);
  });

  it('still sorts last when reversed', () => {
    // Number(null) is 0. Reversing a naive comparison puts them on top, and a
    // blank leading a data-entry grid reads as broken data.
    const app = makeApp(withBlank());
    app.setSessionSort('number');          // now descending
    expect(rendered(app).slice(-1)).toEqual(['p4']);
  });

  it('is shown with a dash rather than an empty cell', () => {
    const app = makeApp(withBlank());
    document.body.innerHTML = '<table>' + app.renderSessionRows() + '</table>';
    const cell = document.querySelector('#sessionRow_p4 .session-recnum')!;
    expect(cell.textContent!.trim()).toBe('—');
  });

  it('is still listed by name in name order', () => {
    // Looking somebody up by name should not hide them for lacking a number.
    const app = makeApp(withBlank());
    app.setSessionSort('name');
    expect(rendered(app)).toContain('p4');
  });
});

describe('the entry fields', () => {
  it('gives every player a field, whatever the order', () => {
    const app = makeApp();
    app.setSessionSort('name');
    document.body.innerHTML = '<table>' + app.renderSessionRows() + '</table>';
    squad().forEach(p => {
      expect(document.getElementById('sessionValue_' + p.id)).not.toBeNull();
      expect(document.getElementById('sessionAttend_' + p.id)).not.toBeNull();
    });
  });

  it('keeps a typed value when the order changes', () => {
    // Re-sorting redraws the rows. Losing what was typed would be worse than
    // not offering the sort at all.
    const app = makeApp();
    document.body.innerHTML =
      '<div id="sessionRows"><table>' + app.renderSessionRows() + '</table></div>';
    (document.getElementById('sessionValue_p2') as HTMLInputElement).value = '2600';

    app.setSessionSort('name');

    expect((document.getElementById('sessionValue_p2') as HTMLInputElement).value).toBe('2600');
  });
});
