-- 0010: a per-exercise breakdown, and matrix_standings rebuilt on top of it
--
-- APPLY THIS BEFORE DEPLOYING THE MATCHING CODE, for the same reason as 0009:
-- the new code reads matrix_exercise_points, which does not exist until this
-- runs. The standings themselves keep their existing shape, so the deployed
-- old code is unaffected while this sits applied and the new code is not.
--
-- Why this exists. The leaderboard answers "who is first"; a coach also needs
-- "why am I fourth", which means one line per exercise showing what a player
-- did and what it earned.
--
-- Why it is a view rather than a client calculation. The scoring rules live in
-- SQL. Re-deriving a per-exercise breakdown in JavaScript would put the same
-- rules in two places, and the day they disagreed the detail panel would
-- contradict the leaderboard it was opened from, with nothing to say which was
-- right. This repository's defining hazard is exactly that kind of parallel
-- copy -- CLAUDE.md warns about it in three separate places.
--
-- Why matrix_standings is REBUILT rather than left alone. Its scoring CTEs and
-- this view's would otherwise be two copies of the same logic, which is the
-- problem restated one level down. So the breakdown becomes the single source
-- and the standings aggregate it. The leaderboard is then the sum of the
-- detail BY CONSTRUCTION, not by two calculations being carefully kept in
-- agreement.
--
-- The scoring itself is unchanged from 0009. Verified by the self-check at the
-- end, which asserts the same three shares against the same fixture.

begin;

set role postgres;

-- ─── 1. matrix_exercise_points ─────────────────────────────────────────────
-- One row per player per scored exercise. This is 0009's `parts` CTE, kept
-- whole rather than aggregated away, plus the columns needed to describe the
-- line to a human: what the exercise was, when, and what the player did.
--
-- security_invoker = true is REQUIRED. Without it the view runs as its owner
-- and bypasses RLS on matrix_logs and the session tables.

drop view if exists public.matrix_standings;
drop view if exists public.matrix_exercise_points;

create view public.matrix_exercise_points with (security_invoker = true) as
with h2h as (
  -- Each side of each logged 1v1 pairing. A pairing with no drill scores at
  -- weight 1.0: drill_id is nullable and the record modal offers "— none —".
  select l.team_id,
         l.player_a_id                  as player_id,
         l.player_b_id                  as opponent_id,
         l.drill_id,
         coalesce(d.name, '1v1')        as exercise,
         coalesce(d.points, 1.0)        as weight,
         l.occurred_on,
         case l.outcome when 'a' then 'win' when 'draw' then 'draw' else 'loss' end as detail,
         null::numeric                  as raw_value,
         'present'::text                as attendance,
         case l.outcome when 'a' then 1.0 when 'draw' then 0.5 else 0.0 end as factor,
         case l.outcome when 'a'    then 1 else 0 end as w,
         case l.outcome when 'draw' then 1 else 0 end as dr,
         case l.outcome when 'b'    then 1 else 0 end as ls
    from public.matrix_logs l
    left join public.drills_bank d on d.id = l.drill_id
   where not coalesce(l.is_deleted, false)
  union all
  select l.team_id,
         l.player_b_id,
         l.player_a_id,
         l.drill_id,
         coalesce(d.name, '1v1'),
         coalesce(d.points, 1.0),
         l.occurred_on,
         case l.outcome when 'b' then 'win' when 'draw' then 'draw' else 'loss' end,
         null::numeric,
         'present'::text,
         case l.outcome when 'b' then 1.0 when 'draw' then 0.5 else 0.0 end,
         case l.outcome when 'b'    then 1 else 0 end,
         case l.outcome when 'draw' then 1 else 0 end,
         case l.outcome when 'a'    then 1 else 0 end
    from public.matrix_logs l
    left join public.drills_bank d on d.id = l.drill_id
   where not coalesce(l.is_deleted, false)
),
ranked as (
  -- Measured tests. percent_rank() is computed over PRESENT players only:
  -- including absentees in the partition would push everyone down a place.
  -- The ::numeric cast keeps the whole chain numeric -- without it earned
  -- resolves to double precision and round(float8, int) does not exist.
  select s.team_id,
         r.player_id,
         s.drill_id,
         d.name        as exercise,
         d.points      as weight,
         s.occurred_on,
         r.raw_value,
         percent_rank() over (
           partition by r.session_id
           order by case when d.measure = 'time_low' then r.raw_value
                         else -r.raw_value end
         )::numeric    as pr
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'present'
     and d.measure in ('count_high', 'time_low')
     and r.raw_value is not null
),
win_loss as (
  select s.team_id,
         r.player_id,
         s.drill_id,
         d.name   as exercise,
         d.points as weight,
         s.occurred_on,
         r.outcome,
         case r.outcome when 'win' then 1.0 when 'draw' then 0.5 else 0.0 end as factor,
         case r.outcome when 'win'  then 1 else 0 end as w,
         case r.outcome when 'draw' then 1 else 0 end as dr,
         case r.outcome when 'loss' then 1 else 0 end as ls
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'present'
     and d.measure = 'win_loss'
     and r.outcome is not null
),
absent as (
  -- Unexcused only. An excused absence appears in neither numerator nor
  -- denominator, so it is simply not selected here -- which is also why it
  -- does not appear as a line in the breakdown.
  select s.team_id, r.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'unexcused'
)
select team_id, player_id, drill_id, exercise, occurred_on,
       'head_to_head'::text as kind,
       opponent_id,
       raw_value,
       detail,
       attendance,
       weight,
       weight * factor as earned,
       weight          as available,
       w, dr, ls,
       1 as exercise_count
  from h2h
union all
-- greatest(0.25, ...) is the participation floor: last place still beats a
-- no-show, without which the excused/unexcused distinction is meaningless.
select team_id, player_id, drill_id, exercise, occurred_on,
       'measured'::text, null::uuid, raw_value,
       null::text, 'present'::text, weight,
       weight * greatest(0.25, 1 - pr), weight,
       0, 0, 0, 1
  from ranked
union all
select team_id, player_id, drill_id, exercise, occurred_on,
       'win_loss'::text, null::uuid, null::numeric,
       outcome, 'present'::text, weight,
       weight * factor, weight,
       w, dr, ls, 1
  from win_loss
union all
select team_id, player_id, drill_id, exercise, occurred_on,
       'absent'::text, null::uuid, null::numeric,
       null::text, 'unexcused'::text, weight,
       0, weight,
       0, 0, 0, 1
  from absent;

grant select on public.matrix_exercise_points to anon, authenticated;

-- ─── 2. matrix_standings, now an aggregate of the breakdown ────────────────
-- Same columns and same numbers as 0009; it simply sums the view above
-- instead of repeating its CTEs. That is the point: the leaderboard is the
-- sum of the detail by construction, so the two cannot drift apart.

create view public.matrix_standings with (security_invoker = true) as
select team_id,
       player_id,
       sum(w)                             as wins,
       sum(dr)                            as draws,
       sum(ls)                            as losses,
       sum(w) + sum(dr) + sum(ls)         as games,
       sum(exercise_count)                as exercises,
       round(sum(earned)::numeric, 3)     as earned,
       round(sum(available)::numeric, 3)  as available,
       round(100.0 * sum(earned) / nullif(sum(available), 0), 1) as share,
       rank() over (
         partition by team_id
         order by sum(earned) / nullif(sum(available), 0) desc nulls last,
                  sum(earned) desc
       ) as rank
  from public.matrix_exercise_points
 group by team_id, player_id;

grant select on public.matrix_standings to anon, authenticated;

-- ─── 3. Self-check ─────────────────────────────────────────────────────────
-- The same fixture and the same three assertions as 0009. If the rebuild
-- changed any number, this raises and the whole migration rolls back.
-- It also asserts that the breakdown sums to the standings, which is the
-- property the rebuild exists to guarantee.

do $$
declare
  fx_school uuid := '00000000-0000-4000-8000-000000000001';
  fx_team   uuid := '00000000-0000-4000-8000-000000000002';
  p_cesar   uuid := '00000000-0000-4000-8000-000000000011';
  p_caleb   uuid := '00000000-0000-4000-8000-000000000012';
  p_dylan   uuid := '00000000-0000-4000-8000-000000000013';
  d_cooper  uuid := '00000000-0000-4000-8000-000000000021';
  d_1v1     uuid := '00000000-0000-4000-8000-000000000022';
  d_ssg     uuid := '00000000-0000-4000-8000-000000000023';
  s_cooper  uuid := '00000000-0000-4000-8000-000000000031';
  s_ssg     uuid := '00000000-0000-4000-8000-000000000032';
  got       numeric;
  lines     integer;
begin
  insert into public.schools (id, code, name, mascot, kind)
    values (fx_school, 'zzselfcheck', 'Self Check', 'Fixture', 'school');
  insert into public.teams (id, school_id, name)
    values (fx_team, fx_school, 'Self Check Team');
  -- class_year is NOT NULL and 0005 did not drop it, unlike number/position.
  insert into public.players (id, name, class_year) values
    (p_cesar, 'SelfCheck Cesar', '2027'),
    (p_caleb, 'SelfCheck Caleb', '2027'),
    (p_dylan, 'SelfCheck Dylan', '2027');

  -- No `duration`: declared in supabase_schema.sql, absent from the live table.
  insert into public.drills_bank (id, school_id, name, category, points, measure) values
    (d_cooper, fx_school, 'SelfCheck Coopers', 'Fitness',   1.5, 'count_high'),
    (d_1v1,    fx_school, 'SelfCheck 1v1',     'Technical', 3.0, 'head_to_head'),
    (d_ssg,    fx_school, 'SelfCheck SSG',     'Tactical',  2.5, 'win_loss');

  insert into public.matrix_logs (team_id, player_a_id, player_b_id, outcome, drill_id, occurred_on)
    values (fx_team, p_cesar, p_caleb, 'a',    d_1v1, current_date),
           (fx_team, p_dylan, p_caleb, 'draw', d_1v1, current_date);

  insert into public.matrix_sessions (id, team_id, drill_id, occurred_on) values
    (s_cooper, fx_team, d_cooper, current_date),
    (s_ssg,    fx_team, d_ssg,    current_date);

  insert into public.matrix_session_results (session_id, player_id, attendance, raw_value) values
    (s_cooper, p_cesar, 'present', 2800),
    (s_cooper, p_caleb, 'present', 2650),
    (s_cooper, p_dylan, 'present', 2500);

  insert into public.matrix_session_results (session_id, player_id, attendance, outcome) values
    (s_ssg, p_cesar, 'present', 'win'),
    (s_ssg, p_caleb, 'present', 'win'),
    (s_ssg, p_dylan, 'present', 'loss');

  -- Cesar: coopers 1.500/1.500 + 1v1 3.000/3.000 + ssg 2.500/2.500 = 100.0
  select share into got from public.matrix_standings
   where team_id = fx_team and player_id = p_cesar;
  if got is distinct from 100.0 then
    raise exception 'self-check: Cesar expected 100.0, got %', got;
  end if;

  -- Dylan: coopers 0.375/1.500 (floor) + 1v1 draw 1.500/3.000 + ssg 0.000/2.500
  --        = 1.875 / 7.000 = 26.8
  select share into got from public.matrix_standings
   where team_id = fx_team and player_id = p_dylan;
  if got is distinct from 26.8 then
    raise exception 'self-check: Dylan expected 26.8, got %', got;
  end if;

  -- Caleb plays TWO pairings here (a loss and a draw), so his available is
  -- 10.000 rather than 7.000: 4.750 / 10.000 = 47.5.
  select share into got from public.matrix_standings
   where team_id = fx_team and player_id = p_caleb;
  if got is distinct from 47.5 then
    raise exception 'self-check: Caleb expected 47.5, got %', got;
  end if;

  -- The property the rebuild exists for: the breakdown must sum to the
  -- standings. If these ever disagree the detail panel would contradict the
  -- leaderboard it opened from.
  select round(sum(earned)::numeric, 3) into got
    from public.matrix_exercise_points
   where team_id = fx_team and player_id = p_cesar;
  if got is distinct from 7.000 then
    raise exception 'self-check: breakdown sums to % for Cesar, expected 7.000', got;
  end if;

  -- Cesar has three lines: one pairing, one measured, one win_loss.
  select count(*) into lines
    from public.matrix_exercise_points
   where team_id = fx_team and player_id = p_cesar;
  if lines <> 3 then
    raise exception 'self-check: Cesar has % breakdown lines, expected 3', lines;
  end if;

  raise notice 'matrix_exercise_points self-check passed.';

  delete from public.matrix_session_results where session_id in (s_cooper, s_ssg);
  delete from public.matrix_sessions where id in (s_cooper, s_ssg);
  delete from public.matrix_logs where team_id = fx_team;
  delete from public.drills_bank where id in (d_cooper, d_1v1, d_ssg);
  delete from public.players where id in (p_cesar, p_caleb, p_dylan);
  delete from public.teams where id = fx_team;
  delete from public.schools where id = fx_school;
end $$;

commit;

-- Verify — one player's breakdown should sum to their standings row:
--   select exercise, occurred_on, kind, detail, raw_value, earned, available
--   from public.matrix_exercise_points
--   where player_id = '<uuid>'
--   order by occurred_on desc, exercise;

-- Rollback:
--   drop view if exists public.matrix_standings;
--   drop view if exists public.matrix_exercise_points;
--   -- then re-run section 4 of
--   -- supabase/migrations/0009_weighted_matrix_scoring.sql, which defines
--   -- matrix_standings with its own CTEs.
