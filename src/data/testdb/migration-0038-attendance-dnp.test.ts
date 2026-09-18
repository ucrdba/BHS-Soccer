/**
 * 0038 — a fourth attendance, DNP, scored like a no-show.
 *
 * "Did not play" is a different fact from a no-show: the player was at
 * practice. It costs the same, because they did not do the exercise, and a
 * coach reading the breakdown should still be able to tell the two apart —
 * which is why the view reports the stored value rather than 'unexcused'.
 *
 * Excused is untouched and still costs nothing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasTestDb } from './harness';
import { buildAccountsDb, one, type AccountsDb } from './accounts-db';
import { makeTeam, makeRosterEntry, makeDrill, makeSession, addResult, pointsFor } from './goals-by-role-fixtures';

const available = await hasTestDb();

const read = (file: string) => readFileSync(join(process.cwd(), 'supabase/migrations', file), 'utf8')
  .replace(/^\s*(begin|commit)\s*;\s*$/gim, '');

describe.skipIf(!available)('0038: DNP', () => {
  let db: AccountsDb;
  beforeAll(async () => { db = await buildAccountsDb(); }, 240_000);
  afterAll(async () => { await db?.close(); });

  it('accepts dnp and still refuses anything else', async () => {
    const c = db.owner;
    await c.query('begin');
    try {
      const team = await makeTeam(c);
      const drill = await makeDrill(c, team, 'count_high', 2);
      const player = await makeRosterEntry(c, team);
      const session = await makeSession(c, team, drill);

      await addResult(c, session, player, { attendance: 'dnp' });
      await c.query('savepoint s');
      await expect(addResult(c, session, player, { attendance: 'sick' }))
        .rejects.toThrow(/matrix_session_results_attendance_check|violates check constraint/);
      await c.query('rollback to savepoint s');
    } finally {
      await c.query('rollback');
    }
  });

  it('charges a DNP 0 of the weight, exactly as a no-show', async () => {
    const team = await makeTeam(db.owner);
    const drill = await makeDrill(db.owner, team, 'count_high', 2);
    const didNotPlay = await makeRosterEntry(db.owner, team);
    const noShow = await makeRosterEntry(db.owner, team);
    const ran = await makeRosterEntry(db.owner, team);
    const session = await makeSession(db.owner, team, drill);

    await addResult(db.owner, session, didNotPlay, { attendance: 'dnp' });
    await addResult(db.owner, session, noShow, { attendance: 'unexcused' });
    await addResult(db.owner, session, ran, { rawValue: 40 });

    expect(await pointsFor(db.owner, drill, didNotPlay))
      .toMatchObject([{ kind: 'absent', earned: 0, available: 2 }]);
    expect(await pointsFor(db.owner, drill, noShow))
      .toMatchObject([{ kind: 'absent', earned: 0, available: 2 }]);
    expect((await pointsFor(db.owner, drill, ran))[0].earned).toBeGreaterThan(0);
  });

  it('says which of the two it was, so a breakdown can tell them apart', async () => {
    const team = await makeTeam(db.owner);
    const drill = await makeDrill(db.owner, team, 'count_high', 1);
    const didNotPlay = await makeRosterEntry(db.owner, team);
    const noShow = await makeRosterEntry(db.owner, team);
    const session = await makeSession(db.owner, team, drill);
    await addResult(db.owner, session, didNotPlay, { attendance: 'dnp' });
    await addResult(db.owner, session, noShow, { attendance: 'unexcused' });

    const attendanceOf = async (playerId: string) => (await one(db.owner,
      `select attendance from public.matrix_exercise_points
        where drill_id = $1 and player_id = $2`, [drill, playerId])).attendance;

    expect(await attendanceOf(didNotPlay)).toBe('dnp');
    expect(await attendanceOf(noShow)).toBe('unexcused');
  });

  it('leaves an excused player costing nothing, as before', async () => {
    const team = await makeTeam(db.owner);
    const drill = await makeDrill(db.owner, team, 'count_high', 2);
    const excused = await makeRosterEntry(db.owner, team);
    const session = await makeSession(db.owner, team, drill);
    await addResult(db.owner, session, excused, { attendance: 'excused' });

    expect(await pointsFor(db.owner, drill, excused)).toEqual([]);
  });

  it('can be applied a second time', async () => {
    const c = db.owner;
    await c.query('begin');
    try {
      await c.query(read('0038_attendance_dnp.sql'));
      expect((await one(c, `select to_regclass('public.matrix_standings') as v`)).v).toBe('matrix_standings');
    } finally {
      await c.query('rollback');
    }
  }, 60_000);

  it("leaves every existing measure's points as 0037 scored them", async () => {
    const c = db.owner;
    await c.query('begin');
    try {
      const team = await makeTeam(c);
      const [a, b] = [await makeRosterEntry(c, team), await makeRosterEntry(c, team)];

      const count = await makeDrill(c, team, 'count_high', 1.5);
      const s1 = await makeSession(c, team, count);
      await addResult(c, s1, a, { rawValue: 40 });
      await addResult(c, s1, b, { attendance: 'unexcused' });

      const small = await makeDrill(c, team, 'win_loss', 2.5);
      const s2 = await makeSession(c, team, small);
      await addResult(c, s2, a, { outcome: 'win' });

      const SCORED = `
        select player_id, drill_id, kind, earned::text, available::text, attendance
          from public.matrix_exercise_points
         where team_id = $1
         order by player_id, drill_id, kind`;
      const after = (await c.query(SCORED, [team.id])).rows;

      await c.query(read('0037_goals_by_role.sql'));
      const before = (await c.query(SCORED, [team.id])).rows;

      expect(after).toEqual(before);
    } finally {
      await c.query('rollback');
    }
  }, 60_000);
});
