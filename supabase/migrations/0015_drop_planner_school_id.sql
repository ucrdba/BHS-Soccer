-- supabase/migrations/0015_drop_planner_school_id.sql
--
-- Carries TWO changes: the team-scoped RLS policy swap, and the school_id
-- column drop.
--
-- APPLY ONLY AFTER THE CODE FROM 0014's DEPLOY IS LIVE. Both halves depend on
-- it. Until the deploy, deployed code still reads practice_plans.school_id and
-- daily_thoughts.school_id, and still writes planner rows with team_id NULL --
-- against the policies below, a plain coach's save would be silently refused
-- and an admin's would land with a null team.
--
-- Splitting these out of 0014 is the whole point: 0005 dropped school_id in
-- the same migration that added team_id, which left a window where deployed
-- code queried a column that no longer existed. One extra file removes it.
-- The policy swap started life in 0014 and moved here for the same reason,
-- in the other direction -- see 0014's header.
--
-- Delaying the column drop indefinitely is harmless; the only cost of leaving
-- school_id in place is a redundant column. Delaying the policy swap is not
-- free: until it runs, any coach can write any team's planner rows, which is
-- today's behaviour but not the intended one.

begin;

set role postgres;

-- Refuse if the backfill never completed: dropping school_id would then
-- destroy the only remaining clue about where those rows belong.
do $$
declare
  stranded integer;
begin
  select count(*) into stranded from public.practice_plans
   where team_id is null and not coalesce(is_deleted, false);
  if stranded > 0 then
    raise exception
      '% practice_plans rows still have no team. Assign them before dropping school_id, or their origin is lost.', stranded;
  end if;
end $$;

-- Same reasoning, same guard, for daily_thoughts -- a separate check with its
-- own count and its own message, so a failure here does not send the human
-- looking at practice_plans instead.
do $$
declare
  stranded integer;
begin
  select count(*) into stranded from public.daily_thoughts
   where team_id is null and not coalesce(is_deleted, false);
  if stranded > 0 then
    raise exception
      '% daily_thoughts rows still have no team. Assign them before dropping school_id, or their origin is lost.', stranded;
  end if;
end $$;

-- ─── RLS ───────────────────────────────────────────────────────────────────
-- Moved here from 0014. These tables are in the uniform policy loop in
-- supabase_migration_auth.sql section 6, which grants any coach write access
-- to any row. Replaced here with team-scoped policies: this is the first time
-- the planner has had per-team write control.
--
-- It runs in this file, after the deploy, because is_team_coach(null) is false
-- for a plain coach and true for an admin -- so applying it while deployed
-- code still writes team_id NULL silently refuses one and mis-files the other.
--
-- Ordered before the column drop only for readability; both are in the same
-- transaction, so they land together.
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

-- ─── Drop the redundant column ─────────────────────────────────────────────

alter table public.practice_plans drop column if exists school_id;
alter table public.daily_thoughts drop column if exists school_id;

commit;

-- Verify:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name in ('practice_plans','daily_thoughts')
--   order by table_name, column_name;

-- Rollback:
--   drop policy if exists "practice_plans_write" on public.practice_plans;
--   drop policy if exists "practice_plans_select" on public.practice_plans;
--   drop policy if exists "daily_thoughts_write" on public.daily_thoughts;
--   drop policy if exists "daily_thoughts_select" on public.daily_thoughts;
--   -- then re-run supabase_migration_auth.sql section 6 to restore the
--   -- uniform coach/admin policies on both tables.
--   alter table public.practice_plans add column school_id uuid references public.schools(id);
--   alter table public.daily_thoughts add column school_id uuid references public.schools(id);
--   update public.practice_plans p set school_id = t.school_id
--     from public.teams t where t.id = p.team_id;
--   update public.daily_thoughts d set school_id = t.school_id
--     from public.teams t where t.id = d.team_id;
--   -- The values are recoverable from the team, so this rollback is complete.
