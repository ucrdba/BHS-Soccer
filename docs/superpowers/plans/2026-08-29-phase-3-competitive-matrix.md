# Competitive Matrix — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Competitive Matrix real — coaches log head-to-head 1v1 results, and the leaderboard ranks players from those results instead of rendering seed numbers.

**Architecture:** `matrix_logs` is rebuilt as a symmetric head-to-head row (two players plus an outcome), so a draw is representable. Points are **derived** from the outcome in a Postgres view, never stored, so they cannot contradict the recorded result. The client reads a `matrix_standings` view and left-joins it onto players, so an unlogged player still appears. Writes go through `window.supabaseService`, like the rest of `public/js`.

**Tech Stack:** Postgres (Supabase) + RLS, TypeScript 7, Vite 8, Vitest, classic ES5-style view scripts under `public/js`.

**Spec:** `docs/superpowers/specs/2026-08-29-postgres-source-of-truth-design.md` — the "Competitive matrix" section.

## Global Constraints

- **`npm run build` is mandatory for any change to the `src/` module graph.** It is the only check that exercises real module resolution: `tsc` resolves a `.d.ts` with no runtime counterpart happily, and `npm test` only sees files a test imports. A previous task shipped an unresolvable import with typecheck clean, 21/21 tests green and the dev server returning 200.
- **`npm run typecheck` covers `src/` only** — `tsconfig.json` sets `"include": ["src"]`. For any file under `public/js/`, the syntax gate is `node --check <file>`.
- **Do not change `tsconfig.json`.** `strict: false` is deliberate so the ported JavaScript compiles without a rewrite.
- **Never create `src/data/index.ts`.** The pre-existing `src/data.ts` and the `src/data/` directory coexist; `src/app.core.ts:13` imports `'./data'`, which resolves to `data.ts` only because no `data/index.ts` exists. Import by explicit filename.
- **No agent can apply SQL.** DDL needs the Supabase dashboard or a service-role credential; this repo holds only the publishable anon key, which by design cannot execute DDL. Migrations are written and committed as numbered files under `supabase/migrations/`; **the human applies them**. `0001_tighten_profiles_select.sql` already exists and is applied.
- **Points are derived, never stored:** win 3, draw 1, loss 0. Ranking is by total points, tiebroken by percentage.
- **Files under `public/` do not hot-reload.** After changing anything there, a hard refresh is required to see it.

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0002_rebuild_matrix_logs.sql` | Drops and recreates `matrix_logs` as head-to-head; RLS re-applied. |
| `supabase/migrations/0003_matrix_standings_view.sql` | The `matrix_standings` view, `security_invoker`. |
| `src/data/supabase.ts` | Adds `fetchMatrixStandings()`, `fetchMatrixLogs()`, `logMatrixResult()`. |
| `src/globals.d.ts` | Declares those three on `SupabaseServiceLike`. |
| `public/js/app.core.js` | `syncFromSupabase()` joins standings onto players. |
| `public/js/views/matrix.view.js` | Leaderboard columns Rank / Player / GP / W-D-L / PTS / %. |
| `index.html` | The stub form at line 88 becomes a real, empty shell the app populates. |
| `public/js/admin.js` | `openAddDrillModal()` populates the form; `submitMatrixResult()` writes it. |

---

### Task 1: Rebuild `matrix_logs` as head-to-head

**Files:**
- Create: `supabase/migrations/0002_rebuild_matrix_logs.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: the `matrix_logs` shape every later task reads and writes — columns `id`, `school_id`, `drill_id`, `player_a_id`, `player_b_id`, `outcome`, `score_text`, `occurred_on`, `logged_by`, `is_deleted`, `created_at`.

The existing table records only `winning_player_id` and `points_earned`. It cannot express a loser, so it cannot produce the W-L record the leaderboard displays, and it cannot express a draw at all. It has **0 rows**, so it is rebuilt rather than migrated — nothing is lost.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Verify it is syntactically plausible before handing it over**

You cannot execute it. Read it back and confirm: every referenced table exists in `supabase_schema.sql` (`schools`, `drills_bank`, `players`, `profiles`), and `public.current_profile_role()` exists in `supabase_migration_auth.sql` around line 50.

Run: `grep -n "current_profile_role" supabase_migration_auth.sql | head -3`
Expected: a `create or replace function public.current_profile_role()` line.

- [ ] **Step 3: Confirm nothing else references the dropped columns**

`cascade` drops dependent objects. Check nothing in the repo reads the old shape:

Run: `grep -rn "winning_player_id\|points_earned" --include=*.ts --include=*.js --include=*.sql . | grep -v node_modules | grep -v dist`
Expected: hits only in `supabase_schema.sql` (the historical definition) and possibly this new migration's comment. **Any hit in `src/` or `public/js/` is a live reader and must be reported, not silently broken.**

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_rebuild_matrix_logs.sql
git commit -m "feat: rebuild matrix_logs as head-to-head with draws"
```

- [ ] **Step 5: Report that the human must apply it**

State plainly in your report that this migration is **not applied**, and give the human the verification query to run first (`select count(*) from public.matrix_logs;` — expect 0) and after (`\d public.matrix_logs` or a `select` against the new columns).

---

### Task 2: The `matrix_standings` view

**Files:**
- Create: `supabase/migrations/0003_matrix_standings_view.sql`

**Interfaces:**
- Consumes: `matrix_logs` from Task 1.
- Produces: the view `public.matrix_standings` with columns `player_id`, `school_id`, `wins`, `draws`, `losses`, `games`, `points`, `win_pct`, `rank`.

Each logged result contributes a win to one player and a loss to the other, so standings union the two sides and aggregate.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Hand-trace the arithmetic and record it in your report**

You cannot run this. Work the example below by hand and state the result, so a wrong `case` mapping is caught by reading rather than in production.

Given three logged rows between players P and Q:
1. `player_a=P, player_b=Q, outcome='a'` → P wins
2. `player_a=P, player_b=Q, outcome='draw'`
3. `player_a=Q, player_b=P, outcome='a'` → **Q** wins (Q is player_a here)

Expected for P: `wins 1, draws 1, losses 1, games 3, points 4, win_pct 50.0`
Expected for Q: identical — `points 4`, and the rank tie breaks on `win_pct`, which is also equal.

Confirm the `union all` second branch maps `outcome='a'` to a **loss** for `player_b`. Getting that branch backwards is the single most likely error in this file and it would silently invert every result.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_matrix_standings_view.sql
git commit -m "feat: add matrix_standings view deriving points and rank"
```

---

### Task 3: Client methods for standings and logging

**Files:**
- Modify: `src/data/supabase.ts`
- Modify: `src/globals.d.ts`

**Interfaces:**
- Consumes: the view and table from Tasks 1-2.
- Produces, on `supabaseService`:
  - `fetchMatrixStandings(schoolId?: string): Promise<Array<{ player_id: string; wins: number; draws: number; losses: number; games: number; points: number; win_pct: number; rank: number }> | null>`
  - `fetchMatrixLogs(schoolId?: string): Promise<Record<string, any>[] | null>`
  - `logMatrixResult(schoolId: string, result: { playerAId: string; playerBId: string; outcome: 'a' | 'b' | 'draw'; drillId?: string | null; scoreText?: string; occurredOn?: string }): Promise<{ ok: boolean; error?: string }>`

Follow the file's existing idiom exactly: guard on `isConfigured()`, `console.warn` and return `null` on error, never throw. These sit among ~45 sibling methods that all behave that way.

- [ ] **Step 1: Add the three methods**

Place them beside the other fetchers in `src/data/supabase.ts`:

```ts
  async fetchMatrixStandings(schoolId: string = 'bhs'): Promise<any[] | null> {
    if (!this.isConfigured()) return null;
    try {
      const uuid = await this.getSchoolUuid(schoolId);
      if (!uuid) return null;
      const { data, error } = await this.client!
        .from('matrix_standings')
        .select('*')
        .eq('school_id', uuid);
      if (error) { console.warn('Supabase fetchMatrixStandings notice:', error.message); return null; }
      return data;
    } catch (e) {
      console.warn('Supabase fetchMatrixStandings exception:', e);
      return null;
    }
  }

  async fetchMatrixLogs(schoolId: string = 'bhs'): Promise<any[] | null> {
    if (!this.isConfigured()) return null;
    try {
      const uuid = await this.getSchoolUuid(schoolId);
      if (!uuid) return null;
      const { data, error } = await this.client!
        .from('matrix_logs')
        .select('*')
        .eq('school_id', uuid)
        .eq('is_deleted', false)
        .order('occurred_on', { ascending: false });
      if (error) { console.warn('Supabase fetchMatrixLogs notice:', error.message); return null; }
      return data;
    } catch (e) {
      console.warn('Supabase fetchMatrixLogs exception:', e);
      return null;
    }
  }

  async logMatrixResult(schoolId: string, result: any): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Cloud database is not configured.' };
    try {
      const uuid = await this.getSchoolUuid(schoolId);
      if (!uuid) return { ok: false, error: 'Could not resolve the school.' };

      const payload: Record<string, any> = {
        school_id: uuid,
        player_a_id: result.playerAId,
        player_b_id: result.playerBId,
        outcome: result.outcome,
        score_text: result.scoreText || null,
        occurred_on: result.occurredOn || new Date().toISOString().slice(0, 10),
      };
      if (result.drillId && this.isUuid(result.drillId)) payload.drill_id = result.drillId;

      const { data, error } = await this.client!.from('matrix_logs').insert([payload]).select();
      if (error) {
        console.warn('Supabase logMatrixResult notice:', error.message);
        return { ok: false, error: error.message };
      }
      // An RLS denial returns no error and no rows. Report it rather than
      // letting the caller show a success message for a write that vanished.
      if (!data || data.length === 0) {
        return { ok: false, error: 'The database refused that write. Coach or admin access is required.' };
      }
      return { ok: true };
    } catch (e: any) {
      console.warn('Supabase logMatrixResult exception:', e);
      return { ok: false, error: e?.message || String(e) };
    }
  }
```

Note `logMatrixResult` returns `{ ok, error }` rather than `null` — deliberately different from its siblings, because the caller must be able to tell a refused write from a successful one. Every other write path in this app fails silently under RLS, which is a defect this one does not repeat.

- [ ] **Step 2: Declare them on the ambient interface**

In `src/globals.d.ts`, inside `interface SupabaseServiceLike`, beside `fetchRoles`:

```ts
    fetchMatrixStandings(schoolId?: string): Promise<Record<string, any>[] | null>;
    fetchMatrixLogs(schoolId?: string): Promise<Record<string, any>[] | null>;
    logMatrixResult(schoolId: string, result: Record<string, any>): Promise<{ ok: boolean; error?: string }>;
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: 0 errors.

Run: `npm run build`
Expected: succeeds. This is the check that catches an unresolvable import; typecheck alone does not.

Run: `npm test`
Expected: 25/25.

- [ ] **Step 4: Commit**

```bash
git add src/data/supabase.ts src/globals.d.ts
git commit -m "feat: add matrix standings and result-logging client methods"
```

---

### Task 4: Join standings onto players

**Files:**
- Modify: `public/js/app.core.js` (inside `syncFromSupabase()`)

**Interfaces:**
- Consumes: `fetchMatrixStandings()` from Task 3.
- Produces: every entry in `this.data.players` carries a `matrixStats` object shaped `{ wins, draws, losses, games, points, winPct, rank }`.

`players.matrix_stats` keeps its column — the roster export reads it — but stops being the source of truth. Standings come from the view.

- [ ] **Step 1: Add the join at the end of `syncFromSupabase()`**

Place this after the players block, before the closing of the `try`:

```js
      // Matrix standings are derived in Postgres from matrix_logs, not stored on
      // the player. Left-join them on: a player with no logged results produces
      // no standings row, and must still appear on the leaderboard as 0/0/0
      // rather than disappearing from it.
      //
      // This supersedes the `matrixStats: p.matrix_stats || {}` assignment in the
      // players mapping above (app.core.js:234). Leave that line alone — the
      // column is still read by the roster export — this simply overwrites the
      // in-memory value with the derived one.
      const dbStandings = await window.supabaseService.fetchMatrixStandings('bhs');
      const standingsById = new Map((dbStandings || []).map(s => [s.player_id, s]));
      const unrankedFrom = (dbStandings || []).length + 1;

      this.data.players.forEach(p => {
        const s = standingsById.get(p.id);
        p.matrixStats = s
          ? {
              wins: s.wins || 0, draws: s.draws || 0, losses: s.losses || 0,
              games: s.games || 0, points: s.points || 0,
              winPct: s.win_pct === null || s.win_pct === undefined ? null : Number(s.win_pct),
              rank: s.rank
            }
          : { wins: 0, draws: 0, losses: 0, games: 0, points: 0, winPct: null, rank: unrankedFrom };
      });
```

`winPct` is `null` — not `0` — for a player with no games. The leaderboard renders that as a dash, because 0% would claim they lost everything.

- [ ] **Step 2: Verify**

Run: `node --check public/js/app.core.js`
Expected: clean, no output. `npm run typecheck` does **not** cover this file.

Run: `npm test`
Expected: 25/25.

- [ ] **Step 3: Commit**

```bash
git add public/js/app.core.js
git commit -m "feat: join matrix standings onto players on sync"
```

---

### Task 5: Rebuild the leaderboard columns

**Files:**
- Modify: `public/js/views/matrix.view.js:30-60`

**Interfaces:**
- Consumes: `player.matrixStats` from Task 4.
- Produces: nothing later tasks depend on.

Current columns are RANK / PLAYER / POS / PRACTICE WINS / WIN % / MATRIX INDEX. `MATRIX INDEX` reads `matrixStats.drillScore`, which no longer exists in the new shape — the 0.7/0.3 blended index was dropped in favour of ranking on points.

- [ ] **Step 1: Replace the headers**

Locate the `<thead>` near line 30. Replace the six `<th>` cells with:

```html
                  <th>RANK</th>
                  <th>PLAYER</th>
                  <th>GP</th>
                  <th>W-D-L</th>
                  <th>PTS</th>
                  <th>%</th>
```

Games-played is what makes the percentage interpretable: 100% from one match is not the same claim as 80% from twenty.

- [ ] **Step 2: Replace the row body**

Replace the `.sort(...).map(...)` block (currently lines 41-60) with:

```js
                ${(() => {
                  // Hoisted: computing this inside the map would rescan every
                  // player for every row.
                  const leaderPts = Math.max(1, ...(this.data.players || []).map(x => x.matrixStats?.points || 0));
                  return (this.data.players || [])
                  .filter(p => !p.is_deleted && !p.isDeleted)
                  .sort((a, b) => (a.matrixStats?.rank || 999) - (b.matrixStats?.rank || 999))
                  .map(p => {
                    // Per-key defaults, not `p.matrixStats || {...}`. A player added
                    // through the UI before the next sync carries the OLD shape
                    // ({wins, losses, points, rank, drillScore}) with no games,
                    // draws or winPct — an object-level fallback would not fire and
                    // the row would render `undefined`.
                    const ms = p.matrixStats || {};
                    const m = {
                      wins: ms.wins || 0, draws: ms.draws || 0, losses: ms.losses || 0,
                      games: ms.games || 0, points: ms.points || 0,
                      winPct: (ms.winPct === undefined ? null : ms.winPct),
                      rank: ms.rank || 999
                    };
                    const barPct = Math.round((m.points / leaderPts) * 100);
                    return `
                  <tr>
                    <td>
                      ${m.games === 0
                        ? '<div class="rank-pill rank-other">&mdash;</div>'
                        : `<div class="rank-pill ${m.rank <= 3 ? 'rank-' + m.rank : 'rank-other'}">${m.rank}</div>`}
                    </td>
                    <td><strong>${p.name}</strong> <span class="text-muted">#${p.number || '—'}</span></td>
                    <td>${m.games}</td>
                    <td>${m.wins} - ${m.draws} - ${m.losses}</td>
                    <td><strong>${m.points}</strong></td>
                    <td>
                      ${m.winPct === null ? '<span class="text-muted">—</span>' : m.winPct.toFixed(1) + '%'}
                      <div class="score-progress">
                        <div class="score-bar" style="width: ${barPct}%;"></div>
                      </div>
                    </td>
                  </tr>`;
                  }).join('');
                })()}
```

The bar now shows points relative to the leader rather than the removed `drillScore`. A player with no games shows `—` for BOTH rank and percentage, not `0.0%` and not a number.

The rank dash matters more than it looks. `syncFromSupabase` assigns unlogged players
`rank = dbStandings.length + 1`, which is `1` when nothing has been logged yet — so without this
guard every player on the roster would be badged **#1** the first time a coach opens the
leaderboard. Rendering a dash when `games === 0` says "not ranked yet", which is the truth. The
numeric rank is still used for sorting, so unlogged players continue to sort below ranked ones.

- [ ] **Step 3: Confirm no reference to the removed field survives**

Run: `grep -n "drillScore" public/js/views/matrix.view.js`
Expected: no output.

Run: `grep -rn "drillScore" public/js/ | grep -v admin.js`
Expected: no output outside `admin.js` (the roster export still writes it and is out of scope).

- [ ] **Step 4: Verify**

Run: `node --check public/js/views/matrix.view.js`
Expected: clean.

Run: `npm test`
Expected: 25/25.

- [ ] **Step 5: Commit**

```bash
git add public/js/views/matrix.view.js
git commit -m "feat: leaderboard shows GP, W-D-L, points and percentage"
```

---

### Task 6: Replace the stub form

**Files:**
- Modify: `index.html:88-122` (the whole `#addDrillScoreModal` block)
- Modify: `public/js/admin.js` (`openAddDrillModal`, around line 728)

**Interfaces:**
- Consumes: `logMatrixResult()` from Task 3; `this.data.players` and `this.data.drillsBank`.
- Produces: `app.submitMatrixResult()`, bound to the form's submit.

The current form is a stub. Its `onsubmit` is `alert('Practice drill score logged successfully! Matrix leaderboard updated.')` followed by `closeModals()` — **it saves nothing**, and its player list is six hardcoded demo names who are not on the roster.

- [ ] **Step 1: Replace the modal markup**

Replace the whole `#addDrillScoreModal` block. **Locate it by its id, not by line number** —
it currently spans lines 88 to 122, and the block ends with THREE closing tags in sequence:
`</form>`, then `</div>` for `.modal-window`, then `</div>` for `.modal-overlay`. Deleting one
too few leaves a stray `</div>` that silently breaks the page structure for everything after it;
one too many closes a parent element early. Count them before and after.

```html
  <div id="addDrillScoreModal" class="modal-overlay">
    <div class="modal-window">
      <div class="modal-header">
        <h3>RECORD DRILL RESULT</h3>
        <button class="close-btn">&times;</button>
      </div>
      <form onsubmit="event.preventDefault(); app.submitMatrixResult();">
        <div class="form-group">
          <label>Drill (optional)</label>
          <select class="form-control" id="matrixDrill"></select>
        </div>
        <div class="form-group">
          <label>Player A</label>
          <select class="form-control" id="matrixPlayerA" required></select>
        </div>
        <div class="form-group">
          <label>Player B</label>
          <select class="form-control" id="matrixPlayerB" required></select>
        </div>
        <div class="form-group">
          <label>Result</label>
          <select class="form-control" id="matrixOutcome" required>
            <option value="a">Player A won</option>
            <option value="b">Player B won</option>
            <option value="draw">Draw</option>
          </select>
          <p class="text-muted" style="font-size:0.78rem; margin:6px 0 0 0;">
            Win 3 points, draw 1, loss 0. Ranking is by total points.
          </p>
        </div>
        <div class="form-group">
          <label>Score (optional)</label>
          <input type="text" class="form-control" id="matrixScoreText" placeholder="e.g. 3 - 2" />
        </div>
        <div class="form-group">
          <label>Date</label>
          <input type="date" class="form-control" id="matrixOccurredOn" required />
        </div>
        <div id="matrixFormError" style="color: var(--color-danger); font-size:0.85rem; margin-bottom:8px;"></div>
        <button type="submit" class="btn btn-gold" style="width: 100%; margin-top: 10px;">💾 Record Result</button>
      </form>
    </div>
  </div>
```

The selects are **empty** — the app fills them from live data when the modal opens. That is the whole point: hardcoded options are what made the old form show players who do not exist.

- [ ] **Step 2: Populate the form when the modal opens**

Replace `openAddDrillModal()` in `public/js/admin.js`:

```js
  openAddDrillModal() {
    const players = (this.data.players || [])
      .filter(p => !p.is_deleted && !p.isDeleted)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    const playerOptions = players
      .map(p => `<option value="${p.id}">${p.name}${p.number ? ' (#' + p.number + ')' : ''}</option>`)
      .join('');

    const drillOptions = '<option value="">— none —</option>' + (this.data.drillsBank || [])
      .filter(d => !d.is_deleted && !d.isDeleted)
      .map(d => `<option value="${d.id}">${d.name}</option>`)
      .join('');

    const a = document.getElementById('matrixPlayerA');
    const b = document.getElementById('matrixPlayerB');
    const drill = document.getElementById('matrixDrill');
    const when = document.getElementById('matrixOccurredOn');
    const err = document.getElementById('matrixFormError');

    if (a) a.innerHTML = playerOptions;
    if (b) b.innerHTML = playerOptions;
    if (drill) drill.innerHTML = drillOptions;
    if (when) when.value = new Date().toISOString().slice(0, 10);
    if (err) err.textContent = '';

    // Default B to a different player so the "same player twice" guard is not
    // the first thing a coach meets.
    if (b && b.options.length > 1) b.selectedIndex = 1;

    if (players.length < 2 && err) {
      err.textContent = 'At least two players are needed to record a head-to-head result.';
    }

    const modal = document.getElementById('addDrillScoreModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },
```

- [ ] **Step 3: Add the submit handler**

Add beside `openAddDrillModal` in `public/js/admin.js`:

```js
  async submitMatrixResult() {
    const err = document.getElementById('matrixFormError');
    const set = (msg) => { if (err) err.textContent = msg; };

    const playerAId = document.getElementById('matrixPlayerA')?.value;
    const playerBId = document.getElementById('matrixPlayerB')?.value;
    const outcome   = document.getElementById('matrixOutcome')?.value;
    const drillId   = document.getElementById('matrixDrill')?.value || null;
    const scoreText = document.getElementById('matrixScoreText')?.value.trim();
    const occurredOn = document.getElementById('matrixOccurredOn')?.value;

    if (!playerAId || !playerBId) return set('Pick both players.');
    if (playerAId === playerBId) return set('A player cannot play themselves. Pick two different players.');
    if (!occurredOn) return set('Pick the date the result happened.');

    set('Recording…');
    const res = await window.supabaseService.logMatrixResult('bhs', {
      playerAId, playerBId, outcome, drillId, scoreText, occurredOn
    });

    if (!res.ok) return set(res.error || 'Could not record that result.');

    // Standings are derived in Postgres, so the leaderboard only changes after
    // a re-read. Without this the coach records a result and sees nothing move.
    await this.syncFromSupabase();
    this.renderCurrentView();
    this.closeModals();
  },
```

The guard against picking the same player twice matters: the database has a `check (player_a_id <> player_b_id)` constraint, so without it the insert fails with a raw Postgres error.

- [ ] **Step 4: Verify**

Run: `node --check public/js/admin.js`
Expected: clean.

Run: `grep -c "Practice drill score logged successfully" index.html`
Expected: `0` — the fake success alert is gone.

Run: `grep -c "Alex Rivera" index.html`
Expected: `0` — the hardcoded demo players are gone.

Run: `npm run build`
Expected: succeeds.

Run: `npm test`
Expected: 25/25.

- [ ] **Step 5: Commit**

```bash
git add index.html public/js/admin.js
git commit -m "feat: replace the stub drill-score form with a real one"
```

---

### Task 7: End-to-end verification

**Files:** none — this task changes nothing.

**Interfaces:**
- Consumes: everything above.

Both migrations must be applied by the human before this task can run. Do not attempt to apply them.

- [ ] **Step 1: Confirm the migrations are applied**

Ask the human to run, and report the output:

```sql
select count(*) as logs from public.matrix_logs;
select count(*) as standings_rows from public.matrix_standings;
```

Expected before any result is recorded: both `0`. If `matrix_standings` errors with "relation does not exist", migration 0003 has not been applied.

- [ ] **Step 2: Record a result through the UI**

The human signs in as a coach or admin, opens Matrix → **+ Record Practice Drill Scores**, picks two real players from their roster, selects a winner, and submits.

Expected: the modal closes and the leaderboard updates immediately — the winner shows `1` game, `1-0-0`, `3` points, `100.0%`; the loser shows `1` game, `0-0-1`, `0` points, `0.0%`.

Failure to watch for: an error reading *"The database refused that write. Coach or admin access is required."* means RLS is rejecting the insert. That is a real finding, not a UI bug — report it rather than working around it.

- [ ] **Step 3: Verify the draw path**

Record a second result between the same two players, outcome **Draw**.

Expected: both players show `2` games, `1-1-0` and `0-1-1`, and points `4` and `1` respectively. Both ranks recompute.

- [ ] **Step 4: Verify unlogged players still appear**

Expected: every other player on the roster is still listed, showing `0` games, `0-0-0`, `0` points and `—` for percentage. **A player vanishing from the leaderboard because they have no results is a bug** — it means the left-join in Task 4 is not working.

- [ ] **Step 5: Report**

Record what passed, what failed, and anything unverifiable. Do not claim a browser check you did not perform.

---

## Self-Review

**Spec coverage.** Head-to-head schema with draws → Task 1. Derived points, never stored → Tasks 1-2. `security_invoker` → Task 2. `nullif` fixing the `NaN%` bug → Task 2. Ranking by points, tiebroken by percentage → Task 2. `players.matrix_stats` retained but no longer written → Task 4. Left-join so unlogged players still appear → Tasks 4 and 7. Leaderboard columns Rank/Player/GP/W-D-L/PTS/% with the bar showing points relative to the leader → Task 5. Stub form replaced with a real coach-only form → Task 6. `drill_id` as `on delete set null` → Task 1.

**Deliberately out of scope**, and stated so the reader is not surprised: the store/repository layer (Phase 2) — this phase writes through `window.supabaseService` as the rest of `public/js` does. The `matrixLogs` phantom key in the roster export (`admin.js`) also stays as-is; it belongs with the Phase 2 collection work.

**Interface consistency.** `fetchMatrixStandings` / `fetchMatrixLogs` / `logMatrixResult` are defined in Task 3 and consumed under exactly those names in Tasks 4 and 6. The `matrixStats` shape produced in Task 4 — `{ wins, draws, losses, games, points, winPct, rank }` — is consumed under those exact keys in Task 5. `winPct` is `null` (never `0`) for a player with no games in both the producer and the consumer.
