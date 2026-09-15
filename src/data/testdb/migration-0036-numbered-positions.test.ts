/**
 * 0036 — a position is the soccer position number 1-11.
 *
 * The column was free text ("FB", "MF", "Center Midfield", "Goalkeeper"), so
 * nothing could tell an attacker from a defender. Only the certain conversions
 * are kept: a guessed number would put a player in the wrong role for the
 * Goals by role drill without anyone noticing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';

const available = await hasTestDb();

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/0036_numbered_positions.sql'), 'utf8');

/** The migration without its own transaction control: withDb has opened one. */
const apply = (c: any) => c.query(MIGRATION.replace(/^\s*(begin|commit)\s*;\s*$/gim, ''));

/** One organization and team, and a roster entry per text position. */
async function rosterWith(c: any, positions: (string | null)[]) {
  const school = (await c.query(
    `insert into public.schools (code, name, mascot) values ('alpha', 'Alpha', 'A') returning id`)).rows[0].id;
  const team = (await c.query(
    `insert into public.teams (school_id, name) values ($1, 'Varsity') returning id`, [school])).rows[0].id;
  const ids: string[] = [];
  for (const [i, position] of positions.entries()) {
    const player = (await c.query(
      `insert into public.players (name, class_year) values ($1, '2027') returning id`, [`Player ${i}`])).rows[0].id;
    const row = (await c.query(
      `insert into public.team_players (team_id, school_id, player_id, position) values ($1, $2, $3, $4) returning id`,
      [team, school, player, position])).rows[0].id;
    ids.push(row);
  }
  return { school, team, ids };
}

const positionOf = async (c: any, id: string) =>
  (await c.query(`select position from public.team_players where id = $1`, [id])).rows[0].position;

describe.skipIf(!available)('0036: a position is a number 1-11', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('converts only what is certain', async () => {
    await withDb(async (c) => {
      const cases: [string | null, number | null][] = [
        ['Goalkeeper', 1], [' gk ', 1], ['Keeper', 1], ['Goal Keeper', 1],
        ['FB', null], ['MF', null], ['Center Midfield', null], ['FW', null], ['Forward / CAM', null],
        [' 7 ', 7], ['11', 11], ['1', 1], ['12', null], ['0', null], ['', null], [null, null]
      ];
      const { ids } = await rosterWith(c, cases.map(([text]) => text));
      await apply(c);
      for (const [i, [text, expected]] of cases.entries()) {
        expect(await positionOf(c, ids[i]), `from ${JSON.stringify(text)}`).toBe(expected);
      }
    });
  }, 60_000);

  it('stores a number from then on', async () => {
    await withDb(async (c) => {
      await apply(c);
      const { rows } = await c.query(`
        select data_type from information_schema.columns
         where table_schema = 'public' and table_name = 'team_players' and column_name = 'position'`);
      expect(rows).toEqual([{ data_type: 'smallint' }]);
    });
  }, 60_000);

  it('refuses a number outside 1-11', async () => {
    await withDb(async (c) => {
      const { ids } = await rosterWith(c, [null]);
      await apply(c);
      await c.query('savepoint try_zero');
      await expect(c.query(`update public.team_players set position = 0 where id = $1`, [ids[0]]))
        .rejects.toThrow(/team_players_position_range/);
      await c.query('rollback to savepoint try_zero');
      await expect(c.query(`update public.team_players set position = 12 where id = $1`, [ids[0]]))
        .rejects.toThrow(/team_players_position_range/);
    });
  }, 60_000);

  it('can be applied a second time without changing anything', async () => {
    await withDb(async (c) => {
      const { ids } = await rosterWith(c, ['Goalkeeper', 'FB', '9']);
      await apply(c);
      await apply(c);
      expect([await positionOf(c, ids[0]), await positionOf(c, ids[1]), await positionOf(c, ids[2])])
        .toEqual([1, null, 9]);
    });
  }, 60_000);
});
