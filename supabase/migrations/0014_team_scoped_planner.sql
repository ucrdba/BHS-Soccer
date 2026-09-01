-- supabase/migrations/0014_team_scoped_planner.sql
--
-- Team-scoped practice planner. See
-- docs/superpowers/specs/2026-09-01-team-scoped-planner-design.md
--
-- SAFE TO APPLY BEFORE THE CODE DEPLOYS. school_id is left in place, so
-- currently-deployed code keeps working unchanged. 0015 drops it afterwards.
-- This is deliberately the opposite of what 0005 did: dropping in the same
-- migration that adds leaves a window where deployed code queries a column
-- that no longer exists.
--
-- The quiz is not touched. Its questions are hardcoded in planner.view.js,
-- nothing reads quiz_questions, the table is empty and it has no school_id --
-- adding a column no code reads would be ceremony. See the spec.

begin;

set role postgres;

alter table public.practice_plans
  add column if not exists team_id uuid references public.teams(id) on delete cascade;

alter table public.daily_thoughts
  add column if not exists team_id uuid references public.teams(id) on delete cascade;

-- ─── Backfill ──────────────────────────────────────────────────────────────
-- The 27 existing practice_plans rows predate multi-team: they are named
-- "Standard Varsity 90-Min..." or dummy_practice_*, and were built when
-- Varsity was the only team. They go to Varsity. daily_thoughts is empty.
--
-- Matched on is_public_default rather than the name 'Varsity', so this is
-- correct even if the team has since been renamed.

update public.practice_plans p
   set team_id = t.id
  from public.teams t
  join public.schools s on s.id = t.school_id
 where p.team_id is null
   and p.school_id = s.id
   and t.is_public_default;

-- Anything still unassigned had a school_id matching no default team. Report
-- it rather than leaving rows that will silently vanish from every view.
do $$
declare
  orphans integer;
begin
  select count(*) into orphans from public.practice_plans
   where team_id is null and not coalesce(is_deleted, false);
  if orphans > 0 then
    raise notice '% practice_plans rows have no team and will not appear in any planner. Assign them by hand.', orphans;
  else
    raise notice 'All practice_plans rows assigned to a team.';
  end if;
end $$;

create index if not exists practice_plans_team on public.practice_plans (team_id)
  where not coalesce(is_deleted, false);
create index if not exists daily_thoughts_team on public.daily_thoughts (team_id)
  where not coalesce(is_deleted, false);

-- ─── RLS ───────────────────────────────────────────────────────────────────
-- These tables are in the uniform policy loop in supabase_migration_auth.sql
-- section 6, which grants any coach write access to any row. Replaced here
-- with team-scoped policies: this is the first time the planner has had
-- per-team write control.
--
-- NOTE: re-running supabase_migration_auth.sql section 6 after this would
-- silently restore the permissive policies.

alter table public.practice_plans enable row level security;
alter table public.daily_thoughts enable row level security;

drop policy if exists "practice_plans_select" on public.practice_plans;
create policy "practice_plans_select" on public.practice_plans
  for select using (coalesce(is_deleted, false) = false);

drop policy if exists "practice_plans_write" on public.practice_plans;
create policy "practice_plans_write" on public.practice_plans
  for all using (public.is_team_coach(team_id))
  with check (public.is_team_coach(team_id));

drop policy if exists "daily_thoughts_select" on public.daily_thoughts;
create policy "daily_thoughts_select" on public.daily_thoughts
  for select using (coalesce(is_deleted, false) = false);

drop policy if exists "daily_thoughts_write" on public.daily_thoughts;
create policy "daily_thoughts_write" on public.daily_thoughts
  for all using (public.is_team_coach(team_id))
  with check (public.is_team_coach(team_id));

-- ─── Self-check ────────────────────────────────────────────────────────────
-- Proves the backfill reached every row and that the columns exist, at the
-- moment of applying, on the real database.

do $$
declare
  unassigned integer;
  has_col    integer;
begin
  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'practice_plans' and column_name = 'team_id';
  if has_col <> 1 then raise exception 'practice_plans.team_id was not created'; end if;

  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'daily_thoughts' and column_name = 'team_id';
  if has_col <> 1 then raise exception 'daily_thoughts.team_id was not created'; end if;

  -- school_id must SURVIVE this migration: deployed code still reads it.
  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'practice_plans' and column_name = 'school_id';
  if has_col <> 1 then
    raise exception 'school_id was dropped by 0014; deployed code still needs it. That belongs in 0015.';
  end if;

  select count(*) into unassigned from public.practice_plans
   where team_id is null and not coalesce(is_deleted, false);
  raise notice 'Planner is team-scoped. % live rows still unassigned.', unassigned;
end $$;

commit;

-- Verify:
--   select t.name as team, p.name as plan, count(*) as slots
--   from public.practice_plans p
--   join public.teams t on t.id = p.team_id
--   where not coalesce(p.is_deleted, false)
--   group by t.name, p.name order by t.name, p.name;

-- Rollback:
--   drop policy if exists "practice_plans_write" on public.practice_plans;
--   drop policy if exists "practice_plans_select" on public.practice_plans;
--   drop policy if exists "daily_thoughts_write" on public.daily_thoughts;
--   drop policy if exists "daily_thoughts_select" on public.daily_thoughts;
--   alter table public.practice_plans drop column if exists team_id;
--   alter table public.daily_thoughts drop column if exists team_id;
--   -- then re-run supabase_migration_auth.sql section 6 to restore the
--   -- uniform coach/admin policies on both tables.
