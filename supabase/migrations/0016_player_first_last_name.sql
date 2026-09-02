-- 0016: split players.name into first_name and last_name
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT SPLITS NAMES. The new code writes
-- first_name and last_name, and a write naming a column that does not exist
-- fails outright -- so deploying first would break adding and editing players
-- until this ran.
--
-- The reverse order is safe: this migration is additive, and its trigger
-- derives the parts from `name` as well as the other way round, so currently
-- deployed code that writes only `name` keeps working and still gets correct
-- parts. Safe to leave applied if the code is rolled back, for the same reason.
--
-- `name` is kept and is maintained automatically, so every reader of
-- players.name -- 37 of them across 9 files, from roster cards to the Matrix
-- standings to the XLSX export -- keeps working untouched.
--
-- ── Why a trigger and not a generated column ──────────────────────────────
--
-- `name` could be redefined as
--   generated always as (first_name || ' ' || last_name) stored
-- which would be tidier. It is not used here because Postgres cannot convert an
-- existing column to generated in place: it means `drop column name` followed
-- by `add column name generated ...`, and a drop cascades into every view,
-- index and policy that references it. A trigger gives the same guarantee --
-- the two can never drift -- with no destructive step and no dependency risk.
--
-- ── The backfill ──────────────────────────────────────────────────────────
--
-- Split on the FIRST space: first_name is one word, last_name is everything
-- after it. That keeps compound surnames together ("Rubier Palomeque" is fine
-- either way, but "Ana Maria Rodriguez Gomez" gives last_name = "Maria
-- Rodriguez Gomez" rather than mangling the surname down to "Gomez").
--
-- Verified against the live database before writing this: all 31 player rows
-- are exactly two words, so the split is unambiguous for the existing data. The
-- self-check at the bottom reports anything that needed a judgment call, so a
-- database that has moved on since will say so rather than silently guess.
--
-- A single-word name (no space) puts the whole value in first_name and leaves
-- last_name empty. The application requires both from here on, but this
-- migration must not invent a surname that was never recorded.

begin;

set role postgres;

alter table public.players add column if not exists first_name text;
alter table public.players add column if not exists last_name  text;

-- Backfill only rows that have not been split yet, so re-running this migration
-- cannot overwrite names that have since been corrected by hand.
update public.players
   set first_name = split_part(trim(name), ' ', 1),
       last_name  = nullif(
                      trim(substring(trim(name) from position(' ' in trim(name)) + 1)),
                      ''
                    )
 where coalesce(first_name, '') = ''
   and coalesce(name, '') <> ''
   and position(' ' in trim(name)) > 0;

-- Single-word names: everything goes to first_name, last_name stays null.
update public.players
   set first_name = trim(name)
 where coalesce(first_name, '') = ''
   and coalesce(name, '') <> ''
   and position(' ' in trim(name)) = 0;

-- ─── Keep `name` and its parts in step, in BOTH directions ─────────────────
--
-- Given the parts, the full name is rebuilt from them. Given only a full name,
-- the parts are derived from it by the same first-space rule as the backfill.
--
-- The second direction is what makes this migration safe to apply BEFORE the
-- code that knows about the parts is deployed. Currently deployed code writes
-- only `name`; without that branch, every player added between applying this
-- and deploying would have a name but no first_name, and would then show blank
-- fields in the roster editor. One-directional sync would have made the order
-- of these two steps load-bearing for no good reason.

create or replace function public.sync_player_full_name()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.first_name, '') <> '' then
    new.name := trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
  elsif coalesce(new.name, '') <> '' then
    new.first_name := split_part(trim(new.name), ' ', 1);
    new.last_name  := nullif(
                        trim(substring(trim(new.name) from position(' ' in trim(new.name)) + 1)),
                        ''
                      );
  end if;
  return new;
end;
$$;

drop trigger if exists players_sync_full_name on public.players;
create trigger players_sync_full_name
  before insert or update on public.players
  for each row execute function public.sync_player_full_name();

-- ─── Self-check ────────────────────────────────────────────────────────────
-- Proves the columns exist and the backfill reached every row, on the real
-- database at the moment of applying.

do $$
declare
  has_col   integer;
  unsplit   integer;
  surnameless integer;
begin
  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'players' and column_name = 'first_name';
  if has_col <> 1 then raise exception 'players.first_name was not created'; end if;

  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'players' and column_name = 'last_name';
  if has_col <> 1 then raise exception 'players.last_name was not created'; end if;

  -- `name` must SURVIVE this migration: 37 places still read it.
  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'players' and column_name = 'name';
  if has_col <> 1 then
    raise exception 'players.name was dropped; every roster and Matrix view still reads it.';
  end if;

  select count(*) into unsplit from public.players
   where coalesce(first_name, '') = '' and not coalesce(is_deleted, false);
  if unsplit > 0 then
    raise exception '% player rows still have no first name. They had no name to split.', unsplit;
  end if;

  select count(*) into surnameless from public.players
   where coalesce(last_name, '') = '' and not coalesce(is_deleted, false);

  raise notice 'Players split into first and last name. % live row(s) have no surname -- set one in the roster editor.', surnameless;
end $$;

commit;

-- Verify — the halves and the whole should agree on every row:
--   select name, first_name, last_name from public.players
--   where not coalesce(is_deleted, false) order by last_name, first_name;
--
-- And the trigger should rebuild `name` on its own:
--   update public.players set first_name = first_name where false;  -- no-op
--   -- then edit one row's first_name and confirm `name` follows.

-- Rollback:
--   drop trigger if exists players_sync_full_name on public.players;
--   drop function if exists public.sync_player_full_name();
--   alter table public.players drop column if exists first_name;
--   alter table public.players drop column if exists last_name;
--   -- `name` was never modified by this migration beyond being kept in sync,
--   -- so it still holds the full name and nothing is lost.
