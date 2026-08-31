# Weighted Competitive Matrix Scoring — Design

**Status:** approved, ready for an implementation plan
**Date:** 2026-08-31
**Supersedes the scoring rules in:** `supabase/migrations/0003_matrix_standings_view.sql` and section 10 of `supabase/migrations/0005_multi_team_schema.sql`

## Problem

The Competitive Matrix scores every result identically: win 3, draw 1, loss 0,
ranked on accumulated points. Two things are wrong with that for the way the
program actually trains.

**Not all exercises matter equally.** A 1v1 is the sharpest test of a player and
should count for more than a fitness benchmark. Today they count the same.

**Most exercises are not head-to-head at all.** `matrix_logs` stores
`player_a_id`, `player_b_id` and an outcome, which can express "Cesar beat
Caleb" and nothing else. A Cooper's test produces a distance per player. A beep
test produces a level. A shooting drill produces eight successes out of ten. A
timed task produces seconds. None of these have an opponent, so none of them can
be recorded at all.

The request, in the coach's words:

> for the Matrix I want calculations to be based on how important a drill or
> exercise is. For example 1v1 is the most important and should have a value of
> 3. Most Competitive (small sided games) should have a value of 2.5. Coopers
> and the Beep test a value of 1 etc. These are the ways things can be measured
> 1v1, Most Competitive (small sided games), Completed such as how many laps you
> completed in 12 minutes (Coopers) or beep test, Time (how fast the player
> completed a task), or completed such as how many successful shots could be
> made out of 10 tries.

So this needs both a weighting system and a second result shape.

## Decisions taken

Each of these was chosen deliberately; the alternatives are recorded so a future
reader can see what was weighed rather than guessing.

**Individual results are scored by placing within the squad.** A player's raw
number is ranked against everyone else who took the same test that day; the best
result earns the drill's full weight and the rest scale down linearly.
*Rejected:* expanding a test into every pairwise comparison, which reuses the
existing model but turns one twenty-player test into 190 rows that swamp real
1v1s; and scoring against a fixed target, which avoids punishing a strong squad
but requires maintaining a standard for every test.

**Ranking is on share of available points, not the total.** A player is measured
on what they earned divided by what was on offer in the exercises they took part
in. *Rejected:* ranking on accumulated total, under which a player who misses
two sessions can never catch up however well they perform.

**An excused absence is invisible to the maths; an unexcused one scores zero
against the full weight.** This was the coach's own amendment — the fair
treatment of a missed session applies only when the absence was excused.

**Whole-squad exercises are entered as a session grid**, one screen listing the
roster with a value box and an attendance mark per player. *Rejected:* one
result at a time, which makes a twenty-player Cooper's test twenty saves.

**1v1 keeps its pairings.** A 1v1 ladder genuinely produces "who beat whom", and
that record is worth keeping. Small-sided games and every measured test use the
session grid. *Rejected:* routing everything through sessions, which would
reduce a 1v1 day to a win/loss tally and lose the matchups.

**Weights are looked up live, not snapshotted.** Raising Cooper's from 1.0 to
1.5 re-scores every Cooper's test already recorded and re-ranks the table
immediately; setting it back reverts it. This matches the principle 0003 already
states — points are derived, never stored, so they cannot drift from the
recorded outcome. *Rejected:* copying the weight onto each result row, which
freezes history at the cost of one drill meaning two different things in one
table and no way to correct a weight set wrongly.

**Participation earns a floor of 25% of the weight.** Without it, finishing last
in Cooper's earns exactly zero — indistinguishable from not turning up, which
would undercut the excused/unexcused distinction the coach asked for.

## Data model

### Weight and measure live on the drill

`drills_bank` already carries `points INT DEFAULT 3`. It is not vestigial: the
drills library renders it as `⭐ 3 Pts` (`public/js/views/planner.view.js:1863`)
and edits it through `masterDrillFormPoints`. It is the weight concept,
half-built, and reusing it avoids a second competing column.

```sql
alter table public.drills_bank
  alter column points type numeric(3,1) using points::numeric(3,1);

alter table public.drills_bank
  add column if not exists measure text not null default 'head_to_head'
  check (measure in ('head_to_head', 'win_loss', 'count_high', 'time_low'));
```

`INT` cannot hold 2.5, which is why the widening is required rather than
cosmetic. The default keeps every existing drill valid without a backfill.

| `measure` | Used for | Best result is |
| --- | --- | --- |
| `head_to_head` | 1v1 ladder | recorded per pairing in `matrix_logs` |
| `win_loss` | small-sided games | a win |
| `count_high` | Cooper's metres, beep level, shots made of ten | the highest number |
| `time_low` | time to complete a task | the lowest number |

The UI relabels the field **Matrix weight**. The column name stays `points` so
the existing form, the drills library and the XLSX import/export continue to
work untouched.

### Two new tables

```sql
create table public.matrix_sessions (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  drill_id    uuid not null references public.drills_bank(id) on delete restrict,
  occurred_on date not null,
  notes       text,
  is_deleted  boolean default false,
  created_at  timestamptz default now()
);

create table public.matrix_session_results (
  session_id uuid not null references public.matrix_sessions(id) on delete cascade,
  player_id  uuid not null references public.players(id) on delete cascade,
  attendance text not null default 'present'
             check (attendance in ('present', 'excused', 'unexcused')),
  raw_value  numeric,
  outcome    text check (outcome in ('win', 'draw', 'loss')),
  primary key (session_id, player_id)
);
```

`drill_id` is `not null` and `on delete restrict`: a session with no drill has no
weight and no measure, so it cannot be scored, and deleting a drill out from
under recorded results would silently change the standings.

The composite primary key is what stops a player being entered twice in one
session — a duplicate would count their result twice in both the numerator and
the denominator.

`raw_value` carries the number for `count_high` and `time_low`; `outcome`
carries the result for `win_loss`. Exactly one is used per session, decided by
the drill's `measure`. Both are nullable because an absent player supplies
neither.

### `matrix_logs` is unchanged

It keeps holding 1v1 pairings in its existing shape and already carries
`drill_id`, which is where its weight comes from. `drill_id` is nullable there —
the record modal offers "— none —" — so **a pairing with no drill is scored at
weight 1.0**. Refusing those instead would break a form that works today.

`matrix_logs` currently holds zero rows, so nothing needs migrating.

## Scoring

Every exercise gives each player two numbers, `earned` and `available`, and
`available` is always the drill's weight. The single rule across all four
measures is that **the best result earns the full weight**.

| Case | `earned` | `available` |
| --- | --- | --- |
| `head_to_head` win / draw / loss | weight × 1.0 / 0.5 / 0 | weight, per pairing |
| `win_loss` win / draw / loss | weight × 1.0 / 0.5 / 0 | weight |
| `count_high` | weight × max(0.25, 1 − `percent_rank`), ordered high→low | weight |
| `time_low` | weight × max(0.25, 1 − `percent_rank`), ordered low→high | weight |
| attendance `unexcused` | 0 | weight |
| attendance `excused` | contributes to neither | — |

`percent_rank()` is a Postgres window function returning 0 for the best row and
1 for the worst, computed within one session. Equal raw values receive equal
ranks, so two players who both run 2650m earn the same. A session with a single
participant yields `percent_rank` 0 and therefore the full weight.

The `max(0.25, …)` is the participation floor: anyone who competes earns at
least a quarter of the weight, so last place always beats a no-show. It applies
only to the ranked measures — a `win_loss` or `head_to_head` loss earns zero,
because there the coach is recording a definite defeat rather than a placing.

Per player per team:

```
earned_total    = Σ earned
available_total = Σ available
share           = earned_total / available_total     (null when available_total = 0)
```

Ranking is `share` descending, tiebroken by `earned_total` descending — so at
equal percentages the player who has competed more finishes higher.

### Worked example

This is the fixture the migration's self-check asserts against. Cooper's is set
to 1.5, the 1v1 ladder to 3.0, small-sided to 2.5.

```
COOPER'S (1.5)           1v1 LADDER (3.0)          SMALL-SIDED (2.5)
Cesar 2800 1st → 1.500   Cesar beat Caleb → 3.000  Cesar won  → 2.500
Caleb 2650 2nd → 0.750   Caleb lost       → 0.000  Caleb won  → 2.500
Dylan 2500 3rd → 0.375   Dylan drew Marco → 1.500  Dylan lost → 0.000
```

Over three players `percent_rank` is 0.0, 0.5 and 1.0, so Caleb earns
`1.5 × 0.5 = 0.750`. Dylan's score is the floor: last of three gives
`percent_rank` 1, and `max(0.25, 0) × 1.5 = 0.375`.

```
            earned   available   share
Cesar        7.000       7.000    100.0%   1st
Caleb        3.250       7.000     46.4%   2nd
Dylan        1.875       7.000     26.8%   3rd
```

### The view

`matrix_standings` is rewritten to union three sources — `matrix_logs` sides,
`win_loss` session results, and ranked session results — into per-player
`earned` and `available`, then aggregate. It keeps `wins`, `draws`, `losses` and
`games` for display, drops `points` and `win_pct`, and adds `earned`,
`available`, `share` and `exercises`.

`with (security_invoker = true)` is **required**, as it is today: without it the
view runs as its owner and bypasses RLS on the underlying tables.

### Cases the implementation must settle

**A session cannot be run against a `head_to_head` drill.** Those are recorded as
pairings in `matrix_logs`, and allowing both routes for one drill would let the
same day's competition be counted twice. The session grid offers only drills
whose measure is `win_loss`, `count_high` or `time_low`, and the save path
refuses the rest rather than relying on the picker.

**A present player must supply a result.** On a `win_loss` session that means an
`outcome`; on a measured session, a `raw_value`. A row marked present with
neither is refused at save with the player named — silently storing it would put
the full weight into `available` while contributing nothing to `earned`, scoring
them as though they had failed.

**`exercises` counts scored exercises**, meaning pairings plus sessions where the
player was present or unexcused. Excused sessions are excluded, consistent with
their exclusion from `available` — a player must not appear to have competed more
often because they were excused more often.

## Surfaces

**Exercise weights.** One screen listing every drill with its weight and measure,
editable together and saved in a single action, opened from the matrix view.
Weights are tuned as a set — the balance between 1v1, small-sided and fitness —
not one drill at a time, so an editor that makes you open each drill in turn
would be the wrong shape.

**Session grid.** Pick a drill and a date, get the team roster, enter a value per
player and mark absences, save once. The drill's `measure` decides what the value
column asks for (metres, level, seconds, successes) and which direction wins. A
session can be soft-deleted, so a mis-entered one is never permanent.

**Standings table.** Gains SHARE, PTS, AVAIL and EXERCISES columns beside the
existing W/D/L.

**The existing Record Result modal is untouched** and continues to handle 1v1
pairings, including the stay-open behaviour added for entering a run of results.

## Access control

Reads stay public, matching every other table. Writes to both new tables are
gated on `public.is_team_coach(team_id)`, the same helper 0005 uses for
`team_players` — so a coach can only record results for a team they actually
coach, and the client-side `auth.isCoach()` check remains a UI affordance rather
than the enforcement.

`matrix_session_results` has no `team_id` of its own; its policy reaches the team
through its session. Editing the weight on a drill is a `drills_bank` write,
already covered by the existing coach/admin policy.

## Verification

The scoring maths lives in SQL, and `npm test` cannot reach a Postgres view.
Mirroring the formula in JavaScript to make it testable would create precisely
the parallel copy this repository already warns about in three places.

So the migration ends with a **self-check**: inside a transaction it creates a
throwaway team, inserts the worked example above, reads `matrix_standings` back,
and raises an exception unless Cesar is 100.0%, Caleb 46.4% and Dylan 26.8%. The
fixture is then rolled back, leaving nothing behind. The maths is proven against
known numbers at the moment it is applied, on the real database, rather than
against a reimplementation.

Vitest covers the JavaScript on either side: building session payloads from the
grid, the weights editor, and rendering the standings table — including the case
where `share` is null because a player has no scored exercises.

The four existing gates all apply: `npm test`, `npm run typecheck`,
`node --check` over `public/js/`, and `npm run build`.

## Out of scope

**Editing an individual past session.** A mis-entered session is soft-deleted and
re-entered. Building a second grid for editing is disproportionate to how often
that should happen, and deletion means no mistake is permanent.

**Varying attempt counts.** "Eight of ten shots" is recorded as the raw number 8;
if one player took fifteen attempts the comparison is unfair. Every measured test
is assumed to give every player the same opportunity. If that stops being true, a
denominator column is the extension.

**Cross-team standings.** The matrix stays partitioned by team, as it is now.

**Backfilling `measure` intelligently.** Every existing drill defaults to
`head_to_head`; the coach sets the real measure on the weights screen. Guessing
from a drill's name would be wrong often enough to be worse than asking.

## Consequences worth stating

`matrix_standings` changes shape, so `fetchMatrixStandings` in
`src/data/supabase.ts` and the matrix view must be updated in the same change.
Between applying the migration and deploying the code, the standings panel reads
columns that no longer exist — the error is swallowed into a `console.warn`
returning null, so the panel goes quietly blank rather than throwing. This is the
same failure window 0005 documented for its own view rewrite. **Deploy the code
first, then apply the migration**, and the window closes.

Changing a weight re-ranks history by design. A coach who has shown the squad a
table will see it change when they retune. That is the intended behaviour of live
lookup, and it is reversible.
