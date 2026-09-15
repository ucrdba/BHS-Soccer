# Goals by role — a Matrix drill scored on each player's score, by position — design

**Status:** awaiting sign-off
**Date:** 2026-09-14
**Depends on:** `2026-09-14-numbered-positions-design.md` — built first; this drill reads a player's role from that number.

## Problem

The coach runs a competitive drill — mostly 1v1, sometimes 2v2 with attackers
against defenders — where each player plays opponents for about fifteen minutes
and finishes with an overall score from their side of the game: an attacker
might finish **3-1**, a defender **0-2**. All games are played first and the
scores recorded afterwards, so one drill occurrence is one session.

What a good result is depends on the player's position:

- **Attacking players** (7–11 in the soccer numbering) should score more than
  they give up, and the more they score the better.
- **Defensive players** (2–6) should not give up goals; the fewer the better.
- **Goalkeepers** (1) are judged like defenders, against their own standards.

None of the Matrix's five measures can score this. `win_loss` records only
win/draw/loss; `count_high`, `time_low` and `time_bands` store one number per
player; `head_to_head` records pairings, not scores. A player's position is
the number 1–11 defined by the numbered-positions spec — 1 goalkeeper, 2–6
defence, 7–11 attack — with its meaning held only in `src/domain/position.ts`.

## Decisions

Settled with the owner before this was written.

| Question | Decision |
| --- | --- |
| Where does a player's role come from? | **The roster position number** (1 goalkeeper, 2–6 defend, 7–11 attack), pre-filled on the session sheet and **changeable for that session** — e.g. a midfielder who defends in today's 2v2. |
| Which roles? | **Attack, Defend, Goalkeeper.** Each role has its own standards. |
| How is a result recorded? | **One score per player for the whole drill,** from the player's side: goals scored – goals given up. In a 2v2 each player records their pair's score. |
| How is it typed? | **One box, "3-1".** |
| How does a score become points? | **Standards the coach sets per squad and role** — like the 3-430 time bands — not a ranking. |
| What do the standards measure? | **Goal difference** for every role, **plus a bonus**: for attackers, goals scored; for defenders and goalkeepers, goals given up. |
| How does the bonus fit the scale? | **It splits the weight.** The best goal-difference band plus the best bonus band is at most 100% of the drill's weight. |
| How is it built? | **A sixth measure,** `role_goals`, with its own standards table. `time_bands` and its data are untouched. |

## What the coach records

**Weights & standards** offers the new measure as **Goals by role**, beside
Small-sided (W/D/L) and the others. A drill set to it can be recorded as a
session.

**The session sheet** gives each player's row:

- **Role** — Attack, Defend or Goalkeeper. Pre-filled from the player's roster
  position number with `roleOfPosition` (1 → Goalkeeper, 2–6 → Defend, 7–11 →
  Attack); blank when the player has no position. The coach can change it for
  this session; nothing is written back to the roster. Reopening a saved session
  shows the role stored with the result, not the roster's current one.
- **Score** — one text box. `3-1`, `3:1` and `3 1` all mean scored 3, gave up
  1 (surrounding spaces allowed). Each side is a whole number from 0 to 99.
  Anything else — `3`, `3-`, `-1`, `a-b`, `3-1-2` — is refused, naming the player.
- **Attendance** — as for every session drill.

The grid keeps the session sheet's behaviours (CLAUDE.md, "The session grid
competes with paper"): **Enter moves to the next entry field in the order
shown**, and **typing a score marks the player present**. The role select and
the score box are both entry fields.

**A present player needs both a role and a valid score.** The sheet refuses to
save otherwise and names who; `saveMatrixSession` refuses it too.

**Live points.** As a score is typed the row shows what it earns, e.g.
`50% + 10% = 60% · 1.8 pts`, or `no standards for Attack` when the squad has
none for that role. Same reasoning as the time-band preview: a coach sees the
consequence as they enter, not after reloading the board.

## Standards

**Per squad, per drill, per role** — Varsity and U14 can hold the same drill to
different standards, for the reason 0022 gives for time bands.

Each role has two lists of bands. Each band is a threshold and a percentage of
the drill's weight.

| Role | Base bands — goal difference (`scored − given up`) | Bonus bands |
| --- | --- | --- |
| Attack | "goal difference **at least** T earns P%" | "goals scored **at least** T earns P%" |
| Defend | "goal difference **at least** T earns P%" | "goals given up **at most** T earns P%" |
| Goalkeeper | "goal difference **at least** T earns P%" | "goals given up **at most** T earns P%" |

Thresholds are whole numbers; goal-difference thresholds may be negative.
Percentages are 0–100.

**Scoring one present player:**

1. **Base** — the highest percentage among the role's base bands whose
   condition the goal difference meets; 0% if it meets none.
2. **Bonus** — the highest percentage among the role's bonus bands whose
   condition the player meets; 0% if none. Independent of the base: an attacker
   who scored 6 but lost 6-7 still earns the scoring bonus.
3. **Points** = drill weight × (base + bonus), with (base + bonus) capped at
   100% as defence in depth.

"Highest percentage among the bands met", rather than "tightest threshold met",
so a band list entered out of order still scores the way it reads.

**The 100% rule.** For every role, the largest base percentage plus the largest
bonus percentage must not exceed 100%. Enforced where bands are saved (below),
so it cannot be bypassed from outside the app.

**A role with no base bands for that squad is left out** — the player is
neither earned nor available for this drill, exactly as a squad with no time
bands is. Scoring them 0 would drag the player down because standards were not
set, with nothing on screen to say why. Bonus bands are optional.

**No-shows and players not entered.** An `unexcused` result, and a roster
player given no row (`not_entered`), are charged 0 of the weight as for every
session drill — **unless the squad has no base bands for any role of this
drill**, in which case the drill is excluded for the whole squad. (A player who
was not there has no role for the session, and their roster position may be
blank, so the per-role rule cannot be applied to them reliably; the squad-level
rule matches the intent that unset standards cost nobody.)

## Where standards are edited

**Weights & standards**, for a drill whose measure is Goals by role: choose the
squad, then a role tab — Attack, Defend, Goalkeeper. Each tab has the two band
lists (add row, remove row, threshold, percentage) and a worked example line
using the tab's own bands, e.g. `+2 with 5 scored → 50% + 10% = 60%`.

Save replaces that role's bands for that squad in one call. It is refused, with
the reason shown, when:

- the largest base percentage plus the largest bonus percentage exceeds 100%;
- a percentage is outside 0–100 or a threshold is not a whole number;
- two bands in one list share a threshold;
- the caller does not coach that squad (an admin may edit any).

## Player Ratings

- **Overall board** — this drill's points count toward each player's total like
  any other drill. No new columns.
- **This drill's leaderboard** (choose it in the exercise picker) — columns
  Role, Score (`3-1`), Goal difference, Base %, Bonus %, Points; default sort by
  points; every column sortable.
- **Below the standard** — a player whose **base** is 0% is below the standard.
  The leaderboard marks them and counts them per role ("2 of 6 attackers below
  the standard"). Strictly additive, as CLAUDE.md requires of `time_bands`
  emphasis: it never removes a row or disables a sort. Players in a role with no
  base bands are not counted.
- **Player breakdown** — this drill's line reads
  `Goals by role · Attack · 3-1 (+2) · 50% + 10% · 1.8 of 3.0 pts`.
- **Spreadsheet export** — role and score columns for this drill.
- **Progress chart and squad report** do not offer Goals by role drills in this
  phase: both plot a single raw value per session, which this measure does not
  have. The drill is left out of their pickers rather than shown as an empty
  chart.

## Schema — `0037_goals_by_role.sql`

Must apply to an empty database (the demo rebuild) and leave every existing
score unchanged.

**Measure.** `drills_bank_measure_check` accepts `role_goals`; the client's
`SupabaseService.MEASURES` and the Weights & standards label list gain it.

**Results.** On `public.matrix_session_results`:

```sql
alter table public.matrix_session_results
  add column if not exists role text check (role in ('attack', 'defend', 'keeper')),
  add column if not exists goals_for integer check (goals_for between 0 and 99),
  add column if not exists goals_against integer check (goals_against between 0 and 99);
```

Null for every other measure. A present result with no role or no score is
not scored under `role_goals` — which is also what happens to results recorded
before a drill was switched to this measure. The database cannot know a result's measure in a
check constraint, so "a present Goals-by-role result has all three" is enforced
by `saveMatrixSession` and the sheet.

**Standards.**

```sql
create table public.drill_goal_bands (
  id         uuid primary key default gen_random_uuid(),
  drill_id   uuid not null references public.drills_bank(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  role       text not null check (role in ('attack', 'defend', 'keeper')),
  kind       text not null check (kind in ('base', 'bonus')),
  threshold  integer not null,
  factor     numeric(4,3) not null check (factor >= 0 and factor <= 1),
  created_at timestamptz not null default now(),
  unique (drill_id, team_id, role, kind, threshold)
);
```

RLS: select for everyone (like `drill_time_bands`); **no insert, update or
delete policy** — writes go only through the save function, which is what lets
the 100% rule hold across rows.

**Save function.** `public.save_goal_bands(p_drill_id uuid, p_team_id uuid,
p_role text, p_bands jsonb) returns void` — `security definer`,
`set search_path = public`, EXECUTE to `authenticated` only. `p_bands` is an
array of `{ "kind": "base" | "bonus", "threshold": int, "factor": number }`,
where `factor` is 0–1 (the editor shows it as a percentage).
It checks, failing closed (`coalesce(public.is_team_coach(p_team_id), false)` —
CLAUDE.md, "Accounts"), that the caller coaches the team; that the drill's
measure is `role_goals`; the validations listed under "Where standards are
edited"; then deletes that drill/team/role's bands and inserts the new ones in
the same transaction. Refusals are sentences the app shows as-is.

**Scoring.** `matrix_exercise_points` is rebuilt (as 0022 did) with one CTE
added for `role_goals`, restating the rest unchanged. Its rows have
`kind = 'role_goals'`, `raw_value = goals_for − goals_against`, and the view
gains nullable columns `role`, `goals_for`, `goals_against`, `base_factor`,
`bonus_factor` (null for every other kind). `matrix_standings` keeps its column
shape. The `absent` and `not_entered` parts gain the squad-level exclusion above
for `role_goals` drills only.

## Client

| Unit | Holds |
| --- | --- |
| `src/domain/goal-score.ts` | `parseGoalScore(text)` → `{ scored, conceded } \| null`; `formatGoalScore`. Roles come from `src/domain/position.ts` (`roleOfPosition`, `PositionRole`), whose values `'keeper' \| 'defend' \| 'attack'` are the same strings the `role` column stores. |
| `src/domain/role-goal-score.ts` | `roleGoalFactor(score, role, bands)` → `{ base, bonus, total, hasStandards }` — the browser's copy of the SQL rule, for the live preview and the editor's example line. |
| `src/domain/session-entry.ts` | the `role_goals` branch: blank/pre-filled entries, `attendanceAfterInput`, `toSessionResults` (role + goals), `presentWithoutResult`. |
| `src/data/supabase.ts` | `saveMatrixSession` writes `role`, `goals_for`, `goals_against` and refuses a present `role_goals` row missing any; `fetchGoalBands(drillId, teamId)`; `saveGoalBands(drillId, teamId, role, bands)` over the RPC; `fetchPlayerBreakdown` / `fetchTeamExercisePoints` select the new view columns. |
| `SessionEntryScreen.vue` | role select + score box + live points for `role_goals`. |
| `GoalBandsEditor.vue` | the per-squad, per-role editor inside Weights & standards. `BandsEditor.vue` is not changed. |
| `ExerciseLeaderboard.vue`, `matrix-threshold.ts` | the columns and the per-role below-standard emphasis. |
| `matrix-breakdown.ts`, `exercise-export.ts` | the breakdown line and export columns. |
| `ProgressModal.vue`, `SquadReportModal.vue` | leave `role_goals` drills out of their pickers. |

`role-goal-score.ts` duplicates the SQL rule **on purpose**, as `band-score.ts`
duplicates `factorForTime`: one test runs both over the same inputs, so the
preview and the stored points cannot disagree silently.

## Testing

**Database** (`src/data/testdb/`, real Postgres; permission questions on an
`authenticated` connection, per CLAUDE.md):

- base: the highest percentage among met bands; none met → 0; negative
  goal-difference thresholds;
- bonus: attack on goals scored (at least), defend/keeper on goals given up (at
  most); counted with 0 base;
- total capped at 100%;
- a role with no base bands for the squad is left out; another role in the same
  session still scores;
- `unexcused` and `not_entered` charged 0 of the weight when the squad has any
  base bands, excluded when it has none;
- `save_goal_bands`: replaces a role's bands atomically; refuses > 100%, a
  duplicate threshold, a factor outside 0–1, a drill of another measure, a coach
  of another squad, and a caller with no profile;
- a direct insert into `drill_goal_bands` is refused;
- every existing measure's points for a fixture are unchanged by the migration;
- the migration applies to an empty database, and twice.

**Domain / component** (Vitest):

- `parseGoalScore` accepts `3-1`, `3:1`, `3 1`, ` 3 - 1 ` and refuses `3`, `3-`,
  `-1`, `a-b`, `3-1-2`, `100-0`;
- the sheet pre-fills each role from the position number (1, 4, 9, blank) and keeps a role the coach changed; a reopened session shows the stored role;
- `roleGoalFactor` agrees with the SQL over a shared table of cases;
- the sheet: Enter moves through role and score fields in on-screen order;
  typing a score marks present; a present row missing role or score blocks save
  naming the player; live points text;
- the editor: the 100% rule, duplicate thresholds, the example line;
- the leaderboard: columns, per-role below-standard count, no row removed.

## Out of scope

- Recording who played whom, or per-game scores.
- Ranking players against each other in this drill (standards only).
- A Midfield role.
- Writing a session's chosen role back to the roster.
- Progress chart and squad report for this measure.
