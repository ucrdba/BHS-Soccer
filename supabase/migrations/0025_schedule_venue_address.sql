-- 0025 — an address for the away venue.
--
-- ── Why a column and not a lookup ─────────────────────────────────────────
--
-- The schedule already has `location`, but it is free text describing WHERE
-- loosely, and after the Location→Opponent fallback the away fixtures hold
-- bare opponent names: 'Sultana', 'Redlands', 'Cajon'. Those are not
-- destinations. Handed to a map, 'Redlands' drops a pin in the middle of a
-- city of 70,000 rather than at the school's field — and this schedule
-- contains BOTH 'Redlands' and 'Redlands East Valley', so even a human
-- cannot resolve the short one without knowing the league.
--
-- So directions need an address the coach states, not one the app infers.
-- `venue_address` is that: nullable, free text, and the directions link on
-- the AWAY badge appears only when it is filled. No address, no link — a
-- link to the wrong town is worse than no link at all.
--
-- Nullable is the point, not an oversight. Nineteen fixtures already exist,
-- home fixtures never need one, and a club playing on a park pitch may have
-- nothing a directory would recognise.
--
-- ── Conventions ───────────────────────────────────────────────────────────
--
--   set role postgres      the SQL editor may run as a MEMBER of postgres
--                          without defaulting to it. ALTER TABLE checks
--                          OWNERSHIP rather than privilege, so it fails with
--                          42501 even when the privilege is reachable.
--                          See the top of 0009.
--
--   add column if not exists   rather than `alter column`, so this is correct
--                          against the live database whether or not it
--                          matches supabase_schema.sql — which has drifted,
--                          and has cost a failed migration three times.
--
-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- Nothing to do. Policies in supabase_migration_auth.sql are table-wide:
-- `schedule_select` allows anyone to read a row that is not soft-deleted,
-- and `schedule_write` allows a write only when current_profile_role() is
-- coach or admin. A new column inherits both. Reading stays public on
-- purpose — a parent driving to an away game is the entire point.
--
-- ── Rollback ──────────────────────────────────────────────────────────────
--
--   begin;
--     set role postgres;
--     alter table public.schedule drop column if exists venue_address;
--   commit;
--
-- Dropping it discards every address typed since this ran; they are not
-- recoverable from anywhere else. Export the column first if that matters:
--
--   select id, opponent, match_date, venue_address
--     from public.schedule
--    where venue_address is not null;

begin;

set role postgres;

alter table public.schedule
  add column if not exists venue_address text;

comment on column public.schedule.venue_address is
  'Street address of the venue, as stated by a coach. Drives the directions '
  'link on the AWAY badge, which is hidden while this is null. Distinct from '
  '`location`, which is a loose human label ("Cougar Stadium", or just the '
  'opponent name) and is not navigable.';

commit;

-- ── Verify ────────────────────────────────────────────────────────────────
--
-- Should return one row naming the column:
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name   = 'schedule'
--      and column_name  = 'venue_address';
