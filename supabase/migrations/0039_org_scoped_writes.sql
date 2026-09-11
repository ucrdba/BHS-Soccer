-- 0039 — a coach writes their own organization's rows, and nobody else's.
--
-- Written as 0031 on a branch that predated 0032-0038, and renumbered on
-- rebase: production already has those, so it runs after them everywhere --
-- the demo rebuild included -- rather than before them in one place and after
-- them in the other.
--
-- ── Why ───────────────────────────────────────────────────────────────────
--
-- supabase_migration_auth.sql section 6 gave nine tables one write policy:
--
--     for all using (current_profile_role() in ('coach', 'admin'))
--
-- It checks the ROLE and nothing else, so any active coach or admin of ANY
-- organization could insert, update or delete any row. 0015 replaced it for
-- practice_plans and daily_thoughts. Nothing replaced it for schools, players,
-- schedule, drills_bank, coaches or quiz_questions -- and 0002 (matrix_logs)
-- and 0019 (quiz_answers) copied the same policy onto two more tables. So a
-- club coach could rename Beaumont, change its colours or logo, soft-delete
-- it, rewrite its drills and staff list, move its fixtures, record Matrix
-- results for its players, or change which answer its quiz marks as correct.
--
-- 0026's comment that "only a coach or admin may write" schools described
-- exactly that hole. This supersedes it.
--
-- ── Who counts as an organization's staff ─────────────────────────────────
--
-- A new helper, is_org_staff(school):
--
--   * a COACH is staff where they coach: a team_coaches row on a live team of
--     that organization. NOT where their profile says. Production's signup
--     (0013's handle_new_user) files every new profile under the organization
--     whose code is 'bhs', and approving an account changes its role, never
--     its organization -- so a club coach's profiles.school_id usually names
--     Beaumont. Trusting it would leave every club coach on Beaumont's staff,
--     which is the hole being closed. This is why 0027's rule for
--     soccer_categories, which does trust it, is not reused here.
--   * an ADMIN is staff of EVERY organization. Running the platform is what
--     the role is for, and an organization may have no coach assigned yet --
--     production's club had none when this was written, and holding an admin
--     to their profile's organization would have left it writable by nobody.
--     This matches is_team_coach(), which has always admitted any active
--     admin to every team.
--
-- ── What each table now allows ────────────────────────────────────────────
--
--   schools         Created, edited or removed by an admin, any organization's.
--                   TeamsSection is admin-only and its createSchool is the only
--                   caller. No coach edits an organization's row, their own
--                   included --
--                   SchoolProfileSection already shows its form to admins
--                   alone, and says so.
--   drills_bank,
--   quiz_questions,
--   coaches         Staff of the row's school_id.
--   quiz_answers    Staff of the question's organization.
--   schedule,
--   matrix_logs     A coach of the team, or an admin (is_team_coach).
--   players         There is no organization column: a player belongs through
--                   team_players, and one person may be on a school team and a
--                   club team. Staff of any organization the player is on a
--                   live team in may edit them, since the identity is shared.
--                   A player on no live team belongs to nobody yet, and any
--                   coach may write them: the identity row is written BEFORE
--                   its membership when a player is added, and the admin
--                   panel's unassigned-players pool is offered to every coach.
--
-- Reads are unchanged.
--
-- ── What this deliberately leaves alone ───────────────────────────────────
--
-- is_team_coach() still admits ANY active admin to EVERY team, so the tables
-- that rest on it alone -- team_players, practice_plans, daily_thoughts,
-- matrix_sessions, matrix_session_results, drill_time_bands, lineups,
-- stat_matches, team_quiz_questions -- still let an admin write another
-- organization's team. That is 0005's design, 0029 tests it, and narrowing it
-- is a separate decision about what an admin is. Here the narrower rule is
-- applied only to the tables that had no scoping at all.
--
-- ── Conventions ───────────────────────────────────────────────────────────
--
--   set role postgres      the SQL editor may run as a MEMBER of postgres
--                          without defaulting to it, and CREATE POLICY checks
--                          OWNERSHIP rather than privilege. See 0009.
--
--   SECURITY DEFINER       for the same reason as is_team_coach(): the helpers
--                          read profiles, team_coaches, teams, team_players and
--                          quiz_questions, and must not depend on -- or recurse
--                          through -- those tables' own policies. A soft-deleted
--                          question is invisible to quiz_questions_select, and
--                          its answers must still be writable.
--
-- NOTE: re-running supabase_migration_auth.sql section 6 after this would
-- silently restore every role-only policy, as it would 0015's and 0029's.
-- Re-apply 0015, 0029 and 0039 if you do.

begin;
set role postgres;

-- ─── 1. Helpers ────────────────────────────────────────────────────────────

create or replace function public.is_org_staff(target_school_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  -- Every branch goes through current_profile_role(), which falls back to
  -- 'guest' once status is not 'active' -- so a rejected coach with a
  -- surviving team_coaches row stops writing the moment they are rejected.
  -- A bare `exists` on team_coaches would bypass that, as is_team_coach()'s
  -- own comment warns.
  select coalesce(
    -- An admin runs every organization, staffed or not.
    public.current_profile_role() = 'admin'
    or (
      public.current_profile_role() in ('coach', 'admin')
      and exists (
        select 1
          from public.team_coaches tc
          join public.teams t on t.id = tc.team_id
         where tc.profile_id = auth.uid()
           and t.school_id = target_school_id
           and coalesce(t.is_deleted, false) = false
      )
    ),
    false
  );
$$;

-- A team's writer. With an admin staff of every organization this is
-- is_team_coach() itself; the organization check stays so the rule reads the
-- same as the org-keyed tables' and cannot drift if is_team_coach() changes.
create or replace function public.can_write_team(target_team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    public.is_team_coach(target_team_id)
    and exists (
      select 1 from public.teams t
       where t.id = target_team_id
         and public.is_org_staff(t.school_id)
    ),
    false
  );
$$;

create or replace function public.can_write_question(target_question_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    exists (
      select 1 from public.quiz_questions q
       where q.question_id = target_question_id
         and public.is_org_staff(q.school_id)
    ),
    false
  );
$$;

create or replace function public.can_write_player(target_player_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    public.current_profile_role() in ('coach', 'admin')
    and (
      -- On a live team of an organization the writer works for.
      exists (
        select 1 from public.team_players tp
         where tp.player_id = target_player_id
           and coalesce(tp.is_deleted, false) = false
           and public.is_org_staff(tp.school_id)
      )
      -- Or on no live team anywhere: nobody's yet, including a row this very
      -- insert is creating.
      or not exists (
        select 1 from public.team_players tp
         where tp.player_id = target_player_id
           and coalesce(tp.is_deleted, false) = false
      )
    ),
    false
  );
$$;

-- ─── 2. Policies ───────────────────────────────────────────────────────────
--
-- Each replaces the role-only policy of the same name. `for all` rather than
-- one policy per command, as before: it also lets staff read their own
-- organization's soft-deleted rows, which is how a retired row is restored.

-- schools: admins only, every organization. schools_insert is kept as a
-- separate policy so the self-check below and the verify query keep naming the
-- same set; with schools_write admitting any admin it adds nothing.
drop policy if exists "schools_write" on public.schools;
create policy "schools_write" on public.schools
  for all
  using (public.current_profile_role() = 'admin')
  with check (public.current_profile_role() = 'admin');

drop policy if exists "schools_insert" on public.schools;
create policy "schools_insert" on public.schools
  for insert
  with check (public.current_profile_role() = 'admin');

drop policy if exists "drills_bank_write" on public.drills_bank;
create policy "drills_bank_write" on public.drills_bank
  for all
  using (public.is_org_staff(school_id))
  with check (public.is_org_staff(school_id));

drop policy if exists "quiz_questions_write" on public.quiz_questions;
create policy "quiz_questions_write" on public.quiz_questions
  for all
  using (public.is_org_staff(school_id))
  with check (public.is_org_staff(school_id));

drop policy if exists "quiz_answers_write" on public.quiz_answers;
create policy "quiz_answers_write" on public.quiz_answers
  for all
  using (public.can_write_question(question_id))
  with check (public.can_write_question(question_id));

drop policy if exists "coaches_write" on public.coaches;
create policy "coaches_write" on public.coaches
  for all
  using (public.is_org_staff(school_id))
  with check (public.is_org_staff(school_id));

drop policy if exists "schedule_write" on public.schedule;
create policy "schedule_write" on public.schedule
  for all
  using (public.can_write_team(team_id))
  with check (public.can_write_team(team_id));

drop policy if exists "matrix_logs_write" on public.matrix_logs;
create policy "matrix_logs_write" on public.matrix_logs
  for all
  using (public.can_write_team(team_id))
  with check (public.can_write_team(team_id));

drop policy if exists "players_write" on public.players;
create policy "players_write" on public.players
  for all
  using (public.can_write_player(id))
  with check (public.can_write_player(id));

-- ─── 3. Self-check ─────────────────────────────────────────────────────────
--
-- Permissive policies are OR'd, so any other write policy left on these
-- tables -- one made in the dashboard, or by an older script under another
-- name -- would silently undo everything above. Refuse to finish rather than
-- report a success that is not one. Restrictive policies only narrow, so
-- they are not counted.

do $$
declare
  leftover text;
begin
  select string_agg(format('"%s" on %s', policyname, tablename), ', ' order by tablename, policyname)
    into leftover
    from pg_policies
   where schemaname = 'public'
     and permissive = 'PERMISSIVE'
     and cmd <> 'SELECT'
     and tablename in ('schools', 'players', 'schedule', 'drills_bank', 'coaches',
                       'quiz_questions', 'quiz_answers', 'matrix_logs')
     and policyname not in ('schools_write', 'schools_insert', 'players_write', 'schedule_write',
                            'drills_bank_write', 'coaches_write', 'quiz_questions_write',
                            'quiz_answers_write', 'matrix_logs_write');

  if leftover is not null then
    raise exception
      '0039: % would still let someone write outside their organization. Permissive policies are OR''d, so leaving it undoes this migration. Drop it and re-run.',
      leftover;
  end if;
end $$;

commit;

-- ─── Verify ────────────────────────────────────────────────────────────────
--
-- Every write policy on the eight tables, which should be exactly the nine
-- named above:
--
--   select tablename, policyname, cmd from pg_policies
--    where schemaname = 'public' and cmd <> 'SELECT'
--      and tablename in ('schools','players','schedule','drills_bank','coaches',
--                        'quiz_questions','quiz_answers','matrix_logs')
--    order by tablename, policyname;
--
-- ─── Rollback ──────────────────────────────────────────────────────────────
--
-- Restores the role-only policies, and with them the hole. For each of
-- players, schedule, drills_bank, coaches, schools, quiz_questions,
-- quiz_answers and matrix_logs:
--
--   drop policy if exists "<table>_write" on public.<table>;
--   create policy "<table>_write" on public.<table>
--     for all using (public.current_profile_role() in ('coach', 'admin'))
--     with check (public.current_profile_role() in ('coach', 'admin'));
--
-- then:
--
--   drop policy if exists "schools_insert" on public.schools;
--   drop function if exists public.can_write_player(uuid);
--   drop function if exists public.can_write_question(uuid);
--   drop function if exists public.can_write_team(uuid);
--   drop function if exists public.is_org_staff(uuid);
