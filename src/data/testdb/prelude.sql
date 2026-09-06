-- Everything hosted Supabase provides that a plain Postgres does not.
-- Grepped out of demo_schema.sql and demo_auth_open.sql: nothing else from the
-- platform is referenced, so nothing else is stubbed.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;   -- gen_random_uuid() on older builds

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon;          end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role;  end if;
end $$;

create schema if not exists auth;

-- Only the four columns the SQL under test actually reads.
create table if not exists auth.users (
  id                   uuid primary key default gen_random_uuid(),
  email                text unique,
  email_confirmed_at   timestamptz,
  raw_user_meta_data   jsonb default '{}'::jsonb
);

-- Reads a session setting so a test can impersonate a user:
--   select set_config('request.jwt.claim.sub', '<uuid>', true);
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
