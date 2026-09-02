/**
 * Fixtures are team-scoped, and a school code must never reach the column.
 *
 * `schedule.team_id` is a uuid. Passing a school code like 'bhs' fails the cast
 * with 22P02, the service logs to the console and returns null, and the page
 * renders an empty state. That is not hypothetical: it is exactly how daily
 * thoughts stayed silently dead for months, found only in a Postgres log.
 *
 * upsertMatch already refused a MISSING team. It did not refuse a WRONG one,
 * which is the half that actually happened.
 *
 * These assert what reaches the query, not that a call returned.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;

const TEAM = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b';

let sent: any[];
let queried: boolean;

beforeEach(() => {
  sent = [];
  queried = false;
  svc.isConfigured = () => true;
  svc.client = {
    from() {
      queried = true;
      let rows: any[] = [];
      const api: any = {
        select() { return api; },
        or() { return api; },
        order() { return api; },
        eq() { return api; },
        upsert(newRows: any[]) {
          newRows.forEach(r => sent.push(r));
          rows = newRows.map((r, i) => ({ id: r.id || `new-${i}`, ...r }));
          return api;
        },
        then(res: any) { return Promise.resolve({ data: rows, error: null }).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const match = { opponent: 'Palm Springs', date: 'OCT 25', time: '5:00 PM', location: 'Home', isHome: true, status: 'UPCOMING' };

describe('saving a fixture', () => {
  it('sends the team id', async () => {
    await supabaseService.upsertMatch(TEAM, match);
    expect(sent[0].team_id).toBe(TEAM);
  });

  it('REFUSES a school code instead of letting it reach the column', async () => {
    // The whole point of this file.
    const res = await supabaseService.upsertMatch('bhs', match);
    expect(res).toBeNull();
    expect(queried).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('refuses any non-uuid, not just the one code we know about', async () => {
    for (const bad of ['', 'varsity', '123', 'null', 'undefined']) {
      sent = [];
      expect(await supabaseService.upsertMatch(bad, match)).toBeNull();
      expect(sent).toHaveLength(0);
    }
  });

  it('refuses a missing team rather than writing an unscoped fixture', async () => {
    // An unscoped row is invisible to every read that follows, so the caller
    // would report success over a permanent loss.
    expect(await supabaseService.upsertMatch(undefined as any, match)).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it('returns null on refusal, because the callers test truthiness', async () => {
    // Deliberately NOT {ok, error} like the newer methods: admin.js does
    // `return !!(await upsertMatch(...))` and `if (res)`, so an object would
    // make every refusal count as a success. The callers already treat a falsy
    // return as failure and say so to the coach.
    const res = await supabaseService.upsertMatch('bhs', match);
    expect(res).toBeNull();
    expect(res).not.toEqual(expect.objectContaining({ ok: false }));
  });
});

describe('reading the schedule', () => {
  it('reads with a real team id', async () => {
    await supabaseService.fetchSchedule(TEAM);
    expect(queried).toBe(true);
  });

  it('REFUSES a school code rather than querying with it', async () => {
    // Same gap on the read side: this returned null via a 22P02 round trip
    // instead of refusing up front, so the schedule silently rendered empty.
    const res = await supabaseService.fetchSchedule('bhs');
    expect(res).toBeNull();
    expect(queried).toBe(false);
  });

  it('refuses a missing team', async () => {
    expect(await supabaseService.fetchSchedule('')).toBeNull();
    expect(queried).toBe(false);
  });
});
