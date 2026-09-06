-- demo_auth_open.sql — self-serve coach accounts
--
-- ██ DEMO PROJECT ONLY. NEVER APPLY THIS TO PRODUCTION. ██
--
-- It makes every single person who signs up an active coach with no approval
-- and no email confirmation. On production that is a total loss of access
-- control: any stranger would get a coach's view of real students' records.
--
-- This file therefore lives in Resouces/SQL/demo/ and MUST NOT be moved or
-- copied into supabase/migrations/, which is production's directory and gets
-- applied there. Nothing in supabase/migrations/ may ever reference it.
--
-- Section 0 below refuses to run on a database that looks like production.
-- That guard is a safety net, not permission to be careless: check the project
-- ref in the address bar before you run this.
--
-- ── What it does ──────────────────────────────────────────────────────────
--
-- Production's signup lands a new user at role 'guest', status
-- 'pending_verification' or 'pending_approval', attached to whichever
-- organization has code 'bhs'. A coach then approves them.
--
-- Here, a visitor picks a username and a password and is immediately a coach
-- of their own organization, with their own team, able to write. Everything
-- else — RLS, the policies, is_team_coach() — is production's, unchanged. The
-- difference is entirely in which role and status the trigger writes, which is
-- why a demo write behaves exactly as the same write does on the real site.
--
-- ── Prerequisite ──────────────────────────────────────────────────────────
--
-- Email confirmation must be OFF (mailer_autoconfirm true). Visitor addresses
-- are <username>@demo.invalid and can never receive mail, so with
-- confirmation on, every signup would create a user who can never sign in.
--
-- ── Apply order ───────────────────────────────────────────────────────────
--
--   1. demo_schema.sql        the structure                    (done)
--   2. demo_auth_open.sql     this file
--   3. demo_seed.sql          the template, and cloning it
--   4. demo_expire.sql        the 48-hour sweep
--
-- Step 3 replaces public.demo_new_org() — see section 4. Until it does, a
-- visitor gets an empty organization with one team, which is usable: they can
-- add players and fixtures immediately, just with nothing there to start from.

begin;

set role postgres;

-- ─── 0. Refuse to run on production ────────────────────────────────────────
--
-- Beaumont High School and Legends FC exist on production and will never
-- exist on the demo, whose organizations are all invented. Their presence is
-- the clearest available signal that someone has pasted this into the wrong
-- SQL editor.

do $$
begin
  if exists (select 1 from public.schools where code in ('bhs', 'lfc')) then
    raise exception
      'REFUSING TO RUN: this database contains Beaumont High School or Legends FC, so it is production. demo_auth_open.sql would make every new signup an active coach over real students'' records. Check the project ref.';
  end if;
end $$;

-- ─── 1. Demo-only bookkeeping ──────────────────────────────────────────────
--
-- These tables exist ONLY on the demo. They are deliberately separate tables
-- rather than columns on public.schools: the demo's schema has to keep
-- matching production's for the app to behave identically, and adding columns
-- to a shared table is how that stops being true. The app never reads these;
-- only the functions below and demo_expire.sql do.

create table if not exists public.demo_settings (
  singleton     boolean  primary key default true check (singleton),
  -- The cap on how many visitor organizations may exist at once. A setting
  -- rather than a constant because the right number is unknown until somebody
  -- shares the link, and a number that needs a deploy to change is a number
  -- nobody adjusts at the moment it matters.
  max_live_orgs integer  not null default 10 check (max_live_orgs >= 0),
  -- How long a visitor's work survives. 48 hours because a coach who tries
  -- this in the evening comes back after school the next day, which is when
  -- they actually have time to look properly.
  expire_after  interval not null default '48 hours'
);

insert into public.demo_settings (singleton) values (true)
on conflict (singleton) do nothing;

create table if not exists public.demo_orgs (
  school_id  uuid primary key references public.schools(id) on delete cascade,
  kind       text not null check (kind in ('template', 'visitor')),
  owner_id   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Exactly one template, enforced rather than assumed. Cloning the wrong
-- organization would hand every future visitor somebody else's edits.
create unique index if not exists demo_orgs_one_template
  on public.demo_orgs (kind) where kind = 'template';

create index if not exists demo_orgs_created_idx
  on public.demo_orgs (created_at) where kind = 'visitor';

-- No policies, so PostgREST exposes nothing: RLS with no policy denies every
-- row to anon and authenticated. The functions below reach these tables as
-- security definer, which is not subject to that.
alter table public.demo_settings enable row level security;
alter table public.demo_orgs     enable row level security;

revoke all on public.demo_settings from anon, authenticated;
revoke all on public.demo_orgs     from anon, authenticated;

-- ─── 2. Capacity ───────────────────────────────────────────────────────────
--
-- Two bounds working together. The expiry limits how long anything lives; the
-- cap limits how much exists at once. Expiry alone allows a thousand signups
-- in an hour; a cap alone fills permanently and then refuses everyone.

create or replace function public.demo_capacity()
returns table (live integer, max_live integer, is_full boolean)
language sql
security definer
stable
set search_path = public
as $$
  -- count(o.school_id), never count(*): this is a left join, so on an empty
  -- demo count(*) would count the settings row itself and report one live
  -- organization that does not exist.
  select
    count(o.school_id)::integer                as live,
    s.max_live_orgs                            as max_live,
    count(o.school_id) >= s.max_live_orgs      as is_full
  from public.demo_settings s
  left join public.demo_orgs o
    on o.kind = 'visitor'
   and o.created_at > now() - s.expire_after
  group by s.max_live_orgs;
$$;

-- The page calls this BEFORE signing anyone up, so a full demo can say
-- something true and useful instead of surfacing a database error. It is not
-- the enforcement — section 3 is. A cap checked only by the page is not a cap,
-- and this one exists to stop a script.
grant execute on function public.demo_capacity() to anon, authenticated;

-- ─── 3. What a new signup gets ─────────────────────────────────────────────

create or replace function public.demo_new_org(display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_school uuid;
begin
  insert into public.schools (code, name, mascot, kind, city)
  values (
    -- Unique per organization and meaningless on purpose: nothing in the demo
    -- should be found by a hardcoded school code, which is the habit that made
    -- 'bhs' hard to remove from the real app.
    'demo-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    display_name,
    'Demo',
    'school',
    'Anytown'
  )
  returning id into new_school;

  insert into public.demo_orgs (school_id, kind) values (new_school, 'visitor');

  insert into public.teams (school_id, name, season, is_public_default)
  values (new_school, 'Varsity', to_char(now(), 'YYYY'), true);

  return new_school;
end;
$$;

comment on function public.demo_new_org(text) is
  'Creates one visitor organization and returns its id. demo_seed.sql REPLACES '
  'this with a version that clones the template organization instead of '
  'creating an empty one. Keep the signature: handle_new_user() calls it.';

-- ─── 4. The signup trigger ─────────────────────────────────────────────────
--
-- Replaces the production handle_new_user() from
-- supabase/migrations/0013_signup_without_email_confirmation.sql. The
-- differences, and only these:
--
--   role          'coach'  rather than 'guest'
--   status        'active' rather than pending_verification/pending_approval
--   school_id     a NEW organization, rather than whichever has code 'bhs'
--   plus a team, and a team_coaches row, without which the coach can write
--   nothing: is_team_coach() requires both the role AND the membership.
--
-- Ordering matters here and is not free to rearrange. The organization is
-- created BEFORE the profile row because guard_profile_privileged_columns
-- (supabase_migration_auth.sql) raises on any later change to a profile's
-- school_id by a non-admin — so the value has to be right at insert. The
-- team_coaches rows come after, because their profile_id references a profile
-- that must already exist.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  visitor_name text;
  new_school   uuid;
  full_now     boolean;
begin
  select is_full into full_now from public.demo_capacity();

  if coalesce(full_now, false) then
    -- Aborts the signup in the database, where it cannot be bypassed. GoTrue
    -- usually reports this to the browser as a generic "Database error saving
    -- new user", which is why the page should call demo_capacity() first and
    -- say something human. This is the backstop, not the message.
    raise exception 'DEMO_FULL: the demo is at its limit of live programs; they clear after the expiry window.';
  end if;

  -- A username, not an address: <username>@demo.invalid is what Supabase Auth
  -- stores, and the visitor never sees it.
  visitor_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    initcap(split_part(new.email, '@', 1))
  );

  new_school := public.demo_new_org(visitor_name || '''s Program');

  insert into public.profiles (
    id, school_id, name, email, role, requested_role, status, email_verified, team_level
  )
  values (
    new.id,
    new_school,
    visitor_name,
    new.email,
    'coach',
    'coach',
    'active',
    true,
    'Coaching Staff'
  );

  update public.demo_orgs set owner_id = new.id where school_id = new_school;

  -- Every team in the new organization, so this still does the right thing
  -- once demo_new_org clones a template that has several.
  insert into public.team_coaches (team_id, profile_id)
  select t.id, new.id from public.teams t where t.school_id = new_school
  on conflict (team_id, profile_id) do nothing;

  return new;
end;
$$;

-- ─── 5. Do not undo it later ───────────────────────────────────────────────
--
-- handle_user_confirmed fires on an UPDATE of email_confirmed_at and, on
-- production, moves a profile from pending_verification into the approval
-- queue. With confirmation off it should never fire at all — but if it ever
-- did, production's version would knock an active demo coach back to
-- 'pending_approval' and there is no admin here to rescue them. So the demo's
-- version touches nothing that is already settled.

create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set email_verified = true,
         status = 'active'
   where id = new.id
     and status = 'pending_verification';
  return new;
end;
$$;

commit;

-- ─── Verify ────────────────────────────────────────────────────────────────
--
-- 1. Capacity reads clean on an empty demo — expect live 0, max_live 10, false:
--
--      select * from public.demo_capacity();
--
-- 2. Sign up a probe account (the app, or Authentication → Users → Add user)
--    as probe@demo.invalid, then:
--
--      select p.email, p.role, p.status, s.name as organization, s.code,
--             t.name as team, (tc.profile_id is not null) as can_write
--        from public.profiles p
--        join public.schools s  on s.id = p.school_id
--        left join public.teams t on t.school_id = s.id
--        left join public.team_coaches tc
--               on tc.team_id = t.id and tc.profile_id = p.id
--       where p.email = 'probe@demo.invalid';
--
--    Expect role 'coach', status 'active', an organization named
--    "Probe's Program" with a demo- code, one team 'Varsity', can_write true.
--
-- 3. Remove the probe (this cascades to its organization through demo_orgs):
--
--      delete from auth.users where email = 'probe@demo.invalid';
--      delete from public.schools s
--       where exists (select 1 from public.demo_orgs o
--                      where o.school_id = s.id and o.owner_id is null)
--         and s.code like 'demo-%';
--
-- ─── Rollback ──────────────────────────────────────────────────────────────
--
-- Restores production's signup behaviour. Existing demo coaches keep their
-- accounts; only new signups change.
--
--   Re-run the handle_new_user() and handle_user_confirmed() definitions from
--   supabase/migrations/0013_signup_without_email_confirmation.sql and
--   supabase_migration_auth.sql respectively, then:
--
--     drop function if exists public.demo_new_org(text);
--     drop function if exists public.demo_capacity();
--     drop table if exists public.demo_orgs;
--     drop table if exists public.demo_settings;
