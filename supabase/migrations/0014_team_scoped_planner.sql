-- supabase/migrations/0014_team_scoped_planner.sql
--
-- Team-scoped practice planner. See
-- docs/superpowers/specs/2026-09-01-team-scoped-planner-design.md
--
-- SAFE TO APPLY BEFORE THE CODE DEPLOYS, for reads AND for writes. school_id
-- is left in place, so currently-deployed code keeps working unchanged. 0015
-- drops it afterwards. This is deliberately the opposite of what 0005 did:
-- dropping in the same migration that adds leaves a window where deployed code
-- queries a column that no longer exists.
--
-- PER-TEAM WRITE CONTROL ARRIVES WITH 0015, NOT HERE. The team-scoped RLS
-- policies used to live in this file, and that reintroduced exactly the window
-- this split exists to remove -- in the other direction. Deployed code at this
-- moment writes team_id NULL; is_team_coach(null) is false for a plain coach
-- (their save is silently refused) but TRUE for an admin (whose save lands with
-- a null team, vanishes once the new code deploys, and then trips 0015's
-- stranded-row guard). So the policy swap moved to 0015, which runs after the
-- deploy. During the window the planner keeps the permissive policies it has
-- today -- any coach may write any team's planner rows. That is the current
-- production behaviour, not a new exposure, and it ends when 0015 runs.
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
   and t.is_public_default
   and not coalesce(t.is_deleted, false);

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
-- Deliberately NOT here. The team-scoped policy swap lives in 0015 -- see the
-- header for why applying it before the deploy loses an admin's writes.

-- ─── school_id must tolerate being omitted ─────────────────────────────────
-- From the deploy until 0015 runs, the new code writes planner rows with
-- team_id and no school_id at all. If either column is NOT NULL, every one of
-- those writes fails. supabase_schema.sql cannot answer whether they are (it
-- lists columns, not nullability, and has known drift from the live database),
-- and this migration is written without database access -- so rather than
-- assume, make the question moot. A no-op when the column is already nullable,
-- a fix when it is not. 0015 drops both columns anyway.

alter table public.practice_plans alter column school_id drop not null;
alter table public.daily_thoughts  alter column school_id drop not null;

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

  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'daily_thoughts' and column_name = 'school_id';
  if has_col <> 1 then
    raise exception 'school_id was dropped from daily_thoughts by 0014; deployed code still needs it. That belongs in 0015.';
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
--   alter table public.practice_plans drop column if exists team_id;
--   alter table public.daily_thoughts drop column if exists team_id;
--   -- No policy rollback needed: this migration no longer touches RLS. The
--   -- `drop not null` on school_id is not reversed -- re-imposing NOT NULL
--   -- would fail on any row written without one, and the column is dropped
--   -- by 0015 regardless.
