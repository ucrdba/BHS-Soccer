/**
 * 0035: signing up records a request and grants nothing; confirming the email
 * is the only moment access is granted.
 *
 * Redeeming an invitation before the address is proven would let anyone who
 * knows a player's email sign up as that player and be placed on the team.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasTestDb } from './harness';
import {
  buildAccountsDb, one, uniq, makeTeam, makeRosterEntry, signUp, confirm, invite, type AccountsDb
} from './accounts-db';

const available = await hasTestDb();

const profile = (db: AccountsDb, id: string) => one(db.owner,
  `select role, status, school_id, player_id, requested_role, requested_team_id, email_verified
     from public.profiles where id = $1`, [id]);

describe.skipIf(!available)('0035: sign-up and confirmation', () => {
  let db: AccountsDb;
  beforeAll(async () => { db = await buildAccountsDb(); }, 240_000);
  afterAll(async () => { await db?.close(); });

  it('records a player request against its team, and grants nothing', async () => {
    const team = await makeTeam(db.owner);
    const u = await signUp(db.owner, { role: 'player', teamId: team.id });
    expect(await profile(db, u.id)).toMatchObject({
      role: 'guest', status: 'pending_verification', requested_role: 'player',
      requested_team_id: team.id, school_id: team.school_id, player_id: null
    });
  });

  it('turns a request for admin into a guest', async () => {
    // The metadata is written by the browser.
    const u = await signUp(db.owner, { role: 'admin' });
    expect(await profile(db, u.id)).toMatchObject({ role: 'guest', requested_role: 'guest' });
  });

  it('keeps no team that does not exist, and no organization with it', async () => {
    const u = await signUp(db.owner, { role: 'coach', teamId: '00000000-0000-4000-8000-00000000abcd' });
    expect(await profile(db, u.id)).toMatchObject({ requested_team_id: null, school_id: null });
  });

  it('files an uninvited player in the queue once confirmed', async () => {
    const team = await makeTeam(db.owner);
    const u = await signUp(db.owner, { role: 'player', teamId: team.id });
    await confirm(db.owner, u.id);
    expect(await profile(db, u.id)).toMatchObject({ role: 'guest', status: 'pending_approval', email_verified: true });
  });

  it('lets a fan straight in once confirmed', async () => {
    const u = await signUp(db.owner, { role: 'guest' });
    await confirm(db.owner, u.id);
    expect(await profile(db, u.id)).toMatchObject({ role: 'guest', status: 'active' });
  });

  it('does NOT redeem an invitation before the email is confirmed', async () => {
    const team = await makeTeam(db.owner);
    const player = await makeRosterEntry(db.owner, team);
    const email = `${uniq()}@example.com`;
    const inv = await invite(db.owner, { email, team, role: 'player', playerId: player });

    const u = await signUp(db.owner, { email, role: 'player', teamId: team.id });

    expect(await profile(db, u.id)).toMatchObject({ role: 'guest', status: 'pending_verification', player_id: null });
    expect(await one(db.owner, `select accepted_at from public.invitations where id = $1`, [inv.id]))
      .toEqual({ accepted_at: null });
  });

  it('links an invited player to their roster entry at confirmation', async () => {
    const team = await makeTeam(db.owner);
    const player = await makeRosterEntry(db.owner, team);
    const email = `${uniq()}@example.com`;
    const inv = await invite(db.owner, { email, team, role: 'player', playerId: player });

    const u = await signUp(db.owner, { email, role: 'guest' });
    await confirm(db.owner, u.id);

    expect(await profile(db, u.id)).toMatchObject({
      role: 'player', status: 'active', player_id: player, school_id: team.school_id
    });
    const used = await one(db.owner, `select accepted_at, accepted_by from public.invitations where id = $1`, [inv.id]);
    expect(used.accepted_at).not.toBeNull();
    expect(used.accepted_by).toBe(u.id);
  });

  it('puts an invited coach on the team staff at confirmation', async () => {
    const team = await makeTeam(db.owner);
    const email = `${uniq()}@example.com`;
    await invite(db.owner, { email, team, role: 'coach' });

    const u = await signUp(db.owner, { email });
    await confirm(db.owner, u.id);

    expect(await profile(db, u.id)).toMatchObject({ role: 'coach', status: 'active', school_id: team.school_id });
    expect(await one(db.owner,
      `select count(*)::int as n from public.team_coaches where team_id = $1 and profile_id = $2`, [team.id, u.id]))
      .toEqual({ n: 1 });
  });

  it('matches the invitation whatever case the address was typed in', async () => {
    const team = await makeTeam(db.owner);
    const local = uniq();
    await invite(db.owner, { email: `${local}@example.com`, team, role: 'coach' });
    const u = await signUp(db.owner, { email: `${local.toUpperCase()}@Example.com` });
    await confirm(db.owner, u.id);
    expect(await profile(db, u.id)).toMatchObject({ role: 'coach' });
  });

  it('redeems at insert when the account arrives already confirmed', async () => {
    const team = await makeTeam(db.owner);
    const email = `${uniq()}@example.com`;
    await invite(db.owner, { email, team, role: 'coach' });
    const u = await signUp(db.owner, { email, confirmed: true });
    expect(await profile(db, u.id)).toMatchObject({ role: 'coach', status: 'active' });
  });

  it('does not demote a profile already settled when the email is confirmed later', async () => {
    const team = await makeTeam(db.owner);
    const u = await signUp(db.owner, { role: 'player', teamId: team.id });
    await db.owner.query(`update public.profiles set role = 'coach', status = 'active' where id = $1`, [u.id]);
    await confirm(db.owner, u.id);
    expect(await profile(db, u.id)).toMatchObject({ role: 'coach', status: 'active' });
  });

  it('applies neither of two invitations naming different roster entries', async () => {
    // Guessing which person someone is puts a player on a squad they never played for.
    const a = await makeTeam(db.owner);
    const b = await makeTeam(db.owner);
    const email = `${uniq()}@example.com`;
    await invite(db.owner, { email, team: a, role: 'player', playerId: await makeRosterEntry(db.owner, a) });
    await invite(db.owner, { email, team: b, role: 'player', playerId: await makeRosterEntry(db.owner, b) });

    const u = await signUp(db.owner, { email, role: 'player' });
    await confirm(db.owner, u.id);

    expect(await profile(db, u.id)).toMatchObject({ status: 'pending_approval', player_id: null, role: 'guest' });
    expect(await one(db.owner,
      `select count(*)::int as n from public.invitations where email = $1 and accepted_at is not null`, [email]))
      .toEqual({ n: 0 });
  });

  it('skips a player invitation whose roster entry someone else has since claimed', async () => {
    const team = await makeTeam(db.owner);
    const player = await makeRosterEntry(db.owner, team);
    const other = await signUp(db.owner, { confirmed: true });
    await db.owner.query(`update public.profiles set player_id = $2 where id = $1`, [other.id, player]);

    const email = `${uniq()}@example.com`;
    await invite(db.owner, { email, team, role: 'player', playerId: player });
    const u = await signUp(db.owner, { email, role: 'guest' });
    await confirm(db.owner, u.id);

    expect(await profile(db, u.id)).toMatchObject({ player_id: null, role: 'guest', status: 'active' });
  });

  it('will not let a visitor run the promotion themselves', async () => {
    const u = await signUp(db.owner, { role: 'coach' });
    await db.asUser(u.id, async (c) => {
      await expect(c.query(`select public.promote_confirmed_profile($1)`, [u.id]))
        .rejects.toMatchObject({ code: '42501' });
    });
  });

  it('refuses a visitor changing their own role, status, roster link or requested team', async () => {
    const team = await makeTeam(db.owner);
    const player = await makeRosterEntry(db.owner, team);
    const u = await signUp(db.owner, { confirmed: true });

    for (const change of [
      `role = 'coach'`, `status = 'rejected'`, `player_id = '${player}'`, `requested_team_id = '${team.id}'`,
      `email = 'someone@example.com'`
    ]) {
      await db.asUser(u.id, async (c) => {
        await expect(c.query(`update public.profiles set ${change} where id = $1`, [u.id]))
          .rejects.toThrow(/Only an admin/);
      });
    }
  });

  it('still lets a visitor change their own name', async () => {
    const u = await signUp(db.owner, { confirmed: true });
    await db.asUser(u.id, async (c) => {
      await c.query(`update public.profiles set name = 'New Name' where id = $1`, [u.id]);
      expect(await one(c, `select name from public.profiles where id = $1`, [u.id])).toEqual({ name: 'New Name' });
    });
  });

  it('matches the address the confirmation proved, not an edited profile email', async () => {
    // A visitor cannot write profiles.email (the guard refuses it), but this
    // proves promote_confirmed_profile would still be safe if that ever broke:
    // it must read auth.users.email, not the editable profile column.
    const team = await makeTeam(db.owner);
    const addressA = `${uniq()}@example.com`;
    const addressB = `${uniq()}@example.com`;
    const inv = await invite(db.owner, { email: addressA, team, role: 'coach' });

    const u = await signUp(db.owner, { email: addressB });
    await db.owner.query(`update public.profiles set email = $2 where id = $1`, [u.id, addressA]);
    await confirm(db.owner, u.id);

    expect(await profile(db, u.id)).toMatchObject({ role: 'guest', status: 'active' });
    expect(await one(db.owner, `select accepted_at from public.invitations where id = $1`, [inv.id]))
      .toEqual({ accepted_at: null });
  });

  it('can be applied a second time', async () => {
    const { readFileSync } = await import('node:fs');
    const sql = readFileSync('supabase/migrations/0035_account_invitations.sql', 'utf8')
      .replace(/^\s*(begin|commit)\s*;\s*$/gim, '');
    await db.owner.query('begin');
    try {
      await db.owner.query(sql);
    } finally {
      await db.owner.query('rollback');
    }
  });
});
