/**
 * The drill-category editor's service layer.
 *
 * Two facts about the live database drive every test here, both confirmed by
 * probing it rather than by reading `supabase_schema.sql`:
 *
 * 1. `soccer_categories` has NO `school_id` column. The old
 *    `upsertSoccerCategory` wrote one anyway, so every call failed with 42703,
 *    the service logged to the console and returned null, and the XLSX category
 *    import silently imported nothing. The first block below is the regression
 *    test for that.
 *
 * 2. `drills_bank.category` is free TEXT, not a foreign key. Nothing keeps a
 *    drill's category in step with the category list, and on the live data five
 *    of ten drills already carry a name that has no category row. Renaming and
 *    merging therefore have to rewrite the drills themselves, which is what the
 *    rest of these cover.
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
      { id: 'c1', name: 'Small-Sided Games', description: '2v2 through 8v8', is_deleted: false },
      { id: 'c2', name: 'Passing & Possession', description: 'Keep the ball', is_deleted: false },
      { id: 'c3', name: 'Set Pieces', description: 'Corners and free kicks', is_deleted: false }
    ],
    drills_bank: [
      { id: 'd1', name: '2v2 Flying Scrimmage', category: 'Small Sided', is_deleted: false },
      { id: 'd2', name: 'Rondo', category: 'Small Sided', is_deleted: false },
      { id: 'd3', name: 'Possession Grid', category: 'Passing & Possession', is_deleted: false },
      { id: 'd4', name: 'Corner Routines', category: 'Set Pieces', is_deleted: false }
    ]
  };

  svc.isConfigured = () => true;
  svc.client = {
    from(table: string) {
      let rows = (tables[table] || []).slice();
      let pendingUpdate: Record<string, any> | null = null;
      const api: any = {
        select() { return api; },
        or() { return api; },
        order() { return api; },
        limit() { return api; },
        eq(col: string, val: any) {
          rows = rows.filter(r => r[col] === val);
          if (pendingUpdate) {
            rows.forEach(r => updates.push({ table, id: r.id, match: { [col]: val }, ...pendingUpdate }));
          }
          return api;
        },
        neq(col: string, val: any) { rows = rows.filter(r => r[col] !== val); return api; },
        update(patch: Record<string, any>) { pendingUpdate = patch; return api; },
        upsert(newRows: any[]) {
          newRows.forEach(r => sent.push({ table, ...r }));
          rows = newRows;
          return api;
        },
        maybeSingle: async () => ({ data: rows[0] || null, error: null }),
        then(res: any) { return Promise.resolve({ data: rows, error: null }).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('saving a category', () => {
  it('never sends school_id, because the column does not exist', async () => {
    // The bug this whole editor was built on top of: a write naming a column
    // Postgres does not have fails with 42703 and imports nothing, silently.
    await supabaseService.upsertSoccerCategory({ name: 'Transition Play', description: 'Win it and go' });
    const row = sent.find(r => r.table === 'soccer_categories');
    expect(row).toBeDefined();
    expect('school_id' in row!).toBe(false);
  });

  it('sends the name and description that were typed', async () => {
    await supabaseService.upsertSoccerCategory({ name: 'Transition Play', description: 'Win it and go' });
    const row = sent.find(r => r.table === 'soccer_categories')!;
    expect(row.name).toBe('Transition Play');
    expect(row.description).toBe('Win it and go');
  });

  it('refuses a category with no name rather than writing a blank one', async () => {
    const res = await supabaseService.upsertSoccerCategory({ description: 'orphan' });
    expect(res.ok).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('reports a refusal in words instead of returning null', async () => {
    // A null return is how the old version hid an RLS denial for months.
    const res = await supabaseService.upsertSoccerCategory({ name: '' });
    expect(res.ok).toBe(false);
    expect(typeof res.error).toBe('string');
    expect(res.error!.length).toBeGreaterThan(0);
  });
});

describe('counting how many drills use each category', () => {
  it('counts by name, including names with no category row', async () => {
    // 'Small Sided' is used by two drills and is not in the category list.
    // Surfacing exactly that is the point of the editor's second section.
    const usage = await supabaseService.fetchCategoryUsage();
    expect(usage!['Small Sided']).toBe(2);
    expect(usage!['Passing & Possession']).toBe(1);
    expect(usage!['Set Pieces']).toBe(1);
  });

  it('reports nothing for a category no drill uses', async () => {
    const usage = await supabaseService.fetchCategoryUsage();
    expect(usage!['Small-Sided Games']).toBeUndefined();
  });
});

describe('renaming a category', () => {
  it('rewrites the category on every drill that uses the old name', async () => {
    // 'Set Pieces' is a category a drill actually carries, so this exercises
    // the re-tag rather than a no-op rename of an unused category.
    await supabaseService.renameSoccerCategory('c3', 'Set Pieces', 'Dead Ball Situations');
    const drillWrites = updates.filter(u => u.table === 'drills_bank');
    expect(drillWrites.length).toBeGreaterThan(0);
    expect(drillWrites.every(u => u.category === 'Dead Ball Situations')).toBe(true);
  });

  it('renames the category row itself, not only the drills', async () => {
    await supabaseService.renameSoccerCategory('c2', 'Passing & Possession', 'Possession');
    const catWrite = updates.find(u => u.table === 'soccer_categories');
    expect(catWrite).toBeDefined();
    expect(catWrite!.name).toBe('Possession');
  });

  it('reports how many drills it changed, so the coach can be told', async () => {
    const res = await supabaseService.renameSoccerCategory('c2', 'Passing & Possession', 'Possession');
    expect(res.ok).toBe(true);
    expect(res.drillsUpdated).toBe(1);
  });

  it('REFUSES a rename onto a name another category already has', async () => {
    // Two rows with one name cannot be told apart in the drill dropdown, and
    // the upsert's onConflict is on name. Merge is the operation for this.
    const res = await supabaseService.renameSoccerCategory('c1', 'Small-Sided Games', 'Set Pieces');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/merge/i);
    expect(updates).toHaveLength(0);
  });

  it('refuses an empty new name', async () => {
    const res = await supabaseService.renameSoccerCategory('c1', 'Small-Sided Games', '   ');
    expect(res.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });
});

describe('merging one category into another', () => {
  it('re-tags the drills onto the destination name', async () => {
    await supabaseService.mergeSoccerCategory('Small Sided', 'Small-Sided Games');
    const drillWrites = updates.filter(u => u.table === 'drills_bank');
    expect(drillWrites.every(u => u.category === 'Small-Sided Games')).toBe(true);
  });

  it('retires the source category row when one exists', async () => {
    await supabaseService.mergeSoccerCategory('Set Pieces', 'Small-Sided Games');
    const retire = updates.find(u => u.table === 'soccer_categories');
    expect(retire).toBeDefined();
    expect(retire!.is_deleted).toBe(true);
  });

  it('still works when the source is only a drill label with no row', async () => {
    // The common case on the live data: 'Small Sided' is used by drills but has
    // no category row, so there is nothing to retire.
    const res = await supabaseService.mergeSoccerCategory('Small Sided', 'Small-Sided Games');
    expect(res.ok).toBe(true);
    expect(res.drillsUpdated).toBe(2);
  });

  it('refuses merging a category into itself', async () => {
    const res = await supabaseService.mergeSoccerCategory('Set Pieces', 'Set Pieces');
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
