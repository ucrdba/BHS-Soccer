/**
 * The whole rebuild, as the nightly job runs it: guard, wipe, schema, the
 * sample program, the nine accounts. Twice, because it runs every night.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';
import { rebuildSteps, runSteps } from '../../../scripts/demo-rebuild-lib.mjs';

const available = await hasTestDb();
const REPO = process.cwd();

async function signInAccounts(c: any) {
  for (let n = 1; n <= 9; n++) {
    await c.query(
      `insert into auth.users (email, encrypted_password, email_confirmed_at) values ($1, 'hash', now())`,
      [`demo${n}@demo.invalid`]);
  }
}

const shape = async (c: any) => (await c.query(`select
  (select string_agg(code, ',' order by code) from schools) as codes,
  (select count(*) from profiles)::int as profiles,
  (select count(*) from team_players)::int as squad_rows,
  (select count(*) from team_coaches)::int as coach_links`)).rows[0];

describe.skipIf(!available)('the whole rebuild', () => {
  beforeAll(async () => { await setupDb([]); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('runs every night: the second run leaves the same demo', async () => {
    await withDb(async (c) => {
      await signInAccounts(c);
      await runSteps(c, rebuildSteps(REPO, '2026-09-11'));
      const first = await shape(c);
      expect(first).toEqual({
        codes: 'demo-template,demo1,demo2,demo3,demo4,demo5,demo6,demo7,demo8,demo9',
        profiles: 9, squad_rows: 380, coach_links: 14
      });

      await runSteps(c, rebuildSteps(REPO, '2026-12-15'));
      expect(await shape(c)).toEqual(first);
    });
  }, 180_000);

  it('refuses a database containing Beaumont, before dropping anything', async () => {
    await withDb(async (c) => {
      await signInAccounts(c);
      await runSteps(c, rebuildSteps(REPO, '2026-09-11'));
      // Production's data, which the demo refuses a visitor: past the lock.
      await c.query(`select set_config('demo.rebuilding', 'on', true)`);
      await c.query(`insert into schools (code, name, mascot) values ('bhs', 'Beaumont High School', 'Cougars')`);
      await c.query(`select set_config('demo.rebuilding', 'off', true)`);

      await c.query('savepoint before_rebuild');
      await expect(runSteps(c, rebuildSteps(REPO, '2026-09-11'))).rejects.toThrow(/^guard: REFUSING TO REBUILD/);
      await c.query('rollback to savepoint before_rebuild');

      expect((await c.query(`select count(*)::int as n from schools`)).rows[0].n).toBe(11);
    });
  }, 180_000);

  // An account deleted and re-created with scripts/demo-create-accounts.mjs
  // between rebuilds: GoTrue confirms it in a second statement, which must get
  // past the profile lock, and the next rebuild gives it a copy and locks it.
  it('builds and locks an account re-created between rebuilds', async () => {
    await withDb(async (c) => {
      await signInAccounts(c);
      await runSteps(c, rebuildSteps(REPO, '2026-09-11'));

      await c.query(`select set_config('demo.rebuilding', 'on', true)`);
      await c.query(`delete from auth.users where email = 'demo6@demo.invalid'`);
      await c.query(`select set_config('demo.rebuilding', 'off', true)`);
      await c.query(`insert into auth.users (email, encrypted_password) values ('demo6@demo.invalid', 'hash')`);
      await c.query(`update auth.users set email_confirmed_at = now() where email = 'demo6@demo.invalid'`);

      await runSteps(c, rebuildSteps(REPO, '2026-09-12'));
      const p = (await c.query(`
        select p.role, s.code from profiles p join schools s on s.id = p.school_id
         where p.email = 'demo6@demo.invalid'`)).rows[0];
      expect(p).toEqual({ role: 'coach', code: 'demo6' });
      await expect(c.query(`update profiles set status = 'pending_approval' where email = 'demo6@demo.invalid'`))
        .rejects.toThrow(/cannot change their role, status/);
    });
  }, 180_000);

  it('refuses a date it could not have been given', () => {
    expect(() => rebuildSteps(REPO, "2026-09-11'); drop table schools; --")).toThrow(/not a date/i);
  });

  it('ends by telling the API to reload, and starts with the guard and the wipe', () => {
    const labels = rebuildSteps(REPO, '2026-09-11').map((s: any) => s.label);
    expect(labels.slice(0, 2)).toEqual(['guard', 'wipe']);
    expect(labels[labels.length - 1]).toBe('reload the API');
  });
});
