/**
 * Drill categories belong to an organization — proved by running 0027.
 *
 * None of this can be asserted from the migration's text. Whether the unique
 * index really allows two organizations the same category name, and whether
 * the copy leaves every organization with the list it had, are facts about a
 * running Postgres.
 *
 * The migration is applied INSIDE the rolled-back transaction each test
 * already runs in, so no test sees another's schema.
 *
 * Skipped when no Postgres answers, so the rest of the suite still runs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';

const available = await hasTestDb();

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/0027_scope_soccer_categories.sql'), 'utf8');

/**
 * The migration, without its own transaction control — the harness has
 * already opened one, and a nested `begin`/`commit` would end it.
 */
async function apply(c: any) {
  await c.query(MIGRATION.replace(/^\s*(begin|commit)\s*;\s*$/gim, ''));
}

/** Two organizations. The demo schema seeds six unscoped categories. */
async function schools(c: any) {
  const one = async (code: string, name: string) => (await c.query(
    `insert into schools (code, name, mascot) values ($1, $2, 'Test') returning id`,
    [code, name])).rows[0].id;

  return { bhs: await one('bhs-c', 'Beaumont High School'), club: await one('lfc-c', 'Legends FC') };
}

const names = async (c: any, schoolId: string) => (await c.query(
  `select name from soccer_categories where school_id = $1 and is_deleted is not true
    order by name`, [schoolId])).rows.map((r: any) => r.name);

describe.skipIf(!available)('the column production does not have', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('IS ABSENT before the migration, which is why it adds rather than alters', async () => {
    // demo_schema.sql drops it explicitly to match production. If this ever
    // fails, the premise of the migration has changed.
    await withDb(async (c) => {
      const { rows } = await c.query(`
        select 1 from information_schema.columns
         where table_name = 'soccer_categories' and column_name = 'school_id'`);
      expect(rows).toHaveLength(0);
    });
  });

  it('exists after it', async () => {
    await withDb(async (c) => {
      await schools(c);
      await apply(c);
      const { rows } = await c.query(`
        select 1 from information_schema.columns
         where table_name = 'soccer_categories' and column_name = 'school_id'`);
      expect(rows).toHaveLength(1);
    });
  });
});

describe.skipIf(!available)('NOBODY LOSES A CATEGORY ON THE DAY IT IS APPLIED', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('gives every organization the list that was shared', async () => {
    await withDb(async (c) => {
      const s = await schools(c);
      const before = (await c.query(
        `select name from soccer_categories order by name`)).rows.map((r: any) => r.name);
      await apply(c);

      expect(await names(c, s.bhs)).toEqual(before);
      expect(await names(c, s.club)).toEqual(before);
    });
  });

  it('keeps a category a club added, rather than backfilling it to Beaumont', async () => {
    // Nothing records who created a row, so backfilling every unscoped row to
    // one organization would silently take this one away.
    await withDb(async (c) => {
      const s = await schools(c);
      await c.query(
        `insert into soccer_categories (name, description) values ('Transition Play', 'club')`);
      await apply(c);

      expect(await names(c, s.club)).toContain('Transition Play');
    });
  });

  it('leaves NO row belonging to nobody', async () => {
    await withDb(async (c) => {
      await schools(c);
      await apply(c);
      const { rows } = await c.query(
        `select count(*)::int as n from soccer_categories where school_id is null`);
      expect(rows[0].n).toBe(0);
    });
  });

  it('COPIES NOTHING TWICE when it is run again', async () => {
    // Applied by hand in the SQL editor, so running it twice is a real
    // possibility -- and the second pass must not duplicate a name an
    // organization already has, which the partial index would refuse anyway.
    await withDb(async (c) => {
      const s = await schools(c);
      await apply(c);
      await apply(c);

      const { rows } = await c.query(
        `select count(*)::int as n from soccer_categories
          where school_id = $1 and name = 'Warmup & Rondo'`, [s.club]);
      expect(rows[0].n).toBe(1);
    });
  });

  it('adopts a category added after it was first run', async () => {
    // The copy skips a name the organization already holds, so a row that
    // arrives unscoped later still reaches everybody exactly once.
    await withDb(async (c) => {
      const s = await schools(c);
      await apply(c);
      await c.query(
        `insert into soccer_categories (name, description) values ('Late Arrival', 'x')`);
      await apply(c);

      expect(await names(c, s.bhs)).toContain('Late Arrival');
      expect(await names(c, s.club)).toContain('Late Arrival');
    });
  });
});

describe.skipIf(!available)('TWO ORGANIZATIONS MAY BOTH HAVE A "POSSESSION"', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('allows the same name in two organizations', async () => {
    // Globally unique was the whole bug: the second save updated the first
    // organization's row instead of creating its own.
    await withDb(async (c) => {
      const s = await schools(c);
      await apply(c);

      await c.query(
        `insert into soccer_categories (school_id, name, description)
         values ($1, 'Possession', 'ours')`, [s.bhs]);
      await c.query(
        `insert into soccer_categories (school_id, name, description)
         values ($1, 'Possession', 'theirs')`, [s.club]);

      const { rows } = await c.query(
        `select count(*)::int as n from soccer_categories where name = 'Possession'`);
      expect(rows[0].n).toBe(2);
    });
  });

  it('still refuses a duplicate WITHIN one organization', async () => {
    await withDb(async (c) => {
      const s = await schools(c);
      await apply(c);
      await c.query(
        `insert into soccer_categories (school_id, name, description)
         values ($1, 'Possession', 'ours')`, [s.bhs]);

      await expect(c.query(
        `insert into soccer_categories (school_id, name, description)
         values ($1, 'Possession', 'again')`, [s.bhs])).rejects.toThrow(/duplicate key/i);
    });
  });

  it('REVIVES a retired name rather than adding a second row beside it', async () => {
    // The index covers retired rows too, so the upsert the client sends lands
    // on the retired one and clears its is_deleted. Re-adding a category
    // retired by mistake is the obvious thing a coach does, and this is what
    // makes it work -- the partial index that reads better cannot be used,
    // because PostgREST cannot upsert against one.
    await withDb(async (c) => {
      const s = await schools(c);
      await apply(c);
      await c.query(
        `insert into soccer_categories (school_id, name, description, is_deleted)
         values ($1, 'Possession', 'retired', true)`, [s.bhs]);

      await c.query(
        `insert into soccer_categories (school_id, name, description, is_deleted)
         values ($1, 'Possession', 'back again', false)
         on conflict (school_id, name) do update
            set description = excluded.description, is_deleted = excluded.is_deleted`,
        [s.bhs]);

      const { rows } = await c.query(
        `select description, is_deleted from soccer_categories
          where school_id = $1 and name = 'Possession'`, [s.bhs]);
      expect(rows).toHaveLength(1);
      expect(rows[0].description).toBe('back again');
      expect(rows[0].is_deleted).toBe(false);
    });
  });

  it('supports the ON CONFLICT the client actually sends', async () => {
    // A partial index would make every category save fail with 42P10, and
    // nothing but a real database says so.
    await withDb(async (c) => {
      const s = await schools(c);
      await apply(c);
      await expect(c.query(
        `insert into soccer_categories (school_id, name, description)
         values ($1, 'Warmup & Rondo', 'edited')
         on conflict (school_id, name) do update set description = excluded.description`,
        [s.bhs])).resolves.toBeTruthy();
    });
  });

  it('drops the global unique on name', async () => {
    await withDb(async (c) => {
      await schools(c);
      await apply(c);
      const { rows } = await c.query(`
        select 1 from pg_constraint
         where conname = 'soccer_categories_name_key'`);
      expect(rows).toHaveLength(0);
    });
  });
});

describe.skipIf(!available)('a category follows its organization', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('is removed when the organization is', async () => {
    await withDb(async (c) => {
      const s = await schools(c);
      await apply(c);
      await c.query(`delete from schools where id = $1`, [s.club]);

      const { rows } = await c.query(
        `select count(*)::int as n from soccer_categories where school_id = $1`, [s.club]);
      expect(rows[0].n).toBe(0);
    });
  });

  it('leaves the other organization alone', async () => {
    await withDb(async (c) => {
      const s = await schools(c);
      await apply(c);
      await c.query(`delete from schools where id = $1`, [s.club]);

      expect((await names(c, s.bhs)).length).toBeGreaterThan(0);
    });
  });
});
