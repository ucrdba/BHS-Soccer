# Weighted Competitive Matrix Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Score the Competitive Matrix by how much each exercise is worth, and let whole-squad tests — Cooper's, beep, timed tasks, shots out of ten — be recorded at all.

**Architecture:** Weight and measurement type live on the drill (`drills_bank.points`, widened to `numeric`, plus a new `measure` column). Head-to-head 1v1s keep their existing pairings in `matrix_logs`; everything else is entered as a session — one row per player per exercise in two new tables. The `matrix_standings` view unions both sources into `earned` and `available` per player and ranks on the share. All scoring maths stays in SQL; nothing is stored.

**Tech Stack:** Postgres (Supabase) with `security_invoker` views and `percent_rank()`; TypeScript service layer in `src/`; classic browser scripts in `public/js/` assembled onto `BHSSoccerApp.prototype`; Vitest 4 + jsdom.

**Spec:** `docs/superpowers/specs/2026-08-31-weighted-matrix-scoring-design.md`

## Global Constraints

- **The migration is `0009`.** `0008` is the highest applied. `0004` belongs to the parked `feat/google-signin-allowlist` branch and is not on `main` — do not renumber around it.
- **No agent has DDL access.** Every `.sql` file is applied by hand by the user in the Supabase SQL editor. Never claim a migration has been run; never try to run one.
- **Apply the migration BEFORE deploying the code** (corrected during the pre-flight scan; the spec and an earlier draft of this plan said the reverse). Task 4 makes the code *write* `measure`, and Tasks 6-7 write to the two new tables — a write to a column or table that does not exist is a hard PostgREST 400 that breaks drill saving and session recording outright. The read gap the spec worried about does not exist: `fetchMatrixStandings` uses `select('*')` and the Task 3 mapping falls back across both view shapes, so a stale view degrades to zeros. A broken write beats a degraded read. See "Deploy sequence".
- **Never mirror the scoring formula in JavaScript.** This repository's defining hazard is the same logic existing in parallel copies; `CLAUDE.md` warns about it three separate times. The migration's self-check is the test for the maths. Vitest covers only the JavaScript either side of it.
- **Weights are looked up live, never snapshotted.** The view joins `drills_bank` at query time so retuning a weight re-ranks history.
- **Participation floor is 25%**: `greatest(0.25, 1 - percent_rank)`, and it applies **only** to `count_high` and `time_low`. A `win_loss` or `head_to_head` loss earns zero.
- **Outcome factors are 1.0 win / 0.5 draw / 0.0 loss** — not the old 3/1/0.
- **A pairing in `matrix_logs` with no `drill_id` is scored at weight 1.0.**
- `public/js/*.js` are classic scripts — no `import`/`export`. `node --check` is their only syntax gate. Script order in `index.html` is load-bearing.
- **Do not modify `tsconfig.json`.** It does not pick up `@types/node`: tests must avoid `Buffer`, `process`, and `node:` imports. Load classic scripts with Vite's `?raw` plus `new Function`.
- **Do not touch the Record Result modal** (`openAddDrillModal` / `submitMatrixResult` in `public/js/admin.js`). It keeps handling 1v1 pairings, including its stay-open behaviour.
- Four gates, all mandatory before any commit: `npm test`, `npm run typecheck`, `node --check` over `public/js/`, `npm run build`.
- Baseline at plan time: **210 tests across 17 files**, all passing.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0009_weighted_matrix_scoring.sql` | **Create.** Schema, RLS, the rewritten view, and the self-check. |
| `src/data/supabase.ts` | **Modify.** Standings fetch stays `select('*')`; add session and weight methods. |
| `src/globals.d.ts` | **Modify.** Declare the new service methods on `SupabaseServiceLike`. |
| `public/js/app.core.js` | **Modify.** Map the new standings columns onto `player.matrixStats`, tolerating both view shapes. |
| `public/js/views/matrix.view.js` | **Modify.** Standings table columns; buttons opening the two new modals. |
| `public/js/views/matrix-session.view.js` | **Create.** Session grid and exercise-weights editor. New file rather than growing `matrix.view.js`, which is already the leaderboard's home. |
| `public/js/views/planner.view.js` | **Modify.** Relabel the drill points field to "Matrix weight"; add the measure select. |
| `index.html` | **Modify.** Script tag for the new view file, plus the two modal shells. |
| `src/data/matrix-session-entry.test.ts` | **Create.** Session payload building and validation. |
| `src/data/matrix-standings-display.test.ts` | **Create.** The standings mapping and table rendering. |
| `src/data/drill-weight-editor.test.ts` | **Create.** The weights editor. |

---

### Task 1: Migration 0009 — schema, view, and self-check

**Files:**
- Create: `supabase/migrations/0009_weighted_matrix_scoring.sql`

**Interfaces:**
- Consumes: `public.is_team_coach(uuid)` from `0005`; `public.teams`, `public.players`, `public.drills_bank`, `public.matrix_logs`.
- Produces: tables `matrix_sessions` and `matrix_session_results`; columns `drills_bank.points numeric(3,1)` and `drills_bank.measure text`; view `matrix_standings` with columns `team_id, player_id, wins, draws, losses, games, exercises, earned, available, share, rank`.

**This task writes the file. It does NOT apply it.** Applying happens after the code is deployed — see "Deploy sequence".

- [ ] **Step 1: Write the schema section**

```sql
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

-- ─── 1. Weight and measure on the drill ────────────────────────────────────
-- points already exists as INT and is already edited in the drills library.
-- INT cannot hold 2.5, which is the whole point of the widening.

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
```

- [ ] **Step 2: Write the RLS section**

New tables get their own policies. Do **not** add them to the uniform policy loop in `supabase_migration_auth.sql` section 6 — that grants any coach write on any row, and these are team-scoped.

```sql
-- ─── 3. RLS: public read, team-coach write ─────────────────────────────────

alter table public.matrix_sessions        enable row level security;
alter table public.matrix_session_results enable row level security;

grant select, insert, update, delete
  on public.matrix_sessions, public.matrix_session_results
  to anon, authenticated;

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
```

- [ ] **Step 3: Write the view**

```sql
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
         ) as pr
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
```

- [ ] **Step 4: Write the self-check**

The maths lives in SQL and Vitest cannot reach it. This proves it against the spec's worked example at the moment of applying, on the real database, then removes the fixture.

```sql
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
  insert into public.players (id, name) values
    (p_cesar, 'SelfCheck Cesar'), (p_caleb, 'SelfCheck Caleb'), (p_dylan, 'SelfCheck Dylan');

  insert into public.drills_bank (id, school_id, name, duration, category, points, measure) values
    (d_cooper, fx_school, 'SelfCheck Coopers', '12 min', 'Fitness',  1.5, 'count_high'),
    (d_1v1,    fx_school, 'SelfCheck 1v1',     '20 min', 'Technical', 3.0, 'head_to_head'),
    (d_ssg,    fx_school, 'SelfCheck SSG',     '20 min', 'Tactical',  2.5, 'win_loss');

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
```

- [ ] **Step 5: Write the rollback comment block**

```sql
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
```

- [ ] **Step 6: Verify the file parses as SQL and commit**

There is no local Postgres, so the check is a careful read plus balanced `begin`/`commit` and `do $$`/`end $$`.

Run: `grep -c 'begin;' supabase/migrations/0009_weighted_matrix_scoring.sql` — expect `1`
Run: `grep -c 'commit;' supabase/migrations/0009_weighted_matrix_scoring.sql` — expect `1`

```bash
git add supabase/migrations/0009_weighted_matrix_scoring.sql
git commit -m "feat: migration 0009 for weighted matrix scoring"
```

**Verified against the live database while writing this plan:** `public.players`
requires only `id` and `name`; `drills_bank` requires `duration` and `category`;
`schools` requires `mascot`. The fixture above supplies all of them. The matrix
view's entry point is `renderMatrixView()`.

**Note for the implementer:** the spec's worked example gives Caleb 46.4%, computed with him playing one pairing. The fixture above gives him two (a loss and a draw), so his correct value is **47.5%**. The comments show the arithmetic. Do not "fix" this to 46.4 — the fixture, not the spec's illustration, is what the assertion must match.

---

### Task 2: Service layer

**Files:**
- Modify: `src/data/supabase.ts`
- Modify: `src/globals.d.ts`
- Test: `src/data/matrix-session-service.test.ts` (create)

**Interfaces:**
- Consumes: the tables and view from Task 1.
- Produces, on `supabaseService`:
  - `fetchDrillsForWeighting(schoolId: string): Promise<Record<string,any>[] | null>` — `id, name, category, points, measure`
  - `updateDrillWeights(rows: {id: string, points: number, measure: string}[]): Promise<{ok: boolean, error?: string, updated: number}>`
  - `fetchMatrixSessions(teamId: string): Promise<Record<string,any>[] | null>`
  - `saveMatrixSession(teamId: string, session: {id?: string, drillId: string, occurredOn: string, notes?: string}, results: {playerId: string, attendance: string, rawValue?: number|null, outcome?: string|null}[]): Promise<{ok: boolean, error?: string, id?: string}>`
  - `deleteMatrixSession(sessionId: string): Promise<{ok: boolean, error?: string}>`
- `fetchMatrixStandings` keeps its `select('*')` and its signature — **do not change it.** Selecting `*` is why the deploy gap degrades to zeros instead of erroring.

- [ ] **Step 1: Write the failing tests**

Follow the fake-client pattern already established in `src/data/create-school.test.ts` and `src/data/quiz-import.test.ts`.

```ts
/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

let captured: { table: string; op: string; rows?: any[]; }[];
let opError: { code?: string; message: string } | null;
let opRows: Record<string, any>[];

const svc = supabaseService as any;

beforeEach(() => {
  captured = [];
  opError = null;
  opRows = [{ id: 'sess-1' }];
  svc.isConfigured = () => true;
  svc.client = {
    from(table: string) {
      const api: any = {
        insert(rows: any[]) { captured.push({ table, op: 'insert', rows }); return api; },
        upsert(rows: any[]) { captured.push({ table, op: 'upsert', rows }); return api; },
        update(row: any)    { captured.push({ table, op: 'update', rows: [row] }); return api; },
        delete()            { captured.push({ table, op: 'delete' }); return api; },
        select()            { return api; },
        eq()                { return api; },
        in()                { return api; },
        order()             { return api; },
        then(res: any)      { return Promise.resolve({ data: opError ? null : opRows, error: opError }).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('saveMatrixSession', () => {
  it('refuses a session with no drill, which cannot be scored', async () => {
    const res = await supabaseService.saveMatrixSession('t1', { drillId: '', occurredOn: '2026-08-31' }, []);
    expect(res.ok).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it('refuses a present player with neither a value nor an outcome', async () => {
    // Storing this would put the full weight into `available` while
    // contributing nothing to `earned` — scoring them as though they failed.
    const res = await supabaseService.saveMatrixSession(
      't1', { drillId: 'd1', occurredOn: '2026-08-31' },
      [{ playerId: 'p1', attendance: 'present', rawValue: null, outcome: null }]
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('p1');
    expect(captured).toHaveLength(0);
  });

  it('allows an absent player to supply nothing', async () => {
    const res = await supabaseService.saveMatrixSession(
      't1', { drillId: 'd1', occurredOn: '2026-08-31' },
      [{ playerId: 'p1', attendance: 'excused', rawValue: null, outcome: null }]
    );
    expect(res.ok).toBe(true);
  });

  it('writes the session before its results', async () => {
    await supabaseService.saveMatrixSession(
      't1', { drillId: 'd1', occurredOn: '2026-08-31' },
      [{ playerId: 'p1', attendance: 'present', rawValue: 2800 }]
    );
    expect(captured[0].table).toBe('matrix_sessions');
    expect(captured[1].table).toBe('matrix_session_results');
  });

  it('refuses a session against a head-to-head drill', async () => {
    // Those are entered as pairings in the Record Result modal. Allowing both
    // routes for one drill would let the same day be counted twice. The picker
    // filters them out, but the save path must refuse them too — the spec is
    // explicit that this cannot rely on the UI.
    opRows = [{ id: 'd1', measure: 'head_to_head' }];
    const res = await supabaseService.saveMatrixSession(
      't1', { drillId: 'd1', occurredOn: '2026-08-31' },
      [{ playerId: 'p1', attendance: 'present', rawValue: 1 }]
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('pairing');
    expect(captured.some(c => c.table === 'matrix_sessions')).toBe(false);
  });

  it('reports an RLS refusal rather than claiming success', async () => {
    opRows = [];
    const res = await supabaseService.saveMatrixSession(
      't1', { drillId: 'd1', occurredOn: '2026-08-31' },
      [{ playerId: 'p1', attendance: 'present', rawValue: 1 }]
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('coach');
  });
});

describe('updateDrillWeights', () => {
  it('refuses a weight outside a sane range', async () => {
    const res = await supabaseService.updateDrillWeights([{ id: 'd1', points: 99, measure: 'count_high' }]);
    expect(res.ok).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it('refuses a measure the CHECK constraint would reject', async () => {
    const res = await supabaseService.updateDrillWeights([{ id: 'd1', points: 3, measure: 'vibes' }]);
    expect(res.ok).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it('accepts a fractional weight, which is the point of the widening', async () => {
    const res = await supabaseService.updateDrillWeights([{ id: 'd1', points: 2.5, measure: 'win_loss' }]);
    expect(res.ok).toBe(true);
    expect(captured[0].rows![0].points).toBe(2.5);
  });
});

describe('deleteMatrixSession', () => {
  it('soft-deletes rather than removing the row', async () => {
    await supabaseService.deleteMatrixSession('sess-1');
    expect(captured[0].op).toBe('update');
    expect(captured[0].rows![0].is_deleted).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/data/matrix-session-service.test.ts`
Expected: FAIL — `supabaseService.saveMatrixSession is not a function`

- [ ] **Step 3: Implement the methods**

Add to `src/data/supabase.ts`, above `upsertSoccerCategory`:

```ts
  private static readonly MEASURES = ['head_to_head', 'win_loss', 'count_high', 'time_low'];

  async fetchDrillsForWeighting(schoolId: string = 'bhs'): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    const schoolUuid = await this.getSchoolUuid(schoolId);
    if (!schoolUuid) return null;
    const { data, error } = await this.client!
      .from('drills_bank')
      .select('id, name, category, points, measure')
      .eq('school_id', schoolUuid)
      .eq('is_deleted', false)
      .order('name', { ascending: true });
    if (error) { console.warn('Supabase fetchDrillsForWeighting notice:', error.message); return null; }
    return data;
  }

  /**
   * Save a batch of drill weights. Validated here rather than relying on the
   * CHECK constraint so a bad row is named in words instead of surfacing as a
   * raw constraint violation half way through the batch.
   */
  async updateDrillWeights(
    rows: { id: string; points: number; measure: string }[]
  ): Promise<{ ok: boolean; error?: string; updated: number }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.', updated: 0 };
    const list = rows || [];
    if (list.length === 0) return { ok: true, updated: 0 };

    for (const r of list) {
      const n = Number(r.points);
      if (!Number.isFinite(n) || n < 0 || n > 10) {
        return { ok: false, error: `Weight for drill ${r.id} must be between 0 and 10.`, updated: 0 };
      }
      if (!SupabaseService.MEASURES.includes(r.measure)) {
        return { ok: false, error: `"${r.measure}" is not a measurement type.`, updated: 0 };
      }
    }

    let updated = 0;
    for (const r of list) {
      const { data, error } = await this.client!
        .from('drills_bank')
        .update({ points: Number(r.points), measure: r.measure })
        .eq('id', r.id)
        .select();
      if (error) { console.warn('Supabase updateDrillWeights notice:', error.message); return { ok: false, error: error.message, updated }; }
      if (!data || data.length === 0) {
        return { ok: false, error: 'The database refused that write. Coach or admin access is required.', updated };
      }
      updated++;
    }
    return { ok: true, updated };
  }

  async fetchMatrixSessions(teamId: string): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured() || !teamId) return null;
    const { data, error } = await this.client!
      .from('matrix_sessions')
      .select('id, drill_id, occurred_on, notes, drills_bank(name, points, measure)')
      .eq('team_id', teamId)
      .eq('is_deleted', false)
      .order('occurred_on', { ascending: false });
    if (error) { console.warn('Supabase fetchMatrixSessions notice:', error.message); return null; }
    return data;
  }

  /**
   * Write one session and every result in it.
   *
   * A present player must supply a result: storing a present row with neither a
   * value nor an outcome puts the drill's full weight into `available` while
   * contributing nothing to `earned`, which scores them as though they had
   * failed rather than as a gap in data entry.
   */
  async saveMatrixSession(
    teamId: string,
    session: { id?: string; drillId: string; occurredOn: string; notes?: string },
    results: { playerId: string; attendance: string; rawValue?: number | null; outcome?: string | null }[]
  ): Promise<{ ok: boolean; error?: string; id?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!teamId) return { ok: false, error: 'No team selected.' };
    if (!session?.drillId) return { ok: false, error: 'Pick the exercise this session was.' };
    if (!session?.occurredOn) return { ok: false, error: 'Pick the date this session happened.' };

    for (const r of results || []) {
      if (r.attendance !== 'present') continue;
      const hasValue = r.rawValue !== null && r.rawValue !== undefined && Number.isFinite(Number(r.rawValue));
      const hasOutcome = !!r.outcome;
      if (!hasValue && !hasOutcome) {
        return { ok: false, error: `${r.playerId} is marked present but has no result. Enter one, or mark them absent.` };
      }
    }

    // The drill decides how the session is scored, so a head_to_head drill has
    // no session shape at all. Checked here rather than trusting the picker:
    // the same day's competition must not be countable twice.
    const { data: dRows } = await this.client!
      .from('drills_bank').select('measure').eq('id', session.drillId).limit(1);
    const measure = dRows && dRows[0] ? dRows[0].measure : null;
    if (measure === 'head_to_head') {
      return { ok: false, error: 'That exercise is recorded as 1v1 pairings, not as a session. Use Record Result instead.' };
    }

    const sessionRow: Record<string, any> = {
      team_id: teamId, drill_id: session.drillId,
      occurred_on: session.occurredOn, notes: session.notes || null, is_deleted: false
    };
    if (session.id && this.isUuid(session.id)) sessionRow.id = session.id;

    const { data: sData, error: sErr } = await this.client!
      .from('matrix_sessions').upsert([sessionRow]).select();
    if (sErr) { console.warn('Supabase saveMatrixSession notice:', sErr.message); return { ok: false, error: sErr.message }; }
    if (!sData || sData.length === 0) {
      return { ok: false, error: 'The database refused that write. Only a coach of this team can record sessions.' };
    }

    const sessionId = sData[0].id;
    const rows = (results || []).map(r => ({
      session_id: sessionId,
      player_id: r.playerId,
      attendance: r.attendance,
      raw_value: r.attendance === 'present' && r.rawValue !== null && r.rawValue !== undefined
        ? Number(r.rawValue) : null,
      outcome: r.attendance === 'present' ? (r.outcome || null) : null
    }));

    if (rows.length) {
      const { data: rData, error: rErr } = await this.client!
        .from('matrix_session_results')
        .upsert(rows, { onConflict: 'session_id,player_id' })
        .select();
      if (rErr) { console.warn('Supabase saveMatrixSession results notice:', rErr.message); return { ok: false, error: rErr.message }; }
      if (!rData || rData.length === 0) {
        return { ok: false, error: 'The session saved but its results were refused. Check coach access for this team.' };
      }
    }
    return { ok: true, id: sessionId };
  }

  async deleteMatrixSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    const { data, error } = await this.client!
      .from('matrix_sessions').update({ is_deleted: true }).eq('id', sessionId).select();
    if (error) { console.warn('Supabase deleteMatrixSession notice:', error.message); return { ok: false, error: error.message }; }
    if (!data || data.length === 0) {
      return { ok: false, error: 'The database refused that. Only a coach of this team can delete a session.' };
    }
    return { ok: true };
  }
```

- [ ] **Step 4: Declare the methods in `src/globals.d.ts`**

Add inside the `SupabaseServiceLike` interface, beside `upsertQuizQuestion`:

```ts
    fetchDrillsForWeighting(schoolId?: string): Promise<Record<string, any>[] | null>;
    updateDrillWeights(rows: { id: string; points: number; measure: string }[]):
      Promise<{ ok: boolean; error?: string; updated: number }>;
    fetchMatrixSessions(teamId: string): Promise<Record<string, any>[] | null>;
    saveMatrixSession(
      teamId: string,
      session: { id?: string; drillId: string; occurredOn: string; notes?: string },
      results: { playerId: string; attendance: string; rawValue?: number | null; outcome?: string | null }[]
    ): Promise<{ ok: boolean; error?: string; id?: string }>;
    deleteMatrixSession(sessionId: string): Promise<{ ok: boolean; error?: string }>;
```

- [ ] **Step 5: Run all four gates**

```bash
npx vitest run src/data/matrix-session-service.test.ts   # expect PASS
npm test          # expect 210 + new, 0 failures
npm run typecheck # expect clean
npm run build     # expect clean
```

- [ ] **Step 6: Commit**

```bash
git add src/data/supabase.ts src/globals.d.ts src/data/matrix-session-service.test.ts
git commit -m "feat: service methods for matrix sessions and drill weights"
```

---

### Task 3: Standings mapping and table

**Files:**
- Modify: `public/js/app.core.js` (the `matrixStats` block, around lines 368-382)
- Modify: `public/js/views/matrix.view.js` (the standings `<thead>` and row map, lines 100-152)
- Test: `src/data/matrix-standings-display.test.ts` (create)

**Interfaces:**
- Consumes: `fetchMatrixStandings` (unchanged, `select('*')`).
- Produces: `player.matrixStats` with `{wins, draws, losses, games, exercises, earned, available, share, rank}`.

**This task is what makes the deploy gap harmless.** The mapping must read the new columns and fall back to the old ones, so it renders correctly against either view shape.

- [ ] **Step 1: Write the failing tests**

```ts
/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from 'vitest';
import appCoreSrc from '../../public/js/app.core.js?raw';
import matrixSrc from '../../public/js/views/matrix.view.js?raw';

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

interface MatrixApp {
  data: Record<string, any>;
  renderMatrixView(): string;
}

let app: MatrixApp;

beforeEach(() => {
  const w = globalThis as any;
  w.auth = {
    isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
    canAccessRatings: () => true, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'admin', status: 'active' }),
    getRole: () => 'admin'
  };
  w.can = () => true;
  w.supabaseService = { isConfigured: () => false };

  const ctor = new Function(
    [strip(appCoreSrc), strip(matrixSrc)].join('\n;\n') + '\nreturn BHSSoccerApp;'
  )() as { prototype: MatrixApp };
  app = Object.create(ctor.prototype) as MatrixApp;
  app.data = { players: [], matrixLogs: [], drillsBank: [] };
  (app as any).renderMatrixResultsPanel = () => '';
  (app as any).activeTeamLabel = () => 'Varsity';
});

describe('standings table', () => {
  it('shows share, points, available and exercises', () => {
    app.data.players = [{
      id: 'p1', name: 'Cesar Alva', number: 9,
      matrixStats: { wins: 1, draws: 0, losses: 0, games: 1, exercises: 3, earned: 7, available: 7, share: 100, rank: 1 }
    }];
    const html = app.renderMatrixView();
    expect(html).toContain('SHARE');
    expect(html).toContain('AVAIL');
    expect(html).toContain('100.0%');
    expect(html).toContain('7');
  });

  it('shows a dash for a player with nothing scored', () => {
    // share is null when available is zero. Rendering "NaN%" is the failure
    // this replaces.
    app.data.players = [{
      id: 'p1', name: 'New Kid', number: 2,
      matrixStats: { wins: 0, draws: 0, losses: 0, games: 0, exercises: 0, earned: 0, available: 0, share: null, rank: 99 }
    }];
    const html = app.renderMatrixView();
    expect(html).not.toContain('NaN');
    expect(html).toContain('&mdash;');
  });

  it('orders by rank', () => {
    app.data.players = [
      { id: 'p2', name: 'Second', matrixStats: { share: 50, rank: 2, games: 1, exercises: 1, earned: 1, available: 2, wins: 0, draws: 0, losses: 1 } },
      { id: 'p1', name: 'First',  matrixStats: { share: 90, rank: 1, games: 1, exercises: 1, earned: 9, available: 10, wins: 1, draws: 0, losses: 0 } }
    ];
    const html = app.renderMatrixView();
    expect(html.indexOf('First')).toBeLessThan(html.indexOf('Second'));
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/data/matrix-standings-display.test.ts`
Expected: FAIL — the table has no `SHARE` column yet.

- [ ] **Step 3: Update the mapping in `public/js/app.core.js`**

Replace the `p.matrixStats = s ? {...} : {...}` assignment with:

```js
        this.data.players.forEach(p => {
          const s = standingsById.get(p.id);
          // Reads the new columns and falls back to the old ones. The view is
          // rewritten by migration 0009, and this code deploys BEFORE that is
          // applied — so for a short window it is reading the old shape. The
          // fallback is what makes that window render zeros rather than
          // `undefined`, and it costs one `??` per field.
          p.matrixStats = s
            ? {
                wins: s.wins || 0, draws: s.draws || 0, losses: s.losses || 0,
                games: s.games || 0,
                exercises: s.exercises ?? s.games ?? 0,
                earned: Number(s.earned ?? s.points ?? 0),
                available: Number(s.available ?? 0),
                share: (s.share ?? s.win_pct) === null || (s.share ?? s.win_pct) === undefined
                  ? null : Number(s.share ?? s.win_pct),
                rank: s.rank
              }
            : { wins: 0, draws: 0, losses: 0, games: 0, exercises: 0,
                earned: 0, available: 0, share: null, rank: unrankedFrom };
        });
```

- [ ] **Step 4: Update the table in `public/js/views/matrix.view.js`**

Header — replace the `PTS` and `%` cells:

```html
                  <th>RANK</th>
                  <th>PLAYER</th>
                  <th>EX</th>
                  <th>W-D-L</th>
                  <th>PTS</th>
                  <th>AVAIL</th>
                  <th>SHARE</th>
```

Row map — replace the `const ms` / `const m` block and the cells after PLAYER:

```js
                    const ms = p.matrixStats || {};
                    const m = {
                      wins: ms.wins || 0, draws: ms.draws || 0, losses: ms.losses || 0,
                      games: ms.games || 0, exercises: ms.exercises || 0,
                      earned: Number(ms.earned || 0), available: Number(ms.available || 0),
                      share: (ms.share === undefined ? null : ms.share),
                      rank: ms.rank || 999
                    };
                    // The bar is share, not points: ranking is on share, so a
                    // bar drawn from totals would disagree with the ordering.
                    const barPct = m.share === null ? 0 : Math.round(m.share);
```

and the cells:

```html
                    <td>${m.exercises}</td>
                    <td>${m.wins} - ${m.draws} - ${m.losses}</td>
                    <td><strong>${m.earned.toFixed(2)}</strong></td>
                    <td class="text-muted">${m.available.toFixed(2)}</td>
                    <td>
                      ${m.share === null ? '<span class="text-muted">&mdash;</span>' : m.share.toFixed(1) + '%'}
                      <div class="score-progress">
                        <div class="score-bar" style="width: ${barPct}%;"></div>
                      </div>
                    </td>
```

Also replace the `leaderPts` hoist, which is no longer used:

```js
                  // Ranking is on share, which is already a percentage, so the
                  // bar needs no leader to scale against.
```

Change the empty-rank guard from `m.games === 0` to `m.exercises === 0`.

- [ ] **Step 5: Run all four gates**

```bash
npx vitest run src/data/matrix-standings-display.test.ts   # expect PASS
npm test
npm run typecheck
node --check public/js/app.core.js
node --check public/js/views/matrix.view.js
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add public/js/app.core.js public/js/views/matrix.view.js src/data/matrix-standings-display.test.ts
git commit -m "feat: standings table shows earned, available and share"
```

---

### Task 4: Matrix weight and measure on the drills library form

**Files:**
- Modify: `public/js/views/planner.view.js` (around lines 1863, 1905, 1977)
- Test: `src/data/drill-weight-editor.test.ts` (create — the measure-select half)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `drillObj.measure` on the object `upsertDrill` writes.

- [ ] **Step 1: Find the three sites**

Run: `grep -n "masterDrillFormPoints\|d.points\|drillObj.points" public/js/views/planner.view.js`

Expected: the badge render (`⭐ ${d.points || 3} Pts`), the form prefill, and the save.

- [ ] **Step 2: Write the failing test**

```ts
/// <reference types="vite/client" />
// beforeEach is imported now because Task 5 appends a suite to this file that
// needs it. Adding it later means editing the import line mid-task.
import { describe, it, expect, beforeEach } from 'vitest';
import plannerSrc from '../../public/js/views/planner.view.js?raw';

describe('drills library weight field', () => {
  it('labels the field as the matrix weight, not bare points', () => {
    // "3 Pts" gives no hint that the number drives matrix scoring.
    expect(plannerSrc).toContain('Matrix weight');
  });

  it('offers a measurement type select with all four values', () => {
    expect(plannerSrc).toContain('masterDrillFormMeasure');
    for (const m of ['head_to_head', 'win_loss', 'count_high', 'time_low']) {
      expect(plannerSrc).toContain(`value="${m}"`);
    }
  });

  it('accepts a fractional weight', () => {
    // The field was type="number" with no step, which rejects 2.5 in some
    // browsers and rounds it in others.
    expect(plannerSrc).toContain('step="0.5"');
  });
});
```

- [ ] **Step 3: Run and watch it fail**

Run: `npx vitest run src/data/drill-weight-editor.test.ts`
Expected: FAIL — `Matrix weight` not found.

- [ ] **Step 4: Update the three sites**

Badge — say what the number is:

```js
              <span class="badge badge-gold">⭐ ${Number(d.points ?? 3)} weight</span>
```

Form — relabel and add `step`, then add the measure select immediately after the points input:

```html
              <label for="masterDrillFormPoints">Matrix weight</label>
              <input type="number" id="masterDrillFormPoints" step="0.5" min="0" max="10" class="form-control" />

              <label for="masterDrillFormMeasure">How it is measured</label>
              <select id="masterDrillFormMeasure" class="form-control">
                <option value="head_to_head">1v1 — recorded as pairings</option>
                <option value="win_loss">Small-sided game — won, drew or lost</option>
                <option value="count_high">Counted, higher is better — laps, level, shots made</option>
                <option value="time_low">Timed, lower is better</option>
              </select>
```

Prefill:

```js
        document.getElementById('masterDrillFormPoints').value = targetDrill.points ?? 3;
        document.getElementById('masterDrillFormMeasure').value = targetDrill.measure || 'head_to_head';
```

Save — read both, and keep the weight fractional:

```js
    const points = parseFloat(document.getElementById('masterDrillFormPoints')?.value);
    drillObj.points = Number.isFinite(points) ? points : 3;
    drillObj.measure = document.getElementById('masterDrillFormMeasure')?.value || 'head_to_head';
```

- [ ] **Step 5: Add `measure` to the drill upsert**

In `src/data/supabase.ts`, find `upsertDrill` and add to its payload:

```ts
      measure: ['head_to_head', 'win_loss', 'count_high', 'time_low'].includes(drillObj.measure)
        ? drillObj.measure : 'head_to_head',
```

- [ ] **Step 6: Run all four gates and commit**

```bash
npx vitest run src/data/drill-weight-editor.test.ts
npm test && npm run typecheck && node --check public/js/views/planner.view.js && npm run build
git add public/js/views/planner.view.js src/data/supabase.ts src/data/drill-weight-editor.test.ts
git commit -m "feat: drills library sets matrix weight and measurement type"
```

---

### Task 5: Exercise weights editor

**Files:**
- Create: `public/js/views/matrix-session.view.js`
- Modify: `index.html` (script tag; weights modal shell)
- Modify: `public/js/views/matrix.view.js` (button to open it)
- Test: extend `src/data/drill-weight-editor.test.ts`

**Interfaces:**
- Consumes: `fetchDrillsForWeighting`, `updateDrillWeights` from Task 2.
- Produces on the prototype: `openWeightsModal()`, `renderWeightsRows()`, `saveWeights()`.

- [ ] **Step 1: Add the script tag to `index.html`**

Immediately **after** `<script src="./js/views/matrix.view.js"></script>` — the class must exist before any prototype extension runs, and this file extends it.

```html
    <script src="./js/views/matrix-session.view.js"></script>
```

- [ ] **Step 2: Add the modal shell to `index.html`**

Beside the other modal overlays:

```html
  <div id="matrixWeightsModal" class="modal-overlay">
    <div class="modal-window">
      <div class="modal-header">
        <h3>⚖️ EXERCISE WEIGHTS</h3>
        <button class="close-btn">&times;</button>
      </div>
      <p class="text-muted" style="font-size:0.85rem;">
        What each exercise is worth in the matrix. Changing a weight re-scores
        every result already recorded against that exercise.
      </p>
      <div id="matrixWeightsRows"></div>
      <div id="matrixWeightsError" style="color:var(--color-danger); font-size:0.85rem; margin-top:8px;"></div>
      <button class="btn btn-gold" style="width:100%; margin-top:10px;" onclick="app.saveWeights()">💾 Save weights</button>
    </div>
  </div>
```

- [ ] **Step 3: Write the failing test**

Append to `src/data/drill-weight-editor.test.ts`:

```ts
import appCoreSrc from '../../public/js/app.core.js?raw';
import sessionSrc from '../../public/js/views/matrix-session.view.js?raw';

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

describe('weights editor', () => {
  let app: any;

  beforeEach(() => {
    const w = globalThis as any;
    w.auth = {
      isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
      canAccessRatings: () => true, subscribe: () => {},
      getCurrentUser: () => ({ id: 'u1', role: 'admin', status: 'active' }),
      getRole: () => 'admin'
    };
    w.can = () => true;
    w.supabaseService = { isConfigured: () => false };
    const ctor = new Function(
      [strip(appCoreSrc), strip(sessionSrc)].join('\n;\n') + '\nreturn BHSSoccerApp;'
    )() as any;
    app = Object.create(ctor.prototype);
    app._weightDrills = [
      { id: 'd1', name: "Cooper's Test", category: 'Fitness', points: 1.5, measure: 'count_high' },
      { id: 'd2', name: '1v1 Gauntlet', category: 'Technical', points: 3, measure: 'head_to_head' }
    ];
  });

  it('lists every drill with its current weight', () => {
    const html = app.renderWeightsRows();
    expect(html).toContain("Cooper's Test");
    expect(html).toContain('value="1.5"');
    expect(html).toContain('1v1 Gauntlet');
  });

  it('preselects each drill\'s measurement type', () => {
    const html = app.renderWeightsRows();
    const cooperBlock = html.slice(html.indexOf('weightMeasure_d1'), html.indexOf('</select>', html.indexOf('weightMeasure_d1')));
    expect(cooperBlock).toContain('value="count_high" selected');
  });

  it('says so when there are no drills to weight', () => {
    // An empty panel reads as "loading". A coach with no drills needs telling
    // to add one first.
    app._weightDrills = [];
    expect(app.renderWeightsRows()).toContain('No exercises');
  });
});
```

- [ ] **Step 4: Run and watch it fail**

Run: `npx vitest run src/data/drill-weight-editor.test.ts`
Expected: FAIL — cannot resolve `matrix-session.view.js`.

- [ ] **Step 5: Create `public/js/views/matrix-session.view.js`**

```js
/**
 * Matrix session entry and exercise weighting.
 *
 * Separate from matrix.view.js, which owns the leaderboard. These are the two
 * write surfaces: what an exercise is worth, and what happened in one.
 *
 * Classic script — no imports. Extends the prototype defined in app.core.js,
 * so index.html must load this AFTER that file.
 */
Object.assign(BHSSoccerApp.prototype, {

  async openWeightsModal() {
    const err = document.getElementById('matrixWeightsError');
    if (err) err.textContent = '';
    if (window.supabaseService?.isConfigured()) {
      this._weightDrills = (await window.supabaseService.fetchDrillsForWeighting('bhs')) || [];
    } else {
      this._weightDrills = this._weightDrills || [];
    }
    const rows = document.getElementById('matrixWeightsRows');
    if (rows) rows.innerHTML = this.renderWeightsRows();
    const modal = document.getElementById('matrixWeightsModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  renderWeightsRows() {
    const drills = this._weightDrills || [];
    if (drills.length === 0) {
      return '<p class="text-muted" style="font-size:0.85rem;">No exercises yet. Add drills in the practice planner first.</p>';
    }
    const measures = [
      ['head_to_head', '1v1 (pairings)'],
      ['win_loss', 'Small-sided (W/D/L)'],
      ['count_high', 'Counted, high wins'],
      ['time_low', 'Timed, low wins']
    ];
    return drills.map(d => `
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
        <span style="flex:1; color:#FFF; font-size:0.85rem;">${d.name}
          <span class="text-muted" style="font-size:0.75rem;">${d.category || ''}</span>
        </span>
        <input type="number" id="weightPoints_${d.id}" class="form-control"
               step="0.5" min="0" max="10" style="max-width:80px; font-size:0.8rem;"
               value="${Number(d.points ?? 3)}" />
        <select id="weightMeasure_${d.id}" class="form-control" style="max-width:190px; font-size:0.8rem;">
          ${measures.map(([v, label]) =>
            `<option value="${v}"${(d.measure || 'head_to_head') === v ? ' selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </div>`).join('');
  },

  async saveWeights() {
    const err = document.getElementById('matrixWeightsError');
    const set = (m, ok = false) => {
      if (!err) return;
      err.textContent = m;
      err.style.color = ok ? 'var(--bhs-cyan-accent)' : 'var(--color-danger)';
    };
    const rows = (this._weightDrills || []).map(d => ({
      id: d.id,
      points: parseFloat(document.getElementById(`weightPoints_${d.id}`)?.value),
      measure: document.getElementById(`weightMeasure_${d.id}`)?.value || 'head_to_head'
    }));
    if (rows.length === 0) return set('Nothing to save.');

    set('Saving…');
    const res = await window.supabaseService.updateDrillWeights(rows);
    if (!res.ok) return set(res.error || 'Could not save those weights.');

    // Weights are looked up live, so every past result is re-scored. Re-sync
    // rather than patch, or the leaderboard on screen contradicts the database.
    await this.syncFromSupabase();
    this.renderCurrentView();
    set(`Saved ${res.updated} exercise${res.updated === 1 ? '' : 's'}. Standings re-scored.`, true);
  }

});
```

- [ ] **Step 6: Add the button in `public/js/views/matrix.view.js`**

Beside the existing coach controls in the matrix view, inside the `isCoach` guard:

```js
              <button class="btn btn-secondary" onclick="app.openWeightsModal()">⚖️ Exercise weights</button>
```

- [ ] **Step 7: Run all four gates and commit**

```bash
npx vitest run src/data/drill-weight-editor.test.ts
npm test && npm run typecheck && node --check public/js/views/matrix-session.view.js && npm run build
git add public/js/views/matrix-session.view.js public/js/views/matrix.view.js index.html src/data/drill-weight-editor.test.ts
git commit -m "feat: exercise weights editor"
```

---

### Task 6: Session grid entry

**Files:**
- Modify: `public/js/views/matrix-session.view.js`
- Modify: `index.html` (session modal shell)
- Modify: `public/js/views/matrix.view.js` (button)
- Test: `src/data/matrix-session-entry.test.ts` (create)

**Interfaces:**
- Consumes: `saveMatrixSession` from Task 2; `this.data.players`, `this.data.drillsBank`, `this.activeTeamId`.
- Produces: `openSessionModal()`, `renderSessionRows()`, `collectSessionResults()`, `saveSession()`.

`collectSessionResults()` returns `{playerId, attendance, rawValue, outcome}[]` read from the DOM — split out from `saveSession` so it can be tested without a service call.

- [ ] **Step 1: Add the modal shell to `index.html`**

```html
  <div id="matrixSessionModal" class="modal-overlay">
    <div class="modal-window">
      <div class="modal-header">
        <h3>📋 RECORD A SESSION</h3>
        <button class="close-btn">&times;</button>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:10px;">
        <div>
          <label for="sessionDrill" style="display:block; font-size:0.7rem; text-transform:uppercase; color:var(--text-muted);">Exercise</label>
          <select id="sessionDrill" class="form-control" style="max-width:260px; font-size:0.8rem;"
                  onchange="app.openSessionModal(this.value)"></select>
        </div>
        <div>
          <label for="sessionDate" style="display:block; font-size:0.7rem; text-transform:uppercase; color:var(--text-muted);">Date</label>
          <input type="date" id="sessionDate" class="form-control" style="max-width:160px; font-size:0.8rem;" />
        </div>
      </div>
      <div id="sessionRows"></div>
      <div id="sessionError" style="color:var(--color-danger); font-size:0.85rem; margin-top:8px;"></div>
      <button class="btn btn-gold" style="width:100%; margin-top:10px;" onclick="app.saveSession()">💾 Save session</button>
    </div>
  </div>
```

- [ ] **Step 2: Write the failing tests**

```ts
/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, vi } from 'vitest';
import appCoreSrc from '../../public/js/app.core.js?raw';
import sessionSrc from '../../public/js/views/matrix-session.view.js?raw';

const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

let app: any;
let saved: any[];
let saveResult: { ok: boolean; error?: string };

beforeEach(() => {
  saved = [];
  saveResult = { ok: true, id: 's1' };
  document.body.innerHTML = `
    <select id="sessionDrill"></select>
    <input id="sessionDate" type="date" />
    <div id="sessionRows"></div>
    <div id="sessionError"></div>
    <div id="matrixSessionModal"></div>`;

  const w = globalThis as any;
  w.auth = {
    isCoach: () => true, isAdmin: () => true, isLoggedIn: () => true,
    canAccessRatings: () => true, subscribe: () => {},
    getCurrentUser: () => ({ id: 'u1', role: 'admin', status: 'active' }),
    getRole: () => 'admin'
  };
  w.can = () => true;
  w.supabaseService = {
    isConfigured: () => true,
    saveMatrixSession: async (t: string, s: any, r: any[]) => { saved.push({ t, s, r }); return saveResult; }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  const ctor = new Function(
    [strip(appCoreSrc), strip(sessionSrc)].join('\n;\n') + '\nreturn BHSSoccerApp;'
  )() as any;
  app = Object.create(ctor.prototype);
  app.activeTeamId = 't1';
  app.syncFromSupabase = async () => {};
  app.renderCurrentView = () => {};
  app.closeModals = () => {};
  app.data = {
    players: [
      { id: 'p1', name: 'Cesar Alva', number: 9 },
      { id: 'p2', name: 'Caleb Carver', number: 10 }
    ],
    drillsBank: [
      { id: 'd1', name: "Cooper's", measure: 'count_high', points: 1.5 },
      { id: 'd2', name: 'SSG', measure: 'win_loss', points: 2.5 },
      { id: 'd3', name: '1v1', measure: 'head_to_head', points: 3 }
    ]
  };
});

describe('session grid', () => {
  it('offers only drills that are recorded as sessions', () => {
    // A head_to_head drill goes through the Record Result modal. Offering it
    // here would let one day's competition be counted twice.
    app._sessionDrillId = 'd1';
    const html = app.renderSessionRows();
    expect(html).toContain('Cesar Alva');
    const opts = app.sessionDrillOptions();
    expect(opts).toContain('d1');
    expect(opts).toContain('d2');
    expect(opts).not.toContain('d3');
  });

  it('asks for a number when the drill is measured', () => {
    app._sessionDrillId = 'd1';
    const html = app.renderSessionRows();
    expect(html).toContain('type="number"');
    expect(html).not.toContain('sessionOutcome_p1');
  });

  it('asks for win, draw or loss when the drill is a small-sided game', () => {
    app._sessionDrillId = 'd2';
    const html = app.renderSessionRows();
    expect(html).toContain('sessionOutcome_p1');
    expect(html).toContain('value="win"');
  });

  it('marks everyone present by default', () => {
    app._sessionDrillId = 'd1';
    document.getElementById('sessionRows')!.innerHTML = app.renderSessionRows();
    const results = app.collectSessionResults();
    expect(results.every((r: any) => r.attendance === 'present')).toBe(true);
  });

  it('reads a value and an absence out of the grid', () => {
    app._sessionDrillId = 'd1';
    document.getElementById('sessionRows')!.innerHTML = app.renderSessionRows();
    (document.getElementById('sessionValue_p1') as HTMLInputElement).value = '2800';
    (document.getElementById('sessionAttend_p2') as HTMLSelectElement).value = 'excused';
    const results = app.collectSessionResults();
    expect(results[0]).toMatchObject({ playerId: 'p1', attendance: 'present', rawValue: 2800 });
    expect(results[1]).toMatchObject({ playerId: 'p2', attendance: 'excused' });
  });

  it('refuses to save with no drill chosen', async () => {
    app._sessionDrillId = '';
    await app.saveSession();
    expect(saved).toHaveLength(0);
    expect(document.getElementById('sessionError')!.textContent).toContain('exercise');
  });

  it('names the player when the service refuses the save', async () => {
    saveResult = { ok: false, error: 'p1 is marked present but has no result.' };
    app._sessionDrillId = 'd1';
    document.getElementById('sessionRows')!.innerHTML = app.renderSessionRows();
    (document.getElementById('sessionDate') as HTMLInputElement).value = '2026-08-31';
    await app.saveSession();
    expect(document.getElementById('sessionError')!.textContent).toContain('p1');
  });

  it('re-syncs after a successful save so the leaderboard moves', async () => {
    // Standings are derived in Postgres; without a re-read the coach records a
    // session and sees nothing change.
    let synced = false;
    app.syncFromSupabase = async () => { synced = true; };
    app._sessionDrillId = 'd1';
    document.getElementById('sessionRows')!.innerHTML = app.renderSessionRows();
    (document.getElementById('sessionDate') as HTMLInputElement).value = '2026-08-31';
    (document.getElementById('sessionValue_p1') as HTMLInputElement).value = '2800';
    (document.getElementById('sessionValue_p2') as HTMLInputElement).value = '2650';
    await app.saveSession();
    expect(synced).toBe(true);
  });
});
```

- [ ] **Step 3: Run and watch it fail**

Run: `npx vitest run src/data/matrix-session-entry.test.ts`
Expected: FAIL — `app.sessionDrillOptions is not a function`

- [ ] **Step 4: Implement, appending to `public/js/views/matrix-session.view.js`**

Add these methods inside the same `Object.assign` block:

```js
  /**
   * Drills that are recorded as a session.
   *
   * head_to_head is deliberately excluded: those are entered as pairings in the
   * Record Result modal, and offering both routes for one drill would let the
   * same day's competition be counted twice.
   */
  sessionDrillOptions() {
    return (this.data.drillsBank || [])
      .filter(d => !d.is_deleted && !d.isDeleted && (d.measure || 'head_to_head') !== 'head_to_head')
      .map(d => `<option value="${d.id}"${this._sessionDrillId === d.id ? ' selected' : ''}>${d.name}</option>`)
      .join('');
  },

  sessionDrill() {
    return (this.data.drillsBank || []).find(d => d.id === this._sessionDrillId) || null;
  },

  async openSessionModal(drillId) {
    this._sessionDrillId = drillId || this._sessionDrillId || '';
    const err = document.getElementById('sessionError');
    if (err) err.textContent = '';

    const picker = document.getElementById('sessionDrill');
    if (picker) {
      picker.innerHTML = '<option value="">— pick an exercise —</option>' + this.sessionDrillOptions();
      picker.value = this._sessionDrillId;
    }
    const when = document.getElementById('sessionDate');
    if (when && !when.value) when.value = new Date().toISOString().slice(0, 10);

    const rows = document.getElementById('sessionRows');
    if (rows) rows.innerHTML = this.renderSessionRows();

    const modal = document.getElementById('matrixSessionModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  renderSessionRows() {
    const drill = this.sessionDrill();
    if (!drill) {
      return '<p class="text-muted" style="font-size:0.85rem;">Pick an exercise to load the squad.</p>';
    }
    const players = (this.data.players || []).filter(p => !p.is_deleted && !p.isDeleted);
    if (players.length === 0) {
      return '<p class="text-muted" style="font-size:0.85rem;">This team has no players yet.</p>';
    }

    const measure = drill.measure || 'count_high';
    const hint = measure === 'time_low' ? 'seconds — lower wins'
               : measure === 'win_loss' ? 'result'
               : 'number — higher wins';

    return `
      <p class="text-muted" style="font-size:0.78rem; margin:0 0 8px 0;">
        ${drill.name} &middot; weight ${Number(drill.points ?? 3)} &middot; ${hint}
      </p>
      ${players.map(p => `
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
          <span style="flex:1; color:#FFF; font-size:0.85rem;">
            ${p.name} <span class="text-muted">#${p.number || '—'}</span>
          </span>
          ${measure === 'win_loss'
            ? `<select id="sessionOutcome_${p.id}" class="form-control" style="max-width:110px; font-size:0.8rem;">
                 <option value="win">Won</option>
                 <option value="draw">Drew</option>
                 <option value="loss">Lost</option>
               </select>`
            : `<input type="number" id="sessionValue_${p.id}" class="form-control" step="any"
                      style="max-width:110px; font-size:0.8rem;" />`}
          <select id="sessionAttend_${p.id}" class="form-control" style="max-width:130px; font-size:0.8rem;">
            <option value="present">Here</option>
            <option value="excused">Excused</option>
            <option value="unexcused">No-show</option>
          </select>
        </div>`).join('')}`;
  },

  /**
   * Read the grid. Split out from saveSession so the DOM reading can be tested
   * without a service call standing in the way.
   */
  collectSessionResults() {
    const drill = this.sessionDrill();
    const measure = drill ? (drill.measure || 'count_high') : 'count_high';
    return (this.data.players || [])
      .filter(p => !p.is_deleted && !p.isDeleted)
      .map(p => {
        const attendance = document.getElementById(`sessionAttend_${p.id}`)?.value || 'present';
        if (measure === 'win_loss') {
          return { playerId: p.id, attendance, rawValue: null,
                   outcome: document.getElementById(`sessionOutcome_${p.id}`)?.value || null };
        }
        const raw = document.getElementById(`sessionValue_${p.id}`)?.value;
        const n = parseFloat(raw);
        return { playerId: p.id, attendance,
                 rawValue: Number.isFinite(n) ? n : null, outcome: null };
      });
  },

  async saveSession() {
    const err = document.getElementById('sessionError');
    const set = (m, ok = false) => {
      if (!err) return;
      err.textContent = m;
      err.style.color = ok ? 'var(--bhs-cyan-accent)' : 'var(--color-danger)';
    };

    if (!this._sessionDrillId) return set('Pick the exercise this session was.');
    const occurredOn = document.getElementById('sessionDate')?.value;
    if (!occurredOn) return set('Pick the date this session happened.');

    set('Saving…');
    const res = await window.supabaseService.saveMatrixSession(
      this.activeTeamId,
      { drillId: this._sessionDrillId, occurredOn },
      this.collectSessionResults()
    );
    if (!res.ok) return set(res.error || 'Could not save that session.');

    // Standings are derived in Postgres, so nothing moves until a re-read.
    await this.syncFromSupabase();
    this.renderCurrentView();
    this.closeModals();
  }
```

- [ ] **Step 5: Add the button in `public/js/views/matrix.view.js`**

Beside the weights button, inside the `isCoach` guard:

```js
              <button class="btn btn-gold" onclick="app.openSessionModal()">📋 Record a session</button>
```

- [ ] **Step 6: Run all four gates and commit**

```bash
npx vitest run src/data/matrix-session-entry.test.ts
npm test && npm run typecheck && node --check public/js/views/matrix-session.view.js && npm run build
git add public/js/views/matrix-session.view.js public/js/views/matrix.view.js index.html src/data/matrix-session-entry.test.ts
git commit -m "feat: session grid for whole-squad matrix entry"
```

---

### Task 7: Recorded sessions list with delete

**Files:**
- Modify: `public/js/views/matrix-session.view.js`
- Modify: `public/js/views/matrix.view.js`
- Test: extend `src/data/matrix-session-entry.test.ts`

**Interfaces:**
- Consumes: `fetchMatrixSessions`, `deleteMatrixSession` from Task 2.
- Produces: `renderSessionHistory()`, `removeSession(id)`.

Editing a past session is out of scope: a mis-entered one is deleted and re-entered. Delete must therefore exist, or a typo is permanent.

- [ ] **Step 1: Write the failing tests**

Append to `src/data/matrix-session-entry.test.ts`:

```ts
describe('session history', () => {
  it('lists recorded sessions newest first', () => {
    app._sessions = [
      { id: 's2', occurred_on: '2026-08-30', drills_bank: { name: "Cooper's" } },
      { id: 's1', occurred_on: '2026-08-20', drills_bank: { name: 'SSG' } }
    ];
    const html = app.renderSessionHistory();
    expect(html.indexOf("Cooper's")).toBeLessThan(html.indexOf('SSG'));
  });

  it('offers delete on each session', () => {
    app._sessions = [{ id: 's1', occurred_on: '2026-08-20', drills_bank: { name: 'SSG' } }];
    expect(app.renderSessionHistory()).toContain("app.removeSession('s1')");
  });

  it('says so when nothing has been recorded', () => {
    app._sessions = [];
    expect(app.renderSessionHistory()).toContain('No sessions');
  });

  it('asks before deleting, naming what will be lost', async () => {
    // Deleting a session removes every result in it and re-ranks the table.
    let asked = '';
    (globalThis as any).confirm = (m: string) => { asked = m; return false; };
    app._sessions = [{ id: 's1', occurred_on: '2026-08-20', drills_bank: { name: 'SSG' } }];
    await app.removeSession('s1');
    expect(asked).toContain('SSG');
    expect(asked).toContain('2026-08-20');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/data/matrix-session-entry.test.ts`
Expected: FAIL — `app.renderSessionHistory is not a function`

- [ ] **Step 3: Implement**

Append to the same `Object.assign` block:

```js
  renderSessionHistory() {
    const sessions = (this._sessions || []).slice()
      .sort((a, b) => String(b.occurred_on).localeCompare(String(a.occurred_on)));
    if (sessions.length === 0) {
      return '<p class="text-muted" style="font-size:0.85rem;">No sessions recorded yet.</p>';
    }
    return sessions.map(s => `
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:4px; font-size:0.8rem;">
        <span style="flex:1; color:#FFF;">${s.drills_bank?.name || 'Exercise'}</span>
        <span class="text-muted">${s.occurred_on}</span>
        <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem;"
                onclick="app.removeSession('${s.id}')">Delete</button>
      </div>`).join('');
  },

  /**
   * Soft-delete a session. Editing one is out of scope, so this is the only
   * correction path — which is exactly why it has to ask first: deleting takes
   * every result in the session with it and re-ranks the table.
   */
  async removeSession(sessionId) {
    const s = (this._sessions || []).find(x => x.id === sessionId);
    if (!s) return;
    const ok = window.confirm(
      `Delete the ${s.drills_bank?.name || 'exercise'} session on ${s.occurred_on}?\n\n` +
      `Every result in it is removed and the standings are re-scored.`
    );
    if (!ok) return;

    const res = await window.supabaseService.deleteMatrixSession(sessionId);
    if (!res.ok) { window.alert(res.error || 'Could not delete that session.'); return; }

    await this.syncFromSupabase();
    this.renderCurrentView();
  }
```

- [ ] **Step 4: Load sessions during sync**

In `public/js/app.core.js`, immediately after the `matrixLogs` fetch inside `syncFromSupabase`:

```js
        // Sessions behind the standings, so a coach can delete a mis-entered
        // one. Same reasoning as keeping matrixLogs in state.
        this._sessions = (await window.supabaseService.fetchMatrixSessions(this.activeTeamId)) || [];
```

- [ ] **Step 5: Render the history in the matrix view**

Inside the `isCoach` guard in `public/js/views/matrix.view.js`, below the results panel:

```js
            ${isCoach ? `<div class="planner-card" style="margin-top:12px;">
              <h3 style="color: var(--bhs-gold-accent); margin-bottom: 12px;">📋 RECORDED SESSIONS</h3>
              ${this.renderSessionHistory()}
            </div>` : ''}
```

- [ ] **Step 6: Run all four gates and commit**

```bash
npx vitest run src/data/matrix-session-entry.test.ts
npm test && npm run typecheck
node --check public/js/views/matrix-session.view.js && node --check public/js/app.core.js && node --check public/js/views/matrix.view.js
npm run build
git add public/js/views/matrix-session.view.js public/js/views/matrix.view.js public/js/app.core.js src/data/matrix-session-entry.test.ts
git commit -m "feat: recorded sessions list with delete"
```

---

## Deploy sequence

**Migration first, code second.** This is the ordinary order, but the spec
argued for the reverse, so it is worth saying why it changed: the new code
*writes* `measure` and writes to two new tables. Against a database without
them, those writes are hard 400s that break drill saving and session recording.
The read gap the spec worried about turned out not to exist.

1. **Hand the user `supabase/migrations/0009_weighted_matrix_scoring.sql`** to run in the Supabase SQL editor. Watch for the `matrix_standings self-check passed.` notice — if it raises instead, the view is wrong and the whole migration rolls back, leaving the database as it was.
2. **Confirm it landed** by querying the view for the new columns:
   ```bash
   curl -s "$URL/rest/v1/matrix_standings?select=share,earned,available&limit=1"      -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
   ```
   A `42703` means the migration has not been applied.
3. **Then merge and push the code.** Vercel deploys from `main`. Confirm with:
   ```bash
   curl -s https://bhs-soccer.vercel.app/js/views/matrix-session.view.js | grep -c renderSessionRows
   ```
   Expect `1` or more. A `404` means the deploy has not finished.
4. **Set the weights.** Every existing drill keeps `points = 3` and gets `measure = 'head_to_head'`, so **nothing changes until the coach opens Exercise weights and sets them.** The migration deliberately does not guess weights or measures from drill names. Say this to the user explicitly — otherwise the feature looks broken on arrival.

Between steps 1 and 3 the deployed (old) code reads a view that has already
been rewritten. Because `fetchMatrixStandings` selects `*` and the old mapping
reads `s.points` / `s.win_pct`, which the new view no longer has, the table
renders zeros rather than erroring. That window closes the moment the code
deploys. The Task 3 mapping's two-shape fallback means the window is harmless
in either direction — it is the *writes* that force the order.

## Verification summary

| Gate | Covers |
| --- | --- |
| `npm test` | The JavaScript: service validation, standings mapping and rendering, weights editor, session grid, history and delete. |
| `npm run typecheck` | `src/` only — never `public/js/`. |
| `node --check` | The classic scripts, including the new `matrix-session.view.js`. |
| `npm run build` | Real module resolution. Mandatory; the only gate that catches an unresolvable import. |
| Migration self-check | **The scoring maths.** This is the only test of the SQL, by design — mirroring the formula in JavaScript would create the parallel copy this repo keeps warning about. |
