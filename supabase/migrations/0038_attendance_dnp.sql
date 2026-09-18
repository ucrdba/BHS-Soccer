-- 0038: DNP -- a fourth attendance, "did not play"
--
-- APPLY BEFORE DEPLOYING THE CLIENT THAT WRITES IT. An older client never
-- sends 'dnp', so applying early changes nothing for the deployed app; the
-- other way round, every DNP save is refused by the check constraint.
--
-- ── What it means ─────────────────────────────────────────────────────────
--
-- A no-show was not at practice. A DNP was there and did not do the exercise
-- -- carrying a knock, on a minutes limit, held out. It COSTS THE SAME: 0 of
-- the drill's weight, because they did not do it. Excused is the one that
-- costs nothing, and it is untouched here.
--
-- The two are kept apart in the view rather than merged: the absent branch now
-- reports the stored attendance instead of hard-coding 'unexcused', so a
-- player's breakdown can say "did not play" rather than accusing them of
-- missing practice.
--
-- ── Safe to apply twice ───────────────────────────────────────────────────
--
-- The constraint is dropped before it is added and the views are rebuilt.

begin;

set role postgres;

-- ─── The fourth value ──────────────────────────────────────────────────────

alter table public.matrix_session_results drop constraint if exists matrix_session_results_attendance_check;
alter table public.matrix_session_results add constraint matrix_session_results_attendance_check
  check (attendance in ('present', 'excused', 'unexcused', 'dnp'));

-- ─── Scoring ───────────────────────────────────────────────────────────────
-- Rebuilt from 0037 with two edits, both in the absent branch: it matches
-- 'dnp' as well as 'unexcused', and it reports the stored value. Everything
-- else is unchanged.

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
banded as (
  -- A time against absolute standards. The band taken is the TIGHTEST one the
  -- time still fits under -- min(max_seconds) where raw_value <= max_seconds --
  -- so 4:28 takes the 4:30 band rather than the 4:50 one it also satisfies.
  --
  -- Missing every band scores 0 of the weight: present, standard not met.
  --
  -- A team with NO bands for the drill is excluded entirely, so the exercise
  -- is neither earned nor available for them. Scoring it 0 would quietly drag
  -- a squad's share down because a coach had not set their standards yet, and
  -- nothing on screen would say why.
  select s.team_id, r.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on, r.raw_value,
         coalesce((
           select b.factor
             from public.drill_time_bands b
            where b.drill_id = s.drill_id
              and b.team_id  = s.team_id
              and r.raw_value <= b.max_seconds
            order by b.max_seconds
            limit 1
         ), 0)::numeric as factor
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'present'
     and d.measure = 'time_bands'
     and r.raw_value is not null
     and exists (
       select 1 from public.drill_time_bands b
        where b.drill_id = s.drill_id and b.team_id = s.team_id
     )
),
role_scored as (
  -- Goals by role. See the header. A role with no base bands for the squad is
  -- excluded by the EXISTS; bonus bands alone are not a standard.
  select s.team_id, r.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on,
         r.role, r.goals_for, r.goals_against,
         coalesce((
           select max(b.factor)
             from public.drill_goal_bands b
            where b.drill_id = s.drill_id and b.team_id = s.team_id
              and b.role = r.role and b.kind = 'base'
              and r.goals_for - r.goals_against >= b.threshold
         ), 0)::numeric as base_factor,
         coalesce((
           select max(b.factor)
             from public.drill_goal_bands b
            where b.drill_id = s.drill_id and b.team_id = s.team_id
              and b.role = r.role and b.kind = 'bonus'
              and case when r.role = 'attack' then r.goals_for >= b.threshold
                       else r.goals_against <= b.threshold end
         ), 0)::numeric as bonus_factor
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'present'
     and d.measure = 'role_goals'
     and r.role is not null
     and r.goals_for is not null
     and r.goals_against is not null
     and exists (
       select 1 from public.drill_goal_bands b
        where b.drill_id = s.drill_id and b.team_id = s.team_id
          and b.role = r.role and b.kind = 'base'
     )
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
  -- A no-show and a DNP cost the same; they are reported apart so a breakdown
  -- can say which it was.
  select s.team_id, r.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on, r.attendance
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance in ('unexcused', 'dnp')
     -- A role_goals drill charges nobody while the squad has no base bands.
     and (d.measure is distinct from 'role_goals' or exists (
       select 1 from public.drill_goal_bands b
        where b.drill_id = s.drill_id and b.team_id = s.team_id and b.kind = 'base'
     ))
),
not_entered as (
  select s.team_id, tp.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on
    from public.matrix_sessions s
    join public.drills_bank d on d.id = s.drill_id
    join public.team_players tp
      on tp.team_id = s.team_id
     and not coalesce(tp.is_deleted, false)
     and tp.created_at::date <= s.occurred_on
   where not coalesce(s.is_deleted, false)
     and not exists (
       select 1 from public.matrix_session_results r
        where r.session_id = s.id and r.player_id = tp.player_id
     )
     -- A role_goals drill charges nobody while the squad has no base bands.
     and (d.measure is distinct from 'role_goals' or exists (
       select 1 from public.drill_goal_bands b
        where b.drill_id = s.drill_id and b.team_id = s.team_id and b.kind = 'base'
     ))
)
select team_id, player_id, drill_id, exercise, occurred_on,
       'head_to_head'::text as kind, opponent_id, raw_value, detail, attendance,
       weight, weight * factor as earned, weight as available,
       w, dr, ls, 1 as exercise_count
       , null::text as role, null::integer as goals_for, null::integer as goals_against,
       null::numeric as base_factor, null::numeric as bonus_factor
  from h2h
union all
-- greatest(0.25, ...) is the participation floor: last place still beats not
-- turning up at all.
select team_id, player_id, drill_id, exercise, occurred_on,
       'measured'::text, null::uuid, raw_value, null::text, 'present'::text,
       weight, weight * greatest(0.25, 1 - pr), weight, 0, 0, 0, 1
       , null::text, null::integer, null::integer, null::numeric, null::numeric
  from ranked
union all
-- No participation floor here, deliberately. A standard that pays out for
-- missing it is not a standard; the floor exists for ranked tests so last
-- place still beats absence, which a band already expresses by scoring 0.
select team_id, player_id, drill_id, exercise, occurred_on,
       'time_band'::text, null::uuid, raw_value, null::text, 'present'::text,
       weight, weight * factor, weight, 0, 0, 0, 1
       , null::text, null::integer, null::integer, null::numeric, null::numeric
  from banded
union all
-- least(1, ...) is defence in depth: save_goal_bands already refuses a pair of
-- bands over 100%, but a row written some other way must not pay out more
-- than the exercise is worth.
select team_id, player_id, drill_id, exercise, occurred_on,
       'role_goals'::text, null::uuid, (goals_for - goals_against)::numeric, null::text, 'present'::text,
       weight, weight * least(1, base_factor + bonus_factor), weight, 0, 0, 0, 1,
       role, goals_for, goals_against, base_factor, bonus_factor
  from role_scored
union all
select team_id, player_id, drill_id, exercise, occurred_on,
       'win_loss'::text, null::uuid, null::numeric, outcome, 'present'::text,
       weight, weight * factor, weight, w, dr, ls, 1
       , null::text, null::integer, null::integer, null::numeric, null::numeric
  from win_loss
union all
select team_id, player_id, drill_id, exercise, occurred_on,
       'absent'::text, null::uuid, null::numeric, null::text, attendance,
       weight, 0, weight, 0, 0, 0, 1
       , null::text, null::integer, null::integer, null::numeric, null::numeric
  from absent
union all
select team_id, player_id, drill_id, exercise, occurred_on,
       'not_entered'::text, null::uuid, null::numeric, null::text, 'unexcused'::text,
       weight, 0, weight, 0, 0, 0, 1
       , null::text, null::integer, null::integer, null::numeric, null::numeric
  from not_entered;

grant select on public.matrix_exercise_points to anon, authenticated;

-- Restated unchanged from 0011: dropping the view above dropped this with it.
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
         order by sum(earned) desc,
                  sum(earned) / nullif(sum(available), 0) desc nulls last
       ) as rank
  from public.matrix_exercise_points
 group by team_id, player_id;

grant select on public.matrix_standings to anon, authenticated;

-- ─── Self-check ────────────────────────────────────────────────────────────

do $$
declare
  n integer;
begin
  if to_regclass('public.matrix_exercise_points') is null then
    raise exception 'matrix_exercise_points was not rebuilt';
  end if;
  if to_regclass('public.matrix_standings') is null then
    raise exception 'matrix_standings was not rebuilt';
  end if;

  select count(*) into n from public.matrix_standings;
  raise notice 'DNP installed. matrix_standings returns % row(s).', n;
end $$;

commit;

-- Verify:
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'matrix_session_results_attendance_check';   -- includes 'dnp'
--   notify pgrst, 'reload schema';
--
-- Rollback: docs/runbooks/2026-09-14-accounts-setup-runbook.md, "Undoing 0038".
