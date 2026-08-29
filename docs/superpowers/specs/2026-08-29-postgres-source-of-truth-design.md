# Postgres as Source of Truth — Design

**Date:** 2026-08-29
**Status:** Approved for planning
**Branch:** `feat/typescript`

## Problem

Application data lives in two places at once. `localStorage` holds a full copy seeded from
`DEFAULT_BHS_DATA` in `js/data.js`; Supabase holds another. Neither is authoritative, and
nothing reconciles them.

Nine of thirteen entities already have working read and write paths to Postgres. The
remaining work is not "move data to the database" — most of it is already there. It is
closing three genuine gaps (users, competitive matrix, quiz questions) and fixing the
dual-source model that makes the existing nine unreliable.

## Where we stand

Verified against the live database on 2026-08-29 by read-only REST probes using the anon
key committed in `supabaseClient.js`.

`supabase_migration_auth.sql` **has been applied**. Confirmed by probing
`quiz_questions.is_deleted`, a column only that migration adds: it returns 200, while a
control query for a nonexistent column returns `42703`. RLS is hardened and `profiles` is
linked to `auth.users`.

| Table | Rows | State |
| --- | --- | --- |
| `schools` | 7 | 4 are `diag_*` pollution; real: `bhs`, `abc`, `vhs` |
| `players` | 7 | real |
| `schedule` | 6 | real |
| `drills_bank` | 10 | real |
| `practice_plans` | 27 | real, but plan grouping is encoded in a text prefix |
| `soccer_categories` | 25 | real |
| `coaches` | 2 | real |
| `roles` | 4 | populated with a 15-permission JSONB matrix; never read by the app |
| `profiles` | 2 | real `auth.users` UUIDs — one `admin`/`active`, one `guest`/`pending_verification` |
| `matrix_logs` | 0 | never written |
| `daily_thoughts` | 0 | never written |
| `quiz_questions`, `quiz_attempts`, `player_answers` | 0 | never written |

### The three real gaps

**Users.** The browser loads `auth.js`, which is still fake client-side auth over
`SAMPLE_USERS` and `localStorage`. `loginUser()` looks a user up by email and logs them
in — **the password argument is never checked**. Real Supabase Auth exists in
`src/auth.ts`, but nothing loads `src/`, so commit `999b26a`'s security hardening has
never run. Two real accounts exist in the database and are unreachable through the UI.

**Competitive matrix.** `matrix_logs` is never read or written. `players.matrix_stats`
renders as read-only seed numbers. The "Record Drill Score" form at `index.html:94`
submits `alert('Practice drill score logged successfully!')` — a literal stub. Ranks have
never been computed from a real result.

**Quiz.** The five questions are hardcoded HTML with `name="q1"`…`q5`. There are no real
question ids, but `player_answers.question_id` is a UUID foreign key to `quiz_questions`,
so every submit violates the constraint. `quiz_attempts` has 0 rows because the feature
has never once saved successfully.

### The structural defect

`localStorage` is a parallel source of truth, not a cache.

`loadData()` reads `localStorage` first, and `syncFromSupabase()` overwrites a collection
only `if (rows.length > 0)`. An empty table and an unreachable database are therefore
indistinguishable. This is live right now: `daily_thoughts` has 0 rows in Postgres, so
every browser shows the hardcoded seed thought and always will.

Every mutation dual-writes — mutate `this.data`, call `saveData()`, then separately call
`upsertX()`. A failed upsert is a `console.warn`, so the two copies diverge silently.
Deletes are soft in Postgres but spliced locally, so a failed remote delete resurrects on
the next sync.

## Goals

- Postgres is the single source of truth. `localStorage` becomes a cache and never a seed.
- Close the users, matrix, and quiz gaps.
- Distinguish "empty", "offline", and "denied" from one another everywhere.
- Real authentication actually running, with permissions driven by the `roles` table.

## Non-goals

- Completing the TypeScript port of `planner.view.js` and `admin.js` (2,380 and 1,327
  lines). Explicitly deferred.
- An offline write queue with replay. Read-only when offline is sufficient.
- A `bootstrap()` RPC to collapse the nine sequential round-trips on load. Real, but
  separable, and easier once repositories exist.
- Multi-tenant expansion beyond cleaning up the `diag_*` rows.

## Decisions

1. **Scope:** close the gaps *and* fix the source-of-truth model.
2. **Code tree:** hybrid. Module-ize the data layer only; view files stay classic scripts.
3. **Offline:** cached read-only. Cache is written only from successful fetches, never seeded.
4. **Matrix:** head-to-head 1v1 with draws. Win 3, draw 1, loss 0.
5. **Ranking:** by total points; percentage displayed as a performance indicator, not ranked on.
6. **Roles:** `roles.permissions` drives the UI; RLS keeps four fixed role names as the enforcement backstop.

## Architecture

### Module boundary and boot sequence

`src/main.ts` is added to `index.html` as `<script type="module">` before the existing
classic tags. It installs exactly three globals: `window.auth` (from `src/auth.ts`),
`window.store` (the repository layer), and `window.supabaseService` (a back-compat facade
so unmigrated call sites keep working).

The ordering is sound without reordering anything. Classic scripts execute during parse;
module scripts are deferred and execute after parse but before `DOMContentLoaded`; and
`js/utils.js` boots the app on `DOMContentLoaded`. The module therefore always finishes
installing globals before `new BHSSoccerApp()` runs.

This works because all 43 `window.auth.*` call sites in `js/` are explicitly namespaced,
and `js/` contains no parse-time references to `auth` or `supabaseService` — the only
top-level declaration anywhere in `js/` is `DEFAULT_BHS_DATA`.

Retired immediately: `auth.js` (fake auth), `supabaseClient.js` (ported to
`src/data/supabase.ts`), and `app.js` (already dead). Note the distinction: the *file*
`supabaseClient.js` is deleted, while the *global name* `window.supabaseService` survives
as a facade over the new client until the last call site migrates. Deleting the file does
not break the ~40 existing callers.

**Prerequisites.** Node must be upgraded to ≥20.19; Vite 8 refuses to start on the
installed v14, and a `.ts` entry point cannot be served without it. `js/` moves to
`public/js/` so Vite copies it verbatim to the dist root, which also repairs the currently
broken `dist/` build with no path edits.

### Store and repositories

```
src/data/
  supabase.ts     typed client (port of supabaseClient.js) — raw row I/O only
  cache.ts        versioned localStorage, one key per collection
  store.ts        collections + status, owns app.data
  repo.ts         base repository (fetch / save / softDelete)
  repos/          players, schedule, drills, practicePlans, coaches,
                  dailyThoughts, categories, schools, matrix, quizQuestions, roles
```

```ts
type CollectionState<T> = {
  rows: T[];
  status: 'loading' | 'ready' | 'stale' | 'error';
  fetchedAt: number | null;
  error: string | null;
};
```

`ready` means fetched from Postgres this session, **including a legitimately empty table**.
`stale` means serving cache because the fetch failed. `error` means failed with no cache.

The governing rule, and the fix for the whole bug class: **`rows.length === 0` is never a
reason to fall back to anything.**

Cache keys are versioned per collection (`bhs.cache.v1.players`), replacing the single
`bhs_soccer_app_data` blob. On first run that old blob is renamed to a dated backup key
rather than imported, so nothing local is destroyed but stale seed data cannot re-pollute
Postgres. `DEFAULT_BHS_DATA` is deleted from the shipped code.

**The write path inverts today's order: Postgres first, local second.** `repo.save()`
writes to Postgres and only updates the store and cache on success. On failure the store
re-renders from its own state, discarding the optimistic local edit and surfacing a real
error. Soft deletes use the same path, so a failed delete no longer resurrects.

While any collection is `stale` or `error`, writes are disabled app-wide and a staleness
banner shows.

**Migration is incremental because `app.data` stays genuinely mutable.** Views currently
perform 21 array mutations, 38 reassignments, and 35 `saveData()` calls directly against
`this.data`, so a read-only getter shim would break them. Instead the store owns
`app.data`, views keep their optimistic mutations, and the store reconciles. Each entity
then migrates independently — `this.data.players.push(x); this.saveData();
supabaseService.upsertPlayer(...)` becomes `await store.players.save(x)` — while
unmigrated entities keep working through the facade, with `saveData()` redefined to write
the cache.

Three keys referenced by the export code exist nowhere in `AppData` and become real
collections: `matrixLogs`, `userProfiles`, `quizAttempts`.

### Auth and permissions

`src/auth.ts` covers 12 of the 14 methods `js/` calls. Two problems must be handled
deliberately.

**Seven methods change from sync to async** — `getPendingApprovals` (4), `loginUser` (2),
`registerUser` (2), `verifyUserOtp` (2), `approveUserAccess` (2), `logout` (2),
`rejectUserAccess` (1) — exactly 15 call sites. The failure mode is silent: a returned
Promise is
truthy, so `res.success` is `undefined` and the code takes the else branch. Nothing
throws. Every site must be found and fixed by hand.

**`switchRole` is removed** (2 call sites). The demo role-switcher is incompatible with
real auth: a user cannot change their own role client-side, and
`guard_profile_privileged_columns` blocks it server-side regardless. It is replaced by
logging in. This is a visible removal from the header.

The account lifecycle already exists in database triggers — `handle_new_user` creates the
profile as `pending_verification`, `handle_user_confirmed` promotes to `pending_approval`,
an admin approves to `active`. The client only drives it; no new SQL is needed.

Permissions move to `src/auth/permissions.ts`, with `roles` as a cached collection. The 16
hardcoded guard call sites — `isCoach` (7), `canAccessRatings` (5), `isAdmin` (3),
`getRole` (1) — become `can('can_modify_roster')` checks reading the existing JSONB.
`auth.isCoach()` remains as a thin convenience over `can()`, so not every site must change
at once.

**Security fix.** `profiles_select` is currently `using (is_deleted = false)` with no
further restriction, so any anonymous visitor can read every profile row including email
and role. Tightened to:

```sql
create policy "profiles_select" on public.profiles for select
  using (is_deleted = false and (
    id = auth.uid() or public.current_profile_role() in ('coach','admin')
  ));
```

Anonymous users see nothing, a player sees only themselves, coaches and admins see
everything the approval queue needs. Nothing public reads `profiles`, so no view breaks.

Authentication requires the network, so a `stale` or `error` session is guest-level and
read-only.

### Competitive matrix

`matrix_logs` has 0 rows, so it is rebuilt rather than migrated.

```sql
create table public.matrix_logs (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id)     on delete cascade,
  drill_id     uuid          references public.drills_bank(id) on delete set null,
  player_a_id  uuid not null references public.players(id)     on delete cascade,
  player_b_id  uuid not null references public.players(id)     on delete cascade,
  outcome      text not null check (outcome in ('a','b','draw')),
  score_text   text,
  occurred_on  date not null default current_date,
  logged_by    uuid references public.profiles(id) on delete set null,
  is_deleted   boolean default false,
  created_at   timestamptz default now(),
  check (player_a_id <> player_b_id)
);
```

Participants are symmetric so a draw is representable. `outcome` is text-with-check rather
than an enum, because Postgres enums are painful to alter and adding a 2v2 or fitness
outcome later should be a one-line constraint change. Points are **derived** from
`outcome`, never stored, so they cannot contradict the recorded result.

One deliberate change from the original table: `drill_id` is `on delete set null` rather
than `on delete cascade`. Retiring a drill from the library must not erase the match
history played under it.

RLS needs no work: the existing uniform policy loop already covers `matrix_logs` with
public read and coach/admin write.

```sql
create view public.matrix_standings with (security_invoker = true) as
with sides as (
  select school_id, player_a_id as player_id,
         case outcome when 'a'    then 1 else 0 end as w,
         case outcome when 'draw' then 1 else 0 end as d,
         case outcome when 'b'    then 1 else 0 end as l
    from public.matrix_logs where coalesce(is_deleted,false) = false
  union all
  select school_id, player_b_id,
         case outcome when 'b'    then 1 else 0 end,
         case outcome when 'draw' then 1 else 0 end,
         case outcome when 'a'    then 1 else 0 end
    from public.matrix_logs where coalesce(is_deleted,false) = false
)
select player_id, school_id,
       sum(w) as wins, sum(d) as draws, sum(l) as losses,
       count(*) as games,
       3*sum(w) + sum(d) as points,
       round(100.0*(sum(w) + 0.5*sum(d))/nullif(count(*),0), 1) as win_pct,
       rank() over (partition by school_id
                    order by 3*sum(w) + sum(d) desc,
                             (sum(w) + 0.5*sum(d))/nullif(count(*),0) desc nulls last)
         as rank
  from sides
 group by player_id, school_id;
```

`security_invoker = true` is required; without it the view runs as owner and bypasses RLS.

**Ranking is by total points, tiebroken by percentage.** Points measure consistency —
showing up and accumulating. Percentage measures performance, and is displayed rather than
ranked on, so a high percentage over few games reads as a player who will climb once they
play more. The `0.7/0.3` blended index from `implementation_plan.md` is dropped.

`nullif` also fixes a live bug: `matrix.view.js:53` computes `wins/(wins+losses)` in
JavaScript, rendering `NaN%` for any player with no results.

`players.matrix_stats` stops being written and becomes derived. The **column is retained**
— it is read by the roster export and dropping it would need a coordinated change there —
but nothing writes it, and the store populates the in-memory `matrixStats` shape from the
standings view instead. The store joins standings onto player objects so
`player.matrixStats.wins` still resolves, keeping all six call sites in `matrix.view.js`
working. Because ranks are recomputed from the log, a
mis-entered result can be corrected rather than baked permanently into JSONB.

Players with no logged results produce no rows in the view, so the store left-joins
players onto standings — unlogged players show 0/0/0 and rank last rather than vanishing
from the roster.

**Leaderboard columns change** to Rank · Player · GP · W-D-L · PTS · %, with the bar
showing points relative to the leader. Games-played is what makes the percentage
interpretable. The stub form at `index.html:94` becomes a real coach-only form writing
through `store.matrix.log()`.

### Remaining gaps

**Quiz.** Seed `quiz_questions` with the existing five questions, render the form from
database rows, and submit real UUIDs. The write path in `saveQuizAttempt` is otherwise
correct.

**Diagnostic pollution.** `runFullDatabaseDiagnostic()` carries a literal
`cleanupStatus: 'SKIPPED'` — it inserts probe rows into every table and never removes
them, adding a `diag_*` school on every run. Probe rows are deleted in a `finally` block,
plus a one-time cleanup of the four existing rows.

**Practice plan grouping.** `practice_plans.name` is the *drill* name; plan membership is
smuggled into `coach_notes` as a `[Plan: X]` prefix and parsed by regex at
`app.core.js:145`. Add real `plan_name` and `plan_date` columns, backfill once by parsing
the prefix, then strip it from `coach_notes`. A parent `practice_plan_sets` table is not
warranted — two columns solve it and plans have no metadata of their own yet.

**Daily thoughts import.** Nine real pieces exist in `Thoughts 4 the day/*.docx` as
numbered chapters. Extraction needs no new dependency (`unzip -p <f> word/document.xml`,
strip tags). The `~$1.docx` Office lock file is skipped.

**Missing deletes.** `schools` and `soccer_categories` gain soft-delete for parity.

### Error handling

RLS filters SELECTs silently — an expired session returns 200 with fewer rows, not a 403.
Combined with "empty is a legitimate `ready` state", that would render an expired coach
session as an empty roster.

The store therefore records auth state alongside each fetch. A collection returning empty
while the session is invalid resolves to `error`, not `ready`. Writes are simpler: RLS
denial returns a real 403 and surfaces as a permission error.

Three states, never conflated:

| State | Meaning | Behavior |
| --- | --- | --- |
| `stale` | offline, cache available | cached rows, writes disabled, banner |
| denied | RLS rejected the operation | explicit permission error |
| `ready` + empty | genuinely no rows | empty-state UI |

### Verification

No test framework exists today. Node ≥20 is already a prerequisite, which makes **Vitest**
free to adopt alongside Vite 8.

Unit-tested, all pure and fast: cache versioning and invalidation, the status transitions
above, snake_case↔camelCase row mapping (hand-written per field and the likeliest place
for silent data loss), and standings math.

The standings view is tested in SQL with fixture rows inserted in a transaction that rolls
back, asserting wins, draws, losses, points, and rank against known inputs — where a
`case` typo would otherwise go unnoticed.

The rewritten diagnostic, once it cleans up after itself, becomes a genuine end-to-end
smoke test.

### Migrations

Root-level ad-hoc `.sql` files do not work at this size. New numbered files under
`supabase/migrations/NNNN_*.sql`, applied in order, each documenting its rollback. The
four existing files remain historical provisioning scripts, exactly as
`supabase_migration_auth.sql` already treats them.

Ordered by risk, lowest first:

1. `quiz_questions` seed, `diag_*` cleanup (additive)
2. `practice_plans` columns and backfill (reversible)
3. `matrix_logs` rebuild and `matrix_standings` view (table is empty)
4. `profiles` RLS tightening (policy swap, reversible)
5. `daily_thoughts` import and policy

## Phases

Each phase is independently shippable and independently verifiable.

0. Node upgrade, `js/` → `public/js/`, Vite dev running, Vitest installed.
1. Module boundary, store, auth cutover — including the 15 sync→async call sites.
2. Entity-by-entity migration onto repositories.
3. Matrix schema, standings view, real logging form.
4. Quiz, thoughts import, cleanup, export fixes.

## Decisions taken on the user's behalf

These were not explicitly confirmed and are cheap to reverse. Flagged for review.

- **`daily_thoughts` read access is restricted to coach and player.** The imported `.docx`
  content reads as book excerpts, and the table currently has public read RLS, which would
  expose all nine in full to anonymous visitors. Reverting to public read is a one-line
  policy change.
- **Displayed percentage uses `(wins + 0.5×draws)/games`**, the standard sporting
  convention, rather than `points/(3×games)`. Since percentage no longer feeds ranking, the
  difference is presentational.
- **Tiebreak on percentage** when points are equal.
