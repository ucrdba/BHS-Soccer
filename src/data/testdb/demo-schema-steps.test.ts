/**
 * The rebuild's schema, applied to an empty database -- what the nightly job
 * does to the demo project after wiping it. Proves the skip list, the cut and
 * the reconcile are enough for every file to apply, which a rehearsal on
 * 2026-09-11 showed they had to be.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';
import { schemaSteps, runSteps } from '../../../scripts/demo-rebuild-lib.mjs';

const available = await hasTestDb();

describe.skipIf(!available)('the rebuild schema, from the migrations', () => {
  beforeAll(async () => { await setupDb([]); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('applies every step to an empty database', async () => {
    await withDb(async (c) => {
      await runSteps(c, schemaSteps(process.cwd()));

      const { rows } = await c.query(`
        select table_name || '.' || column_name as col from information_schema.columns
         where table_schema = 'public'
           and (table_name, column_name) in (('schools', 'hero_url'), ('practice_plans', 'drill'),
                                             ('soccer_categories', 'school_id'), ('drills_bank', 'duration'))
         order by 1`);
      // The newest migration, the hand-added column, and 0027's category scope
      // are all there; drills_bank.duration, which production never had, is not.
      expect(rows.map((r: any) => r.col)).toEqual(
        ['practice_plans.drill', 'schools.hero_url', 'soccer_categories.school_id']);
    });
  }, 120_000);

  it('names the file that failed', async () => {
    await withDb(async (c) => {
      await expect(runSteps(c, [{ label: 'broken.sql', sql: 'select from nowhere_at_all;' }]))
        .rejects.toThrow(/broken\.sql/);
    });
  });
});
