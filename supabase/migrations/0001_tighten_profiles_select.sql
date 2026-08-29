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
