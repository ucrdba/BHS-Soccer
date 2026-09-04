-- Venue addresses for the away fixtures.
--
-- Data, not schema: run it once in the Supabase SQL editor. It does not
-- belong in supabase/migrations/, which is for structure.
--
-- ── Where these came from ─────────────────────────────────────────────────
--
-- The California Department of Education's public school directory
-- (https://www.cde.ca.gov/ds/si/ds/pubschls.asp), filtered to ACTIVE high
-- schools, matched by name. Not typed from memory: an invented address sends
-- a parent to the wrong town, which is the failure the directions link exists
-- to prevent.
--
-- CDE warns the directory is self-reported and may be stale, so treat these
-- as good defaults rather than gospel. One caveat it cannot cover: a school's
-- STREET address is its main campus, and a soccer field is occasionally on a
-- separate site. If a venue turns out to be elsewhere, edit that fixture in
-- the app -- Schedule -> Edit -> Venue address.
--
-- ── The one ambiguous name ────────────────────────────────────────────────
--
-- "Redlands" matches two schools in Redlands Unified: Redlands Senior High
-- and Redlands East Valley High. This schedule lists "Redlands East Valley"
-- as its own opponent on the home fixtures, so bare "Redlands" is Redlands
-- Senior High (840 E Citrus Ave). REV is 31000 E Colton Ave -- a different
-- road, not a typo of the other.
--
-- ── What it touches ───────────────────────────────────────────────────────
--
--   * AWAY fixtures only. A home fixture never shows a directions link, so an
--     address on one would be dead weight.
--   * Only where venue_address IS NULL, so anything you have already typed
--     survives re-running this.
--   * Every team with that opponent, not just Varsity -- JV drives to the
--     same schools.
--
-- Safe to run twice: the second run reports 0 rows.

begin;

set role postgres;

update public.schedule s
   set venue_address = v.address
  from (values
    ('Sultana',        '17311 Sultana Avenue, Hesperia, CA 92345'),  -- Sultana High
    ('El Toro',        '25255 Toledo Way, Lake Forest, CA 92630'),  -- El Toro High
    ('Moreno Valley',  '23300 Cottonwood Avenue, Moreno Valley, CA 92553'),  -- Moreno Valley High
    ('Anaheim',        '811 West Lincoln Avenue, Anaheim, CA 92805'),  -- Anaheim High
    ('Upland',         '565 West 11th Street, Upland, CA 91786'),  -- Upland High
    ('Banning',        '100 West Westward, Banning, CA 92220'),  -- Banning High
    ('Redlands',       '840 East Citrus Avenue, Redlands, CA 92374'),  -- Redlands Senior High
    ('Cajon',          '1200 Hill Drive, San Bernardino, CA 92407'),  -- Cajon High
    ('Citrus Valley',  '800 West Pioneer Avenue, Redlands, CA 92374'),  -- Citrus Valley High
    ('Yucaipa',        '33000 Yucaipa Boulevard, Yucaipa, CA 92399')  -- Yucaipa High
  ) as v(opponent, address)
 where s.opponent      = v.opponent
   and s.is_home       is false
   and s.venue_address is null
   and coalesce(s.is_deleted, false) = false;

commit;

-- ── Verify ────────────────────────────────────────────────────────────────
--
-- Every away fixture should now name a street. Anything still blank is an
-- opponent this script does not cover -- add it by hand in the app.
--
--   select match_date, opponent, venue_address
--     from public.schedule
--    where is_home is false
--      and coalesce(is_deleted, false) = false
--    order by match_on;
--
-- ── Undo ──────────────────────────────────────────────────────────────────
--
--   update public.schedule set venue_address = null where is_home is false;
