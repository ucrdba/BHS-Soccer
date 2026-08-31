-- 0008: give schedule a real date to sort and compare on
--
-- schedule.match_date is TEXT, holding whatever a coach typed: 'AUG 28, 2026'
-- in one row, 'SEP 4 2026' in the next. Nothing can order it correctly --
-- alphabetically 'SEP 11 2026' sorts before 'SEP 4 2026' -- so fetchSchedule
-- falls back to created_at, which orders fixtures by when they were entered
-- rather than when they are played. That is what pinned a match from AUG 28 to
-- the home page as NEXT MATCH with the countdown reading 00/00/00.
--
-- Approach: add real date and time columns, derive them from the text with a
-- trigger, and leave match_date/match_time in place.
--
-- Why keep the text columns. They are what the site displays, in the coach's
-- own wording, and every view renders them directly. Replacing them would mean
-- picking a format for everybody. So the split is deliberate and narrow:
--   match_date / match_time  -- what a human reads
--   match_on / kickoff_time  -- what the database sorts and compares
-- The trigger derives the second pair from the first on every write, so they
-- cannot drift no matter which client does the writing. The text stays the
-- single source of truth; the date columns are always downstream of it.
--
-- A row whose date cannot be parsed gets match_on = null rather than a guess.
-- The app already treats an unreadable date as "cannot tell", and a wrong date
-- silently reordering the season is worse than a null.

begin;

alter table public.schedule add column if not exists match_on     date;
alter table public.schedule add column if not exists kickoff_time time;

-- ─── Parsers, shared by the trigger and the backfill ───────────────────────
-- Immutable and null-safe: anything that does not match the expected shape
-- comes back null, never an exception and never a guess.

create or replace function public.parse_match_date(raw text)
returns date
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  if raw is null then return null; end if;

  -- 'AUG 28, 2026' and 'SEP 4 2026' -- the comma is optional, and the month
  -- may be written in full ('September 4, 2026').
  parts := regexp_match(btrim(raw), '^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$');
  if parts is null then return null; end if;

  begin
    -- left(...,3) so both 'SEP' and 'September' feed the MON pattern.
    return to_date(upper(left(parts[1], 3)) || ' ' || parts[2] || ' ' || parts[3], 'MON DD YYYY');
  exception when others then
    return null;
  end;
end;
$$;

create or replace function public.parse_match_time(raw text)
returns time
language plpgsql
immutable
as $$
declare
  parts text[];
  hh    integer;
begin
  if raw is null then return null; end if;

  -- '4:00 PM', '10:30 AM', '16:00'
  parts := regexp_match(upper(btrim(raw)), '^(\d{1,2}):(\d{2})\s*(AM|PM)?$');
  if parts is null then return null; end if;

  hh := parts[1]::integer;
  if    parts[3] = 'PM' and hh < 12 then hh := hh + 12;
  elsif parts[3] = 'AM' and hh = 12 then hh := 0;
  end if;

  if hh > 23 or parts[2]::integer > 59 then return null; end if;
  return make_time(hh, parts[2]::integer, 0);
end;
$$;

-- ─── Keep the derived columns in step on every write ───────────────────────
-- A trigger rather than client-side derivation: the XLSX import, the schedule
-- form, and any future writer all go through this one path, so the two
-- representations cannot disagree.

create or replace function public.sync_schedule_derived_datetime()
returns trigger
language plpgsql
as $$
begin
  new.match_on     := public.parse_match_date(new.match_date);
  new.kickoff_time := public.parse_match_time(new.match_time);
  return new;
end;
$$;

drop trigger if exists sync_schedule_derived_datetime on public.schedule;
create trigger sync_schedule_derived_datetime
  before insert or update of match_date, match_time on public.schedule
  for each row execute function public.sync_schedule_derived_datetime();

-- ─── Backfill the rows that already exist ──────────────────────────────────

update public.schedule
set match_on     = public.parse_match_date(match_date),
    kickoff_time = public.parse_match_time(match_time);

-- Report anything that would not parse, rather than leaving it to be noticed
-- when a fixture sorts to the wrong end of the season.
do $$
declare
  bad record;
  n   integer := 0;
begin
  for bad in
    select id, match_date, match_time
    from public.schedule
    where not coalesce(is_deleted, false)
      and (match_on is null or kickoff_time is null)
  loop
    n := n + 1;
    raise notice 'unparsed: id=% match_date=% match_time=%',
      bad.id, coalesce(bad.match_date, '<null>'), coalesce(bad.match_time, '<null>');
  end loop;

  if n > 0 then
    raise notice '% row(s) could not be parsed. They will sort last and are listed above; fix the text and they will convert on save.', n;
  else
    raise notice 'All schedule rows converted.';
  end if;
end $$;

-- ─── Index the ordering the app actually performs ──────────────────────────

create index if not exists schedule_team_chronological
  on public.schedule (team_id, match_on, kickoff_time)
  where not coalesce(is_deleted, false);

commit;

-- Verify -- fixtures should now come back in true chronological order,
-- and SEP 4 must precede SEP 11:
--   select t.name as team, s.match_date, s.match_on, s.match_time, s.kickoff_time, s.opponent
--   from public.schedule s
--   join public.teams t on t.id = s.team_id
--   where not coalesce(s.is_deleted, false)
--   order by s.match_on nulls last, s.kickoff_time nulls last;

-- Check the trigger holds on a write:
--   update public.schedule set match_date = 'OCT 1 2026'
--   where opponent = 'Palm Springs Indians';
--   select match_date, match_on from public.schedule
--   where opponent = 'Palm Springs Indians';   -- match_on must read 2026-10-01

-- Rollback:
--   drop trigger if exists sync_schedule_derived_datetime on public.schedule;
--   drop function if exists public.sync_schedule_derived_datetime();
--   drop function if exists public.parse_match_date(text);
--   drop function if exists public.parse_match_time(text);
--   drop index if exists public.schedule_team_chronological;
--   alter table public.schedule drop column if exists match_on;
--   alter table public.schedule drop column if exists kickoff_time;
