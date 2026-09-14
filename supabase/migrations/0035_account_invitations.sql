-- 0035: invitations, and the confirmation that is the only place access is granted
--
-- Spec: docs/superpowers/specs/2026-09-14-account-invitations-design.md
--
-- APPLY BEFORE DEPLOYING THE MATCHING CLIENT. The current client sends no
-- requested_team_id, so until it is deployed its player and coach sign-ups
-- become pending requests with no team, which pending_requests() shows to
-- admins.
--
-- Supersedes the sign-up half of supabase_migration_auth.sql and of 0013: both
-- triggers on auth.users are replaced, and re-created with drop-if-exists, so
-- this is correct whichever of those the live functions came from.

begin;

set role postgres;

-- ─── 1. invitations ────────────────────────────────────────────────────────
--
-- Emails live here and never on players, which is publicly readable: many of
-- these addresses belong to minors. Readable by the team's coaches and admins
-- only (is_team_coach includes admins), and closed in the migration that
-- creates the table -- 0001 exists because a readable email column shipped
-- once already. There is no insert, update or delete policy: every write goes
-- through the functions in section 5.

create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(email)),
  school_id   uuid not null,
  team_id     uuid not null,
  role        text not null check (role in ('player', 'coach')),
  player_id   uuid references public.players(id),
  invited_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  revoked_at  timestamptz,
  foreign key (team_id, school_id) references public.teams (id, school_id),
  check ((role = 'player') = (player_id is not null))
);

create unique index if not exists invitations_open_email_team
  on public.invitations (email, team_id)
  where accepted_at is null and revoked_at is null;

alter table public.invitations enable row level security;

drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations
  for select using (public.is_team_coach(team_id));

revoke all on table public.invitations from anon, authenticated;
grant select on table public.invitations to authenticated;

alter table public.profiles
  add column if not exists requested_team_id uuid references public.teams(id) on delete set null;

-- ─── 2. The guard on privileged profile columns ────────────────────────────
--
-- SECURITY INVOKER, so current_user is whoever is actually writing. A visitor's
-- own update arrives as `authenticated`; the approval functions and the
-- confirmation triggers are SECURITY DEFINER and write as their owner. Checking
-- auth.uid() alone cannot tell those apart -- inside a definer function it is
-- still the coach's id, taken from the request's JWT -- so every approval by a
-- coach would be refused.
--
-- It must not reference the auth schema itself: running as the visitor, a
-- name lookup in `auth` needs USAGE on that schema, which a plain Postgres does
-- not grant. current_profile_role() is SECURITY DEFINER and reads auth.uid() as
-- its owner, and a request with no user cannot reach this row through
-- profiles_update in the first place.
--
-- player_id and requested_team_id join the guarded columns: a visitor who could
-- set their own player_id could attach themselves to any roster entry and read
-- that team's members-only content.

create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if public.current_profile_role() = 'admin' then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.school_id is distinct from old.school_id
     or new.player_id is distinct from old.player_id
     or new.requested_team_id is distinct from old.requested_team_id then
    raise exception 'Only an admin can change role, status, school, roster link or requested team.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_columns on public.profiles;
create trigger guard_profile_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- ─── 3. promote_confirmed_profile: the one place access is granted ─────────
--
-- Only a profile still at pending_verification is touched, so a later
-- confirmation cannot knock a settled account back into the queue.

create or replace function public.promote_confirmed_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prof     public.profiles%rowtype;
  inv      public.invitations%rowtype;
  redeemed integer := 0;
  school   uuid;
begin
  select * into prof from public.profiles where id = p_user_id for update;
  if not found or prof.status <> 'pending_verification' then
    return;
  end if;

  -- Invitations naming different roster entries: apply none. Guessing which
  -- person someone is puts a player on a squad they never played for.
  if (select count(distinct i.player_id)
        from public.invitations i
       where i.email = lower(prof.email)
         and i.accepted_at is null and i.revoked_at is null
         and i.role = 'player') > 1 then
    update public.profiles set status = 'pending_approval', email_verified = true where id = p_user_id;
    return;
  end if;

  for inv in
    select * from public.invitations i
     where i.email = lower(prof.email)
       and i.accepted_at is null and i.revoked_at is null
     order by i.created_at
  loop
    if inv.role = 'player' then
      -- The roster entry may have been claimed by another account since.
      if exists (select 1 from public.profiles p where p.player_id = inv.player_id and p.id <> p_user_id) then
        continue;
      end if;
      update public.profiles
         set player_id = inv.player_id,
             role = case when role = 'coach' then 'coach' else 'player' end
       where id = p_user_id;
    else
      insert into public.team_coaches (team_id, profile_id)
      values (inv.team_id, p_user_id)
      on conflict do nothing;
      update public.profiles set role = 'coach' where id = p_user_id;
    end if;

    -- The first organization redeemed is the one the profile names.
    school := coalesce(school, inv.school_id);
    update public.invitations set accepted_at = now(), accepted_by = p_user_id where id = inv.id;
    redeemed := redeemed + 1;
  end loop;

  if redeemed > 0 then
    update public.profiles
       set status = 'active', email_verified = true, school_id = school
     where id = p_user_id;
  elsif prof.requested_role in ('player', 'coach') then
    update public.profiles set status = 'pending_approval', email_verified = true where id = p_user_id;
  else
    update public.profiles set status = 'active', role = 'guest', email_verified = true where id = p_user_id;
  end if;
end;
$$;

revoke all on function public.promote_confirmed_profile(uuid) from public, anon, authenticated;

-- ─── 4. The triggers on auth.users ─────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text := lower(coalesce(new.raw_user_meta_data ->> 'requested_role', 'guest'));
  team_text text := new.raw_user_meta_data ->> 'requested_team_id';
  team      public.teams%rowtype;
begin
  -- The metadata is written by the browser. Admin, or anything else, is a guest.
  if requested not in ('player', 'coach', 'guest') then
    requested := 'guest';
  end if;

  if requested <> 'guest'
     and team_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into team from public.teams
     where id = team_text::uuid and not coalesce(is_deleted, false);
  end if;

  insert into public.profiles
    (id, school_id, name, email, role, requested_role, requested_team_id, status, email_verified)
  values (
    new.id,
    team.school_id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    'guest',
    requested,
    team.id,
    'pending_verification',
    false
  );

  -- Confirmation switched off, or an account created already confirmed: there
  -- will be no UPDATE for handle_user_confirmed to see.
  if new.email_confirmed_at is not null then
    perform public.promote_confirmed_profile(new.id);
  end if;

  return new;
end;
$$;

create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.promote_confirmed_profile(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

commit;
