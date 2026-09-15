/**
 * 0037 as a migration: it applies to the empty database the demo rebuild
 * starts from (buildAccountsDb runs every migration on one), it applies a
 * second time without error, and it leaves every existing measure's points
 * exactly as 0022's view scored them.
 *
 * Nothing here commits a role_goals drill: re-applying 0022 inside a rolled-back
 * transaction re-adds the five-measure constraint, which such a drill would break.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasTestDb } from './harness';
import { buildAccountsDb, one, type AccountsDb } from './accounts-db';
import { makeTeam, makeRosterEntry, makeDrill, makeSession, addResult } from './goals-by-role-fixtures';

const available = await hasTestDb();

const read = (file: string) => readFileSync(join(process.cwd(), 'supabase/migrations', file), 'utf8')
  .replace(/^\s*(begin|commit)\s*;\s*$/gim, '');

/** 0022's columns only, so the comparison is about scores rather than new columns. */
const SCORED = `
  select team_id, player_id, drill_id, exercise, occurred_on, kind, opponent_id,
         raw_value::text, detail, attendance, weight::text, earned::text, available::text,
         w, dr, ls, exercise_count
    from public.matrix_exercise_points
   where team_id = $1
   order by player_id, drill_id, kind, opponent_id nulls first`;

describe.skipIf(!available)('0037 as a migration', () => {
  let db: AccountsDb;
  beforeAll(async () => { db = await buildAccountsDb(); }, 240_000);
  afterAll(async () => { await db?.close(); });

  it('applied to an empty database, with everything it adds in place', async () => {
    const c = db.owner;
    expect((await one(c, `select to_regclass('public.drill_goal_bands') as t`)).t).toBe('drill_goal_bands');
    expect((await one(c,
      `select to_regprocedure('public.save_goal_bands(uuid,uuid,text,jsonb)') is not null as ok`)).ok).toBe(true);
    const cols = (await c.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'matrix_session_results'
          and column_name in ('role', 'goals_for', 'goals_against') order by 1`)).rows.map(r => r.column_name);
    expect(cols).toEqual(['goals_against', 'goals_for', 'role']);
    const viewCols = (await c.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'matrix_exercise_points'
          and column_name in ('role', 'goals_for', 'goals_against', 'base_factor', 'bonus_factor')`)).rows;
    expect(viewCols).toHaveLength(5);
  });

  it('refuses a result role or score outside the allowed values', async () => {
    const c = db.owner;
    await c.query('begin');
    try {
      const team = await makeTeam(c);
      const drill = await makeDrill(c, team, 'count_high');
      const player = await makeRosterEntry(c, team);
      const session = await makeSession(c, team, drill);
      await c.query('savepoint s');
      await expect(addResult(c, session, player, { role: 'midfield' }))
        .rejects.toThrow(/matrix_session_results_role_check/);
      await c.query('rollback to savepoint s');
      await expect(addResult(c, session, player, { goalsFor: 100 }))
        .rejects.toThrow(/matrix_session_results_goals_for_check/);
      await c.query('rollback to savepoint s');
      await expect(addResult(c, session, player, { goalsAgainst: -1 }))
        .rejects.toThrow(/matrix_session_results_goals_against_check/);
    } finally {
      await c.query('rollback');
    }
  });

  it('can be applied a second time, keeping stored standards', async () => {
    const c = db.owner;
    await c.query('begin');
    try {
      const team = await makeTeam(c);
      const drill = await makeDrill(c, team, 'count_high');
      await c.query(`update public.drills_bank set measure = 'role_goals' where id = $1`, [drill]);
      await c.query(
        `insert into public.drill_goal_bands (drill_id, team_id, role, kind, threshold, factor)
         values ($1, $2, 'attack', 'base', 0, 1)`, [drill, team.id]);
      await c.query(read('0037_goals_by_role.sql'));
      expect((await one(c, `select count(*)::int as n from public.drill_goal_bands where drill_id = $1`, [drill])).n)
        .toBe(1);
    } finally {
      await c.query('rollback');
    }
  }, 60_000);

  it("leaves every existing measure's points exactly as 0022 scored them", async () => {
    const c = db.owner;
    await c.query('begin');
    try {
      const team = await makeTeam(c);
      const [a, b, gone] = [await makeRosterEntry(c, team), await makeRosterEntry(c, team), await makeRosterEntry(c, team)];

      const h2h = await makeDrill(c, team, 'head_to_head', 3);
      await c.query(
        `insert into public.matrix_logs (team_id, player_a_id, player_b_id, outcome, drill_id, occurred_on)
         values ($1, $2, $3, 'a', $4, current_date), ($1, $3, $2, 'draw', $4, current_date)`,
        [team.id, a, b, h2h]);

      const count = await makeDrill(c, team, 'count_high', 1.5);
      const s1 = await makeSession(c, team, count);
      await addResult(c, s1, a, { rawValue: 40 });
      await addResult(c, s1, b, { rawValue: 55 });
      await addResult(c, s1, gone, { attendance: 'unexcused' });

      const sprint = await makeDrill(c, team, 'time_low', 1);
      const s2 = await makeSession(c, team, sprint);
      await addResult(c, s2, a, { rawValue: 4.85 });
      await addResult(c, s2, b, { rawValue: 5.1 });

      const laps = await makeDrill(c, team, 'time_bands', 2);
      await c.query(
        `insert into public.drill_time_bands (drill_id, team_id, max_seconds, factor)
         values ($1, $2, 270, 1), ($1, $2, 290, 0.5)`, [laps, team.id]);
      const s3 = await makeSession(c, team, laps);
      await addResult(c, s3, a, { rawValue: 265 });
      await addResult(c, s3, b, { rawValue: 285 });

      const small = await makeDrill(c, team, 'win_loss', 2.5);
      const s4 = await makeSession(c, team, small);
      await addResult(c, s4, a, { outcome: 'win' });
      await addResult(c, s4, b, { outcome: 'draw' });
      // `gone` has no row in s2-s4: not_entered.

      const after = (await c.query(SCORED, [team.id])).rows;
      expect(after.length).toBeGreaterThan(10);

      await c.query(read('0022_time_band_scoring.sql'));
      const before = (await c.query(SCORED, [team.id])).rows;

      expect(after).toEqual(before);
    } finally {
      await c.query('rollback');
    }
  }, 60_000);
});
