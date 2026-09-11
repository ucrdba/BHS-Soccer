-- 0029 — the coach's daily message is for the squad, not the public.
--
-- ── Why ───────────────────────────────────────────────────────────────────
--
-- The home page stopped showing the daily message to visitors, but that was
-- presentation only: 0015's select policy was
--
--     using (coalesce(is_deleted, false) = false)
--
-- which lets ANYONE holding the public anon key read every team's messages
-- straight from the REST API. This makes the database agree with the page.
--
-- ── Who may read ──────────────────────────────────────────────────────────
--
-- A message belongs to a team (0014 made daily_thoughts team-scoped), so it is
-- read by that team:
--
--   * an active PLAYER whose profile is linked to a player on the team
--     (profiles.player_id -> team_players, not soft-deleted);
--   * whoever public.is_team_coach() already admits -- a coach of the team,
--     or any active admin. That is exactly who can already WRITE a message
--     (daily_thoughts_write), so reading is no wider than writing.
--
-- Not a signed-in guest, not a pending or rejected profile, and not a player
-- on another team or another organization: a club's squad does not read
-- Beaumont's messages.
--
-- The player's own quiz still works: fetchTeamQuiz reads the active message
-- of the player's own team, which this admits.
--
-- ── Conventions ───────────────────────────────────────────────────────────
--
--   set role postgres      the SQL editor may run as a MEMBER of postgres
--                          without defaulting to it, and CREATE POLICY checks
--                          OWNERSHIP rather than privilege. See 0009.
--
--   SECURITY DEFINER       for the same reason as is_team_coach(): the helper
--                          reads profiles and team_players, and must not
--                          depend on -- or recurse through -- their policies.
--
-- NOTE: re-running supabase_migration_auth.sql section 6, or 0015, after this
-- would silently restore the public read. Re-apply 0029 if you do.

begin;
set role postgres;

-- ─── 1. is_team_member() ───────────────────────────────────────────────────

create or replace function public.is_team_member(target_team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  -- The role check must wrap the membership check, as in is_team_coach():
  -- current_profile_role() falls back to 'guest' once status is not 'active',
  -- so a rejected player with a surviving team_players row stops reading the
  -- moment they are rejected. A bare `exists` on team_players would bypass
  -- that. Do not simplify this back to a plain `or`.
  select coalesce(
    public.is_team_coach(target_team_id)
    or (
      public.current_profile_role() = 'player'
      and exists (
        select 1 from public.team_players tp
         where tp.team_id = target_team_id
           and tp.player_id = public.current_profile_player_id()
           and coalesce(tp.is_deleted, false) = false
      )
    ),
    false
  );
$$;

-- ─── 2. The select policy ──────────────────────────────────────────────────
--
-- Replaces 0015's public read. daily_thoughts_write (for all, using
-- is_team_coach) is left exactly as it is.

drop policy if exists "daily_thoughts_select" on public.daily_thoughts;
create policy "daily_thoughts_select" on public.daily_thoughts
  for select using (
    coalesce(is_deleted, false) = false
    and public.is_team_member(team_id)
  );

commit;

-- Verify, as a visitor (should return 0):
--   set role anon; select count(*) from public.daily_thoughts; reset role;
