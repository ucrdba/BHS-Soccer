-- 0026 — the competition an organization plays in.
--
-- ── Why ───────────────────────────────────────────────────────────────────
--
-- The strip across the top of every page read "Citrus Belt League •
-- Beaumont, CA", written into index.html by hand. The city half already had
-- somewhere to live — schools.city, which a coach can edit in the school
-- profile — but the league had nowhere, so it was simply typed into the
-- markup and was wrong for every organization except one.
--
-- This database already holds four organizations, two of them clubs. A club
-- plays in a club league, not the Citrus Belt.
--
-- ── Nullable, deliberately ────────────────────────────────────────────────
--
-- A team may not play in a named competition at all — a club side arranging
-- friendlies, a school between affiliations. The banner shows whichever of
-- league and city is set, and neither is required.
--
-- ── Conventions ───────────────────────────────────────────────────────────
--
--   set role postgres      the SQL editor may run as a MEMBER of postgres
--                          without defaulting to it, and ALTER TABLE checks
--                          OWNERSHIP rather than privilege. See 0009.
--
--   add column if not exists   correct whether or not the live database
--                          matches supabase_schema.sql, which has drifted.
--
-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- Nothing to do. The policies on public.schools are table-wide, so a new
-- column inherits them: anyone may read a row that is not soft-deleted, and
-- only a coach or admin may write. Reading is public on purpose — the banner
-- is the first thing a parent sees, signed in or not.
--
-- ── Rollback ──────────────────────────────────────────────────────────────
--
--   begin;
--     set role postgres;
--     alter table public.schools drop column if exists league;
--   commit;

begin;

set role postgres;

alter table public.schools
  add column if not exists league text;

comment on column public.schools.league is
  'The competition this organization plays in, as it should be displayed — '
  '"Citrus Belt League", "SoCal Developmental". Shown in the page banner '
  'beside city. Null when the organization plays no named competition.';

-- Beaumont's own, so the banner keeps saying what it said before rather than
-- losing half its line the moment this runs. Every other organization starts
-- null and sets its own in the school profile.
update public.schools
   set league = 'Citrus Belt League'
 where code = 'bhs'
   and league is null;

commit;

-- ── Verify ────────────────────────────────────────────────────────────────
--
--   select code, name, kind, league, city
--     from public.schools
--    where coalesce(is_deleted, false) = false
--    order by kind, name;
--
-- Beaumont should read "Citrus Belt League"; the rest are blank until their
-- coach fills them in under Admin → School profile.
