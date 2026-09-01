/**
 * Daily thoughts were entirely dead in production, and silently.
 *
 * `daily_thoughts.school_id` is a UUID column, but every caller passes the
 * school CODE — `fetchDailyThoughts('bhs')`, `setActiveDailyThought('bhs', …)`.
 * Postgres rejected the cast with 22P02, the service logged to the console and
 * returned null, and the home page rendered an empty state. Nothing surfaced
 * to a coach; the only evidence was a database log line nobody reads.
 *
 * Every sibling that gets this right — fetchPlayers, fetchPracticePlans,
 * fetchCoaches, fetchDrillsForWeighting — resolves the code to a uuid first.
 * These four skipped it. So what these tests assert is not "the query works"
 * but "the code never reaches the database as a school_id", which is the
 * property that was missing.
 */

/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { supabaseService } from './supabase';

const svc = supabaseService as any;

const UUID = '7ebbe980-b87e-421f-a11f-788ca2519504';

/** Every value a query was filtered or written with, in order. */
let filters: { table: string; column?: string; value?: any }[];
let written: Record<string, any>[];

beforeEach(() => {
  filters = [];
  written = [];
  svc.isConfigured = () => true;
  svc._cachedSchoolUuidMap = null;

  svc.client = {
    from(table: string) {
      const api: any = {
        select() { return api; },
        or() { return api; },
        order() { return api; },
        limit() { return api; },
        maybeSingle: async () => ({ data: { id: UUID, code: 'bhs' }, error: null }),
        eq(column: string, value: any) {
          filters.push({ table, column, value });
          return api;
        },
        update(row: any) { written.push({ table, ...row }); return api; },
        insert(rows: any[]) { rows.forEach(r => written.push({ table, ...r })); return api; },
        upsert(rows: any[]) { rows.forEach(r => written.push({ table, ...r })); return api; },
        then(res: any) { return Promise.resolve({ data: [], error: null }).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

/** The literal that must never reach a uuid column. */
const sentCodeAsSchoolId = () =>
  filters.some(f => f.table === 'daily_thoughts' && f.column === 'school_id' && f.value === 'bhs') ||
  written.some(w => w.table === 'daily_thoughts' && w.school_id === 'bhs');

describe('reading daily thoughts', () => {
  it('resolves the school code to a uuid before filtering', async () => {
    await supabaseService.fetchDailyThoughts('bhs');
    expect(sentCodeAsSchoolId()).toBe(false);
    expect(filters.some(f => f.column === 'school_id' && f.value === UUID)).toBe(true);
  });

  it('resolves it for the active-thought read too', async () => {
    await supabaseService.fetchLatestDailyThoughts('bhs');
    expect(sentCodeAsSchoolId()).toBe(false);
    expect(filters.some(f => f.column === 'school_id' && f.value === UUID)).toBe(true);
  });

  it('passes a uuid straight through when given one', async () => {
    // getSchoolUuid returns a uuid unchanged, so callers that already hold one
    // are unaffected — which is what makes this safe to add everywhere.
    await supabaseService.fetchDailyThoughts(UUID);
    expect(filters.some(f => f.column === 'school_id' && f.value === UUID)).toBe(true);
  });
});

describe('writing daily thoughts', () => {
  it('writes a uuid, not the code', async () => {
    await supabaseService.upsertDailyThought('bhs', { text: 'Press high today.' });
    expect(sentCodeAsSchoolId()).toBe(false);
    expect(written.some(w => w.school_id === UUID)).toBe(true);
  });

  it('resolves before clearing the previously active thought', async () => {
    // This one had a second consequence: the "clear the old active one" update
    // matched nothing, so two thoughts could end up active at once.
    await supabaseService.setActiveDailyThought('bhs', 'thought-1');
    expect(sentCodeAsSchoolId()).toBe(false);
    expect(filters.some(f => f.column === 'school_id' && f.value === UUID)).toBe(true);
  });
});

describe('when the organization cannot be resolved', () => {
  beforeEach(() => {
    svc._cachedSchoolUuidMap = null;
    const base = svc.client.from;
    svc.client.from = (table: string) => {
      const api = base(table);
      if (table === 'schools') api.maybeSingle = async () => ({ data: null, error: null });
      return api;
    };
  });

  it('returns null rather than querying with an unusable value', async () => {
    expect(await supabaseService.fetchDailyThoughts('nosuchcode')).toBeNull();
    expect(filters.some(f => f.table === 'daily_thoughts')).toBe(false);
  });

  it('reports the failure on the write path instead of writing nothing quietly', async () => {
    const res = await supabaseService.upsertDailyThought('nosuchcode', { text: 'x' });
    expect(res.error).toBeTruthy();
    expect(written.some(w => w.table === 'daily_thoughts')).toBe(false);
  });
});
