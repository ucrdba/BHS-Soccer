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
  foreign key (team_id, school_id) references public.teams (id, school_id),
  unique (team_id, player_id),
  -- The central rule: one team per organization, several organizations.
  unique (school_id, player_id)
);

create index if not exists team_players_team_idx   on public.team_players (team_id);
create index if not exists team_players_player_idx on public.team_players (player_id);

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
  select public.current_profile_role() = 'admin'
      or exists (
        select 1 from public.team_coaches tc
        where tc.team_id = target_team_id
          and tc.profile_id = auth.uid()
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
insert into public.teams (school_id, name, season, is_public_default)
values ('7ebbe980-b87e-421f-a11f-788ca2519504', 'Varsity', '2026', true)
on conflict (school_id, name) do nothing;

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
-- unchanged. Re-runnable only before any player is moved to a different team:
-- the ON CONFLICT clause below only catches a (team_id, player_id) collision,
-- not the (school_id, player_id) constraint that actually enforces
-- one-team-per-organization, so re-running this after a player has moved
-- teams aborts with 23505.
insert into public.team_players (team_id, school_id, player_id, number, position, season_stats, ratings, is_deleted)
select t.id, p.school_id, p.id, p.number, p.position, p.season_stats, p.ratings, coalesce(p.is_deleted, false)
  from public.players p
  join public.teams t
    on t.school_id = p.school_id and t.name = 'Varsity'
 where p.school_id = '7ebbe980-b87e-421f-a11f-788ca2519504'
on conflict (team_id, player_id) do nothing;

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
