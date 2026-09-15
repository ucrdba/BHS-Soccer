/**
 * 0037 — Goals by role, scored by Postgres and saved through one function.
 *
 * Scoring questions read the view on the owner connection. Every question
 * about who may save standards runs on an `authenticated` connection with the
 * caller's id as the JWT subject: the superuser harness would pass them all.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb } from './harness';
import { buildAccountsDb, makeCoach, makeAdmin, type AccountsDb } from './accounts-db';
import {
  makeTeam, makeRosterEntry, makeDrill, makeSession, addResult, addBand, pointsFor
} from './goals-by-role-fixtures';
import { ROLE_GOAL_CASES } from '../../domain/role-goal-cases';

const available = await hasTestDb();

describe.skipIf(!available)('0037: Goals by role', () => {
  let db: AccountsDb;
  beforeAll(async () => { db = await buildAccountsDb(); }, 240_000);
  afterAll(async () => { await db?.close(); });

  describe('scoring agrees with the shared cases', () => {
    it.each(ROLE_GOAL_CASES)('$name', async (c) => {
      const team = await makeTeam(db.owner);
      const drill = await makeDrill(db.owner, team, 'role_goals', 1);
      for (const b of c.bands) await addBand(db.owner, drill, team, b);
      const player = await makeRosterEntry(db.owner, team);
      const session = await makeSession(db.owner, team, drill);
      await addResult(db.owner, session, player, { role: c.role, goalsFor: c.scored, goalsAgainst: c.conceded });

      const lines = await pointsFor(db.owner, drill, player);
      if (!c.expected.hasStandards) {
        expect(lines).toEqual([]);
        return;
      }
      expect(lines).toEqual([{
        kind: 'role_goals', role: c.role,
        raw_value: c.scored - c.conceded, earned: c.expected.total, available: 1,
        goals_for: c.scored, goals_against: c.conceded,
        base_factor: c.expected.base, bonus_factor: c.expected.bonus
      }]);
    }, 30_000);
  });

  it('multiplies the drill weight', async () => {
    const team = await makeTeam(db.owner);
    const drill = await makeDrill(db.owner, team, 'role_goals', 3);
    await addBand(db.owner, drill, team, { role: 'attack', kind: 'base', threshold: 1, factor: 0.5 });
    await addBand(db.owner, drill, team, { role: 'attack', kind: 'bonus', threshold: 3, factor: 0.1 });
    const player = await makeRosterEntry(db.owner, team);
    const session = await makeSession(db.owner, team, drill);
    await addResult(db.owner, session, player, { role: 'attack', goalsFor: 3, goalsAgainst: 1 });

    const [line] = await pointsFor(db.owner, drill, player);
    expect(line.earned).toBeCloseTo(1.8, 6);
    expect(line.available).toBe(3);
  });

  it('leaves out a role with no base bands while another role in the session still scores', async () => {
    const team = await makeTeam(db.owner);
    const drill = await makeDrill(db.owner, team);
    await addBand(db.owner, drill, team, { role: 'attack', kind: 'base', threshold: 0, factor: 1 });
    const attacker = await makeRosterEntry(db.owner, team);
    const defender = await makeRosterEntry(db.owner, team);
    const session = await makeSession(db.owner, team, drill);
    await addResult(db.owner, session, attacker, { role: 'attack', goalsFor: 2, goalsAgainst: 1 });
    await addResult(db.owner, session, defender, { role: 'defend', goalsFor: 0, goalsAgainst: 0 });

    expect((await pointsFor(db.owner, drill, attacker)).map(l => l.kind)).toEqual(['role_goals']);
    expect(await pointsFor(db.owner, drill, defender)).toEqual([]);
  });

  it('does not score a present result with no role or no score', async () => {
    const team = await makeTeam(db.owner);
    const drill = await makeDrill(db.owner, team);
    await addBand(db.owner, drill, team, { role: 'attack', kind: 'base', threshold: 0, factor: 1 });
    const noRole = await makeRosterEntry(db.owner, team);
    const noScore = await makeRosterEntry(db.owner, team);
    const session = await makeSession(db.owner, team, drill);
    await addResult(db.owner, session, noRole, { goalsFor: 2, goalsAgainst: 1 });
    await addResult(db.owner, session, noScore, { role: 'attack' });

    expect(await pointsFor(db.owner, drill, noRole)).toEqual([]);
    expect(await pointsFor(db.owner, drill, noScore)).toEqual([]);
  });

  it('charges a no-show and a player not entered 0 of the weight when the squad has base bands', async () => {
    const team = await makeTeam(db.owner);
    const drill = await makeDrill(db.owner, team, 'role_goals', 2);
    await addBand(db.owner, drill, team, { role: 'defend', kind: 'base', threshold: 0, factor: 1 });
    const noShow = await makeRosterEntry(db.owner, team);
    const notEntered = await makeRosterEntry(db.owner, team);
    const session = await makeSession(db.owner, team, drill);
    await addResult(db.owner, session, noShow, { attendance: 'unexcused' });

    expect(await pointsFor(db.owner, drill, noShow)).toMatchObject([{ kind: 'absent', earned: 0, available: 2 }]);
    expect(await pointsFor(db.owner, drill, notEntered)).toMatchObject([{ kind: 'not_entered', earned: 0, available: 2 }]);
  });

  it('charges nobody when the squad has no base bands for any role of the drill', async () => {
    const team = await makeTeam(db.owner);
    const drill = await makeDrill(db.owner, team);
    await addBand(db.owner, drill, team, { role: 'attack', kind: 'bonus', threshold: 0, factor: 0.2 });
    const noShow = await makeRosterEntry(db.owner, team);
    const notEntered = await makeRosterEntry(db.owner, team);
    const session = await makeSession(db.owner, team, drill);
    await addResult(db.owner, session, noShow, { attendance: 'unexcused' });

    expect(await pointsFor(db.owner, drill, noShow)).toEqual([]);
    expect(await pointsFor(db.owner, drill, notEntered)).toEqual([]);
  });

  it("does not count another squad's bands", async () => {
    const team = await makeTeam(db.owner);
    const other = await makeTeam(db.owner);
    const drill = await makeDrill(db.owner, team);
    await addBand(db.owner, drill, other, { role: 'attack', kind: 'base', threshold: 0, factor: 1 });
    const player = await makeRosterEntry(db.owner, team);
    const session = await makeSession(db.owner, team, drill);
    await addResult(db.owner, session, player, { role: 'attack', goalsFor: 2, goalsAgainst: 0 });

    expect(await pointsFor(db.owner, drill, player)).toEqual([]);
  });

  describe('save_goal_bands', () => {
    const call = (c: any, drill: string, team: string, role: string, bands: any) =>
      c.query(`select public.save_goal_bands($1, $2, $3, $4::jsonb)`, [drill, team, role, JSON.stringify(bands)]);

    const bandsOf = async (c: any, drill: string, team: string) =>
      (await c.query(
        `select role, kind, threshold, factor::float8 as factor from public.drill_goal_bands
          where drill_id = $1 and team_id = $2 order by role, kind, threshold`, [drill, team])).rows;

    it("replaces one role's bands and leaves the other roles alone", async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await addBand(db.owner, drill, team, { role: 'attack', kind: 'base', threshold: 1, factor: 0.5 });
      await addBand(db.owner, drill, team, { role: 'attack', kind: 'base', threshold: 3, factor: 0.8 });
      await addBand(db.owner, drill, team, { role: 'defend', kind: 'base', threshold: 0, factor: 0.6 });

      await db.asUser(coach, async (c) => {
        await call(c, drill, team.id, 'attack', [
          { kind: 'base', threshold: 2, factor: 0.7 },
          { kind: 'bonus', threshold: 4, factor: 0.3 }
        ]);
        expect(await bandsOf(c, drill, team.id)).toEqual([
          { role: 'attack', kind: 'base', threshold: 2, factor: 0.7 },
          { role: 'attack', kind: 'bonus', threshold: 4, factor: 0.3 },
          { role: 'defend', kind: 'base', threshold: 0, factor: 0.6 }
        ]);
      });
    });

    it('clears a role when sent an empty list', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await addBand(db.owner, drill, team, { role: 'keeper', kind: 'base', threshold: 0, factor: 1 });
      await db.asUser(coach, async (c) => {
        await call(c, drill, team.id, 'keeper', []);
        expect(await bandsOf(c, drill, team.id)).toEqual([]);
      });
    });

    it('lets an admin set any squad\'s standards', async () => {
      const team = await makeTeam(db.owner);
      const admin = await makeAdmin(db.owner);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(admin, async (c) => {
        await call(c, drill, team.id, 'defend', [{ kind: 'base', threshold: 0, factor: 1 }]);
        expect(await bandsOf(c, drill, team.id)).toHaveLength(1);
      });
    });

    it('refuses a best base plus best bonus over 100%', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(coach, async (c) => {
        await expect(call(c, drill, team.id, 'attack', [
          { kind: 'base', threshold: 1, factor: 0.7 },
          { kind: 'base', threshold: 0, factor: 0.2 },
          { kind: 'bonus', threshold: 3, factor: 0.4 }
        ])).rejects.toThrow('The top goal-difference band (70%) and the top bonus band (40%) add up to more than 100% of the weight');
      });
    });

    it('accepts exactly 100%', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(coach, async (c) => {
        await call(c, drill, team.id, 'attack', [
          { kind: 'base', threshold: 1, factor: 0.8 },
          { kind: 'bonus', threshold: 3, factor: 0.2 }
        ]);
        expect(await bandsOf(c, drill, team.id)).toHaveLength(2);
      });
    });

    it('refuses two bands in one list at the same threshold', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(coach, async (c) => {
        await expect(call(c, drill, team.id, 'attack', [
          { kind: 'base', threshold: 1, factor: 0.5 },
          { kind: 'base', threshold: 1, factor: 0.3 }
        ])).rejects.toThrow('Two goal-difference bands share the threshold 1');
      });
    });

    it('allows a base band and a bonus band at the same threshold', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(coach, async (c) => {
        await call(c, drill, team.id, 'defend', [
          { kind: 'base', threshold: 0, factor: 0.6 },
          { kind: 'bonus', threshold: 0, factor: 0.4 }
        ]);
        expect(await bandsOf(c, drill, team.id)).toHaveLength(2);
      });
    });

    it('refuses a percentage outside 0-100', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(coach, async (c) => {
        await expect(call(c, drill, team.id, 'attack', [{ kind: 'base', threshold: 1, factor: 1.5 }]))
          .rejects.toThrow('A percentage must be between 0 and 100 (found 150)');
      });
    });

    it('refuses a threshold that is not a whole number', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(coach, async (c) => {
        // A refusal aborts the transaction; the savepoint lets the second call be asked.
        await c.query('savepoint s');
        await expect(call(c, drill, team.id, 'attack', [{ kind: 'base', threshold: 1.5, factor: 0.5 }]))
          .rejects.toThrow('A threshold must be a whole number (found 1.5)');
        await c.query('rollback to savepoint s');
        await expect(call(c, drill, team.id, 'attack', [{ kind: 'base', factor: 0.5 }]))
          .rejects.toThrow('A threshold must be a whole number (found nothing)');
      });
    });

    it('refuses a drill measured some other way', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team, 'win_loss');
      await db.asUser(coach, async (c) => {
        await expect(call(c, drill, team.id, 'attack', [{ kind: 'base', threshold: 0, factor: 1 }]))
          .rejects.toThrow('That exercise is not measured as Goals by role');
      });
    });

    it('refuses a role that is not attack, defend or keeper', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(coach, async (c) => {
        await expect(call(c, drill, team.id, 'midfield', []))
          .rejects.toThrow('Standards are set for Attack, Defence or Goalkeeper');
      });
    });

    it('refuses a coach of another squad', async () => {
      const mine = await makeTeam(db.owner);
      const theirs = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, mine);
      const drill = await makeDrill(db.owner, theirs);
      await db.asUser(coach, async (c) => {
        await expect(call(c, drill, theirs.id, 'attack', [{ kind: 'base', threshold: 0, factor: 1 }]))
          .rejects.toThrow('Only a coach of this team can set its standards');
      });
    });

    it('refuses a signed-in caller with no profile at all', async () => {
      // current_profile_role() and is_team_coach() both return NULL for them;
      // a bare `if not is_team_coach(...)` would skip the raise and let them in.
      const team = await makeTeam(db.owner);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(randomUUID(), async (c) => {
        await expect(call(c, drill, team.id, 'attack', [{ kind: 'base', threshold: 0, factor: 1 }]))
          .rejects.toThrow('Only a coach of this team can set its standards');
      });
    });

    it('is not callable signed out', async () => {
      const team = await makeTeam(db.owner);
      const drill = await makeDrill(db.owner, team);
      await db.asAnon(async (c) => {
        await expect(call(c, drill, team.id, 'attack', [])).rejects.toThrow(/permission denied/);
      });
    });

    it('is the only way in: a coach cannot insert a band directly', async () => {
      const team = await makeTeam(db.owner);
      const coach = await makeCoach(db.owner, team);
      const drill = await makeDrill(db.owner, team);
      await db.asUser(coach, async (c) => {
        await expect(c.query(
          `insert into public.drill_goal_bands (drill_id, team_id, role, kind, threshold, factor)
           values ($1, $2, 'attack', 'base', 0, 1)`, [drill, team.id]))
          .rejects.toThrow(/permission denied|row-level security/);
      });
    });

    it('lets anyone read the standards', async () => {
      const team = await makeTeam(db.owner);
      const drill = await makeDrill(db.owner, team);
      await addBand(db.owner, drill, team, { role: 'attack', kind: 'base', threshold: 0, factor: 1 });
      await db.asAnon(async (c) => {
        expect(await bandsOf(c, drill, team.id)).toHaveLength(1);
      });
    });
  });
});
