-- demo_accounts.sql — the nine demo accounts: their copies, their profiles, the locks
--
-- ██ DEMO PROJECT ONLY. NEVER APPLY THIS TO PRODUCTION. ██
--
-- Applied by the nightly rebuild after demo_seed.sql. The sign-in accounts
-- themselves (auth.users, demo1..demo9@demo.invalid) are created ONCE by
-- scripts/demo-create-accounts.mjs through Supabase's Admin API and never
-- dropped; this file gives each a fresh copy of the sample program and a
-- profile tied to it, every night.
--
-- Roles match src/demo.ts DEMO_ACCOUNTS: demo1-7 coaches, demo8 a player,
-- demo9 an admin. src/data/testdb/demo-accounts.test.ts checks the two agree.
--
-- Spec: docs/superpowers/specs/2026-09-11-demo-accounts-design.md §5.5, §5.6, §6.2.

begin;

set role postgres;

-- ─── 0. Refuse to run on production ────────────────────────────────────────

do $$
begin
  if exists (select 1 from public.schools where code in ('bhs', 'lfc')) then
    raise exception
      'REFUSING TO RUN: this database contains Beaumont High School or Legends FC, so it is production. Check the project ref.';
  end if;
end $$;

-- ─── 1. The locks ──────────────────────────────────────────────────────────
--
-- Demo logins are public, so without these one visitor could lock out the next:
-- by changing a demo account's password or email through Supabase's auth API
-- from the browser console, or -- as demo9, since production's profiles_update
-- lets any admin edit any profile -- by demoting, deleting or re-pointing the
-- other eight. The profile lock covers the profiles the rebuild has built, not
-- every demo address, so an account re-created between rebuilds can still be
-- confirmed. A third lock keeps the rebuild itself running: it refuses a
-- school coded 'bhs' or 'lfc', which the rebuild's guard would take for
-- production.
--
-- The rebuild itself passes all three: demo_build_accounts sets
-- demo.rebuilding = 'on' for its own writes and turns it off again before it
-- returns.

create or replace function public.demo_is_rebuilding()
returns boolean
language sql
stable
as $$ select coalesce(current_setting('demo.rebuilding', true), '') = 'on' $$;

-- security definer: it calls demo_is_rebuilding(), which visitors may not
-- execute; without this it would run as the role that fired the trigger.
create or replace function public.demo_lock_auth_users()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.demo_is_rebuilding() then return new; end if;
  if old.email ~ '^demo[1-9]@demo\.invalid$'
     and (new.email is distinct from old.email
          or new.encrypted_password is distinct from old.encrypted_password) then
    raise exception 'Demo accounts cannot change their email or password.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists demo_lock_auth_users on auth.users;
-- Only on the two columns: GoTrue updates other columns (last_sign_in_at) on
-- every sign-in, and those must not fire this.
create trigger demo_lock_auth_users
  before update of email, encrypted_password on auth.users
  for each row execute function public.demo_lock_auth_users();

-- Only the profiles demo_build_accounts has built: a demo address AND a school
-- demo_orgs records as an account's copy. An account created between rebuilds
-- (scripts/demo-create-accounts.mjs) has no copy yet, and must stay writable:
-- GoTrue's admin create inserts the user and then confirms it in a second
-- statement, which fires handle_user_confirmed and moves the new profile's
-- status. Locked, that fails and createUser reports "Database error creating
-- new user". The next rebuild builds the account, and from then on it is
-- locked; a built profile cannot unbuild itself, since moving its school_id is
-- refused.
--
-- security definer: it calls demo_is_rebuilding(), which visitors may not
-- execute, and reads demo_orgs, which is revoked from them; without this it
-- would run as the role that fired the trigger.
create or replace function public.demo_lock_profiles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.demo_is_rebuilding() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if old.email ~ '^demo[1-9]@demo\.invalid$'
     and exists (select 1 from public.demo_orgs o
                  where o.school_id = old.school_id and o.kind = 'account') then
    if tg_op = 'DELETE' then
      raise exception 'Demo accounts cannot be deleted.' using errcode = '42501';
    end if;
    -- demo9 is an admin: without this it could re-point a demo profile at an
    -- orphan auth.users row.
    if new.id is distinct from old.id then
      raise exception 'Demo accounts cannot change their id.' using errcode = '42501';
    end if;
    if new.role       is distinct from old.role
       or new.status     is distinct from old.status
       or new.school_id  is distinct from old.school_id
       or new.player_id  is distinct from old.player_id
       or new.is_deleted is distinct from old.is_deleted
       or new.email      is distinct from old.email then
      raise exception 'Demo accounts cannot change their role, status, organization, player link or email.'
        using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists demo_lock_profiles on public.profiles;
create trigger demo_lock_profiles
  before update or delete on public.profiles
  for each row execute function public.demo_lock_profiles();

-- The rebuild's guard (GUARD_SQL in scripts/demo-rebuild-lib.mjs) refuses any
-- database holding a school coded 'bhs' or 'lfc': that is how it recognises
-- production. Production's schools_write lets any coach or admin create or
-- recode an organization, and schools.code defaults to 'bhs', so without this
-- one visitor could make every rebuild after them refuse to run -- and with
-- it the nightly restore that bounds everything else a visitor can do. The
-- guard is kept strict on purpose; the demo refuses the two codes instead.
--
-- security definer: it calls demo_is_rebuilding(), which visitors may not
-- execute; without this it would run as the role that fired the trigger.
create or replace function public.demo_lock_reserved_codes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.demo_is_rebuilding() then return new; end if;
  if lower(coalesce(new.code, '')) in ('bhs', 'lfc') then
    raise exception 'That short code is reserved on the demo site. Choose another.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists demo_lock_reserved_codes on public.schools;
create trigger demo_lock_reserved_codes
  before insert or update of code on public.schools
  for each row execute function public.demo_lock_reserved_codes();

-- ─── 2. The accounts ───────────────────────────────────────────────────────

create or replace function public.demo_build_accounts()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  template uuid;
  copy     uuid;
  uid      uuid;
  pid      uuid;
  em       text;
  n        int;
begin
  perform set_config('demo.rebuilding', 'on', true);

  select school_id into template from public.demo_orgs where kind = 'template';
  if template is null then
    raise exception 'demo_build_accounts: there is no template. demo_seed_template() runs first.';
  end if;

  for n in 1..9 loop
    em := format('demo%s@demo.invalid', n);
    select id into uid from auth.users where email = em;
    if uid is null then
      raise exception 'demo_build_accounts: the sign-in account % is missing. Run scripts/demo-create-accounts.mjs.', em;
    end if;

    copy := public.demo_clone_org(template, 'Riverside High School');
    update public.schools set code = format('demo%s', n) where id = copy;
    insert into public.demo_orgs (school_id, kind, account_no) values (copy, 'account', n);

    -- Written directly, not through the sign-up trigger: that is production's
    -- handle_new_user, and here it would find no 'bhs' school (the guard above
    -- forbids one) and leave school_id null on a pending guest profile.
    insert into public.profiles (id, school_id, name, email, role, status, email_verified)
    values (uid, copy,
            case when n <= 7 then format('Demo Coach %s', n) when n = 8 then 'Demo Player' else 'Demo Admin' end,
            em,
            case when n <= 7 then 'coach' when n = 8 then 'player' else 'admin' end,
            'active', true)
    on conflict (id) do update
      set school_id = excluded.school_id, name = excluded.name, email = excluded.email,
          role = excluded.role, status = excluded.status, player_id = null,
          is_deleted = false, email_verified = true;

    if n <= 7 then
      insert into public.team_coaches (team_id, profile_id)
      select t.id, uid from public.teams t where t.school_id = copy;
    elsif n = 8 then
      -- A Varsity player in demo8's own copy, so the active message and the
      -- quiz are theirs.
      select tp.player_id into pid
        from public.team_players tp
        join public.teams t on t.id = tp.team_id
       where t.school_id = copy and t.name = 'Varsity' and tp.recording_number = 7;
      update public.profiles set player_id = pid where id = uid;
    end if;
  end loop;

  -- Off again: set_config(..., true) lasts until the transaction ends, and the
  -- rebuild's transaction carries on after this.
  perform set_config('demo.rebuilding', 'off', true);
end;
$$;

comment on function public.demo_build_accounts() is
  'Gives demo1..demo9 each a fresh copy of the template and a profile tied to '
  'it. Fails naming the account if a sign-in account is missing.';

revoke all on function public.demo_build_accounts()   from public, anon, authenticated;
revoke all on function public.demo_is_rebuilding()    from public, anon, authenticated;
revoke all on function public.demo_lock_auth_users()  from public, anon, authenticated;
revoke all on function public.demo_lock_profiles()    from public, anon, authenticated;
revoke all on function public.demo_lock_reserved_codes() from public, anon, authenticated;

commit;
