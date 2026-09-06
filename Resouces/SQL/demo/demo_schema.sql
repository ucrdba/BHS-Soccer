-- demo_schema.sql — the demo project's structure, start to finish
--
-- GENERATED FILE. Do not edit. Regenerate with:  npm run demo:schema
-- Generated 2026-09-05 from 3 provisioning scripts and 22 migrations.
--
-- ── What this is for ──────────────────────────────────────────────────────
--
-- The public demo runs on its own Supabase project so that strangers creating,
-- editing and deleting can never touch real students' records. That project
-- needs the same schema as production, and this file is how it gets it: paste
-- the whole thing into the demo project's SQL editor, once, on a fresh
-- project.
--
-- It is STRUCTURE ONLY. No Beaumont, no real names, no team data. The demo's
-- template organization is loaded separately from demo_seed.sql.
--
-- ── Run it on the DEMO project ────────────────────────────────────────────
--
-- Check the project switcher before you paste. Applied to production this
-- would re-run every migration against live data, and supabase_migration_auth
-- .sql's first step DELETES every row in public.profiles.
--
-- ── Ownership ─────────────────────────────────────────────────────────────
--
-- The SQL editor may run as a role that is a MEMBER of postgres without
-- defaulting to it. ALTER TABLE and CREATE POLICY check ownership rather than
-- privilege, so they fail with 42501 (must be owner of table ...) even when
-- the privilege is reachable. The set role below fixes that for the whole
-- session; it persists across the begin/commit pairs the later migrations
-- carry, because SET ROLE is session-scoped rather than transactional.
--
-- ── After it runs ─────────────────────────────────────────────────────────
--
--   1. demo_auth_open.sql   self-serve coach accounts (DEMO ONLY)
--   2. demo_settings.sql    the cap on live visitor organizations
--   3. demo_seed.sql        the template every visitor is cloned from
--
-- Note for step 1: handle_new_user() resolves a new profile's organization
-- with `select id from public.schools where code = 'bhs'`, which is legacy
-- and finds nothing here. Demo signups therefore land with a null school_id
-- until demo_auth_open.sql points them at the template instead.
--
-- ── Excluded on purpose ───────────────────────────────────────────────────
--
-- seed_data.sql              Beaumont's demo data; the demo has its own.
-- 0006_move_club_teams_to_legends_fc.sql
--   Data. Moves two teams named by hardcoded production UUIDs; matches nothing here.
-- 0007_assign_coaches_to_club_teams.sql
--   Data, AND it would abort the run: it raises an exception when the coach email it names has no active profile, which on a fresh project is always.
-- 0012_set_drill_weights.sql
--   Data. Sets weights on drills named in Beaumont's bank; the demo's drills come from demo_seed.sql.
-- One statement cut from 0005_multi_team_schema.sql:
--   Beaumont's Varsity team, by literal school UUID. teams.school_id is NOT NULL REFERENCES schools(id), so on an empty database this is a foreign key violation (23503) that aborts the migration.

set role postgres;


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase_schema.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Beaumont High School Soccer & Multi-Tenant Platform
-- Supabase PostgreSQL Schema & Row Level Security (RLS) Policies
-- All Primary Key & Foreign Key ID Columns Converted to UUID (gen_random_uuid())

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. SCHOOLS TABLE
CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE DEFAULT 'bhs',
  name TEXT NOT NULL,
  mascot TEXT NOT NULL,
  city TEXT,
  colors JSONB,
  record JSONB DEFAULT '{"wins":0, "losses":0, "draws":0}'::jsonb,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. USER PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT CHECK (role IN ('guest', 'player', 'coach', 'admin')) DEFAULT 'guest',
  status TEXT DEFAULT 'active',
  team_level TEXT DEFAULT 'Boys Varsity',
  player_id UUID,
  avatar_url TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PLAYERS TABLE
CREATE TABLE IF NOT EXISTS public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  number INT NOT NULL,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  class_year TEXT NOT NULL,
  height TEXT,
  photo_url TEXT,
  season_stats JSONB DEFAULT '{}'::jsonb,
  ratings JSONB DEFAULT '{"technical":80,"tactical":80,"physical":80,"mental":80}'::jsonb,
  matrix_stats JSONB DEFAULT '{"wins":0,"losses":0,"points":0,"rank":99,"drillScore":0}'::jsonb,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SCHEDULE & FIXTURES TABLE
CREATE TABLE IF NOT EXISTS public.schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  match_date TEXT NOT NULL,
  match_time TEXT NOT NULL,
  opponent TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT CHECK (status IN ('UPCOMING', 'COMPLETED', 'CANCELLED')) DEFAULT 'UPCOMING',
  is_home BOOLEAN DEFAULT true,
  score TEXT,
  result TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. DRILLS BANK TABLE
CREATE TABLE IF NOT EXISTS public.drills_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration TEXT NOT NULL,
  category TEXT NOT NULL,
  points INT DEFAULT 3,
  coach_notes TEXT,
  diagram_image TEXT,
  diagram_data JSONB DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PRACTICE PLANS TABLE
CREATE TABLE IF NOT EXISTS public.practice_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  time_slot TEXT NOT NULL,
  name TEXT NOT NULL,
  duration TEXT NOT NULL,
  coach_notes TEXT,
  diagram_image TEXT,
  diagram_data JSONB DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. COMPETITIVE MATRIX LOGS TABLE
CREATE TABLE IF NOT EXISTS public.matrix_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  drill_id UUID REFERENCES public.drills_bank(id) ON DELETE CASCADE,
  winning_player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  points_earned INT NOT NULL,
  logged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. COACHES TABLE
CREATE TABLE IF NOT EXISTS public.coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  email TEXT,
  photo_url TEXT,
  bio TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. DAILY THOUGHTS TABLE
CREATE TABLE IF NOT EXISTS public.daily_thoughts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES public.coaches(id) ON DELETE CASCADE,
  coach_name TEXT NOT NULL DEFAULT 'Coach Bob Miller',
  thoughts_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ENSURE IS_DELETED COLUMN EXISTS ACROSS ALL EXISTING TABLES
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.schedule ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.drills_bank ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.practice_plans ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.matrix_logs ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.daily_thoughts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.drills_bank ADD COLUMN IF NOT EXISTS coach_notes TEXT;
ALTER TABLE public.drills_bank ADD COLUMN IF NOT EXISTS diagram_image TEXT;
ALTER TABLE public.drills_bank ADD COLUMN IF NOT EXISTS diagram_data JSONB DEFAULT '{}'::jsonb;

-- 10. QUIZ QUESTIONS TABLE
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('A','B','C','D')),
  explanation TEXT,
  category TEXT DEFAULT 'Tactical',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. QUIZ ATTEMPTS TABLE
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  score INT DEFAULT 0,
  total_questions INT DEFAULT 0
);

-- 12. INDIVIDUAL ANSWERS GIVEN BY PLAYER
CREATE TABLE IF NOT EXISTS public.player_answers (
  answer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID REFERENCES public.quiz_attempts(attempt_id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.quiz_questions(question_id) ON DELETE CASCADE,
  selected_option CHAR(1) NOT NULL CHECK (selected_option IN ('A','B','C','D')),
  is_correct BOOLEAN,
  UNIQUE (attempt_id, question_id)
);

-- 13. HELPFUL VIEW TO SEE GRADED QUIZ RESULTS
CREATE OR REPLACE VIEW public.quiz_results AS
SELECT 
    a.attempt_id,
    a.player_id,
    a.player_name,
    a.started_at,
    a.completed_at,
    a.score,
    a.total_questions,
    ROUND((a.score::DECIMAL / NULLIF(a.total_questions, 0)) * 100, 1) AS percentage
FROM public.quiz_attempts a
ORDER BY a.completed_at DESC NULLS LAST;

-- GRANT PERMISSIONS TO ANON, AUTHENTICATED & SERVICE ROLE
GRANT ALL ON TABLE public.schools TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.profiles TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.players TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.schedule TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.drills_bank TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.practice_plans TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.matrix_logs TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.coaches TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.daily_thoughts TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.quiz_questions TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.quiz_attempts TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.player_answers TO anon, authenticated, service_role;
GRANT ALL ON public.quiz_results TO anon, authenticated, service_role;

-- 14. SOCCER CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.soccer_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Initial Soccer Categories with Descriptions
INSERT INTO public.soccer_categories (name, description) VALUES
  ('Tactical / Attacking', 'Drills focused on offensive build-up, 1v1 gauntlets, overlapping runs, counter-pressing, and finishing in the box.'),
  ('Defending / Pressing', 'Drills focusing on backline compact shape, high pressing triggers, defensive 1v1 containment, and tackling form.'),
  ('Technical / Passing', 'Drills highlighting ball control, quick 2-touch wall passes, weight of pass, and receiving under pressure.'),
  ('Physical / Conditioning', 'High-intensity fitness intervals, shuttle runs, agility ladder work, speed endurance, and core strength.'),
  ('Warmup & Rondo', 'Dynamic mobility warmups, 5v2 / 4v2 rondos, activation patterns, and touch refinement.'),
  ('Set Pieces / Penalty', 'Corner kick routines, free kick wall placement, long throw-ins, and penalty shootout practice.')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

GRANT ALL ON TABLE public.soccer_categories TO anon, authenticated, service_role;
ALTER TABLE public.soccer_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access for soccer_categories" ON public.soccer_categories FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════════════
-- Reconcile supabase_schema.sql with the live production database
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Columns declared by the provisioning script that production does not have,
-- and that no migration drops. Without this the demo would carry columns
-- production lacks — and drills_bank.duration is NOT NULL, so 0009's
-- self-check fails outright with 23502 when it inserts a drill without one.

-- NOT NULL in the script, absent in production. Breaks 0009, 0010 and 0022, which all insert self-check drills.
alter table public.drills_bank       drop column if exists duration;

-- Absent in production; the category list is global, as src/data/supabase.ts:2193 documents.
alter table public.soccer_categories drop column if exists school_id;


-- ═══════════════════════════════════════════════════════════════════════════
-- schema_roles.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ==========================================================
-- ROLES & GRANULAR PERMISSIONS TABLE DDL & SEED DATA
-- Beaumont High School Soccer & Multi-Tenant Platform
-- ==========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create ROLES Table
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) on roles table
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running script
DROP POLICY IF EXISTS "Allow public read access on roles" ON public.roles;
DROP POLICY IF EXISTS "Allow write access on roles" ON public.roles;

-- Allow public read access to active roles
CREATE POLICY "Allow public read access on roles" 
ON public.roles FOR SELECT 
USING (is_deleted IS NULL OR is_deleted = false);

-- Allow full access to update roles
CREATE POLICY "Allow write access on roles" 
ON public.roles FOR ALL 
USING (true);

-- 2. Populate ROLES Table with Default Core Roles (Admin, Coach, Player, Guest)
INSERT INTO public.roles (name, label, description, is_system, permissions)
VALUES
(
  'admin',
  '⚡ System Admin / Athletic Director',
  'Full unrestricted global access to all features, settings, data import/export, user approvals, and DB management.',
  true,
  '{
    "can_view_roster": true,
    "can_modify_roster": true,
    "can_view_schedule": true,
    "can_modify_schedule": true,
    "can_view_ratings": true,
    "can_modify_ratings": true,
    "can_view_planner": true,
    "can_modify_planner": true,
    "can_view_coaches": true,
    "can_modify_coaches": true,
    "can_import_export": true,
    "can_access_admin_dashboard": true,
    "can_manage_users": true,
    "can_manage_schools": true,
    "can_manage_roles": true
  }'::jsonb
),
(
  'coach',
  '👔 Head Coach / Coaching Staff',
  'Can manage roster, edit match scores, log practice ratings, build practice plans, and approve users.',
  true,
  '{
    "can_view_roster": true,
    "can_modify_roster": true,
    "can_view_schedule": true,
    "can_modify_schedule": true,
    "can_view_ratings": true,
    "can_modify_ratings": true,
    "can_view_planner": true,
    "can_modify_planner": true,
    "can_view_coaches": true,
    "can_modify_coaches": true,
    "can_import_export": true,
    "can_access_admin_dashboard": false,
    "can_manage_users": true,
    "can_manage_schools": false,
    "can_manage_roles": false
  }'::jsonb
),
(
  'player',
  '⚽ Varsity Player',
  'Can view team roster, match schedule, practice ratings & rankings, and coaching staff directory.',
  true,
  '{
    "can_view_roster": true,
    "can_modify_roster": false,
    "can_view_schedule": true,
    "can_modify_schedule": false,
    "can_view_ratings": true,
    "can_modify_ratings": false,
    "can_view_planner": false,
    "can_modify_planner": false,
    "can_view_coaches": true,
    "can_modify_coaches": false,
    "can_import_export": false,
    "can_access_admin_dashboard": false,
    "can_manage_users": false,
    "can_manage_schools": false,
    "can_manage_roles": false
  }'::jsonb
),
(
  'guest',
  '👤 Public Fan / Visitor',
  'Public visitor access to view match schedule, team roster, and public homepage.',
  true,
  '{
    "can_view_roster": true,
    "can_modify_roster": false,
    "can_view_schedule": true,
    "can_modify_schedule": false,
    "can_view_ratings": false,
    "can_modify_ratings": false,
    "can_view_planner": false,
    "can_modify_planner": false,
    "can_view_coaches": false,
    "can_modify_coaches": false,
    "can_import_export": false,
    "can_access_admin_dashboard": false,
    "can_manage_users": false,
    "can_manage_schools": false,
    "can_manage_roles": false
  }'::jsonb
)
ON CONFLICT (name) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  is_system = EXCLUDED.is_system,
  permissions = EXCLUDED.permissions;


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase_migration_auth.sql
-- ═══════════════════════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0001_tighten_profiles_select.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- supabase/migrations/0001_tighten_profiles_select.sql
--
-- profiles_select previously allowed any anon caller to read every profile
-- row, including email and role. Restrict to self plus coach/admin, which is
-- all the approval queue needs. Nothing public reads profiles.
--
-- Rollback:
--   drop policy if exists "profiles_select" on public.profiles;
--   create policy "profiles_select" on public.profiles
--     for select using (is_deleted = false);

drop policy if exists "profiles_select" on public.profiles;

create policy "profiles_select" on public.profiles
  for select using (
    is_deleted = false
    and (
      id = auth.uid()
      or public.current_profile_role() in ('coach', 'admin')
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0002_rebuild_matrix_logs.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- supabase/migrations/0002_rebuild_matrix_logs.sql
--
-- The original matrix_logs recorded only a winner and a points value. It could
-- not express a loser (so W-L was underivable) or a draw (a 1v1 played to a
-- time limit can end 0-0). Rebuilt with symmetric participants plus an outcome.
--
-- Points are NOT stored. They are derived from `outcome` in matrix_standings
-- (win 3, draw 1, loss 0) so a stored value can never contradict the result.
--
-- Safe to drop: the table has 0 rows. Verify before running:
--   select count(*) from public.matrix_logs;   -- expect 0
--
-- Rollback: restore the original definition from supabase_schema.sql section 7.

drop table if exists public.matrix_logs cascade;

create table public.matrix_logs (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id)     on delete cascade,
  -- set null, not cascade: retiring a drill must not erase the match history
  -- played under it.
  drill_id     uuid          references public.drills_bank(id) on delete set null,
  player_a_id  uuid not null references public.players(id)     on delete cascade,
  player_b_id  uuid not null references public.players(id)     on delete cascade,
  -- text-with-check rather than an enum: Postgres enums are painful to alter,
  -- and adding a 2v2 or fitness outcome later should be a one-line change.
  outcome      text not null check (outcome in ('a','b','draw')),
  score_text   text,
  occurred_on  date not null default current_date,
  logged_by    uuid references public.profiles(id) on delete set null,
  is_deleted   boolean default false,
  created_at   timestamptz default now(),
  check (player_a_id <> player_b_id)
);

create index if not exists matrix_logs_school_idx on public.matrix_logs (school_id);
create index if not exists matrix_logs_a_idx      on public.matrix_logs (player_a_id);
create index if not exists matrix_logs_b_idx      on public.matrix_logs (player_b_id);

-- `drop table ... cascade` removes the policies with the table, so re-apply
-- them: public read of live rows, coach/admin write. This mirrors the uniform
-- policy loop in supabase_migration_auth.sql section 6.
alter table public.matrix_logs enable row level security;

drop policy if exists "matrix_logs_select" on public.matrix_logs;
create policy "matrix_logs_select" on public.matrix_logs
  for select using (coalesce(is_deleted, false) = false);

drop policy if exists "matrix_logs_write" on public.matrix_logs;
create policy "matrix_logs_write" on public.matrix_logs
  for all
  using (public.current_profile_role() in ('coach','admin'))
  with check (public.current_profile_role() in ('coach','admin'));

grant select on table public.matrix_logs to anon, authenticated;
grant insert, update, delete on table public.matrix_logs to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0003_matrix_standings_view.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- supabase/migrations/0003_matrix_standings_view.sql
--
-- Standings derived from matrix_logs. Points are computed here (win 3, draw 1,
-- loss 0) rather than stored, so they cannot drift from the recorded outcome,
-- and correcting a mis-entered result re-derives every rank.
--
-- Ranking is by total points, tiebroken by percentage. Points measure
-- consistency (showing up and accumulating); percentage measures performance
-- and is displayed rather than ranked on, so a high percentage over few games
-- reads as a player who will climb once they play more.
--
-- security_invoker = true is REQUIRED. Without it the view runs as its owner
-- and bypasses the RLS on matrix_logs.
--
-- Rollback:
--   drop view if exists public.matrix_standings;

drop view if exists public.matrix_standings;

create view public.matrix_standings with (security_invoker = true) as
with sides as (
  select school_id,
         player_a_id as player_id,
         case outcome when 'a'    then 1 else 0 end as w,
         case outcome when 'draw' then 1 else 0 end as d,
         case outcome when 'b'    then 1 else 0 end as l
    from public.matrix_logs
   where coalesce(is_deleted, false) = false
  union all
  select school_id,
         player_b_id,
         case outcome when 'b'    then 1 else 0 end,
         case outcome when 'draw' then 1 else 0 end,
         case outcome when 'a'    then 1 else 0 end
    from public.matrix_logs
   where coalesce(is_deleted, false) = false
)
select player_id,
       school_id,
       sum(w)                as wins,
       sum(d)                as draws,
       sum(l)                as losses,
       count(*)              as games,
       3 * sum(w) + sum(d)   as points,
       -- nullif guards division by zero. The JavaScript this replaces computed
       -- wins/(wins+losses) and rendered NaN% for a player with no results.
       round(100.0 * (sum(w) + 0.5 * sum(d)) / nullif(count(*), 0), 1) as win_pct,
       rank() over (
         partition by school_id
         order by 3 * sum(w) + sum(d) desc,
                  (sum(w) + 0.5 * sum(d)) / nullif(count(*), 0) desc nulls last
       ) as rank
  from sides
 group by player_id, school_id;

grant select on public.matrix_standings to anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0005_multi_team_schema.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- supabase/migrations/0005_multi_team_schema.sql
--
-- Multi-team support, Phase 1. One coach runs several teams; a player on both a
-- school team and a club is ONE person with per-team statistics.
--
-- NUMBERING: 0004 belongs to the parked feat/google-signin-allowlist branch and
-- is deliberately skipped here so the two branches cannot collide.
--
-- APPLY THIS AT MERGE TIME, NOT BEFORE.
--
-- This used to be split across two files so a bad copy of the existing rows
-- stayed recoverable. The project owner has since said the current data is
-- reproducible and does not need protecting, which removes that split's whole
-- justification -- see docs/superpowers/specs/2026-08-30-multi-team-support-design.md
-- and the plan's ledger for the decision. One migration now.
--
-- The one consequence that survives the collapse is not about data, it is
-- about timing: this migration drops players.number, players.season_stats and
-- the rest (final section, below) in the same breath as it creates the new
-- tables. The currently deployed application still reads those columns, so
-- from the moment this is applied until the application change ships, the
-- live site's roster is broken. There is no window to manage and nothing to
-- sequence -- just do not apply this to a database whose application has not
-- been updated yet.
--
-- The same window also empties the Matrix panel: this migration drops and
-- recreates matrix_standings with team_id in place of school_id, and the
-- currently-deployed fetchMatrixStandings queries .eq('school_id', ...),
-- which errors from the moment this lands. That error is swallowed into a
-- console.warn returning null, so the panel goes quietly blank rather than
-- throwing. Same window as the roster breakage above, not a second one.
--
-- Rollback: there is none, once applied. The final section drops
-- players.number/position/season_stats/ratings/matrix_stats/school_id and
-- schedule.school_id/matrix_logs.school_id; those columns are the only copy
-- of that data. Restoring the pre-migration schema after this has run means
-- restoring from a backup taken before it ran.

-- ─── 1. schools: say what the table actually holds ─────────────────────────

alter table public.schools
  add column if not exists kind text not null default 'school'
  check (kind in ('school','club'));

-- ─── 2. teams ──────────────────────────────────────────────────────────────

create table if not exists public.teams (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  name              text not null,
  season            text,
  is_public_default boolean not null default false,
  is_deleted        boolean default false,
  created_at        timestamptz default now(),
  unique (school_id, name),
  -- Target for team_players' composite foreign key. Without this, that FK
  -- cannot be declared and school_id could drift from the team it names.
  unique (id, school_id)
);

-- At most one public default per organization. Partial, so soft-deleted teams
-- do not occupy the slot.
create unique index if not exists teams_one_public_default_per_school
  on public.teams (school_id)
  where is_public_default and not coalesce(is_deleted, false);

-- ─── 3. team_players: the membership, and all per-team data ────────────────

create table if not exists public.team_players (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null,
  school_id    uuid not null,
  player_id    uuid not null references public.players(id) on delete cascade,
  number       int,
  position     text,
  season_stats jsonb default '{}'::jsonb,
  ratings      jsonb default '{"technical":80,"tactical":80,"physical":80,"mental":80}'::jsonb,
  is_deleted   boolean default false,
  created_at   timestamptz default now(),
  -- Composite FK: school_id must agree with the team's own school_id.
  foreign key (team_id, school_id) references public.teams (id, school_id)
);

create index if not exists team_players_team_idx   on public.team_players (team_id);
create index if not exists team_players_player_idx on public.team_players (player_id);

-- Both uniques must ignore soft-deleted rows. As plain constraints they would
-- count a removed membership, so a player taken off Varsity could never be added
-- to JV -- 23505, invisible on both rosters, with no way out from the UI.
create unique index if not exists team_players_one_per_team
  on public.team_players (team_id, player_id)
  where not coalesce(is_deleted, false);

-- The central rule: one team per organization, several organizations. Also
-- partial, for the same reason as above.
create unique index if not exists team_players_one_team_per_school
  on public.team_players (school_id, player_id)
  where not coalesce(is_deleted, false);

-- ─── 4. team_coaches ───────────────────────────────────────────────────────

create table if not exists public.team_coaches (
  team_id    uuid not null references public.teams(id)    on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (team_id, profile_id)
);

-- ─── 5. current_profile_role(): respect status ─────────────────────────────
--
-- It previously read role and ignored status, so a profile marked 'rejected'
-- still read as 'coach' to every policy in the project -- revocation did not
-- revoke. Found during the Google-sign-in review and parked because it touches
-- every policy; fixed here because this migration rewrites the permission layer
-- anyway, and multi-team makes it more pressing (more coaches, more reason to
-- remove one).

create or replace function public.current_profile_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case when status = 'active' then role else 'guest' end
    from public.profiles where id = auth.uid()
$$;

-- ─── 6. is_team_coach() ────────────────────────────────────────────────────
--
-- SECURITY DEFINER for the same reason current_profile_role() is: reading
-- team_coaches from inside a policy ON team_coaches would recurse.

create or replace function public.is_team_coach(target_team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  -- The role check must wrap the membership check, not sit beside it: section 5
  -- above makes current_profile_role() fall back to 'guest' once status is not
  -- 'active', so that revoking a coach actually revokes them. An `exists` branch
  -- on team_coaches alone would bypass that fallback entirely -- a rejected
  -- profile with a surviving team_coaches row would keep full write on that
  -- team, and team_coaches_write is admin-only, so there would be no other way
  -- to revoke it. Do not simplify this back to a plain `or`.
  select public.current_profile_role() = 'admin'
      or (
        public.current_profile_role() in ('coach', 'admin')
        and exists (
          select 1 from public.team_coaches tc
          where tc.team_id = target_team_id
            and tc.profile_id = auth.uid()
        )
      );
$$;

-- ─── 7. RLS on the new tables ──────────────────────────────────────────────
--
-- These are deliberately NOT added to the uniform policy loop in
-- supabase_migration_auth.sql section 6: that loop grants blanket coach/admin
-- write, which is exactly what this phase replaces with per-team scoping.
-- Reads stay public -- this is a public roster site and nothing a visitor can
-- see today should disappear.

alter table public.teams        enable row level security;
alter table public.team_players enable row level security;
alter table public.team_coaches enable row level security;

grant select on public.teams, public.team_players, public.team_coaches to anon, authenticated;
grant insert, update, delete on public.teams, public.team_players, public.team_coaches to authenticated;

drop policy if exists "teams_select" on public.teams;
create policy "teams_select" on public.teams
  for select using (coalesce(is_deleted, false) = false);

-- Teams are structural and created rarely. A coach creating teams in an
-- organization they do not belong to is an escalation path with no upside.
drop policy if exists "teams_write" on public.teams;
create policy "teams_write" on public.teams
  for all
  using (public.current_profile_role() = 'admin')
  with check (public.current_profile_role() = 'admin');

drop policy if exists "team_players_select" on public.team_players;
create policy "team_players_select" on public.team_players
  for select using (coalesce(is_deleted, false) = false);

-- The policy that stops a club coach editing the varsity roster.
drop policy if exists "team_players_write" on public.team_players;
create policy "team_players_write" on public.team_players
  for all
  using (public.is_team_coach(team_id))
  with check (public.is_team_coach(team_id));

drop policy if exists "team_coaches_select" on public.team_coaches;
create policy "team_coaches_select" on public.team_coaches
  for select using (true);

-- Admin only: this is role assignment, the same privilege-escalation shape
-- that gates the account-approval queue.
drop policy if exists "team_coaches_write" on public.team_coaches;
create policy "team_coaches_write" on public.team_coaches
  for all
  using (public.current_profile_role() = 'admin')
  with check (public.current_profile_role() = 'admin');

-- ─── 8. Rescope schedule and matrix_logs ───────────────────────────────────
--
-- team_id is added alongside school_id rather than in its place: the data
-- migration below (section 9) needs the old column to know which team a row
-- belongs to, and the final section drops it once that backfill is done.

alter table public.schedule    add column if not exists team_id uuid references public.teams(id) on delete cascade;
alter table public.matrix_logs add column if not exists team_id uuid references public.teams(id) on delete cascade;

-- ─── 9. Data migration ─────────────────────────────────────────────────────

-- Mark what each organization actually is.
update public.schools set kind = 'school' where code in ('bhs','abc');
update public.schools set kind = 'club'   where code = 'vhs';

-- Diagnostics cruft from the admin panel. This DELETE cascades: players,
-- schedule, matrix_logs, profiles and drills_bank all declare
-- school_id ... on delete cascade against schools. Confirm the diagnostic
-- schools are actually empty first -- see the pre-flight in the runbook's
-- Step 1.
delete from public.schools where code like 'diag\_%';

-- Beaumont's existing squad becomes Varsity, and it is what the public sees.
-- [demo] statement removed by build-demo-schema.mjs:
--   Beaumont's Varsity team, by literal school UUID. teams.school_id is NOT NULL REFERENCES schools(id), so on an empty database this is a foreign key violation (23503) that aborts the migration.

-- Existing coaches keep the access they have today. Without this,
-- is_team_coach() is true only for admins the moment the application change
-- ships, and team_coaches_write is admin-only -- so a coach could not restore
-- their own access. A manual runbook step here would be a step someone
-- forgets, so it happens in the migration instead.
insert into public.team_coaches (team_id, profile_id)
select t.id, p.id
  from public.profiles p
  join public.teams t
    on t.school_id = '7ebbe980-b87e-421f-a11f-788ca2519504' and t.name = 'Varsity'
 where p.role in ('coach','admin')
   and p.status = 'active'
on conflict (team_id, profile_id) do nothing;

-- Every existing player joins it, carrying their per-team data across
-- unchanged. team_players_one_per_team / team_players_one_team_per_school are
-- PARTIAL unique indexes (they ignore soft-deleted rows), and Postgres will
-- not infer a partial index as an ON CONFLICT arbiter from a bare column list
-- -- doing so raises 42P10. There is no non-partial index left on these
-- columns to infer instead, so this uses the unqualified `on conflict do
-- nothing`, which needs no arbiter at all. That also means it is re-runnable
-- only before any player is moved to a different team: an unqualified
-- `do nothing` skips a row on ANY conflict on this table, including the one
-- the (school_id, player_id) index enforces, so re-running this after a
-- player has moved teams silently does nothing rather than erroring.
insert into public.team_players (team_id, school_id, player_id, number, position, season_stats, ratings, is_deleted)
select t.id, p.school_id, p.id, p.number, p.position, p.season_stats, p.ratings, coalesce(p.is_deleted, false)
  from public.players p
  join public.teams t
    on t.school_id = p.school_id and t.name = 'Varsity'
 where p.school_id = '7ebbe980-b87e-421f-a11f-788ca2519504'
on conflict do nothing;

-- Existing fixtures and results belong to that team.
update public.schedule    s set team_id = t.id from public.teams t
 where t.school_id = s.school_id and t.name = 'Varsity' and s.team_id is null;
update public.matrix_logs m set team_id = t.id from public.teams t
 where t.school_id = m.school_id and t.name = 'Varsity' and m.team_id is null;

-- ─── 10. matrix_standings: partition by team ───────────────────────────────
--
-- Same derivation as 0003 (win 3, draw 1, loss 0; points never stored), with
-- team_id replacing school_id so each team has its own leaderboard.
-- security_invoker = true is REQUIRED: without it the view runs as its owner
-- and bypasses the RLS on matrix_logs.

drop view if exists public.matrix_standings;

create view public.matrix_standings with (security_invoker = true) as
with sides as (
  select team_id,
         player_a_id as player_id,
         case outcome when 'a'    then 1 else 0 end as w,
         case outcome when 'draw' then 1 else 0 end as d,
         case outcome when 'b'    then 1 else 0 end as l
    from public.matrix_logs
   where coalesce(is_deleted, false) = false and team_id is not null
  union all
  select team_id,
         player_b_id,
         case outcome when 'b'    then 1 else 0 end,
         case outcome when 'draw' then 1 else 0 end,
         case outcome when 'a'    then 1 else 0 end
    from public.matrix_logs
   where coalesce(is_deleted, false) = false and team_id is not null
)
select player_id,
       team_id,
       sum(w)              as wins,
       sum(d)              as draws,
       sum(l)              as losses,
       count(*)            as games,
       3 * sum(w) + sum(d) as points,
       round(100.0 * (sum(w) + 0.5 * sum(d)) / nullif(count(*), 0), 1) as win_pct,
       rank() over (
         partition by team_id
         order by 3 * sum(w) + sum(d) desc,
                  (sum(w) + 0.5 * sum(d)) / nullif(count(*), 0) desc nulls last
       ) as rank
  from sides
 group by player_id, team_id;

grant select on public.matrix_standings to anon, authenticated;

-- ─── 11. Drop what team_players and team_id now own ────────────────────────
--
-- These are the originals that section 9 copied into team_players (and that
-- schedule.team_id / matrix_logs.team_id now replace as the way those rows
-- are scoped). This used to be a separate follow-up migration, applied only
-- after the application change shipped and the runbook's checks passed --
-- see the header: that gap existed to protect the data being dropped here,
-- and the project owner has said that protection is no longer needed. There
-- is no rollback past this point.

alter table public.players
  drop column if exists number,
  drop column if exists position,
  drop column if exists season_stats,
  drop column if exists ratings,
  drop column if exists matrix_stats,
  drop column if exists school_id;

alter table public.schedule    drop column if exists school_id;
alter table public.matrix_logs drop column if exists school_id;


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0008_schedule_real_date.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 0008: give schedule a real date to sort and compare on
--
-- schedule.match_date is TEXT, holding whatever a coach typed: 'AUG 28, 2026'
-- in one row, 'SEP 4 2026' in the next. Nothing can order it correctly --
-- alphabetically 'SEP 11 2026' sorts before 'SEP 4 2026' -- so fetchSchedule
-- falls back to created_at, which orders fixtures by when they were entered
-- rather than when they are played. That is what pinned a match from AUG 28 to
-- the home page as NEXT MATCH with the countdown reading 00/00/00.
--
-- Approach: add real date and time columns, derive them from the text with a
-- trigger, and leave match_date/match_time in place.
--
-- Why keep the text columns. They are what the site displays, in the coach's
-- own wording, and every view renders them directly. Replacing them would mean
-- picking a format for everybody. So the split is deliberate and narrow:
--   match_date / match_time  -- what a human reads
--   match_on / kickoff_time  -- what the database sorts and compares
-- The trigger derives the second pair from the first on every write, so they
-- cannot drift no matter which client does the writing. The text stays the
-- single source of truth; the date columns are always downstream of it.
--
-- A row whose date cannot be parsed gets match_on = null rather than a guess.
-- The app already treats an unreadable date as "cannot tell", and a wrong date
-- silently reordering the season is worse than a null.

begin;

alter table public.schedule add column if not exists match_on     date;
alter table public.schedule add column if not exists kickoff_time time;

-- ─── Parsers, shared by the trigger and the backfill ───────────────────────
-- Immutable and null-safe: anything that does not match the expected shape
-- comes back null, never an exception and never a guess.

create or replace function public.parse_match_date(raw text)
returns date
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  if raw is null then return null; end if;

  -- 'AUG 28, 2026' and 'SEP 4 2026' -- the comma is optional, and the month
  -- may be written in full ('September 4, 2026').
  parts := regexp_match(btrim(raw), '^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$');
  if parts is null then return null; end if;

  begin
    -- left(...,3) so both 'SEP' and 'September' feed the MON pattern.
    return to_date(upper(left(parts[1], 3)) || ' ' || parts[2] || ' ' || parts[3], 'MON DD YYYY');
  exception when others then
    return null;
  end;
end;
$$;

create or replace function public.parse_match_time(raw text)
returns time
language plpgsql
immutable
as $$
declare
  parts text[];
  hh    integer;
begin
  if raw is null then return null; end if;

  -- '4:00 PM', '10:30 AM', '16:00'
  parts := regexp_match(upper(btrim(raw)), '^(\d{1,2}):(\d{2})\s*(AM|PM)?$');
  if parts is null then return null; end if;

  hh := parts[1]::integer;
  if    parts[3] = 'PM' and hh < 12 then hh := hh + 12;
  elsif parts[3] = 'AM' and hh = 12 then hh := 0;
  end if;

  if hh > 23 or parts[2]::integer > 59 then return null; end if;
  return make_time(hh, parts[2]::integer, 0);
end;
$$;

-- ─── Keep the derived columns in step on every write ───────────────────────
-- A trigger rather than client-side derivation: the XLSX import, the schedule
-- form, and any future writer all go through this one path, so the two
-- representations cannot disagree.

create or replace function public.sync_schedule_derived_datetime()
returns trigger
language plpgsql
as $$
begin
  new.match_on     := public.parse_match_date(new.match_date);
  new.kickoff_time := public.parse_match_time(new.match_time);
  return new;
end;
$$;

drop trigger if exists sync_schedule_derived_datetime on public.schedule;
create trigger sync_schedule_derived_datetime
  before insert or update of match_date, match_time on public.schedule
  for each row execute function public.sync_schedule_derived_datetime();

-- ─── Backfill the rows that already exist ──────────────────────────────────

update public.schedule
set match_on     = public.parse_match_date(match_date),
    kickoff_time = public.parse_match_time(match_time);

-- Report anything that would not parse, rather than leaving it to be noticed
-- when a fixture sorts to the wrong end of the season.
do $$
declare
  bad record;
  n   integer := 0;
begin
  for bad in
    select id, match_date, match_time
    from public.schedule
    where not coalesce(is_deleted, false)
      and (match_on is null or kickoff_time is null)
  loop
    n := n + 1;
    raise notice 'unparsed: id=% match_date=% match_time=%',
      bad.id, coalesce(bad.match_date, '<null>'), coalesce(bad.match_time, '<null>');
  end loop;

  if n > 0 then
    raise notice '% row(s) could not be parsed. They will sort last and are listed above; fix the text and they will convert on save.', n;
  else
    raise notice 'All schedule rows converted.';
  end if;
end $$;

-- ─── Index the ordering the app actually performs ──────────────────────────

create index if not exists schedule_team_chronological
  on public.schedule (team_id, match_on, kickoff_time)
  where not coalesce(is_deleted, false);

commit;

-- Verify -- fixtures should now come back in true chronological order,
-- and SEP 4 must precede SEP 11:
--   select t.name as team, s.match_date, s.match_on, s.match_time, s.kickoff_time, s.opponent
--   from public.schedule s
--   join public.teams t on t.id = s.team_id
--   where not coalesce(s.is_deleted, false)
--   order by s.match_on nulls last, s.kickoff_time nulls last;

-- Check the trigger holds on a write:
--   update public.schedule set match_date = 'OCT 1 2026'
--   where opponent = 'Palm Springs Indians';
--   select match_date, match_on from public.schedule
--   where opponent = 'Palm Springs Indians';   -- match_on must read 2026-10-01

-- Rollback:
--   drop trigger if exists sync_schedule_derived_datetime on public.schedule;
--   drop function if exists public.sync_schedule_derived_datetime();
--   drop function if exists public.parse_match_date(text);
--   drop function if exists public.parse_match_time(text);
--   drop index if exists public.schedule_team_chronological;
--   alter table public.schedule drop column if exists match_on;
--   alter table public.schedule drop column if exists kickoff_time;


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0009_weighted_matrix_scoring.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- supabase/migrations/0009_weighted_matrix_scoring.sql
--
-- Weighted matrix scoring. See
-- docs/superpowers/specs/2026-08-31-weighted-matrix-scoring-design.md
--
-- APPLY THIS BEFORE DEPLOYING THE MATCHING CODE. The new code writes the
-- `measure` column and the two tables below; against a database without them
-- those writes are hard 400s that break drill saving and session recording.
-- Applying first only costs a brief window where the standings read zeros,
-- because the deployed mapping is still looking for the old column names.

begin;

-- The Supabase SQL editor may run as a role that is a MEMBER of postgres
-- without defaulting to it. ALTER TABLE and CREATE POLICY both check
-- ownership rather than privilege, so they fail with
--   42501: must be owner of table drills_bank
-- even though the privilege is reachable. Adopting the role for the
-- transaction fixes it; commit releases it.
--
-- If this line itself errors with "permission denied to set role", the editor
-- session is not a member of postgres. In that case apply the three
-- ownership-requiring changes through the dashboard's table editor --
-- drills_bank.points to numeric(3,1), the new drills_bank.measure column, and
-- the drills_bank_select policy in section 3b -- and re-run this file with
-- sections 1 and 3b commented out.
set role postgres;

-- ─── 1. Weight and measure on the drill ────────────────────────────────────
-- The drills library has a weight field and renders it, but the LIVE
-- drills_bank has no `points` column at all -- supabase_schema.sql declares
-- `points INT DEFAULT 3` and `duration TEXT NOT NULL`, and the real table has
-- neither. The static schema has drifted from the database. That is also why
-- upsertDrillBankItem never wrote the field: there was nowhere to write it.
--
-- So add the column rather than assuming it. The ALTER that follows is a
-- no-op when this ADD just created it, and does the real widening on any
-- database where it already exists as INT -- INT cannot hold 2.5, which is
-- the whole point. Written this way the migration is correct against both.

alter table public.drills_bank
  add column if not exists points numeric(3,1) default 3;

alter table public.drills_bank
  alter column points type numeric(3,1) using points::numeric(3,1);

alter table public.drills_bank
  add column if not exists measure text not null default 'head_to_head'
  check (measure in ('head_to_head', 'win_loss', 'count_high', 'time_low'));

-- ─── 2. Sessions ───────────────────────────────────────────────────────────
-- drill_id is NOT NULL and ON DELETE RESTRICT: a session with no drill has no
-- weight and no measure, so it cannot be scored, and deleting a drill out from
-- under recorded results would silently change the standings.

create table if not exists public.matrix_sessions (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  drill_id    uuid not null references public.drills_bank(id) on delete restrict,
  occurred_on date not null,
  notes       text,
  is_deleted  boolean default false,
  created_at  timestamptz default now()
);

-- The composite primary key is what stops a player being entered twice in one
-- session, which would count them twice in both numerator and denominator.
create table if not exists public.matrix_session_results (
  session_id uuid not null references public.matrix_sessions(id) on delete cascade,
  player_id  uuid not null references public.players(id) on delete cascade,
  attendance text not null default 'present'
             check (attendance in ('present', 'excused', 'unexcused')),
  raw_value  numeric,
  outcome    text check (outcome in ('win', 'draw', 'loss')),
  primary key (session_id, player_id)
);

create index if not exists matrix_sessions_team_date
  on public.matrix_sessions (team_id, occurred_on desc)
  where not coalesce(is_deleted, false);

-- ─── 3. RLS: public read, team-coach write ─────────────────────────────────

alter table public.matrix_sessions        enable row level security;
alter table public.matrix_session_results enable row level security;

grant select
  on public.matrix_sessions, public.matrix_session_results
  to anon, authenticated;

grant insert, update, delete
  on public.matrix_sessions, public.matrix_session_results
  to authenticated;

drop policy if exists "matrix_sessions_select" on public.matrix_sessions;
create policy "matrix_sessions_select" on public.matrix_sessions
  for select using (not coalesce(is_deleted, false));

drop policy if exists "matrix_sessions_write" on public.matrix_sessions;
create policy "matrix_sessions_write" on public.matrix_sessions
  for all using (public.is_team_coach(team_id))
  with check (public.is_team_coach(team_id));

-- Results carry no team_id of their own; they reach the team through the
-- session, so both USING and WITH CHECK go through that join.
drop policy if exists "matrix_session_results_select" on public.matrix_session_results;
create policy "matrix_session_results_select" on public.matrix_session_results
  for select using (true);

drop policy if exists "matrix_session_results_write" on public.matrix_session_results;
create policy "matrix_session_results_write" on public.matrix_session_results
  for all using (
    exists (select 1 from public.matrix_sessions s
             where s.id = session_id and public.is_team_coach(s.team_id))
  )
  with check (
    exists (select 1 from public.matrix_sessions s
             where s.id = session_id and public.is_team_coach(s.team_id))
  );

-- ─── 3b. drills_bank read consistency for the standings view ───────────────
--
-- matrix_standings (section 4 below) joins drills_bank under
-- security_invoker = true so that RLS on matrix_logs/matrix_sessions is
-- correctly evaluated as the calling user. But drills_bank has TWO
-- permissive select policies from supabase_migration_auth.sql section 6 —
-- "drills_bank_select" (coalesce(is_deleted, false) = false) for everyone,
-- and "drills_bank_write" (for all, coach/admin only) which also grants
-- coaches select. Postgres OR's permissive policies together, so a coach
-- can select soft-deleted rows and a player cannot. Joined into a
-- security_invoker view, that means the drill's weight (and therefore the
-- player's share) becomes reader-dependent: once a coach retires a drill
-- that already has recorded results, players lose those sessions from the
-- join and get scored at the coalesce(...,1.0) fallback weight while the
-- coach still sees the drill's real weight. Same standings must mean the
-- same numbers for everyone who looks at them, so the select policy is
-- widened to `true` here.
--
-- This exposes soft-deleted drills' columns (name, category, coach_notes)
-- to anon/authenticated select. That is not a new exposure in practice:
-- those same columns are already anon-readable on every non-deleted drill
-- today via this same policy family — only the is_deleted=false rows they
-- could see before now includes is_deleted=true rows too. Reversible by
-- re-running the coalesce(is_deleted, false) = false definition from
-- supabase_migration_auth.sql section 6.
drop policy if exists "drills_bank_select" on public.drills_bank;
create policy "drills_bank_select" on public.drills_bank for select using (true);

-- ─── 4. matrix_standings, rewritten ────────────────────────────────────────
--
-- Replaces the win-3/draw-1/loss-0 derivation from 0003 and 0005 section 10.
-- Every exercise contributes `earned` and `available`; available is always the
-- drill's weight, and the best result earns all of it.
--
-- security_invoker = true is REQUIRED. Without it the view runs as its owner
-- and bypasses RLS on matrix_logs and the session tables.

drop view if exists public.matrix_standings;

create view public.matrix_standings with (security_invoker = true) as
with h2h as (
  -- Each side of each logged 1v1 pairing. A pairing with no drill scores at
  -- weight 1.0: drill_id is nullable and the record modal offers "— none —",
  -- so refusing those would break a form that works today.
  --
  -- Deliberately, unlike 0005 section 10, there is no `and team_id is not
  -- null` filter here: this view is already grouped by team_id, so a null
  -- team_id row groups harmlessly on its own and is simply never selected
  -- against a real team.
  select l.team_id,
         l.player_a_id as player_id,
         coalesce(d.points, 1.0) as weight,
         case l.outcome when 'a' then 1.0 when 'draw' then 0.5 else 0.0 end as factor,
         case l.outcome when 'a'    then 1 else 0 end as w,
         case l.outcome when 'draw' then 1 else 0 end as dr,
         case l.outcome when 'b'    then 1 else 0 end as ls
    from public.matrix_logs l
    left join public.drills_bank d on d.id = l.drill_id
   where not coalesce(l.is_deleted, false)
  union all
  select l.team_id,
         l.player_b_id,
         coalesce(d.points, 1.0),
         case l.outcome when 'b' then 1.0 when 'draw' then 0.5 else 0.0 end,
         case l.outcome when 'b'    then 1 else 0 end,
         case l.outcome when 'draw' then 1 else 0 end,
         case l.outcome when 'a'    then 1 else 0 end
    from public.matrix_logs l
    left join public.drills_bank d on d.id = l.drill_id
   where not coalesce(l.is_deleted, false)
),
ranked as (
  -- Measured tests. percent_rank() is computed over PRESENT players only:
  -- including absentees in the partition would push everyone down a place.
  select s.team_id,
         r.player_id,
         d.points as weight,
         percent_rank() over (
           partition by r.session_id
           order by case when d.measure = 'time_low' then r.raw_value
                         else -r.raw_value end
         )::numeric as pr
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'present'
     and d.measure in ('count_high', 'time_low')
     and r.raw_value is not null
),
win_loss as (
  select s.team_id,
         r.player_id,
         d.points as weight,
         case r.outcome when 'win' then 1.0 when 'draw' then 0.5 else 0.0 end as factor,
         case r.outcome when 'win'  then 1 else 0 end as w,
         case r.outcome when 'draw' then 1 else 0 end as dr,
         case r.outcome when 'loss' then 1 else 0 end as ls
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'present'
     and d.measure = 'win_loss'
     and r.outcome is not null
),
absent as (
  -- Unexcused only. An excused absence appears in neither numerator nor
  -- denominator, so it is simply not selected here.
  select s.team_id, r.player_id, d.points as weight
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'unexcused'
),
parts as (
  select team_id, player_id, weight * factor as earned, weight as available,
         w, dr, ls, 1 as exercise
    from h2h
  union all
  -- greatest(0.25, ...) is the participation floor: last place still beats a
  -- no-show, without which the excused/unexcused distinction is meaningless.
  select team_id, player_id, weight * greatest(0.25, 1 - pr), weight,
         0, 0, 0, 1
    from ranked
  union all
  select team_id, player_id, weight * factor, weight, w, dr, ls, 1
    from win_loss
  union all
  select team_id, player_id, 0, weight, 0, 0, 0, 1
    from absent
)
select team_id,
       player_id,
       sum(w)                          as wins,
       sum(dr)                         as draws,
       sum(ls)                         as losses,
       sum(w) + sum(dr) + sum(ls)      as games,
       sum(exercise)                   as exercises,
       round(sum(earned)::numeric, 3)  as earned,
       round(sum(available)::numeric, 3) as available,
       round(100.0 * sum(earned) / nullif(sum(available), 0), 1) as share,
       rank() over (
         partition by team_id
         order by sum(earned) / nullif(sum(available), 0) desc nulls last,
                  sum(earned) desc
       ) as rank
  from parts
 group by team_id, player_id;

grant select on public.matrix_standings to anon, authenticated;

-- ─── 5. Self-check ─────────────────────────────────────────────────────────
--
-- Inserts the spec's worked example, asserts the three shares, and deletes the
-- fixture. Fixed UUIDs so the cleanup is exact. If this raises, the view is
-- wrong — do not ignore it.

do $$
declare
  fx_school uuid := '00000000-0000-4000-8000-000000000001';
  fx_team   uuid := '00000000-0000-4000-8000-000000000002';
  p_cesar   uuid := '00000000-0000-4000-8000-000000000011';
  p_caleb   uuid := '00000000-0000-4000-8000-000000000012';
  p_dylan   uuid := '00000000-0000-4000-8000-000000000013';
  d_cooper  uuid := '00000000-0000-4000-8000-000000000021';
  d_1v1     uuid := '00000000-0000-4000-8000-000000000022';
  d_ssg     uuid := '00000000-0000-4000-8000-000000000023';
  s_cooper  uuid := '00000000-0000-4000-8000-000000000031';
  s_ssg     uuid := '00000000-0000-4000-8000-000000000032';
  got       numeric;
begin
  insert into public.schools (id, code, name, mascot, kind)
    values (fx_school, 'zzselfcheck', 'Self Check', 'Fixture', 'school');
  insert into public.teams (id, school_id, name)
    values (fx_team, fx_school, 'Self Check Team');
  -- class_year is NOT NULL and 0005 did not drop it, unlike number/position.
  insert into public.players (id, name, class_year) values
    (p_cesar, 'SelfCheck Cesar', '2027'),
    (p_caleb, 'SelfCheck Caleb', '2027'),
    (p_dylan, 'SelfCheck Dylan', '2027');

  -- No `duration`: supabase_schema.sql declares it NOT NULL but the live table
  -- does not have the column. Verified against the running database.
  insert into public.drills_bank (id, school_id, name, category, points, measure) values
    (d_cooper, fx_school, 'SelfCheck Coopers', 'Fitness',   1.5, 'count_high'),
    (d_1v1,    fx_school, 'SelfCheck 1v1',     'Technical', 3.0, 'head_to_head'),
    (d_ssg,    fx_school, 'SelfCheck SSG',     'Tactical',  2.5, 'win_loss');

  -- 1v1: Cesar beats Caleb; Dylan draws with... nobody available, so Dylan's
  -- draw is against Caleb. Caleb therefore has two pairings, which the
  -- expected numbers below account for.
  insert into public.matrix_logs (team_id, player_a_id, player_b_id, outcome, drill_id, occurred_on)
    values (fx_team, p_cesar, p_caleb, 'a',    d_1v1, current_date),
           (fx_team, p_dylan, p_caleb, 'draw', d_1v1, current_date);

  insert into public.matrix_sessions (id, team_id, drill_id, occurred_on) values
    (s_cooper, fx_team, d_cooper, current_date),
    (s_ssg,    fx_team, d_ssg,    current_date);

  insert into public.matrix_session_results (session_id, player_id, attendance, raw_value) values
    (s_cooper, p_cesar, 'present', 2800),
    (s_cooper, p_caleb, 'present', 2650),
    (s_cooper, p_dylan, 'present', 2500);

  insert into public.matrix_session_results (session_id, player_id, attendance, outcome) values
    (s_ssg, p_cesar, 'present', 'win'),
    (s_ssg, p_caleb, 'present', 'win'),
    (s_ssg, p_dylan, 'present', 'loss');

  -- Cesar: coopers 1.500/1.500 + 1v1 3.000/3.000 + ssg 2.500/2.500
  --        = 7.000 / 7.000 = 100.0
  select share into got from public.matrix_standings
   where team_id = fx_team and player_id = p_cesar;
  if got is distinct from 100.0 then
    raise exception 'self-check: Cesar expected 100.0, got %', got;
  end if;

  -- Dylan: coopers 0.375/1.500 (floor) + 1v1 draw 1.500/3.000 + ssg 0.000/2.500
  --        = 1.875 / 7.000 = 26.8
  select share into got from public.matrix_standings
   where team_id = fx_team and player_id = p_dylan;
  if got is distinct from 26.8 then
    raise exception 'self-check: Dylan expected 26.8, got %', got;
  end if;

  -- Caleb: coopers 0.750/1.500 + 1v1 loss 0.000/3.000 + 1v1 draw 1.500/3.000
  --        + ssg 2.500/2.500 = 4.750 / 10.000 = 47.5
  -- Two pairings, so his available is 10.000 rather than 7.000.
  select share into got from public.matrix_standings
   where team_id = fx_team and player_id = p_caleb;
  if got is distinct from 47.5 then
    raise exception 'self-check: Caleb expected 47.5, got %', got;
  end if;

  raise notice 'matrix_standings self-check passed.';

  delete from public.matrix_session_results where session_id in (s_cooper, s_ssg);
  delete from public.matrix_sessions where id in (s_cooper, s_ssg);
  delete from public.matrix_logs where team_id = fx_team;
  delete from public.drills_bank where id in (d_cooper, d_1v1, d_ssg);
  delete from public.players where id in (p_cesar, p_caleb, p_dylan);
  delete from public.teams where id = fx_team;
  delete from public.schools where id = fx_school;
end $$;

commit;

-- Rollback:
--   drop view if exists public.matrix_standings;
--   drop table if exists public.matrix_session_results;
--   drop table if exists public.matrix_sessions;
--   alter table public.drills_bank drop column if exists measure;
--   alter table public.drills_bank alter column points type integer using round(points);
--   -- then re-run the matrix_standings definition from
--   -- supabase/migrations/0005_multi_team_schema.sql section 10.
--
-- Note: reverting points to integer rounds 2.5 to 2. Record any custom weights
-- before rolling back.


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0010_matrix_exercise_points.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 0010: a per-exercise breakdown, and matrix_standings rebuilt on top of it
--
-- APPLY THIS BEFORE DEPLOYING THE MATCHING CODE, for the same reason as 0009:
-- the new code reads matrix_exercise_points, which does not exist until this
-- runs. The standings themselves keep their existing shape, so the deployed
-- old code is unaffected while this sits applied and the new code is not.
--
-- Why this exists. The leaderboard answers "who is first"; a coach also needs
-- "why am I fourth", which means one line per exercise showing what a player
-- did and what it earned.
--
-- Why it is a view rather than a client calculation. The scoring rules live in
-- SQL. Re-deriving a per-exercise breakdown in JavaScript would put the same
-- rules in two places, and the day they disagreed the detail panel would
-- contradict the leaderboard it was opened from, with nothing to say which was
-- right. This repository's defining hazard is exactly that kind of parallel
-- copy -- CLAUDE.md warns about it in three separate places.
--
-- Why matrix_standings is REBUILT rather than left alone. Its scoring CTEs and
-- this view's would otherwise be two copies of the same logic, which is the
-- problem restated one level down. So the breakdown becomes the single source
-- and the standings aggregate it. The leaderboard is then the sum of the
-- detail BY CONSTRUCTION, not by two calculations being carefully kept in
-- agreement.
--
-- The scoring itself is unchanged from 0009. Verified by the self-check at the
-- end, which asserts the same three shares against the same fixture.

begin;

set role postgres;

-- ─── 1. matrix_exercise_points ─────────────────────────────────────────────
-- One row per player per scored exercise. This is 0009's `parts` CTE, kept
-- whole rather than aggregated away, plus the columns needed to describe the
-- line to a human: what the exercise was, when, and what the player did.
--
-- security_invoker = true is REQUIRED. Without it the view runs as its owner
-- and bypasses RLS on matrix_logs and the session tables.

drop view if exists public.matrix_standings;
drop view if exists public.matrix_exercise_points;

create view public.matrix_exercise_points with (security_invoker = true) as
with h2h as (
  -- Each side of each logged 1v1 pairing. A pairing with no drill scores at
  -- weight 1.0: drill_id is nullable and the record modal offers "— none —".
  select l.team_id,
         l.player_a_id                  as player_id,
         l.player_b_id                  as opponent_id,
         l.drill_id,
         coalesce(d.name, '1v1')        as exercise,
         coalesce(d.points, 1.0)        as weight,
         l.occurred_on,
         case l.outcome when 'a' then 'win' when 'draw' then 'draw' else 'loss' end as detail,
         null::numeric                  as raw_value,
         'present'::text                as attendance,
         case l.outcome when 'a' then 1.0 when 'draw' then 0.5 else 0.0 end as factor,
         case l.outcome when 'a'    then 1 else 0 end as w,
         case l.outcome when 'draw' then 1 else 0 end as dr,
         case l.outcome when 'b'    then 1 else 0 end as ls
    from public.matrix_logs l
    left join public.drills_bank d on d.id = l.drill_id
   where not coalesce(l.is_deleted, false)
  union all
  select l.team_id,
         l.player_b_id,
         l.player_a_id,
         l.drill_id,
         coalesce(d.name, '1v1'),
         coalesce(d.points, 1.0),
         l.occurred_on,
         case l.outcome when 'b' then 'win' when 'draw' then 'draw' else 'loss' end,
         null::numeric,
         'present'::text,
         case l.outcome when 'b' then 1.0 when 'draw' then 0.5 else 0.0 end,
         case l.outcome when 'b'    then 1 else 0 end,
         case l.outcome when 'draw' then 1 else 0 end,
         case l.outcome when 'a'    then 1 else 0 end
    from public.matrix_logs l
    left join public.drills_bank d on d.id = l.drill_id
   where not coalesce(l.is_deleted, false)
),
ranked as (
  -- Measured tests. percent_rank() is computed over PRESENT players only:
  -- including absentees in the partition would push everyone down a place.
  -- The ::numeric cast keeps the whole chain numeric -- without it earned
  -- resolves to double precision and round(float8, int) does not exist.
  select s.team_id,
         r.player_id,
         s.drill_id,
         d.name        as exercise,
         d.points      as weight,
         s.occurred_on,
         r.raw_value,
         percent_rank() over (
           partition by r.session_id
           order by case when d.measure = 'time_low' then r.raw_value
                         else -r.raw_value end
         )::numeric    as pr
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'present'
     and d.measure in ('count_high', 'time_low')
     and r.raw_value is not null
),
win_loss as (
  select s.team_id,
         r.player_id,
         s.drill_id,
         d.name   as exercise,
         d.points as weight,
         s.occurred_on,
         r.outcome,
         case r.outcome when 'win' then 1.0 when 'draw' then 0.5 else 0.0 end as factor,
         case r.outcome when 'win'  then 1 else 0 end as w,
         case r.outcome when 'draw' then 1 else 0 end as dr,
         case r.outcome when 'loss' then 1 else 0 end as ls
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'present'
     and d.measure = 'win_loss'
     and r.outcome is not null
),
absent as (
  -- Unexcused only. An excused absence appears in neither numerator nor
  -- denominator, so it is simply not selected here -- which is also why it
  -- does not appear as a line in the breakdown.
  select s.team_id, r.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'unexcused'
)
select team_id, player_id, drill_id, exercise, occurred_on,
       'head_to_head'::text as kind,
       opponent_id,
       raw_value,
       detail,
       attendance,
       weight,
       weight * factor as earned,
       weight          as available,
       w, dr, ls,
       1 as exercise_count
  from h2h
union all
-- greatest(0.25, ...) is the participation floor: last place still beats a
-- no-show, without which the excused/unexcused distinction is meaningless.
select team_id, player_id, drill_id, exercise, occurred_on,
       'measured'::text, null::uuid, raw_value,
       null::text, 'present'::text, weight,
       weight * greatest(0.25, 1 - pr), weight,
       0, 0, 0, 1
  from ranked
union all
select team_id, player_id, drill_id, exercise, occurred_on,
       'win_loss'::text, null::uuid, null::numeric,
       outcome, 'present'::text, weight,
       weight * factor, weight,
       w, dr, ls, 1
  from win_loss
union all
select team_id, player_id, drill_id, exercise, occurred_on,
       'absent'::text, null::uuid, null::numeric,
       null::text, 'unexcused'::text, weight,
       0, weight,
       0, 0, 0, 1
  from absent;

grant select on public.matrix_exercise_points to anon, authenticated;

-- ─── 2. matrix_standings, now an aggregate of the breakdown ────────────────
-- Same columns and same numbers as 0009; it simply sums the view above
-- instead of repeating its CTEs. That is the point: the leaderboard is the
-- sum of the detail by construction, so the two cannot drift apart.

create view public.matrix_standings with (security_invoker = true) as
select team_id,
       player_id,
       sum(w)                             as wins,
       sum(dr)                            as draws,
       sum(ls)                            as losses,
       sum(w) + sum(dr) + sum(ls)         as games,
       sum(exercise_count)                as exercises,
       round(sum(earned)::numeric, 3)     as earned,
       round(sum(available)::numeric, 3)  as available,
       round(100.0 * sum(earned) / nullif(sum(available), 0), 1) as share,
       rank() over (
         partition by team_id
         order by sum(earned) / nullif(sum(available), 0) desc nulls last,
                  sum(earned) desc
       ) as rank
  from public.matrix_exercise_points
 group by team_id, player_id;

grant select on public.matrix_standings to anon, authenticated;

-- ─── 3. Self-check ─────────────────────────────────────────────────────────
-- The same fixture and the same three assertions as 0009. If the rebuild
-- changed any number, this raises and the whole migration rolls back.
-- It also asserts that the breakdown sums to the standings, which is the
-- property the rebuild exists to guarantee.

do $$
declare
  fx_school uuid := '00000000-0000-4000-8000-000000000001';
  fx_team   uuid := '00000000-0000-4000-8000-000000000002';
  p_cesar   uuid := '00000000-0000-4000-8000-000000000011';
  p_caleb   uuid := '00000000-0000-4000-8000-000000000012';
  p_dylan   uuid := '00000000-0000-4000-8000-000000000013';
  d_cooper  uuid := '00000000-0000-4000-8000-000000000021';
  d_1v1     uuid := '00000000-0000-4000-8000-000000000022';
  d_ssg     uuid := '00000000-0000-4000-8000-000000000023';
  s_cooper  uuid := '00000000-0000-4000-8000-000000000031';
  s_ssg     uuid := '00000000-0000-4000-8000-000000000032';
  got       numeric;
  lines     integer;
begin
  insert into public.schools (id, code, name, mascot, kind)
    values (fx_school, 'zzselfcheck', 'Self Check', 'Fixture', 'school');
  insert into public.teams (id, school_id, name)
    values (fx_team, fx_school, 'Self Check Team');
  -- class_year is NOT NULL and 0005 did not drop it, unlike number/position.
  insert into public.players (id, name, class_year) values
    (p_cesar, 'SelfCheck Cesar', '2027'),
    (p_caleb, 'SelfCheck Caleb', '2027'),
    (p_dylan, 'SelfCheck Dylan', '2027');

  -- No `duration`: declared in supabase_schema.sql, absent from the live table.
  insert into public.drills_bank (id, school_id, name, category, points, measure) values
    (d_cooper, fx_school, 'SelfCheck Coopers', 'Fitness',   1.5, 'count_high'),
    (d_1v1,    fx_school, 'SelfCheck 1v1',     'Technical', 3.0, 'head_to_head'),
    (d_ssg,    fx_school, 'SelfCheck SSG',     'Tactical',  2.5, 'win_loss');

  insert into public.matrix_logs (team_id, player_a_id, player_b_id, outcome, drill_id, occurred_on)
    values (fx_team, p_cesar, p_caleb, 'a',    d_1v1, current_date),
           (fx_team, p_dylan, p_caleb, 'draw', d_1v1, current_date);

  insert into public.matrix_sessions (id, team_id, drill_id, occurred_on) values
    (s_cooper, fx_team, d_cooper, current_date),
    (s_ssg,    fx_team, d_ssg,    current_date);

  insert into public.matrix_session_results (session_id, player_id, attendance, raw_value) values
    (s_cooper, p_cesar, 'present', 2800),
    (s_cooper, p_caleb, 'present', 2650),
    (s_cooper, p_dylan, 'present', 2500);

  insert into public.matrix_session_results (session_id, player_id, attendance, outcome) values
    (s_ssg, p_cesar, 'present', 'win'),
    (s_ssg, p_caleb, 'present', 'win'),
    (s_ssg, p_dylan, 'present', 'loss');

  -- Cesar: coopers 1.500/1.500 + 1v1 3.000/3.000 + ssg 2.500/2.500 = 100.0
  select share into got from public.matrix_standings
   where team_id = fx_team and player_id = p_cesar;
  if got is distinct from 100.0 then
    raise exception 'self-check: Cesar expected 100.0, got %', got;
  end if;

  -- Dylan: coopers 0.375/1.500 (floor) + 1v1 draw 1.500/3.000 + ssg 0.000/2.500
  --        = 1.875 / 7.000 = 26.8
  select share into got from public.matrix_standings
   where team_id = fx_team and player_id = p_dylan;
  if got is distinct from 26.8 then
    raise exception 'self-check: Dylan expected 26.8, got %', got;
  end if;

  -- Caleb plays TWO pairings here (a loss and a draw), so his available is
  -- 10.000 rather than 7.000: 4.750 / 10.000 = 47.5.
  select share into got from public.matrix_standings
   where team_id = fx_team and player_id = p_caleb;
  if got is distinct from 47.5 then
    raise exception 'self-check: Caleb expected 47.5, got %', got;
  end if;

  -- The property the rebuild exists for: the breakdown must sum to the
  -- standings. If these ever disagree the detail panel would contradict the
  -- leaderboard it opened from.
  select round(sum(earned)::numeric, 3) into got
    from public.matrix_exercise_points
   where team_id = fx_team and player_id = p_cesar;
  if got is distinct from 7.000 then
    raise exception 'self-check: breakdown sums to % for Cesar, expected 7.000', got;
  end if;

  -- Cesar has three lines: one pairing, one measured, one win_loss.
  select count(*) into lines
    from public.matrix_exercise_points
   where team_id = fx_team and player_id = p_cesar;
  if lines <> 3 then
    raise exception 'self-check: Cesar has % breakdown lines, expected 3', lines;
  end if;

  raise notice 'matrix_exercise_points self-check passed.';

  delete from public.matrix_session_results where session_id in (s_cooper, s_ssg);
  delete from public.matrix_sessions where id in (s_cooper, s_ssg);
  delete from public.matrix_logs where team_id = fx_team;
  delete from public.drills_bank where id in (d_cooper, d_1v1, d_ssg);
  delete from public.players where id in (p_cesar, p_caleb, p_dylan);
  delete from public.teams where id = fx_team;
  delete from public.schools where id = fx_school;
end $$;

commit;

-- Verify — one player's breakdown should sum to their standings row:
--   select exercise, occurred_on, kind, detail, raw_value, earned, available
--   from public.matrix_exercise_points
--   where player_id = '<uuid>'
--   order by occurred_on desc, exercise;

-- Rollback:
--   drop view if exists public.matrix_standings;
--   drop view if exists public.matrix_exercise_points;
--   -- then re-run section 4 of
--   -- supabase/migrations/0009_weighted_matrix_scoring.sql, which defines
--   -- matrix_standings with its own CTEs.


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0011_rank_on_points.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 0011: rank on points earned, and stop un-entered players vanishing
--
-- APPLY BEFORE DEPLOYING THE MATCHING CODE. The standings keep their column
-- shape, so old code keeps working while this sits applied; only the ordering
-- and one new breakdown row type change.
--
-- ── Why the ranking changes ───────────────────────────────────────────────
--
-- 0009 ranked on share -- points earned divided by points available -- so that
-- a missed session could not sink a season. On real data that turned out to
-- reward the wrong thing: a player who competed only in fitness tests, and did
-- well, outranked a player who won every 1v1 but ran a mediocre Cooper's. The
-- narrow record had a small denominator and nothing to drag it down.
--
-- Ranking on points earned inverts that. Competing in what matters most, and
-- winning, is what accumulates; avoiding the hard exercise simply earns
-- nothing. It also makes the weights bite: a 1v1 at 3.0 is worth three
-- Cooper's at 1.0, which is the whole point of having weights.
--
-- What it costs, stated plainly: there is no denominator any more, so an
-- excused absence is no longer free. A player out injured for three weeks has
-- fewer points and cannot catch up. The table cannot tell "injured" from
-- "avoiding the 1v1", so `share` remains a column beside the points -- the
-- coach reads both and makes that judgement themselves.
--
-- Share breaks ties: two players on equal points are separated by the one who
-- got there from less exposure.
--
-- ── Why un-entered players now count ──────────────────────────────────────
--
-- A roster player with no row in a session contributed nothing to either side
-- of the calculation -- identical to being excused. So a coach who entered
-- only the players who turned up silently excused everyone else. Those players
-- now score zero against the exercise's full weight, the same as a no-show,
-- and appear in the breakdown labelled `not_entered` so the coach can tell a
-- deliberate no-show from a gap in data entry.
--
-- The membership date guard matters: team_players.created_at is compared to
-- the session date so a player who joined the squad LAST WEEK is not charged
-- for a session three weeks ago. Without it every new signing would arrive
-- with a history of absences they could not have attended.

begin;

set role postgres;

drop view if exists public.matrix_standings;
drop view if exists public.matrix_exercise_points;

create view public.matrix_exercise_points with (security_invoker = true) as
with h2h as (
  select l.team_id,
         l.player_a_id                  as player_id,
         l.player_b_id                  as opponent_id,
         l.drill_id,
         coalesce(d.name, '1v1')        as exercise,
         coalesce(d.points, 1.0)        as weight,
         l.occurred_on,
         case l.outcome when 'a' then 'win' when 'draw' then 'draw' else 'loss' end as detail,
         null::numeric                  as raw_value,
         'present'::text                as attendance,
         case l.outcome when 'a' then 1.0 when 'draw' then 0.5 else 0.0 end as factor,
         case l.outcome when 'a'    then 1 else 0 end as w,
         case l.outcome when 'draw' then 1 else 0 end as dr,
         case l.outcome when 'b'    then 1 else 0 end as ls
    from public.matrix_logs l
    left join public.drills_bank d on d.id = l.drill_id
   where not coalesce(l.is_deleted, false)
  union all
  select l.team_id,
         l.player_b_id,
         l.player_a_id,
         l.drill_id,
         coalesce(d.name, '1v1'),
         coalesce(d.points, 1.0),
         l.occurred_on,
         case l.outcome when 'b' then 'win' when 'draw' then 'draw' else 'loss' end,
         null::numeric,
         'present'::text,
         case l.outcome when 'b' then 1.0 when 'draw' then 0.5 else 0.0 end,
         case l.outcome when 'b'    then 1 else 0 end,
         case l.outcome when 'draw' then 1 else 0 end,
         case l.outcome when 'a'    then 1 else 0 end
    from public.matrix_logs l
    left join public.drills_bank d on d.id = l.drill_id
   where not coalesce(l.is_deleted, false)
),
ranked as (
  -- percent_rank() over PRESENT players only; the ::numeric cast keeps the
  -- whole chain numeric, without which round(float8, int) does not exist.
  select s.team_id, r.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on, r.raw_value,
         percent_rank() over (
           partition by r.session_id
           order by case when d.measure = 'time_low' then r.raw_value
                         else -r.raw_value end
         )::numeric as pr
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'present'
     and d.measure in ('count_high', 'time_low')
     and r.raw_value is not null
),
win_loss as (
  select s.team_id, r.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on, r.outcome,
         case r.outcome when 'win' then 1.0 when 'draw' then 0.5 else 0.0 end as factor,
         case r.outcome when 'win'  then 1 else 0 end as w,
         case r.outcome when 'draw' then 1 else 0 end as dr,
         case r.outcome when 'loss' then 1 else 0 end as ls
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'present'
     and d.measure = 'win_loss'
     and r.outcome is not null
),
absent as (
  -- Explicitly marked no-shows. Excused is still selected nowhere, which is
  -- what excused means.
  select s.team_id, r.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'unexcused'
),
not_entered as (
  -- On the roster when the session ran, but never given a row at all. Scores
  -- as a no-show; labelled separately so a coach can tell a real absence from
  -- a session they only half-filled in.
  select s.team_id, tp.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on
    from public.matrix_sessions s
    join public.drills_bank d on d.id = s.drill_id
    join public.team_players tp
      on tp.team_id = s.team_id
     and not coalesce(tp.is_deleted, false)
     -- The guard that stops a new signing inheriting old absences.
     and tp.created_at::date <= s.occurred_on
   where not coalesce(s.is_deleted, false)
     and not exists (
       select 1 from public.matrix_session_results r
        where r.session_id = s.id and r.player_id = tp.player_id
     )
)
select team_id, player_id, drill_id, exercise, occurred_on,
       'head_to_head'::text as kind, opponent_id, raw_value, detail, attendance,
       weight, weight * factor as earned, weight as available,
       w, dr, ls, 1 as exercise_count
  from h2h
union all
-- greatest(0.25, ...) is the participation floor: last place still beats not
-- turning up at all.
select team_id, player_id, drill_id, exercise, occurred_on,
       'measured'::text, null::uuid, raw_value, null::text, 'present'::text,
       weight, weight * greatest(0.25, 1 - pr), weight, 0, 0, 0, 1
  from ranked
union all
select team_id, player_id, drill_id, exercise, occurred_on,
       'win_loss'::text, null::uuid, null::numeric, outcome, 'present'::text,
       weight, weight * factor, weight, w, dr, ls, 1
  from win_loss
union all
select team_id, player_id, drill_id, exercise, occurred_on,
       'absent'::text, null::uuid, null::numeric, null::text, 'unexcused'::text,
       weight, 0, weight, 0, 0, 0, 1
  from absent
union all
select team_id, player_id, drill_id, exercise, occurred_on,
       'not_entered'::text, null::uuid, null::numeric, null::text, 'unexcused'::text,
       weight, 0, weight, 0, 0, 0, 1
  from not_entered;

grant select on public.matrix_exercise_points to anon, authenticated;

-- ── matrix_standings: same columns, points-first ordering ─────────────────

create view public.matrix_standings with (security_invoker = true) as
select team_id,
       player_id,
       sum(w)                             as wins,
       sum(dr)                            as draws,
       sum(ls)                            as losses,
       sum(w) + sum(dr) + sum(ls)         as games,
       sum(exercise_count)                as exercises,
       round(sum(earned)::numeric, 3)     as earned,
       round(sum(available)::numeric, 3)  as available,
       round(100.0 * sum(earned) / nullif(sum(available), 0), 1) as share,
       rank() over (
         partition by team_id
         -- Points first: competing in what matters, and winning, is what
         -- rises. Share breaks ties, so two players on equal points are
         -- separated by the one who got there from less exposure.
         order by sum(earned) desc,
                  sum(earned) / nullif(sum(available), 0) desc nulls last
       ) as rank
  from public.matrix_exercise_points
 group by team_id, player_id;

grant select on public.matrix_standings to anon, authenticated;

-- ── Self-check ────────────────────────────────────────────────────────────
-- The same fixture as 0009/0010, extended to cover the two new behaviours:
-- points-first ordering, and the not_entered rule with its join-date guard.

do $$
declare
  fx_school uuid := '00000000-0000-4000-8000-000000000001';
  fx_team   uuid := '00000000-0000-4000-8000-000000000002';
  p_cesar   uuid := '00000000-0000-4000-8000-000000000011';
  p_caleb   uuid := '00000000-0000-4000-8000-000000000012';
  p_dylan   uuid := '00000000-0000-4000-8000-000000000013';
  p_skip    uuid := '00000000-0000-4000-8000-000000000014';  -- on the team, never entered
  p_new     uuid := '00000000-0000-4000-8000-000000000015';  -- joined after the session
  d_cooper  uuid := '00000000-0000-4000-8000-000000000021';
  d_1v1     uuid := '00000000-0000-4000-8000-000000000022';
  d_ssg     uuid := '00000000-0000-4000-8000-000000000023';
  s_cooper  uuid := '00000000-0000-4000-8000-000000000031';
  s_ssg     uuid := '00000000-0000-4000-8000-000000000032';
  got       numeric;
  got_rank  bigint;
  n         integer;
begin
  insert into public.schools (id, code, name, mascot, kind)
    values (fx_school, 'zzselfcheck', 'Self Check', 'Fixture', 'school');
  insert into public.teams (id, school_id, name)
    values (fx_team, fx_school, 'Self Check Team');
  insert into public.players (id, name, class_year) values
    (p_cesar, 'SelfCheck Cesar', '2027'),
    (p_caleb, 'SelfCheck Caleb', '2027'),
    (p_dylan, 'SelfCheck Dylan', '2027'),
    (p_skip,  'SelfCheck Skip',  '2027'),
    (p_new,   'SelfCheck New',   '2027');

  insert into public.drills_bank (id, school_id, name, category, points, measure) values
    (d_cooper, fx_school, 'SelfCheck Coopers', 'Fitness',   1.5, 'count_high'),
    (d_1v1,    fx_school, 'SelfCheck 1v1',     'Technical', 3.0, 'head_to_head'),
    (d_ssg,    fx_school, 'SelfCheck SSG',     'Tactical',  2.5, 'win_loss');

  insert into public.matrix_logs (team_id, player_a_id, player_b_id, outcome, drill_id, occurred_on)
    values (fx_team, p_cesar, p_caleb, 'a',    d_1v1, current_date),
           (fx_team, p_dylan, p_caleb, 'draw', d_1v1, current_date);

  insert into public.matrix_sessions (id, team_id, drill_id, occurred_on) values
    (s_cooper, fx_team, d_cooper, current_date),
    (s_ssg,    fx_team, d_ssg,    current_date);

  insert into public.matrix_session_results (session_id, player_id, attendance, raw_value) values
    (s_cooper, p_cesar, 'present', 2800),
    (s_cooper, p_caleb, 'present', 2650),
    (s_cooper, p_dylan, 'present', 2500);

  insert into public.matrix_session_results (session_id, player_id, attendance, outcome) values
    (s_ssg, p_cesar, 'present', 'win'),
    (s_ssg, p_caleb, 'present', 'win'),
    (s_ssg, p_dylan, 'present', 'loss');

  -- Shares are unchanged from 0009/0010: the scoring did not move, only the
  -- ordering. Cesar 7.000/7.000, Caleb 4.750/10.000, Dylan 1.875/7.000.
  select share into got from public.matrix_standings
   where team_id = fx_team and player_id = p_cesar;
  if got is distinct from 100.0 then
    raise exception 'self-check: Cesar share expected 100.0, got %', got;
  end if;

  select share into got from public.matrix_standings
   where team_id = fx_team and player_id = p_caleb;
  if got is distinct from 47.5 then
    raise exception 'self-check: Caleb share expected 47.5, got %', got;
  end if;

  -- The new ordering: Cesar 7.000 > Caleb 4.750 > Dylan 1.875.
  select rank into got_rank from public.matrix_standings
   where team_id = fx_team and player_id = p_cesar;
  if got_rank <> 1 then raise exception 'self-check: Cesar expected rank 1, got %', got_rank; end if;

  select rank into got_rank from public.matrix_standings
   where team_id = fx_team and player_id = p_caleb;
  if got_rank <> 2 then raise exception 'self-check: Caleb expected rank 2, got %', got_rank; end if;

  -- Caleb outranks Dylan on POINTS despite a far lower share (47.5 vs 26.8 is
  -- the right way round here, but under the old share-first ordering Caleb was
  -- still 2nd; the case that actually moved is on live data). Assert the
  -- ordering key directly instead: more points must win.
  select rank into got_rank from public.matrix_standings
   where team_id = fx_team and player_id = p_dylan;
  if got_rank <> 3 then raise exception 'self-check: Dylan expected rank 3, got %', got_rank; end if;

  -- ── not_entered ────────────────────────────────────────────────────────
  -- Skip is on the roster from before the sessions and was never given a row,
  -- so he owes both sessions: 0 of 1.5 + 0 of 2.5 = 0 of 4.0.
  insert into public.team_players (team_id, school_id, player_id)
    values (fx_team, fx_school, p_skip);

  select count(*) into n from public.matrix_exercise_points
   where team_id = fx_team and player_id = p_skip and kind = 'not_entered';
  if n <> 2 then raise exception 'self-check: Skip expected 2 not_entered rows, got %', n; end if;

  select available into got from public.matrix_standings
   where team_id = fx_team and player_id = p_skip;
  if got is distinct from 4.000 then
    raise exception 'self-check: Skip available expected 4.000, got %', got;
  end if;

  select earned into got from public.matrix_standings
   where team_id = fx_team and player_id = p_skip;
  if got is distinct from 0.000 then
    raise exception 'self-check: Skip earned expected 0.000, got %', got;
  end if;

  -- A player who joined AFTER the sessions must not inherit their absences.
  insert into public.team_players (team_id, school_id, player_id, created_at)
    values (fx_team, fx_school, p_new, now() + interval '2 days');

  select count(*) into n from public.matrix_exercise_points
   where team_id = fx_team and player_id = p_new;
  if n <> 0 then
    raise exception 'self-check: a player who joined after the session inherited % rows', n;
  end if;

  -- Adding Skip must not have disturbed anyone else's numbers.
  select earned into got from public.matrix_standings
   where team_id = fx_team and player_id = p_cesar;
  if got is distinct from 7.000 then
    raise exception 'self-check: Cesar earned expected 7.000 after roster change, got %', got;
  end if;

  raise notice 'matrix ranking self-check passed.';

  delete from public.team_players where team_id = fx_team;
  delete from public.matrix_session_results where session_id in (s_cooper, s_ssg);
  delete from public.matrix_sessions where id in (s_cooper, s_ssg);
  delete from public.matrix_logs where team_id = fx_team;
  delete from public.drills_bank where id in (d_cooper, d_1v1, d_ssg);
  delete from public.players where id in (p_cesar, p_caleb, p_dylan, p_skip, p_new);
  delete from public.teams where id = fx_team;
  delete from public.schools where id = fx_school;
end $$;

commit;

-- Rollback:
--   drop view if exists public.matrix_standings;
--   drop view if exists public.matrix_exercise_points;
--   -- then re-run supabase/migrations/0010_matrix_exercise_points.sql, which
--   -- defines both views with share-first ordering and no not_entered rule.


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0013_signup_without_email_confirmation.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 0013: let sign-up work with email confirmation switched off
--
-- APPLY THIS FIRST, THEN turn off "Confirm email" in
-- Authentication → Providers → Email. In that order: applying this while
-- confirmation is still ON changes nothing, so there is no window where
-- sign-up is broken. Doing it the other way round leaves every player who
-- registers in between stranded, for the reason below.
--
-- ── Why this is needed ────────────────────────────────────────────────────
--
-- The sign-up flow is split across two triggers:
--
--   handle_new_user        on INSERT into auth.users
--                          creates the profile as 'pending_verification'
--   handle_user_confirmed  on UPDATE of email_confirmed_at
--                          moves it to 'pending_approval' (or 'active' for a
--                          guest, who needs no approval)
--
-- With confirmation switched off, GoTrue sets email_confirmed_at AT INSERT.
-- There is no update, so handle_user_confirmed NEVER FIRES and every new
-- player stays at 'pending_verification' forever.
--
-- That failure is silent and total. fetchPendingApprovals queries
-- `.eq('status', 'pending_approval')` (src/data/supabase.ts), so those players
-- would not even appear in the coach's queue to be rescued. Sign-up would look
-- exactly as broken as it did before, with no error anywhere.
--
-- ── What this changes ─────────────────────────────────────────────────────
--
-- handle_new_user now looks at whether the user it has been handed is ALREADY
-- confirmed, and if so applies the same rules handle_user_confirmed would
-- have. The two-step path is untouched: with confirmation on, new.email_
-- confirmed_at is null at insert, the function behaves exactly as before, and
-- handle_user_confirmed still does the second step. So this is safe to apply
-- now and safe to leave in place if you switch confirmation back on.
--
-- The status rules are deliberately duplicated from handle_user_confirmed
-- rather than factored out: they are four lines, and a shared helper called
-- from a trigger on auth.users adds a dependency between two SECURITY DEFINER
-- functions for no real gain. If those rules change, change both -- the
-- comment in each points at the other.

begin;

set role postgres;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_school_id uuid;
  requested text;
  already_confirmed boolean;
  new_status text;
  new_role text;
begin
  select id into resolved_school_id from public.schools where code = 'bhs' limit 1;
  requested := coalesce(new.raw_user_meta_data ->> 'requested_role', 'guest');

  -- True when "Confirm email" is off: GoTrue stamps email_confirmed_at at
  -- insert, so there will be no later UPDATE for handle_user_confirmed to see.
  already_confirmed := new.email_confirmed_at is not null;

  if already_confirmed then
    -- Same rules as handle_user_confirmed. Keep the two in step.
    new_status := case when requested = 'guest' or requested is null
                       then 'active' else 'pending_approval' end;
    new_role   := 'guest';
  else
    new_status := 'pending_verification';
    new_role   := 'guest';
  end if;

  insert into public.profiles (id, school_id, name, email, role, requested_role, status, email_verified, team_level)
  values (
    new.id,
    resolved_school_id,
    coalesce(new.raw_user_meta_data ->> 'name', 'Team User'),
    new.email,
    new_role,
    requested,
    new_status,
    already_confirmed,
    case requested
      when 'coach' then 'Boys Varsity Staff'
      when 'player' then 'Boys Varsity Player'
      else 'Fan / Public'
    end
  );
  return new;
end;
$$;

-- ── Rescue anyone already stranded ────────────────────────────────────────
-- If confirmation was switched off before this ran, or a player confirmed
-- during one of the broken windows earlier, they are sitting at
-- pending_verification with a confirmed address and no way to be approved.
-- Move them to the queue rather than leaving them to re-register.

update public.profiles p
   set status = case when p.requested_role = 'guest' or p.requested_role is null
                     then 'active' else 'pending_approval' end,
       email_verified = true
  from auth.users u
 where u.id = p.id
   and p.status = 'pending_verification'
   and u.email_confirmed_at is not null;

commit;

-- ── Then, in the dashboard ────────────────────────────────────────────────
--
--   Authentication → Providers → Email → turn OFF "Confirm email"
--
-- After that a player registers and is in the coach's approval queue
-- immediately. No email is sent at all, so there is nothing to expire, nothing
-- for a school mail scanner to consume, and no hourly send limit.
--
-- What you give up: any guarantee the address is real. Given a coach approves
-- every account by name before it can see anything, that guarantee was always
-- weak -- you are vouching for the person, not the mailbox. The sign-up form
-- now catches likely typos client-side, which covers the practical harm (a
-- player who can never reset their password).
--
-- Password resets still send email and still work; they are unaffected by the
-- Confirm-email toggle.

-- Verify — a fresh sign-up should land here directly:
--   select email, role, requested_role, status, email_verified
--   from public.profiles order by created_at desc limit 5;

-- Rollback:
--   Turn "Confirm email" back ON, then restore the original function from
--   supabase_migration_auth.sql (section 4, handle_new_user). Leaving THIS
--   version in place with confirmation on is also fine and is the safer
--   default: the already_confirmed branch simply never runs.


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0014_team_scoped_planner.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- supabase/migrations/0014_team_scoped_planner.sql
--
-- Team-scoped practice planner. See
-- docs/superpowers/specs/2026-09-01-team-scoped-planner-design.md
--
-- SAFE TO APPLY BEFORE THE CODE DEPLOYS, for reads AND for writes. school_id
-- is left in place, so currently-deployed code keeps working unchanged. 0015
-- drops it afterwards. This is deliberately the opposite of what 0005 did:
-- dropping in the same migration that adds leaves a window where deployed code
-- queries a column that no longer exists.
--
-- PER-TEAM WRITE CONTROL ARRIVES WITH 0015, NOT HERE. The team-scoped RLS
-- policies used to live in this file, and that reintroduced exactly the window
-- this split exists to remove -- in the other direction. Deployed code at this
-- moment writes team_id NULL; is_team_coach(null) is false for a plain coach
-- (their save is silently refused) but TRUE for an admin (whose save lands with
-- a null team, vanishes once the new code deploys, and then trips 0015's
-- stranded-row guard). So the policy swap moved to 0015, which runs after the
-- deploy. During the window the planner keeps the permissive policies it has
-- today -- any coach may write any team's planner rows. That is the current
-- production behaviour, not a new exposure, and it ends when 0015 runs.
--
-- The quiz is not touched. Its questions are hardcoded in planner.view.js,
-- nothing reads quiz_questions, the table is empty and it has no school_id --
-- adding a column no code reads would be ceremony. See the spec.

begin;

set role postgres;

alter table public.practice_plans
  add column if not exists team_id uuid references public.teams(id) on delete cascade;

alter table public.daily_thoughts
  add column if not exists team_id uuid references public.teams(id) on delete cascade;

-- ─── Backfill ──────────────────────────────────────────────────────────────
-- The 27 existing practice_plans rows predate multi-team: they are named
-- "Standard Varsity 90-Min..." or dummy_practice_*, and were built when
-- Varsity was the only team. They go to Varsity. daily_thoughts is empty.
--
-- Matched on is_public_default rather than the name 'Varsity', so this is
-- correct even if the team has since been renamed.

update public.practice_plans p
   set team_id = t.id
  from public.teams t
  join public.schools s on s.id = t.school_id
 where p.team_id is null
   and p.school_id = s.id
   and t.is_public_default
   and not coalesce(t.is_deleted, false);

-- Anything still unassigned had a school_id matching no default team. Report
-- it rather than leaving rows that will silently vanish from every view.
do $$
declare
  orphans integer;
begin
  select count(*) into orphans from public.practice_plans
   where team_id is null and not coalesce(is_deleted, false);
  if orphans > 0 then
    raise notice '% practice_plans rows have no team and will not appear in any planner. Assign them by hand.', orphans;
  else
    raise notice 'All practice_plans rows assigned to a team.';
  end if;
end $$;

create index if not exists practice_plans_team on public.practice_plans (team_id)
  where not coalesce(is_deleted, false);
create index if not exists daily_thoughts_team on public.daily_thoughts (team_id)
  where not coalesce(is_deleted, false);

-- ─── RLS ───────────────────────────────────────────────────────────────────
-- Deliberately NOT here. The team-scoped policy swap lives in 0015 -- see the
-- header for why applying it before the deploy loses an admin's writes.

-- ─── school_id must tolerate being omitted ─────────────────────────────────
-- From the deploy until 0015 runs, the new code writes planner rows with
-- team_id and no school_id at all. If either column is NOT NULL, every one of
-- those writes fails. supabase_schema.sql cannot answer whether they are (it
-- lists columns, not nullability, and has known drift from the live database),
-- and this migration is written without database access -- so rather than
-- assume, make the question moot. A no-op when the column is already nullable,
-- a fix when it is not. 0015 drops both columns anyway.

alter table public.practice_plans alter column school_id drop not null;
alter table public.daily_thoughts  alter column school_id drop not null;

-- ─── Self-check ────────────────────────────────────────────────────────────
-- Proves the backfill reached every row and that the columns exist, at the
-- moment of applying, on the real database.

do $$
declare
  unassigned integer;
  has_col    integer;
begin
  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'practice_plans' and column_name = 'team_id';
  if has_col <> 1 then raise exception 'practice_plans.team_id was not created'; end if;

  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'daily_thoughts' and column_name = 'team_id';
  if has_col <> 1 then raise exception 'daily_thoughts.team_id was not created'; end if;

  -- school_id must SURVIVE this migration: deployed code still reads it.
  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'practice_plans' and column_name = 'school_id';
  if has_col <> 1 then
    raise exception 'school_id was dropped by 0014; deployed code still needs it. That belongs in 0015.';
  end if;

  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'daily_thoughts' and column_name = 'school_id';
  if has_col <> 1 then
    raise exception 'school_id was dropped from daily_thoughts by 0014; deployed code still needs it. That belongs in 0015.';
  end if;

  select count(*) into unassigned from public.practice_plans
   where team_id is null and not coalesce(is_deleted, false);
  raise notice 'Planner is team-scoped. % live rows still unassigned.', unassigned;
end $$;

commit;

-- Verify:
--   select t.name as team, p.name as plan, count(*) as slots
--   from public.practice_plans p
--   join public.teams t on t.id = p.team_id
--   where not coalesce(p.is_deleted, false)
--   group by t.name, p.name order by t.name, p.name;

-- Rollback:
--   alter table public.practice_plans drop column if exists team_id;
--   alter table public.daily_thoughts drop column if exists team_id;
--   -- No policy rollback needed: this migration no longer touches RLS. The
--   -- `drop not null` on school_id is not reversed -- re-imposing NOT NULL
--   -- would fail on any row written without one, and the column is dropped
--   -- by 0015 regardless.


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0015_drop_planner_school_id.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- supabase/migrations/0015_drop_planner_school_id.sql
--
-- Carries TWO changes: the team-scoped RLS policy swap, and the school_id
-- column drop.
--
-- APPLY ONLY AFTER THE CODE FROM 0014's DEPLOY IS LIVE. Both halves depend on
-- it. Until the deploy, deployed code still reads practice_plans.school_id and
-- daily_thoughts.school_id, and still writes planner rows with team_id NULL --
-- against the policies below, a plain coach's save would be silently refused
-- and an admin's would land with a null team.
--
-- Splitting these out of 0014 is the whole point: 0005 dropped school_id in
-- the same migration that added team_id, which left a window where deployed
-- code queried a column that no longer existed. One extra file removes it.
-- The policy swap started life in 0014 and moved here for the same reason,
-- in the other direction -- see 0014's header.
--
-- Delaying the column drop indefinitely is harmless; the only cost of leaving
-- school_id in place is a redundant column. Delaying the policy swap is not
-- free: until it runs, any coach can write any team's planner rows, which is
-- today's behaviour but not the intended one.

begin;

set role postgres;

-- Refuse if the backfill never completed: dropping school_id would then
-- destroy the only remaining clue about where those rows belong.
do $$
declare
  stranded integer;
begin
  select count(*) into stranded from public.practice_plans
   where team_id is null and not coalesce(is_deleted, false);
  if stranded > 0 then
    raise exception
      '% practice_plans rows still have no team. Assign them before dropping school_id, or their origin is lost.', stranded;
  end if;
end $$;

-- Same reasoning, same guard, for daily_thoughts -- a separate check with its
-- own count and its own message, so a failure here does not send the human
-- looking at practice_plans instead.
do $$
declare
  stranded integer;
begin
  select count(*) into stranded from public.daily_thoughts
   where team_id is null and not coalesce(is_deleted, false);
  if stranded > 0 then
    raise exception
      '% daily_thoughts rows still have no team. Assign them before dropping school_id, or their origin is lost.', stranded;
  end if;
end $$;

-- ─── RLS ───────────────────────────────────────────────────────────────────
-- Moved here from 0014. These tables are in the uniform policy loop in
-- supabase_migration_auth.sql section 6, which grants any coach write access
-- to any row. Replaced here with team-scoped policies: this is the first time
-- the planner has had per-team write control.
--
-- It runs in this file, after the deploy, because is_team_coach(null) is false
-- for a plain coach and true for an admin -- so applying it while deployed
-- code still writes team_id NULL silently refuses one and mis-files the other.
--
-- Ordered before the column drop only for readability; both are in the same
-- transaction, so they land together.
--
-- NOTE: re-running supabase_migration_auth.sql section 6 after this would
-- silently restore the permissive policies.

alter table public.practice_plans enable row level security;
alter table public.daily_thoughts enable row level security;

drop policy if exists "practice_plans_select" on public.practice_plans;
create policy "practice_plans_select" on public.practice_plans
  for select using (coalesce(is_deleted, false) = false);

drop policy if exists "practice_plans_write" on public.practice_plans;
create policy "practice_plans_write" on public.practice_plans
  for all using (public.is_team_coach(team_id))
  with check (public.is_team_coach(team_id));

drop policy if exists "daily_thoughts_select" on public.daily_thoughts;
create policy "daily_thoughts_select" on public.daily_thoughts
  for select using (coalesce(is_deleted, false) = false);

drop policy if exists "daily_thoughts_write" on public.daily_thoughts;
create policy "daily_thoughts_write" on public.daily_thoughts
  for all using (public.is_team_coach(team_id))
  with check (public.is_team_coach(team_id));

-- ─── Drop the redundant column ─────────────────────────────────────────────

alter table public.practice_plans drop column if exists school_id;
alter table public.daily_thoughts drop column if exists school_id;

commit;

-- Verify:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name in ('practice_plans','daily_thoughts')
--   order by table_name, column_name;

-- Rollback:
--   drop policy if exists "practice_plans_write" on public.practice_plans;
--   drop policy if exists "practice_plans_select" on public.practice_plans;
--   drop policy if exists "daily_thoughts_write" on public.daily_thoughts;
--   drop policy if exists "daily_thoughts_select" on public.daily_thoughts;
--   -- then re-run supabase_migration_auth.sql section 6 to restore the
--   -- uniform coach/admin policies on both tables.
--   alter table public.practice_plans add column school_id uuid references public.schools(id);
--   alter table public.daily_thoughts add column school_id uuid references public.schools(id);
--   update public.practice_plans p set school_id = t.school_id
--     from public.teams t where t.id = p.team_id;
--   update public.daily_thoughts d set school_id = t.school_id
--     from public.teams t where t.id = d.team_id;
--   -- The values are recoverable from the team, so this rollback is complete.


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0016_player_first_last_name.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 0016: split players.name into first_name and last_name
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT SPLITS NAMES. The new code writes
-- first_name and last_name, and a write naming a column that does not exist
-- fails outright -- so deploying first would break adding and editing players
-- until this ran.
--
-- The reverse order is safe: this migration is additive, and its trigger
-- derives the parts from `name` as well as the other way round, so currently
-- deployed code that writes only `name` keeps working and still gets correct
-- parts. Safe to leave applied if the code is rolled back, for the same reason.
--
-- `name` is kept and is maintained automatically, so every reader of
-- players.name -- 37 of them across 9 files, from roster cards to the Matrix
-- standings to the XLSX export -- keeps working untouched.
--
-- ── Why a trigger and not a generated column ──────────────────────────────
--
-- `name` could be redefined as
--   generated always as (first_name || ' ' || last_name) stored
-- which would be tidier. It is not used here because Postgres cannot convert an
-- existing column to generated in place: it means `drop column name` followed
-- by `add column name generated ...`, and a drop cascades into every view,
-- index and policy that references it. A trigger gives the same guarantee --
-- the two can never drift -- with no destructive step and no dependency risk.
--
-- ── The backfill ──────────────────────────────────────────────────────────
--
-- Split on the FIRST space: first_name is one word, last_name is everything
-- after it. That keeps compound surnames together ("Rubier Palomeque" is fine
-- either way, but "Ana Maria Rodriguez Gomez" gives last_name = "Maria
-- Rodriguez Gomez" rather than mangling the surname down to "Gomez").
--
-- Verified against the live database before writing this: all 31 player rows
-- are exactly two words, so the split is unambiguous for the existing data. The
-- self-check at the bottom reports anything that needed a judgment call, so a
-- database that has moved on since will say so rather than silently guess.
--
-- A single-word name (no space) puts the whole value in first_name and leaves
-- last_name empty. The application requires both from here on, but this
-- migration must not invent a surname that was never recorded.

begin;

set role postgres;

alter table public.players add column if not exists first_name text;
alter table public.players add column if not exists last_name  text;

-- Backfill only rows that have not been split yet, so re-running this migration
-- cannot overwrite names that have since been corrected by hand.
update public.players
   set first_name = split_part(trim(name), ' ', 1),
       last_name  = nullif(
                      trim(substring(trim(name) from position(' ' in trim(name)) + 1)),
                      ''
                    )
 where coalesce(first_name, '') = ''
   and coalesce(name, '') <> ''
   and position(' ' in trim(name)) > 0;

-- Single-word names: everything goes to first_name, last_name stays null.
update public.players
   set first_name = trim(name)
 where coalesce(first_name, '') = ''
   and coalesce(name, '') <> ''
   and position(' ' in trim(name)) = 0;

-- ─── Keep `name` and its parts in step, in BOTH directions ─────────────────
--
-- Given the parts, the full name is rebuilt from them. Given only a full name,
-- the parts are derived from it by the same first-space rule as the backfill.
--
-- The second direction is what makes this migration safe to apply BEFORE the
-- code that knows about the parts is deployed. Currently deployed code writes
-- only `name`; without that branch, every player added between applying this
-- and deploying would have a name but no first_name, and would then show blank
-- fields in the roster editor. One-directional sync would have made the order
-- of these two steps load-bearing for no good reason.

create or replace function public.sync_player_full_name()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.first_name, '') <> '' then
    new.name := trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
  elsif coalesce(new.name, '') <> '' then
    new.first_name := split_part(trim(new.name), ' ', 1);
    new.last_name  := nullif(
                        trim(substring(trim(new.name) from position(' ' in trim(new.name)) + 1)),
                        ''
                      );
  end if;
  return new;
end;
$$;

drop trigger if exists players_sync_full_name on public.players;
create trigger players_sync_full_name
  before insert or update on public.players
  for each row execute function public.sync_player_full_name();

-- ─── Self-check ────────────────────────────────────────────────────────────
-- Proves the columns exist and the backfill reached every row, on the real
-- database at the moment of applying.

do $$
declare
  has_col   integer;
  unsplit   integer;
  surnameless integer;
begin
  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'players' and column_name = 'first_name';
  if has_col <> 1 then raise exception 'players.first_name was not created'; end if;

  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'players' and column_name = 'last_name';
  if has_col <> 1 then raise exception 'players.last_name was not created'; end if;

  -- `name` must SURVIVE this migration: 37 places still read it.
  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'players' and column_name = 'name';
  if has_col <> 1 then
    raise exception 'players.name was dropped; every roster and Matrix view still reads it.';
  end if;

  select count(*) into unsplit from public.players
   where coalesce(first_name, '') = '' and not coalesce(is_deleted, false);
  if unsplit > 0 then
    raise exception '% player rows still have no first name. They had no name to split.', unsplit;
  end if;

  select count(*) into surnameless from public.players
   where coalesce(last_name, '') = '' and not coalesce(is_deleted, false);

  raise notice 'Players split into first and last name. % live row(s) have no surname -- set one in the roster editor.', surnameless;
end $$;

commit;

-- Verify — the halves and the whole should agree on every row:
--   select name, first_name, last_name from public.players
--   where not coalesce(is_deleted, false) order by last_name, first_name;
--
-- And the trigger should rebuild `name` on its own:
--   update public.players set first_name = first_name where false;  -- no-op
--   -- then edit one row's first_name and confirm `name` follows.

-- Rollback:
--   drop trigger if exists players_sync_full_name on public.players;
--   drop function if exists public.sync_player_full_name();
--   alter table public.players drop column if exists first_name;
--   alter table public.players drop column if exists last_name;
--   -- `name` was never modified by this migration beyond being kept in sync,
--   -- so it still holds the full name and nothing is lost.


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0017_data_driven_quiz.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 0017: make the quiz data-driven
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT READS IT. The new quiz renders
-- from these tables, so deploying first would leave every player looking at an
-- empty quiz. The reverse order is safe: this migration only adds columns, a
-- table and rows, and the currently deployed code reads none of them.
--
-- ── What the quiz is today ────────────────────────────────────────────────
--
-- Five questions hardcoded as radio inputs in planner.view.js, with the answer
-- key ('B','A','A','B','C') written into submitQuizAnswer. quiz_questions has
-- existed all along and is EMPTY -- nothing has ever read it. So there is no
-- bank to migrate; the seed at the bottom is the only copy of those questions
-- that exists anywhere, and without it the quiz would go blank on deploy.
--
-- ── The shape ─────────────────────────────────────────────────────────────
--
-- The bank belongs to an ORGANIZATION, like drills_bank: Varsity and JV share
-- Beaumont's questions rather than retyping them, and a club has its own.
-- Which questions a given squad actually asks is a per-TEAM choice, held in
-- team_quiz_questions -- so an under-14 side can switch off a question pitched
-- at seventeen-year-olds without deleting it for everyone.
--
-- That is the same split the planner already uses: shared library, per-team
-- selection.

begin;

set role postgres;

-- ─── The bank belongs to an organization ───────────────────────────────────
-- quiz_questions had NO scoping column at all -- not school_id, not team_id.
-- Nullable: a question with no organization is visible to nobody, which is a
-- better failure than one visible to everybody.

alter table public.quiz_questions
  add column if not exists school_id uuid references public.schools(id) on delete cascade;

create index if not exists quiz_questions_school on public.quiz_questions (school_id)
  where not coalesce(is_deleted, false);

-- ─── Which questions each squad asks ───────────────────────────────────────

create table if not exists public.team_quiz_questions (
  team_id     uuid not null references public.teams(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(question_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (team_id, question_id)
);

create index if not exists team_quiz_questions_team on public.team_quiz_questions (team_id);

-- ─── Attempts are team-scoped too ──────────────────────────────────────────
-- Without this a JV score and a Varsity score sit in one undifferentiated
-- list, which is the thing every other surface stopped doing in 0014.

alter table public.quiz_attempts
  add column if not exists team_id uuid references public.teams(id) on delete cascade;

create index if not exists quiz_attempts_team on public.quiz_attempts (team_id);

-- ─── RLS ───────────────────────────────────────────────────────────────────
-- quiz_questions is already covered by the uniform team-content loop in
-- supabase_migration_auth.sql section 6 (public read, coach/admin write), so it
-- is deliberately not re-policied here. Only the new table needs policies.
--
-- Reads stay public, matching every other table. Writes are gated on
-- is_team_coach(), so a coach can only change their own squads' quiz.

alter table public.team_quiz_questions enable row level security;

drop policy if exists "team_quiz_questions_select" on public.team_quiz_questions;
create policy "team_quiz_questions_select" on public.team_quiz_questions
  for select using (true);

drop policy if exists "team_quiz_questions_write" on public.team_quiz_questions;
create policy "team_quiz_questions_write" on public.team_quiz_questions
  for all using (public.is_team_coach(team_id))
  with check (public.is_team_coach(team_id));

grant select, insert, update, delete on table public.team_quiz_questions to anon, authenticated;

-- ─── Seed the five questions that only exist in the code ───────────────────
--
-- Resolved from the public-default team's organization rather than a hardcoded
-- school code, so this is correct for any deployment rather than only for
-- Beaumont.
--
-- Guarded on the bank being empty for that organization: re-running this must
-- not produce a second copy of every question.

do $$
declare
  home_school uuid;
  existing    integer;
begin
  select t.school_id into home_school
    from public.teams t
   where coalesce(t.is_public_default, false)
     and not coalesce(t.is_deleted, false)
   limit 1;

  if home_school is null then
    raise notice 'No public-default team, so the quiz bank was not seeded. Add questions in the admin panel.';
    return;
  end if;

  select count(*) into existing from public.quiz_questions
   where school_id = home_school and not coalesce(is_deleted, false);

  if existing > 0 then
    raise notice 'Quiz bank already has % question(s); seed skipped.', existing;
    return;
  end if;

  insert into public.quiz_questions
    (school_id, question, option_a, option_b, option_c, option_d, correct_option, category, is_deleted)
  values
    (home_school,
     'What is the primary tactical objective emphasized in Coach''s Daily Thoughts?',
     'Drop back into low-block passive defense',
     'High intensity pressing & quick 2-touch passing transitions',
     'Dribble individually without passing options',
     'Long high balls into penalty box only',
     'B', 'Tactical', false),
    (home_school,
     'How should players handle possession under pressure according to today''s focus?',
     'Make the simple, quick pass as first option',
     'Hold the ball until surrounded by defenders',
     'Turn around and kick the ball out of bounds',
     'Stop moving completely and wait for whistle',
     'A', 'Tactical', false),
    (home_school,
     'According to Coach''s Daily Focus, what is faster than any dribble on the pitch?',
     'A passing ball moving twenty yards',
     'Juggling in place',
     'Throw-ins from sideline',
     'Running backwards',
     'A', 'Technical', false),
    (home_school,
     'What is the primary tactical formation for 11v11 matches?',
     '5-4-1 Ultra Defensive Park-the-Bus',
     '4-3-3 High Press / Attack-Minded',
     '2-2-6 All-Out Attack',
     'No tactical formation',
     'B', 'Tactical', false),
    (home_school,
     'What is the minimum practice participation requirement for starting lineup consideration?',
     '25%', '50%', '90%+ Match Readiness & Practice Participation', '10%',
     'C', 'Team Standards', false);

  -- Switch them on for every live team in that organization, so the quiz keeps
  -- working exactly as it does today the moment the code deploys.
  insert into public.team_quiz_questions (team_id, question_id)
  select t.id, q.question_id
    from public.teams t
    join public.quiz_questions q on q.school_id = t.school_id
   where t.school_id = home_school
     and not coalesce(t.is_deleted, false)
     and not coalesce(q.is_deleted, false)
  on conflict do nothing;

  raise notice 'Seeded 5 quiz questions and switched them on for that organization''s teams.';
end $$;

-- ─── Self-check ────────────────────────────────────────────────────────────

do $$
declare
  has_col integer;
  orphans integer;
begin
  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'quiz_questions' and column_name = 'school_id';
  if has_col <> 1 then raise exception 'quiz_questions.school_id was not created'; end if;

  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'quiz_attempts' and column_name = 'team_id';
  if has_col <> 1 then raise exception 'quiz_attempts.team_id was not created'; end if;

  if to_regclass('public.team_quiz_questions') is null then
    raise exception 'team_quiz_questions was not created';
  end if;

  -- A question with no organization can never be reached by any team.
  select count(*) into orphans from public.quiz_questions
   where school_id is null and not coalesce(is_deleted, false);
  if orphans > 0 then
    raise notice '% quiz question(s) have no organization and will not appear anywhere. Set school_id on them.', orphans;
  end if;
end $$;

commit;

-- Verify — what each team will ask:
--   select t.name, count(*) as questions
--     from public.team_quiz_questions tq
--     join public.teams t on t.id = tq.team_id
--    group by t.name order by t.name;

-- Rollback:
--   drop table if exists public.team_quiz_questions;
--   alter table public.quiz_attempts  drop column if exists team_id;
--   delete from public.quiz_questions where school_id is not null;  -- the seed
--   alter table public.quiz_questions drop column if exists school_id;
--   -- The five questions also exist in planner.view.js at the commit before
--   -- this change, so nothing is unrecoverable.


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0018_link_quiz_to_thought.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 0018: tie quiz questions to the daily message they test
--
-- APPLY BEFORE DEPLOYING THE CODE THAT READS IT. The new import and quiz read
-- these columns; the currently deployed code reads none of them, so applying
-- early changes nothing and applying late would drop the link silently.
--
-- ── What this is for ──────────────────────────────────────────────────────
--
-- Three of the seeded questions ask about "Coach's Daily Thoughts" and
-- "today's focus", but nothing connected them to an actual message. Change the
-- message and those questions kept asking about a focus that no longer existed,
-- marking against the old answer.
--
-- A question may now name the message it tests. Questions that name one are
-- asked only while that message is the active one; questions that name none --
-- formation, participation, anything evergreen -- are always asked. So "today's
-- quiz" follows today's focus without the coach rebuilding it.

begin;

set role postgres;

-- ─── A message gets a short name ───────────────────────────────────────────
-- Needed because a question has to reference a message somehow, and the
-- message text itself is a paragraph. A title is what a coach types anyway and
-- what a spreadsheet column can hold: "Week 3 - High Press".
--
-- Nullable: existing messages have none, and one is not required to post.

alter table public.daily_thoughts
  add column if not exists title text;

-- ─── A question may name the message it tests ──────────────────────────────
-- ON DELETE SET NULL, deliberately: retiring a message must not delete the
-- questions written for it. They simply become evergreen and keep being asked,
-- which is a better failure than silently losing a coach's work.

alter table public.quiz_questions
  add column if not exists thought_id uuid references public.daily_thoughts(id) on delete set null;

create index if not exists quiz_questions_thought on public.quiz_questions (thought_id)
  where not coalesce(is_deleted, false);

-- ─── A stable key for re-import ────────────────────────────────────────────
--
-- Questions get reworded. Matching an imported row against an existing question
-- by its TEXT therefore creates a duplicate every time a typo is fixed, which
-- is the common case rather than the rare one. A key the coach controls
-- survives rewording; the uuid primary key cannot, because a spreadsheet has no
-- way to know it.
--
-- Text, not integer: a coach may want "PRESS-01" as readily as "100", and a
-- number here would be a second thing that looks like an id but is not.

alter table public.quiz_questions
  add column if not exists import_key text;

-- Unique per ORGANIZATION, not globally: two clubs may both number from 100
-- without colliding. Partial, so retired questions do not block reusing a key,
-- and so the many rows with no key at all are simply not constrained.
create unique index if not exists quiz_questions_import_key_per_school
  on public.quiz_questions (school_id, import_key)
  where import_key is not null and not coalesce(is_deleted, false);

-- ─── Self-check ────────────────────────────────────────────────────────────

do $$
declare
  has_col integer;
begin
  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'daily_thoughts' and column_name = 'title';
  if has_col <> 1 then raise exception 'daily_thoughts.title was not created'; end if;

  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'quiz_questions' and column_name = 'thought_id';
  if has_col <> 1 then raise exception 'quiz_questions.thought_id was not created'; end if;

  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'quiz_questions' and column_name = 'import_key';
  if has_col <> 1 then raise exception 'quiz_questions.import_key was not created'; end if;

  -- 0017's school_id must still be here: without it a question belongs to no
  -- organization and appears in nobody's quiz.
  select count(*) into has_col from information_schema.columns
   where table_schema = 'public' and table_name = 'quiz_questions' and column_name = 'school_id';
  if has_col <> 1 then raise exception 'quiz_questions.school_id is missing; apply 0017 first.'; end if;

  raise notice 'Quiz questions can now name the message they test, and carry an import key.';
end $$;

commit;

-- Verify — nothing is linked yet, which is correct until questions are edited
-- or re-imported:
--   select q.question, t.title
--     from public.quiz_questions q
--     left join public.daily_thoughts t on t.id = q.thought_id
--    where not coalesce(q.is_deleted, false);

-- Rollback:
--   drop index if exists public.quiz_questions_import_key_per_school;
--   alter table public.quiz_questions drop column if exists import_key;
--   alter table public.quiz_questions drop column if exists thought_id;
--   alter table public.daily_thoughts drop column if exists title;
--   -- Nothing else read these, so nothing else breaks.


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0019_quiz_answers_table.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 0019: answers become rows, and a message gets a coach-controlled number
--
-- APPLY BEFORE DEPLOYING THE CODE THAT READS IT. Additive only: the option_a..d
-- columns stay, so currently deployed code keeps working and can be rolled back
-- to. A later migration drops them once nothing reads them -- the same split
-- used for 0014/0015, which exists so there is never a window where deployed
-- code queries a column that is gone.
--
-- ── Two changes, both asked for ───────────────────────────────────────────
--
-- 1. A quiz sheet identifies its daily message by a NUMBER the coach controls
--    ("id"), not by title. Both sheets carry it: the thoughts sheet says
--    1 = Speed of Play, and every question of that message carries 1.
--
-- 2. The four options stop being four columns and become rows. That is what
--    lets a question have three options, or six, instead of exactly four.

begin;

set role postgres;

-- ─── A message the spreadsheet can name by number ──────────────────────────
-- Text, not integer: a coach may number "1" or "W3-01", and an integer column
-- would reject the second without warning.

alter table public.daily_thoughts
  add column if not exists import_key text;

-- Unique per TEAM, not globally: Varsity's message 1 and JV's message 1 are
-- different messages. Partial, so retired messages do not block reusing a
-- number, and untitled ones are simply unconstrained.
create unique index if not exists daily_thoughts_import_key_per_team
  on public.daily_thoughts (team_id, import_key)
  where import_key is not null and not coalesce(is_deleted, false);

-- ─── Answers as rows ───────────────────────────────────────────────────────
--
-- `letter` is kept rather than derived from ordinal because the sheet, the
-- marking and every attempt already recorded speak in A/B/C/D --
-- player_answers.selected_option stores exactly that. Deriving it would mean
-- rewriting history to match a new convention.

create table if not exists public.quiz_answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(question_id) on delete cascade,
  letter      text not null,
  answer_text text not null,
  is_correct  boolean not null default false,
  ordinal     integer not null default 0,
  is_deleted  boolean default false,
  created_at  timestamptz not null default now()
);

create index if not exists quiz_answers_question on public.quiz_answers (question_id)
  where not coalesce(is_deleted, false);

-- One row per letter per question. Without this a re-import could add a second
-- "B" and the quiz would render two of them.
create unique index if not exists quiz_answers_letter_per_question
  on public.quiz_answers (question_id, letter)
  where not coalesce(is_deleted, false);

-- ─── RLS ───────────────────────────────────────────────────────────────────
-- Public read like every other table; writes for a coach or admin, matching
-- quiz_questions, whose policies come from the uniform loop in
-- supabase_migration_auth.sql section 6.

alter table public.quiz_answers enable row level security;

drop policy if exists "quiz_answers_select" on public.quiz_answers;
create policy "quiz_answers_select" on public.quiz_answers
  for select using (true);

drop policy if exists "quiz_answers_write" on public.quiz_answers;
create policy "quiz_answers_write" on public.quiz_answers
  for all
  using (public.current_profile_role() in ('coach', 'admin'))
  with check (public.current_profile_role() in ('coach', 'admin'));

grant select, insert, update, delete on table public.quiz_answers to anon, authenticated;

-- ─── Move the existing options into rows ───────────────────────────────────
-- Guarded on the table being empty, so re-running cannot double every answer.
-- A blank option is skipped rather than stored as an empty choice.

do $$
declare
  moved integer;
begin
  if exists (select 1 from public.quiz_answers limit 1) then
    raise notice 'quiz_answers already holds rows; the backfill was skipped.';
    return;
  end if;

  insert into public.quiz_answers (question_id, letter, answer_text, is_correct, ordinal)
  select q.question_id, v.letter, v.txt, upper(coalesce(q.correct_option, '')) = v.letter, v.ord
    from public.quiz_questions q
    cross join lateral (values
      ('A', q.option_a, 1),
      ('B', q.option_b, 2),
      ('C', q.option_c, 3),
      ('D', q.option_d, 4)
    ) as v(letter, txt, ord)
   where not coalesce(q.is_deleted, false)
     and coalesce(trim(v.txt), '') <> '';

  get diagnostics moved = row_count;
  raise notice 'Moved % option(s) into quiz_answers.', moved;
end $$;

-- ─── Self-check ────────────────────────────────────────────────────────────

do $$
declare
  n        integer;
  no_right integer;
begin
  if to_regclass('public.quiz_answers') is null then
    raise exception 'quiz_answers was not created';
  end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'daily_thoughts' and column_name = 'import_key';
  if n <> 1 then raise exception 'daily_thoughts.import_key was not created'; end if;

  -- option_a must SURVIVE: deployed code still reads it until the follow-up
  -- migration drops it.
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'quiz_questions' and column_name = 'option_a';
  if n <> 1 then
    raise exception 'option_a was dropped by 0019; deployed code still reads it. That belongs in the follow-up.';
  end if;

  -- Every live question should now own exactly one correct answer. Zero means
  -- correct_option named a letter whose option was blank, and the question
  -- would be unanswerable.
  select count(*) into no_right
    from public.quiz_questions q
   where not coalesce(q.is_deleted, false)
     and not exists (
       select 1 from public.quiz_answers a
        where a.question_id = q.question_id
          and a.is_correct
          and not coalesce(a.is_deleted, false));
  if no_right > 0 then
    raise notice '% question(s) have no correct answer among their options. Fix them in the admin panel.', no_right;
  end if;
end $$;

commit;

-- Verify — each question with its options, correct one first:
--   select q.question, a.letter, a.answer_text, a.is_correct
--     from public.quiz_questions q
--     join public.quiz_answers a on a.question_id = q.question_id
--    where not coalesce(q.is_deleted, false)
--    order by q.created_at, a.ordinal;

-- Rollback:
--   drop table if exists public.quiz_answers;
--   drop index if exists public.daily_thoughts_import_key_per_team;
--   alter table public.daily_thoughts drop column if exists import_key;
--   -- option_a..d were never modified, so the questions are untouched.


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0020_drop_quiz_option_columns.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 0020: drop option_a..d from quiz_questions
--
-- APPLY ONLY AFTER THE CODE THAT STOPPED USING THEM IS LIVE. This is the
-- reverse of the usual order here, and deliberately so: until that deploy,
-- running code both writes and reads these columns, and dropping them would
-- break every quiz save immediately.
--
-- Same split as 0014/0015 and 0019: the previous migration added the
-- replacement and left the old columns in place, the code moved across, and
-- only now do the columns go. There is never a window where deployed code
-- queries something that is gone.
--
-- Delaying this indefinitely is harmless. The only cost of keeping them is
-- four redundant columns that nothing reads.

begin;

set role postgres;

-- ─── Refuse if the options never moved ─────────────────────────────────────
-- Dropping these while a live question still has no answer rows would leave it
-- with no options at all, unanswerable and unfixable -- the text of its choices
-- would be gone.

do $$
declare
  stranded integer;
begin
  select count(*) into stranded
    from public.quiz_questions q
   where not coalesce(q.is_deleted, false)
     and not exists (
       select 1 from public.quiz_answers a
        where a.question_id = q.question_id
          and not coalesce(a.is_deleted, false));

  if stranded > 0 then
    raise exception
      '% live question(s) have no answer rows. Their options exist only in the columns this migration drops. Apply 0019 first, or fix them in the admin panel.', stranded;
  end if;
end $$;

-- ─── Drop them ─────────────────────────────────────────────────────────────
-- correct_option STAYS: player_answers.selected_option records A/B/C/D and the
-- marking compares against that letter, so it is still the question's answer
-- key. Only the four text columns move to rows.

alter table public.quiz_questions drop column if exists option_a;
alter table public.quiz_questions drop column if exists option_b;
alter table public.quiz_questions drop column if exists option_c;
alter table public.quiz_questions drop column if exists option_d;

-- ─── Self-check ────────────────────────────────────────────────────────────

do $$
declare
  n integer;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'quiz_questions'
     and column_name in ('option_a', 'option_b', 'option_c', 'option_d');
  if n <> 0 then raise exception 'option columns survived the drop'; end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'quiz_questions' and column_name = 'correct_option';
  if n <> 1 then
    raise exception 'correct_option was dropped; the marking and every recorded answer depend on it.';
  end if;

  select count(*) into n from public.quiz_answers where not coalesce(is_deleted, false);
  raise notice 'Option columns dropped. % answer row(s) now hold every question''s choices.', n;
end $$;

commit;

-- Verify — each question with its options:
--   select q.question, a.letter, a.answer_text, a.is_correct
--     from public.quiz_questions q
--     join public.quiz_answers a on a.question_id = q.question_id
--    where not coalesce(q.is_deleted, false)
--    order by q.created_at, a.ordinal;

-- Rollback — restores the columns and refills them from the rows, so nothing
-- is lost. Only the first four options per question fit, which is exactly the
-- limitation the answers table removed:
--   alter table public.quiz_questions
--     add column option_a text, add column option_b text,
--     add column option_c text, add column option_d text;
--   update public.quiz_questions q set
--     option_a = (select answer_text from public.quiz_answers where question_id = q.question_id and letter = 'A'),
--     option_b = (select answer_text from public.quiz_answers where question_id = q.question_id and letter = 'B'),
--     option_c = (select answer_text from public.quiz_answers where question_id = q.question_id and letter = 'C'),
--     option_d = (select answer_text from public.quiz_answers where question_id = q.question_id and letter = 'D');


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0021_recording_number.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 0021: a recording number, separate from the shirt number
--
-- APPLY BEFORE DEPLOYING THE CODE THAT READS IT. Additive, and the currently
-- deployed code reads none of it, so applying early changes nothing visible.
--
-- ── What this is for ──────────────────────────────────────────────────────
--
-- Matrix results are often written on paper during a session, and handwriting
-- is not always readable afterwards. Players write a RECORDING NUMBER instead
-- of their name: a short number that identifies them on the sheet.
--
-- That is not their shirt number. A shirt number changes between seasons and
-- between fixtures, may be unset for a trialist, and two squads can each have a
-- number 9. A recording number is assigned once per squad, usually running 1..N
-- alphabetically, and stays put for the season.
--
-- ── The backfill, and why it moves rather than copies ─────────────────────
--
-- The 24 rows currently on the roster hold 1..24 in alphabetical order by
-- surname. Those are recording numbers that were imported into the shirt-number
-- column because there was nowhere else to put them: the roster has been
-- showing "#1 Cesar Alva" as though 1 were his shirt.
--
-- So they are MOVED, not copied, and `number` is cleared. Clearing is the whole
-- point -- leaving them would keep displaying a shirt number nobody has been
-- given. Real shirt numbers can be imported later.
--
-- Guarded so it only touches rows that look like this: every live member of a
-- team numbered 1..N with no gaps and no duplicates. A squad whose numbers are
-- genuinely shirts (7, 10, 23...) does not fit that shape and is left alone.

begin;

set role postgres;

alter table public.team_players
  add column if not exists recording_number integer;

-- Unique per team: two players sharing a recording number makes a paper sheet
-- ambiguous, which is the one thing it must never be. Partial, so a squad may
-- have many members with none assigned yet.
create unique index if not exists team_players_recording_number_per_team
  on public.team_players (team_id, recording_number)
  where recording_number is not null and not coalesce(is_deleted, false);

create index if not exists team_players_recording_lookup
  on public.team_players (team_id, recording_number)
  where not coalesce(is_deleted, false);

-- ─── Move 1..N sequences out of the shirt-number column ────────────────────

do $$
declare
  t record;
  moved integer := 0;
begin
  for t in
    select tp.team_id,
           count(*)                          as members,
           count(tp.number)                  as numbered,
           count(distinct tp.number)         as distinct_numbers,
           min(tp.number)                    as lo,
           max(tp.number)                    as hi
      from public.team_players tp
     where not coalesce(tp.is_deleted, false)
       and tp.recording_number is null
     group by tp.team_id
  loop
    -- The signature of a recording-number run: every member numbered, all
    -- distinct, and covering exactly 1..N.
    if t.numbered = t.members
       and t.distinct_numbers = t.members
       and t.lo = 1
       and t.hi = t.members then

      update public.team_players
         set recording_number = number,
             number = null
       where team_id = t.team_id
         and not coalesce(is_deleted, false);

      moved := moved + t.members;
      raise notice 'Team %: moved % number(s) into recording_number and cleared the shirt number.', t.team_id, t.members;
    else
      raise notice 'Team %: numbers do not look like a 1..N recording run (% of % numbered, % to %), so they were left as shirt numbers.',
        t.team_id, t.numbered, t.members, t.lo, t.hi;
    end if;
  end loop;

  raise notice 'Recording numbers assigned to % player(s).', moved;
end $$;

-- ─── Self-check ────────────────────────────────────────────────────────────

do $$
declare
  n     integer;
  dupes integer;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'team_players' and column_name = 'recording_number';
  if n <> 1 then raise exception 'team_players.recording_number was not created'; end if;

  -- `number` must SURVIVE: it is still the shirt number, just empty for now.
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'team_players' and column_name = 'number';
  if n <> 1 then raise exception 'the shirt number column was dropped; it is still needed.'; end if;

  select count(*) into dupes from (
    select team_id, recording_number
      from public.team_players
     where recording_number is not null and not coalesce(is_deleted, false)
     group by team_id, recording_number having count(*) > 1
  ) d;
  if dupes > 0 then
    raise exception '% recording number(s) are used twice in the same squad. A paper sheet could not be read back.', dupes;
  end if;
end $$;

commit;

-- Verify — the roster as the paper sheet will read:
--   select t.name as team, tp.recording_number, tp.number as shirt, p.name
--     from public.team_players tp
--     join public.players p on p.id = tp.player_id
--     join public.teams   t on t.id = tp.team_id
--    where not coalesce(tp.is_deleted, false)
--    order by t.name, tp.recording_number;

-- Rollback:
--   update public.team_players
--      set number = recording_number, recording_number = null
--    where recording_number is not null;
--   drop index if exists public.team_players_recording_number_per_team;
--   drop index if exists public.team_players_recording_lookup;
--   alter table public.team_players drop column if exists recording_number;


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0022_time_band_scoring.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 0022: score a timed run against absolute standards, per team
--
-- APPLY BEFORE DEPLOYING THE CODE THAT READS IT. The view change is
-- self-contained and the new table is additive, so applying early changes
-- nothing for deployed code: no existing drill uses the new measure, so no
-- existing result is scored differently.
--
-- ── Why a fifth measure ───────────────────────────────────────────────────
--
-- `time_low` already scores a timed exercise, but RELATIVELY: percent_rank
-- within the session, so the fastest gets full credit and everyone else is
-- scaled by where they finished. That is right for a Cooper test, where the
-- question is who ran furthest.
--
-- It is wrong for a standard. "Three laps in 4:30 earns the point" means what
-- it says: hit it and you score, whether six team-mates beat you or nobody did.
-- Under percent_rank a squad that all ran 4:25 would still be spread from full
-- marks to the 0.25 participation floor, which is the opposite of the intent.
--
-- ── Bands are per TEAM, not per drill alone ───────────────────────────────
--
-- A 4:30 standard that stretches a varsity side is out of reach for an
-- under-14. The same drill therefore carries different thresholds for
-- different squads, which is the same reasoning that made practice plans and
-- daily messages team-scoped in 0014.
--
-- A band's `factor` multiplies the drill's WEIGHT, exactly as every other
-- measure does. So on a drill weighted 1.5, factor 1.0 earns 1.5 and factor
-- 0.25 earns 0.375. The weighting the coach set up still decides how much the
-- exercise is worth; the band decides how much of it was earned.

begin;

set role postgres;

-- ─── The new measure ───────────────────────────────────────────────────────

alter table public.drills_bank drop constraint if exists drills_bank_measure_check;
alter table public.drills_bank add constraint drills_bank_measure_check
  check (measure in ('head_to_head', 'win_loss', 'count_high', 'time_low', 'time_bands'));

-- ─── The standards ─────────────────────────────────────────────────────────
--
-- One row per band. Three bands is what the coach described, but nothing here
-- assumes three -- adding a fourth is a row, not a migration.
--
-- max_seconds rather than a text time: raw_value is numeric, and comparing
-- "4:30" as text would order 10:00 before 4:30. The UI converts.

create table if not exists public.drill_time_bands (
  id          uuid primary key default gen_random_uuid(),
  drill_id    uuid not null references public.drills_bank(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  max_seconds integer not null check (max_seconds > 0),
  factor      numeric not null check (factor >= 0 and factor <= 1),
  created_at  timestamptz not null default now()
);

-- Two bands at the same threshold for one squad would make the score
-- ambiguous, which is the one thing a standard must not be.
create unique index if not exists drill_time_bands_unique
  on public.drill_time_bands (drill_id, team_id, max_seconds);

create index if not exists drill_time_bands_lookup
  on public.drill_time_bands (drill_id, team_id, max_seconds);

alter table public.drill_time_bands enable row level security;

drop policy if exists "drill_time_bands_select" on public.drill_time_bands;
create policy "drill_time_bands_select" on public.drill_time_bands
  for select using (true);

-- Team-scoped writes: a coach sets standards for the squads they coach.
drop policy if exists "drill_time_bands_write" on public.drill_time_bands;
create policy "drill_time_bands_write" on public.drill_time_bands
  for all using (public.is_team_coach(team_id))
  with check (public.is_team_coach(team_id));

grant select, insert, update, delete on table public.drill_time_bands to anon, authenticated;

-- ─── Scoring ───────────────────────────────────────────────────────────────
-- Rebuilt from 0011 with one CTE added. Everything else is unchanged; the
-- whole view is restated because Postgres cannot alter a view's body in place.

drop view if exists public.matrix_standings;
drop view if exists public.matrix_exercise_points;

create view public.matrix_exercise_points with (security_invoker = true) as
with h2h as (
  select l.team_id,
         l.player_a_id                  as player_id,
         l.player_b_id                  as opponent_id,
         l.drill_id,
         coalesce(d.name, '1v1')        as exercise,
         coalesce(d.points, 1.0)        as weight,
         l.occurred_on,
         case l.outcome when 'a' then 'win' when 'draw' then 'draw' else 'loss' end as detail,
         null::numeric                  as raw_value,
         'present'::text                as attendance,
         case l.outcome when 'a' then 1.0 when 'draw' then 0.5 else 0.0 end as factor,
         case l.outcome when 'a'    then 1 else 0 end as w,
         case l.outcome when 'draw' then 1 else 0 end as dr,
         case l.outcome when 'b'    then 1 else 0 end as ls
    from public.matrix_logs l
    left join public.drills_bank d on d.id = l.drill_id
   where not coalesce(l.is_deleted, false)
  union all
  select l.team_id,
         l.player_b_id,
         l.player_a_id,
         l.drill_id,
         coalesce(d.name, '1v1'),
         coalesce(d.points, 1.0),
         l.occurred_on,
         case l.outcome when 'b' then 'win' when 'draw' then 'draw' else 'loss' end,
         null::numeric,
         'present'::text,
         case l.outcome when 'b' then 1.0 when 'draw' then 0.5 else 0.0 end,
         case l.outcome when 'b'    then 1 else 0 end,
         case l.outcome when 'draw' then 1 else 0 end,
         case l.outcome when 'a'    then 1 else 0 end
    from public.matrix_logs l
    left join public.drills_bank d on d.id = l.drill_id
   where not coalesce(l.is_deleted, false)
),
ranked as (
  -- percent_rank() over PRESENT players only; the ::numeric cast keeps the
  -- whole chain numeric, without which round(float8, int) does not exist.
  select s.team_id, r.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on, r.raw_value,
         percent_rank() over (
           partition by r.session_id
           order by case when d.measure = 'time_low' then r.raw_value
                         else -r.raw_value end
         )::numeric as pr
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'present'
     and d.measure in ('count_high', 'time_low')
     and r.raw_value is not null
),
banded as (
  -- A time against absolute standards. The band taken is the TIGHTEST one the
  -- time still fits under -- min(max_seconds) where raw_value <= max_seconds --
  -- so 4:28 takes the 4:30 band rather than the 4:50 one it also satisfies.
  --
  -- Missing every band scores 0 of the weight: present, standard not met.
  --
  -- A team with NO bands for the drill is excluded entirely, so the exercise
  -- is neither earned nor available for them. Scoring it 0 would quietly drag
  -- a squad's share down because a coach had not set their standards yet, and
  -- nothing on screen would say why.
  select s.team_id, r.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on, r.raw_value,
         coalesce((
           select b.factor
             from public.drill_time_bands b
            where b.drill_id = s.drill_id
              and b.team_id  = s.team_id
              and r.raw_value <= b.max_seconds
            order by b.max_seconds
            limit 1
         ), 0)::numeric as factor
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'present'
     and d.measure = 'time_bands'
     and r.raw_value is not null
     and exists (
       select 1 from public.drill_time_bands b
        where b.drill_id = s.drill_id and b.team_id = s.team_id
     )
),
win_loss as (
  select s.team_id, r.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on, r.outcome,
         case r.outcome when 'win' then 1.0 when 'draw' then 0.5 else 0.0 end as factor,
         case r.outcome when 'win'  then 1 else 0 end as w,
         case r.outcome when 'draw' then 1 else 0 end as dr,
         case r.outcome when 'loss' then 1 else 0 end as ls
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'present'
     and d.measure = 'win_loss'
     and r.outcome is not null
),
absent as (
  select s.team_id, r.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on
    from public.matrix_session_results r
    join public.matrix_sessions s on s.id = r.session_id
    join public.drills_bank    d on d.id = s.drill_id
   where not coalesce(s.is_deleted, false)
     and r.attendance = 'unexcused'
),
not_entered as (
  select s.team_id, tp.player_id, s.drill_id,
         d.name as exercise, d.points as weight, s.occurred_on
    from public.matrix_sessions s
    join public.drills_bank d on d.id = s.drill_id
    join public.team_players tp
      on tp.team_id = s.team_id
     and not coalesce(tp.is_deleted, false)
     and tp.created_at::date <= s.occurred_on
   where not coalesce(s.is_deleted, false)
     and not exists (
       select 1 from public.matrix_session_results r
        where r.session_id = s.id and r.player_id = tp.player_id
     )
)
select team_id, player_id, drill_id, exercise, occurred_on,
       'head_to_head'::text as kind, opponent_id, raw_value, detail, attendance,
       weight, weight * factor as earned, weight as available,
       w, dr, ls, 1 as exercise_count
  from h2h
union all
-- greatest(0.25, ...) is the participation floor: last place still beats not
-- turning up at all.
select team_id, player_id, drill_id, exercise, occurred_on,
       'measured'::text, null::uuid, raw_value, null::text, 'present'::text,
       weight, weight * greatest(0.25, 1 - pr), weight, 0, 0, 0, 1
  from ranked
union all
-- No participation floor here, deliberately. A standard that pays out for
-- missing it is not a standard; the floor exists for ranked tests so last
-- place still beats absence, which a band already expresses by scoring 0.
select team_id, player_id, drill_id, exercise, occurred_on,
       'time_band'::text, null::uuid, raw_value, null::text, 'present'::text,
       weight, weight * factor, weight, 0, 0, 0, 1
  from banded
union all
select team_id, player_id, drill_id, exercise, occurred_on,
       'win_loss'::text, null::uuid, null::numeric, outcome, 'present'::text,
       weight, weight * factor, weight, w, dr, ls, 1
  from win_loss
union all
select team_id, player_id, drill_id, exercise, occurred_on,
       'absent'::text, null::uuid, null::numeric, null::text, 'unexcused'::text,
       weight, 0, weight, 0, 0, 0, 1
  from absent
union all
select team_id, player_id, drill_id, exercise, occurred_on,
       'not_entered'::text, null::uuid, null::numeric, null::text, 'unexcused'::text,
       weight, 0, weight, 0, 0, 0, 1
  from not_entered;

grant select on public.matrix_exercise_points to anon, authenticated;

-- Restated unchanged from 0011: dropping the view above dropped this with it.
create view public.matrix_standings with (security_invoker = true) as
select team_id,
       player_id,
       sum(w)                             as wins,
       sum(dr)                            as draws,
       sum(ls)                            as losses,
       sum(w) + sum(dr) + sum(ls)         as games,
       sum(exercise_count)                as exercises,
       round(sum(earned)::numeric, 3)     as earned,
       round(sum(available)::numeric, 3)  as available,
       round(100.0 * sum(earned) / nullif(sum(available), 0), 1) as share,
       rank() over (
         partition by team_id
         order by sum(earned) desc,
                  sum(earned) / nullif(sum(available), 0) desc nulls last
       ) as rank
  from public.matrix_exercise_points
 group by team_id, player_id;

grant select on public.matrix_standings to anon, authenticated;

-- ─── Self-check ────────────────────────────────────────────────────────────

do $$
declare
  n integer;
begin
  if to_regclass('public.drill_time_bands') is null then
    raise exception 'drill_time_bands was not created';
  end if;

  -- Both views must exist: dropping them above and failing to rebuild would
  -- leave the standings page empty with no error anywhere.
  if to_regclass('public.matrix_exercise_points') is null then
    raise exception 'matrix_exercise_points was not rebuilt';
  end if;
  if to_regclass('public.matrix_standings') is null then
    raise exception 'matrix_standings was not rebuilt';
  end if;

  -- The new measure must be accepted by the constraint.
  begin
    perform 1 from public.drills_bank where measure = 'time_bands';
  exception when others then
    raise exception 'the measure constraint does not accept time_bands';
  end;

  select count(*) into n from public.matrix_standings;
  raise notice 'Time-band scoring installed. matrix_standings returns % row(s).', n;
end $$;

commit;

-- Verify — set a drill to the new measure, give a team three bands, and check
-- what a time earns:
--   select p.name, e.raw_value, e.weight, e.earned
--     from public.matrix_exercise_points e
--     join public.players p on p.id = e.player_id
--    where e.kind = 'time_band'
--    order by e.raw_value;

-- Rollback — restores 0011's view exactly and drops the table:
--   drop view if exists public.matrix_standings;
--   drop view if exists public.matrix_exercise_points;
--   -- then re-run the two create view statements from
--   -- 0011_rank_on_points.sql, which are unchanged apart from the banded CTE.
--   drop table if exists public.drill_time_bands;
--   alter table public.drills_bank drop constraint if exists drills_bank_measure_check;
--   alter table public.drills_bank add constraint drills_bank_measure_check
--     check (measure in ('head_to_head', 'win_loss', 'count_high', 'time_low'));


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0023_lineups.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 0023 — lineups and lineup cards.
--
-- ── What this adds ────────────────────────────────────────────────────────
--
-- A lineup belongs to a team AND a fixture: the XI for Friday's match is a
-- different thing from the XI for the one after it, and a coach sets it the
-- day before and reopens it at the ground.
--
--   lineups         one row per team per fixture — the formation and notes
--   lineup_players  one row per player in it — starter or bench, and where
--
-- Storing the slot AND the coordinates is deliberate. The slot ("LB", "CM")
-- is what the printed card shows and is stable; x/y is where the player sits
-- on the pitch diagram, which a coach may nudge off the formation's default.
-- Deriving one from the other would lose whichever was nudged.
--
-- ── Conventions this follows ──────────────────────────────────────────────
--
--   set role postgres  — the SQL editor may run as a role that is a MEMBER of
--                        postgres without defaulting to it, and CREATE POLICY
--                        checks ownership rather than privilege (see 0009).
--   add ... if not exists — correct against the live database whether or not
--                        a previous attempt got part way.
--   is_deleted        — soft delete, the repo-wide convention; readers filter.
--
-- Rollback is at the bottom. Nothing here alters an existing table, so this
-- migration is safe to run against a database serving live traffic.

begin;

set role postgres;

-- ─── 1. The lineup ─────────────────────────────────────────────────────────

create table if not exists public.lineups (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id),
  school_id   uuid not null references public.schools (id),
  match_id    uuid references public.schedule (id),
  formation   text not null default '4-4-2',
  notes       text,
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One live lineup per fixture. Partial, so a soft-deleted lineup does not
-- block setting a new one for the same match.
create unique index if not exists lineups_team_match_uniq
  on public.lineups (team_id, match_id)
  where not is_deleted and match_id is not null;

-- A team may also keep one lineup with no fixture attached — a default shape
-- to start from. Exactly one, for the same reason.
create unique index if not exists lineups_team_nomatch_uniq
  on public.lineups (team_id)
  where not is_deleted and match_id is null;

create index if not exists lineups_team_idx on public.lineups (team_id);

-- ─── 2. Who is in it ───────────────────────────────────────────────────────

create table if not exists public.lineup_players (
  id          uuid primary key default gen_random_uuid(),
  lineup_id   uuid not null references public.lineups (id) on delete cascade,
  player_id   uuid not null references public.players (id),
  role        text not null default 'starter',
  slot        text,
  x           numeric,
  y           numeric,
  sort_order  int not null default 0,
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Nobody is in the XI and on the bench at the same time.
create unique index if not exists lineup_players_uniq
  on public.lineup_players (lineup_id, player_id)
  where not is_deleted;

create index if not exists lineup_players_lineup_idx
  on public.lineup_players (lineup_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lineup_players_role_chk'
  ) then
    alter table public.lineup_players
      add constraint lineup_players_role_chk check (role in ('starter', 'bench'));
  end if;
end $$;

-- ─── 3. Access ─────────────────────────────────────────────────────────────
--
-- Coach-only, both ways. A lineup before kickoff is not public information,
-- unlike the roster and the schedule. Opening reads up later is a one-line
-- policy change; opening them now and retracting it is not.

alter table public.lineups        enable row level security;
alter table public.lineup_players enable row level security;

drop policy if exists lineups_read  on public.lineups;
drop policy if exists lineups_write on public.lineups;

create policy lineups_read on public.lineups
  for select using (public.is_team_coach(team_id));

create policy lineups_write on public.lineups
  for all using (public.is_team_coach(team_id))
         with check (public.is_team_coach(team_id));

drop policy if exists lineup_players_read  on public.lineup_players;
drop policy if exists lineup_players_write on public.lineup_players;

-- Scoped through the parent, so a lineup row and its players can never
-- disagree about who may see them.
create policy lineup_players_read on public.lineup_players
  for select using (exists (
    select 1 from public.lineups l
     where l.id = lineup_players.lineup_id and public.is_team_coach(l.team_id)));

create policy lineup_players_write on public.lineup_players
  for all using (exists (
    select 1 from public.lineups l
     where l.id = lineup_players.lineup_id and public.is_team_coach(l.team_id)))
  with check (exists (
    select 1 from public.lineups l
     where l.id = lineup_players.lineup_id and public.is_team_coach(l.team_id)));

grant select, insert, update, delete on public.lineups        to authenticated;
grant select, insert, update, delete on public.lineup_players to authenticated;

-- ─── 4. Self-check ─────────────────────────────────────────────────────────
--
-- Asserts what was created, and that the helper this depends on still exists.
-- is_team_coach() is what every policy above rests on; if a later migration
-- ever removed it these policies would silently deny everything.

do $$
begin
  if to_regclass('public.lineups') is null then
    raise exception 'lineups was not created.';
  end if;
  if to_regclass('public.lineup_players') is null then
    raise exception 'lineup_players was not created.';
  end if;
  if not exists (select 1 from pg_proc where proname = 'is_team_coach') then
    raise exception 'is_team_coach() is missing — every policy here depends on it.';
  end if;
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'lineup_players_uniq'
  ) then
    raise exception 'lineup_players_uniq is missing — a player could be starter and bench at once.';
  end if;

  raise notice 'lineups and lineup_players are ready.';
end $$;

commit;

-- Verify — both should come back empty rather than erroring:
--   select count(*) from public.lineups;
--   select count(*) from public.lineup_players;
--
-- And the policies should be listed:
--   select tablename, policyname from pg_policies
--    where tablename in ('lineups', 'lineup_players') order by 1, 2;

-- ── Rollback ──────────────────────────────────────────────────────────────
-- Destructive: this drops the tables and everything saved in them.
--
--   begin;
--   set role postgres;
--   drop table if exists public.lineup_players;
--   drop table if exists public.lineups;
--   commit;


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0024_plus_minus.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 0024 — plus/minus match tracking.
--
-- ── The shape, and why ────────────────────────────────────────────────────
--
--   stat_matches   one row per match being tracked
--   stat_events    an APPEND-ONLY log of everything that happened
--
-- There is deliberately NO table of per-player totals. Every figure the app
-- shows — plus, minus, goal differential, minutes played, shots, goals,
-- assists — is derived by replaying the events.
--
-- That choice is the whole design:
--
--   * Undo is free. A statistician on a touchline WILL mis-tap, and undoing a
--     stored counter means guessing what it was before.
--   * Playing time is exact. Derived from substitution events against the
--     clock, rather than a counter ticking in a browser tab that may be
--     backgrounded, throttled or closed.
--   * Goal differential follows corrections. It is computed from who was on
--     the pitch at that clock time, so fixing a mis-timed substitution fixes
--     every goal affected by it.
--   * Two devices tracking the same match converge, because appending is
--     commutative in a way that incrementing is not.
--
-- The cost is that reading a match means reading its events. A match is a few
-- hundred rows, which is nothing.
--
-- ── Conventions ───────────────────────────────────────────────────────────
--
--   set role postgres      the SQL editor may run as a MEMBER of postgres
--                          without defaulting to it (see 0009)
--   add ... if not exists  correct against the live database either way
--   is_deleted             soft delete, as everywhere else
--
-- Rollback is at the bottom. Nothing here alters an existing table.

begin;

set role postgres;

-- ─── 1. The match ──────────────────────────────────────────────────────────

create table if not exists public.stat_matches (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id),
  school_id   uuid not null references public.schools (id),
  match_id    uuid references public.schedule (id),
  label       text,
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One live tracking session per fixture. Partial, so a soft-deleted one does
-- not block starting again.
create unique index if not exists stat_matches_fixture_uniq
  on public.stat_matches (team_id, match_id)
  where not is_deleted and match_id is not null;

create index if not exists stat_matches_team_idx
  on public.stat_matches (team_id) where not is_deleted;

-- ─── 2. What happened ──────────────────────────────────────────────────────
--
-- `at_seconds` is the MATCH clock, not wall time: it is what minutes played
-- and goal differential are computed against, and it must not move when the
-- clock is paused. created_at is kept separately so events can be ordered
-- when two share a clock second.

create table if not exists public.stat_events (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.stat_matches (id) on delete cascade,
  player_id   uuid references public.players (id),
  kind        text not null,
  at_seconds  int not null default 0,
  period      int not null default 1,
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists stat_events_match_idx
  on public.stat_events (match_id, created_at) where not is_deleted;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stat_events_kind_chk') then
    alter table public.stat_events add constraint stat_events_kind_chk
      check (kind in (
        'on', 'off',                    -- a player enters or leaves the pitch
        'plus', 'minus',                -- the statistician's judgement
        'shot', 'goal', 'assist',       -- attributed to a player
        'goal_for', 'goal_against',     -- a team goal; differential follows
        'clock_start', 'clock_stop',    -- what makes playing time exact
        'period'                        -- half time, and beyond
      ));
  end if;

  -- A team event has no player; a player event must name one. Enforced here
  -- rather than trusted, because a goal with no scorer and a shot with no
  -- taker are both silently wrong rather than loudly broken.
  if not exists (select 1 from pg_constraint where conname = 'stat_events_player_chk') then
    alter table public.stat_events add constraint stat_events_player_chk
      check (
        (kind in ('goal_for', 'goal_against', 'clock_start', 'clock_stop', 'period')
           and player_id is null)
        or
        (kind in ('on', 'off', 'plus', 'minus', 'shot', 'goal', 'assist')
           and player_id is not null)
      );
  end if;

  -- The clock cannot run backwards.
  if not exists (select 1 from pg_constraint where conname = 'stat_events_clock_chk') then
    alter table public.stat_events add constraint stat_events_clock_chk
      check (at_seconds >= 0);
  end if;
end $$;

-- ─── 3. Access ─────────────────────────────────────────────────────────────
--
-- Coach-only, both ways, scoped through is_team_coach(). A statistician needs
-- a coach account on the team, which is the same rule every other write
-- surface uses.

alter table public.stat_matches enable row level security;
alter table public.stat_events  enable row level security;

drop policy if exists stat_matches_read  on public.stat_matches;
drop policy if exists stat_matches_write on public.stat_matches;

create policy stat_matches_read on public.stat_matches
  for select using (public.is_team_coach(team_id));

create policy stat_matches_write on public.stat_matches
  for all using (public.is_team_coach(team_id))
         with check (public.is_team_coach(team_id));

drop policy if exists stat_events_read  on public.stat_events;
drop policy if exists stat_events_write on public.stat_events;

-- Scoped through the parent, so an event and its match can never disagree
-- about who may see them.
create policy stat_events_read on public.stat_events
  for select using (exists (
    select 1 from public.stat_matches m
     where m.id = stat_events.match_id and public.is_team_coach(m.team_id)));

create policy stat_events_write on public.stat_events
  for all using (exists (
    select 1 from public.stat_matches m
     where m.id = stat_events.match_id and public.is_team_coach(m.team_id)))
  with check (exists (
    select 1 from public.stat_matches m
     where m.id = stat_events.match_id and public.is_team_coach(m.team_id)));

grant select, insert, update, delete on public.stat_matches to authenticated;
grant select, insert, update, delete on public.stat_events  to authenticated;

-- ─── 4. Self-check ─────────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.stat_matches') is null then
    raise exception 'stat_matches was not created.';
  end if;
  if to_regclass('public.stat_events') is null then
    raise exception 'stat_events was not created.';
  end if;
  if not exists (select 1 from pg_proc where proname = 'is_team_coach') then
    raise exception 'is_team_coach() is missing — every policy here depends on it.';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stat_events_player_chk') then
    raise exception 'stat_events_player_chk is missing — a goal could be saved with no scorer.';
  end if;

  raise notice 'stat_matches and stat_events are ready.';
end $$;

commit;

-- Verify — both should return 0 rather than erroring:
--   select count(*) from public.stat_matches;
--   select count(*) from public.stat_events;
--
-- And the policies should be listed:
--   select tablename, policyname from pg_policies
--    where tablename in ('stat_matches', 'stat_events') order by 1, 2;

-- ── Rollback ──────────────────────────────────────────────────────────────
-- Destructive: drops every tracked match and its events.
--
--   begin;
--   set role postgres;
--   drop table if exists public.stat_events;
--   drop table if exists public.stat_matches;
--   commit;


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0025_schedule_venue_address.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 0025 — an address for the away venue.
--
-- ── Why a column and not a lookup ─────────────────────────────────────────
--
-- The schedule already has `location`, but it is free text describing WHERE
-- loosely, and after the Location→Opponent fallback the away fixtures hold
-- bare opponent names: 'Sultana', 'Redlands', 'Cajon'. Those are not
-- destinations. Handed to a map, 'Redlands' drops a pin in the middle of a
-- city of 70,000 rather than at the school's field — and this schedule
-- contains BOTH 'Redlands' and 'Redlands East Valley', so even a human
-- cannot resolve the short one without knowing the league.
--
-- So directions need an address the coach states, not one the app infers.
-- `venue_address` is that: nullable, free text, and the directions link on
-- the AWAY badge appears only when it is filled. No address, no link — a
-- link to the wrong town is worse than no link at all.
--
-- Nullable is the point, not an oversight. Nineteen fixtures already exist,
-- home fixtures never need one, and a club playing on a park pitch may have
-- nothing a directory would recognise.
--
-- ── Conventions ───────────────────────────────────────────────────────────
--
--   set role postgres      the SQL editor may run as a MEMBER of postgres
--                          without defaulting to it. ALTER TABLE checks
--                          OWNERSHIP rather than privilege, so it fails with
--                          42501 even when the privilege is reachable.
--                          See the top of 0009.
--
--   add column if not exists   rather than `alter column`, so this is correct
--                          against the live database whether or not it
--                          matches supabase_schema.sql — which has drifted,
--                          and has cost a failed migration three times.
--
-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- Nothing to do. Policies in supabase_migration_auth.sql are table-wide:
-- `schedule_select` allows anyone to read a row that is not soft-deleted,
-- and `schedule_write` allows a write only when current_profile_role() is
-- coach or admin. A new column inherits both. Reading stays public on
-- purpose — a parent driving to an away game is the entire point.
--
-- ── Rollback ──────────────────────────────────────────────────────────────
--
--   begin;
--     set role postgres;
--     alter table public.schedule drop column if exists venue_address;
--   commit;
--
-- Dropping it discards every address typed since this ran; they are not
-- recoverable from anywhere else. Export the column first if that matters:
--
--   select id, opponent, match_date, venue_address
--     from public.schedule
--    where venue_address is not null;

begin;

set role postgres;

alter table public.schedule
  add column if not exists venue_address text;

comment on column public.schedule.venue_address is
  'Street address of the venue, as stated by a coach. Drives the directions '
  'link on the AWAY badge, which is hidden while this is null. Distinct from '
  '`location`, which is a loose human label ("Cougar Stadium", or just the '
  'opponent name) and is not navigable.';

commit;

-- ── Verify ────────────────────────────────────────────────────────────────
--
-- Should return one row naming the column:
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name   = 'schedule'
--      and column_name  = 'venue_address';


-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/migrations/0026_school_league.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 0026 — the competition an organization plays in.
--
-- ── Why ───────────────────────────────────────────────────────────────────
--
-- The strip across the top of every page read "Citrus Belt League •
-- Beaumont, CA", written into index.html by hand. The city half already had
-- somewhere to live — schools.city, which a coach can edit in the school
-- profile — but the league had nowhere, so it was simply typed into the
-- markup and was wrong for every organization except one.
--
-- This database already holds four organizations, two of them clubs. A club
-- plays in a club league, not the Citrus Belt.
--
-- ── Nullable, deliberately ────────────────────────────────────────────────
--
-- A team may not play in a named competition at all — a club side arranging
-- friendlies, a school between affiliations. The banner shows whichever of
-- league and city is set, and neither is required.
--
-- ── Conventions ───────────────────────────────────────────────────────────
--
--   set role postgres      the SQL editor may run as a MEMBER of postgres
--                          without defaulting to it, and ALTER TABLE checks
--                          OWNERSHIP rather than privilege. See 0009.
--
--   add column if not exists   correct whether or not the live database
--                          matches supabase_schema.sql, which has drifted.
--
-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- Nothing to do. The policies on public.schools are table-wide, so a new
-- column inherits them: anyone may read a row that is not soft-deleted, and
-- only a coach or admin may write. Reading is public on purpose — the banner
-- is the first thing a parent sees, signed in or not.
--
-- ── Rollback ──────────────────────────────────────────────────────────────
--
--   begin;
--     set role postgres;
--     alter table public.schools drop column if exists league;
--   commit;

begin;

set role postgres;

alter table public.schools
  add column if not exists league text;

comment on column public.schools.league is
  'The competition this organization plays in, as it should be displayed — '
  '"Citrus Belt League", "SoCal Developmental". Shown in the page banner '
  'beside city. Null when the organization plays no named competition.';

-- Beaumont's own, so the banner keeps saying what it said before rather than
-- losing half its line the moment this runs. Every other organization starts
-- null and sets its own in the school profile.
update public.schools
   set league = 'Citrus Belt League'
 where code = 'bhs'
   and league is null;

commit;

-- ── Verify ────────────────────────────────────────────────────────────────
--
--   select code, name, kind, league, city
--     from public.schools
--    where coalesce(is_deleted, false) = false
--    order by kind, name;
--
-- Beaumont should read "Citrus Belt League"; the rest are blank until their
-- coach fills them in under Admin → School profile.

