# Multi-team support (Phase 1) — migration runbook

Applies `supabase/migrations/0005_multi_team_schema.sql` by hand in the Supabase SQL editor, then
verifies it.

No agent in this project has DDL access — only the publishable anon key, which cannot execute
DDL. Every step below is run by a human.

---

## ⚠️ Apply this at merge time, not before

`0005` used to be split into two files so a bad copy of the existing rows stayed recoverable.
**The project owner has since said the current data is reproducible and does not need
protecting**, which removed that split's whole justification — see
`docs/superpowers/specs/2026-08-30-multi-team-support-design.md` and the plan's ledger for the
decision. There is one migration now.

The consequence that survives the collapse is not about data — it's about timing. `0005` drops
`players.number`, `players.season_stats`, and the rest, in the same breath as it creates the new
tables. From the moment it is applied until the application change ships:

- **The roster breaks.** The deployed code still reads `players.number` / `players.season_stats`
  / etc., and those columns are gone.
- **The Matrix panel goes silently blank.** `0005` drops and recreates `matrix_standings` with
  `team_id` in place of `school_id`; the deployed `fetchMatrixStandings` queries
  `.eq('school_id', …)`, which now errors. That error is swallowed into a `console.warn` returning
  `null`, so nothing crashes — the panel just empties.

There is no window to manage here and nothing to sequence. **Do not apply `0005` to a database
whose application code has not already been updated to read `team_players` / `team_id`.** Apply
it in the same breath as the deploy, not ahead of it.

`0005` has no rollback once applied — the final section drops the only copy of
`players.number` / `position` / `season_stats` / `ratings` / `matrix_stats` / `school_id` and
`schedule.school_id` / `matrix_logs.school_id`. If something is wrong afterward, restore from a
database backup taken before this ran.

---

## Step 1 — Pre-flight checks (before applying 0005)

Run both before touching anything. Both are read-only.

### 1a. At least one active admin exists

```sql
select id, email, role, status from public.profiles where role = 'admin';
```

**Expected:** at least one row with `status = 'active'`.

**Why this matters:** `0005` makes `current_profile_role()` return `'guest'` for any profile whose
`status` is not `'active'`, and both `teams_write` and `team_coaches_write` are admin-only. If no
admin profile is active, applying `0005` leaves **nobody** able to create a team or assign a coach
through the API afterward — not even by promoting someone, since that write is itself gated the
same way.

### 1b. The diagnostic schools are actually empty

```sql
select code, (select count(*) from public.players p where p.school_id = s.id) as players
  from public.schools s where code like 'diag\_%';
```

**Expected:** `0` against every row.

**Why this matters:** `0005`'s data migration runs
`delete from public.schools where code like 'diag\_%';`. `players`, `schedule`, `matrix_logs`,
`profiles` and `drills_bank` all declare `school_id … on delete cascade` against `schools`, so
that delete cascades. A nonzero count here means real rows — not just diagnostics cruft — are
about to be destroyed.

---

## Step 2 — Apply 0005

At merge time (see the warning above — not before the application change is ready to deploy in
the same breath). Paste the full contents of `supabase/migrations/0005_multi_team_schema.sql` and
run it.

Expected: success, no rows returned.

---

## Step 3 — Fixtures for checks 1–4

Checks 1–4 below need a second team in BHS, a team in a different school, and **two** fixture
players — one already rostered (to test what happens when you try to double up), one with no
membership anywhere yet (to test the composite FK in isolation, without also tripping the
`team_id`/`player_id` uniqueness that check 1 is for). `0005` creates exactly one team (Varsity)
and rosters every existing player onto it, so none of this exists yet. Create it once, as
`postgres` (the SQL editor's default role, which bypasses RLS — the point of the fixture step is
to set up state, not to test who's allowed to write it):

```sql
insert into public.teams (school_id, name, season)
values ('7ebbe980-b87e-421f-a11f-788ca2519504', 'JV Fixture', '2026')
on conflict (school_id, name) do nothing;

insert into public.teams (school_id, name, season)
select id, 'Club Fixture', '2026' from public.schools where code = 'vhs'
on conflict (school_id, name) do nothing;

-- (players.name and players.class_year are the only NOT NULL columns 0005
-- leaves behind, so these are the only columns a fixture insert needs.)
insert into public.players (name, class_year) values ('Fixture Player A', '2027');
insert into public.players (name, class_year) values ('Fixture Player B', '2027');

-- Player A is rostered on JV Fixture. Checks 1, 2 and 4 reuse this one
-- membership; player B is left with none, reserved for check 3.
insert into public.team_players (team_id, school_id, player_id)
values (
  (select id from public.teams  where name = 'JV Fixture' and school_id = '7ebbe980-b87e-421f-a11f-788ca2519504'),
  '7ebbe980-b87e-421f-a11f-788ca2519504',
  (select id from public.players where name = 'Fixture Player A')
);
```

Cleanup, once you are done with all checks below:

```sql
delete from public.team_players where player_id in (select id from public.players where name in ('Fixture Player A', 'Fixture Player B'));
delete from public.players      where name in ('Fixture Player A', 'Fixture Player B');
delete from public.teams        where name in ('JV Fixture', 'Club Fixture');
```

---

## Step 4 — Verification checks

Run these after `0005` is applied. Each states the identity it runs as and what a broken schema
returns, not just what a working one does — a check that can't distinguish the two is not a check.

### 1. One team per organization is enforced

**Identity:** `postgres` (bypasses RLS). Naming a coach identity here would be wrong: the
`team_players_write` policy's `with check` runs before the table's own unique constraint gets a
chance to fire, so a coach not linked to the target team via `team_coaches` gets `42501` first —
a real failure, but not the one this check is for. Testing the constraint itself means going in as
a role RLS doesn't apply to.

Player A is already on JV Fixture (from Step 3). Try to also put them on Varsity — a
**different team, same school** — so this trips `unique (school_id, player_id)` specifically,
without also colliding with `unique (team_id, player_id)` (the target team differs, so that
constraint has nothing to say here):

```sql
insert into public.team_players (team_id, school_id, player_id)
values (
  (select id from public.teams where name = 'Varsity' and school_id = '7ebbe980-b87e-421f-a11f-788ca2519504'),
  '7ebbe980-b87e-421f-a11f-788ca2519504',
  (select id from public.players where name = 'Fixture Player A')
);
```

**Expected:** fails — `ERROR 23505: duplicate key value violates unique constraint
"team_players_school_id_player_id_key"`.

**If the constraint is missing or scoped wrong:** the statement returns `INSERT 0 1` — no error at
all. The same player now has two live rows in the same school, and the one-team-per-organization
rule is not enforced; rosters will diverge from there. A passing run must show the `23505` error
naming `team_players_school_id_player_id_key`, not merely "the statement completed" — and not the
`team_players_team_id_player_id_key` constraint, which this insert does not touch.

### 2. The same player, a different school, succeeds

**Identity:** `postgres`. Wrapped in a transaction that rolls back, so it does not leave a real
membership row behind for a later check (or a later coach) to trip over.

```sql
begin;
  insert into public.team_players (team_id, school_id, player_id)
  values (
    (select id from public.teams   where name = 'Club Fixture'),
    (select id from public.schools where code = 'vhs'),
    (select id from public.players where name = 'Fixture Player A')
  );
  -- Expect: INSERT 0 1, no error.
rollback;
```

**Expected:** succeeds inside the transaction (`INSERT 0 1`), then is rolled back.

**If it fails instead:** `unique (school_id, player_id)` is scoped too broadly (for example, a
bare `unique (player_id)`, or the wrong column pairing) and is blocking a legitimate second
membership in a different organization. That failure would mean the entire "one person, several
teams across organizations" feature — the reason this schema exists — does not work.

### 3. The composite FK rejects a mismatched school_id

**Identity:** `postgres`.

Uses player **B** — the one Step 3 left with no membership anywhere — specifically so this insert
cannot also collide with `unique (team_id, player_id)` or `unique (school_id, player_id)`. If it
used player A (already on JV Fixture, same team_id this statement targets), a failure could mean
either constraint fired, telling you nothing about the FK specifically.

```sql
insert into public.team_players (team_id, school_id, player_id)
values (
  (select id from public.teams   where name = 'JV Fixture'),  -- a BHS team...
  (select id from public.schools where code = 'vhs'),         -- ...paired with a different school's id
  (select id from public.players where name = 'Fixture Player B')
);
```

**Expected:** fails — `ERROR 23503: insert or update on table "team_players" violates foreign key
constraint "team_players_team_id_school_id_fkey"`.

**If it succeeds instead:** `team_players.school_id` can drift from the team it actually names,
and check 1's `unique (school_id, player_id)` guard becomes meaningless — it would be enforcing
uniqueness against a value that no longer reliably identifies the organization.

### 4. `is_team_coach` gates writes per team, not globally

**Identity:** `authenticated`, impersonating a non-admin coach profile. First find one:

```sql
select id from public.profiles where role = 'coach' and status = 'active' limit 1;
```

Paste that id in place of `<coach-id>` below. After `0005`'s data migration, every active
coach/admin is linked via `team_coaches` to Varsity and to nothing else, so this coach should be
able to write to Varsity's roster and not to JV Fixture's (which the Step 3 fixtures gave a real
`team_players` row to touch).

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<coach-id>"}';

  update public.team_players set position = position
   where team_id = (select id from public.teams where name = 'Varsity' and school_id = '7ebbe980-b87e-421f-a11f-788ca2519504');
  -- Expect: UPDATE n, n >= 1.

  update public.team_players set position = position
   where team_id = (select id from public.teams where name = 'JV Fixture' and school_id = '7ebbe980-b87e-421f-a11f-788ca2519504');
  -- Expect: UPDATE 0.
rollback;
```

**Expected:** the Varsity update reports at least one row affected; the JV Fixture update reports
**`UPDATE 0`** — RLS's `using` clause on `UPDATE` filters the row out of the scan silently. No
error either way; the row count is the only signal.

**If the JV Fixture update also reports 1 row affected:** `is_team_coach` is not gating writes,
and any coach can edit any team's roster — exactly the "club coach editing the varsity roster"
scenario `team_players_write` exists to prevent. (If it instead errors with `42501`, that's also
wrong for this test — an `UPDATE` filtered by `using` should silently affect zero rows, not raise;
a raised error here would point at a policy written with `for all` collapsing `using`/`with check`
incorrectly.)

### 5. A non-admin coach cannot assign team coaches

**Identity:** `authenticated`, impersonating the same coach from check 4 (`<coach-id>`). Unlike
check 4's `UPDATE`, this is an `INSERT`, so the failure mode is different: an RLS `with check`
violation on `INSERT` raises explicitly, it does not just filter silently.

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<coach-id>"}';

  insert into public.team_coaches (team_id, profile_id)
  values (
    (select id from public.teams where name = 'JV Fixture' and school_id = '7ebbe980-b87e-421f-a11f-788ca2519504'),
    '<coach-id>'
  );
rollback;
```

**Expected:** fails — `ERROR 42501: new row violates row-level security policy for table
"team_coaches"`.

**If it succeeds instead (`INSERT 0 1`, no error):** `team_coaches_write` is not actually
admin-gated, and any coach can grant themselves — or anyone — coach access to any team. That is
the same privilege-escalation shape the account-approval queue exists to prevent, just on a
different table.

### 6. A profile whose status is not 'active' reads as guest

**Identity:** `authenticated`, impersonating a profile with `status = 'rejected'`. `auth.uid()`
reads `NULL` by default in the SQL editor (there is no session, so no JWT), which would make
`current_profile_role()` return `NULL` for the trivial reason that no profile matches — that is
not the same thing as verifying the `'guest'` fallback, so impersonation is required, not
optional.

If no profile with `status = 'rejected'` exists yet, borrow one and revert immediately after:

```sql
update public.profiles set status = 'rejected' where id = '<some-profile-id>';
-- run the check below, then:
update public.profiles set status = 'active'   where id = '<some-profile-id>';
```

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<rejected-profile-id>"}';
  select public.current_profile_role();
rollback;
```

**Expected:** `guest`.

**If it returns the profile's stored `role` instead (e.g. `coach`):** revocation does not revoke —
a rejected or deactivated account keeps every privilege its stored `role` implies, across every
policy in the project that calls `current_profile_role()`. That is the exact bug `0005`'s rewrite
of the function exists to close.

### 7. Every logged result appears on both players' records

**Identity:** any — `matrix_logs` and `matrix_standings` both grant public `select`, so this is
meaningful even signed out.

```sql
select (select count(*) * 2 from public.matrix_logs where coalesce(is_deleted,false) = false) as expected_sides,
       (select coalesce(sum(games), 0) from public.matrix_standings)                          as actual_sides;
```

**Expected:** the two numbers match. Right after `0005` runs, with zero results logged, both are
`0` — correct, but that state alone proves little; a `select * from matrix_standings` returning
zero rows is equally satisfied by a correctly empty view, a view with wins and losses inverted, or
a completely failed backfill (the view filters `team_id is not null`, so a log stuck with a null
`team_id` just vanishes from it without a trace). This check earns its keep once results exist —
re-run it after the first Matrix result is logged through the deployed application.

**If the two numbers differ:** either the backfill left some `matrix_logs` rows without a
`team_id` (those rows silently disappear from the view), or a `union all` branch was dropped or
miscounted in the view definition.

---

## Step 5 — Confirm the destructive part actually happened

```sql
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'players'
   and column_name in ('number','position','season_stats','ratings','matrix_stats','school_id');
```

**Expected:** zero rows — all six columns are gone from `players`. Same idea for
`schedule.school_id` and `matrix_logs.school_id`.

There is no rollback for this. If something is wrong at this point, restore `players`, `schedule`,
and `matrix_logs` from a database backup taken before `0005` ran.
