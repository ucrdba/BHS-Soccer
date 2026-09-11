/**
 * demo_accounts.sql: nine accounts, each on its own copy of the sample
 * program, and locks that stop one visitor locking out the next. Real Postgres,
 * one transaction per test -- exactly the shape of the nightly rebuild.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hasTestDb, setupDb, teardownDb, withDb, TEST_DB_URL } from './harness';
import { schemaSteps, seedSql, accountsSql, runSteps } from '../../../scripts/demo-rebuild-lib.mjs';
import { DEMO_ACCOUNTS } from '../../demo';

const available = await hasTestDb();
const REPO = process.cwd();

/** The sign-in accounts, as scripts/demo-create-accounts.mjs creates them once. */
async function signInAccounts(c: any, except: number[] = []) {
  for (const a of DEMO_ACCOUNTS) {
    if (except.includes(a.n)) continue;
    await c.query(
      `insert into auth.users (email, encrypted_password, email_confirmed_at) values ($1, 'hash', now())`, [a.email]);
  }
}

async function build(c: any) {
  await runSteps(c, [
    ...schemaSteps(REPO),
    { label: 'demo_seed.sql', sql: seedSql(REPO) },
    { label: 'the sample program', sql: `select demo_seed_template('2026-09-11'::date)` },
    { label: 'demo_accounts.sql', sql: accountsSql(REPO) },
    { label: 'the nine accounts', sql: 'select demo_build_accounts()' }
  ]);
}

const one = async (c: any, sql: string, params: any[] = []) => (await c.query(sql, params)).rows[0];

const PRELUDE_PATH = join(REPO, 'src', 'data', 'testdb', 'prelude.sql');

describe.skipIf(!available)('demo_accounts.sql', () => {
  beforeAll(async () => { await setupDb([]); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('gives each account its own copy, with the role the picker shows', async () => {
    await withDb(async (c) => {
      await signInAccounts(c);
      await build(c);
      const { rows } = await c.query(`
        select p.email, p.role, p.status, s.code
          from profiles p join schools s on s.id = p.school_id order by p.email`);
      expect(rows).toEqual(DEMO_ACCOUNTS.map(a => ({
        email: a.email, role: a.role, status: 'active', code: `demo${a.n}`
      })));
    });
  }, 60_000);

  it('makes each coach a coach of both squads, in their own copy only', async () => {
    await withDb(async (c) => {
      await signInAccounts(c);
      await build(c);
      const r = await one(c, `
        select count(*)::int as links,
               count(*) filter (where t.school_id = p.school_id)::int as own_copy
          from team_coaches tc join teams t on t.id = tc.team_id join profiles p on p.id = tc.profile_id`);
      expect(r).toEqual({ links: 14, own_copy: 14 });
    });
  }, 60_000);

  it("links the player account to a Varsity player in its own copy", async () => {
    await withDb(async (c) => {
      await signInAccounts(c);
      await build(c);
      const r = await one(c, `
        select s.code, t.name as squad from profiles p
          join team_players tp on tp.player_id = p.player_id
          join teams t on t.id = tp.team_id join schools s on s.id = tp.school_id
         where p.email = 'demo8@demo.invalid'`);
      expect(r).toEqual({ code: 'demo8', squad: 'Varsity' });
    });
  }, 60_000);

  it('keeps the copies apart: no row of one references another', async () => {
    await withDb(async (c) => {
      await signInAccounts(c);
      await build(c);
      const r = await one(c, `select
        (select count(*) from team_players tp join teams t on t.id = tp.team_id
          where t.school_id <> tp.school_id)::int as squads,
        (select count(*) from stat_events e join stat_matches m on m.id = e.match_id
          where e.player_id is not null and not exists (
            select 1 from team_players tp where tp.player_id = e.player_id and tp.school_id = m.school_id))::int as events,
        (select count(*) from quiz_questions q join daily_thoughts d on d.id = q.thought_id
          join teams t on t.id = d.team_id where t.school_id <> q.school_id)::int as quiz`);
      expect(r).toEqual({ squads: 0, events: 0, quiz: 0 });
    });
  }, 60_000);

  it('gives every copy the whole program', async () => {
    await withDb(async (c) => {
      await signInAccounts(c);
      await build(c);
      const { rows } = await c.query(`
        select s.code,
               (select count(*) from team_players tp where tp.school_id = s.id)::int as players,
               (select count(*) from schedule x join teams t on t.id = x.team_id where t.school_id = s.id)::int as fixtures,
               (select count(*) from drills_bank d where d.school_id = s.id)::int as drills,
               (select count(*) from soccer_categories k where k.school_id = s.id)::int as categories
          from schools s order by s.code`);
      expect(rows).toHaveLength(10);
      for (const r of rows) expect(r, r.code).toMatchObject({ players: 38, fixtures: 28, drills: 12, categories: 7 });
    });
  }, 60_000);

  describe('the locks', () => {
    it('refuse a change to a demo password or email', async () => {
      await withDb(async (c) => {
        await signInAccounts(c);
        await build(c);
        await c.query('savepoint s');
        await expect(c.query(`update auth.users set encrypted_password = 'other' where email = 'demo1@demo.invalid'`))
          .rejects.toThrow(/Demo accounts cannot change their email or password/);
        await c.query('rollback to savepoint s');
        await expect(c.query(`update auth.users set email = 'mine@example.com' where email = 'demo2@demo.invalid'`))
          .rejects.toThrow(/Demo accounts cannot change their email or password/);
      });
    }, 60_000);

    // production's profiles_update lets any admin edit any profile, so demo9
    // could otherwise demote or remove the other eight.
    it('refuse demoting or removing a demo account', async () => {
      await withDb(async (c) => {
        await signInAccounts(c);
        await build(c);
        await c.query('savepoint s');
        await expect(c.query(`update profiles set role = 'guest' where email = 'demo3@demo.invalid'`))
          .rejects.toThrow(/cannot change their role/);
        await c.query('rollback to savepoint s');
        await expect(c.query(`delete from profiles where email = 'demo4@demo.invalid'`))
          .rejects.toThrow(/cannot be deleted/);
      });
    }, 60_000);

    it('still let a demo account sign in and change its display name', async () => {
      await withDb(async (c) => {
        await signInAccounts(c);
        await build(c);
        await c.query(`update auth.users set email_confirmed_at = now() where email = 'demo5@demo.invalid'`);
        await c.query(`update profiles set name = 'Coach Five' where email = 'demo5@demo.invalid'`);
        expect((await one(c, `select name from profiles where email = 'demo5@demo.invalid'`)).name).toBe('Coach Five');
      });
    }, 60_000);

    // On Supabase, PostgREST connects as `authenticated` on a fresh backend
    // that never ran the rebuild. A lock trigger that is not `security
    // definer` checks EXECUTE on demo_is_rebuilding() against whichever role
    // fires it, and that is revoked from authenticated -- so on a real
    // deployment every profile edit, including the display-name change above,
    // would fail closed with "permission denied".
    //
    // Reproducing that needs a database the rebuild has actually COMMITTED,
    // and a genuinely separate connection to it. The scratch database shared
    // by every other test in this file is built inside one transaction that
    // `withDb` always rolls back, so nothing in it is ever visible to another
    // session -- and even if it were, PL/pgSQL caches a function's inner-call
    // plan for the life of a session, so reusing the same connection that
    // already ran demo_build_accounts() as postgres (superuser, which bypasses
    // EXECUTE checks) would silently reuse that already-permitted plan and
    // hide the bug regardless of role. This test therefore builds its own
    // scratch database, commits it for real, and opens an independent
    // connection to it -- the same shape as the nightly rebuild committing and
    // PostgREST answering the next request on its own backend.
    it('runs the locks as their owner on a real deployment, so a signed-in visitor can still edit their own profile', async () => {
      const dbName = `bhs_demo_secdef_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const admin = new pg.Client({ connectionString: TEST_DB_URL });
      await admin.connect();
      await admin.query(`create database ${dbName}`);
      await admin.end();

      const url = new URL(TEST_DB_URL);
      url.pathname = `/${dbName}`;
      const owner = new pg.Client({ connectionString: url.toString() });
      await owner.connect();
      try {
        await owner.query(readFileSync(PRELUDE_PATH, 'utf8'));
        await signInAccounts(owner);
        await build(owner);

        const demo1 = await one(owner, `select id from auth.users where email = 'demo1@demo.invalid'`);

        const visitor = new pg.Client({ connectionString: url.toString() });
        await visitor.connect();
        try {
          await visitor.query('begin');
          await visitor.query(`select set_config('request.jwt.claim.sub', $1, true)`, [demo1.id]);
          await visitor.query('set local role authenticated');

          const update = await visitor.query(`update profiles set name = 'Coach One' where email = 'demo1@demo.invalid'`);
          expect(update.rowCount).toBe(1);

          await visitor.query('savepoint s');
          await expect(visitor.query(`update profiles set email = 'mine@example.com' where email = 'demo1@demo.invalid'`))
            .rejects.toThrow(/cannot change their role, status, organization, player link or email/);
          await visitor.query('rollback to savepoint s');

          await visitor.query('savepoint s2');
          await expect(visitor.query(`update profiles set email = 'mine@example.com' where email = 'demo1@demo.invalid'`))
            .rejects.not.toThrow(/permission denied/);
          await visitor.query('rollback to savepoint s2');
        } finally {
          await visitor.query('rollback').catch(() => {});
          await visitor.end();
        }

        const { rows } = await owner.query(
          `select proname, prosecdef from pg_proc where proname in ('demo_lock_auth_users', 'demo_lock_profiles') order by proname`);
        expect(rows).toEqual([
          { proname: 'demo_lock_auth_users', prosecdef: true },
          { proname: 'demo_lock_profiles', prosecdef: true }
        ]);
      } finally {
        await owner.end();
        const cleanup = new pg.Client({ connectionString: TEST_DB_URL });
        await cleanup.connect();
        await cleanup.query(`drop database if exists ${dbName} with (force)`);
        await cleanup.end();
      }
    }, 60_000);
  });

  it('fails naming the account when a sign-in account is missing', async () => {
    await withDb(async (c) => {
      await signInAccounts(c, [6]);
      await expect(build(c)).rejects.toThrow(/demo6@demo\.invalid is missing/);
    });
  }, 60_000);

  it('is not callable through the API', async () => {
    await withDb(async (c) => {
      await signInAccounts(c);
      await build(c);
      const r = await one(c,
        `select has_function_privilege('anon', 'public.demo_build_accounts()', 'execute') as build`);
      expect(r.build).toBe(false);
    });
  }, 60_000);
});
