/**
 * Entering a timed-standard session.
 *
 * The dangerous case is quiet and specific: `parseFloat("4:30")` is 4. Four
 * seconds is under every standard, so a coach typing a real time into a grid
 * that still parsed numbers would hand every player full marks for a run
 * nobody made, and the standings would move with nothing to show for it.
 *
 * The rest is about telling the coach what will happen before they save: what
 * a time earns as it is typed, and that a squad with no standards set will not
 * be scored at all.
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

const BANDS = [
  { max_seconds: 270, factor: 1 },
  { max_seconds: 280, factor: 0.5 },
  { max_seconds: 290, factor: 0.25 }
];

function makeApp(measure = 'time_bands', bands: any[] = BANDS): any {
  const app = Object.create(ctor.prototype);
  app.activeTeamId = TEAM;
  app.data = {
    teams: [{ id: TEAM, name: 'Varsity', school_id: 's1' }],
    players: [
      { id: 'p1', name: 'Cesar Alva', recordingNumber: 1 },
      { id: 'p2', name: 'Caleb Carver', recordingNumber: 6 }
    ],
    drillsBank: [{ id: DRILL, name: '3 Laps', points: 1.5, measure }]
  };
  app._sessionDrillId = DRILL;
  app._sessionBands = bands;
  app.activeTeamLabel = () => ({ team: 'Varsity', org: 'Beaumont', season: '' });
  return app;
}

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  // The real converters, so the test exercises the rule rather than a copy.
  (window as any).supabaseService = {
    isConfigured: () => true,
    parseTimeToSeconds: (v: any) => supabaseService.parseTimeToSeconds(v),
    formatSecondsAsTime: (v: any) => supabaseService.formatSecondsAsTime(v),
    factorForTime: (s: any, b: any) => supabaseService.factorForTime(s, b),
    fetchTimeBands: async () => BANDS
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

function grid(values: Record<string, string>, attend: Record<string, string> = {}) {
  document.body.innerHTML = Object.keys(values).map(id => `
    <input id="sessionValue_${id}" value="${values[id]}" />
    <select id="sessionAttend_${id}"><option value="${attend[id] || 'present'}" selected></option></select>
    <span id="sessionEarned_${id}"></span>`).join('');
}

describe('reading a time out of the grid', () => {
  it('stores mm:ss as seconds', async () => {
    grid({ p1: '4:30', p2: '4:45' });
    const rows = makeApp().collectSessionResults();
    expect(rows.find((r: any) => r.playerId === 'p1').rawValue).toBe(270);
    expect(rows.find((r: any) => r.playerId === 'p2').rawValue).toBe(285);
  });

  it('does NOT read "4:30" as the number 4', async () => {
    // The whole reason this test file exists. 4 seconds beats every standard.
    grid({ p1: '4:30', p2: '4:30' });
    const rows = makeApp().collectSessionResults();
    expect(rows.every((r: any) => r.rawValue !== 4)).toBe(true);
  });

  it('stores nothing for a time that will not parse', async () => {
    grid({ p1: 'fast', p2: '4:30' });
    const rows = makeApp().collectSessionResults();
    expect(rows.find((r: any) => r.playerId === 'p1').rawValue).toBeNull();
  });

  it('still reads a plain number for a counted exercise', async () => {
    // count_high has not changed: the mm:ss reading is only for banded drills.
    grid({ p1: '2800', p2: '2650' });
    const rows = makeApp('count_high').collectSessionResults();
    expect(rows.find((r: any) => r.playerId === 'p1').rawValue).toBe(2800);
  });

  it('sends no time for a player who was not there', async () => {
    grid({ p1: '4:30' }, { p1: 'excused' });
    const rows = makeApp().collectSessionResults();
    expect(rows.find((r: any) => r.playerId === 'p1').rawValue).toBeNull();
  });
});

describe('showing what a time earns as it is typed', () => {
  it('shows the factor for a time that meets a standard', () => {
    grid({ p1: '4:28' });
    makeApp().showBandEarned('p1');
    expect(document.getElementById('sessionEarned_p1')!.textContent).toContain('1');
  });

  it('shows the looser band for a slower time', () => {
    grid({ p1: '4:45' });
    makeApp().showBandEarned('p1');
    expect(document.getElementById('sessionEarned_p1')!.textContent).toContain('0.25');
  });

  it('says so plainly when a time meets no standard', () => {
    grid({ p1: '6:00' });
    makeApp().showBandEarned('p1');
    expect(document.getElementById('sessionEarned_p1')!.textContent).toMatch(/no band/i);
  });

  it('flags a time that is not a time', () => {
    grid({ p1: '430' in {} ? '' : 'four thirty' });
    makeApp().showBandEarned('p1');
    expect(document.getElementById('sessionEarned_p1')!.textContent).toMatch(/mm:ss/i);
  });

  it('shows nothing for an empty box rather than "no band"', () => {
    grid({ p1: '' });
    makeApp().showBandEarned('p1');
    expect(document.getElementById('sessionEarned_p1')!.textContent).toBe('');
  });
});

describe('a squad with no standards set', () => {
  it('warns that the exercise will not be scored for them', () => {
    // Otherwise the session saves, contributes nothing, and nothing says why.
    const html = makeApp('time_bands', []).renderSessionRows();
    expect(html).toMatch(/no standards set/i);
    expect(html).toMatch(/not be scored/i);
  });

  it('lists the standards when they exist', () => {
    const html = makeApp().renderSessionRows();
    expect(html).toContain('4:30');
    expect(html).toContain('4:50');
  });
});

describe('a full stop instead of a colon', () => {
  /**
   * A stopwatch reads 4:30 and a coach writing it down reaches for whichever
   * key is nearer. Both mean the same thing.
   *
   * Emphatically NOT decimal minutes: "4.30" is four minutes thirty, not four
   * and a third. Reading it the other way would score a player against the
   * wrong band and move the standings with nothing on screen to show for it.
   */
  it('reads 4.30 as four minutes thirty', () => {
    expect(supabaseService.parseTimeToSeconds('4.30')).toBe(270);
  });

  it('reads it the same as the colon form', () => {
    expect(supabaseService.parseTimeToSeconds('4.30'))
      .toBe(supabaseService.parseTimeToSeconds('4:30'));
  });

  it('is not decimal minutes', () => {
    // 4.30 decimal minutes would be 258 seconds. It must not be that.
    expect(supabaseService.parseTimeToSeconds('4.30')).not.toBe(258);
  });

  it('handles a leading zero in the seconds', () => {
    expect(supabaseService.parseTimeToSeconds('4.05')).toBe(245);
  });

  it('handles a double-digit minute', () => {
    expect(supabaseService.parseTimeToSeconds('12.45')).toBe(765);
  });

  it('still refuses sixty or more seconds', () => {
    expect(supabaseService.parseTimeToSeconds('4.60')).toBeNull();
    expect(supabaseService.parseTimeToSeconds('4.99')).toBeNull();
  });

  it('refuses a single digit after the stop, rather than guessing', () => {
    // "4.5" could be 4:05 or 4:50 and there is no way to tell. A rejected
    // entry is visible; a misread one is scored silently against a band.
    expect(supabaseService.parseTimeToSeconds('4.5')).toBeNull();
  });

  it('refuses more than one separator', () => {
    expect(supabaseService.parseTimeToSeconds('1.4.30')).toBeNull();
    expect(supabaseService.parseTimeToSeconds('4.30.')).toBeNull();
  });

  it('leaves a bare number meaning seconds', () => {
    expect(supabaseService.parseTimeToSeconds('270')).toBe(270);
  });

  it('still displays as mm:ss whichever way it was typed', () => {
    const s = supabaseService.parseTimeToSeconds('4.30')!;
    expect(supabaseService.formatSecondsAsTime(s)).toBe('4:30');
  });
});
