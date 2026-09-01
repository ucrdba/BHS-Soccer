# Team-Scoped Practice Planner — Design

**Status:** approved, ready for an implementation plan
**Date:** 2026-09-01
**Follows:** `docs/superpowers/specs/2026-08-30-multi-team-support-design.md`, which deferred these surfaces as Phase 2

## Problem

Multi-team support scoped the roster, the schedule and the Competitive Matrix
to a team. The practice planner was deliberately left behind, and the
consequence is now visible in daily use: **Varsity and JV share one practice
planner, one daily message and one quiz.**

A session built for a varsity squad appears as JV's session. A coaching message
written for seventeen-year-olds appears on the home page of a Legends FC under-14
team. There is no way to give two squads different work, which is the entire
reason a program runs more than one squad.

The coach's own words on the messages:

> messages are team specific. Varsity might get one, Jv another and still clubs
> a different as they are different ages with different abilities

## Decisions taken

**The drill library stays shared within an organization; only plans are
team-scoped.** The 1v1 Gauntlet is the same exercise whether Varsity or JV runs
it. *Rejected:* per-team drill libraries, which would duplicate every drill,
diagram and coach's note across squads, and — because drill weights feed the
Competitive Matrix — would require setting "1v1 is worth 3.0" separately for
every team, making a JV player's score incomparable to a Varsity player's.

**Daily thoughts are team-scoped too.** They live on the planner screen and
were originally out of scope; the coach's answer above settled it. The quiz was
to follow, and does not — see "Why the quiz is excluded".

**Copying between teams is on demand, and produces snapshots.** A plan or a
thought can be copied to another team and then edited freely. *Rejected:*
posting one thought to several teams at once, which reads as less work until
the first edit raises "does this change all of them, or only this one?" — a
larger idea than it appears. *Also rejected:* no copying at all, which would
make a coach running two squads type everything twice.

**Two migrations, not one.** `0005` dropped `school_id` in the same migration
that added `team_id`. Repeating that here would create a window where deployed
code queries a column that no longer exists. Splitting it removes the window
entirely at the cost of one extra file.

## Data model

### Two tables gain a team

```sql
alter table public.practice_plans
  add column if not exists team_id uuid references public.teams(id) on delete cascade;

alter table public.daily_thoughts
  add column if not exists team_id uuid references public.teams(id) on delete cascade;

```

`quiz_questions` is **deliberately excluded** — see below.

`drills_bank` and `soccer_categories` are **not** touched. They remain scoped by
`school_id`, which is already per-organization: Beaumont's squads share one
library and Legends FC has its own.

### What is being migrated

Verified against the live database rather than assumed:

| Table | Rows | Destination |
| --- | --- | --- |
| `practice_plans` | 27 | **Varsity** — all are named "Standard Varsity 90-Min…" or `dummy_practice_*` and predate multi-team |
| `daily_thoughts` | 0 | nothing to migrate |
| `quiz_questions` | 0 | not touched — see below |
| `soccer_categories` | 25 | untouched |

Teams at the time of writing: Varsity (public default) and JV under Beaumont
High School; U14 Boys and U16 Boys under Legends FC.

### A quirk worth recording

`practice_plans` is **one row per drill slot, not one row per plan**. A "plan" is
the set of rows sharing a `name`; there is no plans table. Adding `team_id` per
row works, and Varsity and JV may both hold a plan called "Standard 90-Min"
because the team distinguishes them.

Normalising this into a header table plus items would be a real improvement and
is deliberately **out of scope** — it is a separate change with its own
migration risk, and nothing here requires it.

### Why the quiz is excluded

The coach's answer — that messages are team-specific — applies to the quiz in
principle, and an earlier draft of this design scoped it alongside the thoughts.
Reading the code before writing the plan showed that would have been work on a
feature that does not exist yet:

- **The quiz questions are hardcoded** in `planner.view.js` as radio inputs
  named `q1` to `q5`. Nothing renders a question from data.
- **Nothing reads `quiz_questions`.** There is no fetch method for it; the only
  code touching the table is `upsertQuizQuestion`, added when the XLSX import
  was fixed.
- **The table is empty**, and has no `school_id` column at all, so there is
  nothing to scope and nothing to migrate.

Adding `team_id` to a table no code reads would be ceremony. The quiz becomes
team-scoped when the quiz becomes data-driven, and that is its own piece of
work: a fetch, a renderer, and an editor. Recorded here so the decision reads as
deliberate rather than as an oversight.

Note for whoever builds that: `quiz_questions` has a primary key named
`question_id` rather than `id`, unlike every other table.

### Access control

Reads stay public, matching every other table. Writes are gated on
`public.is_team_coach(team_id)` — the helper `0005` introduced. This is the
first time the planner has had per-team write control: today any coach can edit
any plan in the organization.

## Copying between teams

One mechanism, two surfaces: **Copy to team…** on a plan and on a daily
thought.

**Copies are snapshots, not links.** Copying Varsity's Monday session to JV
produces independent rows; editing JV's afterwards leaves Varsity's untouched.
The alternative — a live reference to an original — is efficient until someone
changes the shared thing and silently alters a session another coach has
already printed.

**A plan copies whole.** Because a plan is rows sharing a name, copying
duplicates every slot in it: drills, times, notes and diagrams together.
Copying part of a session would be meaningless.

**The destination list offers only teams the coach is assigned to.**
`is_team_coach()` refuses the write regardless, so offering an unavailable team
would produce a button that always fails — the same trap that made unassigned
coaches look like a broken app.

### Two consequences

**Name collisions are allowed.** Varsity and JV may both have "Standard
90-Min". They are different rows scoped to different teams, and forcing unique
names across a program would be arbitrary. The plan picker shows only the active
team's plans, so nothing is ambiguous in the UI.

**A cross-organization copy is refused, not partially performed.** The library
is per-organization, so copying a Beaumont plan to a Legends FC team would
produce slots pointing at drills that team cannot see. The copy is blocked with
a message naming the offending drills. Half-copying and leaving broken slots
would be a silent data corruption.

## Service layer

These move from school scope to team scope, which also retires the hardcoded
`'bhs'` at each call site:

- `fetchPracticePlans(teamId)`
- `fetchDailyThoughts(teamId)`
- `fetchLatestDailyThoughts(teamId)`
- `upsertDailyThought(teamId, thought)`
- `setActiveDailyThought(teamId, activeId)`

Two are new, each returning `{ok, error}` so an RLS refusal is reported in
words rather than silently doing nothing:

- `copyPracticePlan(planName, fromTeamId, toTeamId)`
- `copyDailyThought(thoughtId, toTeamId)`

**Two things already in place make this smaller than it looks.**
`syncFromSupabase` resolves the active team before fetching anything
team-scoped, so these slot into existing machinery. And the auth subscriber
already re-syncs on a team switch, so changing teams repaints the planner with
no extra work.

## Surfaces

`planner.view.js` holds the planner, the drills library, the diagrammer, the
daily thoughts and the quiz — 2.3k lines, the largest file in the repository.

**The daily-thoughts section moves to `public/js/views/thoughts.view.js`** as
part of this change, since its fetches are being rewritten anyway. This is not a
general refactor: only the section this change already touches, so the file
stops growing. The planner, library, diagrammer and quiz stay where they are.

Script order in `index.html` is load-bearing — the new file extends
`BHSSoccerApp.prototype`, so it must load after `app.core.js`.

## Verification

The four standing gates — `npm test`, `npm run typecheck`, `node --check` over
`public/js/`, and `npm run build` — plus tests on the failures that would
otherwise be silent:

- **A fetch never sends a school code where a team id belongs.** This exact bug
  killed daily thoughts entirely and was found only in a Postgres log: the code
  `'bhs'` was passed into a uuid column, every call failed with 22P02, and the
  page rendered an empty state. Asserting the value that reaches the database is
  the property that was missing.
- **A copy produces independent rows.** Editing the copy must not alter the
  original.
- **The destination list excludes teams the coach cannot write to.**
- **A cross-organization copy is refused and names the drills.**
- **An empty planner reads as empty, not broken** — a team with no plans yet
  must say so, in the way the session recorder now does.

## Deploy sequence

Load-bearing, and the reverse of the usual order for step 3:

1. **Apply `0014`** — adds `team_id` to `practice_plans` and `daily_thoughts`,
   backfills the 27 plan rows to Varsity, leaves `school_id` in place. Nothing breaks; deployed code
   continues to work unchanged.
2. **Deploy the code** that reads `team_id`.
3. **Apply `0015`** — drops `school_id` from both tables.

Step 3 is optional in timing and could wait a week. Nothing depends on it except
tidiness, and delaying it costs only a redundant column.

## Out of scope

**The quiz**, for the reasons above.

**The `coaches` display table**, though it is also school-scoped. It overlaps
confusingly with `team_coaches` and deserves its own decision rather than being
swept in here.

**Normalising `practice_plans`** into a header and items, as noted above.

**`soccer_categories`**, which are drill categories and belong to the shared
library.

**Cross-organization plan sharing.** Refused by design; a program wanting to
share drills between a school and a club should be modelled as one organization.
