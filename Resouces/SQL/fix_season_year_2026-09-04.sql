-- Move the second half of the season into the right year.
--
-- ── What is wrong ─────────────────────────────────────────────────────────
--
-- The season runs December 2026 to February 2027, but every January and
-- February fixture is stored as 2026 — a year early, and twelve months before
-- the December fixtures they follow:
--
--   DEC  8 2026 … DEC 30 2026     correct
--   JAN  6 2026 … JAN 29 2026     should be 2027
--   FEB  1 2026 … FEB  3 2026     should be 2027
--
-- The effect is not cosmetic. match_on is derived from match_date by the
-- trigger in migration 0008, so the season currently sorts as January, then
-- February, then December — ten months later. Anything reading fixtures in
-- order, or asking for the next one, gets the wrong answer.
--
-- Verified read-only before writing this: 19 live fixtures, 8 in January and 2
-- in February, all stored as 2026, and every one of them AFTER a December 2026
-- fixture in the real schedule.
--
-- ── What this does NOT do ─────────────────────────────────────────────────
--
-- It touches only January and February of 2026, and only for teams that also
-- have a December 2026 fixture — that pairing is what makes it a season
-- crossing the new year rather than a genuine early-2026 match. A team whose
-- season really did run in early 2026 is left alone.
--
-- Rollback is at the bottom, and nothing is deleted.

begin;

set role postgres;

-- ─── 0. Refuse to run against a shape this was not written for ────────────

do $$
declare
  n_bad int;
begin
  select count(*) into n_bad
    from public.schedule s
   where not coalesce(s.is_deleted, false)
     and s.match_on >= date '2026-01-01'
     and s.match_on <  date '2026-03-01'
     and exists (
       select 1 from public.schedule d
        where d.team_id = s.team_id
          and not coalesce(d.is_deleted, false)
          and d.match_on >= date '2026-12-01'
          and d.match_on <  date '2027-01-01');

  if n_bad = 0 then
    raise exception 'Nothing matches: no early-2026 fixture sits alongside a December 2026 one. Already fixed, or this is not the right script.';
  end if;

  raise notice 'Moving % fixture(s) from early 2026 into 2027.', n_bad;
end $$;

-- ─── 1. Move them ─────────────────────────────────────────────────────────
--
-- match_date is the text a human reads and the only thing that needs editing:
-- the trigger on match_date recomputes match_on, so the real date follows
-- rather than being set twice and risking the two disagreeing.

update public.schedule s
   set match_date = regexp_replace(s.match_date, '2026\s*$', '2027')
 where not coalesce(s.is_deleted, false)
   and s.match_on >= date '2026-01-01'
   and s.match_on <  date '2026-03-01'
   and s.match_date ~ '2026\s*$'
   and exists (
     select 1 from public.schedule d
      where d.team_id = s.team_id
        and not coalesce(d.is_deleted, false)
        and d.match_on >= date '2026-12-01'
        and d.match_on <  date '2027-01-01');

-- ─── 2. Self-check ────────────────────────────────────────────────────────

do $$
declare
  n_left int;
  n_moved int;
begin
  select count(*) into n_left
    from public.schedule
   where not coalesce(is_deleted, false)
     and match_on >= date '2026-01-01'
     and match_on <  date '2026-03-01';

  select count(*) into n_moved
    from public.schedule
   where not coalesce(is_deleted, false)
     and match_on >= date '2027-01-01'
     and match_on <  date '2027-03-01';

  if n_left > 0 then
    raise exception '% fixture(s) are still in early 2026. The text may not end in a year.', n_left;
  end if;
  if n_moved = 0 then
    raise exception 'Nothing landed in 2027 — the trigger may not have recomputed match_on.';
  end if;

  raise notice 'Done: % fixture(s) now in early 2027, none left in early 2026.', n_moved;
end $$;

commit;

-- Verify — the season should read December then January then February:
--   select t.name as team, s.match_date, s.match_on, s.opponent
--     from public.schedule s
--     join public.teams t on t.id = s.team_id
--    where not coalesce(s.is_deleted, false)
--    order by s.match_on;

-- ── Rollback ──────────────────────────────────────────────────────────────
-- Puts the moved fixtures back into 2026. Only run this if the move was wrong.
--
--   begin;
--   set role postgres;
--   update public.schedule
--      set match_date = regexp_replace(match_date, '2027\s*$', '2026')
--    where not coalesce(is_deleted, false)
--      and match_on >= date '2027-01-01'
--      and match_on <  date '2027-03-01';
--   commit;
