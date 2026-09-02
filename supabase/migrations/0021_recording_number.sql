-- 0021: a recording number, separate from the shirt number
--
-- APPLY BEFORE DEPLOYING THE CODE THAT READS IT. Additive, and the currently
-- deployed code reads none of it, so applying early changes nothing visible.
--
-- ── What this is for ──────────────────────────────────────────────────────
--
-- Matrix results are often written on paper during a session, and handwriting
-- is not always readable afterwards. Players write a RECORDING NUMBER instead
-- of their name: a short number that identifies them on the sheet.
--
-- That is not their shirt number. A shirt number changes between seasons and
-- between fixtures, may be unset for a trialist, and two squads can each have a
-- number 9. A recording number is assigned once per squad, usually running 1..N
-- alphabetically, and stays put for the season.
--
-- ── The backfill, and why it moves rather than copies ─────────────────────
--
-- The 24 rows currently on the roster hold 1..24 in alphabetical order by
-- surname. Those are recording numbers that were imported into the shirt-number
-- column because there was nowhere else to put them: the roster has been
-- showing "#1 Cesar Alva" as though 1 were his shirt.
--
-- So they are MOVED, not copied, and `number` is cleared. Clearing is the whole
-- point -- leaving them would keep displaying a shirt number nobody has been
-- given. Real shirt numbers can be imported later.
--
-- Guarded so it only touches rows that look like this: every live member of a
-- team numbered 1..N with no gaps and no duplicates. A squad whose numbers are
-- genuinely shirts (7, 10, 23...) does not fit that shape and is left alone.

begin;

set role postgres;

alter table public.team_players
  add column if not exists recording_number integer;

-- Unique per team: two players sharing a recording number makes a paper sheet
-- ambiguous, which is the one thing it must never be. Partial, so a squad may
-- have many members with none assigned yet.
create unique index if not exists team_players_recording_number_per_team
  on public.team_players (team_id, recording_number)
  where recording_number is not null and not coalesce(is_deleted, false);

create index if not exists team_players_recording_lookup
  on public.team_players (team_id, recording_number)
  where not coalesce(is_deleted, false);

-- ─── Move 1..N sequences out of the shirt-number column ────────────────────

do $$
declare
  t record;
  moved integer := 0;
begin
  for t in
    select tp.team_id,
           count(*)                          as members,
           count(tp.number)                  as numbered,
           count(distinct tp.number)         as distinct_numbers,
           min(tp.number)                    as lo,
           max(tp.number)                    as hi
      from public.team_players tp
     where not coalesce(tp.is_deleted, false)
       and tp.recording_number is null
     group by tp.team_id
  loop
    -- The signature of a recording-number run: every member numbered, all
    -- distinct, and covering exactly 1..N.
    if t.numbered = t.members
       and t.distinct_numbers = t.members
       and t.lo = 1
       and t.hi = t.members then

      update public.team_players
         set recording_number = number,
             number = null
       where team_id = t.team_id
         and not coalesce(is_deleted, false);

      moved := moved + t.members;
      raise notice 'Team %: moved % number(s) into recording_number and cleared the shirt number.', t.team_id, t.members;
    else
      raise notice 'Team %: numbers do not look like a 1..N recording run (% of % numbered, % to %), so they were left as shirt numbers.',
        t.team_id, t.numbered, t.members, t.lo, t.hi;
    end if;
  end loop;

  raise notice 'Recording numbers assigned to % player(s).', moved;
end $$;

-- ─── Self-check ────────────────────────────────────────────────────────────

do $$
declare
  n     integer;
  dupes integer;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'team_players' and column_name = 'recording_number';
  if n <> 1 then raise exception 'team_players.recording_number was not created'; end if;

  -- `number` must SURVIVE: it is still the shirt number, just empty for now.
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'team_players' and column_name = 'number';
  if n <> 1 then raise exception 'the shirt number column was dropped; it is still needed.'; end if;

  select count(*) into dupes from (
    select team_id, recording_number
      from public.team_players
     where recording_number is not null and not coalesce(is_deleted, false)
     group by team_id, recording_number having count(*) > 1
  ) d;
  if dupes > 0 then
    raise exception '% recording number(s) are used twice in the same squad. A paper sheet could not be read back.', dupes;
  end if;
end $$;

commit;

-- Verify — the roster as the paper sheet will read:
--   select t.name as team, tp.recording_number, tp.number as shirt, p.name
--     from public.team_players tp
--     join public.players p on p.id = tp.player_id
--     join public.teams   t on t.id = tp.team_id
--    where not coalesce(tp.is_deleted, false)
--    order by t.name, tp.recording_number;

-- Rollback:
--   update public.team_players
--      set number = recording_number, recording_number = null
--    where recording_number is not null;
--   drop index if exists public.team_players_recording_number_per_team;
--   drop index if exists public.team_players_recording_lookup;
--   alter table public.team_players drop column if exists recording_number;
