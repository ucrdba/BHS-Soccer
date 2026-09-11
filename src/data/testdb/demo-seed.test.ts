/**
 * demo_seed.sql, run the way the nightly rebuild runs it: the schema from
 * today's migrations, then the file. Real Postgres throughout -- the clone's
 * catalog-driven remapping cannot be proved any other way.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';
import { schemaSteps, seedSql, runSteps } from '../../../scripts/demo-rebuild-lib.mjs';

const available = await hasTestDb();
const REPO = process.cwd();

/** The rebuild's first half: the schema, then demo_seed.sql. */
async function build(c: any) {
  await runSteps(c, [...schemaSteps(REPO), { label: 'demo_seed.sql', sql: seedSql(REPO) }]);
}

const one = async (c: any, sql: string, params: any[] = []) => (await c.query(sql, params)).rows[0];

describe.skipIf(!available)('demo_seed.sql', () => {
  beforeAll(async () => { await setupDb([]); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  describe('the copying machinery', () => {
    it('no longer has the self-serve signup hook', async () => {
      await withDb(async (c) => {
        await build(c);
        expect((await one(c, `select to_regproc('public.demo_new_org') as f`)).f).toBeNull();
      });
    }, 60_000);

    it('allows one template only', async () => {
      await withDb(async (c) => {
        await build(c);
        const a = (await one(c, `insert into schools (code, name, mascot) values ('demo-a', 'A', 'A') returning id`)).id;
        const b = (await one(c, `insert into schools (code, name, mascot) values ('demo-b', 'B', 'B') returning id`)).id;
        await c.query(`insert into demo_orgs (school_id, kind) values ($1, 'template')`, [a]);
        await expect(c.query(`insert into demo_orgs (school_id, kind) values ($1, 'template')`, [b]))
          .rejects.toThrow(/demo_orgs_one_template/);
      });
    }, 60_000);

    // 0027 gave categories a school_id, so each copy needs its own list.
    it("copies the template's categories into the copy and leaves the template's alone", async () => {
      await withDb(async (c) => {
        await build(c);
        const t = (await one(c, `insert into schools (code, name, mascot) values ('demo-t', 'Template', 'T') returning id`)).id;
        await c.query(`insert into demo_orgs (school_id, kind) values ($1, 'template')`, [t]);
        await c.query(
          `insert into soccer_categories (school_id, name, description) values ($1, 'Possession', 'x'), ($1, 'Finishing', 'y')`, [t]);

        const copy = (await one(c, `select demo_clone_org($1, 'Copy') as id`, [t])).id;

        const { rows } = await c.query(
          `select school_id = $1 as in_copy, count(*)::int as n from soccer_categories group by 1 order by 1`, [copy]);
        expect(rows).toEqual([{ in_copy: false, n: 2 }, { in_copy: true, n: 2 }]);
      });
    }, 60_000);

    // demo_clone_org is security definer: published, the anon key could clone
    // the template as often as it liked.
    it('is not callable through the API', async () => {
      await withDb(async (c) => {
        await build(c);
        const r = await one(c, `select
          has_function_privilege('anon', 'public.demo_clone_org(uuid, text)', 'execute') as clone,
          has_function_privilege('anon', 'public.demo_clone_manifest()', 'execute') as manifest`);
        expect(r).toEqual({ clone: false, manifest: false });
      });
    }, 60_000);
  });
});
