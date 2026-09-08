/**
 * Which ground a route renders on.
 *
 * The ground is a function of the route, not of state: the touchline tools
 * are navy, the ratings are the ledger, everything else is paper. A route
 * that names no ground, or names one that does not exist, gets paper rather
 * than leaving the document unstyled.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { groundFor, applyGround, GROUNDS } from './ground';
import { router } from './index';

describe('groundFor', () => {
  it('returns the named ground', () => {
    expect(groundFor({ ground: 'pitch' })).toBe('pitch');
    expect(groundFor({ ground: 'ledger' })).toBe('ledger');
    expect(groundFor({ ground: 'paper' })).toBe('paper');
  });

  it('defaults to paper when the meta names nothing', () => {
    expect(groundFor({})).toBe('paper');
    expect(groundFor(undefined)).toBe('paper');
    expect(groundFor(null)).toBe('paper');
  });

  it('defaults to paper for a name that is not a ground', () => {
    expect(groundFor({ ground: 'navy' })).toBe('paper');
    expect(groundFor({ ground: 42 })).toBe('paper');
  });

  it('knows exactly three grounds', () => {
    expect(GROUNDS).toEqual(['paper', 'pitch', 'ledger']);
  });
});

describe('applyGround', () => {
  it('stamps the ground on the document element', () => {
    applyGround(document, 'ledger');
    expect(document.documentElement.dataset.ground).toBe('ledger');
  });

  it('tolerates no document at all', () => {
    expect(() => applyGround(undefined, 'pitch')).not.toThrow();
  });
});

describe('the router', () => {
  beforeEach(() => { document.documentElement.dataset.ground = 'ledger'; });

  it('applies the destination ground after every navigation', async () => {
    // Every route in this phase is paper, so navigating from a stale value
    // must reset it. The touchline and ledger routes arrive in phases 3–4.
    await router.push('/help');
    await router.isReady();
    expect(document.documentElement.dataset.ground).toBe('paper');
  });

  it('names a ground on every route', () => {
    for (const r of router.getRoutes()) {
      if (r.redirect) continue;
      expect(GROUNDS, r.path).toContain(r.meta.ground);
    }
  });

  it('routes the admin screen and the quiz, which the nav does not list', () => {
    const paths = router.getRoutes().map(r => r.path);
    expect(paths).toContain('/admin');
    expect(paths).toContain('/quiz');
  });

  it('puts the touchline tools on the pitch and the report on the ledger', () => {
    const byName = new Map(router.getRoutes().map(r => [String(r.name || ''), r]));
    expect(byName.get('lineup')?.meta.ground).toBe('pitch');
    expect(byName.get('live')?.meta.ground).toBe('pitch');
    expect(byName.get('season-report')?.meta.ground).toBe('ledger');
  });

  it('marks all three as tool chrome, so the shell steps aside', () => {
    const byName = new Map(router.getRoutes().map(r => [String(r.name || ''), r]));
    for (const name of ['lineup', 'live', 'season-report']) {
      expect(byName.get(name)?.meta.chrome, name).toBe('tool');
    }
  });

  it('takes a lineup with or without a fixture', () => {
    const paths = router.getRoutes().map(r => r.path);
    expect(paths).toContain('/schedule/lineup/:matchId?');
    expect(paths).toContain('/schedule/:matchId/live');
    expect(paths).toContain('/schedule/report');
  });

  it('puts session entry on the ledger ground as a tool', () => {
    const byName = new Map(router.getRoutes().map(r => [String(r.name || ''), r]));
    expect(byName.get('session-entry')?.meta.ground).toBe('ledger');
    expect(byName.get('session-entry')?.meta.chrome).toBe('tool');
    expect(router.getRoutes().map(r => r.path)).toContain('/matrix/session/:drillId');
  });

  it('puts the ratings on the ledger ground, with the shell still on', () => {
    const byName = new Map(router.getRoutes().map(r => [String(r.name || ''), r]));
    expect(byName.get('matrix')?.meta.ground).toBe('ledger');
    // Not a tool: the ratings are browsed to, so they keep the header and nav.
    expect(byName.get('matrix')?.meta.chrome).toBeUndefined();
  });
});
