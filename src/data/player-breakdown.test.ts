/**
 * The per-player points breakdown.
 *
 * The lines come from matrix_exercise_points, which matrix_standings is an
 * aggregate of — so they sum to the leaderboard row the panel was opened from
 * by construction. That property is enforced in SQL (migration 0010's
 * self-check asserts it), which is exactly why none of the scoring arithmetic
 * is repeated here: these tests cover the rendering and the phrasing, not the
 * maths.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import sessionSrc from '../../public/js/views/matrix-session.view.js?raw';

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

let app: any;
let rows: any[] | null;

beforeEach(() => {
  document.body.innerHTML = `
    <div id="breakdownModal"><h3><span id="breakdownTitle"></span></h3><div id="breakdownBody"></div></div>`;

  rows = [
    { exercise: '1v1 Gauntlet', occurred_on: '2026-08-31', kind: 'head_to_head',
      detail: 'win', raw_value: null, attendance: 'present', weight: 3, earned: 3, available: 3,
      opponent_id: 'p2' },
    { exercise: 'Coopers', occurred_on: '2026-08-31', kind: 'measured',
      detail: null, raw_value: 2800, attendance: 'present', weight: 1.5, earned: 1.5, available: 1.5,
      opponent_id: null },
    { exercise: 'Finishing', occurred_on: '2026-08-24', kind: 'absent',
      detail: null, raw_value: null, attendance: 'unexcused', weight: 3, earned: 0, available: 3,
      opponent_id: null }
  ];

  const w = globalThis as any;
  w.auth = {
    isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
    canAccessRatings: () => true, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'admin', status: 'active' }),
    getRole: () => 'admin'
  };
  w.can = () => true;
  w.supabaseService = {
    isConfigured: () => true,
    fetchPlayerBreakdown: async () => rows
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  const ctor = new Function(
    [strip(appCoreSrc), strip(sessionSrc)].join('\n;\n') + '\nreturn BHSSoccerApp;'
  )() as any;
  app = Object.create(ctor.prototype);
  app.activeTeamId = 't1';
  app.data = { players: [
    { id: 'p1', name: 'Cesar Alva', number: 9 },
    { id: 'p2', name: 'Caleb Carver', number: 10 }
  ] };
});

describe('opening the breakdown', () => {
  it('names the player it was opened for', async () => {
    await app.openBreakdown('p1');
    expect(document.getElementById('breakdownTitle')!.textContent).toBe('Cesar Alva');
  });

  it('does nothing for a player who is not on the team', async () => {
    await app.openBreakdown('nobody');
    expect(document.getElementById('breakdownTitle')!.textContent).toBe('');
  });

  it('lists one line per exercise', async () => {
    await app.openBreakdown('p1');
    const html = document.getElementById('breakdownBody')!.innerHTML;
    expect(html).toContain('1v1 Gauntlet');
    expect(html).toContain('Coopers');
    expect(html).toContain('Finishing');
  });

  it('shows the total and the share', async () => {
    // 4.5 earned of 7.5 available = 60.0%
    await app.openBreakdown('p1');
    const html = document.getElementById('breakdownBody')!.innerHTML;
    expect(html).toContain('60.0%');
    expect(html).toContain('4.50');
    expect(html).toContain('7.50');
  });
});

describe('how each line reads', () => {
  const detail = (row: any) => {
    app.data.players = [{ id: 'p2', name: 'Caleb Carver' }];
    return app.breakdownDetail(row);
  };

  it('names the opponent for a 1v1', () => {
    // "win" alone does not tell a coach anything they cannot already see.
    expect(detail({ kind: 'head_to_head', detail: 'win', opponent_id: 'p2' })).toBe('beat Caleb Carver');
    expect(detail({ kind: 'head_to_head', detail: 'loss', opponent_id: 'p2' })).toBe('lost to Caleb Carver');
    expect(detail({ kind: 'head_to_head', detail: 'draw', opponent_id: 'p2' })).toBe('drew with Caleb Carver');
  });

  it('survives an opponent who has left the squad', () => {
    // Their result still scores, so the line must still read sensibly.
    expect(detail({ kind: 'head_to_head', detail: 'win', opponent_id: 'gone' })).toBe('beat an opponent');
  });

  it('shows the raw number for a measured test', () => {
    expect(detail({ kind: 'measured', raw_value: 2800 })).toBe('2800');
  });

  it('says no-show for an unexcused absence', () => {
    expect(detail({ kind: 'absent' })).toBe('no-show');
  });

  it('reads a small-sided result plainly', () => {
    expect(detail({ kind: 'win_loss', detail: 'win' })).toBe('won');
    expect(detail({ kind: 'win_loss', detail: 'loss' })).toBe('lost');
  });
});

describe('empty and failed states are different', () => {
  it('explains an empty breakdown, and says excused absences are absent by design', async () => {
    rows = [];
    await app.openBreakdown('p1');
    const html = document.getElementById('breakdownBody')!.innerHTML;
    expect(html).toContain('Nothing scored yet');
    expect(html).toContain('Excused absences do not appear');
  });

  it('reports a failed load rather than showing an empty breakdown', async () => {
    // null means the fetch failed; [] means the player genuinely has nothing.
    // Rendering both as "nothing scored" would hide an outage.
    rows = null;
    await app.openBreakdown('p1');
    expect(document.getElementById('breakdownBody')!.innerHTML).toContain('Could not load');
  });
});
