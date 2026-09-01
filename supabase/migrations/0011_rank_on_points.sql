-- 0011: rank on points earned, and stop un-entered players vanishing
--
-- APPLY BEFORE DEPLOYING THE MATCHING CODE. The standings keep their column
-- shape, so old code keeps working while this sits applied; only the ordering
-- and one new breakdown row type change.
--
-- ── Why the ranking changes ───────────────────────────────────────────────
--
-- 0009 ranked on share -- points earned divided by points available -- so that
-- a missed session could not sink a season. On real data that turned out to
-- reward the wrong thing: a player who competed only in fitness tests, and did
-- well, outranked a player who won every 1v1 but ran a mediocre Cooper's. The
-- narrow record had a small denominator and nothing to drag it down.
--
-- Ranking on points earned inverts that. Competing in what matters most, and
-- winning, is what accumulates; avoiding the hard exercise simply earns
-- nothing. It also makes the weights bite: a 1v1 at 3.0 is worth three
-- Cooper's at 1.0, which is the whole point of having weights.
--
-- What it costs, stated plainly: there is no denominator any more, so an
-- excused absence is no longer free. A player out injured for three weeks has
-- fewer points and cannot catch up. The table cannot tell "injured" from
-- "avoiding the 1v1", so `share` remains a column beside the points -- the
-- coach reads both and makes that judgement themselves.
--
-- Share breaks ties: two players on equal points are separated by the one who
-- got there from less exposure.
--
-- ── Why un-entered players now count ──────────────────────────────────────
--
-- A roster player with no row in a session contributed nothing to either side
-- of the calculation -- identical to being excused. So a coach who entered
-- only the players who turned up silently excused everyone else. Those players
-- now score zero against the exercise's full weight, the same as a no-show,
-- and appear in the breakdown labelled `not_entered` so the coach can tell a
-- deliberate no-show from a gap in data entry.
--
-- The membership date guard matters: team_players.created_at is compared to
-- the session date so a player who joined the squad LAST WEEK is not charged
-- for a session three weeks ago. Without it every new signing would arrive
-- with a history of absences they could not have attended.

begin;

set role postgres;

drop view if exists public.matrix_standings;
drop view if exists public.matrix_exercise_points;

create view public.matrix_exercise_points with (security_invoker = true) as
with h2h as (
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
  -- percent_rank() over PRESENT players only; the ::numeric cast keeps the
  -- whole chain numeric, without which round(float8, int) does not exist.
  select s.team_id, r.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on, r.raw_value,
         percent_rank() over (
           partition by r.session_id
           order by case when d.measure = 'time_low' then r.raw_value
                         else -r.raw_value end
         )::numeric as pr
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'present'
     and d.measure in ('count_high', 'time_low')
     and r.raw_value is not null
),
win_loss as (
  select s.team_id, r.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on, r.outcome,
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
  -- Explicitly marked no-shows. Excused is still selected nowhere, which is
  -- what excused means.
  select s.team_id, r.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'unexcused'
),
not_entered as (
  -- On the roster when the session ran, but never given a row at all. Scores
  -- as a no-show; labelled separately so a coach can tell a real absence from
  -- a session they only half-filled in.
  select s.team_id, tp.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on
    from public.matrix_sessions s
    join public.drills_bank d on d.id = s.drill_id
    join public.team_players tp
      on tp.team_id = s.team_id
     and not coalesce(tp.is_deleted, false)
     -- The guard that stops a new signing inheriting old absences.
     and tp.created_at::date <= s.occurred_on
   where not coalesce(s.is_deleted, false)
     and not exists (
       select 1 from public.matrix_session_results r
        where r.session_id = s.id and r.player_id = tp.player_id
     )
)
select team_id, player_id, drill_id, exercise, occurred_on,
       'head_to_head'::text as kind, opponent_id, raw_value, detail, attendance,
       weight, weight * factor as earned, weight as available,
       w, dr, ls, 1 as exercise_count
  from h2h
union all
-- greatest(0.25, ...) is the participation floor: last place still beats not
-- turning up at all.
select team_id, player_id, drill_id, exercise, occurred_on,
       'measured'::text, null::uuid, raw_value, null::text, 'present'::text,
       weight, weight * greatest(0.25, 1 - pr), weight, 0, 0, 0, 1
  from ranked
union all
select team_id, player_id, drill_id, exercise, occurred_on,
       'win_loss'::text, null::uuid, null::numeric, outcome, 'present'::text,
       weight, weight * factor, weight, w, dr, ls, 1
  from win_loss
union all
select team_id, player_id, drill_id, exercise, occurred_on,
       'absent'::text, null::uuid, null::numeric, null::text, 'unexcused'::text,
       weight, 0, weight, 0, 0, 0, 1
  from absent
union all
select team_id, player_id, drill_id, exercise, occurred_on,
       'not_entered'::text, null::uuid, null::numeric, null::text, 'unexcused'::text,
       weight, 0, weight, 0, 0, 0, 1
  from not_entered;

grant select on public.matrix_exercise_points to anon, authenticated;

-- ── matrix_standings: same columns, points-first ordering ─────────────────

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
         -- Points first: competing in what matters, and winning, is what
         -- rises. Share breaks ties, so two players on equal points are
         -- separated by the one who got there from less exposure.
         order by sum(earned) desc,
                  sum(earned) / nullif(sum(available), 0) desc nulls last
       ) as rank
  from public.matrix_exercise_points
 group by team_id, player_id;

grant select on public.matrix_standings to anon, authenticated;

-- ── Self-check ────────────────────────────────────────────────────────────
-- The same fixture as 0009/0010, extended to cover the two new behaviours:
-- points-first ordering, and the not_entered rule with its join-date guard.

do $$
declare
  fx_school uuid := '00000000-0000-4000-8000-000000000001';
  fx_team   uuid := '00000000-0000-4000-8000-000000000002';
  p_cesar   uuid := '00000000-0000-4000-8000-000000000011';
  p_caleb   uuid := '00000000-0000-4000-8000-000000000012';
  p_dylan   uuid := '00000000-0000-4000-8000-000000000013';
  p_skip    uuid := '00000000-0000-4000-8000-000000000014';  -- on the team, never entered
  p_new     uuid := '00000000-0000-4000-8000-000000000015';  -- joined after the session
  d_cooper  uuid := '00000000-0000-4000-8000-000000000021';
  d_1v1     uuid := '00000000-0000-4000-8000-000000000022';
  d_ssg     uuid := '00000000-0000-4000-8000-000000000023';
  s_cooper  uuid := '00000000-0000-4000-8000-000000000031';
  s_ssg     uuid := '00000000-0000-4000-8000-000000000032';
  got       numeric;
  got_rank  bigint;
  n         integer;
begin
  insert into public.schools (id, code, name, mascot, kind)
    values (fx_school, 'zzselfcheck', 'Self Check', 'Fixture', 'school');
  insert into public.teams (id, school_id, name)
    values (fx_team, fx_school, 'Self Check Team');
  insert into public.players (id, name, class_year) values
    (p_cesar, 'SelfCheck Cesar', '2027'),
    (p_caleb, 'SelfCheck Caleb', '2027'),
    (p_dylan, 'SelfCheck Dylan', '2027'),
    (p_skip,  'SelfCheck Skip',  '2027'),
    (p_new,   'SelfCheck New',   '2027');

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

  -- Shares are unchanged from 0009/0010: the scoring did not move, only the
  -- ordering. Cesar 7.000/7.000, Caleb 4.750/10.000, Dylan 1.875/7.000.
  select share into got from public.matrix_standings
   where team_id = fx_team and player_id = p_cesar;
  if got is distinct from 100.0 then
    raise exception 'self-check: Cesar share expected 100.0, got %', got;
  end if;

  select share into got from public.matrix_standings
   where team_id = fx_team and player_id = p_caleb;
  if got is distinct from 47.5 then
    raise exception 'self-check: Caleb share expected 47.5, got %', got;
  end if;

  -- The new ordering: Cesar 7.000 > Caleb 4.750 > Dylan 1.875.
  select rank into got_rank from public.matrix_standings
   where team_id = fx_team and player_id = p_cesar;
  if got_rank <> 1 then raise exception 'self-check: Cesar expected rank 1, got %', got_rank; end if;

  select rank into got_rank from public.matrix_standings
   where team_id = fx_team and player_id = p_caleb;
  if got_rank <> 2 then raise exception 'self-check: Caleb expected rank 2, got %', got_rank; end if;

  -- Caleb outranks Dylan on POINTS despite a far lower share (47.5 vs 26.8 is
  -- the right way round here, but under the old share-first ordering Caleb was
  -- still 2nd; the case that actually moved is on live data). Assert the
  -- ordering key directly instead: more points must win.
  select rank into got_rank from public.matrix_standings
   where team_id = fx_team and player_id = p_dylan;
  if got_rank <> 3 then raise exception 'self-check: Dylan expected rank 3, got %', got_rank; end if;

  -- ── not_entered ────────────────────────────────────────────────────────
  -- Skip is on the roster from before the sessions and was never given a row,
  -- so he owes both sessions: 0 of 1.5 + 0 of 2.5 = 0 of 4.0.
  insert into public.team_players (team_id, school_id, player_id)
    values (fx_team, fx_school, p_skip);

  select count(*) into n from public.matrix_exercise_points
   where team_id = fx_team and player_id = p_skip and kind = 'not_entered';
  if n <> 2 then raise exception 'self-check: Skip expected 2 not_entered rows, got %', n; end if;

  select available into got from public.matrix_standings
   where team_id = fx_team and player_id = p_skip;
  if got is distinct from 4.000 then
    raise exception 'self-check: Skip available expected 4.000, got %', got;
  end if;

  select earned into got from public.matrix_standings
   where team_id = fx_team and player_id = p_skip;
  if got is distinct from 0.000 then
    raise exception 'self-check: Skip earned expected 0.000, got %', got;
  end if;

  -- A player who joined AFTER the sessions must not inherit their absences.
  insert into public.team_players (team_id, school_id, player_id, created_at)
    values (fx_team, fx_school, p_new, now() + interval '2 days');

  select count(*) into n from public.matrix_exercise_points
   where team_id = fx_team and player_id = p_new;
  if n <> 0 then
    raise exception 'self-check: a player who joined after the session inherited % rows', n;
  end if;

  -- Adding Skip must not have disturbed anyone else's numbers.
  select earned into got from public.matrix_standings
   where team_id = fx_team and player_id = p_cesar;
  if got is distinct from 7.000 then
    raise exception 'self-check: Cesar earned expected 7.000 after roster change, got %', got;
  end if;

  raise notice 'matrix ranking self-check passed.';

  delete from public.team_players where team_id = fx_team;
  delete from public.matrix_session_results where session_id in (s_cooper, s_ssg);
  delete from public.matrix_sessions where id in (s_cooper, s_ssg);
  delete from public.matrix_logs where team_id = fx_team;
  delete from public.drills_bank where id in (d_cooper, d_1v1, d_ssg);
  delete from public.players where id in (p_cesar, p_caleb, p_dylan, p_skip, p_new);
  delete from public.teams where id = fx_team;
  delete from public.schools where id = fx_school;
end $$;

commit;

-- Rollback:
--   drop view if exists public.matrix_standings;
--   drop view if exists public.matrix_exercise_points;
--   -- then re-run supabase/migrations/0010_matrix_exercise_points.sql, which
--   -- defines both views with share-first ordering and no not_entered rule.
