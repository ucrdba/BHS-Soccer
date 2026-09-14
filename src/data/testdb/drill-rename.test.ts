/**
 * Renaming a drill in the library.
 *
 * `upsertDrillBankItem` sends every save as an upsert on (school_id, name),
 * carrying the drill's id. For a new drill, or a save that keeps the name,
 * that is fine. For a RENAME it cannot work: the new name matches no row, so
 * `on conflict (school_id, name)` does not fire, Postgres inserts -- and the
 * insert carries the existing id, which the primary key refuses:
 *
 *   23505: duplicate key value violates unique constraint "drills_bank_pkey"
 *
 * `on conflict` only handles the constraint it names. The coach saw "Could not
 * save that drill." for renaming "1v1 Gauntlet (Continuous)" to "1 v 1".
 *
 * A rename is an update of a known row, so it is sent as one, by id. That also
 * keeps what hangs off the id: matrix sessions, pairings and plan rows all
 * reference the drill by id, so a rename renames it everywhere rather than
 * orphaning its history on a new row.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';

const available = await hasTestDb();

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/0033_scope_drill_names.sql'), 'utf8');
const apply = (c: any) => c.query(MIGRATION.replace(/^\s*(begin|commit)\s*;\s*$/gim, ''));

async function libraryWithGauntlet(c: any) {
  await apply(c);
  const school = (await c.query(
    `insert into public.schools (code, name, mascot) values ('alpha', 'Alpha', 'A') returning id`
  )).rows[0].id;
  const drill = (await c.query(
    `insert into public.drills_bank (school_id, name, category, points, measure, diagram_data)
     values ($1, '1v1 Gauntlet (Continuous)', 'Technical', 3.0, 'head_to_head', '{"elements":[1]}')
     returning id`, [school]
  )).rows[0].id;
  return { school, drill };
}

describe.skipIf(!available)('renaming a drill', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('is refused when sent as the upsert on (school_id, name)', async () => {
    await withDb(async (c) => {
      const { school, drill } = await libraryWithGauntlet(c);
      // What PostgREST built from upsert([payload], { onConflict: 'school_id,name' }).
      await expect(c.query(
        `insert into public.drills_bank (id, school_id, name, category, is_deleted)
         values ($1, $2, '1 v 1', 'Technical', false)
         on conflict (school_id, name) do update
           set category = excluded.category, is_deleted = excluded.is_deleted`,
        [drill, school]
      )).rejects.toThrow(/drills_bank_pkey/);
    });
  }, 60_000);

  it('works as an update by id, and keeps what the row already carried', async () => {
    await withDb(async (c) => {
      const { drill } = await libraryWithGauntlet(c);
      await c.query(
        `update public.drills_bank set name = '1 v 1', category = 'Technical', is_deleted = false
          where id = $1`, [drill]);

      const { rows } = await c.query(
        `select id, name, points, measure, diagram_data from public.drills_bank`);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: drill, name: '1 v 1', measure: 'head_to_head', diagram_data: { elements: [1] }
      });
      expect(Number(rows[0].points)).toBe(3);
    });
  }, 60_000);

  it('is refused by the per-organization index when the name is already taken', async () => {
    // What the library must turn into words: two drills of one name in one
    // organization is the thing 0033 exists to prevent.
    await withDb(async (c) => {
      const { school, drill } = await libraryWithGauntlet(c);
      await c.query(
        `insert into public.drills_bank (school_id, name, category) values ($1, '1 v 1', 'General')`,
        [school]);
      await expect(c.query(
        `update public.drills_bank set name = '1 v 1' where id = $1`, [drill]
      )).rejects.toMatchObject({ code: '23505' });
    });
  }, 60_000);
});
