/// <reference types="vite/client" />
/**
 * Saving a drill in the library: a rename is an update, not an upsert.
 *
 * Every save used to go out as `upsert(..., { onConflict: 'school_id,name' })`
 * carrying the drill's id. A rename changes the name, so the conflict target
 * matches no row, Postgres inserts, and the insert's id collides with the
 * drill's own primary key -- `23505 drills_bank_pkey`, shown to the coach as
 * "Could not save that drill." `src/data/testdb/drill-rename.test.ts` proves
 * both statements against a real Postgres; these pin which one the service
 * sends.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;

const SCHOOL = '7ebbe980-b87e-421f-a11f-788ca2519504';
const DRILL = '0b78997a-c0f1-4b6a-ad79-9365b7d9dfe5';

let calls: { table: string; op: string; row?: any; onConflict?: string; eq: [string, any][] }[];
let result: { data: any; error: any };

beforeEach(() => {
  calls = [];
  result = { data: [{ id: DRILL, name: '1 v 1' }], error: null };
  svc.isConfigured = () => true;
  svc.client = {
    from(table: string) {
      const call: any = { table, op: 'select', eq: [] };
      calls.push(call);
      const api: any = {
        upsert(rows: any[], opts: any) { call.op = 'upsert'; call.row = rows[0]; call.onConflict = opts?.onConflict; return api; },
        update(row: any) { call.op = 'update'; call.row = row; return api; },
        insert(rows: any[]) { call.op = 'insert'; call.row = rows[0]; return api; },
        select() { return api; },
        eq(col: string, val: any) { call.eq.push([col, val]); return api; },
        then(res: any) { return Promise.resolve(result).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const writes = () => calls.filter(c => c.table === 'drills_bank' && c.op !== 'select');

describe('upsertDrillBankItem', () => {
  it('sends an edit as an update of that drill, by id', async () => {
    await svc.upsertDrillBankItem(SCHOOL, { id: DRILL, name: '1 v 1', category: 'Technical' });

    expect(writes()).toHaveLength(1);
    expect(writes()[0].op).toBe('update');
    expect(writes()[0].eq).toEqual([['id', DRILL]]);
    expect(writes()[0].row.name).toBe('1 v 1');
  });

  it('never moves an edited drill to another organization', async () => {
    // The update names the row by id, so a school_id in the body could only
    // ever change it -- a drill, its weight and its matrix history handed to
    // whichever organization the caller happened to resolve.
    await svc.upsertDrillBankItem(SCHOOL, { id: DRILL, name: '1 v 1' });
    expect(writes()[0].row).not.toHaveProperty('school_id');
    expect(writes()[0].row).not.toHaveProperty('id');
  });

  it('leaves a diagram alone when the save did not bring one', async () => {
    // diagram_data is irreplaceable and unversioned; a rename from the
    // library form must not touch it.
    await svc.upsertDrillBankItem(SCHOOL, { id: DRILL, name: '1 v 1' });
    expect(writes()[0].row).not.toHaveProperty('diagram_data');
    expect(writes()[0].row).not.toHaveProperty('points');
    expect(writes()[0].row).not.toHaveProperty('measure');
  });

  it('returns the saved row', async () => {
    const saved = await svc.upsertDrillBankItem(SCHOOL, { id: DRILL, name: '1 v 1' });
    expect(saved).toEqual({ id: DRILL, name: '1 v 1' });
  });

  it('returns null when the update matched no row', async () => {
    // What RLS looks like from here: no error, and nothing changed.
    result = { data: [], error: null };
    expect(await svc.upsertDrillBankItem(SCHOOL, { id: DRILL, name: '1 v 1' })).toBeNull();
  });

  it('returns null when the database refuses', async () => {
    result = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "drills_bank_school_name_key"' } };
    expect(await svc.upsertDrillBankItem(SCHOOL, { id: DRILL, name: 'Taken' })).toBeNull();
  });

  it('still adds a NEW drill as an upsert on the organization and name', async () => {
    // Re-adding a name the library already holds updates that row rather than
    // refusing, which is what the import and the diagram save rely on.
    await svc.upsertDrillBankItem(SCHOOL, { name: 'Rondo 4v2', category: 'Possession' });

    expect(writes()).toHaveLength(1);
    expect(writes()[0].op).toBe('upsert');
    expect(writes()[0].onConflict).toBe('school_id,name');
    expect(writes()[0].row.school_id).toBe(SCHOOL);
  });
});
