/**
 * demo_seed.sql, run the way the nightly rebuild runs it: the schema from
 * today's migrations, then the file. Real Postgres throughout -- the clone's
 * catalog-driven remapping cannot be proved any other way.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasTestDb, setupDb, teardownDb, withDb } from './harness';
import { schemaSteps, seedSql, runSteps } from '../../../scripts/demo-rebuild-lib.mjs';

const available = await hasTestDb();
const REPO = process.cwd();

/** The rebuild's first half: the schema, then demo_seed.sql. */
async function build(c: any) {
  await runSteps(c, [...schemaSteps(REPO), { label: 'demo_seed.sql', sql: seedSql(REPO) }]);
}

const one = async (c: any, sql: string, params: any[] = []) => (await c.query(sql, params)).rows[0];

describe.skipIf(!available)('demo_seed.sql', () => {
  beforeAll(async () => { await setupDb([]); }, 180_000);
  afterAll(async () => { await teardownDb(); });

  describe('the copying machinery', () => {
    it('no longer has the self-serve signup hook', async () => {
      await withDb(async (c) => {
        await build(c);
        expect((await one(c, `select to_regproc('public.demo_new_org') as f`)).f).toBeNull();
      });
    }, 60_000);

    it('allows one template only', async () => {
      await withDb(async (c) => {
        await build(c);
        const a = (await one(c, `insert into schools (code, name, mascot) values ('demo-a', 'A', 'A') returning id`)).id;
        const b = (await one(c, `insert into schools (code, name, mascot) values ('demo-b', 'B', 'B') returning id`)).id;
        await c.query(`insert into demo_orgs (school_id, kind) values ($1, 'template')`, [a]);
        await expect(c.query(`insert into demo_orgs (school_id, kind) values ($1, 'template')`, [b]))
          .rejects.toThrow(/demo_orgs_one_template/);
      });
    }, 60_000);

    // 0027 gave categories a school_id, so each copy needs its own list.
    it("copies the template's categories into the copy and leaves the template's alone", async () => {
      await withDb(async (c) => {
        await build(c);
        const t = (await one(c, `insert into schools (code, name, mascot) values ('demo-t', 'Template', 'T') returning id`)).id;
        await c.query(`insert into demo_orgs (school_id, kind) values ($1, 'template')`, [t]);
        await c.query(
          `insert into soccer_categories (school_id, name, description) values ($1, 'Possession', 'x'), ($1, 'Finishing', 'y')`, [t]);

        const copy = (await one(c, `select demo_clone_org($1, 'Copy') as id`, [t])).id;

        const { rows } = await c.query(
          `select school_id = $1 as in_copy, count(*)::int as n from soccer_categories group by 1 order by 1`, [copy]);
        expect(rows).toEqual([{ in_copy: false, n: 2 }, { in_copy: true, n: 2 }]);
      });
    }, 60_000);

    // demo_clone_org is security definer: published, the anon key could clone
    // the template as often as it liked.
    it('is not callable through the API', async () => {
      await withDb(async (c) => {
        await build(c);
        // Both API roles: the published key is anon, and every signed-in
        // visitor is authenticated.
        const { rows } = await c.query(`
          select r.role,
                 has_function_privilege(r.role, 'public.demo_clone_org(uuid, text)', 'execute') as clone,
                 has_function_privilege(r.role, 'public.demo_clone_manifest()', 'execute')      as manifest
            from unnest(array['anon', 'authenticated']) as r(role) order by r.role`);
        expect(rows).toEqual([
          { role: 'anon', clone: false, manifest: false },
          { role: 'authenticated', clone: false, manifest: false }
        ]);
      });
    }, 60_000);
  });

  describe('demo_seed_template: Riverside High School, a season in progress', () => {
    const seeded = async (c: any, asOf = '2026-09-11'): Promise<string> => {
      await build(c);
      return (await one(c, `select demo_seed_template($1::date) as id`, [asOf])).id;
    };

    it('is two squads of 20 and 18, each numbered in one block', async () => {
      await withDb(async (c) => {
        const sch = await seeded(c);
        const { rows } = await c.query(`
          select t.name, count(*)::int as n, min(tp.recording_number)::int as lo,
                 max(tp.recording_number)::int as hi, count(distinct tp.recording_number)::int as distinct_numbers
            from team_players tp join teams t on t.id = tp.team_id
           where t.school_id = $1 group by t.name order by t.name`, [sch]);
        expect(rows).toEqual([
          { name: 'JV', n: 18, lo: 1, hi: 18, distinct_numbers: 18 },
          { name: 'Varsity', n: 20, lo: 1, hi: 20, distinct_numbers: 20 }
        ]);
      });
    }, 60_000);

    it('is invented: its own code, and nothing called Beaumont', async () => {
      await withDb(async (c) => {
        const sch = await seeded(c);
        expect((await one(c, `select code from schools where id = $1`, [sch])).code).toBe('demo-template');
        expect((await one(c, `select count(*)::int as n from schools where name ilike '%beaumont%'`)).n).toBe(0);
      });
    }, 60_000);

    // A nightly rebuild runs for months. Fixed dates would leave December with
    // a season entirely in the past.
    it('is half-played whatever night the rebuild runs', async () => {
      for (const asOf of ['2026-09-11', '2026-12-15', '2027-04-20']) {
        await withDb(async (c) => {
          const sch = await seeded(c, asOf);
          const r = await one(c, `
            select count(*) filter (where s.status = 'COMPLETED' and s.match_on < $2::date and s.score is not null)::int as played,
                   count(*) filter (where s.status = 'UPCOMING'  and s.match_on > $2::date and s.score is null)::int as ahead,
                   count(*)::int as total
              from schedule s join teams t on t.id = s.team_id where t.school_id = $1`, [sch, asOf]);
          expect(r, asOf).toEqual({ played: 17, ahead: 11, total: 28 });
        });
      }
    }, 180_000);

    it("keeps a record that agrees with Varsity's results", async () => {
      await withDb(async (c) => {
        const sch = await seeded(c);
        expect((await one(c, `select record from schools where id = $1`, [sch])).record)
          .toEqual({ wins: 6, draws: 2, losses: 2 });
      });
    }, 60_000);

    it('has one Matrix drill per measure, and three diagrams from the board', async () => {
      await withDb(async (c) => {
        const sch = await seeded(c);
        const r = await one(c, `
          select array_agg(distinct measure order by measure) as measures,
                 count(*) filter (where jsonb_array_length(coalesce(diagram_data->'keyframes', '[]'::jsonb)) = 3)::int as diagrams,
                 count(*)::int as drills
            from drills_bank where school_id = $1`, [sch]);
        expect(r).toEqual({
          measures: ['count_high', 'head_to_head', 'time_bands', 'time_low', 'win_loss'],
          diagrams: 3, drills: 12
        });
      });
    }, 60_000);

    // time_bands is a standard, not a ranking (CLAUDE.md): bands that everyone
    // near match fitness clears, per squad.
    it('sets the fitness standard on the time_bands drill, per squad, and everyone clears a band', async () => {
      await withDb(async (c) => {
        const sch = await seeded(c);
        const bands = await one(c, `
          select count(*)::int as n, count(distinct b.team_id)::int as squads,
                 bool_and(d.measure = 'time_bands') as on_time_bands
            from drill_time_bands b join drills_bank d on d.id = b.drill_id where d.school_id = $1`, [sch]);
        expect(bands).toEqual({ n: 6, squads: 2, on_time_bands: true });

        const slowest = await one(c, `
          select max(r.raw_value)::int as worst from matrix_session_results r
            join matrix_sessions m on m.id = r.session_id join drills_bank d on d.id = m.drill_id
           where d.school_id = $1 and d.measure = 'time_bands' and r.attendance = 'present'`, [sch]);
        expect(slowest.worst).toBeLessThan(300);
      });
    }, 60_000);

    it('has Matrix sessions where not everyone was there', async () => {
      await withDb(async (c) => {
        const sch = await seeded(c);
        const r = await one(c, `
          select count(distinct m.id)::int as sessions, count(*)::int as results,
                 array_agg(distinct r.attendance order by r.attendance) as attendance
            from matrix_session_results r join matrix_sessions m on m.id = r.session_id
            join teams t on t.id = m.team_id where t.school_id = $1`, [sch]);
        expect(r).toEqual({ sessions: 6, results: 120, attendance: ['excused', 'present', 'unexcused'] });
      });
    }, 60_000);

    it('has plus/minus for four matches, with goals that agree with the scores', async () => {
      await withDb(async (c) => {
        const sch = await seeded(c);
        const { rows } = await c.query(`
          select s.score,
                 count(*) filter (where e.kind = 'goal_for')::int as gf,
                 count(*) filter (where e.kind = 'goal_against')::int as ga
            from stat_matches m join stat_events e on e.match_id = m.id join schedule s on s.id = m.match_id
           where m.school_id = $1 group by m.id, s.score`, [sch]);
        expect(rows).toHaveLength(4);
        for (const r of rows) expect(`${r.gf} - ${r.ga}`).toBe(r.score);
      });
    }, 60_000);

    // The live screen refuses an event while the clock is stopped (CLAUDE.md),
    // so a seeded one would model a state the product forbids.
    it('records every event while the clock is running', async () => {
      await withDb(async (c) => {
        const sch = await seeded(c);
        const r = await one(c, `
          select count(*)::int as outside from stat_events e join stat_matches m on m.id = e.match_id
           where m.school_id = $1 and e.kind not in ('clock_start', 'clock_stop', 'period')
             and not exists (
               select 1 from stat_events s, stat_events x
                where s.match_id = e.match_id and x.match_id = e.match_id
                  and s.kind = 'clock_start' and x.kind = 'clock_stop'
                  and s.period = e.period and x.period = e.period
                  and s.at_seconds <= e.at_seconds and x.at_seconds >= e.at_seconds)`, [sch]);
        expect(r.outside).toBe(0);
      });
    }, 60_000);

    // Low-minute players are the audience for the squad report, not noise.
    it('brings players on late, so the reports have low-minute players', async () => {
      await withDb(async (c) => {
        const sch = await seeded(c);
        const r = await one(c, `
          select count(*)::int as late from stat_events e join stat_matches m on m.id = e.match_id
           where m.school_id = $1 and e.kind = 'on' and e.at_seconds >= 4200`, [sch]);
        expect(r.late).toBe(8);
      });
    }, 60_000);

    it('writes plan slots the way the planner does', async () => {
      await withDb(async (c) => {
        const sch = await seeded(c);
        const { rows } = await c.query(`
          select p.name, p.drill, p.time_slot, p.duration from practice_plans p
            join teams t on t.id = p.team_id where t.school_id = $1 order by p.created_at`, [sch]);
        expect(rows).toHaveLength(16);
        expect(rows[0]).toEqual({
          name: 'Tuesday - Possession Focus', drill: 'Dynamic Warm-up',
          time_slot: '3:30 PM - 3:45 PM', duration: '15 min'
        });
        expect(rows.every((r: any) => r.drill)).toBe(true);
      });
    }, 60_000);

    it('has one active message, the newest, and a quiz with one right answer per question', async () => {
      await withDb(async (c) => {
        const sch = await seeded(c);
        const { rows: active } = await c.query(`
          select d.title from daily_thoughts d join teams t on t.id = d.team_id
           where t.school_id = $1 and d.is_active order by d.created_at desc`, [sch]);
        expect(active).toEqual([{ title: 'Compact when we lose it' }]);

        const quiz = await one(c, `
          select count(*)::int as questions,
                 count(*) filter (where q.thought_id is not null)::int as on_the_message,
                 count(*) filter (where (select count(*) from quiz_answers a
                                          where a.question_id = q.question_id) = 4
                                    and (select string_agg(a.letter, '') from quiz_answers a
                                          where a.question_id = q.question_id and a.is_correct) = q.correct_option)::int as well_formed
            from quiz_questions q where q.school_id = $1`, [sch]);
        expect(quiz).toEqual({ questions: 8, on_the_message: 4, well_formed: 8 });
      });
    }, 60_000);

    it('refuses a second template, because the rebuild wipes first', async () => {
      await withDb(async (c) => {
        await seeded(c);
        await expect(c.query(`select demo_seed_template('2026-09-11'::date)`))
          .rejects.toThrow(/template already exists/);
      });
    }, 60_000);
  });
});
