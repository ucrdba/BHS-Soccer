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

/**
 * Production's shape: the primary key carries no default of its own, and the
 * two columns 0032 records are already there — display_order NOT NULL with no
 * default, active defaulting to true.
 */
async function likeProduction(c: any) {
  await c.query(`alter table public.soccer_categories alter column id drop default`);
  await c.query(`alter table public.soccer_categories add column display_order integer`);
  await c.query(`alter table public.soccer_categories add column active boolean default true`);
  await c.query(`update public.soccer_categories c
                    set display_order = o.n, active = (o.n <> 2)
                   from (select id, row_number() over (order by name) as n
                           from public.soccer_categories) o
                  where o.id = c.id`);
  await c.query(`alter table public.soccer_categories alter column display_order set not null`);
  await c.query(`insert into public.schools (code, name, mascot)
                 values ('alpha', 'Alpha', 'A'), ('beta', 'Beta', 'B')`);
}

const defaultOf = async (c: any, column: string) => (await c.query(`
  select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'soccer_categories' and column_name = $1`,
  [column])).rows[0].column_default;

describe.skipIf(!available)("0027 against production's shape", () => {
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

  it('leaves the table able to take the row the app inserts, which sends neither', async () => {
    await withDb(async (c) => {
      await likeProduction(c);
      await apply(c);

      expect(await defaultOf(c, 'id')).toMatch(/gen_random_uuid/);
      expect(await defaultOf(c, 'display_order')).toBe('0');

      // Exactly what upsertSoccerCategory sends: no id, no display_order.
      const school = (await c.query(`select id from public.schools where code = 'alpha'`)).rows[0].id;
      await c.query(
        `insert into public.soccer_categories (school_id, name, description, is_deleted)
         values ($1, 'Set Pieces', 'Corners and free kicks', false)`, [school]);
      expect((await c.query(
        `select id is not null as has_id, display_order from soccer_categories where name = 'Set Pieces'`))
        .rows).toEqual([{ has_id: true, display_order: 0 }]);
    });
  }, 60_000);

  it("carries production's display_order and active into every copy", async () => {
    await withDb(async (c) => {
      await likeProduction(c);
      const before = (await c.query(
        `select name, display_order, active from soccer_categories order by name`)).rows;
      expect(before.some((r: any) => r.active === false)).toBe(true);

      await apply(c);

      for (const code of ['alpha', 'beta']) {
        const after = (await c.query(`
          select sc.name, sc.display_order, sc.active
            from soccer_categories sc
            join schools s on s.id = sc.school_id
           where s.code = $1 order by sc.name`, [code])).rows;
        expect(after, code).toEqual(before);
      }
    });
  }, 60_000);
});
