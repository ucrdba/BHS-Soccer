/**
 * Attendance on a timed test.
 *
 * Running the test is the whole point, so a player with no time did not run.
 * The grid therefore starts every row at NO-SHOW and flips to Here as a time
 * is entered — the other way round leaves the coach turning twenty-five
 * dropdowns to record the two who were missing.
 *
 * It matters beyond convenience: an unexcused absence scores 0 of the
 * exercise's weight, while an excused one appears in neither the earned nor
 * the available column. Which one a blank row lands on changes the standings.
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

const MEASURES = ['time_bands', 'time_low', 'count_high', 'win_loss'] as const;

function makeApp(measure: string): any {
  const app = Object.create(ctor.prototype);
  app.activeTeamId = 't1';
  app.data = {
    players: [
      { id: 'p1', name: 'Cesar Alva', recordingNumber: 1 },
      { id: 'p2', name: 'Tom Budde', recordingNumber: 2 }
    ],
    drillsBank: [{ id: 'd1', name: 'Drill', measure, points: 1 }],
    teams: []
  };
  app._sessionDrillId = 'd1';
  app._sessionBands = [{ max_seconds: 270, factor: 1 }];
  return app;
}

/** Render the grid and read a row's attendance as the browser would. */
function attendanceOf(app: any, playerId: string): string {
  document.body.innerHTML = '<table>' + app.renderSessionRows() + '</table>';
  return (document.getElementById('sessionAttend_' + playerId) as HTMLSelectElement).value;
}

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  (window as any).supabaseService = {
    isConfigured: () => true,
    formatSecondsAsTime: (v: any) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`,
    parseTimeToSeconds: () => 270,
    factorForTime: () => 1
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('what a fresh row starts on', () => {
  it('starts a timed-against-a-standard test at no-show', () => {
    expect(makeApp('time_bands').defaultSessionAttendance('time_bands')).toBe('unexcused');
  });

  it('starts a fastest-wins test at no-show', () => {
    expect(makeApp('time_low').defaultSessionAttendance('time_low')).toBe('unexcused');
  });

  it('leaves a counted exercise at Here, where taking part is normal', () => {
    expect(makeApp('count_high').defaultSessionAttendance('count_high')).toBe('present');
  });

  it('leaves a small-sided game at Here', () => {
    expect(makeApp('win_loss').defaultSessionAttendance('win_loss')).toBe('present');
  });

  it('reaches the rendered grid, not just the helper', () => {
    expect(attendanceOf(makeApp('time_bands'), 'p1')).toBe('unexcused');
    expect(attendanceOf(makeApp('count_high'), 'p1')).toBe('present');
  });

  it('starts every player that way, not only the first', () => {
    const app = makeApp('time_bands');
    document.body.innerHTML = '<table>' + app.renderSessionRows() + '</table>';
    ['p1', 'p2'].forEach(id => {
      expect((document.getElementById('sessionAttend_' + id) as HTMLSelectElement).value)
        .toBe('unexcused');
    });
  });
});

describe('entering a time', () => {
  function grid(measure: string) {
    const app = makeApp(measure);
    document.body.innerHTML = '<table>' + app.renderSessionRows() + '</table>';
    return app;
  }

  const set = (id: string, v: string) => {
    (document.getElementById('sessionValue_' + id) as HTMLInputElement).value = v;
  };
  const att = (id: string) =>
    (document.getElementById('sessionAttend_' + id) as HTMLSelectElement).value;

  it('marks the player Here', () => {
    const app = grid('time_bands');
    set('p1', '4:15');
    app.onSessionValueInput('p1', 'time_bands');
    expect(att('p1')).toBe('present');
  });

  it('leaves everyone else alone', () => {
    // Twenty-five rows: touching one must not touch the rest.
    const app = grid('time_bands');
    set('p1', '4:15');
    app.onSessionValueInput('p1', 'time_bands');
    expect(att('p2')).toBe('unexcused');
  });

  it('outranks whatever the dropdown said', () => {
    // A recorded time is evidence of attendance. If a coach marked somebody
    // excused and then entered their time, the time is the truth.
    const app = grid('time_bands');
    (document.getElementById('sessionAttend_p1') as HTMLSelectElement).value = 'excused';
    set('p1', '4:15');
    app.onSessionValueInput('p1', 'time_bands');
    expect(att('p1')).toBe('present');
  });

  it('goes back to no-show when the value is cleared', () => {
    // A mistyped entry deleted again must not leave somebody marked present
    // with nothing recorded against them.
    const app = grid('time_bands');
    set('p1', '4:15');
    app.onSessionValueInput('p1', 'time_bands');
    set('p1', '');
    app.onSessionValueInput('p1', 'time_bands');
    expect(att('p1')).toBe('unexcused');
  });

  it('treats whitespace as cleared', () => {
    const app = grid('time_bands');
    set('p1', '   ');
    app.onSessionValueInput('p1', 'time_bands');
    expect(att('p1')).toBe('unexcused');
  });

  it('reverts a counted exercise to Here, not to no-show', () => {
    // Clearing returns to the MEASURE's default, which differs by exercise.
    const app = grid('count_high');
    set('p1', '2600');
    app.onSessionValueInput('p1', 'count_high');
    set('p1', '');
    app.onSessionValueInput('p1', 'count_high');
    expect(att('p1')).toBe('present');
  });

  it('does not throw when the row is not on screen', () => {
    const app = grid('time_bands');
    expect(() => app.onSessionValueInput('nobody', 'time_bands')).not.toThrow();
  });
});

describe('every measure is accounted for', () => {
  it('gives each one a default rather than falling through to undefined', () => {
    // A new measure added without touching this returns present, which is the
    // safe direction: it can only over-credit attendance, never invent an
    // absence that costs a player points.
    const app = makeApp('count_high');
    MEASURES.forEach(m => {
      expect(['present', 'unexcused']).toContain(app.defaultSessionAttendance(m));
    });
    expect(app.defaultSessionAttendance('something_new')).toBe('present');
  });
});
