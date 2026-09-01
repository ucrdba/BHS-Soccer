# Team-Scoped Practice Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each team its own practice plans and daily message, so Varsity and JV stop sharing one planner, while the drill library stays shared within an organization.

**Architecture:** `practice_plans` and `daily_thoughts` gain a `team_id`; reads and writes move from school scope to team scope; a "Copy to team…" control duplicates a plan or a thought into another team as an independent snapshot. Two migrations rather than one, so no deployed code ever queries a column that has just been dropped.

**Tech Stack:** Postgres (Supabase) with `is_team_coach()` RLS; TypeScript service layer in `src/`; classic browser scripts in `public/js/` assembled onto `BHSSoccerApp.prototype`; Vitest 4 + jsdom.

**Spec:** `docs/superpowers/specs/2026-09-01-team-scoped-planner-design.md`

## Global Constraints

- **Migrations are `0014` and `0015`.** `0013` is the highest applied.
- **No agent has DDL access.** Every `.sql` file is applied by hand by the user in the Supabase SQL editor. Never claim a migration has been run; never try to run one.
- **Every migration needs `set role postgres;` immediately after `begin;`.** The SQL editor may run as a role that is a *member* of postgres without defaulting to it, and `ALTER TABLE` / `CREATE POLICY` check ownership rather than privilege — they fail with `42501: must be owner of table …` otherwise. See the top of `0009`.
- **`supabase_schema.sql` has DRIFTED from the live database.** Verify columns against the running database, never against that file. Three have already been found wrong: `drills_bank.points` and `drills_bank.duration` do not exist; `players.class_year` is NOT NULL and was *not* dropped by `0005`. Prefer `add column if not exists` over `alter column`.
- **`practice_plans` is ONE ROW PER DRILL SLOT**, not one row per plan. A plan is the set of rows sharing a `name`. Copying a plan means duplicating every row with that name.
- **`practice_plans.drill` is a TEXT drill NAME, not a foreign key.** Verified live; the columns are `id, school_id, time_slot, name, duration, drill, coach_notes, diagram_image, diagram_data, is_deleted, created_at`.
- **The quiz is OUT of scope.** Its questions are hardcoded in `planner.view.js` as radio inputs `q1`–`q5`, nothing reads `quiz_questions`, the table is empty and has no `school_id`. The spec explains why.
- `public/js/*.js` are CLASSIC SCRIPTS — no `import`/`export`; they extend `BHSSoccerApp.prototype` via `Object.assign`. `node --check` is their only syntax gate. **Script order in `index.html` is load-bearing.**
- **Do not modify `tsconfig.json`.** It does not pick up `@types/node`: tests must avoid `Buffer`, `process` and `node:` imports. Load classic scripts via Vite's `?raw` plus `new Function`. Loading `public/js/utils.js` in a test requires stubbing `globalThis.SoccerTacticalBoard`.
- **Tests assert the value that reaches the database**, not merely that a call succeeded. Today `fetchDailyThoughts` passed the school CODE `'bhs'` into the `school_id` UUID column; every call failed with `22P02` and the feature was silently dead for months. A test that only checks "no exception" would not have caught it.
- Four gates before every commit: `npm test`, `npm run typecheck`, `node --check` over `public/js/`, `npm run build`.
- Baseline at plan time: **343 tests across 27 files**, all passing.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0014_team_scoped_planner.sql` | **Create.** Adds `team_id`, backfills, RLS, self-check. Leaves `school_id`. |
| `supabase/migrations/0015_drop_planner_school_id.sql` | **Create.** Drops `school_id`. Applied *after* the code deploys. |
| `src/data/supabase.ts` | **Modify.** Five methods move to team scope; two copy methods added. |
| `src/globals.d.ts` | **Modify.** Declare the changed and new signatures. |
| `public/js/app.core.js` | **Modify.** Pass `activeTeamId` instead of `'bhs'` to the two planner fetches. |
| `public/js/views/thoughts.view.js` | **Create.** The eight daily-thoughts methods, moved verbatim from `planner.view.js:262-439`. |
| `public/js/views/planner.view.js` | **Modify.** Remove those methods; add the plan's Copy-to-team control. |
| `index.html` | **Modify.** Script tag for `thoughts.view.js`; the copy modal shell. |
| `src/data/planner-team-scope.test.ts` | **Create.** Team scoping of the five fetches. |
| `src/data/planner-copy.test.ts` | **Create.** Copy semantics, refusals, destination list. |

---

### Task 1: Migration 0014 — add the team column

**Files:**
- Create: `supabase/migrations/0014_team_scoped_planner.sql`

**Interfaces:**
- Consumes: `public.teams`, `public.is_team_coach(uuid)` from `0005`.
- Produces: `practice_plans.team_id`, `daily_thoughts.team_id`, and RLS policies on both.

**This task writes the file. It does NOT apply it.**

- [ ] **Step 1: Write the header and the columns**

```sql
-- supabase/migrations/0014_team_scoped_planner.sql
--
-- Team-scoped practice planner. See
-- docs/superpowers/specs/2026-09-01-team-scoped-planner-design.md
--
-- SAFE TO APPLY BEFORE THE CODE DEPLOYS. school_id is left in place, so
-- currently-deployed code keeps working unchanged. 0015 drops it afterwards.
-- This is deliberately the opposite of what 0005 did: dropping in the same
-- migration that adds leaves a window where deployed code queries a column
-- that no longer exists.
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
```

- [ ] **Step 2: Backfill, and be explicit about where rows go**

```sql
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
   and t.is_public_default;

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
```

- [ ] **Step 3: RLS — public read, team-coach write**

Both tables are currently in the uniform policy loop in `supabase_migration_auth.sql` section 6, which grants ANY coach write on ANY row. Replace those policies with team-scoped ones.

```sql
-- ─── RLS ───────────────────────────────────────────────────────────────────
-- These tables are in the uniform policy loop in supabase_migration_auth.sql
-- section 6, which grants any coach write access to any row. Replaced here
-- with team-scoped policies: this is the first time the planner has had
-- per-team write control.
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
```

- [ ] **Step 4: Self-check**

```sql
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

  select count(*) into unassigned from public.practice_plans
   where team_id is null and not coalesce(is_deleted, false);
  raise notice 'Planner is team-scoped. % live rows still unassigned.', unassigned;
end $$;

commit;
```

- [ ] **Step 5: Rollback block**

```sql
-- Verify:
--   select t.name as team, p.name as plan, count(*) as slots
--   from public.practice_plans p
--   join public.teams t on t.id = p.team_id
--   where not coalesce(p.is_deleted, false)
--   group by t.name, p.name order by t.name, p.name;

-- Rollback:
--   drop policy if exists "practice_plans_write" on public.practice_plans;
--   drop policy if exists "practice_plans_select" on public.practice_plans;
--   drop policy if exists "daily_thoughts_write" on public.daily_thoughts;
--   drop policy if exists "daily_thoughts_select" on public.daily_thoughts;
--   alter table public.practice_plans drop column if exists team_id;
--   alter table public.daily_thoughts drop column if exists team_id;
--   -- then re-run supabase_migration_auth.sql section 6 to restore the
--   -- uniform coach/admin policies on both tables.
```

- [ ] **Step 6: Verify balance and commit**

Run: `grep -c '^begin;' supabase/migrations/0014_team_scoped_planner.sql` — expect `1`
Run: `grep -c '^commit;' supabase/migrations/0014_team_scoped_planner.sql` — expect `1`

```bash
git add supabase/migrations/0014_team_scoped_planner.sql
git commit -m "feat: migration 0014 adds team_id to the planner tables"
```

---

### Task 2: Team-scope the five service reads and writes

**Files:**
- Modify: `src/data/supabase.ts`
- Modify: `src/globals.d.ts`
- Modify: `public/js/app.core.js`
- Test: `src/data/planner-team-scope.test.ts` (create)

**Interfaces:**
- Consumes: `practice_plans.team_id`, `daily_thoughts.team_id` from Task 1.
- Produces:
  - `fetchPracticePlans(teamId: string)`
  - `fetchDailyThoughts(teamId: string)`
  - `fetchLatestDailyThoughts(teamId: string)`
  - `upsertDailyThought(teamId: string, thought: any)`
  - `setActiveDailyThought(teamId: string, activeId?: string)`

`deleteDailyThought(thoughtId)` is unchanged — it targets a row by id.

- [ ] **Step 1: Write the failing tests**

```ts
/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;
const TEAM = '65d376d3-2a77-49c0-80f7-f8f2586f9f2b';

let filters: { table: string; column: string; value: any }[];
let written: Record<string, any>[];

beforeEach(() => {
  filters = [];
  written = [];
  svc.isConfigured = () => true;
  svc._cachedSchoolUuidMap = null;
  svc.client = {
    from(table: string) {
      const api: any = {
        select() { return api; },
        or() { return api; },
        order() { return api; },
        limit() { return api; },
        maybeSingle: async () => ({ data: null, error: null }),
        eq(column: string, value: any) { filters.push({ table, column, value }); return api; },
        update(row: any) { written.push({ table, ...row }); return api; },
        insert(rows: any[]) { rows.forEach(r => written.push({ table, ...r })); return api; },
        upsert(rows: any[]) { rows.forEach(r => written.push({ table, ...r })); return api; },
        then(res: any) { return Promise.resolve({ data: [], error: null }).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

/** The literal that must never reach the database again. */
const sentSchoolCode = () =>
  filters.some(f => f.value === 'bhs') || written.some(w => w.school_id === 'bhs');

describe('planner reads are team-scoped', () => {
  it('filters practice plans by team, not school', async () => {
    await supabaseService.fetchPracticePlans(TEAM);
    expect(filters.some(f => f.table === 'practice_plans' && f.column === 'team_id' && f.value === TEAM)).toBe(true);
    expect(filters.some(f => f.column === 'school_id')).toBe(false);
  });

  it('filters daily thoughts by team', async () => {
    await supabaseService.fetchDailyThoughts(TEAM);
    expect(filters.some(f => f.table === 'daily_thoughts' && f.column === 'team_id' && f.value === TEAM)).toBe(true);
  });

  it('filters the active thought by team', async () => {
    await supabaseService.fetchLatestDailyThoughts(TEAM);
    expect(filters.some(f => f.column === 'team_id' && f.value === TEAM)).toBe(true);
  });

  it('never sends a school CODE where an id belongs', async () => {
    // This is the bug that killed daily thoughts entirely: 'bhs' was passed
    // into a uuid column, every call failed with 22P02, and the page rendered
    // an empty state. Asserting the value that reaches the database is the
    // property that was missing.
    await supabaseService.fetchDailyThoughts('bhs');
    expect(sentSchoolCode()).toBe(false);
  });

  it('returns null without querying when no team is given', async () => {
    // An unscoped query would return every team's plans.
    expect(await supabaseService.fetchPracticePlans('')).toBeNull();
    expect(filters.some(f => f.table === 'practice_plans')).toBe(false);
  });
});

describe('planner writes are team-scoped', () => {
  it('writes team_id on a new thought', async () => {
    await supabaseService.upsertDailyThought(TEAM, { text: 'Press high today.' });
    expect(written.some(w => w.team_id === TEAM)).toBe(true);
    expect(sentSchoolCode()).toBe(false);
  });

  it('clears the previously active thought within the team only', async () => {
    // Scoped to school, this would clear another team's active message.
    await supabaseService.setActiveDailyThought(TEAM, 'thought-1');
    expect(filters.some(f => f.table === 'daily_thoughts' && f.column === 'team_id' && f.value === TEAM)).toBe(true);
  });

  it('refuses to write without a team rather than writing unscoped', async () => {
    const res = await supabaseService.upsertDailyThought('', { text: 'x' });
    expect(res.error).toBeTruthy();
    expect(written.some(w => w.table === 'daily_thoughts')).toBe(false);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/data/planner-team-scope.test.ts`
Expected: FAIL — the fetches still filter on `school_id`.

- [ ] **Step 3: Rewrite the five methods**

In `src/data/supabase.ts`, replace each. Note `getSchoolUuid` is no longer called by any of them.

```ts
  async fetchPracticePlans(teamId: string): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured() || !teamId) return null;
    const { data, error } = await this.client!
      .from('practice_plans')
      .select('*')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .eq('team_id', teamId)
      .order('created_at', { ascending: true });
    if (error) { console.error('Supabase fetchPracticePlans error:', error); return null; }
    return data;
  }

  async fetchDailyThoughts(teamId: string): Promise<Partial<DailyThoughtRow>[] | null> {
    if (!this.isConfigured() || !teamId) return null;
    const { data, error } = await this.client!
      .from('daily_thoughts')
      .select('*')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    if (error) { console.error('Supabase fetchDailyThoughts error:', error); return null; }
    return data;
  }

  async fetchLatestDailyThoughts(teamId: string): Promise<Partial<DailyThoughtRow> | null> {
    if (!this.isConfigured() || !teamId) return null;
    const { data, error } = await this.client!
      .from('daily_thoughts')
      .select('*')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) { console.error('Supabase fetchLatestDailyThoughts error:', error); return null; }
    return data && data.length > 0 ? data[0] : null;
  }
```

For `upsertDailyThought`, replace the school resolution and the payload's scope field:

```ts
  async upsertDailyThought(teamId: string, thought: any = {}): Promise<any> {
    if (!this.isConfigured()) return { error: 'Cloud database is not configured.' };
    // Without a team the row is invisible to every read that follows, and the
    // caller would report success over a permanent silent loss.
    if (!teamId) return { error: 'No team selected; refusing to write an unscoped thought.' };

    const payload: Record<string, any> = {
      team_id: teamId,
      coach_id: thought.coachId || 'c1',
      coach_name: thought.coachName || '',
      thoughts_text: thought.text || '',
      is_active: thought.isActive !== false,
      is_deleted: thought.is_deleted || thought.isDeleted || false
    };
```

…leaving the rest of that method's insert/update branching unchanged.

And `setActiveDailyThought`:

```ts
  async setActiveDailyThought(teamId: string, activeId?: string): Promise<any> {
    if (!this.isConfigured() || !activeId || !teamId) return null;
    // Scoped to the team: clearing by school would clear another squad's
    // active message.
    const { error: err1 } = await this.client!
      .from('daily_thoughts')
      .update({ is_active: false })
      .eq('team_id', teamId);
    if (err1) console.error('Supabase setActiveDailyThought reset error:', err1);

    const { error: err2 } = await this.client!
      .from('daily_thoughts')
      .update({ is_active: true })
      .eq('id', activeId);
    if (err2) console.error('Supabase setActiveDailyThought set error:', err2);
  }
```

- [ ] **Step 4: Update `src/globals.d.ts`**

```ts
    fetchPracticePlans(teamId: string): Promise<Record<string, any>[] | null>;
    fetchDailyThoughts(teamId: string): Promise<Partial<DailyThought>[] | null>;
    fetchLatestDailyThoughts(teamId: string): Promise<Partial<DailyThought> | null>;
    upsertDailyThought(teamId: string, thought: any): Promise<any>;
    setActiveDailyThought(teamId: string, activeId?: string): Promise<any>;
```

- [ ] **Step 5: Update the two call sites in `public/js/app.core.js`**

Find `fetchPracticePlans('bhs')` and `fetchDailyThoughts('bhs')` in `syncFromSupabase` and pass the active team instead. Both must sit inside the branch where `this.activeTeamId` is already resolved — the same branch the schedule and matrix fetches use.

```js
        const dbPlans = await window.supabaseService.fetchPracticePlans(this.activeTeamId);
```

```js
        const dbThoughts = await window.supabaseService.fetchDailyThoughts(this.activeTeamId);
```

Verify by reading the surrounding code that `activeTeamId` is assigned before these lines. If either sits outside that branch, move it inside — a fetch running before the team resolves returns nothing and the planner is silently empty.

- [ ] **Step 6: Run all four gates and commit**

```bash
npx vitest run src/data/planner-team-scope.test.ts   # expect PASS
npm test && npm run typecheck && node --check public/js/app.core.js && npm run build
git add src/data/supabase.ts src/globals.d.ts public/js/app.core.js src/data/planner-team-scope.test.ts
git commit -m "feat: planner reads and writes are scoped to the active team"
```

---

### Task 3: Copy a plan or a thought to another team

**Files:**
- Modify: `src/data/supabase.ts`
- Modify: `src/globals.d.ts`
- Test: `src/data/planner-copy.test.ts` (create)

**Interfaces:**
- Consumes: the team-scoped methods from Task 2.
- Produces:
  - `copyPracticePlan(planName: string, fromTeamId: string, toTeamId: string): Promise<{ok, error?, slots?}>`
  - `copyDailyThought(thoughtId: string, toTeamId: string): Promise<{ok, error?, id?}>`
  - `teamsCoachedBy(): Promise<Record<string,any>[] | null>` — destination candidates

- [ ] **Step 1: Write the failing tests**

```ts
/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseService } from './supabase';

const svc = supabaseService as any;
const FROM = 'team-varsity';
const TO_SAME_ORG = 'team-jv';
const TO_OTHER_ORG = 'team-u16';

let inserted: Record<string, any>[];
let tables: Record<string, any[]>;

beforeEach(() => {
  inserted = [];
  tables = {
    practice_plans: [
      { id: 'r1', team_id: FROM, name: 'Standard 90', time_slot: '4:00 PM', duration: '15 min',
        drill: 'Dynamic Warmup', coach_notes: 'sharp', diagram_image: null, diagram_data: {} },
      { id: 'r2', team_id: FROM, name: 'Standard 90', time_slot: '4:15 PM', duration: '20 min',
        drill: '1v1 Gauntlet', coach_notes: '', diagram_image: null, diagram_data: {} }
    ],
    daily_thoughts: [
      { id: 't1', team_id: FROM, coach_name: 'Coach Bob', thoughts_text: 'Press high.', is_active: true }
    ],
    teams: [
      { id: FROM, school_id: 's-bhs', name: 'Varsity' },
      { id: TO_SAME_ORG, school_id: 's-bhs', name: 'JV' },
      { id: TO_OTHER_ORG, school_id: 's-legends', name: 'U16 Boys' }
    ],
    drills_bank: [
      { id: 'd1', school_id: 's-bhs', name: 'Dynamic Warmup' },
      { id: 'd2', school_id: 's-bhs', name: '1v1 Gauntlet' }
    ]
  };

  svc.isConfigured = () => true;
  svc.client = {
    // teamsCoachedBy reads the session to find the signed-in coach. Without
    // this stub it throws on `client.auth` before reaching anything testable.
    auth: { getSession: async () => ({ data: { session: { user: { id: 'coach-1' } } } }) },
    from(table: string) {
      let rows = (tables[table] || []).slice();
      const api: any = {
        select() { return api; },
        or() { return api; },
        order() { return api; },
        limit() { return api; },
        eq(col: string, val: any) { rows = rows.filter(r => r[col] === val); return api; },
        in(col: string, vals: any[]) { rows = rows.filter(r => vals.includes(r[col])); return api; },
        maybeSingle: async () => ({ data: rows[0] || null, error: null }),
        single: async () => ({ data: rows[0] || null, error: null }),
        insert(newRows: any[]) {
          newRows.forEach(r => inserted.push({ table, ...r }));
          rows = newRows;
          return api;
        },
        then(res: any) { return Promise.resolve({ data: rows, error: null }).then(res); }
      };
      return api;
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('copying a practice plan', () => {
  it('duplicates every slot in the plan', async () => {
    // A plan is rows sharing a name; copying half a session is meaningless.
    const res = await supabaseService.copyPracticePlan('Standard 90', FROM, TO_SAME_ORG);
    expect(res.ok).toBe(true);
    expect(inserted.filter(r => r.table === 'practice_plans')).toHaveLength(2);
  });

  it('assigns the copies to the destination team', async () => {
    await supabaseService.copyPracticePlan('Standard 90', FROM, TO_SAME_ORG);
    const copies = inserted.filter(r => r.table === 'practice_plans');
    expect(copies.every(r => r.team_id === TO_SAME_ORG)).toBe(true);
  });

  it('creates independent rows, carrying no id from the original', async () => {
    // A copy that reused an id would overwrite the source on the next save.
    await supabaseService.copyPracticePlan('Standard 90', FROM, TO_SAME_ORG);
    const copies = inserted.filter(r => r.table === 'practice_plans');
    expect(copies.every(r => r.id === undefined)).toBe(true);
  });

  it('carries the slot content across', async () => {
    await supabaseService.copyPracticePlan('Standard 90', FROM, TO_SAME_ORG);
    const copies = inserted.filter(r => r.table === 'practice_plans');
    expect(copies.map(r => r.drill).sort()).toEqual(['1v1 Gauntlet', 'Dynamic Warmup']);
    expect(copies.some(r => r.coach_notes === 'sharp')).toBe(true);
  });

  it('REFUSES a copy to another organization, naming the drills', async () => {
    // The drill library is per-organization, so the copies would point at
    // drills that team cannot see. Half-copying would be silent corruption.
    const res = await supabaseService.copyPracticePlan('Standard 90', FROM, TO_OTHER_ORG);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Dynamic Warmup');
    expect(inserted.filter(r => r.table === 'practice_plans')).toHaveLength(0);
  });

  it('refuses a plan that does not exist rather than copying nothing quietly', async () => {
    const res = await supabaseService.copyPracticePlan('No Such Plan', FROM, TO_SAME_ORG);
    expect(res.ok).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it('refuses a copy onto the same team', async () => {
    // Two identically named plans on one team cannot be told apart in the picker.
    const res = await supabaseService.copyPracticePlan('Standard 90', FROM, FROM);
    expect(res.ok).toBe(false);
    expect(inserted).toHaveLength(0);
  });
});

describe('copying a daily thought', () => {
  it('creates an independent copy on the destination team', async () => {
    const res = await supabaseService.copyDailyThought('t1', TO_SAME_ORG);
    expect(res.ok).toBe(true);
    const copy = inserted.find(r => r.table === 'daily_thoughts');
    expect(copy!.team_id).toBe(TO_SAME_ORG);
    expect(copy!.thoughts_text).toBe('Press high.');
    expect(copy!.id).toBeUndefined();
  });

  it('does not carry the active flag across', async () => {
    // The source is active for ITS team; making the copy active would silently
    // replace whatever message the destination team is currently showing.
    await supabaseService.copyDailyThought('t1', TO_SAME_ORG);
    expect(inserted.find(r => r.table === 'daily_thoughts')!.is_active).toBe(false);
  });

  it('copies across organizations, because a thought references no drills', async () => {
    const res = await supabaseService.copyDailyThought('t1', TO_OTHER_ORG);
    expect(res.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/data/planner-copy.test.ts`
Expected: FAIL — `supabaseService.copyPracticePlan is not a function`

- [ ] **Step 3: Implement the three methods**

Add to `src/data/supabase.ts`, beside the other planner methods:

```ts
  /**
   * Teams the signed-in coach may write to.
   *
   * Used to build the "Copy to team…" list. is_team_coach() refuses the write
   * regardless, so offering a team the coach cannot write to would produce a
   * control that always fails -- the same trap that made unassigned coaches
   * look like a broken app.
   */
  async teamsCoachedBy(): Promise<Record<string, any>[] | null> {
    if (!this.isConfigured()) return null;
    const { data: session } = await this.client!.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) return [];

    const { data: rows, error } = await this.client!
      .from('team_coaches')
      .select('team_id, teams(id, name, school_id, schools(name))')
      .eq('profile_id', uid);
    if (error) { console.warn('Supabase teamsCoachedBy notice:', error.message); return null; }

    return (rows || []).map((r: any) => ({
      id: r.teams?.id || r.team_id,
      name: r.teams?.name || 'Team',
      school_id: r.teams?.school_id || null,
      school_name: r.teams?.schools?.name || ''
    }));
  }

  /**
   * Copy every slot of a plan to another team, as an independent snapshot.
   *
   * A plan is the set of practice_plans rows sharing a `name`, so a copy
   * duplicates all of them. Copies carry no id: reusing one would make the
   * next save overwrite the original.
   *
   * Refused across organizations. practice_plans.drill is a drill NAME, and
   * the drill library is scoped per organization, so the copies would name
   * drills the destination team cannot see. Half-copying and leaving broken
   * slots would be a silent corruption.
   */
  async copyPracticePlan(
    planName: string, fromTeamId: string, toTeamId: string
  ): Promise<{ ok: boolean; error?: string; slots?: number }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!planName || !fromTeamId || !toTeamId) return { ok: false, error: 'Pick a plan and a destination team.' };
    if (fromTeamId === toTeamId) {
      return { ok: false, error: 'That plan is already on this team.' };
    }

    const { data: slots } = await this.client!
      .from('practice_plans')
      .select('*')
      .eq('team_id', fromTeamId)
      .eq('name', planName);
    if (!slots || slots.length === 0) return { ok: false, error: `No plan named "${planName}" on that team.` };

    const { data: destTeam } = await this.client!
      .from('teams').select('id, school_id').eq('id', toTeamId).maybeSingle();
    if (!destTeam) return { ok: false, error: 'That team no longer exists.' };

    const { data: destDrills } = await this.client!
      .from('drills_bank').select('name').eq('school_id', destTeam.school_id);
    const available = new Set((destDrills || []).map((d: any) => d.name));
    const missing = Array.from(new Set(
      slots.map((s: any) => s.drill).filter((n: any) => n && !available.has(n))
    ));
    if (missing.length) {
      return {
        ok: false,
        error: `That team's drill library does not have: ${missing.join(', ')}. ` +
               `Drills belong to one organization, so this plan cannot be copied there.`
      };
    }

    const copies = slots.map((s: any) => ({
      team_id: toTeamId,
      school_id: destTeam.school_id,
      name: s.name,
      time_slot: s.time_slot,
      duration: s.duration,
      drill: s.drill,
      coach_notes: s.coach_notes,
      diagram_image: s.diagram_image,
      diagram_data: s.diagram_data,
      is_deleted: false
    }));

    const { data, error } = await this.client!.from('practice_plans').insert(copies).select();
    if (error) { console.warn('Supabase copyPracticePlan notice:', error.message); return { ok: false, error: error.message }; }
    if (!data || data.length === 0) {
      return { ok: false, error: 'The database refused that. Only a coach of the destination team can copy to it.' };
    }
    return { ok: true, slots: data.length };
  }

  /**
   * Copy one daily thought to another team.
   *
   * Never active on arrival: the source is active for ITS team, and making the
   * copy active would silently replace whatever message the destination team
   * is currently showing.
   */
  async copyDailyThought(thoughtId: string, toTeamId: string): Promise<{ ok: boolean; error?: string; id?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    if (!thoughtId || !toTeamId) return { ok: false, error: 'Pick a message and a destination team.' };

    const { data: src } = await this.client!
      .from('daily_thoughts').select('*').eq('id', thoughtId).maybeSingle();
    if (!src) return { ok: false, error: 'That message no longer exists.' };
    if (src.team_id === toTeamId) return { ok: false, error: 'That message is already on this team.' };

    const { data, error } = await this.client!.from('daily_thoughts').insert([{
      team_id: toTeamId,
      coach_id: src.coach_id,
      coach_name: src.coach_name,
      thoughts_text: src.thoughts_text,
      is_active: false,
      is_deleted: false
    }]).select();
    if (error) { console.warn('Supabase copyDailyThought notice:', error.message); return { ok: false, error: error.message }; }
    if (!data || data.length === 0) {
      return { ok: false, error: 'The database refused that. Only a coach of the destination team can copy to it.' };
    }
    return { ok: true, id: data[0].id };
  }
```

- [ ] **Step 4: Declare them in `src/globals.d.ts`**

```ts
    teamsCoachedBy(): Promise<Record<string, any>[] | null>;
    copyPracticePlan(planName: string, fromTeamId: string, toTeamId: string):
      Promise<{ ok: boolean; error?: string; slots?: number }>;
    copyDailyThought(thoughtId: string, toTeamId: string):
      Promise<{ ok: boolean; error?: string; id?: string }>;
```

- [ ] **Step 5: Run all four gates and commit**

```bash
npx vitest run src/data/planner-copy.test.ts
npm test && npm run typecheck && npm run build
git add src/data/supabase.ts src/globals.d.ts src/data/planner-copy.test.ts
git commit -m "feat: copy a plan or a daily message to another team"
```

---

### Task 4: Move the daily-thoughts methods to their own file

**Files:**
- Create: `public/js/views/thoughts.view.js`
- Modify: `public/js/views/planner.view.js` (remove lines 262-439)
- Modify: `index.html` (script tag)
- Test: `src/data/planner-team-scope.test.ts` (extend)

**This task is a MOVE, not a rewrite.** The eight methods change only where the service calls now pass a team. Behaviour is otherwise identical, so the diff should read as a relocation.

**Interfaces:**
- Consumes: the team-scoped service methods from Task 2.
- Produces: the same eight prototype methods, from a different file — `getActiveThought`, `openManageThoughtsModal`, `renderThoughtsList`, `openAddThoughtModal`, `openEditThoughtFormModal`, `submitThoughtForm`, `setActiveThought`, `deleteThought`.

Because all eight are prototype methods and every call site uses `app.method()`, **no call site changes**. `home.view.js:46` and `:93` and `index.html:531` keep working untouched.

- [ ] **Step 1: Create the new file with the moved methods**

Copy `public/js/views/planner.view.js` lines **262 through 439** verbatim into a new file with this header, then apply the team changes in Step 2.

```js
/**
 * Daily coaching messages.
 *
 * Moved out of planner.view.js, which had grown past 2.3k lines holding the
 * planner, the drills library, the diagrammer, the quiz AND this. Only this
 * section moved: its service calls were being rewritten for team scoping
 * anyway, so the file stops growing without a broader refactor.
 *
 * Classic script — no imports. Extends the prototype defined in app.core.js,
 * so index.html must load this AFTER that file. Every method here is called as
 * app.method() from home.view.js and index.html, so moving them needs no call
 * site changes.
 */
Object.assign(BHSSoccerApp.prototype, {

  // ...lines 262-439 of planner.view.js, verbatim...

});
```

- [ ] **Step 2: Pass the active team at the three service call sites**

Inside the moved code, find and change:

```js
      await window.supabaseService.upsertDailyThought('bhs', thoughtObj);
```
becomes
```js
      await window.supabaseService.upsertDailyThought(this.activeTeamId, thoughtObj);
```

```js
      await window.supabaseService.setActiveDailyThought('bhs', cloudResult.data.id);
```
becomes
```js
      await window.supabaseService.setActiveDailyThought(this.activeTeamId, cloudResult.data.id);
```

```js
      await window.supabaseService.setActiveDailyThought('bhs', thoughtId);
```
becomes
```js
      await window.supabaseService.setActiveDailyThought(this.activeTeamId, thoughtId);
```

Run `grep -n "'bhs'" public/js/views/thoughts.view.js` afterwards and expect no matches.

- [ ] **Step 3: Delete the moved block from `planner.view.js`**

Remove lines 262-439 — from `getActiveThought() {` up to and including the `},` that closes `deleteThought`. The next method, `openTakeQuizModal`, stays.

Verify: `grep -c "getActiveThought\|renderThoughtsList\|submitThoughtForm" public/js/views/planner.view.js` — expect `0`.

- [ ] **Step 4: Add the script tag to `index.html`**

After `<script src="./js/views/planner.view.js"></script>`:

```html
    <script src="./js/views/thoughts.view.js"></script>
```

Script order is load-bearing: the file does `Object.assign(BHSSoccerApp.prototype, …)`, which throws if the class does not exist yet.

- [ ] **Step 5: Write the tests**

Append to `src/data/planner-team-scope.test.ts`:

```ts
describe('the daily-thoughts move', () => {
  it('defines the eight methods in the new file', async () => {
    const src = (await import('../../public/js/views/thoughts.view.js?raw')).default;
    for (const m of ['getActiveThought', 'openManageThoughtsModal', 'renderThoughtsList',
                     'openAddThoughtModal', 'openEditThoughtFormModal', 'submitThoughtForm',
                     'setActiveThought', 'deleteThought']) {
      expect(src, m).toContain(m);
    }
  });

  it('leaves none of them behind in planner.view.js', async () => {
    // Two copies on one prototype means the load order silently decides which
    // wins, and edits to the wrong copy do nothing.
    const src = (await import('../../public/js/views/planner.view.js?raw')).default;
    expect(src).not.toContain('renderThoughtsList()');
    expect(src).not.toContain('submitThoughtForm()');
  });

  it('keeps the quiz in planner.view.js', async () => {
    // The quiz is explicitly out of scope; it must not have been swept along.
    const src = (await import('../../public/js/views/planner.view.js?raw')).default;
    expect(src).toContain('openTakeQuizModal');
  });

  it('loads after app.core.js', async () => {
    const html = (await import('../../index.html?raw')).default;
    const core = html.indexOf('js/app.core.js');
    const thoughts = html.indexOf('js/views/thoughts.view.js');
    expect(core).toBeGreaterThan(-1);
    expect(thoughts).toBeGreaterThan(core);
  });

  it('passes a team, never the school code', async () => {
    const src = (await import('../../public/js/views/thoughts.view.js?raw')).default;
    expect(src).not.toContain("'bhs'");
    expect(src).toContain('this.activeTeamId');
  });
});
```

- [ ] **Step 6: Run all four gates and commit**

```bash
npm test && npm run typecheck
node --check public/js/views/thoughts.view.js && node --check public/js/views/planner.view.js
npm run build
git add public/js/views/thoughts.view.js public/js/views/planner.view.js index.html src/data/planner-team-scope.test.ts
git commit -m "refactor: move daily thoughts out of planner.view.js"
```

---

### Task 5: The "Copy to team…" control

**Files:**
- Modify: `public/js/views/thoughts.view.js`
- Modify: `public/js/views/planner.view.js`
- Modify: `index.html` (modal shell)
- Test: `src/data/planner-copy.test.ts` (extend)

**Interfaces:**
- Consumes: `copyPracticePlan`, `copyDailyThought`, `teamsCoachedBy` from Task 3.
- Produces on the prototype: `openCopyToTeam(kind, ref)`, `renderCopyTargets()`, `confirmCopyToTeam()`.

- [ ] **Step 1: Add the modal shell to `index.html`**

```html
  <div id="copyToTeamModal" class="modal-overlay">
    <div class="modal-window">
      <div class="modal-header">
        <h3>&#128203; COPY TO TEAM</h3>
        <button class="close-btn">&times;</button>
      </div>
      <p class="text-muted" style="font-size:0.85rem;" id="copyToTeamWhat"></p>
      <p class="text-muted" style="font-size:0.85rem;">
        The copy is independent &mdash; editing it later will not change the original.
      </p>
      <div id="copyToTeamTargets"></div>
      <div id="copyToTeamError" style="color:var(--color-danger); font-size:0.85rem; margin-top:8px;"></div>
      <button class="btn btn-gold" style="width:100%; margin-top:10px;" id="copyToTeamBtn"
              onclick="app.confirmCopyToTeam()">Copy</button>
    </div>
  </div>
```

- [ ] **Step 2: Write the failing tests**

Append to `src/data/planner-copy.test.ts`:

```ts
describe('the copy control', () => {
  it('offers only teams the coach is assigned to', async () => {
    // is_team_coach() refuses the write anyway, so offering an unavailable
    // team would produce a button that always fails.
    const src = (await import('../../public/js/views/thoughts.view.js?raw')).default;
    expect(src).toContain('teamsCoachedBy');
  });

  it('excludes the team the item is already on', async () => {
    const src = (await import('../../public/js/views/thoughts.view.js?raw')).default;
    expect(src).toContain('_copySourceTeamId');
  });

  it('says what is being copied', async () => {
    const html = (await import('../../index.html?raw')).default;
    expect(html).toContain('copyToTeamWhat');
  });

  it('surfaces a refusal rather than closing silently', async () => {
    const src = (await import('../../public/js/views/thoughts.view.js?raw')).default;
    expect(src).toContain('copyToTeamError');
  });
});
```

- [ ] **Step 3: Implement the control in `thoughts.view.js`**

Add inside its `Object.assign` block. It handles both kinds, so the planner can reuse it.

```js
  /**
   * Open the copy dialog for a plan or a daily message.
   *
   * @param kind 'plan' or 'thought'
   * @param ref  the plan NAME, or the thought id
   */
  async openCopyToTeam(kind, ref) {
    this._copyKind = kind;
    this._copyRef = ref;
    this._copySourceTeamId = this.activeTeamId;
    this._copyTargets = [];

    const err = document.getElementById('copyToTeamError');
    if (err) err.textContent = '';
    const what = document.getElementById('copyToTeamWhat');
    if (what) {
      what.textContent = kind === 'plan'
        ? `Copying the plan "${ref}" — every drill slot in it.`
        : 'Copying this message to another team.';
    }

    if (window.supabaseService?.isConfigured()) {
      const teams = (await window.supabaseService.teamsCoachedBy()) || [];
      // Never offer the team it is already on: the copy would be refused, and
      // two identically named plans on one team cannot be told apart.
      this._copyTargets = teams.filter(t => t.id !== this._copySourceTeamId);
    }

    const box = document.getElementById('copyToTeamTargets');
    if (box) box.innerHTML = this.renderCopyTargets();

    const modal = document.getElementById('copyToTeamModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },

  renderCopyTargets() {
    const targets = this._copyTargets || [];
    if (targets.length === 0) {
      return `<p class="text-muted" style="font-size:0.85rem;">
        You do not coach another team to copy this to. An admin assigns coaches to
        teams under Admin &rsaquo; Teams &amp; Coach Assignments.</p>`;
    }
    return `
      <label for="copyToTeamSelect" style="display:block; font-size:0.7rem; text-transform:uppercase; color:var(--text-muted); margin-bottom:3px;">Destination team</label>
      <select id="copyToTeamSelect" class="form-control" style="font-size:0.85rem;">
        ${targets.map(t => `<option value="${t.id}">${t.name}${t.school_name ? ' — ' + t.school_name : ''}</option>`).join('')}
      </select>`;
  },

  async confirmCopyToTeam() {
    const err = document.getElementById('copyToTeamError');
    const set = (m) => { if (err) err.textContent = m; };
    const to = document.getElementById('copyToTeamSelect')?.value;
    if (!to) return set('Pick a destination team.');

    const btn = document.getElementById('copyToTeamBtn');
    if (btn) btn.disabled = true;
    try {
      set('Copying…');
      const res = this._copyKind === 'plan'
        ? await window.supabaseService.copyPracticePlan(this._copyRef, this._copySourceTeamId, to)
        : await window.supabaseService.copyDailyThought(this._copyRef, to);

      // The service names the drills a cross-organization copy is missing;
      // pass that through verbatim rather than replacing it with something
      // generic the coach cannot act on.
      if (!res.ok) return set(res.error || 'Could not copy that.');

      await this.syncFromSupabase();
      this.renderCurrentView();
      this.closeModals();
    } finally {
      if (btn) btn.disabled = false;
    }
  }
```

- [ ] **Step 4: Add the triggers**

In `thoughts.view.js`, inside `renderThoughtsList`, add beside each thought's existing buttons:

```js
        <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem;"
                onclick="app.openCopyToTeam('thought','${t.id}')">Copy to team…</button>
```

In `planner.view.js`, beside the plan's Set Active control:

```js
              <button class="btn btn-secondary" onclick="app.openCopyToTeam('plan','${planName}')">📋 Copy to team…</button>
```

Find the variable already holding the plan's name at that point rather than
introducing one — `grep -n "activePlanName" public/js/views/planner.view.js`
locates it; line 11 reads
`const activeName = this.data.activePlanName || 'Standard Practice Session';`,
so `activeName` is the value to pass.

- [ ] **Step 5: Make an empty planner read as empty, not broken**

The moment this ships, **JV has no plans and no daily message** — everything
belonged to Varsity. A blank panel reads as a broken feature, which is exactly
the confusion the session recorder caused before it explained itself.

Add the failing tests first, to `src/data/planner-copy.test.ts`:

```ts
describe('a team with nothing yet', () => {
  it('explains an empty plan list rather than showing a blank panel', async () => {
    const src = (await import('../../public/js/views/planner.view.js?raw')).default;
    expect(src).toContain('No practice plans for this team yet');
  });

  it('points at copying, since another team probably has one', async () => {
    // The whole reason JV is empty is that the plans went to Varsity.
    const src = (await import('../../public/js/views/planner.view.js?raw')).default;
    expect(src).toContain('Copy to team');
  });

  it('explains an empty message list too', async () => {
    const src = (await import('../../public/js/views/thoughts.view.js?raw')).default;
    expect(src).toContain('No messages for this team yet');
  });
});
```

Then, in `planner.view.js`, where the plan list renders, handle the empty case:

```js
      ${(this.data.practicePlans || []).length === 0 ? `
        <p class="text-muted" style="font-size:0.85rem;">
          No practice plans for this team yet. Build one below, or open a plan on
          another team and use <strong style="color:#FFF;">Copy to team…</strong>
          &mdash; plans belong to a single team now, so ${this.activeTeamLabel ? this.activeTeamLabel() : 'this team'}
          starts fresh.
        </p>` : ''}
```

And in `thoughts.view.js`, inside `renderThoughtsList`:

```js
    if (thoughts.length === 0) {
      return `<p class="text-muted" style="font-size:0.85rem;">
        No messages for this team yet. Messages are per team now, so each squad
        gets its own &mdash; write one below, or copy one across from another team.</p>`;
    }
```

- [ ] **Step 6: Run all four gates and commit**

```bash
npm test && npm run typecheck
node --check public/js/views/thoughts.view.js && node --check public/js/views/planner.view.js
npm run build
git add public/js/views/thoughts.view.js public/js/views/planner.view.js index.html src/data/planner-copy.test.ts
git commit -m "feat: Copy to team control for plans and daily messages"
```

---

### Task 6: Migration 0015 — drop `school_id`

**Files:**
- Create: `supabase/migrations/0015_drop_planner_school_id.sql`

**Interfaces:**
- Consumes: everything above. Nothing may read `school_id` on these two tables by the time this is applied.

**Applied only AFTER the code from Tasks 2-5 is deployed.**

- [ ] **Step 1: Write the migration with a guard**

```sql
-- supabase/migrations/0015_drop_planner_school_id.sql
--
-- APPLY ONLY AFTER THE CODE FROM 0014's DEPLOY IS LIVE. Until then, deployed
-- code still reads practice_plans.school_id and daily_thoughts.school_id.
--
-- Splitting the drop out of 0014 is the whole point: 0005 dropped school_id in
-- the same migration that added team_id, which left a window where deployed
-- code queried a column that no longer existed. One extra file removes it.
--
-- Delaying this indefinitely is harmless. The only cost of leaving school_id
-- in place is a redundant column.

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

alter table public.practice_plans drop column if exists school_id;
alter table public.daily_thoughts drop column if exists school_id;

commit;

-- Verify:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name in ('practice_plans','daily_thoughts')
--   order by table_name, column_name;

-- Rollback:
--   alter table public.practice_plans add column school_id uuid references public.schools(id);
--   alter table public.daily_thoughts add column school_id uuid references public.schools(id);
--   update public.practice_plans p set school_id = t.school_id
--     from public.teams t where t.id = p.team_id;
--   update public.daily_thoughts d set school_id = t.school_id
--     from public.teams t where t.id = d.team_id;
--   -- The values are recoverable from the team, so this rollback is complete.
```

- [ ] **Step 2: Confirm nothing still reads it**

Run: `grep -rn "school_id" src/data/supabase.ts | grep -i "practice_plans\|daily_thoughts"`
Expected: no matches. If any appear, they belong to Task 2 and must be fixed before this file is handed over.

- [ ] **Step 3: Verify balance and commit**

Run: `grep -c '^begin;' supabase/migrations/0015_drop_planner_school_id.sql` — expect `1`

```bash
git add supabase/migrations/0015_drop_planner_school_id.sql
git commit -m "feat: migration 0015 drops school_id from the planner tables"
```

---

## Deploy sequence

**Three steps, in this order.**

1. **Apply `0014`.** Safe at any time — `school_id` survives, so deployed code keeps working. Watch for `Planner is team-scoped. 0 live rows still unassigned.` If it reports unassigned rows, assign them before continuing.
2. **Merge and push the code.** Vercel deploys from `main`. Confirm with:
   ```bash
   curl -s https://bhssoccer.org/js/views/thoughts.view.js | grep -c renderThoughtsList
   ```
   Expect `1` or more; a `404` means the deploy has not finished.
3. **Apply `0015`.** Optional in timing — it can wait a week. It refuses to run if any plan row still lacks a team.

## Verification summary

| Gate | Covers |
| --- | --- |
| `npm test` | Team scoping of every fetch and write, copy semantics and refusals, the file move, script order. |
| `npm run typecheck` | `src/` only — never `public/js/`. |
| `node --check` | The classic scripts, including the new `thoughts.view.js`. |
| `npm run build` | Real module resolution. Mandatory. |
| `0014`'s self-check | That both columns exist, that `school_id` survived, and how many rows are unassigned. |
| `0015`'s guard | Refuses to drop `school_id` while any plan row lacks a team. |
