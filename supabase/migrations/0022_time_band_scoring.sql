-- 0022: score a timed run against absolute standards, per team
--
-- APPLY BEFORE DEPLOYING THE CODE THAT READS IT. The view change is
-- self-contained and the new table is additive, so applying early changes
-- nothing for deployed code: no existing drill uses the new measure, so no
-- existing result is scored differently.
--
-- ── Why a fifth measure ───────────────────────────────────────────────────
--
-- `time_low` already scores a timed exercise, but RELATIVELY: percent_rank
-- within the session, so the fastest gets full credit and everyone else is
-- scaled by where they finished. That is right for a Cooper test, where the
-- question is who ran furthest.
--
-- It is wrong for a standard. "Three laps in 4:30 earns the point" means what
-- it says: hit it and you score, whether six team-mates beat you or nobody did.
-- Under percent_rank a squad that all ran 4:25 would still be spread from full
-- marks to the 0.25 participation floor, which is the opposite of the intent.
--
-- ── Bands are per TEAM, not per drill alone ───────────────────────────────
--
-- A 4:30 standard that stretches a varsity side is out of reach for an
-- under-14. The same drill therefore carries different thresholds for
-- different squads, which is the same reasoning that made practice plans and
-- daily messages team-scoped in 0014.
--
-- A band's `factor` multiplies the drill's WEIGHT, exactly as every other
-- measure does. So on a drill weighted 1.5, factor 1.0 earns 1.5 and factor
-- 0.25 earns 0.375. The weighting the coach set up still decides how much the
-- exercise is worth; the band decides how much of it was earned.

begin;

set role postgres;

-- ─── The new measure ───────────────────────────────────────────────────────

alter table public.drills_bank drop constraint if exists drills_bank_measure_check;
alter table public.drills_bank add constraint drills_bank_measure_check
  check (measure in ('head_to_head', 'win_loss', 'count_high', 'time_low', 'time_bands'));

-- ─── The standards ─────────────────────────────────────────────────────────
--
-- One row per band. Three bands is what the coach described, but nothing here
-- assumes three -- adding a fourth is a row, not a migration.
--
-- max_seconds rather than a text time: raw_value is numeric, and comparing
-- "4:30" as text would order 10:00 before 4:30. The UI converts.

create table if not exists public.drill_time_bands (
  id          uuid primary key default gen_random_uuid(),
  drill_id    uuid not null references public.drills_bank(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  max_seconds integer not null check (max_seconds > 0),
  factor      numeric not null check (factor >= 0 and factor <= 1),
  created_at  timestamptz not null default now()
);

-- Two bands at the same threshold for one squad would make the score
-- ambiguous, which is the one thing a standard must not be.
create unique index if not exists drill_time_bands_unique
  on public.drill_time_bands (drill_id, team_id, max_seconds);

create index if not exists drill_time_bands_lookup
  on public.drill_time_bands (drill_id, team_id, max_seconds);

alter table public.drill_time_bands enable row level security;

drop policy if exists "drill_time_bands_select" on public.drill_time_bands;
create policy "drill_time_bands_select" on public.drill_time_bands
  for select using (true);

-- Team-scoped writes: a coach sets standards for the squads they coach.
drop policy if exists "drill_time_bands_write" on public.drill_time_bands;
create policy "drill_time_bands_write" on public.drill_time_bands
  for all using (public.is_team_coach(team_id))
  with check (public.is_team_coach(team_id));

grant select, insert, update, delete on table public.drill_time_bands to anon, authenticated;

-- ─── Scoring ───────────────────────────────────────────────────────────────
-- Rebuilt from 0011 with one CTE added. Everything else is unchanged; the
-- whole view is restated because Postgres cannot alter a view's body in place.

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
-- No participation floor here, deliberately. A standard that pays out for
-- missing it is not a standard; the floor exists for ranked tests so last
-- place still beats absence, which a band already expresses by scoring 0.
select team_id, player_id, drill_id, exercise, occurred_on,
       'time_band'::text, null::uuid, raw_value, null::text, 'present'::text,
       weight, weight * factor, weight, 0, 0, 0, 1
  from banded
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
  if to_regclass('public.drill_time_bands') is null then
    raise exception 'drill_time_bands was not created';
  end if;

  -- Both views must exist: dropping them above and failing to rebuild would
  -- leave the standings page empty with no error anywhere.
  if to_regclass('public.matrix_exercise_points') is null then
    raise exception 'matrix_exercise_points was not rebuilt';
  end if;
  if to_regclass('public.matrix_standings') is null then
    raise exception 'matrix_standings was not rebuilt';
  end if;

  -- The new measure must be accepted by the constraint.
  begin
    perform 1 from public.drills_bank where measure = 'time_bands';
  exception when others then
    raise exception 'the measure constraint does not accept time_bands';
  end;

  select count(*) into n from public.matrix_standings;
  raise notice 'Time-band scoring installed. matrix_standings returns % row(s).', n;
end $$;

commit;

-- Verify — set a drill to the new measure, give a team three bands, and check
-- what a time earns:
--   select p.name, e.raw_value, e.weight, e.earned
--     from public.matrix_exercise_points e
--     join public.players p on p.id = e.player_id
--    where e.kind = 'time_band'
--    order by e.raw_value;

-- Rollback — restores 0011's view exactly and drops the table:
--   drop view if exists public.matrix_standings;
--   drop view if exists public.matrix_exercise_points;
--   -- then re-run the two create view statements from
--   -- 0011_rank_on_points.sql, which are unchanged apart from the banded CTE.
--   drop table if exists public.drill_time_bands;
--   alter table public.drills_bank drop constraint if exists drills_bank_measure_check;
--   alter table public.drills_bank add constraint drills_bank_measure_check
--     check (measure in ('head_to_head', 'win_loss', 'count_high', 'time_low'));
