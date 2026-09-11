-- 0032: three columns production has that no migration creates
--
-- Production was changed by hand at some point and the change was never
-- written down as a migration. A database built from supabase/migrations/ --
-- the demo, rebuilt every night, or the test harness -- therefore lacks these
-- columns, and the app breaks there in ways it does not on production:
--
--   practice_plans.drill              The drill's name in a plan slot. The planner
--                                     writes it on every save (toPlanRows) and reads
--                                     it back (groupPracticePlans). Without it every
--                                     save fails with 42703.
--   soccer_categories.display_order   Present on production; unread by today's
--   soccer_categories.active          app. Recorded so the two databases match.
--
-- Found on 2026-09-11 by reading one production row per publicly readable
-- table and comparing its keys with a database built from the migrations. The
-- types are the ones those values imply. On production every statement below
-- is a no-op, so this is safe to apply there, and safe to run twice.

begin;

set role postgres;

alter table public.practice_plans    add column if not exists drill         text;
alter table public.soccer_categories add column if not exists display_order integer;
alter table public.soccer_categories add column if not exists active        boolean default true;

commit;
