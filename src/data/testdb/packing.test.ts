/**
 * 0041 — packing points.
 *
 * Constraint questions run on the owner connection inside a rolled-back
 * transaction. Every question about who may read or write a tag runs as a
 * visitor: the superuser harness would pass them all.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';
import { hasTestDb } from './harness';
import {
  buildAccountsDb, one, makeTeam, makeRosterEntry, makeCoach, signUp,
  type AccountsDb
} from './accounts-db';

const available = await hasTestDb();

const read = (file: string) => readFileSync(join(process.cwd(), 'supabase/migrations', file), 'utf8')
  .replace(/^\s*(begin|commit)\s*;\s*$/gim, '');

type Team = { id: string; school_id: string };

async function makeStatMatch(owner: pg.Client, team: Team): Promise<string> {
  const row = await one(owner,
    `insert into public.stat_matches (team_id, school_id, label) values ($1, $2, 'fixture') returning id`,
    [team.id, team.school_id]);
  return row.id;
}

/** Runs fn in a savepoint and expects Postgres to refuse it. */
async function refused(c: pg.Client, fn: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  await c.query('savepoint s');
  await expect(fn()).rejects.toThrow(pattern);
  await c.query('rollback to savepoint s');
}

describe.skipIf(!available)('0041: packing', () => {
  let db: AccountsDb;
  beforeAll(async () => { db = await buildAccountsDb(); }, 240_000);
  afterAll(async () => { await db?.close(); });

  const event = (c: pg.Client, match: string, kind: string, player: string | null, bypassed: number | null) =>
    c.query(
      `insert into public.stat_events (match_id, kind, player_id, at_seconds, bypassed) values ($1, $2, $3, 60, $4)`,
      [match, kind, player, bypassed]);

  const tag = (c: pg.Client, match: string, t: {
    player: string; receiver: string | null; action: string; bypassed: number; video?: number | null;
  }) => c.query(
    `insert into public.packing_tags (match_id, player_id, receiver_id, action, bypassed, video_seconds)
     values ($1, $2, $3, $4, $5, $6)`,
    [match, t.player, t.receiver, t.action, t.bypassed, t.video ?? null]);

  it('stores a live packing tap and refuses one without a count in range', async () => {
    const c = db.owner;
    await c.query('begin');
    try {
      const team = await makeTeam(c);
      const p = await makeRosterEntry(c, team);
      const m = await makeStatMatch(c, team);

      await event(c, m, 'packing', p, 3);
      await event(c, m, 'packing', p, 11);
      await refused(c, () => event(c, m, 'packing', p, null), /stat_events_bypassed_chk/);
      await refused(c, () => event(c, m, 'packing', p, 0), /stat_events_bypassed_chk/);
      await refused(c, () => event(c, m, 'packing', p, 12), /stat_events_bypassed_chk/);
      await refused(c, () => event(c, m, 'packing', null, 3), /stat_events_player_chk/);
      await refused(c, () => event(c, m, 'plus', p, 2), /stat_events_bypassed_chk/);
    } finally {
      await c.query('rollback');
    }
  });

  it('still accepts every kind that existed before it', async () => {
    // The kind and player checks are dropped and recreated; one that lost a
    // kind would refuse a live match mid-half.
    const c = db.owner;
    await c.query('begin');
    try {
      const team = await makeTeam(c);
      const p = await makeRosterEntry(c, team);
      const m = await makeStatMatch(c, team);
      for (const k of ['on', 'off', 'plus', 'minus', 'shot', 'goal', 'assist']) await event(c, m, k, p, null);
      for (const k of ['goal_for', 'goal_against', 'clock_start', 'clock_stop', 'period']) await event(c, m, k, null, null);
      await refused(c, () => event(c, m, 'tackle', p, null), /stat_events_kind_chk/);
    } finally {
      await c.query('rollback');
    }
  });

  it('holds a video tag to its shape', async () => {
    const c = db.owner;
    await c.query('begin');
    try {
      const team = await makeTeam(c);
      const a = await makeRosterEntry(c, team);
      const b = await makeRosterEntry(c, team);
      const m = await makeStatMatch(c, team);

      await tag(c, m, { player: a, receiver: b, action: 'pass', bypassed: 4, video: 1421 });
      await tag(c, m, { player: a, receiver: null, action: 'dribble', bypassed: 2 });

      await refused(c, () => tag(c, m, { player: a, receiver: null, action: 'pass', bypassed: 2 }), /packing_tags_receiver_chk/);
      await refused(c, () => tag(c, m, { player: a, receiver: b, action: 'dribble', bypassed: 2 }), /packing_tags_receiver_chk/);
      await refused(c, () => tag(c, m, { player: a, receiver: a, action: 'pass', bypassed: 2 }), /packing_tags_receiver_chk/);
      await refused(c, () => tag(c, m, { player: a, receiver: null, action: 'header', bypassed: 2 }), /packing_tags_action_chk/);
      await refused(c, () => tag(c, m, { player: a, receiver: null, action: 'dribble', bypassed: 0 }), /packing_tags_bypassed_chk/);
      await refused(c, () => tag(c, m, { player: a, receiver: null, action: 'dribble', bypassed: 12 }), /packing_tags_bypassed_chk/);
      await refused(c, () => tag(c, m, { player: a, receiver: null, action: 'dribble', bypassed: 2, video: -1 }), /packing_tags_video_chk/);
    } finally {
      await c.query('rollback');
    }
  });

  it('runs a second time without complaint', async () => {
    const c = db.owner;
    await c.query('begin');
    try {
      await c.query(read('0041_packing.sql'));
    } finally {
      await c.query('rollback');
    }
  });

  describe('who may read and write tags', () => {
    let team: Team, other: Team, match: string, player: string, receiver: string;
    let coach: string, otherCoach: string, playerAccount: string;

    beforeAll(async () => {
      team = await makeTeam(db.owner);
      other = await makeTeam(db.owner);
      player = await makeRosterEntry(db.owner, team);
      receiver = await makeRosterEntry(db.owner, team);
      match = await makeStatMatch(db.owner, team);
      await tag(db.owner, match, { player, receiver, action: 'pass', bypassed: 3 });
      coach = await makeCoach(db.owner, team);
      otherCoach = await makeCoach(db.owner, other);
      const u = await signUp(db.owner, { confirmed: true });
      await db.owner.query(
        `update public.profiles set role = 'player', status = 'active', player_id = $2 where id = $1`,
        [u.id, player]);
      playerAccount = u.id;
    }, 60_000);

    const count = async (c: pg.Client) =>
      Number((await one(c, `select count(*)::int as n from public.packing_tags where match_id = $1`, [match])).n);

    it("lets the team's coach read and write", async () => {
      await db.asUser(coach, async (c) => {
        expect(await count(c)).toBe(1);
        await tag(c, match, { player, receiver: null, action: 'dribble', bypassed: 1 });
        expect(await count(c)).toBe(2);
      });
    });

    it("hides the team's tags from another team's coach and refuses their writes", async () => {
      await db.asUser(otherCoach, async (c) => {
        expect(await count(c)).toBe(0);
        await expect(tag(c, match, { player, receiver: null, action: 'dribble', bypassed: 1 }))
          .rejects.toThrow(/row-level security/);
      });
    });

    it('gives a player and a signed-out visitor nothing', async () => {
      await db.asUser(playerAccount, async (c) => {
        expect(await count(c)).toBe(0);
        await expect(tag(c, match, { player, receiver: null, action: 'dribble', bypassed: 1 }))
          .rejects.toThrow(/row-level security/);
      });
      await db.asAnon(async (c) => {
        await expect(count(c)).rejects.toThrow(/permission denied/);
      });
    });
  });
});
