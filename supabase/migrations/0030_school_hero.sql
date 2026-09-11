-- 0030: an organization's photo, for the home page band.
--
-- The home page opens on a band holding the next match, over the
-- organization's own photo -- or its colour when it has none (spec
-- docs/superpowers/specs/2026-09-10-home-hero-design.md). Like the name,
-- mascot, colours and logo, the photo belongs to the organization's row: a
-- club has its own, and nothing in the client may choose one.
--
-- A URL, as for the logo (0028): root-relative (/img/...) for a file shipped
-- with the app, or http(s) for one hosted elsewhere. The client refuses
-- anything else -- safeImageUrl in src/domain/theme.ts -- because an admin
-- types it and it is rendered on a public page.
--
-- Nothing reads the column by name until it exists: fetchSchools and
-- fetchSchool select *, and the profile form writes hero_url only when the
-- row it loaded already has the column. The client may ship before this is
-- applied; the band shows the organization's colour until it is.
--
-- After applying, give an organization its photo from Admin -> Organization
-- profile, or directly:
--   update public.schools set hero_url = '/img/<file>' where code = '<code>';

begin;
set role postgres;

alter table public.schools
  add column if not exists hero_url text;

comment on column public.schools.hero_url is
  'The organization''s photo for the home page band: a root-relative path (/img/...) or an http(s) URL.';

commit;
