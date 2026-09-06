/**
 * The rules the roster writes depend on, checked against a real Postgres.
 *
 * These are enforced by indexes and a composite foreign key, not by
 * application code, so nothing in the TypeScript suite can prove them. They
 * are also the rules whose failure is silent: a membership that lands on the
 * wrong organization, or a player who can never be added to JV because their
 * removed Varsity row still occupies the slot.
 *
 * Skipped when no Postgres answers, so the rest of the suite still runs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';

const available = await hasTestDb();

/** Two organizations, a team in each, and one player. */
async function fixture(c: any) {
  const school = async (code: string, name: string) => (await c.query(
    `insert into schools (code, name, mascot) values ($1, $2, 'Test')
     returning id`, [code, name])).rows[0].id;

  const team = async (schoolId: string, name: string) => (await c.query(
    `insert into teams (school_id, name) values ($1, $2) returning id`,
    [schoolId, name])).rows[0].id;

  const bhs = await school('bhs-t', 'Beaumont High School');
  const club = await school('club-t', 'Legends FC');

  return {
    bhs, club,
    varsity: await team(bhs, 'Varsity'),
    jv: await team(bhs, 'JV'),
    u16: await team(club, 'U16'),
    // class_year is NOT NULL -- migration 0005 dropped `number` and
    // `position` from players but left this one, which is why
    // upsertPlayerIdentity defaults it to 'Senior' rather than passing blank.
    player: (await c.query(
      `insert into players (name, class_year) values ('Cesar Alva', 'Senior')
       returning id`)).rows[0].id
  };
}

const join = (c: any, teamId: string, schoolId: string, playerId: string, over = '') =>
  c.query(
    `insert into team_players (team_id, school_id, player_id) values ($1, $2, $3) ${over}`,
    [teamId, schoolId, playerId]);

describe.skipIf(!available)('one team per organization', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('lets a player join a team', async () => {
    await withDb(async (c) => {
      const f = await fixture(c);
      await join(c, f.varsity, f.bhs, f.player);
      const { rows } = await c.query('select count(*)::int as n from team_players');
      expect(rows[0].n).toBe(1);
    });
  });

  it('refuses the same player on two teams in ONE organization', async () => {
    // The central rule: Varsity and JV belong to the same school, so a player
    // is on one of them, not both.
    await withDb(async (c) => {
      const f = await fixture(c);
      await join(c, f.varsity, f.bhs, f.player);
      await expect(join(c, f.jv, f.bhs, f.player)).rejects.toThrow(/duplicate key|unique/i);
    });
  });

  it('ALLOWS the same player on a school team and a club team', async () => {
    // This is the whole point of the model: one person, two organizations,
    // separate statistics.
    await withDb(async (c) => {
      const f = await fixture(c);
      await join(c, f.varsity, f.bhs, f.player);
      await join(c, f.u16, f.club, f.player);

      const { rows } = await c.query('select count(*)::int as n from team_players');
      expect(rows[0].n).toBe(2);
    });
  });

  it('lets a removed player be added to another team in the same organization', async () => {
    // The uniques are PARTIAL. As plain constraints a removed Varsity
    // membership would still occupy the slot, so the player could never join
    // JV -- 23505, invisible on both rosters, with no way out from the UI.
    await withDb(async (c) => {
      const f = await fixture(c);
      await join(c, f.varsity, f.bhs, f.player);
      await c.query('update team_players set is_deleted = true where player_id = $1', [f.player]);

      await expect(join(c, f.jv, f.bhs, f.player)).resolves.toBeTruthy();
    });
  });

  it('refuses the same player twice on one team', async () => {
    await withDb(async (c) => {
      const f = await fixture(c);
      await join(c, f.varsity, f.bhs, f.player);
      await expect(join(c, f.varsity, f.bhs, f.player)).rejects.toThrow(/duplicate key|unique/i);
    });
  });
});

describe.skipIf(!available)('the composite foreign key', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('refuses a membership whose school does not match its team', async () => {
    // Without this the school_id column could drift from the team it names,
    // and a club coach's roster query would silently return nothing.
    await withDb(async (c) => {
      const f = await fixture(c);
      await expect(join(c, f.varsity, f.club, f.player))
        .rejects.toThrow(/foreign key|violates/i);
    });
  });

  it('refuses a membership pointing at no team at all', async () => {
    await withDb(async (c) => {
      const f = await fixture(c);
      const nowhere = '00000000-0000-0000-0000-000000000000';
      await expect(join(c, nowhere, f.bhs, f.player))
        .rejects.toThrow(/foreign key|violates/i);
    });
  });
});

describe.skipIf(!available)('the schedule date trigger', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  async function addMatch(c: any, teamId: string, date: string, time: string) {
    const { rows } = await c.query(
      // location is NOT NULL -- the Schedule form must require it.
      `insert into schedule (team_id, opponent, location, match_date, match_time)
       values ($1, 'Yucaipa', 'Home Field', $2, $3)
       returning match_on, kickoff_time`, [teamId, date, time]);
    return rows[0];
  }

  it('derives match_on and kickoff_time from the text a coach typed', async () => {
    await withDb(async (c) => {
      const f = await fixture(c);
      const row = await addMatch(c, f.varsity, 'SEP 4 2026', '6:00 PM');
      expect(row.match_on).not.toBeNull();
      expect(String(row.match_on)).toContain('2026');
      expect(String(row.kickoff_time)).toMatch(/^18:00/);
    });
  });

  it('leaves match_on null rather than guessing at an unreadable date', async () => {
    // A guessed date sorts and filters as though it were real, which is worse
    // than a null the UI can notice.
    await withDb(async (c) => {
      const f = await fixture(c);
      const row = await addMatch(c, f.varsity, 'sometime in spring', '6:00 PM');
      expect(row.match_on).toBeNull();
    });
  });

  it('re-derives when the text is edited', async () => {
    await withDb(async (c) => {
      const f = await fixture(c);
      const { rows: ins } = await c.query(
        `insert into schedule (team_id, opponent, location, match_date, match_time)
         values ($1, 'Yucaipa', 'Home Field', 'SEP 4 2026', '6:00 PM') returning id`, [f.varsity]);

      const { rows } = await c.query(
        `update schedule set match_date = 'OCT 2 2026' where id = $1
         returning match_on`, [ins[0].id]);
      // The pg driver hands back a Date for a date column, not an ISO string.
      expect(rows[0].match_on.getMonth()).toBe(9);   // October
      expect(rows[0].match_on.getDate()).toBe(2);
    });
  });
});
