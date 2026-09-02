-- Tidy up the drills library and the saved plans:
--   * merge four stray category labels into real categories
--   * retire the "diagram test 2" drill and the one-slot test plan using it
--   * repair a plan name mangled by a bad paste
--
-- The stray labels are not category rows -- drills_bank.category is free TEXT,
-- so they exist only as text typed or imported onto a drill. Re-tagging the
-- drills is the whole job; nothing needs retiring afterwards, and the labels
-- disappear from the admin panel's "Used by drills, not in the list" section
-- on their own.
--
-- Most of this can be done from the app instead:
--   the four merges  Admin panel -> DRILL CATEGORIES
--                    -> "Used by drills, not in the list"
--                    -> Merge into <category> -> Merge
--   the test drill   Practice planner -> Master Drills Library -> Delete
--   the test plan    delete its only slot from the planner
--
-- The plan RENAME at the end has no app path -- the planner names a plan when
-- it is saved and offers no way to rename one afterwards -- so that statement
-- is the reason to run this here rather than clicking through.
--
-- Each mapping below was chosen from the DRILL's name, not the label's:
--
--   "Coopers"                             -> a fitness test
--   "2v2 Flying Scrimmage with Bumpers"   -> a small-sided game
--   "Finishing under High Pressure"       -> finishing
--   "Cool Down & Matrix Leaderboard Review" -> a cool-down
--
-- The fifth label, "Tactical / Attacking", belongs to "diagram test 2", which
-- is leftover test data. It is RETIRED below rather than re-categorised.
--
-- Safe to re-run: each statement matches on the old label, so a second run
-- finds nothing left to change.

begin;

set role postgres;

update public.drills_bank set category = 'Physical Conditioning'
 where category = 'Physical / Conditioning';

update public.drills_bank set category = 'Small-Sided Games'
 where category = 'Small Sided';

update public.drills_bank set category = 'Shooting & Finishing'
 where category = 'Technical / Shooting';

update public.drills_bank set category = 'Cool Down & Recovery'
 where category = 'Recovery / Team Building';

-- ─── Retire the test drill ─────────────────────────────────────────────────
-- "diagram test 2" is leftover test data. Checked before writing this: no
-- matrix_logs row and no matrix_exercise_points row references it, so nothing
-- recorded is lost. Soft delete, matching the repo-wide convention -- readers
-- filter on is_deleted, and the row stays recoverable.

update public.drills_bank set is_deleted = true
 where name = 'diagram test 2';

-- ─── Retire the test plan that used it ─────────────────────────────────────
-- "Standard Varsity -2" is a one-slot plan whose only slot is the test drill
-- above, at 1:15 AM. Checked before writing this: exactly ONE slot, so this
-- retires the whole plan and nothing else.
--
-- A plan is not a row -- practice_plans holds one row per drill slot, and a
-- plan is the set of rows sharing a name -- so deleting a plan means matching
-- on the name, not on an id.

update public.practice_plans set is_deleted = true
 where name = 'Standard Varsity -2';

-- ─── Repair a plan name mangled by a bad paste ─────────────────────────────
-- The name reads as three pieces spliced together:
--
--   'Standard Varsity 90-Min High' + 'Short Varsity 60-Min High Intensity'
--                                  + ' Intensity'
--
-- i.e. the cursor sat after "High" while a second name was pasted in. The
-- intended name was the pasted one.
--
-- Renaming it back to 'Standard Varsity 90-Min High Intensity' instead would
-- have MERGED it into the existing plan of that name -- a plan is the set of
-- rows sharing a name, so the two would become one 11-slot session with
-- overlapping times. Deliberately not that.
--
-- Matches on the exact mangled string, so it changes those 7 rows and nothing
-- near them.

update public.practice_plans
   set name = 'Short Varsity 60-Min High Intensity'
 where name = 'Standard Varsity 90-Min HighShort Varsity 60-Min High Intensity Intensity';

commit;

-- Verify — the saved plans should now read:
--   select name, count(*) from public.practice_plans
--    where not coalesce(is_deleted, false) group by name order by name;
--   -- Short Varsity 60-Min High Fun          7
--   -- Short Varsity 60-Min High Intensity    7
--   -- Standard Practice Plan                 2
--   -- Standard Varsity 90-Min High Intensity 4
--   -- dummy_practice_1                       9
--
-- Verify — every live drill should now name a category that actually exists:
--   select d.category, count(*)
--     from public.drills_bank d
--    where not coalesce(d.is_deleted, false)
--      and not exists (
--            select 1 from public.soccer_categories c
--             where c.name = d.category
--               and not coalesce(c.is_deleted, false))
--    group by d.category;
--   -- expect zero rows.

-- Rollback. Everything here is reversible; nothing was hard-deleted.
--
--   a category mapping (match on the DRILL, since the label is now shared):
--     update public.drills_bank set category = 'Physical / Conditioning'
--      where category = 'Physical Conditioning' and name = 'Coopers';
--
--   the retired drill and plan:
--     update public.drills_bank    set is_deleted = false where name = 'diagram test 2';
--     update public.practice_plans set is_deleted = false where name = 'Standard Varsity -2';
--
--   the rename:
--     update public.practice_plans
--        set name = 'Standard Varsity 90-Min HighShort Varsity 60-Min High Intensity Intensity'
--      where name = 'Short Varsity 60-Min High Intensity';
