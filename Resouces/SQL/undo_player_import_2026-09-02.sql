-- Undo the player import of 2026-09-02.
--
-- ── What went wrong ───────────────────────────────────────────────────────
--
-- The sheet had names as "Last, First" in a single Name column. The importer
-- splits a single name on the FIRST space, so every row came out reversed with
-- the comma attached:
--
--   "Brady, Braelyn A."  ->  first_name = 'Brady,'   last_name = 'Braelyn A.'
--
-- 48 new people were created that way, plus 58 Varsity memberships. Numbers
-- and positions are empty, so the sheet's columns did not match either.
--
-- ── What this removes, and what it must NOT ───────────────────────────────
--
-- The importer matched 11 of your ORIGINAL players by name and reattached them
-- (Ashton Earls, Caleb Carver, Jorge Marquez and eight others). Those people
-- are real and carry history. Only their MEMBERSHIP is removed here; the person
-- stays, exactly as they were before the import.
--
-- The 48 bad records are identified by the comma in their name. Verified
-- against the live database before writing this: all 48 imported names contain
-- one, and none of the 31 pre-existing names do. That is a safer marker than a
-- timestamp, which would also catch anyone added by hand today.
--
-- Everything is a soft delete, matching the repo convention. Nothing is
-- destroyed and the rollback at the bottom reverses it.

begin;

set role postgres;

-- ─── 1. Empty the squads ───────────────────────────────────────────────────
-- Every live membership was created by this import: both teams were empty
-- beforehand. Scoped to today so a membership added by hand tomorrow, after
-- this script is written but before it is run, is not swept up with it.

update public.team_players
   set is_deleted = true
 where not coalesce(is_deleted, false)
   and created_at::date = date '2026-09-02';

-- ─── 2. Retire the 48 reversed records ─────────────────────────────────────
-- The comma is what makes these identifiable. Restricted to rows created that
-- day as well, so a legitimate name containing a comma -- a "Jr., " suffix,
-- say -- entered later is never caught by this.

update public.players
   set is_deleted = true
 where not coalesce(is_deleted, false)
   and name like '%,%'
   and created_at::date = date '2026-09-02';

commit;

-- Verify — both should come back empty, and 31 people should remain:
--   select t.name, count(*) from public.team_players tp
--     join public.teams t on t.id = tp.team_id
--    where not coalesce(tp.is_deleted, false) group by t.name;
--
--   select count(*) from public.players where not coalesce(is_deleted, false);
--   -- expect 31
--
--   select name from public.players
--    where not coalesce(is_deleted, false) and name like '%,%';
--   -- expect zero rows

-- ── Before importing again ────────────────────────────────────────────────
--
-- Either fix the sheet, or wait for the importer to understand this format:
--
--   * split the single Name column into FirstName and LastName, OR
--   * write each name as "First Last" rather than "Last, First"
--
-- Check the sheet also has Number and Position columns spelled exactly that
-- way -- both came through empty, so the headers did not match.

-- Rollback:
--   update public.players       set is_deleted = false
--    where name like '%,%' and created_at::date = date '2026-09-02';
--   update public.team_players  set is_deleted = false
--    where created_at::date = date '2026-09-02';
