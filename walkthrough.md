# Walkthrough — BHS Soccer

A web platform for a high school soccer program: a public roster and schedule
hub, plus a coach-only command centre built around Anson Dorrance's
**Competitive Matrix**.

Built for **Beaumont High School** first, but the data model is multi-tenant
throughout. Club coaches use it too, so nothing here assumes a single school —
organizations, teams, branding and standards are all per-tenant.

---

## What it does

### Public side

Anyone can see the roster, the schedule, the next fixture and the handbook
without signing in. Ratings, practice plans and the Competitive Matrix are not
public.

### Teams

A **school or club** is an organization; **teams** belong to one. A player can
be on one team per organization, which is what lets somebody play for their
school and a club at the same time. The team picker in the header decides what
every screen shows, and the choice is remembered per device.

Almost everything is scoped to a team: roster, schedule, Matrix, practice plans,
the daily message, and which quiz questions are asked. The drill library and the
question bank are shared across an organization, so a good drill is written once.

### The Competitive Matrix

Players earn points from recorded results. Each exercise carries a **weight** —
how much it matters — and a **measure** deciding how points are earned:

| Measure | For | Points |
| --- | --- | --- |
| 1v1 pairings | Head-to-head duels | Win 1.0, draw 0.5, loss 0 |
| Small-sided | Team games | Win 1.0, draw 0.5, loss 0 |
| Counted, higher wins | Cooper's, beep test | Ranked against the squad that session |
| Timed, fastest wins | A sprint where placing matters | Ranked against the squad that session |
| Timed against a standard | Three laps under 4:30 | Absolute — hit the time, earn the band |

Points earned are `weight × factor`. Standings rank on points first, with the
share of what was available breaking ties, so competing in what matters and
winning is what rises.

The scoring lives in Postgres, in the `matrix_exercise_points` view that
`matrix_standings` aggregates. The client never re-derives what a result is
worth.

### Recording results

Results are often written on paper during a session, and handwriting is not
always readable. Every player carries a **recording number** — distinct from
their shirt number — that they write instead of their name. Every screen where
results are entered leads with that number and is ordered by it.

- **Record a session** — the whole squad on one screen, for a counted, timed or
  small-sided exercise.
- **Record Practice Drill Scores** — individual 1v1 results, with a box that
  takes a recording number or a surname.
- **1v1 Round Robin** — prints a schedule where every player meets every other
  once, and marks itself off as results are recorded.

### Practice

A practice planner with a drill library, a canvas tactical diagrammer, print and
PDF output, and plans that can be copied between squads as independent
snapshots.

### Daily message and quiz

A short coaching message per squad, and a quiz drawn from a question bank. A
question can name the message it tests, in which case it is asked only while
that message is current; questions naming none are always asked.

---

## How it is put together

- **Postgres (Supabase) is the source of truth.** `loadData()` returns empty
  collections and `saveData()` is a no-op; every mutation writes through the
  service and a reload repopulates state.
- **Auth is real Supabase Auth** joined to a `profiles` row carrying role,
  status and organization. Client-side guards are affordances; **enforcement is
  in the RLS policies**.
- **A coach has write access only to teams they are assigned to.** Having the
  coach role is not enough — this is enforced by `is_team_coach()` in the
  database, not just hidden in the interface.

### The code

| Where | What |
| --- | --- |
| `public/js/app.core.js` | The `BHSSoccerApp` class, sync, and the view router |
| `public/js/views/*.js` | One file per screen, each extending the prototype |
| `public/js/admin.js` | Admin panel, import/export, diagnostics |
| `public/js/diagrammer.js` | The canvas tactical board |
| `src/main.ts` | Module entry point; installs auth and the Supabase client |
| `src/auth.ts`, `src/auth/permissions.ts` | Real auth and RBAC |
| `src/data/supabase.ts` | Every database read and write |
| `supabase/migrations/*.sql` | Applied by hand, in order |

Script order in `index.html` is load-bearing: `public/js/app.core.js` defines the class,
and every view file extends it afterwards.

---

## Verification

774 tests across 63 files, plus three other gates:

| Gate | Covers |
| --- | --- |
| `npm test` | Vitest, including the classic scripts loaded via `?raw` |
| `npm run typecheck` | `tsc --noEmit` over `src/` only |
| `node --check` | Syntax of every file in `public/js/` |
| `npm run build` | The only check that exercises real module resolution |

All four are required. Typecheck and tests can both pass while an import is
unresolvable at bundle time.

Tests execute the real code rather than matching source text, and the rules
most worth protecting are mutation-checked — the test is confirmed to fail when
the behaviour is broken deliberately. That practice has caught several tests
that passed against code doing the wrong thing.

---

## Notes for whoever works on this next

- **No agent has database access.** Migrations are applied by hand in the
  Supabase SQL editor. Verify columns against the running database, never
  against `supabase_schema.sql`, which has drifted.
- **A migration that changes deployed behaviour is split in two**, with the code
  deploy between them, so there is never a window where running code queries
  something that is gone. `0014`/`0015` and `0019`/`0020` are the pattern.
- **Silent failure is the house enemy.** A write refused by RLS returns no rows
  and no error, so service methods return `{ok, error}` and callers say so.
  Anything that could report success over a lost row is treated as a bug.
- `app.js` at the repo root is a dead legacy monolith, not loaded by anything.
