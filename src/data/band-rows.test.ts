/**
 * Adding and removing standards rows.
 *
 * The first version rendered "however many bands are saved, plus one spare".
 * That meant a coach could only ever add ONE band per save-and-reopen cycle:
 * fill the spare, save, close, reopen to get another spare. Setting three
 * standards took three round trips, and nothing on screen suggested that was
 * the trick.
 *
 * The fix is an explicit Add button, which needs the typed values to survive
 * the re-render. Hence a draft: what is in the boxes right now, not what is in
 * the database.
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

function makeApp(drafts: any = null): any {
  const app = Object.create(ctor.prototype);
  app.activeTeamId = TEAM;
  app.data = { teams: [{ id: TEAM, name: 'Varsity', school_id: 's1' }] };
  app._weightDrills = [{ id: DRILL, name: '3 Laps', points: 1.5, measure: 'time_bands' }];
  app._weightBands = drafts || { [DRILL]: [] };
  app.activeTeamLabel = () => ({ team: 'Varsity', org: 'Beaumont', season: '' });
  return app;
}

/** Put the rendered rows into the DOM the way the modal does. */
function mount(app: any) {
  document.body.innerHTML = `<div id="matrixWeightsRows">${app.renderWeightsRows()}</div>`;
}

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  (window as any).supabaseService = {
    isConfigured: () => true,
    formatSecondsAsTime: (v: any) => supabaseService.formatSecondsAsTime(v),
    parseTimeToSeconds: (v: any) => supabaseService.parseTimeToSeconds(v)
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the rows a coach starts with', () => {
  it('offers one empty row when no standards are set', () => {
    const app = makeApp();
    mount(app);
    expect(document.querySelectorAll(`[id^="bandTime_${DRILL}_"]`).length).toBe(1);
  });

  it('shows each saved standard as mm:ss', () => {
    const app = makeApp({ [DRILL]: [{ time: '4:30', factor: 1 }, { time: '4:40', factor: 0.5 }] });
    mount(app);
    const boxes = Array.from(document.querySelectorAll(`[id^="bandTime_${DRILL}_"]`)) as HTMLInputElement[];
    expect(boxes.map(b => b.value)).toEqual(['4:30', '4:40']);
  });

  it('offers a way to add another', () => {
    const app = makeApp();
    mount(app);
    expect(document.getElementById('matrixWeightsRows')!.innerHTML).toContain('addBandRow');
  });
});

describe('adding a standard', () => {
  it('adds a row without losing what is already typed', async () => {
    // The bug: a re-render that reads from the database would blank the row
    // the coach just filled but has not saved.
    const app = makeApp();
    mount(app);
    (document.getElementById(`bandTime_${DRILL}_0`) as HTMLInputElement).value = '4:30';
    (document.getElementById(`bandFactor_${DRILL}_0`) as HTMLInputElement).value = '1';

    app.addBandRow(DRILL);

    const times = Array.from(document.querySelectorAll(`[id^="bandTime_${DRILL}_"]`)) as HTMLInputElement[];
    expect(times.length).toBe(2);
    expect(times[0].value).toBe('4:30');
    expect(times[1].value).toBe('');
    expect((document.getElementById(`bandFactor_${DRILL}_0`) as HTMLInputElement).value).toBe('1');
  });

  it('lets three standards be set in one sitting', async () => {
    // What the coach actually wanted: 4:30, 4:40, 4:50 without saving between.
    const app = makeApp();
    mount(app);
    const type = (i: number, t: string, f: string) => {
      (document.getElementById(`bandTime_${DRILL}_${i}`) as HTMLInputElement).value = t;
      (document.getElementById(`bandFactor_${DRILL}_${i}`) as HTMLInputElement).value = f;
    };
    type(0, '4:30', '1');
    app.addBandRow(DRILL);
    type(1, '4:40', '0.5');
    app.addBandRow(DRILL);
    type(2, '4:50', '0.25');

    expect(app.readBandRows(DRILL)).toEqual([
      { time: '4:30', factor: '1' },
      { time: '4:40', factor: '0.5' },
      { time: '4:50', factor: '0.25' }
    ]);
  });
});

describe('removing a standard', () => {
  it('drops the row and keeps the others', async () => {
    const app = makeApp({
      [DRILL]: [{ time: '4:30', factor: 1 }, { time: '4:40', factor: 0.5 }, { time: '4:50', factor: 0.25 }]
    });
    mount(app);

    app.removeBandRow(DRILL, 1);

    const times = Array.from(document.querySelectorAll(`[id^="bandTime_${DRILL}_"]`)) as HTMLInputElement[];
    expect(times.map(t => t.value)).toEqual(['4:30', '4:50']);
  });

  it('keeps one empty row when the last standard is removed', async () => {
    // An empty section with no boxes would leave nothing to type into.
    const app = makeApp({ [DRILL]: [{ time: '4:30', factor: 1 }] });
    mount(app);
    app.removeBandRow(DRILL, 0);
    expect(document.querySelectorAll(`[id^="bandTime_${DRILL}_"]`).length).toBe(1);
  });
});

describe('reading the rows back', () => {
  it('returns what is in the boxes, not what was saved', async () => {
    const app = makeApp({ [DRILL]: [{ time: '4:30', factor: 1 }] });
    mount(app);
    (document.getElementById(`bandTime_${DRILL}_0`) as HTMLInputElement).value = '4:25';
    expect(app.readBandRows(DRILL)).toEqual([{ time: '4:25', factor: '1' }]);
  });
});
