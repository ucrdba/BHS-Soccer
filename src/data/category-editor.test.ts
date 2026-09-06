/**
 * The drill-category editor's service layer.
 *
 * Two facts drive every test here:
 *
 * 1. **Categories belong to an organization**, as of migration 0027. They did
 *    not: there was no `school_id` column at all — an earlier version of
 *    `upsertSoccerCategory` wrote one and every call failed with 42703 — and
 *    `name` was globally UNIQUE with the upsert conflicting on it. So a club
 *    coach saw Beaumont's categories, and a club saving "Possession"
 *    overwrote Beaumont's row of that name. Every call now carries the
 *    organization, including the rename and merge, which work by NAME.
 *
 * 2. `drills_bank.category` is free TEXT, not a foreign key. Nothing keeps a
 *    drill's category in step with the category list, and on the live data five
 *    of ten drills already carry a name that has no category row. Renaming and
 *    merging therefore have to rewrite the drills themselves, which is what the
 *    rest of these cover — scoped, or a club merging its own "Warmup" re-tags
 *    another organization's drills.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;

let sent: Record<string, any>[];
let updates: Record<string, any>[];
let tables: Record<string, any[]>;

beforeEach(() => {
  sent = [];
  updates = [];
  tables = {
    soccer_categories: [
      { id: 'c1', school_id: 's1', name: 'Small-Sided Games', description: '2v2 through 8v8', is_deleted: false },
      { id: 'c2', school_id: 's1', name: 'Passing & Possession', description: 'Keep the ball', is_deleted: false },
      { id: 'c3', school_id: 's1', name: 'Set Pieces', description: 'Corners and free kicks', is_deleted: false },
      // Another organization's, sharing a name with one of ours. Legal since
      // 0027, and the reason every by-name operation has to be scoped.
      { id: 'x1', school_id: 's2', name: 'Set Pieces', description: 'Theirs', is_deleted: false },
      { id: 'x2', school_id: 's2', name: 'Transition Play', description: 'Theirs', is_deleted: false }
    ],
    drills_bank: [
      { id: 'd1', school_id: 's1', name: '2v2 Flying Scrimmage', category: 'Small Sided', is_deleted: false },
      { id: 'd2', school_id: 's1', name: 'Rondo', category: 'Small Sided', is_deleted: false },
      { id: 'd3', school_id: 's1', name: 'Possession Grid', category: 'Passing & Possession', is_deleted: false },
      { id: 'd4', school_id: 's1', name: 'Corner Routines', category: 'Set Pieces', is_deleted: false },
      { id: 'x3', school_id: 's2', name: 'Their Corners', category: 'Set Pieces', is_deleted: false }
    ]
  };

  svc.isConfigured = () => true;
  // Resolution itself is getSchoolUuid's business and is tested elsewhere.
  svc.getSchoolUuid = async (code: string) => (code === 'lfc' ? 's2' : 's1');
  svc.client = {
    from(table: string) {
      let rows = (tables[table] || []).slice();
      let pendingUpdate: Record<string, any> | null = null;
      const api: any = {
        select() { return api; },
        or() { return api; },
        order() { return api; },
        limit() { return api; },
        // Every filter narrows first; the update lands on what survives all
        // of them. Applying it inside eq() would have written every row that
        // matched only the FIRST filter -- which is exactly the bug the
        // scoping is meant to prevent, so the stub must not fake it away.
        eq(col: string, val: any) { rows = rows.filter(r => r[col] === val); return api; },
        neq(col: string, val: any) { rows = rows.filter(r => r[col] !== val); return api; },
        update(patch: Record<string, any>) { pendingUpdate = patch; return api; },
        upsert(newRows: any[], opts?: any) {
          newRows.forEach(r => sent.push({ table, onConflict: opts?.onConflict, ...r }));
          rows = newRows;
          return api;
        },
        maybeSingle: async () => ({ data: rows[0] || null, error: null }),
        then(res: any) {
          if (pendingUpdate) {
            const patch = pendingUpdate;
            rows.forEach(r => updates.push({ table, id: r.id, ...patch }));
            rows = rows.map(r => ({ ...r, ...patch }));
          }
          return Promise.resolve({ data: rows, error: null }).then(res);
        }
      };
      return api;
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('saving a category', () => {
  it('WRITES IT INTO THE ORGANIZATION THAT SAVED IT', async () => {
    await supabaseService.upsertSoccerCategory('lfc', { name: 'Transition Play', description: 'Win it and go' });
    const row = sent.find(r => r.table === 'soccer_categories')!;
    expect(row.school_id).toBe('s2');
  });

  it('CONFLICTS ON (school_id, name), not on name alone', async () => {
    // Conflicting on name alone is what let a club saving "Possession"
    // overwrite Beaumont's row of that name instead of creating its own.
    await supabaseService.upsertSoccerCategory('lfc', { name: 'Set Pieces' });
    const row = sent.find(r => r.table === 'soccer_categories')!;
    expect(row.onConflict).toBe('school_id,name');
  });

  it('sends the name and description that were typed', async () => {
    await supabaseService.upsertSoccerCategory('bhs', { name: 'Transition Play', description: 'Win it and go' });
    const row = sent.find(r => r.table === 'soccer_categories')!;
    expect(row.name).toBe('Transition Play');
    expect(row.description).toBe('Win it and go');
  });

  it('refuses a category with no name rather than writing a blank one', async () => {
    const res = await supabaseService.upsertSoccerCategory('bhs', { description: 'orphan' });
    expect(res.ok).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('reports a refusal in words instead of returning null', async () => {
    // A null return is how the old version hid an RLS denial for months.
    const res = await supabaseService.upsertSoccerCategory('bhs', { name: '' });
    expect(res.ok).toBe(false);
    expect(typeof res.error).toBe('string');
    expect(res.error!.length).toBeGreaterThan(0);
  });
});

describe('READING THE LIST OF ONE ORGANIZATION', () => {
  it('returns only the categories of that organization', async () => {
    const mine = await supabaseService.fetchSoccerCategories('bhs');
    expect(mine!.map((c: any) => c.id).sort()).toEqual(['c1', 'c2', 'c3']);
  });

  it('does not leak another one, even where a name is shared', async () => {
    const theirs = await supabaseService.fetchSoccerCategories('lfc');
    expect(theirs!.map((c: any) => c.id).sort()).toEqual(['x1', 'x2']);
  });
});

describe('counting how many drills use each category', () => {
  it('counts by name, including names with no category row', async () => {
    // 'Small Sided' is used by two drills and is not in the category list.
    // Surfacing exactly that is the point of the editor's second section.
    const usage = await supabaseService.fetchCategoryUsage('bhs');
    expect(usage!['Small Sided']).toBe(2);
    expect(usage!['Passing & Possession']).toBe(1);
    expect(usage!['Set Pieces']).toBe(1);
  });

  it('reports nothing for a category no drill uses', async () => {
    const usage = await supabaseService.fetchCategoryUsage('bhs');
    expect(usage!['Small-Sided Games']).toBeUndefined();
  });

  it('COUNTS ONLY THE DRILLS OF THIS ORGANIZATION', async () => {
    // These counts are what the editor shows beside each category, and what
    // its "used by drills, not defined" group is built from -- unscoped, a
    // club coach reads another organization's drill names as their own
    // undefined categories.
    const theirs = await supabaseService.fetchCategoryUsage('lfc');
    expect(theirs!['Set Pieces']).toBe(1);
    expect(theirs!['Small Sided']).toBeUndefined();
  });
});

describe('renaming a category', () => {
  it('rewrites the category on every drill that uses the old name', async () => {
    // 'Set Pieces' is a category a drill actually carries, so this exercises
    // the re-tag rather than a no-op rename of an unused category.
    await supabaseService.renameSoccerCategory('bhs', 'c3', 'Set Pieces', 'Dead Ball Situations');
    const drillWrites = updates.filter(u => u.table === 'drills_bank');
    expect(drillWrites.length).toBeGreaterThan(0);
    expect(drillWrites.every(u => u.category === 'Dead Ball Situations')).toBe(true);
  });

  it('renames the category row itself, not only the drills', async () => {
    await supabaseService.renameSoccerCategory('bhs', 'c2', 'Passing & Possession', 'Possession');
    const catWrite = updates.find(u => u.table === 'soccer_categories');
    expect(catWrite).toBeDefined();
    expect(catWrite!.name).toBe('Possession');
  });

  it('reports how many drills it changed, so the coach can be told', async () => {
    const res = await supabaseService.renameSoccerCategory('bhs', 'c2', 'Passing & Possession', 'Possession');
    expect(res.ok).toBe(true);
    expect(res.drillsUpdated).toBe(1);
  });

  it('REFUSES a rename onto a name this organization already has', async () => {
    // Two rows with one name cannot be told apart in the drill dropdown, and
    // the upsert's onConflict is (school_id, name). Merge is the operation.
    const res = await supabaseService.renameSoccerCategory('bhs', 'c1', 'Small-Sided Games', 'Set Pieces');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/merge/i);
    expect(updates).toHaveLength(0);
  });

  it('ALLOWS a rename onto a name only ANOTHER organization holds', async () => {
    // 'Transition Play' exists, but in s2. Refusing this would be
    // inexplicable on screen -- the coach cannot see the row it collides
    // with, and never could.
    const res = await supabaseService.renameSoccerCategory('bhs', 'c1', 'Small-Sided Games', 'Transition Play');
    expect(res.ok).toBe(true);
  });

  it('RE-TAGS ONLY THE DRILLS OF THIS ORGANIZATION', async () => {
    // 'Set Pieces' is carried by a drill in each organization.
    await supabaseService.renameSoccerCategory('bhs', 'c3', 'Set Pieces', 'Dead Ball Situations');
    const drillWrites = updates.filter(u => u.table === 'drills_bank');
    expect(drillWrites.map(u => u.id)).toEqual(['d4']);
  });

  it('renames only the category row of this organization', async () => {
    await supabaseService.renameSoccerCategory('bhs', 'c3', 'Set Pieces', 'Dead Ball Situations');
    const catWrites = updates.filter(u => u.table === 'soccer_categories');
    expect(catWrites.map(u => u.id)).toEqual(['c3']);
  });

  it('refuses an empty new name', async () => {
    const res = await supabaseService.renameSoccerCategory('bhs', 'c1', 'Small-Sided Games', '   ');
    expect(res.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });
});

describe('merging one category into another', () => {
  it('re-tags the drills onto the destination name', async () => {
    await supabaseService.mergeSoccerCategory('bhs', 'Small Sided', 'Small-Sided Games');
    const drillWrites = updates.filter(u => u.table === 'drills_bank');
    expect(drillWrites.every(u => u.category === 'Small-Sided Games')).toBe(true);
  });

  it('retires the source category row when one exists', async () => {
    await supabaseService.mergeSoccerCategory('bhs', 'Set Pieces', 'Small-Sided Games');
    const retire = updates.find(u => u.table === 'soccer_categories');
    expect(retire).toBeDefined();
    expect(retire!.is_deleted).toBe(true);
  });

  it('still works when the source is only a drill label with no row', async () => {
    // The common case on the live data: 'Small Sided' is used by drills but has
    // no category row, so there is nothing to retire.
    const res = await supabaseService.mergeSoccerCategory('bhs', 'Small Sided', 'Small-Sided Games');
    expect(res.ok).toBe(true);
    expect(res.drillsUpdated).toBe(2);
  });

  it('RETIRES ONLY THE ROW OF THIS ORGANIZATION', async () => {
    // Retiring by name unscoped removed the same-named category from every
    // other organization at once.
    await supabaseService.mergeSoccerCategory('bhs', 'Set Pieces', 'Small-Sided Games');
    const retires = updates.filter(u => u.table === 'soccer_categories');
    expect(retires.map(u => u.id)).toEqual(['c3']);
  });

  it('moves only the drills of this organization', async () => {
    await supabaseService.mergeSoccerCategory('bhs', 'Set Pieces', 'Small-Sided Games');
    const drillWrites = updates.filter(u => u.table === 'drills_bank');
    expect(drillWrites.map(u => u.id)).toEqual(['d4']);
  });

  it('refuses merging a category into itself', async () => {
    const res = await supabaseService.mergeSoccerCategory('bhs', 'Set Pieces', 'Set Pieces');
    expect(res.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });
});

describe('retiring a category', () => {
  it('soft deletes rather than removing the row', async () => {
    // Soft delete is the repo-wide convention: readers filter on is_deleted.
    await supabaseService.retireSoccerCategory('c3');
    const write = updates.find(u => u.table === 'soccer_categories');
    expect(write!.is_deleted).toBe(true);
  });

  it('leaves drills alone, since the category is only text on them', async () => {
    await supabaseService.retireSoccerCategory('c3');
    expect(updates.filter(u => u.table === 'drills_bank')).toHaveLength(0);
  });
});
