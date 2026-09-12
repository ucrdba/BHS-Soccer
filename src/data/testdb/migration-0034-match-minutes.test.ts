/**
 * 0034 — teams.match_minutes, the column CLAUDE.md already described.
 *
 * `seasonFullMatchMinutes` reads `team.match_minutes` and falls back to 80
 * when it is missing, so the absence was invisible: every team simply played
 * 80 minutes, including the club sides that do not.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';

const available = await hasTestDb();

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/0034_team_match_minutes.sql'), 'utf8');

/** The migration without its own transaction control: withDb has opened one. */
const apply = (c: any) => c.query(MIGRATION.replace(/^\s*(begin|commit)\s*;\s*$/gim, ''));

async function aTeam(c: any) {
  const school = (await c.query(
    `insert into public.schools (code, name, mascot) values ('alpha', 'Alpha', 'A') returning id`)).rows[0].id;
  return (await c.query(
    `insert into public.teams (school_id, name, season) values ($1, 'Varsity', '2026') returning id`,
    [school])).rows[0].id;
}

const minutesOf = async (c: any, team: string) =>
  (await c.query(`select match_minutes from public.teams where id = $1`, [team])).rows[0].match_minutes;

describe.skipIf(!available)('0034: a team says how long its matches are', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('is absent from a database built from the migrations before it', async () => {
    await withDb(async (c) => {
      await expect(c.query(`select match_minutes from public.teams limit 1`))
        .rejects.toThrow(/match_minutes.*does not exist/);
    });
  }, 60_000);

  it('leaves an existing team unstated rather than claiming 80', async () => {
    await withDb(async (c) => {
      const team = await aTeam(c);
      await apply(c);
      expect(await minutesOf(c, team)).toBeNull();
    });
  }, 60_000);

  it('takes a club length as readily as a high school one', async () => {
    await withDb(async (c) => {
      const team = await aTeam(c);
      await apply(c);

      await c.query(`update public.teams set match_minutes = 70 where id = $1`, [team]);
      expect(await minutesOf(c, team)).toBe(70);
      await c.query(`update public.teams set match_minutes = 90 where id = $1`, [team]);
      expect(await minutesOf(c, team)).toBe(90);
    });
  }, 60_000);

  // Both would make every per-match rate meaningless; the domain refuses them
  // defensively, and this stops them being stored at all.
  it('refuses a length of zero or less', async () => {
    await withDb(async (c) => {
      const team = await aTeam(c);
      await apply(c);

      // A refused statement aborts the transaction, so each attempt gets its
      // own savepoint to roll back to.
      for (const bad of [0, -5]) {
        await c.query('savepoint before_bad');
        await expect(c.query(`update public.teams set match_minutes = $1 where id = $2`, [bad, team]))
          .rejects.toThrow(/teams_match_minutes_positive/);
        await c.query('rollback to savepoint before_bad');
      }
    });
  }, 60_000);

  it('can be run twice, as applying it to production effectively is', async () => {
    await withDb(async (c) => {
      await apply(c);
      await apply(c);
      const team = await aTeam(c);
      await c.query(`update public.teams set match_minutes = 80 where id = $1`, [team]);
      expect(await minutesOf(c, team)).toBe(80);
    });
  }, 60_000);
});
