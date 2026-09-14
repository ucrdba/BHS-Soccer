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
-- that team's members-only content. email joins them too: promote_confirmed_profile
-- matches invitations against auth.users.email, the address confirmation proved, but
-- an editable profiles.email would otherwise let a pending account be walked onto an
-- address it does not control before confirming one it does.

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
     or new.email is distinct from old.email
     or new.player_id is distinct from old.player_id
     or new.requested_team_id is distinct from old.requested_team_id then
    raise exception 'Only an admin can change role, status, school, email, roster link or requested team.';
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
  -- profiles.email is the visitor's to edit (until this trigger guards it, an
  -- account still pending_verification could set it to an invited minor's
  -- address and then confirm one it controls). auth.users.email is the
  -- address the confirmation actually proved, so invitations are matched
  -- against that instead.
  proven   text;
begin
  select * into prof from public.profiles where id = p_user_id for update;
  if not found or prof.status <> 'pending_verification' then
    return;
  end if;

  select lower(u.email) into proven from auth.users u where u.id = p_user_id;

  -- Invitations naming different roster entries: apply none. Guessing which
  -- person someone is puts a player on a squad they never played for.
  if (select count(distinct i.player_id)
        from public.invitations i
       where i.email = proven
         and i.accepted_at is null and i.revoked_at is null
         and i.role = 'player') > 1 then
    update public.profiles set status = 'pending_approval', email_verified = true where id = p_user_id;
    return;
  end if;

  for inv in
    select * from public.invitations i
     where i.email = proven
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

-- ─── 5. The functions the app calls ────────────────────────────────────────
--
-- Each checks its caller before doing anything, and refuses with a sentence
-- the app shows as-is. Coaches handle players on their own team; only an admin
-- handles coaches, so a coach can never create another coach.

create or replace function public.create_invitation(
  p_email text, p_team_id uuid, p_role text, p_player_id uuid default null
)
returns public.invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  addr   text := lower(trim(coalesce(p_email, '')));
  team   public.teams%rowtype;
  result public.invitations;
begin
  if addr !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That does not look like an email address.';
  end if;

  select * into team from public.teams where id = p_team_id and not coalesce(is_deleted, false);
  if not found then
    raise exception 'That team does not exist.';
  end if;

  if p_role = 'player' then
    if not public.is_team_coach(p_team_id) then
      raise exception 'Only a coach of this team can invite its players.';
    end if;
    if p_player_id is null or not exists (
      select 1 from public.team_players tp
       where tp.team_id = p_team_id and tp.player_id = p_player_id and not coalesce(tp.is_deleted, false)
    ) then
      raise exception 'That player is not on this team''s roster.';
    end if;
    if exists (select 1 from public.profiles p where p.player_id = p_player_id) then
      raise exception 'That player already has an account.';
    end if;
  elsif p_role = 'coach' then
    if public.current_profile_role() <> 'admin' then
      raise exception 'Only an admin can invite a coach.';
    end if;
    p_player_id := null;
  else
    raise exception 'An invitation is for a player or a coach.';
  end if;

  if exists (
    select 1 from public.invitations i
     where i.email = addr and i.team_id = p_team_id and i.accepted_at is null and i.revoked_at is null
  ) then
    raise exception 'That address already has an open invitation to this team.';
  end if;

  insert into public.invitations (email, school_id, team_id, role, player_id, invited_by)
  values (addr, team.school_id, p_team_id, p_role, p_player_id, auth.uid())
  returning * into result;
  return result;
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations%rowtype;
begin
  select * into inv from public.invitations where id = p_invitation_id;
  if not found then
    raise exception 'That invitation does not exist.';
  end if;
  if inv.role = 'coach' and public.current_profile_role() <> 'admin' then
    raise exception 'Only an admin can withdraw a coach''s invitation.';
  end if;
  if inv.role = 'player' and not public.is_team_coach(inv.team_id) then
    raise exception 'Only a coach of this team can withdraw its invitations.';
  end if;
  if inv.accepted_at is not null then
    raise exception 'That invitation has already been used.';
  end if;
  update public.invitations set revoked_at = now() where id = p_invitation_id and revoked_at is null;
end;
$$;

create or replace function public.pending_requests()
returns table (
  id uuid, name text, email text, requested_role text, requested_team_id uuid,
  team_name text, school_name text, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.email, p.requested_role, p.requested_team_id, t.name, s.name, p.created_at
    from public.profiles p
    left join public.teams t on t.id = p.requested_team_id
    left join public.schools s on s.id = t.school_id
   where p.status = 'pending_approval'
     and not coalesce(p.is_deleted, false)
     and (
       public.current_profile_role() = 'admin'
       or (p.requested_role = 'player'
           and p.requested_team_id is not null
           and public.is_team_coach(p.requested_team_id))
     )
   order by p.created_at;
$$;

create or replace function public.approve_player_request(
  p_profile_id uuid, p_team_id uuid, p_player_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.profiles%rowtype;
  team public.teams%rowtype;
  pid  uuid := p_player_id;
begin
  select * into prof from public.profiles where id = p_profile_id for update;
  if not found or prof.status <> 'pending_approval' then
    raise exception 'That request is no longer waiting.';
  end if;
  if prof.requested_role <> 'player' then
    raise exception 'That is not a request to join as a player.';
  end if;
  if p_team_id is null then
    raise exception 'Choose the team to place them on.';
  end if;
  if p_team_id is distinct from prof.requested_team_id and public.current_profile_role() <> 'admin' then
    raise exception 'Only an admin can place a request on a team other than the one requested.';
  end if;
  if not public.is_team_coach(p_team_id) then
    raise exception 'Only a coach of that team can approve its players.';
  end if;

  select * into team from public.teams where id = p_team_id and not coalesce(is_deleted, false);
  if not found then
    raise exception 'That team does not exist.';
  end if;

  if pid is null then
    insert into public.players (name, class_year) values (prof.name, '') returning id into pid;
    insert into public.team_players (team_id, school_id, player_id) values (p_team_id, team.school_id, pid);
  else
    if not exists (
      select 1 from public.team_players tp
       where tp.team_id = p_team_id and tp.player_id = pid and not coalesce(tp.is_deleted, false)
    ) then
      raise exception 'That player is not on this team''s roster.';
    end if;
    if exists (select 1 from public.profiles p where p.player_id = pid) then
      raise exception 'That player already has an account.';
    end if;
  end if;

  update public.profiles
     set role = 'player', status = 'active', school_id = team.school_id, player_id = pid
   where id = p_profile_id;
  return pid;
end;
$$;

create or replace function public.approve_coach_request(p_profile_id uuid, p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.profiles%rowtype;
  team public.teams%rowtype;
begin
  if public.current_profile_role() <> 'admin' then
    raise exception 'Only an admin can approve a coach.';
  end if;
  select * into prof from public.profiles where id = p_profile_id for update;
  if not found or prof.status <> 'pending_approval' then
    raise exception 'That request is no longer waiting.';
  end if;
  if prof.requested_role <> 'coach' then
    raise exception 'That is not a request to join as a coach.';
  end if;
  select * into team from public.teams where id = p_team_id and not coalesce(is_deleted, false);
  if not found then
    raise exception 'Choose the team to place them on.';
  end if;

  insert into public.team_coaches (team_id, profile_id) values (p_team_id, p_profile_id)
  on conflict do nothing;
  update public.profiles
     set role = 'coach', status = 'active', school_id = team.school_id
   where id = p_profile_id;
end;
$$;

create or replace function public.reject_request(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.profiles%rowtype;
begin
  select * into prof from public.profiles where id = p_profile_id for update;
  if not found or prof.status <> 'pending_approval' then
    raise exception 'That request is no longer waiting.';
  end if;
  if prof.requested_role = 'player' and prof.requested_team_id is not null then
    if not public.is_team_coach(prof.requested_team_id) then
      raise exception 'Only a coach of that team can refuse its players.';
    end if;
  elsif public.current_profile_role() <> 'admin' then
    raise exception 'Only an admin can refuse that request.';
  end if;
  update public.profiles set status = 'rejected' where id = p_profile_id;
end;
$$;

create or replace function public.team_linked_players(p_team_id uuid)
returns table (player_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.player_id
    from public.profiles p
    join public.team_players tp
      on tp.player_id = p.player_id and tp.team_id = p_team_id and not coalesce(tp.is_deleted, false)
   where public.is_team_coach(p_team_id);
$$;

revoke all on function public.create_invitation(text, uuid, text, uuid) from public, anon;
revoke all on function public.revoke_invitation(uuid)                   from public, anon;
revoke all on function public.pending_requests()                        from public, anon;
revoke all on function public.approve_player_request(uuid, uuid, uuid)  from public, anon;
revoke all on function public.approve_coach_request(uuid, uuid)         from public, anon;
revoke all on function public.reject_request(uuid)                      from public, anon;
revoke all on function public.team_linked_players(uuid)                 from public, anon;

grant execute on function public.create_invitation(text, uuid, text, uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid)                   to authenticated;
grant execute on function public.pending_requests()                        to authenticated;
grant execute on function public.approve_player_request(uuid, uuid, uuid)  to authenticated;
grant execute on function public.approve_coach_request(uuid, uuid)         to authenticated;
grant execute on function public.reject_request(uuid)                      to authenticated;
grant execute on function public.team_linked_players(uuid)                 to authenticated;

commit;
