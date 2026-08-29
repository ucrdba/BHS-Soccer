# Phase 3 (Competitive Matrix) — migration runbook

Applies `supabase/migrations/0002_rebuild_matrix_logs.sql` and
`0003_matrix_standings_view.sql` by hand in the Supabase SQL editor, then verifies them.

No agent in this project has DDL access — only the publishable anon key, which cannot execute
DDL. Every step below is run by a human.

---

## ⚠️ Order is load-bearing, and re-running 0002 is destructive

`0002` begins with `drop table if exists public.matrix_logs cascade`.

`matrix_standings` (created by `0003`) selects from `matrix_logs`, so it is a dependent object.
**Re-running `0002` after `0003` silently drops the view** — `cascade` removes it without warning
or error, and the app's leaderboard then returns nothing while every other check still passes.

- Run `0002`, then `0003`. Once.
- If you ever need to re-run `0002`, you **must** re-run `0003` immediately after it.

---

## Step 1 — Pre-check: confirm there is nothing to lose

`0002` drops and recreates the table. It is only safe because the table is empty.

```sql
select count(*) from public.matrix_logs;
```

**Expected: `0`.**

**If it returns anything other than 0, STOP.** Do not run `0002`. Rows exist that the migration
was not written to preserve, and they will be destroyed. Report the count instead.

## Step 2 — Apply 0002

Paste the full contents of `supabase/migrations/0002_rebuild_matrix_logs.sql` and run it.

Expected: success, no rows returned.

## Step 3 — Apply 0003

Paste the full contents of `supabase/migrations/0003_matrix_standings_view.sql` and run it.

Expected: success, no rows returned.

---

## Step 4 — Verify the structure

### 4a. The view exists AND is security_invoker

This is the single most important check on this page. `security_invoker = true` is what makes the
view honour the caller's RLS. Without it the view runs with its owner's privileges and reads
`matrix_logs` **bypassing row-level security entirely**.

```sql
select c.relname, c.reloptions
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname = 'matrix_standings';
```

**Expected:** one row, `reloptions` containing `security_invoker=true`.

**Failure symptom:** `reloptions` is `NULL` or omits `security_invoker`. The view is then an RLS
bypass. Drop it (`drop view public.matrix_standings;`) and re-run `0003` — do not leave it in place.

### 4b. RLS is enabled on the rebuilt table

`drop table ... cascade` removed the old policies along with the table. `0002` re-creates them, but
confirm rather than assume — a table with RLS disabled is readable and writable by anyone.

```sql
select relname, relrowsecurity
  from pg_class
 where relname = 'matrix_logs';
```

**Expected:** `relrowsecurity = true`.

### 4c. Both policies came back

```sql
select policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'matrix_logs'
 order by policyname;
```

**Expected:** exactly two rows — `matrix_logs_select` (`SELECT`) and `matrix_logs_write` (`ALL`).

**Failure symptom:** only `matrix_logs_select` present. Coaches will then be unable to record a
result: the insert returns no error and no rows, and the form shows
"The database refused that write. Coach or admin access is required."

### 4d. The self-play guard exists

```sql
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.matrix_logs'::regclass and contype = 'c';
```

**Expected:** a check for `outcome in ('a','b','draw')` and a check for `player_a_id <> player_b_id`.
The client guards the same-player case too; this is the backstop if that guard is ever bypassed.

### 4e. The view returns an empty set, not an error

```sql
select * from public.matrix_standings;
```

**Expected: zero rows and no error.** No result has been logged yet, so emptiness is correct.
An *error* here means the view is malformed.

---

## Step 5 — Hand off to Task 7 (browser verification)

Structure is now verified; behaviour is not. Nothing in Phase 3 has ever executed against a
database — no standings row has ever existed, and the form has never been submitted.

Task 7 is where that gets established, in a browser, signed in as a coach.
