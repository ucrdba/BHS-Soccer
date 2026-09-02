/**
 * How a timed result reads in the Points Breakdown.
 *
 * A timed exercise stores seconds, and the breakdown printed the raw number.
 * So a coach saw "250" in the Result column, sitting next to Earned and Of --
 * which reads as a score rather than as 4:10, the time the player actually ran.
 *
 * The breakdown exists to answer "why that number?", so a timed row should say
 * both what was run and what it earned.
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

const TIMED = 'd-timed';
const COUNTED = 'd-counted';

function makeApp(): any {
  const app = Object.create(ctor.prototype);
  app.data = {
    players: [{ id: 'p1', name: 'Alain Renteria' }, { id: 'p2', name: 'Cesar Alva' }],
    drillsBank: [
      { id: TIMED, name: '3 Laps', measure: 'time_bands' },
      { id: COUNTED, name: 'Coopers', measure: 'count_high' },
      { id: 'd-lowtime', name: 'Sprint', measure: 'time_low' }
    ]
  };
  return app;
}

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  (window as any).supabaseService = {
    formatSecondsAsTime: (v: any) => supabaseService.formatSecondsAsTime(v)
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('a timed-standard result', () => {
  const row = (over: any = {}) => ({
    kind: 'time_band', drill_id: TIMED, raw_value: 250,
    weight: 1, earned: 1, available: 1, ...over
  });

  it('reads as a time, not as a bare number', () => {
    // The report: "for 3-430 I see a result of 250".
    expect(makeApp().breakdownDetail(row())).toContain('4:10');
    expect(makeApp().breakdownDetail(row())).not.toBe('250');
  });

  it('says what the time earned, which is the question a breakdown answers', () => {
    expect(makeApp().breakdownDetail(row())).toMatch(/earned 1\b/);
  });

  it('shows a part score as a part', () => {
    expect(makeApp().breakdownDetail(row({ raw_value: 285, earned: 0.25, available: 1 })))
      .toMatch(/4:45.*earned 0\.25/);
  });

  it('says plainly when a time met no standard', () => {
    // Zero earned is not the same as absent, and should not read like it.
    expect(makeApp().breakdownDetail(row({ raw_value: 400, earned: 0, available: 1 })))
      .toMatch(/6:40.*no standard/i);
  });

  it('scales the earned figure by the drill weight', () => {
    // On a drill weighted 1.5, full marks is 1.5 earned of 1.5 available --
    // still "1" of the exercise.
    expect(makeApp().breakdownDetail(row({ weight: 1.5, earned: 1.5, available: 1.5 })))
      .toMatch(/earned 1\b/);
  });
});

describe('other kinds of result are untouched', () => {
  it('leaves a counted exercise as a number', () => {
    // 2800 metres is not 46 minutes.
    const app = makeApp();
    expect(app.breakdownDetail({ kind: 'measured', drill_id: COUNTED, raw_value: 2800 })).toBe('2800');
  });

  it('formats a fastest-wins time as a time too', () => {
    const app = makeApp();
    expect(app.breakdownDetail({ kind: 'measured', drill_id: 'd-lowtime', raw_value: 250 })).toBe('4:10');
  });

  it('still phrases a head-to-head as who was beaten', () => {
    const app = makeApp();
    expect(app.breakdownDetail({ kind: 'head_to_head', detail: 'win', opponent_id: 'p2' }))
      .toBe('beat Cesar Alva');
  });

  it('still names a no-show and a row never entered', () => {
    const app = makeApp();
    expect(app.breakdownDetail({ kind: 'absent' })).toBe('no-show');
    expect(app.breakdownDetail({ kind: 'not_entered' })).toBe('not entered');
  });

  it('says "took part" when there is no value at all', () => {
    const app = makeApp();
    expect(app.breakdownDetail({ kind: 'measured', drill_id: COUNTED, raw_value: null })).toBe('took part');
  });
});
