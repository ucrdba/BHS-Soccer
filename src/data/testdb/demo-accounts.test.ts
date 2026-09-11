/**
 * demo_accounts.sql: nine accounts, each on its own copy of the sample
 * program, and locks that stop one visitor locking out the next. Real Postgres,
 * one transaction per test -- exactly the shape of the nightly rebuild.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';
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
