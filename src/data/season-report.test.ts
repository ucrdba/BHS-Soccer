/**
 * The season plus/minus report as it renders.
 *
 * The logic lives in season-stats.ts and is tested there. These cover the
 * things that can only go wrong in the view: what the coach is actually shown,
 * and — the point of the whole feature — that the players with barely any
 * minutes are among them.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import appCoreSrc from '../../public/js/app.core.js?raw';
import seasonSrc from '../../public/js/views/season.view.js?raw';
import * as plusMinus from './plus-minus';
import * as seasonStats from './season-stats';

let ctor: any;

beforeAll(() => {
  const w = globalThis as any;
  w.window = w;
  w.auth = {
    isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
    canAccessRatings: () => true, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'coach', status: 'active' }),
    getRole: () => 'coach'
  };
  w.can = () => true;
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  ctor = new Function(
    [appCoreSrc, seasonSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
});

const PLAYERS = [
  { id: 'p1', name: 'Cesar Alva',  number: 7 },
  { id: 'p2', name: 'Tom Budde',   number: 9 },
  { id: 'p3', name: 'Lenny Pelayo', number: 21 }   // the fringe player
];

function makeApp(): any {
  const a = Object.create(ctor.prototype);
  a.activeTeamId = 't1';
  a.data = {
    players: PLAYERS,
    schedule: [
      { id: 'f1', date: 'DEC 8 2026',  opponent: 'Sultana', isHome: false },
      { id: 'f2', date: 'DEC 11 2026', opponent: 'El Toro', isHome: false }
    ],
    teams: [{ id: 't1', school_id: 's1', name: 'Varsity' }]
  };
  a._seasonError = '';
  a._seasonMatches = null;
  return a;
}

/** A replayed fixture, minutes given per player for readability. */
const match = (id: string, date: string, opponent: string,
               who: Array<{ id: string; mins: number; score?: number; gd?: number }>) => ({
  statMatchId: id, matchId: null, date,
  sortKey: (makeApp() as any).seasonSortKey(date),
  opponent,
  stats: new Map(who.map(w => [w.id, {
    playerId: w.id, plus: Math.max(0, w.score ?? 0), minus: 0,
    score: w.score ?? 0, goalDiff: w.gd ?? 0,
    secondsPlayed: w.mins * 60, shots: 0, goals: 0, assists: 0, onPitch: false
  }]))
});

let app: any;
beforeEach(() => {
  (globalThis as any).window = globalThis as any;
  (window as any).plusMinus = plusMinus;
  (window as any).seasonStats = seasonStats;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  app = makeApp();
});

describe('a full match is eighty minutes, not ninety', () => {
  /**
   * High school plays two forty-minute halves, and club fixtures vary. Per-90
   * would inflate an 80-minute game by an eighth, so a player who was on the
   * whole time would show a rate above what they actually did — breaking the
   * one figure a coach can check against their memory of the match.
   */
  it('normalises to eighty by default', () => {
    expect(app.seasonFullMatchMinutes()).toBe(80);
  });

  it('takes the length from the team when it states one', () => {
    // A club U14 side on 60-minute games. Nothing may assume one length
    // across every organization in this database.
    app.data.teams = [{ id: 't1', school_id: 's1', name: 'U14 Boys', match_minutes: 60 }];
    expect(app.seasonFullMatchMinutes()).toBe(60);
  });

  it('ignores a nonsense length rather than dividing by it', () => {
    app.data.teams = [{ id: 't1', school_id: 's1', name: 'Varsity', match_minutes: 0 }];
    expect(app.seasonFullMatchMinutes()).toBe(80);
  });

  it('says which length it used, rather than leaving it to be assumed', () => {
    app._seasonMatches = [match('m1', 'DEC 8 2026', 'Sultana', [{ id: 'p1', mins: 80, score: 2 }])];
    const html = app.renderSeasonReport();
    expect(html).toContain('per 80 minutes');
    expect(html).not.toContain('per 90');
  });

  it('leaves a whole match played exactly as it was recorded', () => {
    // The sanity check: on for all eighty minutes with a net of +2 must read
    // +2.0, not +2.3.
    app._seasonMatches = [match('m1', 'DEC 8 2026', 'Sultana', [{ id: 'p1', mins: 80, score: 2 }])];
    expect(app.renderSeasonReport()).toContain('+2.0');
  });
});

describe('the players with barely any minutes', () => {
  /**
   * The whole reason the report exists in this shape. Unlimited substitution
   * means much of the squad plays a fraction of a match, and the coach reads
   * this to decide who to give MORE minutes to — so a threshold would hide
   * exactly the players being decided about.
   */
  const season = () => [
    match('m1', 'DEC 8 2026', 'Sultana', [
      { id: 'p1', mins: 80, score: 2, gd: 1 },
      { id: 'p3', mins: 5,  score: 1, gd: 1 }      // eight minutes and a plus
    ]),
    match('m2', 'DEC 11 2026', 'El Toro', [
      { id: 'p1', mins: 80, score: 1, gd: 0 },
      { id: 'p3', mins: 6,  score: 1, gd: 1 }
    ])
  ];

  it('lists the fringe player in the table', () => {
    app._seasonMatches = season();
    expect(app.renderSeasonReport()).toContain('Lenny Pelayo');
  });

  it('gives them a chart of their own', () => {
    app._seasonMatches = season();
    const html = app.renderSeasonReport();
    const block = html.slice(html.indexOf('Lenny Pelayo'));
    expect(block).toContain('<svg');
  });

  it('shows their rate at full size rather than softening it', () => {
    // 1 in 5 minutes of an 80-minute match is +16. It is not capped, smoothed
    // or rounded toward the pack: the number is the number.
    app._seasonMatches = [match('m1', 'DEC 8 2026', 'Sultana', [{ id: 'p3', mins: 5, score: 1 }])];
    expect(app.renderSeasonReport()).toContain('+16.0');
  });

  it('prints the minutes behind every point, so a wild rate reads as wild', () => {
    app._seasonMatches = season();
    expect(app.renderSeasonReport()).toMatch(/off \d+ min/);
  });

  it('draws a short outing smaller and fainter, but still draws it', () => {
    // Weight changes how a point LOOKS, never whether it exists. That is the
    // mechanism by which the uncertainty is shown instead of the player being
    // hidden.
    app._seasonMatches = season();
    const html = app.renderSeasonReport();
    const block = html.slice(html.indexOf('Lenny Pelayo'));
    const opacity = block.match(/opacity="([\d.]+)"/);
    expect(opacity).toBeTruthy();
    expect(Number(opacity![1])).toBeLessThan(1);
    expect(Number(opacity![1])).toBeGreaterThan(0);
  });
});

describe('what the table says', () => {
  it('sorts by the rate, not the raw total', () => {
    // A substitute outperforming a starter in the time they got is the thing
    // worth surfacing; raw totals would bury them under whoever played most.
    app._seasonMatches = [match('m1', 'DEC 8 2026', 'Sultana', [
      { id: 'p1', mins: 80, score: 3 },     // +3.0 per match
      { id: 'p3', mins: 10, score: 2 }      // +16.0 per match
    ])];
    const html = app.renderSeasonReport();
    expect(html.indexOf('Lenny Pelayo')).toBeLessThan(html.indexOf('Cesar Alva'));
  });

  it('shows a dash for a player who never got on, not a zero', () => {
    // Zero would rank them as an average performer. Absent and average are
    // different things and the table must not blur them.
    app._seasonMatches = [match('m1', 'DEC 8 2026', 'Sultana', [
      { id: 'p1', mins: 80, score: 2 },
      { id: 'p2', mins: 0 }
    ])];
    const html = app.renderSeasonReport();
    const row = html.slice(html.indexOf('Tom Budde'), html.indexOf('Tom Budde') + 400);
    expect(row).toContain('&mdash;');
  });

  it('puts a player with no rate last', () => {
    app._seasonMatches = [match('m1', 'DEC 8 2026', 'Sultana', [
      { id: 'p2', mins: 0 },
      { id: 'p1', mins: 80, score: 2 }
    ])];
    const html = app.renderSeasonReport();
    expect(html.indexOf('Cesar Alva')).toBeLessThan(html.indexOf('Tom Budde'));
  });
});

describe('the trend', () => {
  const four = (scores: number[]) => scores.map((sc, i) =>
    match('m' + i, ['DEC 8 2026','DEC 11 2026','DEC 14 2026','DEC 21 2026'][i],
          'Opp' + i, [{ id: 'p1', mins: 80, score: sc }]));

  it('calls a climbing season improving', () => {
    app._seasonMatches = four([0, 1, 2, 4]);
    expect(app.renderSeasonReport()).toContain('improving');
  });

  it('calls a falling season falling', () => {
    app._seasonMatches = four([4, 2, 1, 0]);
    expect(app.renderSeasonReport()).toContain('falling');
  });

  it('refuses to call a trend from two matches', () => {
    // An arrow on two data points is confidence about nothing.
    app._seasonMatches = four([0, 4]).slice(0, 2);
    const html = app.renderSeasonReport();
    expect(html).toContain('too few to call');
    expect(html).not.toContain('improving');
  });
});

describe('when there is nothing to show', () => {
  it('tells a coach how to start tracking', () => {
    app._seasonMatches = [];
    const html = app.renderSeasonReport();
    expect(html).toContain('No matches have been tracked yet');
    expect(html).toContain('Plus/Minus');
  });

  it('does NOT report an empty season when the read was refused', () => {
    // These tables are readable only by a coach of the team, so a refusal and
    // a genuinely empty season arrive looking identical. Reporting "no
    // matches" to someone who simply cannot see them states a falsehood.
    app._seasonError = 'Could not read the tracked matches. You must coach this team to see them.';
    const html = app.renderSeasonReport();
    expect(html).toContain('must coach this team');
    expect(html).not.toContain('No matches have been tracked');
  });
});

describe('ordering the season', () => {
  it('reads a displayed date into something that sorts', () => {
    expect(app.seasonSortKey('DEC 8 2026')).toBe('2026-12-08');
    expect(app.seasonSortKey('JAN 6 2027')).toBe('2027-01-06');
  });

  it('sorts across the new year the way the season ran', () => {
    // "JAN 6 2027" sorts before "DEC 8 2026" as plain text, which would run
    // the season backwards and take every running total with it.
    expect(app.seasonSortKey('DEC 8 2026')! < app.seasonSortKey('JAN 6 2027')!).toBe(true);
  });

  it('gives nothing for a date it cannot read', () => {
    expect(app.seasonSortKey('SOMEDAY')).toBeNull();
    expect(app.seasonSortKey('')).toBeNull();
  });
});
