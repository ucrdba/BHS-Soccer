/**
 * 0028 — an organization's logo, as a column on its row.
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
  join(process.cwd(), 'supabase/migrations/0028_school_logo.sql'), 'utf8');

/**
 * The migration, without its own transaction control — the harness has
 * already opened one, and a nested `begin`/`commit` would end it.
 */
async function apply(c: any) {
  await c.query(MIGRATION.replace(/^\s*(begin|commit)\s*;\s*$/gim, ''));
}

const column = async (c: any) => (await c.query(`
  select data_type, is_nullable from information_schema.columns
   where table_schema = 'public' and table_name = 'schools' and column_name = 'logo_url'`)).rows;

describe.skipIf(!available)('0028: schools.logo_url', () => {
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
   * supplied a logo shows none, rather than being handed somebody else's.
   */
  it('leaves every existing organization without a logo, and otherwise unchanged', async () => {
    await withDb(async (c) => {
      const id = (await c.query(
        `insert into schools (code, name, mascot, city) values ('lfc-logo', 'Legends FC', 'Lions', 'Riverside')
         returning id`)).rows[0].id;

      await apply(c);

      const { rows } = await c.query(
        `select name, mascot, city, logo_url from schools where id = $1`, [id]);
      expect(rows[0]).toEqual({ name: 'Legends FC', mascot: 'Lions', city: 'Riverside', logo_url: null });
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
        `insert into schools (code, name, mascot, logo_url)
         values ('lfc-logo2', 'Legends FC', 'Lions', '/img/legends.png') returning id`)).rows[0].id;

      const { rows } = await c.query(`select logo_url from schools where id = $1`, [id]);
      expect(rows[0].logo_url).toBe('/img/legends.png');
    });
  });
});
