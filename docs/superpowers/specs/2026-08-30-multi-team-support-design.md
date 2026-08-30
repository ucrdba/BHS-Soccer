# Multi-team support — design

**Status:** approved for planning
**Date:** 2026-08-30
**Branch:** `fix/multi-teams`
**Phase 1 of 2.** Phase 2 (practice planner, drills, daily thoughts, quiz) is deliberately out of
scope and gets its own design.

## Problem

One coach cannot run more than one team. There is no `teams` table anywhere in the schema; the
only grouping concept is `schools`, players carry `school_id` and nothing else, and a profile
holds exactly one `school_id`. Every fetch in `src/data/supabase.ts` filters by school, and
`'bhs'` is hardcoded in roughly 38 places.

`profiles.team_level` looks like it addresses this and does not. It is a text label on a person,
it is never rendered in the UI, and it filters nothing.

The workaround already in the live database shows the need: alongside `bhs` (Beaumont High School)
there are `abc` ("REV High School") and `vhs` ("REV Club") — teams modelled as schools. Only `bhs`
is ever loaded, so the others are unreachable.

## What this builds

Varsity, JV and any number of club teams, run by one coach, each with its own roster, schedule and
Competitive Matrix — with a player who plays for both a school team and a club existing as **one
person** whose statistics are kept **per team**.

### Decisions taken

- **Clubs are separate organizations.** Varsity and JV belong to one school; each club is its own
  organization. A coach spans organizations.
- **One team per organization per player**, several organizations. A kid is on varsity *or* JV,
  never both, and may also play for a club.
- **One person, per-team statistics.** Name, photo and class year are shared; jersey number,
  position, season stats and ratings are recorded per team.
- **The Matrix ranks within a team.** Competition is against the people you train with.

### Non-goals

- Renaming `schools` to `organizations`. The table already holds clubs and functions as an
  organization; renaming churns ~38 call sites, every RLS policy, and the parked Google-sign-in
  branch, for no functional gain. A `kind` column makes the data honest instead. The rename stays
  available as later cleanup.
- Photo upload. Photos are URLs pasted into a text field; Supabase Storage is not used anywhere,
  and every player is currently `null`. Adding a bucket, an upload control, bucket RLS, and a
  decision about whether minors' photographs should be publicly readable is separate work and must
  not ride along inside a scoping migration.
- Phase 2 surfaces: practice plans, drills bank, daily thoughts, quiz, soccer categories. Some of
  these (a drill is a drill) may be better shared across teams than scoped to one, and that is its
  own conversation.

## Data model

### `schools` gains a kind

```sql
alter table public.schools
  add column kind text not null default 'school'
  check (kind in ('school','club'));
```

### `teams`

```sql
create table public.teams (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  name       text not null,                    -- 'Varsity', 'JV', 'U16 Boys'
  season     text,                             -- '2026', so a season can roll over
  is_public_default boolean not null default false,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  unique (school_id, name),
  unique (id, school_id)                       -- target for the composite FK below
);

-- Exactly one public default per organization, ignoring soft-deleted rows.
create unique index teams_one_public_default_per_school
  on public.teams (school_id)
  where is_public_default and not coalesce(is_deleted, false);
```

`is_public_default` answers "whose schedule does a signed-out visitor see?" Without it the public
homepage has no defined scope.

### `players` becomes identity only

Keeps `name`, `class_year`, `height`, `photo_url`. **Loses** `number`, `position`, `season_stats`,
`ratings`, and `matrix_stats` — the last of which is already dead, since Phase 3 of the Postgres
migration made standings derived.

`players.school_id` is dropped: a person is no longer owned by one organization. Membership is the
only statement of where they play.

### `team_players` — the membership, and everything that varies by team

```sql
create table public.team_players (
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
  foreign key (team_id, school_id) references public.teams (id, school_id),
  unique (team_id, player_id),
  unique (school_id, player_id)
);
```

The last three lines carry the design's central rule and are worth reading together.
`unique (school_id, player_id)` enforces **one team per organization**. The composite foreign key
back to `teams (id, school_id)` makes it impossible for a membership's `school_id` to drift out of
step with the team it points at. The rule is therefore enforced by the schema, not by application
code remembering to check it.

`position` sits here rather than on `players` because a player can be a centre-back for the school
and a midfielder for a club. It costs nothing now and would be a migration later.

### `team_coaches`

```sql
create table public.team_coaches (
  team_id    uuid not null references public.teams(id)    on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (team_id, profile_id)
);
```

This is what finally lets one coach span teams and organizations.

### Rescoped in Phase 1

`schedule` and `matrix_logs` move from `school_id` to `team_id`. `matrix_standings` partitions by
team instead of school, so each team has its own leaderboard.

## Scope resolution

The active team lives in `localStorage`, not in `profiles` — it is a per-device UI preference, and
storing it server-side would mean a write on every switch.

A header dropdown lists the teams the viewer may see, grouped by organization. Resolution differs
by who is looking:

| Viewer | Sees | Default |
| --- | --- | --- |
| Coach | teams from `team_coaches` | last used |
| Player | teams from `team_players` | their only team; switcher hidden when there is one |
| Signed-out visitor | the public default | `teams.is_public_default` |
| Signed-in, on no team | the public default | as above |

## Permissions

Today any coach can write anything, because there has only ever been one team.

```sql
create or replace function public.is_team_coach(target_team_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select public.current_profile_role() = 'admin'
      or exists (
        select 1 from public.team_coaches tc
        where tc.team_id = target_team_id and tc.profile_id = auth.uid()
      );
$$;
```

`SECURITY DEFINER` for the same reason `current_profile_role()` is: reading `team_coaches` from
inside a policy on `team_coaches` would recurse.

- **Reads are unchanged.** This is a public roster site; rosters and schedules stay publicly
  readable across all teams. The tightening is **write-only**, so nothing a visitor can see today
  disappears.
- **`team_players`** — writable by a coach of that team, or an admin. This is the policy that stops
  a club coach editing the varsity roster.
- **`team_coaches`** — **admin only.** It is role assignment; letting coaches add coaches is the
  same privilege-escalation shape that gated the account-approval queue.
- **`teams`** — created and edited by **admin only**. Teams are structural and created rarely, and
  a coach creating teams in an organization they do not belong to is an escalation path with no
  upside.
- **`players`** (identity) — writable by a coach of **any** team that person is on. This is
  deliberate: a club coach fixing a shared player's photograph should fix it everywhere. The
  trade-off is that they can also change that player's name, which then shows on the school
  roster. Accepted, because these are all one person's teams.

### Folded in: `current_profile_role()` must respect status

It currently reads `role` and ignores `status`, so a profile marked `rejected` still reads as
`coach` to every policy. This was found during the Google-sign-in review and parked because it
touches every policy in the project.

The permission layer is being rewritten here anyway, which makes this the cheap moment to fix it:
return `'guest'` unless `status = 'active'`. Revocation then actually revokes — which multi-team
makes more pressing, since more coaches means more reason to remove one.

## Migrating the existing data

> **[REVISED 2026-08-30, during execution.]** The project owner stated that the current data is
> reproducible and does not need protecting. The two-migration split described below — and the
> apply/deploy/verify/drop sequence it required — existed solely to keep a bad copy recoverable,
> so it has been collapsed into a single `0005`. The copy into `team_players` still happens before
> the old columns are dropped, because that is how the new tables get populated, not merely how
> data is preserved. The one rule that survives: **apply the migration at merge time, not before**,
> since it breaks the deployed application's roster the moment it lands. The subsection below is
> left in place as the reasoning that was superseded rather than deleted.


The live data is small — 11 players (all Beaumont), 1 schedule row, 2 coaches, 0 matrix logs — so
this is a schema change against almost no data. The migration performs every step; nothing is
moved by hand.

1. Create team **Varsity** under Beaumont, `is_public_default = true`.
2. Insert 11 `team_players` rows, carrying each player's existing `number`, `position`,
   `season_stats` and `ratings` across unchanged.
3. Point the schedule row at that team.
4. Mark `bhs` and `abc` as `kind='school'`, `vhs` as `kind='club'`.
5. Delete the four `diag_*` "Diagnostic Test School" rows — diagnostics cruft with no dependents.
6. **In a separate, later migration**, drop `number`, `position`, `season_stats`, `ratings`,
   `matrix_stats` and `school_id` from `players`. Splitting this is the point: a bad copy stays
   recoverable instead of destructive.

JV and club teams are **not** created through the UI — no such form exists in Phase 1.
`teams_write` and `team_coaches_write` are admin-only policies with no corresponding write path in
`src/data/supabase.ts` and no form in the app, so a JV or club team is created (empty) and its
coach assigned directly in the Supabase SQL editor; see the runbook for the exact statements.
Building that creation surface is Phase 2 work — it is a real UI surface with its own permissions
questions and deserves its own review.

### The order of operations matters

There is a window between the two migrations, and getting the sequence wrong silently loses data:

1. Apply migration 1 (create tables, copy the rows). The old columns still exist and still hold
   the authoritative values.
2. **Deploy the application change**, so reads and writes go to `team_players`.
3. Verify — run the runbook checks, confirm all 11 players kept their numbers and stats.
4. Only then apply migration 2, dropping the old columns.

If migration 1 is applied and the code is *not* deployed, the app carries on writing to
`players.number` and `players.season_stats`; those writes land nowhere the new schema reads, and
migration 2 then deletes them. The gap is small and the data is small, but the failure is silent,
which is what makes it worth naming.

## Behaviour this introduces

- **Adding an existing player to a second team must search first.** Adding "Cesar Alva" to a club
  team means selecting the existing person, not typing the name again. Without a search-first step
  in the add-player flow, the duplicate-record problem returns by hand — which is the exact problem
  this design exists to remove.
- **Switching teams re-renders**, it does not reload. The active team is read from `localStorage`
  by every view.
- **A team with no players** is a normal state, not an error — every newly created team starts
  there and must render as an empty roster rather than a broken one.

## Verification

Client logic is covered by the existing Vitest suites. Trigger, policy and constraint behaviour
cannot be reached from JavaScript — no agent in this project has DDL access — so it gets explicit
SQL steps in a runbook, as migrations `0002`, `0003` and `0004` did.

Checks that must be named:

1. A player inserted into a second team **in the same organization** is rejected by
   `unique (school_id, player_id)`.
2. The same player inserted into a team in a **different** organization succeeds.
3. A `team_players` row whose `school_id` disagrees with its team's is rejected by the composite
   foreign key.
4. A coach can write to `team_players` for their own team and **cannot** for a team they do not
   coach.
5. A non-admin coach cannot insert into `team_coaches`.
6. A profile with `status = 'rejected'` gets `'guest'` from `current_profile_role()`.
7. Every one of the 11 migrated players keeps their jersey number, season stats and ratings.
8. A signed-out visitor sees the team flagged `is_public_default`.

## Interaction with the parked Google-sign-in branch

`feat/google-signin-allowlist` is complete but unmerged, and its `allowed_users` table is
school-scoped with a `school_id` column. If that branch lands first, the allowlist should grant a
role **per organization** rather than per team — a coach is authorized by the organization and then
assigned to teams within it. If this branch lands first, that column already means the right thing
and needs no change. Either order works; whichever lands second must not silently reinterpret the
other's scope column.

## Follow-ups, deliberately not in this design

- **Photo upload** — a Storage bucket, an upload control, bucket RLS, and a decision on whether
  minors' photographs should be publicly readable.
- **Renaming `schools` to `organizations`** once the churn is affordable.
- **Phase 2 scoping** — practice plans, drills, daily thoughts, quiz, categories.
- **The `coaches` display table** (the public "meet the staff" list) is untouched here and remains
  school-scoped. Whether it should become team-scoped is a Phase 2 question.
