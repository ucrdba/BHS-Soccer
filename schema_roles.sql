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
