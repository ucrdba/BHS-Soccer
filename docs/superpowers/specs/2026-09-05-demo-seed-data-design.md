# Demo seed data — a template organization, and cloning it

> **Superseded in part by `2026-09-11-demo-accounts-design.md`.** Self-serve
> signup, `demo_new_org` and the 48-hour expiry are gone: nine fixed accounts
> each get a copy of the template, rebuilt every night. The template's content
> below still describes the sample program, with two changes: every date is
> relative to the rebuild, and there is one Matrix drill per measure, the bands
> on `time_bands`.

**Status:** ready to implement
**Date:** 2026-09-05
**File it produces:** `Resouces/SQL/demo/demo_seed.sql`

This is step 3 of the four-step demo apply order already declared at the top of
`Resouces/SQL/demo/demo_auth_open.sql`:

```
1. demo_schema.sql        the structure                    (done)
2. demo_auth_open.sql     self-serve coach accounts        (done)
3. demo_seed.sql          the template, and cloning it     ← this spec
4. demo_expire.sql        the 48-hour sweep                (not written)
```

## The problem

A visitor signs up on the demo and lands in an organization with one team and
nothing in it. Every view renders, and every view is empty. The roster is
blank, the schedule is blank, and the Competitive Matrix — the thing that most
distinguishes this product — has nothing to rank, because ranking needs match
history behind it.

A coach evaluating the app cannot evaluate an empty one. They should land in a
season already in progress and be able to change anything they touch without
affecting anyone else.

## The shape of the solution, already decided

`demo_auth_open.sql` decided this and the design follows it rather than
reopening it:

- `demo_orgs.kind` is `('template', 'visitor')`, with
  `demo_orgs_one_template`, a unique index enforcing exactly one template.
  Cloning the wrong organization would hand every future visitor somebody
  else's edits.
- `public.demo_new_org(display_name text) returns uuid` carries the comment:
  *"demo_seed.sql REPLACES this with a version that clones the template
  organization instead of creating an empty one. Keep the signature:
  handle_new_user() calls it."*

So: build one template organization, deep-clone it per signup, keep the
signature.

## Verified against the live demo database

`supabase_schema.sql` does not describe the live database, and neither does the
generated `demo_schema.sql` on its own — its migration files contain rollback
blocks whose `drop column` statements are easily mistaken for applied ones.
Every column below was probed against the running demo project
(`nzelhvipofeqoteewvhg`) with `select=<column>`, which returns PostgREST
`42703` when the column is absent.

The results that changed this design:

| Expectation from the DDL | Actually, on the live demo database |
| --- | --- |
| `schedule.school_id` | **absent** — schedule is team-scoped (`team_id`) |
| `practice_plans.school_id` | **absent** — team-scoped |
| `daily_thoughts.school_id` | **absent** — team-scoped |
| `matrix_logs.school_id` | **absent** — team-scoped |
| `players.number`, `players.position` | **absent** — moved to `team_players` by 0005 |
| `quiz_questions.school_id` | **present**, and so is `thought_id` |
| `soccer_categories.school_id` | **absent** — the table is global |
| `drills_bank.duration` | **absent**; `points` and `measure` are present |
| `players.school_id` | **absent** — see below; players carry no organization at all |
| `players.season_stats`, `.ratings`, `.matrix_stats` | **absent** — all moved to `team_players` |
| `matrix_logs.winning_player_id`, `.points_earned` | **absent** — 0002 rebuilt the table |

Anything built on the DDL's school-scoping would have produced a clone that
silently dropped every fixture, practice plan and daily thought.

Two of these deserve spelling out, because they change the clone's shape rather
than just a column name.

**`players` has no organization column.** It is pure identity — `id`, `name`,
`first_name`, `last_name`, `class_year`, `height`, `photo_url`, `is_deleted`,
`created_at` — and nothing more. A player belongs to an organization only
through `team_players`, which carries `team_id`, `school_id`, and everything
that varies by squad. So "clone the template's players" cannot be a filter on
`players`; it is a filter on `team_players` for the template's teams, joined
back to `players`. Players must still be inserted *before* `team_players`,
which references them.

**`matrix_logs` was rebuilt by migration 0002** and is a head-to-head pair, not
a single winner: `team_id`, `drill_id`, `player_a_id`, `player_b_id`, `outcome`
in `('a','b','draw')`, `score_text`, `occurred_on`, `logged_by`. Both player
columns are remapped, and a `check (player_a_id <> player_b_id)` means the seed
cannot pair a player with themselves.

## What is cloned, and what is not

### Not cloned (4 tables)

- **`soccer_categories`** — no `school_id` at all, seeded once globally by
  `demo_schema.sql`, and `name` is `TEXT NOT NULL UNIQUE`. Per-visitor copies
  would collide on the second signup.
- **`roles`** — four system rows (`admin`, `coach`, `player`, `guest`), all
  with `school_id` null, and `name` is `UNIQUE`. Same collision.
- **`profiles`** — the template has none. The visitor's own profile is
  created by `handle_new_user()` *after* `demo_new_org()` returns.
- **`team_coaches`** — likewise created by `handle_new_user()`, which already
  inserts a row for every team in the new organization. That loop was written
  this way deliberately so it would still be correct "once `demo_new_org`
  clones a template that has several."

### Cloned (22 tables), in this order

Each level depends only on levels above it.

```
1  schools
2  teams, drills_bank, coaches
2b players            (selected via the template's team_players, not by school)
3  team_players, schedule, practice_plans, daily_thoughts,
   drill_time_bands, matrix_sessions, matrix_logs, quiz_attempts
4  quiz_questions                       (school_id, and thought_id → daily_thoughts)
5  team_quiz_questions, quiz_answers, stat_matches, lineups,
   matrix_session_results
6  stat_events, lineup_players, player_answers
```

`quiz_questions` sits at level 4 rather than with the other school-scoped
tables at level 2 because `thought_id` references `daily_thoughts`, which is
team-scoped and therefore cannot exist until level 3.

Two FK details that will fail loudly if missed:

- **`team_players` has a composite FK** `(team_id, school_id) → teams (id,
  school_id)`. Both columns must be remapped as a pair; remapping one and
  copying the other raises `23503`.
- **`matrix_logs.logged_by → profiles`** must be left null. The template has no
  profile, and the visitor's does not exist yet at clone time. The column is
  `ON DELETE SET NULL`, so null is a legal resting state.
- **`players` is reached through `team_players`**, per the section above. The
  clone's players step selects `distinct p.*` from `players p join team_players
  tp on tp.player_id = p.id join teams t on t.id = tp.team_id where
  t.school_id = template_school`.

## The template's content

One organization, `kind='school'`: **Riverside High School**, mascot *Hawks*,
city Riverside, a league name, colors in `colors`, and a `record` that agrees
with the played fixtures below. Its `code` is a meaningless `demo-…` string —
the template is found through `demo_orgs.kind='template'`, never a hardcoded
code, which is the habit `demo_new_org` already warns against and the habit
that made `'bhs'` hard to remove from the real app.

It is deliberately not Beaumont and not Legends FC. Section 0 of
`demo_auth_open.sql` refuses to run on a database containing either, and the
demo's organizations are all invented.

**Two teams:** Varsity and JV, season `2026`.

**Roster — 38 players.** Identity in `players` (`name`, `first_name`,
`last_name`, `class_year`, `height`); everything per-squad in `team_players`
(`number`, `position`, `season_stats`, `ratings`, `recording_number`). 20
Varsity, 18 JV. No player appears on both — `unique (school_id, player_id)`
forbids it within an organization.

`recording_number` is assigned as a **contiguous block per squad**, written
into the seed the way a coach assigns them rather than derived from jersey
numbers. Recording numbers are the coach's to set and must never be reassigned
by the software.

**Schedule — a season part-played.** 16 Varsity and 12 JV fixtures running
August to November 2026. Of these, 10 Varsity and 7 JV fall before today
(5 September) and carry `status='COMPLETED'` with a score; the remaining 6 and
5 are `UPCOMING`. Home and away, venue addresses, kickoff times.

The seed writes the **text** columns `match_date` / `match_time`; migration
0008's trigger derives `match_on` and `kickoff_time`. Writing the derived
columns directly would fight the trigger.

The school's `record` is computed from the completed results. A record that
contradicts the fixture list is the first thing a coach notices.

**Plus/minus — 4 of the 10 completed Varsity matches.** A `stat_matches` row
per match linked to its `schedule` row, and `stat_events` using only the kinds the app
actually writes: `clock_start`, `clock_stop`, `period`, `on`, `off`,
`goal_for`, `goal_against`.

Events are seeded to show real rotation, including several players with
genuinely low minutes. High school soccer allows unlimited substitution and
re-entry, so those players are the audience the analysis views exist for — an
idealised eleven that plays the full 80 would demonstrate nothing. Events are
placed only within periods the clock is running: an event outside a
`clock_start`/`clock_stop` pair is not something the app can produce, and
seeding one would model a state the product forbids.

**Competitive Matrix.** Of the 12 drills, 4 are matrix drills covering one
`measure` value each (`head_to_head`, `win_loss`, `count_high`, `time_low`).
6 `matrix_sessions` across 3 dates, each with a `matrix_session_results` row
per Varsity player, and 20 `matrix_logs` rows of head-to-head history. Attendance includes `excused` and `unexcused` rows so
that column is not uniformly present.

The `time_low` fitness drill's `drill_time_bands` are set as **match-readiness
thresholds** — a band that everyone fit clears — not tuned to spread the squad
across a ranking. Fitness drills in this product are pass/fail gates, and
seeding them as a ranking device would teach a new coach the wrong thing about
what the feature is for.

**Planner.** 12 drills across the seeded categories, 3 of them carrying real
`diagram_data` so the diagrammer and the print/PDF path have something to
render. Those blobs must be **captured from
`SoccerTacticalBoard`'s own serialize output**, not hand-written to look
plausible: the print path rasterizes keyframes through
`generateDiagramStepDataUrl()` and an invented shape will fail there and
nowhere earlier.

2 practice plans (8 drill slots each), 3 daily thoughts with 1 active, 8 quiz
questions with 4 `quiz_answers` apiece linked to the active thought through
`team_quiz_questions`, and 6 `quiz_attempts` with their `player_answers` so the
results view has something in it.

All of the team-scoped content above — practice plans, daily thoughts, quiz
links, matrix sessions and plus/minus matches — hangs off **Varsity**. JV gets
its roster and its fixtures and nothing else, which is both less to seed and a
truthful picture of how a program actually runs: the second squad is rarely as
instrumented as the first. A coach who wants to see an empty squad fill up has
one to practise on.

## The clone function

```sql
public.demo_clone_org(template_school uuid, new_name text) returns uuid
```

- A temporary mapping table of `(table_name text, old_id uuid, new_id uuid)`,
  populated as each table is copied.
- The **table list and its order are explicit** — legible, reviewable, and
  matching the FK graph above.
- Each table's **columns are enumerated from the catalog at runtime**, so a
  migration that adds a column clones it without an edit here. `id` is
  excluded and regenerated; FK columns are remapped through the mapping table.
- The school is renamed to `new_name`. Teams, players and everything below keep
  the template's content — the visitor owns the program, they do not own a
  differently-named copy of every squad.

`demo_new_org(display_name)` keeps its signature and becomes: find the
template, clone it, insert the `demo_orgs` visitor row, return the new id.

**The clone is not allowed to break signup.** If no template row exists, or the
clone raises, `demo_new_org` catches it, logs a warning, and falls back to
today's empty-organization behaviour. A visitor with an empty program is a poor
demo; a visitor who cannot create an account at all is a broken site. The
fallback is the difference.

## Testing

`src/data/demo-seed.test.ts`, mirroring the drift guard already in
`src/data/demo-schema.test.ts`:

- Every table in `demo_schema.sql` appears either in the clone's ordered table
  list or on an explicit `NOT_CLONED` list. A migration that adds a table then
  fails the build, rather than silently producing visitors who are missing it.
- The `NOT_CLONED` list is asserted to be exactly the four tables named above,
  so removing a table from the clone is a deliberate two-place edit.
- The clone's table order is asserted to respect the FK graph: every table
  appears after every table it references.

`demo_seed.sql` ends with a **verification block that raises** on an internally
inconsistent seed: expected row counts per table, the school `record` against
the completed fixtures, `recording_number` contiguous and unique within each
squad, and no `stat_events` outside a running clock.

The four repo-wide gates still apply — `npm test`, `npm run typecheck`,
`node --check` over `public/js/`, and `npm run build`.

## Applying it

Run in the demo Supabase SQL editor after `demo_auth_open.sql`. Like the other
demo files it opens with `begin; set role postgres;` — the editor may run as a
role that is a member of `postgres` without defaulting to it, and `ALTER TABLE`
and `CREATE POLICY` check ownership rather than privilege.

It carries the same section 0 production guard: refuse to run on a database
containing Beaumont or Legends FC.

Re-runnable. Applying it twice replaces the template rather than creating a
second one, which the `demo_orgs_one_template` unique index would reject
anyway.

`docs/runbooks/2026-09-05-demo-deployment-runbook.md` gains `demo_seed.sql` in
its prerequisite checklist.

## Notes for later

**A visitor renaming a category renames it for everyone.** `soccer_categories`
cannot be cloned, for the collision reason above. The alternative — dropping
the unique index on the demo only — would break the rule that the demo's schema
matches production's, which is what makes a demo write behave exactly as the
same write does on the real site. Categories are labels and the blast radius is
small, so this is accepted rather than solved. The same reasoning does **not**
apply to `quiz_questions`, which has a real `school_id` and is cloned; a
visitor editing a question must not rewrite it for everyone.

**`demo_expire.sql` will have to delete players explicitly.** Because `players`
carries no `school_id`, deleting a visitor's school cascades through `teams` and
`team_players` but leaves every cloned player row behind. Step 4 must delete
them through `team_players` before dropping the school, or the demo accumulates
orphaned players forever — invisible, since no view can reach a player with no
membership.

**`demo_expire.sql` must not sweep the template.** Step 4 is unwritten, and
when it lands its delete has to filter `demo_orgs.kind = 'visitor'` — as the
runbook's manual takedown SQL already does. A sweep that takes the template
leaves every subsequent signup falling back to an empty organization, which
fails quietly and looks like the seed was never applied.
