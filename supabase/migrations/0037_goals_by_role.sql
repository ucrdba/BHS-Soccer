-- 0037: Goals by role -- a sixth Matrix measure, scored per player against
-- per-squad, per-role standards on the score from their side of the game.
--
-- APPLY BEFORE DEPLOYING THE CODE THAT READS IT. The client selects the new
-- view columns, and PostgREST answers 42703 for a column that is not there,
-- which would empty the Ratings board. Applying early changes nothing for the
-- deployed app: no existing drill uses the new measure, and every existing
-- column of both views is unchanged.
--
-- Spec: docs/superpowers/specs/2026-09-14-goals-by-role-design.md
--
-- ── What is scored ────────────────────────────────────────────────────────
--
-- A player records one score for the drill from their own side: 3-1 is scored
-- 3, gave up 1. Their role for that session -- attack, defend or keeper -- is
-- stored with the result; the app pre-fills it from the roster position number
-- (src/domain/position.ts) and the coach may change it for the day.
--
--   base   the highest factor among the role's BASE bands whose threshold the
--          goal difference (scored - given up) meets or beats
--   bonus  the highest factor among the role's BONUS bands the player meets:
--          attack on goals scored (at least), defend and keeper on goals given
--          up (at most). Independent of the base -- an attacker who lost 6-7
--          still earns the bonus for scoring six.
--   earned weight x least(1, base + bonus)
--
-- "Highest factor met" rather than "tightest threshold met", so a band list
-- entered out of order still scores the way it reads.
--
-- A role with no base bands for the squad is LEFT OUT, as a squad with no time
-- bands is: scoring it 0 would drag players down because standards were not
-- set, with nothing on screen to say why. A no-show, or a rostered player
-- nobody entered, is charged 0 of the weight -- unless the squad has no base
-- bands for ANY role of the drill, when they are left out too. A player who was
-- not there has no role for the session, so the per-role rule cannot be applied
-- to them; the squad-level one keeps "unset standards cost nobody".
--
-- ── Why writes go through a function ──────────────────────────────────────
--
-- The 100% rule -- a role's best base band plus its best bonus band may not
-- exceed the whole weight -- spans rows, which a check constraint cannot see.
-- drill_goal_bands therefore has NO write policy, and save_goal_bands is the
-- only way in. A refused save raises before anything is deleted, so the old
-- standards stay in place.
--
-- ── Safe to apply twice ───────────────────────────────────────────────────
--
-- Constraints are dropped before they are added, the table and columns use
-- IF NOT EXISTS, the function is CREATE OR REPLACE and the views are rebuilt.

begin;

set role postgres;

-- ─── The new measure ───────────────────────────────────────────────────────

alter table public.drills_bank drop constraint if exists drills_bank_measure_check;
alter table public.drills_bank add constraint drills_bank_measure_check
  check (measure in ('head_to_head', 'win_loss', 'count_high', 'time_low', 'time_bands', 'role_goals'));

-- ─── The result ────────────────────────────────────────────────────────────
--
-- Null for every other measure. A database check cannot know a result's
-- measure (it lives on the drill), so "a present Goals-by-role result has all
-- three" is enforced by saveMatrixSession and the sheet. A present row missing
-- any of them is simply not scored -- which is also what happens to results
-- recorded before a drill was switched to this measure.

alter table public.matrix_session_results
  add column if not exists role          text,
  add column if not exists goals_for     integer,
  add column if not exists goals_against integer;

alter table public.matrix_session_results drop constraint if exists matrix_session_results_role_check;
alter table public.matrix_session_results add constraint matrix_session_results_role_check
  check (role is null or role in ('attack', 'defend', 'keeper'));

alter table public.matrix_session_results drop constraint if exists matrix_session_results_goals_for_check;
alter table public.matrix_session_results add constraint matrix_session_results_goals_for_check
  check (goals_for is null or goals_for between 0 and 99);

alter table public.matrix_session_results drop constraint if exists matrix_session_results_goals_against_check;
alter table public.matrix_session_results add constraint matrix_session_results_goals_against_check
  check (goals_against is null or goals_against between 0 and 99);

-- ─── The standards ─────────────────────────────────────────────────────────
--
-- Per squad, per drill, per role, per kind. Varsity and U14 can hold the same
-- drill to different standards, for the reason 0022 gives for time bands.

create table if not exists public.drill_goal_bands (
  id         uuid primary key default gen_random_uuid(),
  drill_id   uuid not null references public.drills_bank(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  role       text not null check (role in ('attack', 'defend', 'keeper')),
  kind       text not null check (kind in ('base', 'bonus')),
  threshold  integer not null,
  factor     numeric(4,3) not null check (factor >= 0 and factor <= 1),
  created_at timestamptz not null default now(),
  unique (drill_id, team_id, role, kind, threshold)
);

alter table public.drill_goal_bands enable row level security;

drop policy if exists "drill_goal_bands_select" on public.drill_goal_bands;
create policy "drill_goal_bands_select" on public.drill_goal_bands
  for select using (true);

-- Read for everyone, like drill_time_bands. No insert, update or delete policy
-- and no write grant: see "Why writes go through a function" above.
revoke all on table public.drill_goal_bands from anon, authenticated;
grant select on table public.drill_goal_bands to anon, authenticated;

-- ─── Saving standards ──────────────────────────────────────────────────────
--
-- Replaces one role's bands for one squad on one drill. p_bands is a JSON
-- array of { "kind": "base" | "bonus", "threshold": int, "factor": 0..1 }.
-- Every refusal is a sentence the app shows as it is.

create or replace function public.save_goal_bands(
  p_drill_id uuid, p_team_id uuid, p_role text, p_bands jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_measure   text;
  v_band      jsonb;
  v_factor    numeric;
  v_dup       record;
  v_max_base  numeric;
  v_max_bonus numeric;
begin
  -- Fail closed. A signed-in caller with no profile makes is_team_coach()
  -- return NULL, and a NULL condition skips the raise instead of tripping it.
  -- is_team_coach() is true for an admin on any team.
  if not coalesce(public.is_team_coach(p_team_id), false) then
    raise exception 'Only a coach of this team can set its standards.';
  end if;

  if coalesce(p_role, '') not in ('attack', 'defend', 'keeper') then
    raise exception 'Standards are set for Attack, Defence or Goalkeeper.';
  end if;

  select d.measure into v_measure
    from public.drills_bank d
   where d.id = p_drill_id and not coalesce(d.is_deleted, false);
  if not found then
    raise exception 'That exercise does not exist.';
  end if;
  if v_measure is distinct from 'role_goals' then
    raise exception 'That exercise is not measured as Goals by role. Save its measure first.';
  end if;

  if p_bands is null or jsonb_typeof(p_bands) <> 'array' then
    raise exception 'The standards must be sent as a list.';
  end if;

  for v_band in select value from jsonb_array_elements(p_bands) loop
    if coalesce(v_band->>'kind', '') not in ('base', 'bonus') then
      raise exception 'Each standard is a goal-difference band or a bonus band.';
    end if;
    -- coalesce: a missing key gives jsonb_typeof NULL, and NULL <> 'number'
    -- is NULL, which would skip the raise.
    if coalesce(jsonb_typeof(v_band->'threshold'), '') <> 'number'
       or (v_band->>'threshold') !~ '^-?[0-9]{1,4}$' then
      raise exception 'A threshold must be a whole number (found %).', coalesce(v_band->>'threshold', 'nothing');
    end if;
    if coalesce(jsonb_typeof(v_band->'factor'), '') <> 'number' then
      raise exception 'Each standard needs a percentage.';
    end if;
    v_factor := (v_band->>'factor')::numeric;
    if v_factor < 0 or v_factor > 1 then
      raise exception '%', format('A percentage must be between 0 and 100 (found %s).', (v_factor * 100)::float8);
    end if;
  end loop;

  select e->>'kind' as kind, (e->>'threshold')::integer as threshold
    into v_dup
    from jsonb_array_elements(p_bands) e
   group by 1, 2
  having count(*) > 1
   limit 1;
  if found then
    raise exception '%', format(
      'Two %s bands share the threshold %s. Two bands at one threshold cannot both apply.',
      case v_dup.kind when 'base' then 'goal-difference' else 'bonus' end, v_dup.threshold);
  end if;

  -- Checked on the values as they will be stored (numeric(4,3)).
  select coalesce(max(round((e->>'factor')::numeric, 3)) filter (where e->>'kind' = 'base'), 0),
         coalesce(max(round((e->>'factor')::numeric, 3)) filter (where e->>'kind' = 'bonus'), 0)
    into v_max_base, v_max_bonus
    from jsonb_array_elements(p_bands) e;
  if v_max_base + v_max_bonus > 1 then
    raise exception '%', format(
      'The top goal-difference band (%s%%) and the top bonus band (%s%%) add up to more than 100%% of the weight. Lower one of them.',
      (v_max_base * 100)::float8, (v_max_bonus * 100)::float8);
  end if;

  delete from public.drill_goal_bands
   where drill_id = p_drill_id and team_id = p_team_id and role = p_role;

  insert into public.drill_goal_bands (drill_id, team_id, role, kind, threshold, factor)
  select p_drill_id, p_team_id, p_role, e->>'kind', (e->>'threshold')::integer,
         round((e->>'factor')::numeric, 3)
    from jsonb_array_elements(p_bands) e;
end;
$$;

revoke all on function public.save_goal_bands(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_goal_bands(uuid, uuid, text, jsonb) to authenticated;

-- ─── Scoring ───────────────────────────────────────────────────────────────
-- Rebuilt from 0022 with one CTE and one branch added, five nullable columns on every branch, and the role_goals exclusion in absent and not_entered. Everything else is unchanged.

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
  select s.team_id, r.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'unexcused'
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
       'absent'::text, null::uuid, null::numeric, null::text, 'unexcused'::text,
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
  if to_regclass('public.drill_goal_bands') is null then
    raise exception 'drill_goal_bands was not created';
  end if;
  if to_regprocedure('public.save_goal_bands(uuid,uuid,text,jsonb)') is null then
    raise exception 'save_goal_bands was not created';
  end if;
  -- Dropping the views above and failing to rebuild them would leave the
  -- standings page empty with no error anywhere.
  if to_regclass('public.matrix_exercise_points') is null then
    raise exception 'matrix_exercise_points was not rebuilt';
  end if;
  if to_regclass('public.matrix_standings') is null then
    raise exception 'matrix_standings was not rebuilt';
  end if;

  select count(*) into n from public.matrix_standings;
  raise notice 'Goals by role installed. matrix_standings returns % row(s).', n;
end $$;

commit;

-- Verify:
--   select column_name from information_schema.columns
--    where table_name = 'matrix_exercise_points'
--      and column_name in ('role','goals_for','goals_against','base_factor','bonus_factor');  -- 5 rows
--   select to_regprocedure('public.save_goal_bands(uuid,uuid,text,jsonb)');                 -- not null
--   notify pgrst, 'reload schema';
--
-- Rollback: docs/runbooks/2026-09-14-accounts-setup-runbook.md, "Undoing 0037".
