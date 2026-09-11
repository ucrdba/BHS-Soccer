/**
 * 0039 — a coach writes their own organization's rows, and nobody else's.
 *
 * An ADMIN is staff of every organization: running the platform, including a
 * club nobody has been assigned to coach yet, is what the role is for. Only a
 * coach is held to where they coach.
 *
 * supabase_migration_auth.sql section 6 gave nine tables one write policy,
 * `current_profile_role() in ('coach', 'admin')`, which checks the role and
 * nothing else; 0002 and 0019 copied it onto matrix_logs and quiz_answers.
 * Wherever no later migration replaced it, any active coach of any
 * organization could rewrite any other organization's rows -- rename a school,
 * change which answer its quiz marks as correct, move its fixtures.
 *
 * As with 0029, what a policy admits depends on the helpers it calls, on
 * profile status and on how permissive policies combine, so each case signs
 * in as a real kind of user and asks Postgres. Every attempt runs inside a
 * savepoint that is rolled back, so one world serves a whole test.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';

const available = await hasTestDb();

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/0039_org_scoped_writes.sql'), 'utf8');

/**
 * The migration, without its own transaction control — the harness has
 * already opened one, and a nested `begin`/`commit` would end it.
 */
async function apply(c: any) {
  await c.query(MIGRATION.replace(/^\s*(begin|commit)\s*;\s*$/gim, ''));
}

type Outcome = { rows: number; error?: string };

/**
 * Runs one statement as one user: the rows it touched, or the error that
 * refused it.
 *
 * Always rolled back to a savepoint, so the write and the `set local role`
 * are both undone, and a refused insert does not abort the test's
 * transaction. Note that RLS refuses an UPDATE or DELETE silently -- the row
 * is filtered out and nothing happens -- so that refusal reads `{ rows: 0 }`,
 * while a refused INSERT, or an update that would move a row somewhere the
 * writer may not put it, is an error.
 */
async function as(c: any, userId: string | null, sql: string, params: any[] = []): Promise<Outcome> {
  await c.query('savepoint attempt');
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
    await c.query(userId ? 'set local role authenticated' : 'set local role anon');
    const r = await c.query(sql, params);
    return { rows: r.rowCount ?? 0 };
  } catch (e: any) {
    return { rows: 0, error: e.message };
  } finally {
    await c.query('rollback to savepoint attempt');
  }
}

/**
 * Two organizations, a team in each, one row of every kind in each, and one
 * of every kind of person.
 *
 * Profiles are written directly, with the auth.users triggers off for this
 * transaction only: the demo's handle_new_user makes every signup an active
 * coach of a new organization of its own, which would change who everyone is.
 */
async function world(c: any) {
  await c.query('alter table auth.users disable trigger user');

  const one = async (sql: string, params: any[]) => (await c.query(sql, params)).rows[0];

  const player = async (name: string, ...teams: Array<[string, string]>) => {
    const id = (await one(
      `insert into players (name, class_year) values ($1, '2027') returning id`, [name])).id;
    for (const [teamId, schoolId] of teams) {
      await c.query(
        `insert into team_players (team_id, school_id, player_id) values ($1, $2, $3)`,
        [teamId, schoolId, id]);
    }
    return id;
  };

  const side = async (code: string, name: string) => {
    const school = (await one(
      `insert into schools (code, name, mascot) values ($1, $2, 'Test') returning id`, [code, name])).id;
    const team = (await one(
      `insert into teams (school_id, name) values ($1, 'First Team') returning id`, [school])).id;
    const a = await player(`${name} A`, [team, school]);
    const b = await player(`${name} B`, [team, school]);
    const question = (await one(
      `insert into quiz_questions (question, correct_option, school_id)
       values ('Which foot?', 'A', $1) returning question_id`, [school])).question_id;

    return {
      code, school, team, question,
      player: a,
      rival: b,
      drill: (await one(
        `insert into drills_bank (school_id, name, category) values ($1, $2, 'Test') returning id`,
        [school, `${name} Rondo`])).id,
      answer: (await one(
        `insert into quiz_answers (question_id, letter, answer_text, is_correct)
         values ($1, 'A', 'Left', true) returning id`, [question])).id,
      staff: (await one(
        `insert into coaches (school_id, name, level) values ($1, 'Assistant', 'Staff') returning id`,
        [school])).id,
      fixture: (await one(
        `insert into schedule (team_id, match_date, match_time, opponent, location)
         values ($1, 'AUG 28, 2026', '5:00 PM', 'Rivals', 'Home') returning id`, [team])).id,
      log: (await one(
        `insert into matrix_logs (team_id, player_a_id, player_b_id, outcome)
         values ($1, $2, $3, 'a') returning id`, [team, a, b])).id
    };
  };

  const ours = await side('osw-ours', 'Our Club');
  const theirs = await side('osw-theirs', 'Their School');

  const person = async (key: string, role: string, schoolId: string, status = 'active') => {
    const email = `${key}@osw.test`;
    const id = (await one(`insert into auth.users (email) values ($1) returning id`, [email])).id;
    await c.query(
      `insert into profiles (id, school_id, name, email, role, status)
       values ($1, $2, $3, $4, $5, $6)`,
      [id, schoolId, key, email, role, status]);
    return id;
  };

  const users = {
    coach: await person('coach', 'coach', ours.school),
    admin: await person('admin', 'admin', ours.school),
    theirCoach: await person('their-coach', 'coach', theirs.school),
    // Production's signup (0013's handle_new_user) files every new profile
    // under the organization whose code is 'bhs', and approval changes the
    // role, never the organization. So a club coach's profile usually names
    // the school. This one is filed under `theirs` and coaches at `ours`.
    clubCoach: await person('club-coach', 'coach', theirs.school),
    // The project owner's own shape: an admin filed under one organization
    // who also coaches at another (0007).
    roamingAdmin: await person('roaming-admin', 'admin', theirs.school),
    teamless: await person('teamless', 'coach', ours.school),
    pending: await person('pending', 'coach', ours.school, 'pending_approval'),
    player: await person('player', 'player', ours.school)
  };

  const coaches = async (teamId: string, profileId: string) => c.query(
    `insert into team_coaches (team_id, profile_id) values ($1, $2)`, [teamId, profileId]);
  for (const who of [users.coach, users.clubCoach, users.roamingAdmin, users.pending]) {
    await coaches(ours.team, who);
  }
  await coaches(theirs.team, users.theirCoach);

  return {
    users, ours, theirs,
    // No teams, so nothing restricts deleting it: a hard delete of `theirs`
    // fails on team_players' foreign key whatever RLS says, and would prove
    // nothing about the policy.
    bare: (await one(
      `insert into schools (code, name, mascot) values ('osw-bare', 'Empty Club', 'Test') returning id`, [])).id,
    unassigned: await player('Nobody Yet'),
    both: await player('Plays Both', [ours.team, ours.school], [theirs.team, theirs.school])
  };
}

type World = Awaited<ReturnType<typeof world>>;
type Side = World['ours'];
type Statement = (s: Side) => [string, any[]];

async function applied(c: any): Promise<World> {
  const w = await world(c);
  await apply(c);
  return w;
}

/** One ordinary edit per table, aimed at a side's row. */
const EDITS: Array<[string, Statement]> = [
  ['schools', s => [`update schools set name = 'Renamed' where id = $1`, [s.school]]],
  ['drills_bank', s => [`update drills_bank set name = 'Renamed' where id = $1`, [s.drill]]],
  ['quiz_questions', s => [`update quiz_questions set question = 'Renamed?' where question_id = $1`, [s.question]]],
  // Flipping the flag changes how the quiz is marked -- see domain/quiz.ts.
  ['quiz_answers', s => [`update quiz_answers set is_correct = false where id = $1`, [s.answer]]],
  ['coaches', s => [`update coaches set name = 'Renamed' where id = $1`, [s.staff]]],
  ['schedule', s => [`update schedule set opponent = 'Renamed' where id = $1`, [s.fixture]]],
  ['matrix_logs', s => [`update matrix_logs set outcome = 'b' where id = $1`, [s.log]]],
  ['players', s => [`update players set class_year = '2030' where id = $1`, [s.player]]]
];

/** One new row per table, aimed at a side. schools has its own tests below. */
const INSERTS: Array<[string, Statement]> = [
  ['drills_bank', s => [
    `insert into drills_bank (school_id, name, category) values ($1, 'New Drill', 'Test')`, [s.school]]],
  ['quiz_questions', s => [
    `insert into quiz_questions (question, correct_option, school_id) values ('New?', 'A', $1)`, [s.school]]],
  ['quiz_answers', s => [
    `insert into quiz_answers (question_id, letter, answer_text) values ($1, 'B', 'Right')`, [s.question]]],
  ['coaches', s => [
    `insert into coaches (school_id, name, level) values ($1, 'New Coach', 'Staff')`, [s.school]]],
  ['schedule', s => [
    `insert into schedule (team_id, match_date, match_time, opponent, location)
     values ($1, 'SEP 4, 2026', '5:00 PM', 'Newcomers', 'Away')`, [s.team]]],
  ['matrix_logs', s => [
    `insert into matrix_logs (team_id, player_a_id, player_b_id, outcome) values ($1, $2, $3, 'draw')`,
    [s.team, s.player, s.rival]]]
];

const RLS = /row-level security/i;

describe.skipIf(!available)('0039: a coach writes inside their organization', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  describe('BEFORE it', () => {
    // The premise. If one of these ever fails, that table was closed some
    // other way, and this migration should be re-read against that.
    it.each(EDITS)("a coach of one organization rewrote another's %s", async (_t, edit) => {
      await withDb(async (c) => {
        const w = await world(c);
        expect(await as(c, w.users.coach, ...edit(w.theirs))).toEqual({ rows: 1 });
      });
    });

    it.each(INSERTS)("and added rows to another's %s", async (_t, insert) => {
      await withDb(async (c) => {
        const w = await world(c);
        expect(await as(c, w.users.coach, ...insert(w.theirs))).toEqual({ rows: 1 });
      });
    });

    it('and removed another organization outright', async () => {
      await withDb(async (c) => {
        const w = await world(c);
        expect(await as(c, w.users.coach, `delete from schools where id = $1`, [w.bare])).toEqual({ rows: 1 });
      });
    });
  });

  describe('after it, across organizations', () => {
    it.each(EDITS)("a coach cannot rewrite another organization's %s", async (_t, edit) => {
      await withDb(async (c) => {
        const w = await applied(c);
        expect(await as(c, w.users.coach, ...edit(w.theirs))).toEqual({ rows: 0 });
      });
    });

    it.each(EDITS)("an admin can, in another organization's %s: they are staff of every one", async (_t, edit) => {
      await withDb(async (c) => {
        const w = await applied(c);
        expect(await as(c, w.users.admin, ...edit(w.theirs))).toEqual({ rows: 1 });
      });
    });

    it.each(INSERTS)("a coach cannot add to another organization's %s", async (_t, insert) => {
      await withDb(async (c) => {
        const w = await applied(c);
        expect((await as(c, w.users.coach, ...insert(w.theirs))).error).toMatch(RLS);
      });
    });

    it.each(INSERTS)("an admin can add to another organization's %s", async (_t, insert) => {
      await withDb(async (c) => {
        const w = await applied(c);
        expect(await as(c, w.users.admin, ...insert(w.theirs))).toEqual({ rows: 1 });
      });
    });
  });

  describe('after it, at home', () => {
    it.each(EDITS.filter(([t]) => t !== 'schools'))('a coach still edits their own %s', async (_t, edit) => {
      await withDb(async (c) => {
        const w = await applied(c);
        expect(await as(c, w.users.coach, ...edit(w.ours))).toEqual({ rows: 1 });
      });
    });

    it.each(EDITS)("an admin still edits their own organization's %s", async (_t, edit) => {
      // This admin coaches no team: they are staff through their profile.
      await withDb(async (c) => {
        const w = await applied(c);
        expect(await as(c, w.users.admin, ...edit(w.ours))).toEqual({ rows: 1 });
      });
    });

    it.each(INSERTS)('a coach still adds to their own %s', async (_t, insert) => {
      await withDb(async (c) => {
        const w = await applied(c);
        expect(await as(c, w.users.coach, ...insert(w.ours))).toEqual({ rows: 1 });
      });
    });

    it.each(INSERTS)("an admin still adds to their own organization's %s", async (_t, insert) => {
      await withDb(async (c) => {
        const w = await applied(c);
        expect(await as(c, w.users.admin, ...insert(w.ours))).toEqual({ rows: 1 });
      });
    });
  });

  describe('who counts as staff', () => {
    it('a coach is staff where they coach, not where their profile was filed', async () => {
      await withDb(async (c) => {
        const w = await applied(c);
        const [, edit] = EDITS.find(([t]) => t === 'drills_bank')!;
        expect(await as(c, w.users.clubCoach, ...edit(w.ours))).toEqual({ rows: 1 });
        expect(await as(c, w.users.clubCoach, ...edit(w.theirs))).toEqual({ rows: 0 });
      });
    });

    it('an admin is staff of every organization, coaching there or not', async () => {
      await withDb(async (c) => {
        const w = await applied(c);
        const rename = `update schools set name = 'Renamed' where id = $1`;
        expect(await as(c, w.users.roamingAdmin, rename, [w.theirs.school])).toEqual({ rows: 1 });
        expect(await as(c, w.users.roamingAdmin, rename, [w.ours.school])).toEqual({ rows: 1 });
        // An organization nobody coaches in -- a club not yet staffed -- is
        // still an admin's to run. Before, it was nobody's.
        expect(await as(c, w.users.admin, rename, [w.theirs.school])).toEqual({ rows: 1 });
      });
    });

    it('a coach on no team writes no organization\'s rows', async () => {
      // The same rule as is_team_coach(): a coach with no team can change no
      // squad, and now no library either.
      await withDb(async (c) => {
        const w = await applied(c);
        expect(await as(c, w.users.teamless,
          `update drills_bank set name = 'Renamed' where id = $1`, [w.ours.drill])).toEqual({ rows: 0 });
      });
    });

    it('a coach awaiting approval writes nothing, though they are on a team', async () => {
      await withDb(async (c) => {
        const w = await applied(c);
        for (const [, edit] of EDITS) {
          expect(await as(c, w.users.pending, ...edit(w.ours))).toEqual({ rows: 0 });
        }
      });
    });

    it('a player writes nothing', async () => {
      await withDb(async (c) => {
        const w = await applied(c);
        for (const [, edit] of EDITS) {
          expect(await as(c, w.users.player, ...edit(w.ours))).toEqual({ rows: 0 });
        }
      });
    });

    it('a visitor writes nothing', async () => {
      // Rows, not the error: on matrix_logs the anon role has no UPDATE grant
      // at all (0002), so the refusal arrives as "permission denied" before
      // any policy is asked.
      await withDb(async (c) => {
        const w = await applied(c);
        for (const [, edit] of EDITS) {
          expect((await as(c, null, ...edit(w.ours))).rows).toBe(0);
        }
      });
    });
  });

  describe('schools', () => {
    it('a coach edits no organization\'s profile, not even their own', async () => {
      // SchoolProfileSection shows the form to admins alone; the database now
      // agrees with it.
      await withDb(async (c) => {
        const w = await applied(c);
        expect(await as(c, w.users.coach,
          `update schools set name = 'Renamed' where id = $1`, [w.ours.school])).toEqual({ rows: 0 });
      });
    });

    it('an admin creates an organization, as the Teams section does', async () => {
      await withDb(async (c) => {
        const w = await applied(c);
        expect(await as(c, w.users.admin,
          `insert into schools (code, name, kind, mascot) values ('osw-new', 'New Club', 'club', 'Lions')`))
          .toEqual({ rows: 1 });
      });
    });

    it('a coach does not', async () => {
      await withDb(async (c) => {
        const w = await applied(c);
        expect((await as(c, w.users.coach,
          `insert into schools (code, name, kind, mascot) values ('osw-new', 'New Club', 'club', 'Lions')`))
          .error).toMatch(RLS);
      });
    });

    // upsertSchool sends exactly this: an insert that lands on the code.
    const upsert = `insert into schools (code, name, mascot) values ($1, 'Renamed', 'Lions')
                    on conflict (code) do update set name = excluded.name, mascot = excluded.mascot`;

    it("the profile form's upsert lands on the admin's own organization", async () => {
      await withDb(async (c) => {
        const w = await applied(c);
        expect(await as(c, w.users.admin, upsert, [w.ours.code])).toEqual({ rows: 1 });
      });
    });

    it("and lands on another organization's code too, for an admin", async () => {
      await withDb(async (c) => {
        const w = await applied(c);
        expect(await as(c, w.users.admin, upsert, [w.theirs.code])).toEqual({ rows: 1 });
      });
    });

    it("but is refused for a coach, who edits no organization's profile", async () => {
      await withDb(async (c) => {
        const w = await applied(c);
        expect((await as(c, w.users.coach, upsert, [w.ours.code])).error).toMatch(RLS);
      });
    });

    it('no coach soft-deletes an organization; an admin may', async () => {
      await withDb(async (c) => {
        const w = await applied(c);
        const retire = `update schools set is_deleted = true where id = $1`;
        expect(await as(c, w.users.coach, retire, [w.theirs.school])).toEqual({ rows: 0 });
        expect(await as(c, w.users.admin, retire, [w.theirs.school])).toEqual({ rows: 1 });
      });
    });

    it('no coach removes one; an admin may', async () => {
      await withDb(async (c) => {
        const w = await applied(c);
        const remove = `delete from schools where id = $1`;
        expect(await as(c, w.users.coach, remove, [w.bare])).toEqual({ rows: 0 });
        expect(await as(c, w.users.admin, remove, [w.bare])).toEqual({ rows: 1 });
      });
    });
  });

  describe('players', () => {
    it('a new player is written before they join a team, so any coach may add one', async () => {
      await withDb(async (c) => {
        const w = await applied(c);
        expect(await as(c, w.users.coach,
          `insert into players (name, class_year) values ('Brand New', '2028')`)).toEqual({ rows: 1 });
      });
    });

    it('a player on no team belongs to nobody yet, so any coach may edit them', async () => {
      // What the admin panel's unassigned-players pool offers every coach.
      await withDb(async (c) => {
        const w = await applied(c);
        expect(await as(c, w.users.coach,
          `update players set class_year = '2030' where id = $1`, [w.unassigned])).toEqual({ rows: 1 });
      });
    });

    it('a player on a team in both organizations is edited by either', async () => {
      // One person, one identity row: both of their coaches must be able to
      // correct their name.
      await withDb(async (c) => {
        const w = await applied(c);
        const edit = `update players set class_year = '2030' where id = $1`;
        expect(await as(c, w.users.coach, edit, [w.both])).toEqual({ rows: 1 });
        expect(await as(c, w.users.theirCoach, edit, [w.both])).toEqual({ rows: 1 });
        expect(await as(c, w.users.theirCoach, edit, [w.ours.player])).toEqual({ rows: 0 });
      });
    });

    it("an upsert naming another organization's player is refused, not applied", async () => {
      // upsertPlayerIdentity sends the id it was given; a stale or copied one
      // must not overwrite somebody else's player.
      await withDb(async (c) => {
        const w = await applied(c);
        expect((await as(c, w.users.coach,
          `insert into players (id, name, class_year) values ($1, 'Taken Over', '2027')
           on conflict (id) do update set name = excluded.name`, [w.theirs.player])).error).toMatch(RLS);
      });
    });
  });

  it("a fixture cannot be moved onto another organization's team", async () => {
    await withDb(async (c) => {
      const w = await applied(c);
      expect((await as(c, w.users.coach,
        `update schedule set team_id = $1 where id = $2`, [w.theirs.team, w.ours.fixture])).error)
        .toMatch(RLS);
    });
  });

  it("leaves reading alone: a visitor still sees every organization's public rows", async () => {
    await withDb(async (c) => {
      const w = await applied(c);
      const reads: Array<[string, string]> = [
        ['schools', w.theirs.school], ['drills_bank', w.theirs.drill], ['coaches', w.theirs.staff],
        ['schedule', w.theirs.fixture], ['players', w.theirs.player], ['matrix_logs', w.theirs.log],
        ['quiz_answers', w.theirs.answer]
      ];
      for (const [table, id] of reads) {
        expect(await as(c, null, `select 1 from ${table} where id = $1`, [id])).toEqual({ rows: 1 });
      }
      expect(await as(c, null,
        `select 1 from quiz_questions where question_id = $1`, [w.theirs.question])).toEqual({ rows: 1 });
    });
  });

  it('can be run twice', async () => {
    await withDb(async (c) => {
      const w = await applied(c);
      await apply(c);
      const [, edit] = EDITS.find(([t]) => t === 'drills_bank')!;
      expect(await as(c, w.users.coach, ...edit(w.theirs))).toEqual({ rows: 0 });
      expect(await as(c, w.users.coach, ...edit(w.ours))).toEqual({ rows: 1 });
    });
  });

  it('refuses to finish while another write policy would reopen the gap', async () => {
    // Permissive policies are OR'd, so one left over from a dashboard or an
    // older script silently undoes every policy here. Last statement in its
    // transaction on purpose: a raised exception aborts it.
    await withDb(async (c) => {
      await world(c);
      await c.query(`create policy "stray_write" on public.drills_bank for all using (true) with check (true)`);
      await expect(apply(c)).rejects.toThrow(/stray_write/);
    });
  });
});
