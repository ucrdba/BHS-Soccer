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

-- Stamped by note_email_change (section 4) when auth.users.email changes; an
-- account carrying it is never connected to invitations at sign-in.
alter table public.profiles add column if not exists email_changed_at timestamptz;

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
-- address it does not control before confirming one it does. requested_role
-- too: it decides whose queue a request lands in and what approving it makes
-- the account, so a waiting player could otherwise turn their request into a
-- coach's. email_changed_at too: clearing it would put an account whose
-- address changed back in reach of redeem_my_invitations.

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
     or new.email_changed_at is distinct from old.email_changed_at
     or new.player_id is distinct from old.player_id
     or new.requested_role is distinct from old.requested_role
     or new.requested_team_id is distinct from old.requested_team_id then
    raise exception 'Only an admin can change role, status, school, email, email change time, roster link, requested role or requested team.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_columns on public.profiles;
create trigger guard_profile_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- ─── 3. Redeeming invitations ──────────────────────────────────────────────
--
-- redeem_invitations does the work for both moments an invitation is used:
-- confirmation (promote_confirmed_profile, for a new account) and sign-in
-- (redeem_my_invitations in section 5, for an account that already existed
-- when it was invited). Callable by neither visitors nor anon: it trusts
-- p_user_id, so each caller decides whose invitations may be redeemed.
--
-- p_take_school says whose organization the profile names afterwards. At
-- confirmation (true) the first redeemed invitation's wins: handle_new_user
-- filled school_id from whatever team was picked at sign-up, and someone
-- invited into another organization belongs to that one. At sign-in (false) an
-- existing account keeps the organization it already names.
--
-- The earlier one-argument version is dropped first: create or replace with a
-- different signature would leave it beside this one, still trusting any id.

drop function if exists public.redeem_invitations(uuid);

create or replace function public.redeem_invitations(p_user_id uuid, p_take_school boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inv      public.invitations%rowtype;
  now_prof public.profiles%rowtype;
  redeemed integer := 0;
  school   uuid;
  -- profiles.email is the visitor's to edit (until the guard in section 2
  -- refused it, an account still pending_verification could set it to an
  -- invited minor's address and then confirm one it controls).
  -- auth.users.email is the address the confirmation actually proved, so
  -- invitations are matched against that instead.
  proven   text;
begin
  select lower(u.email) into proven from auth.users u where u.id = p_user_id;
  if proven is null then
    return 0;
  end if;

  -- Invitations naming different roster entries: apply none. Guessing which
  -- person someone is puts a player on a squad they never played for. The
  -- caller decides what that means for the account.
  if (select count(distinct i.player_id)
        from public.invitations i
       where i.email = proven
         and i.accepted_at is null and i.revoked_at is null
         and i.role = 'player') > 1 then
    return 0;
  end if;

  for inv in
    select * from public.invitations i
     where i.email = proven
       and i.accepted_at is null and i.revoked_at is null
     order by i.created_at
  loop
    -- A team deleted since the invitation was sent grants nothing.
    if not exists (select 1 from public.teams t where t.id = inv.team_id and not coalesce(t.is_deleted, false)) then
      continue;
    end if;

    -- Read afresh each time: an earlier invitation in this loop may have changed it.
    select * into now_prof from public.profiles where id = p_user_id for update;
    if not found then
      return redeemed;
    end if;

    if inv.role = 'player' then
      -- The roster entry may have left the team since it was invited.
      if not exists (
        select 1 from public.team_players tp
         where tp.team_id = inv.team_id and tp.player_id = inv.player_id and not coalesce(tp.is_deleted, false)
      ) then
        continue;
      end if;
      -- Serializes two callers linking the same roster entry at once, so the
      -- second one sees the first's link instead of racing it: an invitee
      -- confirming for inv.player_id while a coach approves another request
      -- onto the same roster entry.
      perform 1 from public.players where id = inv.player_id for update;
      -- The roster entry may have been claimed by another account since.
      if exists (select 1 from public.profiles p where p.player_id = inv.player_id and p.id <> p_user_id) then
        continue;
      end if;
      -- An account is one person: one already linked to someone else's roster
      -- entry is not re-pointed by an invitation.
      if now_prof.player_id is not null and now_prof.player_id <> inv.player_id then
        continue;
      end if;
      update public.profiles
         set player_id = inv.player_id,
             role = case when role in ('coach', 'admin') then role else 'player' end
       where id = p_user_id;
    else
      insert into public.team_coaches (team_id, profile_id)
      values (inv.team_id, p_user_id)
      on conflict do nothing;
      update public.profiles
         set role = case when role = 'admin' then 'admin' else 'coach' end
       where id = p_user_id;
    end if;

    -- The first organization redeemed.
    school := coalesce(school, inv.school_id);
    update public.invitations set accepted_at = now(), accepted_by = p_user_id where id = inv.id;
    redeemed := redeemed + 1;
  end loop;

  if redeemed > 0 then
    update public.profiles set school_id = school
     where id = p_user_id and (p_take_school or school_id is null);
  end if;
  return redeemed;
end;
$$;

revoke all on function public.redeem_invitations(uuid, boolean) from public, anon, authenticated;

-- promote_confirmed_profile: the one place an invitation is redeemed at sign-up.
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
  redeemed integer;
  proven   text;
begin
  select * into prof from public.profiles where id = p_user_id for update;
  if not found or prof.status <> 'pending_verification' then
    return;
  end if;

  select lower(u.email) into proven from auth.users u where u.id = p_user_id;

  -- Invitations naming different roster entries: apply none, and put the
  -- account in front of a person who can tell who it is.
  if (select count(distinct i.player_id)
        from public.invitations i
       where i.email = proven
         and i.accepted_at is null and i.revoked_at is null
         and i.role = 'player') > 1 then
    update public.profiles set status = 'pending_approval', email_verified = true where id = p_user_id;
    return;
  end if;

  redeemed := public.redeem_invitations(p_user_id, true);

  if redeemed > 0 then
    update public.profiles
       set status = 'active', email_verified = true
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
  -- An unconfirmed account keeps the password its FIRST sign-up typed, so
  -- someone who signs up first with another person's address could sign in
  -- as them once the real owner opens the confirmation link -- on a squad of
  -- minors. Clearing it here refuses that password; the link still signs the
  -- owner in, and the app then asks them to choose their own.
  -- Only when a confirmation email was actually sent: GoTrue's admin create
  -- (auth.admin.createUser with email_confirm, as scripts/demo-create-accounts.mjs
  -- does) inserts and then confirms in a second statement that fires this
  -- trigger, and that password was set by an admin and is meant to work. Nor
  -- at insert, for the same reason.
  if new.confirmation_sent_at is not null then
    update auth.users set encrypted_password = '' where id = new.id;
  end if;
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

-- An account holder who could change their address to an invited one would be
-- connected to that invitation at their next sign-in, taking someone else's
-- place. GoTrue rewrites auth.users.email when an email change completes, and on
-- the local stack one click by the account holder -- on the link sent to their
-- old address -- was enough, so nothing here may depend on the invitee. This
-- marks the account rather than blocking the change: redeem_my_invitations
-- refuses any account carrying the mark.
create or replace function public.note_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email_changed_at = now() where id = new.id;
  return new;
end;
$$;

revoke all on function public.note_email_change() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.note_email_change();

-- ─── 5. The functions the app calls ────────────────────────────────────────
--
-- Each checks its caller before doing anything, and refuses with a sentence
-- the app shows as-is. Coaches handle players on their own team; only an admin
-- handles coaches, so a coach can never create another coach.
--
-- Every such check is written to FAIL CLOSED. A signed-in caller with no
-- profiles row makes current_profile_role() and is_team_coach() both return
-- NULL (0005_multi_team_schema.sql), and in PL/pgSQL `if NULL <> 'admin'` and
-- `if not NULL` both evaluate to NULL, which skips the raise -- silently
-- granting the privileged path instead of refusing it. Every comparison here
-- is wrapped in coalesce(..., 'guest') / coalesce(..., false) so a caller with
-- no profile compares as the least-privileged case, not as "unknown".

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
    if not coalesce(public.is_team_coach(p_team_id), false) then
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
    if coalesce(public.current_profile_role(), 'guest') <> 'admin' then
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
  if inv.role = 'coach' and coalesce(public.current_profile_role(), 'guest') <> 'admin' then
    raise exception 'Only an admin can withdraw a coach''s invitation.';
  end if;
  if inv.role = 'player' and not coalesce(public.is_team_coach(inv.team_id), false) then
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
  -- A coach settles player requests only. An admin may settle any waiting
  -- request as a player -- including one that asked for no team role (an
  -- account whose invitations named different roster entries, or one the old
  -- sign-up trigger left as 'admin' or NULL), which nobody could act on else.
  if prof.requested_role is distinct from 'player'
     and coalesce(public.current_profile_role(), 'guest') <> 'admin' then
    raise exception 'That is not a request to join as a player.';
  end if;
  if p_team_id is null then
    raise exception 'Choose the team to place them on.';
  end if;
  if p_team_id is distinct from prof.requested_team_id
     and coalesce(public.current_profile_role(), 'guest') <> 'admin' then
    raise exception 'Only an admin can place a request on a team other than the one requested.';
  end if;
  if not coalesce(public.is_team_coach(p_team_id), false) then
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
    -- Serializes two callers linking the same roster entry at once, so the
    -- second one sees the first's link instead of racing it: a coach approving
    -- this request onto pid while an invitee confirms for the same pid.
    perform 1 from public.players where id = pid for update;
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
  if coalesce(public.current_profile_role(), 'guest') <> 'admin' then
    raise exception 'Only an admin can approve a coach.';
  end if;
  select * into prof from public.profiles where id = p_profile_id for update;
  if not found or prof.status <> 'pending_approval' then
    raise exception 'That request is no longer waiting.';
  end if;
  -- No check on requested_role: only an admin gets this far, and an admin may
  -- settle any waiting request as a coach.
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
    if not coalesce(public.is_team_coach(prof.requested_team_id), false) then
      raise exception 'Only a coach of that team can refuse its players.';
    end if;
  elsif coalesce(public.current_profile_role(), 'guest') <> 'admin' then
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

-- Connects an account that already existed when it was invited: a parent, a
-- player with a school account, a coach invited to a second team. Confirmation
-- only redeems for a profile still at pending_verification, so the app calls
-- this at sign-in. Only for the caller's own proven address, and only once the
-- account is active -- a request still waiting is decided by a person.
create or replace function public.redeem_my_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
      join auth.users u on u.id = p.id
     where p.id = auth.uid()
       and p.status = 'active'
       and u.email_confirmed_at is not null
  ) then
    raise exception 'Only an active account with a confirmed email can accept invitations.';
  end if;
  -- An address changed since the account was made may be someone else's
  -- invited one (see note_email_change in section 4).
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.email_changed_at is not null) then
    raise exception 'This account''s email address has been changed, so invitations are not connected to it automatically. Ask an admin to connect it.';
  end if;
  return public.redeem_invitations(auth.uid(), false);
end;
$$;

revoke all on function public.create_invitation(text, uuid, text, uuid) from public, anon;
revoke all on function public.revoke_invitation(uuid)                   from public, anon;
revoke all on function public.pending_requests()                        from public, anon;
revoke all on function public.approve_player_request(uuid, uuid, uuid)  from public, anon;
revoke all on function public.approve_coach_request(uuid, uuid)         from public, anon;
revoke all on function public.reject_request(uuid)                      from public, anon;
revoke all on function public.team_linked_players(uuid)                 from public, anon;
revoke all on function public.redeem_my_invitations()                  from public, anon;

grant execute on function public.create_invitation(text, uuid, text, uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid)                   to authenticated;
grant execute on function public.pending_requests()                        to authenticated;
grant execute on function public.approve_player_request(uuid, uuid, uuid)  to authenticated;
grant execute on function public.approve_coach_request(uuid, uuid)         to authenticated;
grant execute on function public.reject_request(uuid)                      to authenticated;
grant execute on function public.team_linked_players(uuid)                 to authenticated;
grant execute on function public.redeem_my_invitations()                  to authenticated;

commit;
