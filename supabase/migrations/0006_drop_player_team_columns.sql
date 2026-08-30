-- supabase/migrations/0006_drop_player_team_columns.sql
--
-- MIGRATION B OF TWO. Apply ONLY after 0005 is applied, the application change
-- is deployed, and the runbook's checks pass. This file destroys data: the
-- columns it drops are the originals that 0005 copied into team_players.
--
-- Before running, confirm the copy is good:
--   select count(*) from public.team_players;   -- expect 11
--   select count(*) from public.players;        -- expect 11
--
-- Rollback: there is none. Re-add the columns and restore from a backup.
-- That asymmetry is why this is a separate file rather than the tail of 0005.

alter table public.players
  drop column if exists number,
  drop column if exists position,
  drop column if exists season_stats,
  drop column if exists ratings,
  drop column if exists matrix_stats,
  drop column if exists school_id;

alter table public.schedule    drop column if exists school_id;
alter table public.matrix_logs drop column if exists school_id;
