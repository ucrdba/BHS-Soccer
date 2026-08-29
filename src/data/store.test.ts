import { describe, it, expect } from 'vitest';
import { initialState, resolveFetch } from './store';

const cached = { rows: [{ id: 'cached' }], fetchedAt: 100 };

describe('resolveFetch', () => {
  it('starts in loading with no rows', () => {
    expect(initialState()).toEqual({
      rows: [], status: 'loading', fetchedAt: null, error: null,
    });
  });

  it('is ready when rows come back', () => {
    const s = resolveFetch({
      result: { ok: true, rows: [{ id: 'a' }] }, cached, sessionValid: true, now: 200,
    });
    expect(s.status).toBe('ready');
    expect(s.rows).toEqual([{ id: 'a' }]);
    expect(s.fetchedAt).toBe(200);
  });

  // The governing rule: empty is a real answer, not a trigger to fall back.
  it('is ready with zero rows and does NOT fall back to cache', () => {
    const s = resolveFetch({
      result: { ok: true, rows: [] }, cached, sessionValid: true, now: 200,
    });
    expect(s.status).toBe('ready');
    expect(s.rows).toEqual([]);
  });

  // The RLS trap: an expired session is filtered silently to zero rows, not a 403.
  it('is error when empty arrives on an invalid session', () => {
    const s = resolveFetch({
      result: { ok: true, rows: [] }, cached, sessionValid: false, now: 200,
    });
    expect(s.status).toBe('error');
    expect(s.error).toMatch(/session/i);
  });

  it('is stale with cached rows when the fetch fails and a cache exists', () => {
    const s = resolveFetch({
      result: { ok: false, error: 'network down' }, cached, sessionValid: true, now: 200,
    });
    expect(s.status).toBe('stale');
    expect(s.rows).toEqual([{ id: 'cached' }]);
    expect(s.fetchedAt).toBe(100);
    expect(s.error).toBe('network down');
  });

  it('is error with no rows when the fetch fails and there is no cache', () => {
    const s = resolveFetch({
      result: { ok: false, error: 'network down' }, cached: null, sessionValid: true, now: 200,
    });
    expect(s.status).toBe('error');
    expect(s.rows).toEqual([]);
  });

  // Same guard as above, but with no cache present — proves the invalid-session
  // check fires on its own rather than only when cached rows exist to compare against.
  it('is error on an invalid session even when there is no cache to fall back to', () => {
    const s = resolveFetch({
      result: { ok: true, rows: [] }, cached: null, sessionValid: false, now: 200,
    });
    expect(s.status).toBe('error');
  });
});
