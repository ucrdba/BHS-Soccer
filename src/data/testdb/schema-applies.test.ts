/**
 * The harness itself, and that the demo schema applies cleanly.
 *
 * If this fails, every other database test's failure is meaningless — so it
 * runs first and asserts the smallest possible thing: a scratch database gets
 * built, the schema goes in, and the tables it declares are really there.
 *
 * Skipped wholesale when no Postgres answers, so a machine without one still
 * runs the rest of the suite rather than reporting a wall of red.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasTestDb, setupDb, teardownDb, withDb, TEST_DB_URL } from './harness';

const available = await hasTestDb();

describe.skipIf(!available)('the test database harness', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('is pointed at a database', () => {
    expect(TEST_DB_URL).toMatch(/^postgres(ql)?:\/\//);
  });

  it('built a scratch database, not the one in the URL', async () => {
    await withDb(async (c) => {
      const { rows } = await c.query('select current_database() as db');
      expect(rows[0].db).toMatch(/^bhs_demo_test_/);
    });
  });

  it('applied the schema', async () => {
    await withDb(async (c) => {
      const { rows } = await c.query(`
        select table_name from information_schema.tables
        where table_schema = 'public' order by table_name
      `);
      const tables = rows.map((r: any) => r.table_name);
      for (const t of ['schools', 'teams', 'team_players', 'players', 'schedule', 'profiles']) {
        expect(tables, t).toContain(t);
      }
    });
  });

  it('rolls each test back, so tests cannot see each other\'s writes', async () => {
    await withDb(async (c) => {
      await c.query(`insert into schools (code, name, mascot) values ('zzz', 'Scratch', 'Tests')`);
      const { rows } = await c.query(`select count(*)::int as n from schools where code = 'zzz'`);
      expect(rows[0].n).toBe(1);
    });

    await withDb(async (c) => {
      const { rows } = await c.query(`select count(*)::int as n from schools where code = 'zzz'`);
      expect(rows[0].n).toBe(0);
    });
  });
});

describe.skipIf(available)('without a database', () => {
  it('reports that none is reachable rather than failing the suite', async () => {
    expect(await hasTestDb()).toBe(false);
  });
});
