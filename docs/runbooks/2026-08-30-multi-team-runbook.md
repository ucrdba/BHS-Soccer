# Multi-team support (Phase 1) — migration runbook

Applies `supabase/migrations/0005_multi_team_schema.sql` and
`0006_drop_player_team_columns.sql` by hand in the Supabase SQL editor, then verifies them.

No agent in this project has DDL access — only the publishable anon key, which cannot execute
DDL. Every step below is run by a human.

---

## ⚠️ Order is load-bearing: a deploy sits between the two migrations

`0005` **adds** `team_id` to `schedule` and `matrix_logs` and copies `players.number` /
`position` / `season_stats` / `ratings` into new `team_players` rows, but it leaves the original
`players` and `schedule`/`matrix_logs` `school_id` columns in place. `0006` is what actually
deletes those originals.

That gap between the two files exists on purpose, to hold a deploy window:

1. Apply `0005`.
2. **Deploy the application change** that reads and writes `team_players` /
   `team_id` instead of `players.number` / `players.season_stats` / `school_id`.
3. Run the eight checks below against the live database.
4. Only once all eight pass, apply `0006`.

**If `0006` is applied before the application deploy lands**, the still-old code keeps writing to
`players.number` and `players.season_stats` — columns `0006` has already dropped — and every one
of those writes fails. Worse, if the deploy is skipped entirely and `0006` runs anyway, the data
`0005` copied into `team_players` is the last copy that ever existed of the old columns; there is
no rollback for `0006` (see the warning at the top of that file). Do not apply `0006` out of
sequence.

---

## Step 1 — Apply 0005

Paste the full contents of `supabase/migrations/0005_multi_team_schema.sql` and run it.

Expected: success, no rows returned. This step is additive only — it adds a column, creates three
tables, replaces two functions, adds a nullable `team_id` column to two existing tables, and
backfills data. Nothing existing is dropped.

## Step 2 — Deploy the application change

Deploy the code that reads/writes `team_players` and `team_id` (Task 3 of this plan). Do not
proceed to Step 4 (`0006`) until this is live.

## Step 3 — Run the eight checks (below)

Do this against the live, deployed application's database — not before the deploy in Step 2.

## Step 4 — Apply 0006

Only after every check in Step 3 passes. Paste the full contents of
`supabase/migrations/0006_drop_player_team_columns.sql` and run it.

Expected: success, no rows returned. This step is destructive and has no rollback.

---

## The eight checks

Run these after `0005` is applied and the code from Step 2 is deployed, before applying `0006`.

### 1. One team per organization is enforced

As any authenticated coach, insert a `team_players` row for a player who is already rostered on
another team **in the same school** (same `school_id`, different `team_id`):

```sql
insert into public.team_players (team_id, school_id, player_id)
values ('<a-different-team-id-same-school>', '<that-school_id>', '<a-player-id-already-on-a-team-there>');
```

**Expected: fails**, unique constraint violation on `team_players_school_id_player_id_key`
(the `unique (school_id, player_id)` constraint).

**Symptom if it succeeds:** the one-team-per-organization rule is not enforced and rosters will
diverge — the same player could quietly appear on two teams within one school.

### 2. The same player, a different school, succeeds

Insert that same player onto a team belonging to a **different** `school_id` (e.g. the club,
`vhs`, rather than `bhs`):

```sql
insert into public.team_players (team_id, school_id, player_id)
values ('<a-team-id-in-a-different-school>', '<that-different-school_id>', '<same-player-id>');
```

**Expected: succeeds.** One person, one row per organization, is the whole point of the schema —
a player can be on a school team and a club at once.

### 3. The composite FK rejects a mismatched school_id

Insert a `team_players` row whose `school_id` disagrees with the `team_id`'s own `school_id`:

```sql
insert into public.team_players (team_id, school_id, player_id)
values ('<some-team-id>', '<a-school_id-that-is-NOT-that-team-s-school_id>', '<any-player-id>');
```

**Expected: fails**, foreign key violation on `team_players_team_id_school_id_fkey` (the
`foreign key (team_id, school_id) references public.teams (id, school_id)` constraint).

**Symptom if it succeeds:** `team_players.school_id` can drift from the team it names, and the
`unique (school_id, player_id)` guard in check 1 becomes meaningless — it would be enforcing
uniqueness against a value that no longer reliably identifies the organization.

### 4. The backfill copied every row correctly

```sql
select count(*) from public.team_players;   -- expect 11
select count(*) from public.players;        -- expect 11
```

Then confirm the copy is faithful, not just the right count:

```sql
select p.id, p.number, tp.number, p.season_stats, tp.season_stats, p.ratings, tp.ratings
  from public.players p
  join public.team_players tp on tp.player_id = p.id
 where p.number is distinct from tp.number
    or p.season_stats is distinct from tp.season_stats
    or p.ratings is distinct from tp.ratings;
```

**Expected:** both counts are `11`, and the mismatch query returns zero rows.

**Symptom if it fails:** any mismatch (wrong count or a differing row) means the copy is
incomplete or wrong. **Do not apply `0006`** — it would permanently delete the only other copy
of that data.

### 5. `is_team_coach` gates writes per team, not globally

Sign in as a coach who is in `team_coaches` for team A but not team B (two teams in different
schools, or two teams in the same school — either demonstrates the gate).

```sql
-- As that coach:
update public.team_players set position = position where team_id = '<team-A-id>';
update public.team_players set position = position where team_id = '<team-B-id>';
```

(`set position = position` is a genuine no-op, chosen to exercise the write path without
disturbing real data.)

**Expected:** the team A update reports 1+ row(s) affected; the team B update reports **0 rows
affected** (RLS silently filters it out — no error, just nothing updated).

**Symptom if the team B update succeeds:** `is_team_coach` is not gating writes, and any coach can
edit any team's roster — the exact scenario ("a club coach editing the varsity roster") this
policy exists to prevent.

### 6. A non-admin coach cannot assign team coaches

Sign in as a coach whose profile role is `coach`, not `admin`.

```sql
insert into public.team_coaches (team_id, profile_id) values ('<any-team-id>', '<any-profile-id>');
```

**Expected: no rows inserted** (RLS `with check` on `team_coaches_write` requires
`current_profile_role() = 'admin'`; a non-admin's insert is silently rejected — check for the
absence of the row rather than assuming an insert that returns no error succeeded).

**Symptom if it succeeds:** any coach can grant themselves or anyone else coach access to any
team — the same privilege-escalation shape the account-approval queue exists to prevent.

### 7. Rejected profiles read as guest, not their stored role

Using a profile row with `status = 'rejected'` (and, say, `role = 'coach'` still stored on it):

```sql
select public.current_profile_role();
```

**Expected:** `'guest'`.

**Symptom if it returns the stored role (e.g. `'coach'`) instead:** revocation does not revoke —
a rejected or deactivated account keeps every privilege its stored `role` implies, across every
policy in the project that calls `current_profile_role()`.

### 8. matrix_standings runs clean with no results logged yet

```sql
select * from public.matrix_standings;
```

**Expected:** runs without error, returns **zero rows** — `0005`'s backfill assigns `team_id` to
existing `schedule` and `matrix_logs` rows, but no Matrix result has been logged against a team
yet, so the view is legitimately empty.

**Symptom if it errors:** the view is malformed — most likely the `team_id`-partitioned rewrite
does not match the shape `0003`'s `security_invoker` view was.

---

## After 0006: confirm the destructive step

```sql
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'players'
   and column_name in ('number','position','season_stats','ratings','matrix_stats','school_id');
```

**Expected:** zero rows — all six columns are gone from `players`. Same idea for
`schedule.school_id` and `matrix_logs.school_id`.

There is no rollback for `0006`. If something is wrong at this point, restore `players`,
`schedule`, and `matrix_logs` from a database backup taken before this step.
