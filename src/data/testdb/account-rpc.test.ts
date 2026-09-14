/**
 * 0035's functions, asked as real visitors.
 *
 * Every call here runs on an `authenticated` connection with the caller's id
 * as the JWT subject. The superuser harness would pass all of them -- including
 * the coach approval the profile guard used to refuse.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb } from './harness';
import {
  buildAccountsDb, one, uniq, makeTeam, makeRosterEntry, signUp, confirm, makeCoach, makeAdmin, invite,
  type AccountsDb
} from './accounts-db';

const available = await hasTestDb();

/** A confirmed, uninvited request for a place on `teamId`, or on no team. */
async function request(db: AccountsDb, role: 'player' | 'coach', teamId?: string) {
  const u = await signUp(db.owner, { role, teamId, name: 'Riley Stone' });
  await confirm(db.owner, u.id);
  return u.id;
}

describe.skipIf(!available)('0035: inviting, approving and rejecting', () => {
  let db: AccountsDb;
  beforeAll(async () => { db = await buildAccountsDb(); }, 240_000);
  afterAll(async () => { await db?.close(); });

  describe('create_invitation', () => {
    it("lets a coach invite a player to their own team's roster", async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const player = await makeRosterEntry(db.owner, team);
      await db.asUser(coach, async (c) => {
        const row = await one(c, `select * from public.create_invitation($1, $2, 'player', $3)`,
          ['  Kid@Example.COM ', team.id, player]);
        expect(row).toMatchObject({ email: 'kid@example.com', team_id: team.id, player_id: player, invited_by: coach });
      });
    });

    it("refuses a coach inviting to another team", async () => {
      const mine = await makeTeam(db.owner);
      const theirs = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, mine);
      const player = await makeRosterEntry(db.owner, theirs);
      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.create_invitation($1, $2, 'player', $3)`,
          [`${uniq()}@example.com`, theirs.id, player])).rejects.toThrow(/Only a coach of this team/);
      });
    });

    it('refuses a coach inviting a coach', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.create_invitation($1, $2, 'coach')`,
          [`${uniq()}@example.com`, team.id])).rejects.toThrow(/Only an admin can invite a coach/);
      });
    });

    it('lets an admin invite a coach', async () => {
      const team = await makeTeam(db.owner);
      const admin = await makeAdmin(db.owner);
      await db.asUser(admin, async (c) => {
        const row = await one(c, `select * from public.create_invitation($1, $2, 'coach')`,
          [`${uniq()}@example.com`, team.id]);
        expect(row).toMatchObject({ role: 'coach', player_id: null });
      });
    });

    it('refuses a roster entry that is not on the team, or already has an account', async () => {
      const team = await makeTeam(db.owner);
      const other = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const elsewhere = await makeRosterEntry(db.owner, other);
      const claimed = await makeRosterEntry(db.owner, team);
      const holder = await signUp(db.owner, { confirmed: true });
      await db.owner.query(`update public.profiles set player_id = $2 where id = $1`, [holder.id, claimed]);

      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.create_invitation($1, $2, 'player', $3)`,
          [`${uniq()}@example.com`, team.id, elsewhere])).rejects.toThrow(/not on this team's roster/);
      });
      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.create_invitation($1, $2, 'player', $3)`,
          [`${uniq()}@example.com`, team.id, claimed])).rejects.toThrow(/already has an account/);
      });
    });

    it('refuses a second open invitation for one address and team, and a non-address', async () => {
      const team = await makeTeam(db.owner);
      const admin = await makeAdmin(db.owner);
      const email = `${uniq()}@example.com`;
      await invite(db.owner, { email, team, role: 'coach' });
      await db.asUser(admin, async (c) => {
        await expect(c.query(`select public.create_invitation($1, $2, 'coach')`, [email, team.id]))
          .rejects.toThrow(/already has an open invitation/);
      });
      await db.asUser(admin, async (c) => {
        await expect(c.query(`select public.create_invitation('not an address', $1, 'coach')`, [team.id]))
          .rejects.toThrow(/does not look like an email address/);
      });
    });
  });

  describe('reading invitations', () => {
    it("shows a coach their own team's invitations and nobody else's", async () => {
      const mine = await makeTeam(db.owner);
      const theirs = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, mine);
      const guest = await signUp(db.owner, { confirmed: true });
      await invite(db.owner, { email: `${uniq()}@example.com`, team: mine, role: 'coach' });
      await invite(db.owner, { email: `${uniq()}@example.com`, team: theirs, role: 'coach' });

      await db.asUser(coach, async (c) => {
        const { rows } = await c.query(`select team_id from public.invitations where team_id in ($1, $2)`, [mine.id, theirs.id]);
        expect(rows).toEqual([{ team_id: mine.id }]);
      });
      await db.asUser(guest.id, async (c) => {
        expect((await c.query(`select id from public.invitations`)).rows).toEqual([]);
      });
    });

    it('refuses writing the table directly, even for a coach', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      await db.asUser(coach, async (c) => {
        await expect(c.query(
          `insert into public.invitations (email, school_id, team_id, role) values ('x@example.com', $1, $2, 'coach')`,
          [team.school_id, team.id])).rejects.toMatchObject({ code: '42501' });
      });
    });
  });

  describe('revoke_invitation', () => {
    it("lets a coach withdraw their team's player invitation but not a coach's", async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const playerInv = await invite(db.owner, {
        email: `${uniq()}@example.com`, team, role: 'player', playerId: await makeRosterEntry(db.owner, team)
      });
      const coachInv = await invite(db.owner, { email: `${uniq()}@example.com`, team, role: 'coach' });

      await db.asUser(coach, async (c) => {
        await c.query(`select public.revoke_invitation($1)`, [playerInv.id]);
        const row = await one(c, `select revoked_at from public.invitations where id = $1`, [playerInv.id]);
        expect(row.revoked_at).not.toBeNull();
      });
      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.revoke_invitation($1)`, [coachInv.id]))
          .rejects.toThrow(/Only an admin/);
      });
    });
  });

  describe('pending_requests', () => {
    it("shows a coach only player requests for teams they coach", async () => {
      const mine = await makeTeam(db.owner);
      const theirs = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, mine);
      const wanted = await request(db, 'player', mine.id);
      await request(db, 'player', theirs.id);
      await request(db, 'coach', mine.id);

      await db.asUser(coach, async (c) => {
        const { rows } = await c.query(`select id, requested_role, team_name from public.pending_requests()`);
        expect(rows).toEqual([{ id: wanted, requested_role: 'player', team_name: 'U14' }]);
      });
    });

    it('shows an admin every request, including one that named no team', async () => {
      const admin = await makeAdmin(db.owner);
      const teamless = await request(db, 'player');
      await db.asUser(admin, async (c) => {
        const { rows } = await c.query(`select id from public.pending_requests()`);
        expect(rows.map((r: any) => r.id)).toContain(teamless);
      });
    });
  });

  describe('approve_player_request', () => {
    it('creates the roster entry and links the account, through the profile guard', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const req = await request(db, 'player', team.id);

      await db.asUser(coach, async (c) => {
        const { approve_player_request: pid } = await one(c,
          `select public.approve_player_request($1, $2)`, [req, team.id]);
        expect(await one(c, `select role, status, player_id, school_id from public.profiles where id = $1`, [req]))
          .toEqual({ role: 'player', status: 'active', player_id: pid, school_id: team.school_id });
        expect(await one(c, `select name from public.players where id = $1`, [pid])).toEqual({ name: 'Riley Stone' });
        expect(await one(c,
          `select count(*)::int as n from public.team_players where team_id = $1 and player_id = $2`, [team.id, pid]))
          .toEqual({ n: 1 });
      });
    });

    it('links an existing roster entry, and refuses one already linked', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const free = await makeRosterEntry(db.owner, team);
      const claimed = await makeRosterEntry(db.owner, team);
      const holder = await signUp(db.owner, { confirmed: true });
      await db.owner.query(`update public.profiles set player_id = $2 where id = $1`, [holder.id, claimed]);
      const req = await request(db, 'player', team.id);

      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.approve_player_request($1, $2, $3)`, [req, team.id, claimed]))
          .rejects.toThrow(/already has an account/);
      });
      await db.asUser(coach, async (c) => {
        await c.query(`select public.approve_player_request($1, $2, $3)`, [req, team.id, free]);
        expect(await one(c, `select player_id from public.profiles where id = $1`, [req])).toEqual({ player_id: free });
      });
    });

    it('refuses a coach placing a request on a team other than the one requested', async () => {
      const mine = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, mine);
      const other = await makeTeam(db.owner);
      await db.owner.query(`insert into public.team_coaches (team_id, profile_id) values ($1, $2)`, [other.id, coach]);
      const req = await request(db, 'player', mine.id);
      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.approve_player_request($1, $2)`, [req, other.id]))
          .rejects.toThrow(/Only an admin can place a request on a team other than/);
      });
    });

    it('lets an admin place a request that named no team', async () => {
      const team = await makeTeam(db.owner);
      const admin = await makeAdmin(db.owner);
      const req = await request(db, 'player');
      await db.asUser(admin, async (c) => {
        await c.query(`select public.approve_player_request($1, $2)`, [req, team.id]);
        expect(await one(c, `select status, school_id from public.profiles where id = $1`, [req]))
          .toEqual({ status: 'active', school_id: team.school_id });
      });
    });

    it("still refuses a coach changing another profile's role directly", async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const req = await request(db, 'player', team.id);
      await db.asUser(coach, async (c) => {
        // profiles_update allows only the row's owner or an admin, so the
        // update matches no row rather than raising.
        const res = await c.query(`update public.profiles set role = 'coach' where id = $1`, [req]);
        expect(res.rowCount).toBe(0);
      });
    });
  });

  describe('approve_coach_request and reject_request', () => {
    it('refuses a coach approving a coach, and lets an admin', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const admin = await makeAdmin(db.owner);
      const req = await request(db, 'coach', team.id);

      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.approve_coach_request($1, $2)`, [req, team.id]))
          .rejects.toThrow(/Only an admin can approve a coach/);
      });
      await db.asUser(admin, async (c) => {
        await c.query(`select public.approve_coach_request($1, $2)`, [req, team.id]);
        expect(await one(c, `select role, status from public.profiles where id = $1`, [req]))
          .toEqual({ role: 'coach', status: 'active' });
        expect(await one(c,
          `select count(*)::int as n from public.team_coaches where team_id = $1 and profile_id = $2`, [team.id, req]))
          .toEqual({ n: 1 });
      });
    });

    it("lets a coach refuse their team's player request but not a coach request", async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const player = await request(db, 'player', team.id);
      const staff = await request(db, 'coach', team.id);

      await db.asUser(coach, async (c) => {
        await c.query(`select public.reject_request($1)`, [player]);
        expect(await one(c, `select status from public.profiles where id = $1`, [player])).toEqual({ status: 'rejected' });
      });
      await db.asUser(coach, async (c) => {
        await expect(c.query(`select public.reject_request($1)`, [staff])).rejects.toThrow(/Only an admin/);
      });
    });
  });

  describe('team_linked_players', () => {
    it("tells a team's coach which roster entries have accounts, and tells anyone else nothing", async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const outsider = await makeCoach(db.owner, await makeTeam(db.owner));
      const linked = await makeRosterEntry(db.owner, team);
      await makeRosterEntry(db.owner, team);
      const holder = await signUp(db.owner, { confirmed: true });
      await db.owner.query(`update public.profiles set player_id = $2 where id = $1`, [holder.id, linked]);

      await db.asUser(coach, async (c) => {
        expect((await c.query(`select player_id from public.team_linked_players($1)`, [team.id])).rows)
          .toEqual([{ player_id: linked }]);
      });
      await db.asUser(outsider, async (c) => {
        expect((await c.query(`select player_id from public.team_linked_players($1)`, [team.id])).rows).toEqual([]);
      });
    });
  });

  describe('redeem_my_invitations', () => {
    // Redemption at confirmation only reaches a profile at pending_verification,
    // so an address that already has an account -- a parent, a player with a
    // school account, a coach invited to a second team -- is connected when it
    // next signs in, by this.
    const emailOf = async (id: string) =>
      (await one(db.owner, `select email from auth.users where id = $1`, [id])).email as string;
    const accepted = async (invId: string) =>
      (await one(db.owner, `select accepted_at from public.invitations where id = $1`, [invId])).accepted_at;

    it('links an active fan invited as a player', async () => {
      const team = await makeTeam(db.owner);
      const player = await makeRosterEntry(db.owner, team);
      const fan = await signUp(db.owner, { confirmed: true });
      const inv = await invite(db.owner, { email: fan.email, team, role: 'player', playerId: player });

      await db.asUser(fan.id, async (c) => {
        expect(await one(c, `select public.redeem_my_invitations() as n`)).toEqual({ n: 1 });
        expect(await one(c, `select role, status, player_id, school_id from public.profiles where id = $1`, [fan.id]))
          .toEqual({ role: 'player', status: 'active', player_id: player, school_id: team.school_id });
        // The fan cannot read invitations, so the owner checks it once this commits.
        await c.query('commit');
      });
      expect(await one(db.owner, `select accepted_by from public.invitations where id = $1`, [inv.id]))
        .toEqual({ accepted_by: fan.id });
    });

    it('gives an active coach invited to a second team a place on its staff, and keeps them a coach', async () => {
      const first = await makeTeam(db.owner);
      const second = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, first);
      await invite(db.owner, { email: await emailOf(coach), team: second, role: 'coach' });

      await db.asUser(coach, async (c) => {
        expect(await one(c, `select public.redeem_my_invitations() as n`)).toEqual({ n: 1 });
        expect(await one(c, `select role, school_id from public.profiles where id = $1`, [coach]))
          .toEqual({ role: 'coach', school_id: first.school_id });
        expect((await c.query(`select team_id from public.team_coaches where profile_id = $1 order by team_id`, [coach]))
          .rows.map((r: any) => r.team_id).sort()).toEqual([first.id, second.id].sort());
      });
    });

    it('keeps an admin invited as a coach an admin', async () => {
      const team = await makeTeam(db.owner);
      const admin = await makeAdmin(db.owner);
      await invite(db.owner, { email: await emailOf(admin), team, role: 'coach' });

      await db.asUser(admin, async (c) => {
        expect(await one(c, `select public.redeem_my_invitations() as n`)).toEqual({ n: 1 });
        expect(await one(c, `select role from public.profiles where id = $1`, [admin])).toEqual({ role: 'admin' });
        expect(await one(c,
          `select count(*)::int as n from public.team_coaches where team_id = $1 and profile_id = $2`, [team.id, admin]))
          .toEqual({ n: 1 });
      });
    });

    it('refuses an account that is not active yet', async () => {
      const team = await makeTeam(db.owner);
      const pending = await request(db, 'player', team.id);
      await invite(db.owner, { email: await emailOf(pending), team, role: 'coach' });

      await db.asUser(pending, async (c) => {
        await expect(c.query(`select public.redeem_my_invitations()`)).rejects.toThrow(/active account/);
      });
    });

    it('does not re-link a player already linked to a different roster entry, and leaves the invitation open', async () => {
      const team = await makeTeam(db.owner);
      const mine = await makeRosterEntry(db.owner, team);
      const other = await makeRosterEntry(db.owner, team);
      const holder = await signUp(db.owner, { confirmed: true });
      await db.owner.query(`update public.profiles set role = 'player', player_id = $2 where id = $1`, [holder.id, mine]);
      const inv = await invite(db.owner, { email: holder.email, team, role: 'player', playerId: other });

      await db.asUser(holder.id, async (c) => {
        expect(await one(c, `select public.redeem_my_invitations() as n`)).toEqual({ n: 0 });
        expect(await one(c, `select player_id from public.profiles where id = $1`, [holder.id]))
          .toEqual({ player_id: mine });
        await c.query('commit');
      });
      expect(await accepted(inv.id)).toBeNull();
    });

    it('cannot be run by a visitor who is not signed in, nor redeem_invitations by anyone', async () => {
      const fan = await signUp(db.owner, { confirmed: true });
      await db.asAnon(async (c) => {
        await expect(c.query(`select public.redeem_my_invitations()`)).rejects.toMatchObject({ code: '42501' });
      });
      await db.asUser(fan.id, async (c) => {
        await expect(c.query(`select public.redeem_invitations($1)`, [fan.id])).rejects.toMatchObject({ code: '42501' });
      });
    });
  });

  describe('a signed-in caller with no profile', () => {
    it('is refused every privileged action rather than let through', async () => {
      const team = await makeTeam(db.owner);
      const coachReq = await request(db, 'coach', team.id);
      const playerReq = await request(db, 'player', team.id);
      const openInvite = await invite(db.owner, { email: `${uniq()}@example.com`, team, role: 'coach' });
      const ghost = randomUUID();

      await db.asUser(ghost, async (c) => {
        await expect(c.query(`select public.create_invitation($1, $2, 'coach')`, [`${uniq()}@example.com`, team.id]))
          .rejects.toThrow(/Only/);
      });
      await db.asUser(ghost, async (c) => {
        await expect(c.query(`select public.approve_coach_request($1, $2)`, [coachReq, team.id]))
          .rejects.toThrow(/Only/);
      });
      await db.asUser(ghost, async (c) => {
        await expect(c.query(`select public.approve_player_request($1, $2)`, [playerReq, team.id]))
          .rejects.toThrow(/Only/);
      });
      await db.asUser(ghost, async (c) => {
        await expect(c.query(`select public.revoke_invitation($1)`, [openInvite.id]))
          .rejects.toThrow(/Only/);
      });
      await db.asUser(ghost, async (c) => {
        await expect(c.query(`select public.reject_request($1)`, [playerReq]))
          .rejects.toThrow(/Only/);
      });
    });
  });
});
