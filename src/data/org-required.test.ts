/**
 * No organization means no data — never somebody else's.
 *
 * Fifteen service methods used to substitute `'bhs'` when called without an
 * organization. The parameter has been required by TypeScript for a while and
 * the untypechecked legacy callers are gone, but `tsconfig` runs with
 * `strict: false`, so `fetchPlayers(org.school?.id)` still compiles and still
 * passes `undefined` at runtime — and a club coach was then served Beaumont's
 * roster, staff, drills and pending approvals with no error and no warning.
 *
 * The fix is not a louder warning. It is that the method does not ask the
 * database anything: an empty screen is visibly wrong and safe, while another
 * organization's data is invisibly wrong. So each of these asserts two things,
 * and the second is the one that matters — **no query was issued**. Proving
 * the call never reached the database is what proves no other organization's
 * rows could come back.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;

// `any` rather than ReturnType<typeof vi.fn>: that type is not callable under
// this tsconfig, and the mocks are called as well as asserted on.
let from: any;
let warned: any;

beforeEach(() => {
  from = vi.fn(() => {
    throw new Error('a query was issued for an unresolved organization');
  });
  // A client that is present and configured, so nothing else can be the
  // reason a call returns early.
  svc.client = { from };
  warned = vi.fn();
  vi.spyOn(console, 'error').mockImplementation((...args: any[]) => { warned(...args); });
});

afterEach(() => {
  vi.restoreAllMocks();
  svc.client = null;
});

/** Each method, called with no organization, beside what it must hand back. */
const CASES: Array<{ method: string; call: () => Promise<any>; expected: any }> = [
  // Returns null.
  { method: 'getSchoolUuid', call: () => svc.getSchoolUuid(undefined), expected: null },
  { method: 'fetchPlayers', call: () => svc.fetchPlayers(undefined), expected: null },
  { method: 'fetchSoccerCategories', call: () => svc.fetchSoccerCategories(undefined), expected: null },
  { method: 'fetchCategoryUsage', call: () => svc.fetchCategoryUsage(undefined), expected: null },
  { method: 'fetchDrillsBank', call: () => svc.fetchDrillsBank(undefined), expected: null },
  { method: 'upsertDrillBankItem', call: () => svc.upsertDrillBankItem(undefined, { name: 'x' }), expected: null },
  { method: 'fetchSchool', call: () => svc.fetchSchool(undefined), expected: null },
  { method: 'fetchCoaches', call: () => svc.fetchCoaches(undefined), expected: null },
  { method: 'upsertCoach', call: () => svc.upsertCoach(undefined, { name: 'x' }), expected: null },

  // Returns { ok: false, error }. Each keeps its own wording; a caller may be
  // showing that string, so the guard reuses the shape rather than inventing one.
  { method: 'upsertSoccerCategory', call: () => svc.upsertSoccerCategory(undefined, { name: 'x' }), expected: { ok: false } },
  { method: 'retagDrills', call: () => svc.retagDrills(undefined, 'a', 'b'), expected: { ok: false } },
  { method: 'renameSoccerCategory', call: () => svc.renameSoccerCategory(undefined, 'c1', 'a', 'b'), expected: { ok: false } },
  { method: 'mergeSoccerCategory', call: () => svc.mergeSoccerCategory(undefined, 'a', 'b'), expected: { ok: false } },

  // The one that returns { data, error }.
  { method: 'upsertSchool', call: () => svc.upsertSchool(undefined, { name: 'x' }), expected: { data: null } }
];

describe('a service method called with no organization', () => {
  for (const c of CASES) {
    it(`${c.method}() issues no query`, async () => {
      await c.call();
      expect(from, `${c.method} reached the database`).not.toHaveBeenCalled();
    });

    it(`${c.method}() returns its own failure shape`, async () => {
      const got = await c.call();
      if (c.expected === null) {
        expect(got).toBeNull();
      } else {
        expect(got).toMatchObject(c.expected);
      }
    });

    it(`${c.method}() says so, naming itself`, async () => {
      await c.call();
      const said = warned.mock.calls.map(a => a.join(' ')).join('\n');
      expect(said).toContain(c.method);
    });
  }

  it('never names an organization to fall back to', async () => {
    for (const c of CASES) await c.call();
    const said = warned.mock.calls.map(a => a.join(' ')).join('\n');
    // The old warning told the reader it was "falling back to 'bhs'". Nothing
    // falls back now, and a message that says otherwise is a lie about a
    // multi-tenant bug.
    expect(said).not.toMatch(/falling back/i);
    expect(said).not.toMatch(/'bhs'/);
  });
});

describe('the same methods with an organization', () => {
  it('do reach the database, so the guard is not simply refusing everything', async () => {
    // If the guard were unconditional every test above would pass while the
    // app returned null for every call ever made.
    await expect(svc.fetchPlayers('s1')).rejects.toThrow(/a query was issued/);
    expect(from).toHaveBeenCalled();
  });
});
