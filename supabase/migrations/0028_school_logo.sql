-- 0028: an organization's logo.
--
-- The public home page shows the organization's logo where the coach's daily
-- message used to be, now that the message is for the squad only. Like the
-- name, mascot and colours, the logo belongs to the organization's row: a club
-- has its own, and nothing in the client may choose one.
--
-- A URL rather than a stored image. Root-relative (/img/...) for a file
-- shipped with the app, or https:// for one hosted anywhere else. The client
-- refuses anything else -- see safeLogoUrl in src/domain/theme.ts -- because
-- this is edited by an admin and rendered into an <img> on a public page.
--
-- `add column if not exists`, so it is safe to run twice and correct against
-- both the live database and the declared schema.
--
-- Nothing reads the column by name until it exists: fetchSchools and
-- fetchSchool select `*`, and the profile form only writes logo_url when the
-- row it loaded already has the column. So the client may ship before this
-- is applied; the logo simply does not appear until it is.
--
-- After applying, give an organization its logo from Admin -> Organization
-- profile, or directly:
--   update public.schools set logo_url = '/img/<file>' where code = '<code>';

begin;
set role postgres;

alter table public.schools
  add column if not exists logo_url text;

comment on column public.schools.logo_url is
  'The organization''s logo: a root-relative path (/img/...) or an http(s) URL. Shown on the public home page.';

commit;
