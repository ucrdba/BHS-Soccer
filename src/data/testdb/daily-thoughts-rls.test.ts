/**
 * 0029 — the coach's daily message is readable by the squad only.
 *
 * Row-level security cannot be proved by reading a policy's text: what a
 * policy admits depends on the helper functions it calls, on profile status,
 * and on how permissive policies combine. So each case here signs in as a
 * real kind of user -- `set local role` plus the JWT subject auth.uid() reads
 * -- and asks Postgres what it will hand back.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';

const available = await hasTestDb();

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/0029_daily_thoughts_members_only.sql'), 'utf8');

/**
 * The migration, without its own transaction control — the harness has
 * already opened one, and a nested `begin`/`commit` would end it.
 */
async function apply(c: any) {
  await c.query(MIGRATION.replace(/^\s*(begin|commit)\s*;\s*$/gim, ''));
}

/**
 * Two organizations, a team in each, and one of every kind of user.
 *
 * Profiles are written directly rather than by signing users up. Signing up
 * runs whichever handle_new_user this database has, and the demo's makes every
 * new account an active coach of a team of its own -- which would quietly turn
 * every "player" below into a coach. The triggers are switched off for this
 * transaction only; the harness rolls it back.
 */
async function world(c: any) {
  await c.query('alter table auth.users disable trigger user');

  const org = async (code: string, name: string) => (await c.query(
    `insert into schools (code, name, mascot) values ($1, $2, 'Test') returning id`,
    [code, name])).rows[0].id;
  const club = await org('rls-lfc', 'Legends FC');
  const other = await org('rls-ofc', 'Other FC');

  const team = async (schoolId: string) => (await c.query(
    `insert into teams (school_id, name) values ($1, 'U16') returning id`, [schoolId])).rows[0].id;
  const squad = await team(club);
  const rival = await team(other);

  const player = async (name: string, teamId: string, schoolId: string, dropped = false) => {
    const id = (await c.query(
      `insert into players (name, class_year) values ($1, '2027') returning id`, [name])).rows[0].id;
    await c.query(
      `insert into team_players (team_id, school_id, player_id, is_deleted) values ($1, $2, $3, $4)`,
      [teamId, schoolId, id, dropped]);
    return id;
  };

  const person = async (key: string, role: string, status: string, schoolId: string, playerId: string | null = null) => {
    const email = `${key}@rls.test`;
    const id = (await c.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
    await c.query(
      `insert into profiles (id, school_id, name, email, role, status, player_id)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, schoolId, key, email, role, status, playerId]);
    return id;
  };

  const users = {
    player: await person('player', 'player', 'active', club, await player('On Squad', squad, club)),
    rivalPlayer: await person('rival-player', 'player', 'active', other, await player('On Rival', rival, other)),
    pendingPlayer: await person('pending', 'player', 'pending_approval', club, await player('Pending', squad, club)),
    rejectedPlayer: await person('rejected', 'player', 'rejected', club, await player('Rejected', squad, club)),
    droppedPlayer: await person('dropped', 'player', 'active', club, await player('Dropped', squad, club, true)),
    unlinkedPlayer: await person('unlinked', 'player', 'active', club, null),
    guest: await person('guest', 'guest', 'active', club),
    coach: await person('coach', 'coach', 'active', club),
    rivalCoach: await person('rival-coach', 'coach', 'active', other),
    admin: await person('admin', 'admin', 'active', club)
  };

  await c.query(`insert into team_coaches (team_id, profile_id) values ($1, $2)`, [squad, users.coach]);
  await c.query(`insert into team_coaches (team_id, profile_id) values ($1, $2)`, [rival, users.rivalCoach]);

  const thought = async (teamId: string, text: string, deleted = false) => (await c.query(
    `insert into daily_thoughts (team_id, thoughts_text, coach_name, is_deleted)
     values ($1, $2, 'Coach', $3) returning id`, [teamId, text, deleted])).rows[0].id;

  const ids = [
    await thought(squad, 'Squad message'),
    await thought(rival, 'Rival message'),
    await thought(squad, 'Withdrawn message', true)
  ];

  return { users, squad, rival, ids };
}

/**
 * What one user is handed, among the three messages this test wrote.
 *
 * Filtered to those ids because the demo schema seeds rows of its own, and an
 * admin would rightly see them too.
 */
async function readAs(c: any, userId: string | null, ids: string[]): Promise<string[]> {
  await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
  await c.query(userId ? 'set local role authenticated' : 'set local role anon');
  try {
    const { rows } = await c.query(
      `select thoughts_text from daily_thoughts where id = any($1) order by thoughts_text`, [ids]);
    return rows.map((r: any) => r.thoughts_text);
  } finally {
    await c.query('reset role');
  }
}

describe.skipIf(!available)('0029: who may read the daily message', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('BEFORE it, a visitor with the public key read every team\'s messages', async () => {
    // The premise. If this ever fails, the gap it closes has closed some
    // other way and this migration should be re-read against that.
    await withDb(async (c) => {
      const w = await world(c);
      expect(await readAs(c, null, w.ids)).toEqual(['Rival message', 'Squad message']);
    });
  });

  it('after it, a visitor reads nothing at all', async () => {
    await withDb(async (c) => {
      const w = await world(c);
      await apply(c);
      expect(await readAs(c, null, w.ids)).toEqual([]);
    });
  });

  it("a player reads their own team's message -- not another team's, not a withdrawn one", async () => {
    await withDb(async (c) => {
      const w = await world(c);
      await apply(c);
      expect(await readAs(c, w.users.player, w.ids)).toEqual(['Squad message']);
    });
  });

  it("a player at another organization reads only their own team's", async () => {
    // Multi-tenant: a club's squad does not read Beaumont's messages.
    await withDb(async (c) => {
      const w = await world(c);
      await apply(c);
      expect(await readAs(c, w.users.rivalPlayer, w.ids)).toEqual(['Rival message']);
    });
  });

  /*
   * current_profile_role() falls back to 'guest' once status is not 'active',
   * and is_team_member() wraps the squad check inside the role check. Each of
   * these is ON the squad in team_players, so only the role gate refuses them.
   */
  it('a player awaiting approval reads nothing, though they are on the squad', async () => {
    await withDb(async (c) => {
      const w = await world(c);
      await apply(c);
      expect(await readAs(c, w.users.pendingPlayer, w.ids)).toEqual([]);
    });
  });

  it('a rejected player reads nothing, though their squad row survives', async () => {
    await withDb(async (c) => {
      const w = await world(c);
      await apply(c);
      expect(await readAs(c, w.users.rejectedPlayer, w.ids)).toEqual([]);
    });
  });

  it('a player dropped from the squad reads nothing', async () => {
    await withDb(async (c) => {
      const w = await world(c);
      await apply(c);
      expect(await readAs(c, w.users.droppedPlayer, w.ids)).toEqual([]);
    });
  });

  it('a player account not yet linked to a player reads nothing', async () => {
    await withDb(async (c) => {
      const w = await world(c);
      await apply(c);
      expect(await readAs(c, w.users.unlinkedPlayer, w.ids)).toEqual([]);
    });
  });

  it('a signed-in guest reads nothing -- the message is for players, coaches and admins', async () => {
    await withDb(async (c) => {
      const w = await world(c);
      await apply(c);
      expect(await readAs(c, w.users.guest, w.ids)).toEqual([]);
    });
  });

  it("a coach reads their own team's messages and not another team's", async () => {
    // Including the withdrawn one: daily_thoughts_write is `for all`, so a
    // coach reads through it as well, deleted rows included. That is 0015's
    // behaviour and unchanged here -- it is how a coach can restore a message.
    await withDb(async (c) => {
      const w = await world(c);
      await apply(c);
      const read = await readAs(c, w.users.coach, w.ids);
      expect(read).toContain('Squad message');
      expect(read).not.toContain('Rival message');
    });
  });

  it("an admin reads every team's messages, as they can already write them", async () => {
    await withDb(async (c) => {
      const w = await world(c);
      await apply(c);
      const read = await readAs(c, w.users.admin, w.ids);
      expect(read).toContain('Squad message');
      expect(read).toContain('Rival message');
    });
  });

  it('answers false, not null, for a visitor', async () => {
    // A null from a policy expression refuses the row too, but a helper that
    // says false is one the next policy can use without re-learning that.
    await withDb(async (c) => {
      const w = await world(c);
      await apply(c);
      await c.query(`select set_config('request.jwt.claim.sub', '', true)`);
      const { rows } = await c.query(`select public.is_team_member($1) as ok`, [w.squad]);
      expect(rows[0].ok).toBe(false);
    });
  });

  it('can be run twice', async () => {
    await withDb(async (c) => {
      const w = await world(c);
      await apply(c);
      await apply(c);
      expect(await readAs(c, w.users.player, w.ids)).toEqual(['Squad message']);
      expect(await readAs(c, null, w.ids)).toEqual([]);
    });
  });

  it("leaves writing alone: a coach still posts to their own team", async () => {
    await withDb(async (c) => {
      const w = await world(c);
      await apply(c);
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [w.users.coach]);
      await c.query('set local role authenticated');
      const { rows } = await c.query(
        `insert into daily_thoughts (team_id, thoughts_text, coach_name)
         values ($1, 'Posted today', 'Coach') returning id`, [w.squad]);
      expect(rows).toHaveLength(1);
    });
  });

  it("and still cannot post to another team's", async () => {
    // Last statement in its transaction on purpose: a refused write aborts it.
    await withDb(async (c) => {
      const w = await world(c);
      await apply(c);
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [w.users.coach]);
      await c.query('set local role authenticated');
      await expect(c.query(
        `insert into daily_thoughts (team_id, thoughts_text, coach_name)
         values ($1, 'Not mine', 'Coach')`, [w.rival])).rejects.toThrow(/row-level security/i);
    });
  });
});
