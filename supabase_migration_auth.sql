-- ==========================================================
-- REAL AUTH + RLS HARDENING MIGRATION
-- Beaumont High School Soccer & Multi-Tenant Platform
--
-- Supersedes the RLS story in supabase_schema.sql / schema_roles.sql
-- WITHOUT editing those files (left as historical provisioning scripts).
-- Apply once via the Supabase SQL editor.
--
-- *** DESTRUCTIVE STEP ***
-- This truncates public.profiles before re-linking it to auth.users.
-- Existing profile rows were created by the old fake client-side auth
-- (app-generated ids, never real Supabase Auth users) and cannot satisfy
-- the new `profiles.id REFERENCES auth.users(id)` foreign key. All rows
-- today are demo/placeholder data (Coach Bob, Alex Rivera, Admin Sam,
-- Guest, plus whatever was created via the fake registration flow) — if
-- real signups have landed in this table, back it up before running.
-- ==========================================================

-- ─── 1. Re-link profiles to auth.users ─────────────────────────────────────

-- Using DELETE rather than TRUNCATE: matrix_logs.logged_by references
-- profiles(id) ON DELETE SET NULL, and Postgres's TRUNCATE does not honor
-- per-row ON DELETE actions the way DELETE does — TRUNCATE only offers an
-- all-or-nothing CASCADE that would wipe matrix_logs entirely instead of
-- just nulling that column. DELETE respects whatever FK actions actually
-- exist on the live database (including any not reflected in the schema
-- files in this repo), and fails loudly with a clear constraint error
-- instead of silently deleting unrelated data if something else references
-- profiles with ON DELETE RESTRICT.
delete from public.profiles;

-- profiles.id keeps its existing PRIMARY KEY constraint untouched (dropping
-- and recreating it would cascade-drop matrix_logs' FK to profiles too,
-- since that FK depends on this PK). We only need to stop auto-generating
-- ids and instead require them to match a real auth.users row.
alter table public.profiles alter column id drop default;
alter table public.profiles
  add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;

alter table public.profiles add column if not exists requested_role text
  check (requested_role in ('guest', 'player', 'coach', 'admin'));
alter table public.profiles add column if not exists email_verified boolean default false;

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('active', 'pending_verification', 'pending_approval', 'rejected'));

-- ─── 2. Helper functions (SECURITY DEFINER to avoid RLS self-recursion) ────

create or replace function public.current_profile_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_profile_school_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select school_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_profile_player_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select player_id from public.profiles where id = auth.uid()
$$;

-- ─── 3. Trigger: create profile row on signup ──────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_school_id uuid;
  requested text;
begin
  select id into resolved_school_id from public.schools where code = 'bhs' limit 1;
  requested := coalesce(new.raw_user_meta_data ->> 'requested_role', 'guest');

  insert into public.profiles (id, school_id, name, email, role, requested_role, status, email_verified, team_level)
  values (
    new.id,
    resolved_school_id,
    coalesce(new.raw_user_meta_data ->> 'name', 'Team User'),
    new.email,
    'guest',
    requested,
    'pending_verification',
    false,
    case requested
      when 'coach' then 'Boys Varsity Staff'
      when 'player' then 'Boys Varsity Player'
      else 'Fan / Public'
    end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── 4. Trigger: promote status when email is confirmed ────────────────────

create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    email_verified = true,
    status = case when requested_role = 'guest' or requested_role is null then 'active' else 'pending_approval' end,
    role = case when requested_role = 'guest' or requested_role is null then 'guest' else role end
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

-- ─── 5. profiles: RLS + column-guard trigger ───────────────────────────────

revoke all on table public.profiles from anon, authenticated;
grant select, update on table public.profiles to anon, authenticated;

alter table public.profiles enable row level security;

-- Pre-existing wide-open policy from the table's original dashboard-generated
-- setup — see note in section 6 above.
drop policy if exists "Allow full access for profiles" on public.profiles;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (is_deleted = false);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update
  using (id = auth.uid() or public.current_profile_role() = 'admin')
  with check (id = auth.uid() or public.current_profile_role() = 'admin');

-- RLS can't restrict individual columns, so self-service profile edits
-- (name/avatar) are allowed, but role/status/school_id escalation is
-- blocked server-side even for the row's own owner.
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for internal/trusted Postgres callers (GoTrue's own
  -- connection when it confirms a user, service_role, the SQL editor) —
  -- those aren't reachable by a regular anon/authenticated API request in
  -- the first place, since the profiles_update RLS policy already requires
  -- a non-null auth.uid() match before a row is even visible to update.
  if auth.uid() is null or public.current_profile_role() = 'admin' then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.school_id is distinct from old.school_id then
    raise exception 'Only an admin can change role, status, or school assignment.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_columns on public.profiles;
create trigger guard_profile_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- ─── 6. Team-content tables: public read, coach/admin write ────────────────

-- quiz_questions has no is_deleted column in supabase_schema.sql (unlike the
-- other tables in this group) — add it so the uniform policy loop below works.
alter table public.quiz_questions add column if not exists is_deleted boolean default false;

do $$
declare
  t text;
  team_content_tables text[] := array[
    'players', 'schedule', 'drills_bank', 'practice_plans',
    'matrix_logs', 'coaches', 'daily_thoughts', 'schools', 'quiz_questions'
  ];
begin
  foreach t in array team_content_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon, authenticated', t);
      execute format('grant select, insert, update, delete on table public.%I to anon, authenticated', t);
      execute format('alter table public.%I enable row level security', t);

      -- Drop any pre-existing wide-open policy from the table's original
      -- dashboard-generated setup (name observed live: "Allow full access
      -- for <table>", USING(true)/WITH CHECK(true)) — RLS policies are OR'd
      -- together, so leaving one of these in place would silently make
      -- every policy below it meaningless.
      execute format('drop policy if exists "Allow full access for %s" on public.%I', t, t);

      execute format('drop policy if exists "%1$s_select" on public.%1$s', t);
      execute format(
        'create policy "%1$s_select" on public.%1$s for select using (coalesce(is_deleted, false) = false)',
        t
      );

      execute format('drop policy if exists "%1$s_write" on public.%1$s', t);
      execute format(
        'create policy "%1$s_write" on public.%1$s for all using (public.current_profile_role() in (''coach'', ''admin'')) with check (public.current_profile_role() in (''coach'', ''admin''))',
        t
      );
    end if;
  end loop;
end $$;

-- ─── 7. Player-owned activity tables ────────────────────────────────────────

revoke all on table public.quiz_attempts from anon, authenticated;
grant select, insert, update on table public.quiz_attempts to anon, authenticated;
alter table public.quiz_attempts enable row level security;

drop policy if exists "Allow full access for quiz_attempts" on public.quiz_attempts;
drop policy if exists "quiz_attempts_access" on public.quiz_attempts;
create policy "quiz_attempts_access" on public.quiz_attempts
  for all
  using (player_id = public.current_profile_player_id() or public.current_profile_role() in ('coach', 'admin'))
  with check (player_id = public.current_profile_player_id() or public.current_profile_role() in ('coach', 'admin'));

revoke all on table public.player_answers from anon, authenticated;
grant select, insert, update on table public.player_answers to anon, authenticated;
alter table public.player_answers enable row level security;

drop policy if exists "Allow full access for player_answers" on public.player_answers;
drop policy if exists "player_answers_access" on public.player_answers;
create policy "player_answers_access" on public.player_answers
  for all
  using (
    public.current_profile_role() in ('coach', 'admin')
    or exists (
      select 1 from public.quiz_attempts qa
      where qa.attempt_id = player_answers.attempt_id
        and qa.player_id = public.current_profile_player_id()
    )
  )
  with check (
    public.current_profile_role() in ('coach', 'admin')
    or exists (
      select 1 from public.quiz_attempts qa
      where qa.attempt_id = player_answers.attempt_id
        and qa.player_id = public.current_profile_player_id()
    )
  );

-- quiz_results is a view over quiz_attempts and inherits its RLS automatically.

-- ─── 8. soccer_categories: tighten existing permissive policy ─────────────

alter table public.soccer_categories enable row level security;

drop policy if exists "Allow full access for soccer_categories" on public.soccer_categories;
drop policy if exists "soccer_categories_select" on public.soccer_categories;
drop policy if exists "soccer_categories_write" on public.soccer_categories;

create policy "soccer_categories_select" on public.soccer_categories
  for select using (true);

create policy "soccer_categories_write" on public.soccer_categories
  for all
  using (public.current_profile_role() in ('coach', 'admin'))
  with check (public.current_profile_role() in ('coach', 'admin'));

-- ─── 9. roles: keep public read, restrict writes to admins ────────────────
-- NOTE: roles.permissions (JSONB) is not read by any application code today
-- (confirmed via repo-wide search). Deliberately not wiring a
-- has_permission() helper into the policies above — that's speculative
-- complexity for a permission model nothing consumes yet. If per-school
-- custom roles become a real requirement, this table + a has_permission()
-- SECURITY DEFINER function reading `permissions` is the natural upgrade
-- path for the per-table policies in section 6.

drop policy if exists "Allow write access on roles" on public.roles;
create policy "Allow write access on roles" on public.roles
  for all
  using (public.current_profile_role() = 'admin')
  with check (public.current_profile_role() = 'admin');
