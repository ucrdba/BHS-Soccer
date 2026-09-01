-- 0012: give each drill a real matrix weight and the right measurement type
--
-- Every drill arrived from 0009 at the default weight 3.0 and measure
-- 'head_to_head', because that migration deliberately did not guess from
-- names -- guessing wrong is worse than asking. This is the answer to that
-- question, and it is a DATA change: edit the values below before running if
-- any of them do not match how you actually train.
--
-- Two consequences worth knowing before you run it.
--
-- Weights are looked up live, so changing `Coopers` from 1.0 to 1.5 re-scores
-- both Cooper's sessions already recorded and re-ranks the table. That is the
-- intended behaviour, not a side effect. Everything else below is unused --
-- verified against the live database: only `Coopers` (2 sessions) and
-- `Dummy Drill B` (1 session) have any results at all -- so those changes
-- affect nothing retroactively.
--
-- Changing a drill's measure to something other than 'head_to_head' is what
-- makes it appear in the session recorder. Until then it can only be recorded
-- as 1v1 pairings.
--
--   DRILL                              WEIGHT  MEASURE      WHY
--   1v1 Gauntlet (Continuous)          3.0     1v1          the sharpest test of a player
--   2v2 Flying Scrimmage               2.5     small-sided  competitive, more variables
--   7v7 Tactical Match Play            2.5     small-sided  competitive, more variables
--   Finishing under High Pressure      2.0     counted      shots made out of a set
--   12-Minute Cooper Fitness Test      1.5     counted      distance run
--   Coopers                            1.5     counted      same test; see the note below
--   Dummy Drill B: Overlapping         1.0     timed        left alone -- it has results
--   Dynamic Warmup & Rondo (5v2)       0.0     1v1          a warm-up, not a competition
--   Cool Down & Matrix Leaderboard     0.0     1v1          a cool-down, not a competition
--   diagram test 2                     0.0     small-sided  a test artefact
--
-- Weight 0 means an exercise contributes nothing either way if it is ever
-- recorded against. That is honest for a warm-up: it belongs in a practice
-- plan, but winning a rondo should not move the competitive matrix.

begin;

set role postgres;

update public.drills_bank set points = 3.0, measure = 'head_to_head'
 where name = '1v1 Gauntlet (Continuous)';

update public.drills_bank set points = 2.5, measure = 'win_loss'
 where name = '2v2 Flying Scrimmage with Bumpers';

update public.drills_bank set points = 2.5, measure = 'win_loss'
 where name = '7v7 Tactical Match Play';

update public.drills_bank set points = 2.0, measure = 'count_high'
 where name = 'Finishing under High Pressure';

-- Both Cooper's drills are set the same, so it does not matter which one gets
-- used from here. See the duplicate note at the end.
update public.drills_bank set points = 1.5, measure = 'count_high'
 where name in ('Coopers', '12-Minute Cooper Fitness Test');

-- Not competitions. Left as head_to_head so they never appear in the session
-- recorder, and weighted 0 so recording one by accident cannot move the table.
update public.drills_bank set points = 0.0, measure = 'head_to_head'
 where name in ('Dynamic Warmup & Rondo (5v2)',
                'Cool Down & Matrix Leaderboard Review');

update public.drills_bank set points = 0.0, measure = 'win_loss'
 where name = 'diagram test 2';

-- `Dummy Drill B: Overlapping Fullbacks` is deliberately NOT touched. It has a
-- recorded session, so changing its weight would re-score real results, and it
-- is test data you may want to delete rather than re-price.

commit;

-- Verify:
--   select name, points, measure from public.drills_bank
--   where not coalesce(is_deleted, false) order by points desc, name;

-- ── Two things this migration deliberately does NOT do ────────────────────
--
-- It does not delete the duplicate Cooper's. You have both `Coopers` and
-- `12-Minute Cooper Fitness Test`; the recorded sessions are against
-- `Coopers`. Deleting the other is safe -- it has no results -- but deletion
-- is a judgement call, so do it from the drills library rather than here.
--
-- It does not attach a drill to the five 1v1 results already logged. Those
-- have drill_id null and therefore score at the fallback weight 1.0 no matter
-- what `1v1 Gauntlet` is set to. Fix them from LOGGED RESULTS: edit each and
-- pick the drill. Five edits, and they then score at 3.0 as intended.

-- Rollback (restores the 0009 defaults for every drill this touched):
--   update public.drills_bank set points = 3.0, measure = 'head_to_head'
--    where name in ('1v1 Gauntlet (Continuous)', '2v2 Flying Scrimmage with Bumpers',
--                   '7v7 Tactical Match Play', 'Finishing under High Pressure',
--                   'Dynamic Warmup & Rondo (5v2)', 'Cool Down & Matrix Leaderboard Review',
--                   'diagram test 2', '12-Minute Cooper Fitness Test');
--   update public.drills_bank set points = 1.0, measure = 'count_high' where name = 'Coopers';
