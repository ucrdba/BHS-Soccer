-- 0033: a drill's name belongs to an organization, not to the whole table
--
-- The planner saves a drill through PostgREST's upsert, which becomes
-- `on conflict (...)`. It named `name` alone, which needs a unique index on
-- that column — and no migration ever created one. Production has one from
-- before the migrations existed, so saving a drill worked there; the demo,
-- rebuilt from the migrations, had none, and every save answered
--
--   42P10: there is no unique or exclusion constraint matching the ON CONFLICT
--
-- Global uniqueness is the wrong shape in any case. `drills_bank` is scoped by
-- school_id and read that way (fetchDrillsBank), so two organizations must both
-- be able to keep a "Rondo 4v2". Conflicting on the name alone would have the
-- second organization's save overwrite the first's row, invisibly — which is
-- exactly what 0027 fixed for soccer_categories, for the same reason.
--
-- The index covers retired rows too, deliberately: PostgREST cannot upsert
-- against a partial index (42P10 again), and re-adding a retired drill should
-- revive the row rather than leave a second one behind an invisible first.
--
-- Before applying this to a database that has been running a while, check that
-- no organization already holds the same drill name twice:
--
--   select school_id, name, count(*) from public.drills_bank
--    group by school_id, name having count(*) > 1;
--
-- Rows with no organization are left alone: null school_id values do not
-- collide with each other in a unique index, and nothing reads them.

begin;

-- The SQL editor may run as a role that is a member of postgres without
-- defaulting to it; ALTER TABLE and DROP INDEX check ownership.
set role postgres;

-- ── 1. Undo the global uniqueness, wherever it came from ───────────────────
--
-- Written defensively: it is a constraint on one installation and a bare index
-- on another, and absent on a database built from the migrations.

alter table public.drills_bank drop constraint if exists drills_bank_name_key;
drop index if exists public.drills_bank_name_key;

-- ── 2. One name per organization ───────────────────────────────────────────

create unique index if not exists drills_bank_school_name_key
  on public.drills_bank (school_id, name);

commit;

-- Verify — the planner's save, which should now update rather than fail:
--   insert into public.drills_bank (school_id, name, category)
--   values ('<a school id>', 'Rondo 4v2', 'General')
--   on conflict (school_id, name) do update set category = excluded.category;
