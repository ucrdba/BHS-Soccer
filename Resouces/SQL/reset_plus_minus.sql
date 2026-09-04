-- Zero out plus/minus.
--
-- Run in the Supabase SQL editor. NOT a migration: this changes data, and it
-- is meant to be run more than once, whenever a tracking session needs
-- throwing away.
--
-- ── Read this before running anything below ───────────────────────────────
--
-- Nothing here is reversible. Plus/minus keeps no separate totals: every
-- figure the app shows — plus, minus, score, goal differential, minutes,
-- shots, goals, assists — is REPLAYED from stat_events. Delete the events and
-- the numbers are gone, because the events were the numbers.
--
-- So run STEP 0 first and look at what it prints. Each destructive step below
-- it is commented out on purpose: uncomment exactly one, run it, and comment
-- it back.
--
-- ── set role postgres ─────────────────────────────────────────────────────
--
-- Not optional here, and for a different reason than in the migrations. Both
-- tables carry RLS keyed on is_team_coach(), so a role that is not a team
-- coach deletes ZERO rows and the editor still reports success. Running as
-- postgres bypasses RLS and makes the row counts real.
--
-- ── The cascade ───────────────────────────────────────────────────────────
--
-- stat_events.match_id references stat_matches ON DELETE CASCADE, so removing
-- a tracking session removes its events too. That is why STEP 2 and STEP 3
-- do not need to touch stat_events at all.
--
-- Deleting a tracking session is safe in the app's terms: the unique index on
-- (team_id, match_id) is partial on `not is_deleted`, so re-opening
-- Plus/Minus on that fixture simply starts a fresh session.


-- ═════════════════════════════════════════════════════════════════════════
-- STEP 0 — What is actually there. Safe: reads only.
-- ═════════════════════════════════════════════════════════════════════════

set role postgres;

select t.name                     as team,
       coalesce(s.opponent, m.label, '(no fixture)') as fixture,
       s.match_date,
       m.id                       as stat_match_id,
       m.is_deleted,
       count(e.id)                as events,
       count(*) filter (where e.kind in ('plus', 'minus'))  as plus_minus,
       max(e.at_seconds)          as last_clock
  from public.stat_matches m
  join public.teams        t on t.id = m.team_id
  left join public.schedule    s on s.id = m.match_id
  left join public.stat_events e on e.match_id = m.id
 group by t.name, s.opponent, m.label, s.match_date, m.id, m.is_deleted
 order by s.match_date nulls last, m.created_at;

-- Zero rows here means there is nothing to clear and you can stop.


-- ═════════════════════════════════════════════════════════════════════════
-- STEP 1 — Zero ONE fixture, keeping the session open.
--
-- The events go; the tracking session stays, so the screen reopens on an
-- empty pitch at 0:00 rather than having to be created again. This is the
-- one to use mid-season after a mis-tracked half.
--
-- Put the stat_match_id from STEP 0 in place of the zeros.
-- ═════════════════════════════════════════════════════════════════════════

-- begin;
--   set role postgres;
--   delete from public.stat_events
--    where match_id = '00000000-0000-0000-0000-000000000000';
-- commit;


-- ═════════════════════════════════════════════════════════════════════════
-- STEP 2 — Remove every tracking session for ONE team.
--
-- Events cascade. Use this to clear a season's worth of test tracking off
-- one squad while leaving another squad's real data alone.
--
-- Put the team name in place of Varsity. Team names are per organization, so
-- this also matches a club with the same squad name — check STEP 0's output
-- if more than one organization is in play.
-- ═════════════════════════════════════════════════════════════════════════

-- begin;
--   set role postgres;
--   delete from public.stat_matches
--    where team_id in (select id from public.teams where name = 'Varsity');
-- commit;


-- ═════════════════════════════════════════════════════════════════════════
-- STEP 3 — Remove EVERYTHING, every team, every fixture.
--
-- The clean slate for after a testing session. There is no undo, and STEP 0
-- is the last chance to see what this takes with it.
-- ═════════════════════════════════════════════════════════════════════════

-- begin;
--   set role postgres;
--   delete from public.stat_matches;
-- commit;


-- ═════════════════════════════════════════════════════════════════════════
-- Verify — re-run STEP 0.
--
-- What you should see:
--   after STEP 1   the fixture still listed, events 0
--   after STEP 2   no rows for that team
--   after STEP 3   no rows at all
--
-- Then reload the site. The app holds the events in memory for the open
-- match, so a tab left open still shows the old numbers until it re-fetches.
-- ═════════════════════════════════════════════════════════════════════════
