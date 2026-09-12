/**
 * 0027 — scoping categories to an organization, against production's shape.
 *
 * Production's soccer_categories.id has NO default, though supabase_schema.sql
 * and demo_schema.sql both declare `DEFAULT gen_random_uuid()`. The migration's
 * copy inserts without an id, so it passed every test here and failed in the
 * production SQL editor with:
 *
 *   23502: null value in column "id" of relation "soccer_categories"
 *
 * upsertSoccerCategory sends no id either, so adding a category there failed
 * the same way. This rebuilds that shape -- the default dropped -- and runs
 * the real migration file against it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';

const available = await hasTestDb();

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/0027_scope_soccer_categories.sql'), 'utf8');

/** The migration without its own transaction control: withDb has opened one. */
const apply = (c: any) => c.query(MIGRATION.replace(/^\s*(begin|commit)\s*;\s*$/gim, ''));

/** Production's shape: the primary key carries no default of its own. */
async function likeProduction(c: any) {
  await c.query(`alter table public.soccer_categories alter column id drop default`);
  await c.query(`insert into public.schools (code, name, mascot)
                 values ('alpha', 'Alpha', 'A'), ('beta', 'Beta', 'B')`);
}

const idDefault = async (c: any) => (await c.query(`
  select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'soccer_categories' and column_name = 'id'`)
).rows[0].column_default;

describe.skipIf(!available)('0027 against a database whose category id has no default', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('copies every category into every organization, giving each row an id', async () => {
    await withDb(async (c) => {
      await likeProduction(c);
      const seeded = Number((await c.query(`select count(*)::int as n from soccer_categories`)).rows[0].n);
      expect(seeded).toBeGreaterThan(0);

      await apply(c);

      const { rows } = await c.query(`
        select s.code, count(sc.*)::int as n, count(sc.id)::int as with_id
          from public.schools s
          join public.soccer_categories sc on sc.school_id = s.id
         group by s.code order by s.code`);
      expect(rows).toEqual([
        { code: 'alpha', n: seeded, with_id: seeded },
        { code: 'beta',  n: seeded, with_id: seeded }
      ]);
      expect((await c.query(`select count(*)::int as n from soccer_categories where school_id is null`)).rows[0].n)
        .toBe(0);
    });
  }, 60_000);

  it('leaves the column able to take a row the app inserts without an id', async () => {
    await withDb(async (c) => {
      await likeProduction(c);
      await apply(c);

      expect(await idDefault(c)).toMatch(/gen_random_uuid/);
      // Exactly what upsertSoccerCategory sends: no id.
      const school = (await c.query(`select id from public.schools where code = 'alpha'`)).rows[0].id;
      await c.query(
        `insert into public.soccer_categories (school_id, name, description, is_deleted)
         values ($1, 'Set Pieces', 'Corners and free kicks', false)`, [school]);
      expect((await c.query(
        `select count(*)::int as n from soccer_categories where name = 'Set Pieces' and id is not null`)).rows[0].n)
        .toBe(1);
    });
  }, 60_000);
});
