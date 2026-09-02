/**
 * The number shown on the Competitive Rating Matrix.
 *
 * Both the standings table and the logged-results list printed `p.number` --
 * the SHIRT number. 0021 moved those values into recording_number and cleared
 * the shirt number for the whole squad, so every row read "#—".
 *
 * The Matrix is read alongside the paper sheets, and those carry recording
 * numbers. Showing a shirt number here would be the wrong number even when one
 * exists.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import matrixSrc from '../../public/js/views/matrix.view.js?raw';

let ctor: any;

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, matrixSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

function makeApp(players?: any[]): any {
  const app = Object.create(ctor.prototype);
  app.data = {
    players: players || [
      // A shirt number as well, to prove which one is chosen.
      { id: 'p1', name: 'Alain Renteria', recordingNumber: 18, number: 7,
        matrixStats: { rank: 1 }, seasonStats: {}, ratings: {} },
      { id: 'p2', name: 'Cesar Alva', recordingNumber: 1, number: null,
        matrixStats: { rank: 2 }, seasonStats: {}, ratings: {} }
    ],
    matrixLogs: [
      { id: 'l1', player_a_id: 'p1', player_b_id: 'p2', outcome: 'a',
        occurred_on: '2026-09-02', drill_id: null, is_deleted: false }
    ],
    drillsBank: [],
    matrixStandings: [],
    // renderMatrixView also draws today's plan panel.
    currentPracticePlan: []
  };
  app.activeTeamLabel = () => ({ team: 'Varsity', org: 'Beaumont', season: '2026' });
  // Rendered by matrix-session.view.js, which this test does not load.
  app.renderSessionHistory = () => '';
  app.sessionDrillOptions = () => '';
  return app;
}

beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  (window as any).auth = {
    isCoach: () => true, isAdmin: () => true, canAccessRatings: () => true, isLoggedIn: () => true
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the logged results list', () => {
  it('shows the recording number', () => {
    const html = makeApp().renderMatrixView();
    expect(html).toContain('(18)');
    expect(html).toContain('(1)');
  });

  it('does NOT show the shirt number', () => {
    // Alain's shirt is 7; that is the wrong number for this screen.
    const html = makeApp().renderMatrixView();
    expect(html).not.toContain('#7');
  });
});

describe('the standings table', () => {
  it('shows the recording number beside each player', () => {
    const html = makeApp().renderMatrixView();
    expect(html).toContain('Alain Renteria');
    expect(html).toContain('(18)');
  });

  it('does not print an empty "#—" for a player with no shirt number', () => {
    // The symptom that was reported: every row read "#—".
    const html = makeApp().renderMatrixView();
    expect(html).not.toContain('#—');
  });

  it('shows a dash for a player with no recording number, rather than nothing', () => {
    // Worth noticing: the paper sheet cannot identify them.
    const html = makeApp([
      { id: 'pX', name: 'Zach Unassigned', recordingNumber: null, number: 4,
        matrixStats: { rank: 1 }, seasonStats: {}, ratings: {} }
    ]).renderMatrixView();
    expect(html).toContain('—');
    expect(html).not.toContain('#4');
  });
});
