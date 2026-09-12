/**
 * 0033 — a drill's name belongs to an organization, not to the whole table.
 *
 * The planner saves a drill with PostgREST's upsert, which becomes
 * `on conflict (...)`. It named `name` alone, and no migration ever created a
 * unique index for it: production has one from before the migrations, the demo
 * rebuilt from those migrations has none, and every save there answered
 *
 *   42P10: there is no unique or exclusion constraint matching the ON CONFLICT
 *
 * Global uniqueness is the wrong shape anyway. Two organizations must both be
 * able to keep a "Rondo 4v2"; conflicting on the name alone would have the
 * second save overwrite the first's row -- exactly what 0027 fixed for
 * soccer_categories.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';

const available = await hasTestDb();

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/0033_scope_drill_names.sql'), 'utf8');

/** The migration without its own transaction control: withDb has opened one. */
const apply = (c: any) => c.query(MIGRATION.replace(/^\s*(begin|commit)\s*;\s*$/gim, ''));

/** Exactly what upsertDrillBankItem sends, once it names the right columns. */
const saveDrill = (c: any, school: string, name: string, notes: string) => c.query(
  `insert into public.drills_bank (school_id, name, category, coach_notes)
   values ($1, $2, 'General', $3)
   on conflict (school_id, name) do update set coach_notes = excluded.coach_notes`,
  [school, name, notes]);

async function twoOrganizations(c: any) {
  const { rows } = await c.query(
    `insert into public.schools (code, name, mascot)
     values ('alpha', 'Alpha', 'A'), ('beta', 'Beta', 'B') returning id, code`);
  return Object.fromEntries(rows.map((r: any) => [r.code, r.id]));
}

describe.skipIf(!available)('0033: a drill name belongs to an organization', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('is what the planner had nothing to conflict on before', async () => {
    await withDb(async (c) => {
      const org = await twoOrganizations(c);
      await expect(saveDrill(c, org.alpha, 'Rondo 4v2', 'first'))
        .rejects.toThrow(/no unique or exclusion constraint/);
    });
  }, 60_000);

  it('lets the planner save a drill, and save it again', async () => {
    await withDb(async (c) => {
      const org = await twoOrganizations(c);
      await apply(c);

      await saveDrill(c, org.alpha, 'Rondo 4v2', 'two touches');
      await saveDrill(c, org.alpha, 'Rondo 4v2', 'one touch');

      expect((await c.query(
        `select coach_notes from public.drills_bank where school_id = $1 and name = 'Rondo 4v2'`,
        [org.alpha])).rows).toEqual([{ coach_notes: 'one touch' }]);
    });
  }, 60_000);

  it('lets two organizations each keep a drill of the same name', async () => {
    await withDb(async (c) => {
      const org = await twoOrganizations(c);
      await apply(c);

      await saveDrill(c, org.alpha, 'Rondo 4v2', "alpha's");
      await saveDrill(c, org.beta, 'Rondo 4v2', "beta's");

      expect((await c.query(`
        select s.code, d.coach_notes from public.drills_bank d
          join public.schools s on s.id = d.school_id
         where d.name = 'Rondo 4v2' order by s.code`)).rows)
        .toEqual([{ code: 'alpha', coach_notes: "alpha's" }, { code: 'beta', coach_notes: "beta's" }]);
    });
  }, 60_000);

  // Production's shape, which no migration wrote and which would otherwise
  // keep the second organization's save overwriting the first's row.
  it("drops a global unique on name where one exists", async () => {
    await withDb(async (c) => {
      const org = await twoOrganizations(c);
      await c.query(`create unique index drills_bank_name_key on public.drills_bank (name)`);

      await apply(c);

      await saveDrill(c, org.alpha, 'Rondo 4v2', "alpha's");
      await saveDrill(c, org.beta, 'Rondo 4v2', "beta's");
      expect((await c.query(
        `select count(*)::int as n from public.drills_bank where name = 'Rondo 4v2'`)).rows[0].n)
        .toBe(2);
    });
  }, 60_000);

  it('can be run twice, as applying it to production effectively is', async () => {
    await withDb(async (c) => {
      await apply(c);
      await apply(c);
      expect((await c.query(`
        select indexname from pg_indexes
         where tablename = 'drills_bank' and indexname = 'drills_bank_school_name_key'`)).rows)
        .toHaveLength(1);
    });
  }, 60_000);
});
