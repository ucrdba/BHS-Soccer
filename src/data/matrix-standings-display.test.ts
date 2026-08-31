/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from 'vitest';
import appCoreSrc from '../../public/js/app.core.js?raw';
import matrixSrc from '../../public/js/views/matrix.view.js?raw';

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

interface MatrixApp {
  data: Record<string, any>;
  renderMatrixView(): string;
}

let app: MatrixApp;

beforeEach(() => {
  const w = globalThis as any;
  w.auth = {
    isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
    canAccessRatings: () => true, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'admin', status: 'active' }),
    getRole: () => 'admin'
  };
  w.can = () => true;
  w.supabaseService = { isConfigured: () => false };

  const ctor = new Function(
    [strip(appCoreSrc), strip(matrixSrc)].join('\n;\n') + '\nreturn BHSSoccerApp;'
  )() as { prototype: MatrixApp };
  app = Object.create(ctor.prototype) as MatrixApp;
  app.data = { players: [], matrixLogs: [], drillsBank: [], currentPracticePlan: [] };
  (app as any).renderMatrixResultsPanel = () => '';
  (app as any).activeTeamLabel = () => 'Varsity';
});

describe('standings table', () => {
  it('shows share, points, available and exercises', () => {
    app.data.players = [{
      id: 'p1', name: 'Cesar Alva', number: 9,
      matrixStats: { wins: 1, draws: 0, losses: 0, games: 1, exercises: 3, earned: 7, available: 7, share: 100, rank: 1 }
    }];
    const html = app.renderMatrixView();
    expect(html).toContain('SHARE');
    expect(html).toContain('AVAIL');
    expect(html).toContain('100.0%');
    expect(html).toContain('7');
  });

  it('shows a dash for a player with nothing scored', () => {
    // share is null when available is zero. Rendering "NaN%" is the failure
    // this replaces.
    app.data.players = [{
      id: 'p1', name: 'New Kid', number: 2,
      matrixStats: { wins: 0, draws: 0, losses: 0, games: 0, exercises: 0, earned: 0, available: 0, share: null, rank: 99 }
    }];
    const html = app.renderMatrixView();
    expect(html).not.toContain('NaN');
    expect(html).toContain('&mdash;');
  });

  it('orders by rank', () => {
    app.data.players = [
      { id: 'p2', name: 'Second', matrixStats: { share: 50, rank: 2, games: 1, exercises: 1, earned: 1, available: 2, wins: 0, draws: 0, losses: 1 } },
      { id: 'p1', name: 'First',  matrixStats: { share: 90, rank: 1, games: 1, exercises: 1, earned: 9, available: 10, wins: 1, draws: 0, losses: 0 } }
    ];
    const html = app.renderMatrixView();
    expect(html.indexOf('First')).toBeLessThan(html.indexOf('Second'));
  });
});
