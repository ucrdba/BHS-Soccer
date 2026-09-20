/**
 * Every status the fixture form offers is one the schedule table accepts.
 *
 * The form offered "SCHEDULED" while `schedule_status_check` allows only
 * UPCOMING, COMPLETED and CANCELLED, so every new fixture was refused with
 * `new row for relation "schedule" violates check constraint
 * "schedule_status_check"` -- on the coach's screen, not in any test. Nothing
 * in the app reads the word (every filter asks whether a match is COMPLETED),
 * so only Postgres could catch it, and only by being asked.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';
import { MATCH_STATUSES } from '../../types';

const available = await hasTestDb();

describe.skipIf(!available)('the statuses a fixture may carry', () => {
  beforeAll(async () => { await setupDb(); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  it('are all accepted by the schedule table', async () => {
    await withDb(async (db) => {
      const school = (await db.query(
        `insert into public.schools (name, code, mascot, city) values ('Test', 'tst', 'Tests', 'Town') returning id`
      )).rows[0].id;
      const team = (await db.query(
        `insert into public.teams (school_id, name, season) values ($1, 'Varsity', '2026') returning id`, [school]
      )).rows[0].id;

      for (const status of MATCH_STATUSES) {
        const row = await db.query(
          `insert into public.schedule (team_id, opponent, location, match_date, match_time, status)
           values ($1, 'Yucaipa', 'Varsity Field', 'SEP 4 2026', '6:00 PM', $2)
           returning status`,
          [team, status]
        );
        expect(row.rows[0].status).toBe(status);
      }
    });
  });

  it('are the only ones it accepts, so the list cannot quietly grow', async () => {
    await withDb(async (db) => {
      const school = (await db.query(
        `insert into public.schools (name, code, mascot, city) values ('Test', 'tst', 'Tests', 'Town') returning id`
      )).rows[0].id;
      const team = (await db.query(
        `insert into public.teams (school_id, name, season) values ($1, 'Varsity', '2026') returning id`, [school]
      )).rows[0].id;

      await expect(db.query(
        `insert into public.schedule (team_id, opponent, location, match_date, match_time, status)
         values ($1, 'Yucaipa', 'Varsity Field', 'SEP 4 2026', '6:00 PM', 'SCHEDULED')`,
        [team]
      )).rejects.toThrow(/schedule_status_check/);
    });
  });
});
