/// <reference types="node" />
/**
 * Committed fixtures for the Goals-by-role database tests.
 *
 * Built on accounts-db's owner connection (a superuser, so RLS does not stand
 * in the way of arranging data). Every fixture gets its own team and drill, so
 * committed rows from one test can never be scored in another.
 */
import type pg from 'pg';
import { one, uniq, makeTeam, makeRosterEntry } from './accounts-db';

export interface Team { id: string; school_id: string }

export async function makeDrill(owner: pg.Client, team: Team, measure = 'role_goals', points = 1): Promise<string> {
  const row = await one(owner,
    `insert into public.drills_bank (school_id, name, category, points, measure)
     values ($1, $2, 'General', $3, $4) returning id`,
    [team.school_id, `Drill ${uniq()}`, points, measure]);
  return row.id;
}

export async function makeSession(owner: pg.Client, team: Team, drillId: string): Promise<string> {
  const row = await one(owner,
    `insert into public.matrix_sessions (team_id, drill_id, occurred_on) values ($1, $2, current_date) returning id`,
    [team.id, drillId]);
  return row.id;
}

export async function addResult(owner: pg.Client, sessionId: string, playerId: string, r: {
  attendance?: string; rawValue?: number | null; outcome?: string | null;
  role?: string | null; goalsFor?: number | null; goalsAgainst?: number | null;
}): Promise<void> {
  await owner.query(
    `insert into public.matrix_session_results
       (session_id, player_id, attendance, raw_value, outcome, role, goals_for, goals_against)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [sessionId, playerId, r.attendance ?? 'present', r.rawValue ?? null, r.outcome ?? null,
     r.role ?? null, r.goalsFor ?? null, r.goalsAgainst ?? null]);
}

export async function addBand(owner: pg.Client, drillId: string, team: Team, b: {
  role: string; kind: string; threshold: number; factor: number;
}): Promise<void> {
  await owner.query(
    `insert into public.drill_goal_bands (drill_id, team_id, role, kind, threshold, factor)
     values ($1, $2, $3, $4, $5, $6)`,
    [drillId, team.id, b.role, b.kind, b.threshold, b.factor]);
}

/** Every scored line for one player on one drill, numbers as numbers. */
export async function pointsFor(c: pg.Client, drillId: string, playerId: string) {
  const { rows } = await c.query(
    `select kind, raw_value, earned, available, role, goals_for, goals_against, base_factor, bonus_factor
       from public.matrix_exercise_points
      where drill_id = $1 and player_id = $2
      order by kind`, [drillId, playerId]);
  const num = (v: any) => (v === null || v === undefined ? null : Number(v));
  return rows.map(r => ({
    kind: r.kind, role: r.role,
    raw_value: num(r.raw_value), earned: num(r.earned), available: num(r.available),
    goals_for: num(r.goals_for), goals_against: num(r.goals_against),
    base_factor: num(r.base_factor), bonus_factor: num(r.bonus_factor)
  }));
}

export { makeTeam, makeRosterEntry };
