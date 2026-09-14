/// <reference types="node" />
/**
 * A database built from the migrations, committed, with visitor connections.
 *
 * Account permissions are exactly what the superuser harness cannot see: it
 * skips every privilege check, and PL/pgSQL decides a nested call's EXECUTE
 * permission once per session. So this builds a scratch database once per
 * test file, COMMITS fixtures on an owner connection, and asks each permission
 * question on a fresh connection running as `authenticated` with the user's id
 * as the JWT subject -- the way PostgREST answers a request.
 *
 * Fixtures are committed and never cleaned up inside the file; every one is
 * uniquely named, so tests cannot collide. The database is dropped at the end.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { TEST_DB_URL } from './harness';
import { schemaSteps, runSteps } from '../../../scripts/demo-rebuild-lib.mjs';

export interface AccountsDb {
  owner: pg.Client;
  /** Runs fn on a new `authenticated` connection as userId, in a transaction that is rolled back. */
  asUser(userId: string, fn: (c: pg.Client) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}

export async function buildAccountsDb(): Promise<AccountsDb> {
  const name = `bhs_accounts_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const url = new URL(TEST_DB_URL);
  url.pathname = `/${name}`;

  const admin = new pg.Client({ connectionString: TEST_DB_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);

  const owner = new pg.Client({ connectionString: url.toString() });
  const drop = async () => {
    await owner.end().catch(() => {});
    await admin.query(`drop database if exists ${name} with (force)`)
      .catch((err) => console.error(`accounts-db: failed to drop ${name}`, err));
    await admin.end().catch(() => {});
  };

  try {
    await owner.connect();
    await owner.query(readFileSync(join(process.cwd(), 'src', 'data', 'testdb', 'prelude.sql'), 'utf8'));
    await runSteps(owner, schemaSteps(process.cwd()));
  } catch (err) {
    await drop();
    throw err;
  }

  return {
    owner,
    async asUser(userId, fn) {
      const c = new pg.Client({ connectionString: url.toString() });
      await c.connect();
      try {
        await c.query('begin');
        await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
        await c.query('set local role authenticated');
        await fn(c);
      } finally {
        await c.query('rollback').catch(() => {});
        await c.end().catch(() => {});
      }
    },
    close: drop
  };
}

export const one = async (c: pg.Client, sql: string, params: any[] = []) =>
  (await c.query(sql, params)).rows[0];

export const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10);

/** An organization with one team. Returns the team's id and school_id. */
export async function makeTeam(owner: pg.Client): Promise<{ id: string; school_id: string }> {
  const code = `t${uniq()}`;
  const school = await one(owner,
    `insert into public.schools (code, name, mascot, kind) values ($1, $2, 'Fixture', 'club') returning id`,
    [code, `Org ${code}`]);
  return one(owner,
    `insert into public.teams (school_id, name) values ($1, 'U14') returning id, school_id`,
    [school.id]);
}

/** A person on the team's roster. Returns players.id. */
export async function makeRosterEntry(owner: pg.Client, team: { id: string; school_id: string }): Promise<string> {
  const p = await one(owner,
    `insert into public.players (name, class_year) values ($1, '2030') returning id`, [`Player ${uniq()}`]);
  await owner.query(
    `insert into public.team_players (team_id, school_id, player_id) values ($1, $2, $3)`,
    [team.id, team.school_id, p.id]);
  return p.id;
}

/** An auth.users row, as GoTrue writes one; the triggers make the profile. */
export async function signUp(owner: pg.Client, opts: {
  email?: string; role?: string; teamId?: string; name?: string; confirmed?: boolean; passwordHash?: string;
} = {}): Promise<{ id: string; email: string }> {
  const email = opts.email ?? `${uniq()}@example.com`;
  const meta: Record<string, string> = { name: opts.name ?? 'Test Person', requested_role: opts.role ?? 'guest' };
  if (opts.teamId) meta.requested_team_id = opts.teamId;
  // GoTrue stamps confirmation_sent_at when it emails the confirmation link;
  // an account created already confirmed was never sent one.
  const u = await one(owner,
    `insert into auth.users (email, raw_user_meta_data, email_confirmed_at, confirmation_sent_at, encrypted_password)
     values ($1, $2, $3, $4, $5) returning id`,
    [email, meta, opts.confirmed ? new Date() : null, opts.confirmed ? null : new Date(), opts.passwordHash ?? null]);
  return { id: u.id, email };
}

/** What GoTrue does when the link in the confirmation email is opened. */
export const confirm = (owner: pg.Client, userId: string) =>
  owner.query(`update auth.users set email_confirmed_at = now() where id = $1`, [userId]);

export async function makeCoach(owner: pg.Client, team: { id: string; school_id: string }): Promise<string> {
  const u = await signUp(owner, { confirmed: true });
  await owner.query(
    `update public.profiles set role = 'coach', status = 'active', school_id = $2 where id = $1`,
    [u.id, team.school_id]);
  await owner.query(`insert into public.team_coaches (team_id, profile_id) values ($1, $2)`, [team.id, u.id]);
  return u.id;
}

export async function makeAdmin(owner: pg.Client): Promise<string> {
  const u = await signUp(owner, { confirmed: true });
  await owner.query(`update public.profiles set role = 'admin', status = 'active' where id = $1`, [u.id]);
  return u.id;
}

export const invite = (owner: pg.Client, i: {
  email: string; team: { id: string; school_id: string }; role: 'player' | 'coach'; playerId?: string | null;
}) => one(owner,
  `insert into public.invitations (email, school_id, team_id, role, player_id)
   values ($1, $2, $3, $4, $5) returning id`,
  [i.email, i.team.school_id, i.team.id, i.role, i.playerId ?? null]);
