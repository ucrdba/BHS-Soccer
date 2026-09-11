/**
 * 0032 — three columns production has that no migration created.
 *
 * Run against a real Postgres, on the harness's frozen baseline: a database
 * built from the migrations, which is exactly what lacks them -- as the
 * nightly demo rebuild would.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';

const available = await hasTestDb();

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/0032_record_hand_added_columns.sql'), 'utf8');

/** The migration without its own transaction control: withDb has opened one. */
const apply = (c: any) => c.query(MIGRATION.replace(/^\s*(begin|commit)\s*;\s*$/gim, ''));

const columns = async (c: any) => (await c.query(`
  select table_name || '.' || column_name as col, data_type
    from information_schema.columns
   where table_schema = 'public'
     and (table_name, column_name) in (('practice_plans', 'drill'),
                                       ('soccer_categories', 'display_order'),
                                       ('soccer_categories', 'active'))
   order by 1`)).rows;

describe.skipIf(!available)('0032: the columns production has that no migration created', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('are absent from a database built from the migrations', async () => {
    await withDb(async (c) => {
      expect(await columns(c)).toEqual([]);
    });
  });

  it('are present after it, with the types production values imply', async () => {
    await withDb(async (c) => {
      await apply(c);
      expect(await columns(c)).toEqual([
        { col: 'practice_plans.drill', data_type: 'text' },
        { col: 'soccer_categories.active', data_type: 'boolean' },
        { col: 'soccer_categories.display_order', data_type: 'integer' }
      ]);
    });
  });

  it('can be run twice, as applying it to production effectively is', async () => {
    await withDb(async (c) => {
      await apply(c);
      await apply(c);
      expect(await columns(c)).toHaveLength(3);
    });
  });

  // What the planner writes on every save (toPlanRows). Without the column
  // this insert is 42703 and the coach's plan is lost.
  it("takes the planner's save", async () => {
    await withDb(async (c) => {
      await apply(c);
      const school = (await c.query(
        `insert into schools (code, name, mascot) values ('t0032', 'Test FC', 'Tests') returning id`)).rows[0].id;
      const team = (await c.query(
        `insert into teams (school_id, name) values ($1, 'Varsity') returning id`, [school])).rows[0].id;
      await c.query(
        `insert into practice_plans (team_id, name, drill, time_slot, duration)
         values ($1, 'Tuesday', 'Rondo 4v2', '3:30 PM - 3:45 PM', '15 min')`, [team]);

      const { rows } = await c.query(`select drill from practice_plans where team_id = $1`, [team]);
      expect(rows[0].drill).toBe('Rondo 4v2');
    });
  });
});
