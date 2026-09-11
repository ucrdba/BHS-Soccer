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

/**
 * A visitor signed in as `email`, on a real deployment's terms: a scratch
 * database the rebuild has COMMITTED, and a separate connection to it running
 * as `authenticated` with the account's id as the JWT subject -- the way
 * PostgREST answers a request on its own backend.
 *
 * Both halves matter. The harness connects as the postgres superuser, which
 * skips every privilege check, and PL/pgSQL checks a nested call's EXECUTE
 * permission once per session and then reuses it; so a privilege question
 * asked on the connection that ran the rebuild, or inside `withDb`'s
 * rolled-back transaction, is answered as the superuser whatever the role.
 *
 * Everything after `create database` is inside the `try`, so the scratch
 * database is dropped and every connection closed however the test ends.
 */
async function asVisitor(
  email: string,
  fn: (visitor: pg.Client, owner: pg.Client) => Promise<void>
): Promise<void> {
  const dbName = `bhs_demo_visitor_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const url = new URL(TEST_DB_URL);
  url.pathname = `/${dbName}`;

  const admin = new pg.Client({ connectionString: TEST_DB_URL });
  await admin.connect();
  const open: pg.Client[] = [];
  const connect = async () => {
    const c = new pg.Client({ connectionString: url.toString() });
    await c.connect();
    open.push(c);
    return c;
  };
  try {
    await admin.query(`create database ${dbName}`);

    const owner = await connect();
    await owner.query(readFileSync(PRELUDE_PATH, 'utf8'));
    await signInAccounts(owner);
    await build(owner);
    const account = await one(owner, `select id from auth.users where email = $1`, [email]);

    const visitor = await connect();
    await visitor.query('begin');
    await visitor.query(`select set_config('request.jwt.claim.sub', $1, true)`, [account.id]);
    await visitor.query('set local role authenticated');

    await fn(visitor, owner);
  } finally {
    // Closing a connection mid-transaction rolls it back.
    for (const c of open.reverse()) await c.end().catch(() => {});
    await admin.query(`drop database if exists ${dbName} with (force)`)
      .catch((err) => console.error(`demo-accounts.test: failed to drop scratch database ${dbName}`, err));
    await admin.end().catch(() => {});
  }
}

/** The error a statement raises, or null; the transaction carries on either way. */
async function refusal(c: pg.Client, sql: string, params: any[] = []): Promise<any> {
  await c.query('savepoint attempt');
  try {
    await c.query(sql, params);
    return null;
  } catch (err) {
    return err;
  } finally {
    await c.query('rollback to savepoint attempt');
  }
}

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

    // demo9 is an admin, and profiles_update lets an admin edit any profile:
    // re-pointing a demo profile's id at an orphan auth.users row would tie
    // the account's copy and role to a sign-in nobody has the password for.
    it("refuse re-pointing a demo profile's id", async () => {
      await withDb(async (c) => {
        await signInAccounts(c);
        await build(c);
        const orphan = (await one(c,
          `insert into auth.users (email, encrypted_password, email_confirmed_at) values ('orphan@example.com', 'hash', now()) returning id`)).id;
        await c.query(`delete from profiles where id = $1`, [orphan]);

        await expect(c.query(`update profiles set id = $1 where email = 'demo8@demo.invalid'`, [orphan]))
          .rejects.toThrow(/Demo accounts cannot change their id/);
      });
    }, 60_000);

    // An account created between rebuilds has no copy yet (school_id null), and
    // must still be confirmable; the lock is for the profiles the rebuild built.
    it('lock only the profiles the rebuild has built', async () => {
      await withDb(async (c) => {
        await signInAccounts(c);
        await build(c);
        await c.query(`select set_config('demo.rebuilding', 'on', true)`);
        await c.query(`update profiles set school_id = null where email = 'demo2@demo.invalid'`);
        await c.query(`select set_config('demo.rebuilding', 'off', true)`);

        await c.query(`update profiles set status = 'pending_approval' where email = 'demo2@demo.invalid'`);
        expect((await one(c, `select status from profiles where email = 'demo2@demo.invalid'`)).status)
          .toBe('pending_approval');

        await expect(c.query(`update profiles set status = 'pending_approval' where email = 'demo3@demo.invalid'`))
          .rejects.toThrow(/cannot change their role, status/);
      });
    }, 60_000);

    // GoTrue's admin create inserts the user, then confirms it in a second
    // statement; the confirmation fires production's handle_user_confirmed,
    // which moves the new profile's status. A lock on every demo email
    // refused that, and createUser failed with "Database error creating new
    // user" -- so re-creating a missing account after a rebuild was impossible.
    it('let GoTrue confirm a demo account created between rebuilds', async () => {
      await withDb(async (c) => {
        await signInAccounts(c);
        await build(c);
        await c.query(`select set_config('demo.rebuilding', 'on', true)`);
        await c.query(`delete from auth.users where email = 'demo6@demo.invalid'`);
        await c.query(`select set_config('demo.rebuilding', 'off', true)`);

        await c.query(`insert into auth.users (email, encrypted_password) values ('demo6@demo.invalid', 'hash')`);
        await c.query(`update auth.users set email_confirmed_at = now() where email = 'demo6@demo.invalid'`);

        expect(await one(c, `select status, school_id from profiles where email = 'demo6@demo.invalid'`))
          .toEqual({ status: 'active', school_id: null });
      });
    }, 60_000);

    // profiles.school_id cascades on delete, and schools_write lets any coach
    // delete any organization. Deleting a copy must not take its account's
    // profile with it -- the lock has to still see the profile as built while
    // the same delete is removing the demo_orgs row that says so.
    it("refuse deleting a copy's organization out from under its account", async () => {
      await withDb(async (c) => {
        await signInAccounts(c);
        await build(c);
        await expect(c.query(`delete from schools where code = 'demo2'`)).rejects.toThrow(/Demo accounts cannot be deleted/);
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
    // PostgREST answering the next request on its own backend. asVisitor()
    // above does exactly that.
    it('runs the locks as their owner on a real deployment, so a signed-in visitor can still edit their own profile', async () => {
      await asVisitor('demo1@demo.invalid', async (visitor, owner) => {
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

        const { rows } = await owner.query(
          `select proname, prosecdef from pg_proc where proname in ('demo_lock_auth_users', 'demo_lock_profiles') order by proname`);
        expect(rows).toEqual([
          { proname: 'demo_lock_auth_users', prosecdef: true },
          { proname: 'demo_lock_profiles', prosecdef: true }
        ]);
      });
    }, 60_000);

    // The rebuild's guard refuses any database holding a school coded 'bhs' or
    // 'lfc' -- it is how the rebuild knows production -- and production's
    // schools_write lets any coach or admin create or recode an organization.
    // One visitor doing so would stop every rebuild after it, and with them
    // the restore that bounds everything else a visitor can do. So the demo
    // refuses the codes and the guard stays strict.
    //
    // As a visitor, on a committed database: RLS must be shown to allow the
    // ordinary insert, or the refusals would prove nothing about the trigger.
    it("refuse a visitor an organization coded 'bhs' or 'lfc', by trigger rather than by RLS", async () => {
      await asVisitor('demo1@demo.invalid', async (visitor) => {
        const reserved = /That short code is reserved on the demo site/;

        const lfc = await refusal(visitor,
          `insert into schools (code, name, mascot) values ('lfc', 'Legends', 'Legends')`);
        expect(lfc?.message).toMatch(reserved);
        expect(lfc?.message).not.toMatch(/permission denied/);
        expect(lfc?.code).toBe('23514');

        // schools.code DEFAULTs to 'bhs', so leaving it out is the same request.
        const defaulted = await refusal(visitor,
          `insert into schools (name, mascot) values ('No Code', 'Nobody')`);
        expect(defaulted?.message).toMatch(reserved);
        expect(defaulted?.message).not.toMatch(/permission denied/);

        const recoded = await refusal(visitor, `update schools set code = 'LFC' where code = 'demo1'`);
        expect(recoded?.message).toMatch(reserved);
        expect(recoded?.message).not.toMatch(/permission denied/);

        const ordinary = await visitor.query(
          `insert into schools (code, name, mascot) values ('demo-club', 'Demo Club', 'Kites')`);
        expect(ordinary.rowCount).toBe(1);
      });
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
      // Both API roles: the published key is anon, and every signed-in visitor
      // is authenticated.
      const { rows } = await c.query(`
        select r.role,
               has_function_privilege(r.role, 'public.demo_build_accounts()', 'execute')      as build,
               has_function_privilege(r.role, 'public.demo_lock_reserved_codes()', 'execute') as reserved_codes
          from unnest(array['anon', 'authenticated']) as r(role) order by r.role`);
      expect(rows).toEqual([
        { role: 'anon', build: false, reserved_codes: false },
        { role: 'authenticated', build: false, reserved_codes: false }
      ]);
    });
  }, 60_000);
});
