-- 0036: a player's position is the soccer position number 1-11
--
-- Spec: docs/superpowers/specs/2026-09-14-numbered-positions-design.md
--
--   1      goalkeeper
--   2-6    defence
--   7-11   attack
--
-- team_players.position was free text -- "FB", "MF", "Center Midfield",
-- "Forward / CAM", "Goalkeeper" -- so nothing could tell an attacker from a
-- defender. Only CERTAIN conversions are kept: the goalkeeper spellings become
-- 1, text that is already 1-11 keeps its number, and everything else is
-- cleared for the coach to set. FB could be 2 or 3 and MF could be 6 or 8; a
-- guessed number would quietly put a player in the wrong role.
--
-- BEFORE APPLYING, run the read-only query in
-- docs/runbooks/2026-09-14-accounts-setup-runbook.md ("Numbered positions")
-- and keep its output: it lists every position this clears.
--
-- Safe to apply twice: the type change runs only while the column is not yet
-- smallint.

begin;

set role postgres;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'team_players'
       and column_name = 'position' and data_type <> 'smallint'
  ) then
    alter table public.team_players
      alter column position type smallint using (
        case
          when lower(trim(position::text)) in ('goalkeeper', 'gk', 'keeper', 'goal keeper') then 1
          when position::text ~ '^\s*([1-9]|1[01])\s*$' then trim(position::text)::smallint
          else null
        end
      );
  end if;
end $$;

alter table public.team_players drop constraint if exists team_players_position_range;
alter table public.team_players add constraint team_players_position_range
  check (position is null or position between 1 and 11);

comment on column public.team_players.position is
  'Soccer position number: 1 goalkeeper, 2-6 defence, 7-11 attack. Null when not set. Meaning lives in src/domain/position.ts.';

commit;
