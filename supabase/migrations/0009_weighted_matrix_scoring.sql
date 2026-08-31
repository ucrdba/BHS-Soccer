-- supabase/migrations/0009_weighted_matrix_scoring.sql
--
-- Weighted matrix scoring. See
-- docs/superpowers/specs/2026-08-31-weighted-matrix-scoring-design.md
--
-- APPLY THIS BEFORE DEPLOYING THE MATCHING CODE. The new code writes the
-- `measure` column and the two tables below; against a database without them
-- those writes are hard 400s that break drill saving and session recording.
-- Applying first only costs a brief window where the standings read zeros,
-- because the deployed mapping is still looking for the old column names.

begin;

-- ─── 1. Weight and measure on the drill ────────────────────────────────────
-- points already exists as INT and is already edited in the drills library.
-- INT cannot hold 2.5, which is the whole point of the widening.

alter table public.drills_bank
  alter column points type numeric(3,1) using points::numeric(3,1);

alter table public.drills_bank
  add column if not exists measure text not null default 'head_to_head'
  check (measure in ('head_to_head', 'win_loss', 'count_high', 'time_low'));

-- ─── 2. Sessions ───────────────────────────────────────────────────────────
-- drill_id is NOT NULL and ON DELETE RESTRICT: a session with no drill has no
-- weight and no measure, so it cannot be scored, and deleting a drill out from
-- under recorded results would silently change the standings.

create table if not exists public.matrix_sessions (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  drill_id    uuid not null references public.drills_bank(id) on delete restrict,
  occurred_on date not null,
  notes       text,
  is_deleted  boolean default false,
  created_at  timestamptz default now()
);

-- The composite primary key is what stops a player being entered twice in one
-- session, which would count them twice in both numerator and denominator.
create table if not exists public.matrix_session_results (
  session_id uuid not null references public.matrix_sessions(id) on delete cascade,
  player_id  uuid not null references public.players(id) on delete cascade,
  attendance text not null default 'present'
             check (attendance in ('present', 'excused', 'unexcused')),
  raw_value  numeric,
  outcome    text check (outcome in ('win', 'draw', 'loss')),
  primary key (session_id, player_id)
);

create index if not exists matrix_sessions_team_date
  on public.matrix_sessions (team_id, occurred_on desc)
  where not coalesce(is_deleted, false);

-- ─── 3. RLS: public read, team-coach write ─────────────────────────────────

alter table public.matrix_sessions        enable row level security;
alter table public.matrix_session_results enable row level security;

grant select
  on public.matrix_sessions, public.matrix_session_results
  to anon, authenticated;

grant insert, update, delete
  on public.matrix_sessions, public.matrix_session_results
  to authenticated;

drop policy if exists "matrix_sessions_select" on public.matrix_sessions;
create policy "matrix_sessions_select" on public.matrix_sessions
  for select using (not coalesce(is_deleted, false));

drop policy if exists "matrix_sessions_write" on public.matrix_sessions;
create policy "matrix_sessions_write" on public.matrix_sessions
  for all using (public.is_team_coach(team_id))
  with check (public.is_team_coach(team_id));

-- Results carry no team_id of their own; they reach the team through the
-- session, so both USING and WITH CHECK go through that join.
drop policy if exists "matrix_session_results_select" on public.matrix_session_results;
create policy "matrix_session_results_select" on public.matrix_session_results
  for select using (true);

drop policy if exists "matrix_session_results_write" on public.matrix_session_results;
create policy "matrix_session_results_write" on public.matrix_session_results
  for all using (
    exists (select 1 from public.matrix_sessions s
             where s.id = session_id and public.is_team_coach(s.team_id))
  )
  with check (
    exists (select 1 from public.matrix_sessions s
             where s.id = session_id and public.is_team_coach(s.team_id))
  );

-- ─── 3b. drills_bank read consistency for the standings view ───────────────
--
-- matrix_standings (section 4 below) joins drills_bank under
-- security_invoker = true so that RLS on matrix_logs/matrix_sessions is
-- correctly evaluated as the calling user. But drills_bank has TWO
-- permissive select policies from supabase_migration_auth.sql section 6 —
-- "drills_bank_select" (coalesce(is_deleted, false) = false) for everyone,
-- and "drills_bank_write" (for all, coach/admin only) which also grants
-- coaches select. Postgres OR's permissive policies together, so a coach
-- can select soft-deleted rows and a player cannot. Joined into a
-- security_invoker view, that means the drill's weight (and therefore the
-- player's share) becomes reader-dependent: once a coach retires a drill
-- that already has recorded results, players lose those sessions from the
-- join and get scored at the coalesce(...,1.0) fallback weight while the
-- coach still sees the drill's real weight. Same standings must mean the
-- same numbers for everyone who looks at them, so the select policy is
-- widened to `true` here.
--
-- This exposes soft-deleted drills' columns (name, category, coach_notes)
-- to anon/authenticated select. That is not a new exposure in practice:
-- those same columns are already anon-readable on every non-deleted drill
-- today via this same policy family — only the is_deleted=false rows they
-- could see before now includes is_deleted=true rows too. Reversible by
-- re-running the coalesce(is_deleted, false) = false definition from
-- supabase_migration_auth.sql section 6.
drop policy if exists "drills_bank_select" on public.drills_bank;
create policy "drills_bank_select" on public.drills_bank for select using (true);

-- ─── 4. matrix_standings, rewritten ────────────────────────────────────────
--
-- Replaces the win-3/draw-1/loss-0 derivation from 0003 and 0005 section 10.
-- Every exercise contributes `earned` and `available`; available is always the
-- drill's weight, and the best result earns all of it.
--
-- security_invoker = true is REQUIRED. Without it the view runs as its owner
-- and bypasses RLS on matrix_logs and the session tables.

drop view if exists public.matrix_standings;

create view public.matrix_standings with (security_invoker = true) as
with h2h as (
  -- Each side of each logged 1v1 pairing. A pairing with no drill scores at
  -- weight 1.0: drill_id is nullable and the record modal offers "— none —",
  -- so refusing those would break a form that works today.
  --
  -- Deliberately, unlike 0005 section 10, there is no `and team_id is not
  -- null` filter here: this view is already grouped by team_id, so a null
  -- team_id row groups harmlessly on its own and is simply never selected
  -- against a real team.
  select l.team_id,
         l.player_a_id as player_id,
         coalesce(d.points, 1.0) as weight,
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
         coalesce(d.points, 1.0),
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
  select s.team_id,
         r.player_id,
         d.points as weight,
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
  select s.team_id,
         r.player_id,
         d.points as weight,
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
  -- denominator, so it is simply not selected here.
  select s.team_id, r.player_id, d.points as weight
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'unexcused'
),
parts as (
  select team_id, player_id, weight * factor as earned, weight as available,
         w, dr, ls, 1 as exercise
    from h2h
  union all
  -- greatest(0.25, ...) is the participation floor: last place still beats a
  -- no-show, without which the excused/unexcused distinction is meaningless.
  select team_id, player_id, weight * greatest(0.25, 1 - pr), weight,
         0, 0, 0, 1
    from ranked
  union all
  select team_id, player_id, weight * factor, weight, w, dr, ls, 1
    from win_loss
  union all
  select team_id, player_id, 0, weight, 0, 0, 0, 1
    from absent
)
select team_id,
       player_id,
       sum(w)                          as wins,
       sum(dr)                         as draws,
       sum(ls)                         as losses,
       sum(w) + sum(dr) + sum(ls)      as games,
       sum(exercise)                   as exercises,
       round(sum(earned)::numeric, 3)  as earned,
       round(sum(available)::numeric, 3) as available,
       round(100.0 * sum(earned) / nullif(sum(available), 0), 1) as share,
       rank() over (
         partition by team_id
         order by sum(earned) / nullif(sum(available), 0) desc nulls last,
                  sum(earned) desc
       ) as rank
  from parts
 group by team_id, player_id;

grant select on public.matrix_standings to anon, authenticated;

-- ─── 5. Self-check ─────────────────────────────────────────────────────────
--
-- Inserts the spec's worked example, asserts the three shares, and deletes the
-- fixture. Fixed UUIDs so the cleanup is exact. If this raises, the view is
-- wrong — do not ignore it.

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

  insert into public.drills_bank (id, school_id, name, duration, category, points, measure) values
    (d_cooper, fx_school, 'SelfCheck Coopers', '12 min', 'Fitness',  1.5, 'count_high'),
    (d_1v1,    fx_school, 'SelfCheck 1v1',     '20 min', 'Technical', 3.0, 'head_to_head'),
    (d_ssg,    fx_school, 'SelfCheck SSG',     '20 min', 'Tactical',  2.5, 'win_loss');

  -- 1v1: Cesar beats Caleb; Dylan draws with... nobody available, so Dylan's
  -- draw is against Caleb. Caleb therefore has two pairings, which the
  -- expected numbers below account for.
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

  -- Cesar: coopers 1.500/1.500 + 1v1 3.000/3.000 + ssg 2.500/2.500
  --        = 7.000 / 7.000 = 100.0
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

  -- Caleb: coopers 0.750/1.500 + 1v1 loss 0.000/3.000 + 1v1 draw 1.500/3.000
  --        + ssg 2.500/2.500 = 4.750 / 10.000 = 47.5
  -- Two pairings, so his available is 10.000 rather than 7.000.
  select share into got from public.matrix_standings
   where team_id = fx_team and player_id = p_caleb;
  if got is distinct from 47.5 then
    raise exception 'self-check: Caleb expected 47.5, got %', got;
  end if;

  raise notice 'matrix_standings self-check passed.';

  delete from public.matrix_session_results where session_id in (s_cooper, s_ssg);
  delete from public.matrix_sessions where id in (s_cooper, s_ssg);
  delete from public.matrix_logs where team_id = fx_team;
  delete from public.drills_bank where id in (d_cooper, d_1v1, d_ssg);
  delete from public.players where id in (p_cesar, p_caleb, p_dylan);
  delete from public.teams where id = fx_team;
  delete from public.schools where id = fx_school;
end $$;

commit;

-- Rollback:
--   drop view if exists public.matrix_standings;
--   drop table if exists public.matrix_session_results;
--   drop table if exists public.matrix_sessions;
--   alter table public.drills_bank drop column if exists measure;
--   alter table public.drills_bank alter column points type integer using round(points);
--   -- then re-run the matrix_standings definition from
--   -- supabase/migrations/0005_multi_team_schema.sql section 10.
--
-- Note: reverting points to integer rounds 2.5 to 2. Record any custom weights
-- before rolling back.
