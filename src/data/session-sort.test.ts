/**
 * The order and labelling of the session grid.
 *
 * The grid showed `#${p.number}` -- the SHIRT number -- which 0021 cleared for
 * the whole squad when it moved those values into recording_number. So every
 * row read "#—" and the coach could not match a row to the paper sheet in
 * front of them.
 *
 * Reordering has a trap of its own: the rows are re-rendered from scratch, so
 * anything typed but not yet saved lives only in the DOM. Sorting mid-entry
 * must not discard it.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import sessionSrc from '../../public/js/views/matrix-session.view.js?raw';
import { supabaseService } from './supabase';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, sessionSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

const TEAM = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b';
const DRILL = 'd1111111-1111-1111-1111-111111111111';

function makeApp(players?: any[]): any {
  const app = Object.create(ctor.prototype);
  app.activeTeamId = TEAM;
  app.data = {
    teams: [{ id: TEAM, name: 'Varsity', school_id: 's1' }],
    players: players || [
      { id: 'p3', name: 'Diesel Barron', recordingNumber: 3, number: null },
      { id: 'p1', name: 'Cesar Alva', recordingNumber: 1, number: null },
      { id: 'p2', name: 'Dencel Barajas', recordingNumber: 2, number: null }
    ],
    drillsBank: [{ id: DRILL, name: '3 Laps', points: 1.5, measure: 'time_bands' }]
  };
  app._sessionDrillId = DRILL;
  app._sessionBands = [{ max_seconds: 270, factor: 1 }, { max_seconds: 290, factor: 0.25 }];
  app.activeTeamLabel = () => ({ team: 'Varsity', org: 'Beaumont', season: '' });
  return app;
}

const mount = (app: any) => {
  document.body.innerHTML = `<div id="sessionRows">${app.renderSessionRows()}</div>`;
};

/** The players, in the order the grid rendered them. */
const order = () =>
  Array.from(document.querySelectorAll('[id^="sessionValue_"]'))
    .map(el => (el as HTMLElement).id.replace('sessionValue_', ''));

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  (window as any).supabaseService = {
    isConfigured: () => true,
    parseTimeToSeconds: (v: any) => supabaseService.parseTimeToSeconds(v),
    formatSecondsAsTime: (v: any) => supabaseService.formatSecondsAsTime(v),
    factorForTime: (s: any, b: any) => supabaseService.factorForTime(s, b)
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('what each row shows', () => {
  it('shows the recording number, which is what the paper sheet says', () => {
    mount(makeApp());
    const html = document.getElementById('sessionRows')!.innerHTML;
    expect(html).toContain('Cesar Alva');
    // The number is present as its own value, not as an empty "#—".
    expect(html).not.toContain('#—');
  });

  it('never shows the shirt number here, even when there is one', () => {
    // This screen is read alongside a paper sheet that carries recording
    // numbers. A second number beside each name is noise at best, and at worst
    // the one the coach types.
    mount(makeApp([{ id: 'p1', name: 'Cesar Alva', recordingNumber: 1, number: 9 }]));
    const html = document.getElementById('sessionRows')!.innerHTML;
    expect(html).not.toContain('shirt');
    expect(html).not.toContain('>9<');
  });
});

describe('the order players appear in', () => {
  it('leads with recording number, matching the paper sheet', () => {
    // The roster arrives in an arbitrary order; the sheet runs 1, 2, 3.
    mount(makeApp());
    expect(order()).toEqual(['p1', 'p2', 'p3']);
  });

  it('sorts by name when asked', () => {
    const app = makeApp();
    mount(app);
    app.setSessionSort('name');
    expect(order()).toEqual(['p1', 'p2', 'p3']);   // Alva, Barajas, Barron
  });

  it('puts a player with no recording number last, not first', () => {
    // A run of blanks at the top reads as broken data rather than a squad.
    const app = makeApp([
      { id: 'pX', name: 'Zach Unassigned', recordingNumber: null, number: null },
      { id: 'p1', name: 'Cesar Alva', recordingNumber: 1, number: null }
    ]);
    mount(app);
    expect(order()).toEqual(['p1', 'pX']);
  });

  it('offers both orders as controls', () => {
    mount(makeApp());
    const html = document.getElementById('sessionRows')!.innerHTML;
    expect(html).toContain("setSessionSort('number')");
    expect(html).toContain("setSessionSort('name')");
  });
});

describe('reordering mid-entry', () => {
  it('KEEPS times already typed', async () => {
    // The rows are re-rendered from scratch, so anything only in the DOM would
    // be lost. A coach who has entered fifteen times and then sorts must not
    // lose them.
    const app = makeApp();
    mount(app);
    (document.getElementById('sessionValue_p1') as HTMLInputElement).value = '4:28';
    (document.getElementById('sessionValue_p3') as HTMLInputElement).value = '4:55';

    app.setSessionSort('name');

    expect((document.getElementById('sessionValue_p1') as HTMLInputElement).value).toBe('4:28');
    expect((document.getElementById('sessionValue_p3') as HTMLInputElement).value).toBe('4:55');
  });

  it('keeps an attendance already changed', async () => {
    const app = makeApp();
    mount(app);
    (document.getElementById('sessionAttend_p2') as HTMLSelectElement).value = 'excused';

    app.setSessionSort('name');

    expect((document.getElementById('sessionAttend_p2') as HTMLSelectElement).value).toBe('excused');
  });
});
