/**
 * 0030 — an organization's photo, as a column on its row.
 *
 * Run against a real Postgres rather than asserted on the file's text: the
 * migration's promises are that it adds rather than alters, that running it
 * twice is harmless, and that no existing organization is changed by it —
 * and only Postgres can say whether those hold.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';

const available = await hasTestDb();

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/0030_school_hero.sql'), 'utf8');

/**
 * The migration, without its own transaction control — the harness has
 * already opened one, and a nested `begin`/`commit` would end it.
 */
async function apply(c: any) {
  await c.query(MIGRATION.replace(/^\s*(begin|commit)\s*;\s*$/gim, ''));
}

const column = async (c: any) => (await c.query(`
  select data_type, is_nullable from information_schema.columns
   where table_schema = 'public' and table_name = 'schools' and column_name = 'hero_url'`)).rows;

describe.skipIf(!available)('0030: schools.hero_url', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('is absent before the migration', async () => {
    await withDb(async (c) => {
      expect(await column(c)).toHaveLength(0);
    });
  });

  it('is a nullable text column after it', async () => {
    await withDb(async (c) => {
      await apply(c);
      expect(await column(c)).toEqual([{ data_type: 'text', is_nullable: 'YES' }]);
    });
  });

  /*
   * Nullable with no default, on purpose. An organization that has not
   * supplied a photo shows its colour, rather than being handed somebody
   * else's photo.
   */
  it('leaves every existing organization without a photo, and otherwise unchanged', async () => {
    await withDb(async (c) => {
      const id = (await c.query(
        `insert into schools (code, name, mascot, city) values ('lfc-hero', 'Legends FC', 'Lions', 'Riverside')
         returning id`)).rows[0].id;

      await apply(c);

      const { rows } = await c.query(
        `select name, mascot, city, hero_url from schools where id = $1`, [id]);
      expect(rows[0]).toEqual({ name: 'Legends FC', mascot: 'Lions', city: 'Riverside', hero_url: null });
    });
  });

  it('can be run twice', async () => {
    await withDb(async (c) => {
      await apply(c);
      await apply(c);
      expect(await column(c)).toHaveLength(1);
    });
  });

  it('holds the address it is given', async () => {
    await withDb(async (c) => {
      await apply(c);
      const id = (await c.query(
        `insert into schools (code, name, mascot, hero_url)
         values ('lfc-hero2', 'Legends FC', 'Lions', '/img/legends.jpg') returning id`)).rows[0].id;

      const { rows } = await c.query(`select hero_url from schools where id = $1`, [id]);
      expect(rows[0].hero_url).toBe('/img/legends.jpg');
    });
  });
});
