# Multi-Team Support (Phase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one coach run varsity, JV and club teams at once, each with its own roster, schedule and Competitive Matrix, where a player on both a school team and a club is one person with per-team statistics.

**Architecture:** A `teams` table under the existing `schools` table, plus a `team_players` membership carrying everything that varies by team (number, position, season stats, ratings). `players` becomes pure identity. One team per organization is enforced by `unique (school_id, player_id)` with a composite foreign key preventing that column from drifting from its team's. Writes become team-scoped via `is_team_coach()`; reads stay public.

**Tech Stack:** Supabase (Postgres + GoTrue + RLS), plain-JS classic scripts under `public/js/`, TypeScript under `src/`, Vite 8, Vitest 4, Node 24.

**Spec:** `docs/superpowers/specs/2026-08-30-multi-team-support-design.md`

## Global Constraints

- **No agent has DDL access.** Only the publishable anon key, which cannot execute DDL. The human applies every migration by hand in the Supabase SQL editor. Migrations are numbered files in `supabase/migrations/` with a documented rollback.
- **Migration numbering:** `0001`–`0003` are applied. **`0004` is taken** by the parked `feat/google-signin-allowlist` branch and is NOT on this branch. Multi-team starts at **`0005`**. Do not create a `0004` here — it would collide if that branch lands later.
- **[SUPERSEDED 2026-08-30 during execution]** This constraint originally required a two-migration split — `0005` creates and copies, the app deploys, verification runs, only then `0006` drops. The project owner stated mid-execution that the current data is reproducible and does not need protecting, which removed the split's entire justification. **There is now one migration, `0005`.** The single rule that replaces the sequence: **apply it at merge time, not before** — it drops `players.number` in the same breath as it creates the new tables, so the deployed application's roster breaks from the moment it is applied until the branch lands.
- **New tables must NOT be added to the uniform policy loop** in `supabase_migration_auth.sql` section 6. That loop grants blanket coach/admin write over an explicit table array. These tables get their own team-scoped policies.
- `npm run build` is **mandatory** for any `src/` change — the only check exercising real module resolution. `npm run typecheck` covers `src/` only. `node --check <file>` is the only syntax gate for `public/js/`.
- Do **not** change `tsconfig.json`. Never create `src/data/index.ts`.
- **This tsconfig does not pick up `@types/node`.** Tests must not use `Buffer`, `process`, or `node:` imports; load `public/js` files via Vite's `?raw` plus `new Function`, as the existing suites do.
- **Baseline: 61 tests across 7 files** on this branch. (The 73 figure belongs to the parked Google branch — do not use it.)
- **Phase 2 fetches stay school-scoped and must be left alone:** practice plans, drills bank, daily thoughts, quiz, soccer categories, and the `coaches` display table.
- Beaumont's school uuid is `7ebbe980-b87e-421f-a11f-788ca2519504`. Live data: 11 players, 1 schedule row, 0 matrix logs.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0005_multi_team_schema.sql` | **Create:** teams, team_players, team_coaches, `schools.kind`, `is_team_coach()`, the `current_profile_role()` status fix, team-scoped RLS, `schedule.team_id` and `matrix_logs.team_id` with backfill, `matrix_standings` repartitioned by team, and the data migration. |
| `supabase/migrations/0006_drop_player_team_columns.sql` | **Create:** drops the moved columns. Applied only after the code ships and verification passes. |
| `docs/runbooks/2026-08-30-multi-team-runbook.md` | **Create:** apply order, the deploy-between-migrations warning, and the eight SQL verification checks. |
| `src/data/supabase.ts` | **Modify:** team-scoped fetches and writes; `fetchTeamsForViewer`. |
| `src/globals.d.ts` | **Modify:** matching `SupabaseServiceLike` declarations. |
| `public/js/app.core.js` | **Modify:** active-team resolution, localStorage persistence, `syncFromSupabase` by team. |
| `public/js/views/teamswitcher.view.js` | **Create:** the switcher's markup and handlers. |
| `index.html` | **Modify:** switcher mount point; load the new script in order. |
| `public/js/views/roster.view.js` | **Modify:** search-first add-player flow. |
| `src/data/team-scope.test.ts` | **Create:** covers scope resolution and the switcher's rendering. |
| `CLAUDE.md` | **Modify:** record the team model. |

---

## Task 1: Migrations and runbook

**Files:**
- Create: `supabase/migrations/0005_multi_team_schema.sql`
- Create: `supabase/migrations/0006_drop_player_team_columns.sql`
- Create: `docs/runbooks/2026-08-30-multi-team-runbook.md`

**Interfaces:**
- Consumes: `public.schools`, `public.players`, `public.schedule`, `public.matrix_logs`, `public.profiles`, and `public.current_profile_role()` — all already applied.
- Produces: tables `teams (id, school_id, name, season, is_public_default, is_deleted)`, `team_players (id, team_id, school_id, player_id, number, position, season_stats, ratings, is_deleted)`, `team_coaches (team_id, profile_id)`; function `public.is_team_coach(uuid) returns boolean`. Task 3 reads all of these.

No automated test exists for this task — no agent can execute DDL. The deliverable is two migration files plus the runbook that makes them checkable. Correctness comes from reading and from the runbook's SQL.

- [ ] **Step 1: Write `0005_multi_team_schema.sql`**

```sql
-- supabase/migrations/0005_multi_team_schema.sql
--
-- Multi-team support, Phase 1. One coach runs several teams; a player on both a
-- school team and a club is ONE person with per-team statistics.
--
-- NUMBERING: 0004 belongs to the parked feat/google-signin-allowlist branch and
-- is deliberately skipped here so the two branches cannot collide.
--
-- THIS IS MIGRATION A OF TWO, AND THE ORDER MATTERS:
--   1. apply this file          2. deploy the application change
--   3. run the runbook checks   4. only then apply 0006
-- Applying this without deploying the code leaves the app writing to
-- players.number and players.season_stats, which 0006 then deletes silently.
--
-- Rollback, in this order:
--   1. restore matrix_standings from 0003
--   2. alter table public.schedule    drop column team_id;
--      alter table public.matrix_logs drop column team_id;
--   3. drop table if exists public.team_players, public.team_coaches, public.teams cascade;
--   4. drop function if exists public.is_team_coach(uuid);
--   5. alter table public.schools drop column kind;
--   6. restore current_profile_role() from supabase_migration_auth.sql section 2
--   Nothing in this file drops a column holding data, so a rollback loses nothing.

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
-- team_id is ADDED here and school_id is LEFT IN PLACE. 0006 drops school_id
-- after the code ships -- keeping both columns is what makes the deploy window
-- survivable.

alter table public.schedule    add column if not exists team_id uuid references public.teams(id) on delete cascade;
alter table public.matrix_logs add column if not exists team_id uuid references public.teams(id) on delete cascade;

-- ─── 9. Data migration ─────────────────────────────────────────────────────

-- Mark what each organization actually is.
update public.schools set kind = 'school' where code in ('bhs','abc');
update public.schools set kind = 'club'   where code = 'vhs';

-- Diagnostics cruft from the admin panel. No dependent rows.
delete from public.schools where code like 'diag\_%';

-- Beaumont's existing squad becomes Varsity, and it is what the public sees.
insert into public.teams (school_id, name, season, is_public_default)
values ('7ebbe980-b87e-421f-a11f-788ca2519504', 'Varsity', '2026', true)
on conflict (school_id, name) do nothing;

-- Every existing player joins it, carrying their per-team data across unchanged.
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
```

- [ ] **Step 2: Write `0006_drop_player_team_columns.sql`**

```sql
-- supabase/migrations/0006_drop_player_team_columns.sql
--
-- MIGRATION B OF TWO. Apply ONLY after 0005 is applied, the application change
-- is deployed, and the runbook's checks pass. This file destroys data: the
-- columns it drops are the originals that 0005 copied into team_players.
--
-- Before running, confirm the copy is good:
--   select count(*) from public.team_players;   -- expect 11
--   select count(*) from public.players;        -- expect 11
--
-- Rollback: there is none. Re-add the columns and restore from a backup.
-- That asymmetry is why this is a separate file rather than the tail of 0005.

alter table public.players
  drop column if exists number,
  drop column if exists position,
  drop column if exists season_stats,
  drop column if exists ratings,
  drop column if exists matrix_stats,
  drop column if exists school_id;

alter table public.schedule    drop column if exists school_id;
alter table public.matrix_logs drop column if exists school_id;
```

- [ ] **Step 3: Read both files against this checklist and fix what fails**

1. Every `$$` block opens and closes.
2. `0005` contains no `drop column` and no `delete from` other than the `diag\_%` cleanup.
3. `team_players` has all three of: the composite FK, `unique (team_id, player_id)`, `unique (school_id, player_id)`.
4. No new table is added to the loop in `supabase_migration_auth.sql` — that file is not modified at all.
5. `matrix_standings` carries `with (security_invoker = true)`.
6. `current_profile_role()` returns `'guest'` when status is not `'active'`.
7. The `union all`'s second branch swaps `w` and `l` (an inversion here reverses every recorded result).

- [ ] **Step 4: Write the runbook**

Create `docs/runbooks/2026-08-30-multi-team-runbook.md` covering, in order: the apply sequence with the deploy step between the two migrations and what goes wrong if it is skipped; then these eight checks, each with its failure symptom:

1. `insert into team_players` for a player already on another team **in the same school** → must fail on `unique (school_id, player_id)`. *Symptom if it succeeds: the one-team-per-organization rule is not enforced and rosters will diverge.*
2. The same player into a team in a **different** school → must succeed.
3. A `team_players` row whose `school_id` disagrees with its team's → must fail on the composite FK.
4. `select count(*) from public.team_players;` → **11**, and each row's `number`, `season_stats` and `ratings` match the corresponding `players` row. *Symptom: any mismatch means do not apply 0006.*
5. As a coach of team A: update a `team_players` row of team A (succeeds) and of team B (no rows affected). *Symptom if B succeeds: `is_team_coach` is not gating writes.*
6. As a non-admin coach: `insert into team_coaches` → no rows.
7. `select public.current_profile_role();` under a profile with `status='rejected'` → `'guest'`.
8. `select * from public.matrix_standings;` → runs without error, returns zero rows (no results logged yet).

- [ ] **Step 5: Verify nothing else broke and commit**

```bash
npm test && npm run typecheck && npm run build
git add supabase/migrations/0005_multi_team_schema.sql supabase/migrations/0006_drop_player_team_columns.sql docs/runbooks/2026-08-30-multi-team-runbook.md
git commit -m "feat: teams, memberships and team-scoped permissions"
```

---

## Task 2: Team-scoped service layer

**Files:**
- Modify: `src/data/supabase.ts`
- Modify: `src/globals.d.ts`
- Create: `src/data/team-scope.test.ts`

**Interfaces:**
- Consumes: the tables from Task 1.
- Produces, on `supabaseService`:
  - `fetchTeamsForViewer(): Promise<Record<string, any>[] | null>` — teams the current viewer may switch between, each `{ id, school_id, name, season, is_public_default, school_name, school_kind }`, ordered by school name then team name.
  - `fetchPublicDefaultTeamId(): Promise<string | null>`
  - `fetchTeamRoster(teamId: string): Promise<Record<string, any>[] | null>` — `team_players` joined to `players`.
  - `fetchSchedule(teamId: string)`, `upsertMatch(teamId, match)`, `fetchMatrixStandings(teamId)`, `fetchMatrixLogs(teamId)`, `logMatrixResult(teamId, result)`, `updateMatrixResult(id, result)`
  - `upsertPlayerIdentity(player)` and `upsertTeamMembership(teamId, schoolId, membership)`
  - `searchPlayersByName(query: string)` — used by Task 5's search-first flow.
- Task 3 calls all of these; Task 5 calls `searchPlayersByName`.

Leave every Phase 2 fetch alone: `fetchPracticePlans`, `fetchDrillsBank`, `fetchDailyThoughts`, `fetchSoccerCategories`, `fetchCoaches` and their writers stay school-scoped.

- [ ] **Step 1: Write the failing test**

Create `src/data/team-scope.test.ts`:

```ts
/**
 * The service's network calls are not mocked here — the existing suites do not
 * mock Supabase either, and a mocked query only asserts the mock. What is worth
 * testing is the pure decision that picks which team a viewer sees, because
 * getting it wrong shows one team's roster under another team's name.
 */
import { describe, it, expect } from 'vitest';
import { resolveActiveTeam } from './team-scope';

const teams = [
  { id: 't-varsity', name: 'Varsity', school_id: 's-bhs', is_public_default: true },
  { id: 't-jv',      name: 'JV',      school_id: 's-bhs', is_public_default: false },
  { id: 't-club',    name: 'U16',     school_id: 's-rev', is_public_default: false }
];

describe('resolveActiveTeam', () => {
  it('uses the stored team when the viewer still has access to it', () => {
    expect(resolveActiveTeam(teams, 't-jv', 't-varsity')).toBe('t-jv');
  });

  it('ignores a stored team the viewer can no longer see', () => {
    // A coach removed from a team must not keep seeing it because localStorage
    // remembers it.
    expect(resolveActiveTeam(teams, 't-gone', 't-varsity')).toBe('t-varsity');
  });

  it('falls back to the public default when nothing is stored', () => {
    expect(resolveActiveTeam(teams, null, 't-varsity')).toBe('t-varsity');
  });

  it('falls back to the first available team when there is no public default', () => {
    expect(resolveActiveTeam(teams, null, null)).toBe('t-varsity');
  });

  it('returns null when the viewer has no teams at all', () => {
    expect(resolveActiveTeam([], 't-jv', null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./team-scope`.

- [ ] **Step 3: Create the resolver**

Create `src/data/team-scope.ts`:

```ts
/**
 * Decides which team a viewer is looking at.
 *
 * Kept separate from the service so it is testable without a database, and
 * because it is the one piece of this feature whose failure is silent: showing
 * one team's roster under another team's name looks like data corruption
 * rather than a scoping bug.
 */
export interface TeamLike {
  id: string;
  name?: string;
  school_id?: string;
  is_public_default?: boolean;
}

export function resolveActiveTeam(
  available: TeamLike[],
  storedId: string | null,
  publicDefaultId: string | null
): string | null {
  const teams = available || [];
  if (teams.length === 0) return null;

  // A stored id is only honoured while the viewer still has access — a coach
  // removed from a team must not keep seeing it because localStorage remembers.
  if (storedId && teams.some((t) => t.id === storedId)) return storedId;

  if (publicDefaultId && teams.some((t) => t.id === publicDefaultId)) return publicDefaultId;

  const flagged = teams.find((t) => t.is_public_default);
  return flagged ? flagged.id : teams[0].id;
}
```

- [ ] **Step 4: Run the test**

Run: `npm test`
Expected: PASS — 66 tests across 8 files.

- [ ] **Step 5: Add the service methods**

In `src/data/supabase.ts`, add these alongside the existing fetches. Follow the file's established shape: guard on `isConfigured()` before touching `this.client!`, `console.warn` on error, return `null` for fetches and `{ ok, error }` for writes that RLS can silently refuse.

```ts
  /** Teams the current viewer may switch between: their own if signed in, else the public default. */
  async fetchTeamsForViewer(): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    try {
      const { data: session } = await this.client!.auth.getSession();
      const uid = session?.session?.user?.id;

      let ids: string[] | null = null;
      if (uid) {
        // team_coaches.profile_id IS the auth uid, but team_players.player_id
        // references players(id) — a different table. The link between a signed-in
        // person and their player row is profiles.player_id, so it has to be
        // resolved first. Comparing uid to player_id directly never matches, and
        // the failure is silent: the player just sees the public default team.
        const { data: prof } = await this.client!
          .from('profiles').select('player_id').eq('id', uid).maybeSingle();
        const playerId = prof?.player_id || null;

        const [{ data: coached }, { data: played }] = await Promise.all([
          this.client!.from('team_coaches').select('team_id').eq('profile_id', uid),
          playerId
            ? this.client!.from('team_players').select('team_id').eq('player_id', playerId)
            : Promise.resolve({ data: [] as any[] })
        ]);
        const merged = [...(coached || []), ...(played || [])].map((r: any) => r.team_id);
        if (merged.length > 0) ids = Array.from(new Set(merged));
      }

      let q = this.client!
        .from('teams')
        .select('id, school_id, name, season, is_public_default, schools(name, kind)')
        .eq('is_deleted', false);
      // No membership: a signed-out visitor, or someone on no team. Both see
      // the public default rather than an empty app.
      if (ids) q = q.in('id', ids); else q = q.eq('is_public_default', true);

      const { data, error } = await q;
      if (error) { console.warn('Supabase fetchTeamsForViewer notice:', error.message); return null; }
      return (data || []).map((t: any) => ({
        id: t.id, school_id: t.school_id, name: t.name, season: t.season,
        is_public_default: t.is_public_default,
        school_name: t.schools?.name || '', school_kind: t.schools?.kind || 'school'
      })).sort((a, b) => (a.school_name + a.name).localeCompare(b.school_name + b.name));
    } catch (e) {
      console.warn('Supabase fetchTeamsForViewer exception:', e);
      return null;
    }
  }

  async fetchTeamRoster(teamId: string): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured() || !teamId) return null;
    const { data, error } = await this.client!
      .from('team_players')
      .select('id, team_id, school_id, number, position, season_stats, ratings, is_deleted, players(id, name, class_year, height, photo_url)')
      .eq('team_id', teamId)
      .eq('is_deleted', false);
    if (error) { console.warn('Supabase fetchTeamRoster notice:', error.message); return null; }
    return data;
  }

  /** Name search for the add-player flow, so a second team reuses an existing person. */
  async searchPlayersByName(query: string): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    const q = String(query || '').trim();
    if (q.length < 2) return [];
    const { data, error } = await this.client!
      .from('players').select('id, name, class_year, photo_url')
      .ilike('name', `%${q}%`).limit(10);
    if (error) { console.warn('Supabase searchPlayersByName notice:', error.message); return null; }
    return data;
  }
```

Add the membership writer too. It returns `{ ok, error }` rather than `null`, matching
`logMatrixResult` in the same file — the expected failure here is a unique-constraint violation
when the player is already on another team in this organization, and that has to come back as a
readable sentence rather than a silent null:

```ts
  /**
   * Puts a player on a team. Returns { ok, error } because the interesting
   * failure is not an outage: unique (school_id, player_id) rejects a player
   * who is already on another team in this same organization, which the design
   * forbids on purpose. The caller shows that message to a coach.
   */
  async upsertTeamMembership(
    teamId: string,
    schoolId: string,
    membership: Record<string, any>
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!teamId || !schoolId) return { ok: false, error: 'No team selected.' };
    try {
      const payload: Record<string, any> = {
        team_id: teamId,
        school_id: schoolId,
        player_id: membership.player_id,
        number: membership.number ?? null,
        position: membership.position ?? null,
        is_deleted: false
      };
      if (membership.season_stats) payload.season_stats = membership.season_stats;
      if (membership.ratings) payload.ratings = membership.ratings;
      if (membership.id && this.isUuid(membership.id)) payload.id = membership.id;

      const { data, error } = await this.client!
        .from('team_players').upsert([payload], { onConflict: 'team_id,player_id' }).select();
      if (error) {
        console.warn('Supabase upsertTeamMembership notice:', error.message);
        // 23505 is the unique violation. Say which rule was hit rather than
        // handing a coach a Postgres error code.
        if (error.code === '23505') {
          return { ok: false, error: 'That player is already on another team in this organization.' };
        }
        return { ok: false, error: error.message };
      }
      // An RLS denial returns no error and no rows, so zero rows is a refusal.
      if (!data || data.length === 0) {
        return { ok: false, error: 'The database refused that change. You must coach this team.' };
      }
      return { ok: true };
    } catch (e: any) {
      console.warn('Supabase upsertTeamMembership exception:', e);
      return { ok: false, error: e?.message || String(e) };
    }
  }
```

Also add `upsertPlayerIdentity(player)` following the same shape as the existing `upsertPlayer`,
writing only `name`, `class_year`, `height` and `photo_url` — the identity columns that survive
`0006`.

Then change these existing methods to take `teamId` and filter on `team_id` instead of resolving a school uuid: `fetchSchedule`, `upsertMatch`, `fetchMatrixStandings`, `fetchMatrixLogs`, `logMatrixResult`. Leave `updateMatrixResult` and `deleteMatrixResult` alone — they address a row by id and need no scope.

- [ ] **Step 6: Declare them on the global**

Add to `SupabaseServiceLike` in `src/globals.d.ts`:

```ts
    fetchTeamsForViewer(): Promise<Record<string, any>[] | null>;
    fetchTeamRoster(teamId: string): Promise<Record<string, any>[] | null>;
    searchPlayersByName(query: string): Promise<Record<string, any>[] | null>;
```

and update the signatures of `fetchSchedule`, `upsertMatch`, `fetchMatrixStandings`, `fetchMatrixLogs` and `logMatrixResult` to take `teamId: string` where they took `schoolId`.

- [ ] **Step 7: Verify and commit**

```bash
npm test && npm run typecheck && npm run build
git add src/data/supabase.ts src/data/team-scope.ts src/globals.d.ts src/data/team-scope.test.ts
git commit -m "feat: team-scoped fetches and active-team resolution"
```

---

## Task 3: Active team in the app core

**Files:**
- Modify: `public/js/app.core.js`

**Interfaces:**
- Consumes: `resolveActiveTeam` (via `window.supabaseService` callers), `fetchTeamsForViewer`, `fetchTeamRoster`, `fetchSchedule(teamId)`, `fetchMatrixStandings(teamId)`, `fetchMatrixLogs(teamId)` from Task 2.
- Produces, on `BHSSoccerApp.prototype`: `this.data.teams` (array), `this.activeTeamId` (string | null), and `setActiveTeam(teamId)`. Task 4's switcher calls `setActiveTeam`.

- [ ] **Step 1: Add the storage key and the setter**

Near the top of `public/js/app.core.js`, beside the other module-level constants:

```js
// Which team the viewer is looking at. A per-device UI preference, so it lives
// in localStorage rather than in profiles — storing it server-side would mean a
// write on every switch.
const ACTIVE_TEAM_KEY = 'bhs_active_team_id';
```

Inside the `Object.assign` block or the class body, matching the file's existing style:

```js
  async setActiveTeam(teamId) {
    if (!teamId || teamId === this.activeTeamId) return;
    this.activeTeamId = teamId;
    try { localStorage.setItem(ACTIVE_TEAM_KEY, teamId); } catch (e) { /* private mode */ }
    await this.syncFromSupabase();
    this.renderCurrentView();
  },
```

- [ ] **Step 2: Resolve the active team at the top of `syncFromSupabase`**

Before any other fetch in `syncFromSupabase()`:

```js
      // Every fetch below is scoped to one team, so resolve it first.
      this.data.teams = (await window.supabaseService.fetchTeamsForViewer()) || [];
      let stored = null;
      try { stored = localStorage.getItem(ACTIVE_TEAM_KEY); } catch (e) { /* private mode */ }
      const publicDefault = (this.data.teams.find(t => t.is_public_default) || {}).id || null;
      this.activeTeamId = window.resolveActiveTeam
        ? window.resolveActiveTeam(this.data.teams, stored, publicDefault)
        : ((this.data.teams[0] || {}).id || null);

      // A viewer with no teams at all is a legitimate state, not an error: an
      // empty roster renders, the switcher hides, and nothing throws.
      if (!this.activeTeamId) {
        this.data.players = [];
        this.data.schedule = [];
        return;
      }
```

`src/main.ts` must expose the resolver for this classic script to reach — add `window.resolveActiveTeam = resolveActiveTeam;` there, importing it from `./data/team-scope`.

- [ ] **Step 3: Rescope the player load**

Replace the `fetchPlayers('bhs')` block. The shape the views consume does not change — number, position, seasonStats and ratings still appear on each player object — they now come from the membership rather than the person:

```js
      const roster = await window.supabaseService.fetchTeamRoster(this.activeTeamId);
      this.data.players = (roster || []).map(m => ({
        id: m.players?.id,
        membershipId: m.id,
        name: m.players?.name,
        classYear: m.players?.class_year,
        height: m.players?.height,
        photo: m.players?.photo_url,
        number: m.number,
        position: m.position,
        seasonStats: m.season_stats || {},
        ratings: m.ratings || {}
      })).filter(p => p.id);
```

Then change the `fetchSchedule`, `fetchMatrixStandings` and `fetchMatrixLogs` calls in the same function to pass `this.activeTeamId` instead of `'bhs'`.

- [ ] **Step 4: Verify and commit**

```bash
node --check public/js/app.core.js
npm test && npm run typecheck && npm run build
git add public/js/app.core.js src/main.ts
git commit -m "feat: resolve and persist the active team"
```

---

## Task 4: The team switcher

**Files:**
- Create: `public/js/views/teamswitcher.view.js`
- Modify: `index.html`
- Modify: `src/data/team-scope.test.ts`

**Interfaces:**
- Consumes: `this.data.teams`, `this.activeTeamId`, `app.setActiveTeam(teamId)` from Task 3.
- Produces: `renderTeamSwitcher()` on the prototype, and the `#teamSwitcherMount` element.

- [ ] **Step 1: Write the failing test**

Append to `src/data/team-scope.test.ts`:

```ts
import switcherSrc from '../../public/js/views/teamswitcher.view.js?raw';
import indexHtml from '../../index.html?raw';

describe('team switcher', () => {
  it('has a mount point in the markup', () => {
    expect(indexHtml).toContain('id="teamSwitcherMount"');
  });

  it('is wired to setActiveTeam, not to a re-render alone', () => {
    expect(switcherSrc).toContain('app.setActiveTeam');
  });

  it('hides itself when the viewer has only one team', () => {
    // A player on one team should not see a control that does nothing.
    expect(switcherSrc).toContain('length < 2');
  });

  it('groups teams by organization', () => {
    expect(switcherSrc).toContain('school_name');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `teamswitcher.view.js`.

- [ ] **Step 3: Write the switcher**

Create `public/js/views/teamswitcher.view.js`:

```js
/**
 * BHS Soccer — Team Switcher
 * Adds renderTeamSwitcher() to BHSSoccerApp.prototype.
 * Must be loaded AFTER js/app.core.js.
 */

Object.assign(BHSSoccerApp.prototype, {

  /**
   * The control that changes which team every view is showing.
   *
   * Hidden for a viewer with fewer than two teams: a player on one team should
   * not see a control that cannot do anything, and a signed-out visitor sees
   * only the public default.
   */
  renderTeamSwitcher() {
    const teams = this.data.teams || [];
    if (teams.length < 2) return '';

    // Grouped by organization, because "Varsity" and "U16" mean little without
    // knowing whose they are.
    const byOrg = new Map();
    teams.forEach(t => {
      const key = t.school_name || 'Team';
      if (!byOrg.has(key)) byOrg.set(key, []);
      byOrg.get(key).push(t);
    });

    const groups = Array.from(byOrg.entries()).map(([org, list]) => `
      <optgroup label="${org}">
        ${list.map(t => `
          <option value="${t.id}" ${t.id === this.activeTeamId ? 'selected' : ''}>
            ${t.name}${t.season ? ' (' + t.season + ')' : ''}
          </option>`).join('')}
      </optgroup>`).join('');

    return `
      <select id="teamSwitcher" class="form-control"
              style="max-width:220px; font-size:0.85rem;"
              onchange="app.setActiveTeam(this.value)"
              title="Switch team">
        ${groups}
      </select>`;
  }

});
```

- [ ] **Step 4: Mount it**

In `index.html`, add the mount point inside the header, next to the nav:

```html
      <div id="teamSwitcherMount"></div>
```

and load the script after `app.core.js`, alongside the other view scripts:

```html
  <script src="./js/views/teamswitcher.view.js"></script>
```

Then in `public/js/app.core.js`, inside `renderCurrentView()` where the other chrome is refreshed, fill the mount:

```js
    const switcherMount = document.getElementById('teamSwitcherMount');
    if (switcherMount) switcherMount.innerHTML = this.renderTeamSwitcher();
```

- [ ] **Step 5: Verify and commit**

```bash
node --check public/js/views/teamswitcher.view.js
node --check public/js/app.core.js
npm test && npm run typecheck && npm run build
git add public/js/views/teamswitcher.view.js index.html public/js/app.core.js src/data/team-scope.test.ts
git commit -m "feat: team switcher grouped by organization"
```

---

## Task 5: Search-first add-player

**Files:**
- Modify: `public/js/views/roster.view.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `searchPlayersByName(query)` from Task 2; `this.activeTeamId` from Task 3.
- Produces: `searchExistingPlayers()` and `addExistingPlayerToTeam(playerId)` on the prototype.

Without this, adding a kid who already plays for another team means retyping their name, which recreates the duplicate-person problem this whole design exists to remove.

- [ ] **Step 1: Add the search field to the add-player modal**

In `index.html`, at the top of the add-player modal's form, above the existing name field:

```html
        <div class="form-group">
          <label>Already in the system?</label>
          <input type="text" id="playerSearchInput" class="form-control"
                 placeholder="Type a name to search existing players"
                 oninput="app.searchExistingPlayers()" />
          <div id="playerSearchResults" style="margin-top:6px;"></div>
          <p class="text-muted" style="font-size:0.78rem; margin:6px 0 0 0;">
            A player who already plays for another team should be added from here,
            not retyped — that keeps one person with one photo across both teams.
          </p>
        </div>
```

- [ ] **Step 2: Add the handlers**

In `public/js/views/roster.view.js`, inside the `Object.assign` block:

```js
  async searchExistingPlayers() {
    const input = document.getElementById('playerSearchInput');
    const out = document.getElementById('playerSearchResults');
    if (!input || !out) return;

    const results = await window.supabaseService.searchPlayersByName(input.value);
    if (!results || results.length === 0) { out.innerHTML = ''; return; }

    // Anyone already on this team is filtered out — adding them again would be
    // rejected by unique (team_id, player_id) and the error would be opaque.
    const onTeam = new Set((this.data.players || []).map(p => p.id));
    const rows = results.filter(r => !onTeam.has(r.id));
    if (rows.length === 0) { out.innerHTML = '<span class="text-muted" style="font-size:0.8rem;">Already on this team.</span>'; return; }

    out.innerHTML = rows.map(r => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; border:1px solid var(--bhs-navy-border); border-radius:6px; margin-bottom:4px;">
        <span>${r.name} <span class="text-muted" style="font-size:0.78rem;">${r.class_year || ''}</span></span>
        <button type="button" class="btn-card-edit" onclick="app.addExistingPlayerToTeam('${r.id}')">Add to this team</button>
      </div>`).join('');
  },

  async addExistingPlayerToTeam(playerId) {
    const team = (this.data.teams || []).find(t => t.id === this.activeTeamId);
    if (!team) return;

    const res = await window.supabaseService.upsertTeamMembership(this.activeTeamId, team.school_id, { player_id: playerId });
    if (!res || res.ok === false) {
      // The likeliest cause is unique (school_id, player_id): they are already
      // on another team in this same organization, which the design forbids.
      window.alert((res && res.error) || 'Could not add that player. They may already be on another team in this organization.');
      return;
    }
    await this.syncFromSupabase();
    this.renderCurrentView();
    this.closeModals();
  },
```

- [ ] **Step 3: Verify and commit**

```bash
node --check public/js/views/roster.view.js
npm test && npm run typecheck && npm run build
git add public/js/views/roster.view.js index.html
git commit -m "feat: add an existing player to a second team by search"
```

---

## Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Record the model**

In the Runtime architecture section, after the data-flow paragraph, add:

```markdown
### Teams

`schools` holds organizations — a school or a club, distinguished by `kind`. `teams` belong to a
school; `team_players` is the membership and carries everything that varies by team (number,
position, season stats, ratings), so `players` is pure identity and one person can appear on a
school team and a club team with separate statistics. `unique (school_id, player_id)` on the
membership enforces one team per organization, and a composite foreign key to `teams (id,
school_id)` stops that column drifting from its team's.

The active team is a per-device preference in `localStorage` under `bhs_active_team_id`, resolved
by `resolveActiveTeam` in `src/data/team-scope.ts`. Writes are team-scoped through
`public.is_team_coach()`; reads stay public. Phase 2 surfaces — practice plans, drills, daily
thoughts, quiz, categories, and the `coaches` display table — are still school-scoped.
```

In the SQL files list, add:

```markdown
5. `supabase/migrations/0005_multi_team_schema.sql` — teams, memberships, team-scoped RLS, and the
   `current_profile_role()` status fix. `0006_drop_player_team_columns.sql` drops the moved columns
   and must be applied only after the application change is deployed and verified.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the team model in CLAUDE.md"
```

---

## Self-Review

**Spec coverage.** Every section maps to a task: `schools.kind`, `teams`, `team_players`,
`team_coaches`, the partial unique index, `is_team_coach()`, the `current_profile_role()` status
fix, the schedule/matrix rescope, the repartitioned view, and the data migration → Task 1;
scope resolution and the four viewer cases → Tasks 2 and 3; the switcher → Task 4; search-first
add-player → Task 5; the eight verification checks → Task 1 step 4; documentation → Task 6.

**Placeholder scan.** No TBD or "add error handling" steps; every code step carries real code.

**Type consistency.** `resolveActiveTeam(available, storedId, publicDefaultId)` is defined in
Task 2 and called in Task 3. `setActiveTeam(teamId)` is defined in Task 3 and called from Task 4's
markup. `fetchTeamRoster` returns `team_players` joined to `players`, which Task 3 maps with
`m.players?.name`. `searchPlayersByName` is defined in Task 2 and called in Task 5.
`ACTIVE_TEAM_KEY` is `'bhs_active_team_id'` in both Task 3 and Task 6's documentation.

**One gap found and closed.** The first draft named `upsertTeamMembership` in Task 2's interfaces
and had Task 5 call it, without ever writing its body — a method referenced by no task that defines
it. Task 2 step 5 now carries the full implementation, including the `23505` branch that turns a
unique-constraint violation into "that player is already on another team in this organization"
rather than a Postgres error code. `upsertPlayerIdentity` is specified in the same step.

**Baseline note.** 61 tests across 7 files on this branch. Task 2 adds 5 and Task 4 adds 4, so the
suite should read 70 by the end. Any implementer seeing 73 at the start is on the wrong branch.
