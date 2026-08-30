/**
 * Regression tests for the logged-results panel in the Competitive Matrix.
 *
 * Same technique as import-upsert.test.ts: load the real classic scripts from
 * public/js rather than reimplementing their logic, so there is no second copy
 * to drift (see CLAUDE.md on this repo's parallel-copies hazard).
 *
 * The case worth having here is winner marking. Each result stores an outcome
 * of 'a' | 'b' | 'draw' and the panel has to say who actually won. Getting that
 * backwards is silent — every row still renders, the leaderboard still adds up,
 * and the only symptom is that the wrong player is credited. The equivalent
 * inversion in the matrix_standings SQL was singled out in review for the same
 * reason, and this is the client-side half of it.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll } from 'vitest';

import dataSrc from '../../public/js/data.js?raw';
import diagrammerSrc from '../../public/js/diagrammer.js?raw';
import appCoreSrc from '../../public/js/app.core.js?raw';
import homeSrc from '../../public/js/views/home.view.js?raw';
import rosterSrc from '../../public/js/views/roster.view.js?raw';
import scheduleSrc from '../../public/js/views/schedule.view.js?raw';
import matrixSrc from '../../public/js/views/matrix.view.js?raw';
import plannerSrc from '../../public/js/views/planner.view.js?raw';
import coachesSrc from '../../public/js/views/coaches.view.js?raw';
import adminSrc from '../../public/js/admin.js?raw';

interface MatrixApp {
  data: Record<string, any>;
  renderMatrixResultsPanel(): string;
  renderMatrixView(): string;
}

let app: MatrixApp;
let isCoach = true;

beforeAll(() => {
  // utils.js is deliberately absent: it boots the app on DOM ready and starts
  // timers. These are pure render methods and need none of that.
  const sources = [dataSrc, diagrammerSrc, appCoreSrc, homeSrc, rosterSrc,
                   scheduleSrc, matrixSrc, plannerSrc, coachesSrc, adminSrc];
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

  const w = globalThis as any;
  w.auth = {
    isCoach: () => isCoach, isAdmin: () => false, isLoggedIn: () => true,
    canAccessRatings: () => true, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'coach', status: 'active' }),
    getRole: () => 'coach'
  };
  w.can = () => true;
  w.supabaseService = { isConfigured: () => false };

  // One evaluation, mirroring the shared global lexical scope a browser gives
  // classic scripts — separate eval calls would not see each other's classes.
  const ctor = new Function(sources.map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;')();
  app = Object.create(ctor.prototype) as MatrixApp;
});

const player = (id: string, name: string, number: number) => ({
  id, name, number, position: 'Midfielder', classYear: 'Senior', photo: null,
  seasonStats: { goals: 0, assists: 0, games: 0 },
  ratings: { technical: 80, tactical: 80, physical: 80, mental: 80 },
  matrixStats: { wins: 0, draws: 0, losses: 0, games: 0, points: 0, winPct: null, rank: 1 }
});

const baseData = () => ({
  players: [player('uuid-a', 'Cesar Alva', 9), player('uuid-b', 'Caleb Carver', 10)],
  drillsBank: [{ id: 'uuid-d', name: '1v1 Gauntlet' }],
  schedule: [], coaches: [], practicePlans: [], dailyThoughts: [], soccerCategories: [],
  quizQuestions: [], currentPracticePlan: [], matrixLogs: [] as any[],
  schoolInfo: { name: 'Beaumont High School', code: 'bhs' }
});

const result = (over: Record<string, any>) => ({
  id: 'log-1', player_a_id: 'uuid-a', player_b_id: 'uuid-b',
  outcome: 'a', score_text: '3 - 2', occurred_on: '2026-08-20', drill_id: null, ...over
});

describe('renderMatrixResultsPanel', () => {
  it('explains what the panel is for when nothing has been logged', () => {
    app.data = baseData();
    const html = app.renderMatrixResultsPanel();
    expect(html).toContain('No results recorded yet');
  });

  it("credits player A when the outcome is 'a'", () => {
    app.data = { ...baseData(), matrixLogs: [result({ outcome: 'a' })] };
    const html = app.renderMatrixResultsPanel();
    // The winner is named before "beat".
    expect(html.indexOf('Cesar Alva')).toBeLessThan(html.indexOf('beat'));
  });

  it("credits player B — not player A — when the outcome is 'b'", () => {
    app.data = { ...baseData(), matrixLogs: [result({ outcome: 'b' })] };
    const html = app.renderMatrixResultsPanel();
    // If this inverts, every recorded result credits the wrong player and
    // nothing else about the page looks wrong.
    expect(html.indexOf('Caleb Carver')).toBeLessThan(html.indexOf('beat'));
  });

  it("renders a draw as a draw rather than a win", () => {
    app.data = { ...baseData(), matrixLogs: [result({ outcome: 'draw' })] };
    const html = app.renderMatrixResultsPanel();
    expect(html).toContain('drew with');
    expect(html).not.toContain('beat');
  });

  it('labels a player who has left the roster instead of rendering undefined', () => {
    app.data = { ...baseData(), matrixLogs: [result({ player_b_id: 'uuid-gone' })] };
    const html = app.renderMatrixResultsPanel();
    expect(html).toContain('(removed player)');
    expect(html).not.toContain('undefined');
  });

  it('wires edit and delete to the row id', () => {
    app.data = { ...baseData(), matrixLogs: [result({ id: 'log-42' })] };
    const html = app.renderMatrixResultsPanel();
    expect(html).toContain("openAddDrillModal('log-42')");
    expect(html).toContain("deleteMatrixResult('log-42')");
  });

  it('resolves the drill name, and tolerates a result with no drill', () => {
    app.data = { ...baseData(), matrixLogs: [result({ drill_id: 'uuid-d' }), result({ id: 'log-2', drill_id: null })] };
    const html = app.renderMatrixResultsPanel();
    expect(html).toContain('1v1 Gauntlet');
  });
});

describe('renderMatrixView', () => {
  it('shows the results panel to a coach', () => {
    isCoach = true;
    app.data = { ...baseData(), matrixLogs: [result({})] };
    expect(app.renderMatrixView()).toContain('LOGGED RESULTS');
  });

  it('hides the results panel from everyone else', () => {
    isCoach = false;
    app.data = { ...baseData(), matrixLogs: [result({})] };
    const html = app.renderMatrixView();
    isCoach = true;
    // Editing results is a coach action; the standings themselves stay public.
    expect(html).not.toContain('LOGGED RESULTS');
  });
});
