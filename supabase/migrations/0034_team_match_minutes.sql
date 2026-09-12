-- 0034: how long this team's matches are
--
-- CLAUDE.md has said for a while that "teams.match_minutes holds it and
-- seasonFullMatchMinutes reads it". The reader was real (src/domain/season.ts)
-- but the column was not: no migration ever created it, so every team fell
-- through to the 80-minute fallback in src/data/season-stats.ts. High school is
-- 80, club age groups are not, and one organization can field teams playing
-- different lengths -- so a club's per-match rates were quietly wrong.
--
-- Null on purpose, rather than defaulted to 80: null means "nobody has said",
-- which is exactly when the app's fallback should apply. A default would make
-- every existing team claim 80 minutes as though someone had chosen it.
--
-- The check rejects zero and negatives, which would make every rate infinite
-- or negative. seasonFullMatchMinutes already refuses those defensively; this
-- stops them being stored in the first place.

begin;

-- The SQL editor may run as a role that is a member of postgres without
-- defaulting to it; ALTER TABLE checks ownership rather than privilege.
set role postgres;

alter table public.teams
  add column if not exists match_minutes integer;

alter table public.teams
  drop constraint if exists teams_match_minutes_positive;

alter table public.teams
  add constraint teams_match_minutes_positive
  check (match_minutes is null or match_minutes > 0);

comment on column public.teams.match_minutes is
  'Full match length in minutes. Null means unstated, and the app falls back to 80.';

commit;

-- Verify:
--   select name, season, match_minutes from public.teams order by name;
--
-- To state one, until a screen does it:
--   update public.teams set match_minutes = 80 where name = 'Varsity';
