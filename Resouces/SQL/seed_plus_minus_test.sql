-- TEST DATA — four tracked matches of plus/minus, for looking at the season
-- report with something realistic in it.
--
-- Run in the Supabase SQL editor. Remove it afterwards with
-- Resouces/SQL/reset_plus_minus.sql (STEP 3 clears everything).
--
-- ── What it makes ─────────────────────────────────────────────────────────
--
-- The first four AWAY fixtures on the Varsity schedule, each with a full
-- tracked match: a clock that starts and stops for half time, players on and
-- off, and plus/minus spread across them.
--
-- Rotation is written the way a high school match actually runs, not the way
-- a professional one does. Substitution is unlimited and players re-enter, so
-- the squad is split into three shapes:
--
--   * a core who play most of every match, in two or three spells
--   * a middle group getting 20 to 40 minutes
--   * a fringe getting 5 to 15
--
-- The fringe is the point. The report is read to decide who deserves more
-- minutes, so the seed deliberately includes a player whose rate per match is
-- excellent off almost no minutes — the case the charts have to render
-- honestly rather than hide.
--
-- One player improves across the four matches and one declines, so the trend
-- arrows have something real to report.
--
-- ── Match length ──────────────────────────────────────────────────────────
--
-- 80 minutes: two forty-minute halves, which is the high school match. Clock
-- values below are SECONDS from kick-off, running 0 to 4800 with the clock
-- stopped between 2400 and 2400 at half time.
--
-- ── Safety ────────────────────────────────────────────────────────────────
--
-- Every session is labelled 'TEST' so it is obvious in the report and in
-- STEP 0 of the reset script. It refuses to run twice: the second run finds
-- the sessions already there and inserts nothing.
--
-- set role postgres, because both tables carry RLS keyed on is_team_coach()
-- and a role that is not a coach would insert nothing while reporting
-- success.

begin;

set role postgres;

-- ── Which team, and which fixtures ────────────────────────────────────────
with team as (
  select t.id, t.school_id
    from public.teams t
    join public.schools s on s.id = t.school_id
   where t.name = 'Varsity'
   order by t.created_at
   limit 1
),
fixtures as (
  select s.id, s.opponent, s.match_on,
         row_number() over (order by s.match_on, s.match_date) as n
    from public.schedule s, team
   where s.team_id = team.id
     and s.is_home is false
     and coalesce(s.is_deleted, false) = false
   order by s.match_on, s.match_date
   limit 4
),
-- ── The squad, ranked so the seed can hand out roles deterministically ────
squad as (
  select tp.player_id,
         row_number() over (order by tp.recording_number nulls last, tp.player_id) as n
    from public.team_players tp, team
   where tp.team_id = team.id
     and coalesce(tp.is_deleted, false) = false
),
-- Roles: 11 core, 6 rotation, the rest fringe.
roles as (
  select player_id, n,
         case when n <= 11 then 'core'
              when n <= 17 then 'rotation'
              else 'fringe' end as role
    from squad
),
sessions as (
  insert into public.stat_matches (team_id, school_id, match_id, label, is_deleted)
  select team.id, team.school_id, f.id, 'TEST', false
    from fixtures f, team
   where not exists (
     select 1 from public.stat_matches m
      where m.match_id = f.id and m.label = 'TEST' and not m.is_deleted)
  returning id, match_id
),
numbered as (
  select s.id as session_id, f.n as match_no
    from sessions s join fixtures f on f.id = s.match_id
)
-- ── The events ────────────────────────────────────────────────────────────
insert into public.stat_events (match_id, player_id, kind, at_seconds, period, is_deleted)
select e.session_id, e.player_id, e.kind, e.at_seconds, e.period, false
from (
  -- Clock: kick off, stop at half time, restart, stop at the whistle.
  select nm.session_id, null::uuid as player_id, 'clock_start' as kind, 0 as at_seconds, 1 as period from numbered nm
  union all select nm.session_id, null, 'clock_stop',  2400, 1 from numbered nm
  union all select nm.session_id, null, 'clock_start', 2400, 2 from numbered nm
  union all select nm.session_id, null, 'clock_stop',  4800, 2 from numbered nm

  -- Core: on from kick-off, off for a breather, back on. Two spells, about
  -- 65 of the 80 minutes.
  union all select nm.session_id, r.player_id, 'on',   0,    1 from numbered nm, roles r where r.role = 'core'
  union all select nm.session_id, r.player_id, 'off',  1800, 1 from numbered nm, roles r where r.role = 'core'
  union all select nm.session_id, r.player_id, 'on',   2400, 2 from numbered nm, roles r where r.role = 'core'
  union all select nm.session_id, r.player_id, 'off',  4800, 2 from numbered nm, roles r where r.role = 'core'

  -- Rotation: the last twenty of the first half, and a spell in the second.
  union all select nm.session_id, r.player_id, 'on',   1800, 1 from numbered nm, roles r where r.role = 'rotation'
  union all select nm.session_id, r.player_id, 'off',  2400, 1 from numbered nm, roles r where r.role = 'rotation'
  union all select nm.session_id, r.player_id, 'on',   3600, 2 from numbered nm, roles r where r.role = 'rotation'
  union all select nm.session_id, r.player_id, 'off',  4800, 2 from numbered nm, roles r where r.role = 'rotation'

  -- Fringe: about eight minutes at the end. The players the report is for.
  union all select nm.session_id, r.player_id, 'on',   4320, 2 from numbered nm, roles r where r.role = 'fringe'
  union all select nm.session_id, r.player_id, 'off',  4800, 2 from numbered nm, roles r where r.role = 'fringe'

  -- Plus and minus. Deterministic rather than random, so the report reads
  -- the same every time it is seeded and a chart can be checked by hand.
  --
  -- Player 1 improves across the four matches, player 2 declines, and the
  -- rest sit steady. Player 18 — the first of the fringe — is given a plus
  -- in every match: eight minutes and a plus is the honest-looking-wild case
  -- the charts have to handle.
  union all select nm.session_id, r.player_id, 'plus', 600 + r.n * 30, 1
    from numbered nm, roles r
   where r.role = 'core' and r.n <= 6
  union all select nm.session_id, r.player_id, 'plus', 3000 + r.n * 30, 2
    from numbered nm, roles r
   where r.n = 1 and nm.match_no >= 2               -- improving
  union all select nm.session_id, r.player_id, 'plus', 3200, 2
    from numbered nm, roles r
   where r.n = 1 and nm.match_no >= 3               -- improving further
  union all select nm.session_id, r.player_id, 'minus', 2000 + r.n * 20, 1
    from numbered nm, roles r
   where r.n = 2 and nm.match_no >= 2               -- declining
  union all select nm.session_id, r.player_id, 'minus', 3400, 2
    from numbered nm, roles r
   where r.n = 2 and nm.match_no >= 3               -- declining further
  union all select nm.session_id, r.player_id, 'minus', 2600, 2
    from numbered nm, roles r
   where r.role = 'rotation' and r.n = 12
  union all select nm.session_id, r.player_id, 'plus', 4500, 2
    from numbered nm, roles r
   where r.n = 18                                   -- the fringe standout

  -- Goals, so goal differential is not flat. Two for, one against, and the
  -- against lands while the fringe are on so their differential differs from
  -- the starters'.
  union all select nm.session_id, null, 'goal_for',     900,  1 from numbered nm
  union all select nm.session_id, null, 'goal_for',     3300, 2 from numbered nm
  union all select nm.session_id, null, 'goal_against', 4400, 2 from numbered nm
) e;

commit;

-- ── Verify ────────────────────────────────────────────────────────────────
--
--   select m.label, s.opponent, s.match_date, count(e.id) as events
--     from public.stat_matches m
--     left join public.schedule    s on s.id = m.match_id
--     left join public.stat_events e on e.match_id = m.id
--    where m.label = 'TEST'
--    group by m.label, s.opponent, s.match_date
--    order by s.match_date;
--
-- Four rows, each with a few dozen events. Then open the site, go to the
-- schedule and press "Season +/−".
--
-- ── Removing it ───────────────────────────────────────────────────────────
--
--   delete from public.stat_matches where label = 'TEST';
--
-- Events cascade. Run it as postgres, for the same RLS reason as above.
