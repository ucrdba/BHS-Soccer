-- supabase/migrations/0015_drop_planner_school_id.sql
--
-- APPLY ONLY AFTER THE CODE FROM 0014's DEPLOY IS LIVE. Until then, deployed
-- code still reads practice_plans.school_id and daily_thoughts.school_id.
--
-- Splitting the drop out of 0014 is the whole point: 0005 dropped school_id in
-- the same migration that added team_id, which left a window where deployed
-- code queried a column that no longer existed. One extra file removes it.
--
-- Delaying this indefinitely is harmless. The only cost of leaving school_id
-- in place is a redundant column.

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

alter table public.practice_plans drop column if exists school_id;
alter table public.daily_thoughts drop column if exists school_id;

commit;

-- Verify:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name in ('practice_plans','daily_thoughts')
--   order by table_name, column_name;

-- Rollback:
--   alter table public.practice_plans add column school_id uuid references public.schools(id);
--   alter table public.daily_thoughts add column school_id uuid references public.schools(id);
--   update public.practice_plans p set school_id = t.school_id
--     from public.teams t where t.id = p.team_id;
--   update public.daily_thoughts d set school_id = t.school_id
--     from public.teams t where t.id = d.team_id;
--   -- The values are recoverable from the team, so this rollback is complete.
