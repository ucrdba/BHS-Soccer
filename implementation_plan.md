# Architecture & Data Model — BHS Soccer

> This began as a pre-build implementation plan. The work it planned is done and
> has been superseded several times, so it is now a description of what exists
> rather than a proposal. Design documents for individual pieces of work live in
> `docs/superpowers/specs/`; the migrations in `supabase/migrations/` are the
> authoritative record of how the schema got here.

---

## Multi-tenancy

The platform is multi-tenant by design, not by aspiration. A club coach with no
connection to Beaumont uses the same deployment.

- **`schools`** holds organizations, distinguished by `kind` — `school` or
  `club`. Name, mascot, colours and record come from this row, so nothing
  renders a hardcoded team identity.
- **`teams`** belong to an organization and carry a season and an
  `is_public_default` flag deciding what a visitor sees.
- **`team_players`** is the membership, and carries everything that varies by
  team: shirt number, recording number, position, season stats, ratings. So
  `players` is pure identity and one person can appear on a school team and a
  club team with separate statistics.

`unique (school_id, player_id)` on the membership enforces one team per
organization; a composite foreign key to `teams (id, school_id)` stops that
column drifting from its team's.

**Do not hardcode a school code in new work.** Legacy `'bhs'` literals exist and
are being removed as they are touched; new reads resolve the organization from
the active team or the signed-in profile.

---

## Access control

Four roles — `guest`, `player`, `coach`, `admin` — on a `profiles` row joined to
Supabase Auth, each carrying a `status`. Signup lands in a pending state that a
coach or admin clears.

| Role | Sees | Changes |
| --- | --- | --- |
| Guest | Roster, schedule, home, handbook | Nothing |
| Player | The above, their team's pages, the quiz | Their quiz answers |
| Coach | Everything for teams they are assigned to | Roster, schedule, Matrix, plans for those teams |
| Admin | Everything, every team | The above, plus teams, organizations, coach assignments |

Two rules that are easy to get wrong:

- **The coach role grants nothing on its own.** Write access comes from a
  `team_coaches` assignment, checked by `is_team_coach(team_id)` in the policies.
- **Client-side guards are affordances.** `auth.isCoach()` decides what to draw;
  `supabase_migration_auth.sql` and the later migrations decide what is allowed.
  A new privileged operation needs a policy, not just a check.

`current_profile_role()` is `SECURITY DEFINER` to avoid RLS self-recursion, and
falls back to `guest` once status is not `active` — so revoking a coach actually
revokes them.

---

## Scoring

`matrix_exercise_points` is the single view that decides what a result is worth.
`matrix_standings` aggregates it, which is what guarantees a player's breakdown
sums to their leaderboard row. Nothing re-derives scoring in JavaScript.

Each branch of that view handles one measure:

| Branch | Source | Factor |
| --- | --- | --- |
| `h2h` | `matrix_logs`, both directions | win 1.0 / draw 0.5 / loss 0 |
| `ranked` | Counted and fastest-wins sessions | `greatest(0.25, 1 - percent_rank())` |
| `banded` | Timed-against-a-standard sessions | The tightest band the time fits under |
| `win_loss` | Small-sided sessions | win 1.0 / draw 0.5 / loss 0 |
| `absent` | Unexcused no-shows | 0 of the weight |
| `not_entered` | On the roster, never given a row | 0 of the weight |

`earned = weight × factor`, `available = weight`. An excused absence appears in
neither, which is what excused means.

Two deliberate asymmetries:

- **`ranked` has a participation floor of 0.25** so last place still beats not
  turning up. **`banded` does not** — a standard that pays out for missing it is
  not a standard.
- **A team with no bands for a banded drill is excluded entirely**, rather than
  scored zero. Zero would drag their share down because a coach had not
  configured something yet.

---

## Migrations

Applied by hand, in order, in the Supabase SQL editor. No agent has DDL access.

- `supabase_schema.sql`, `schema_roles.sql`, `seed_data.sql` — historical
  provisioning. **`supabase_schema.sql` has drifted from the live database and
  must not be trusted for column existence.**
- `supabase_migration_auth.sql` — supersedes the RLS story in those files.
- `supabase/migrations/0001`–`0022` — everything since.

Conventions that have earned their place:

- **`set role postgres;` immediately after `begin;`.** The SQL editor may run as
  a role that is a *member* of postgres without defaulting to it, and
  `ALTER TABLE` / `CREATE POLICY` check ownership rather than privilege.
- **`add column if not exists`, never `alter column`** — correct against both
  the live database and the declared schema.
- **A self-check block** asserting what was created, and what must have
  *survived*. Several migrations assert that a column later work still reads was
  not dropped early.
- **A documented rollback**, and an explicit note when a change is destructive.
- **Split a behaviour change in two**, with the code deploy between: the first
  adds the replacement and leaves the old thing, the second removes it.
  `0014`/`0015` and `0019`/`0020` are the pattern. `0005` did both at once and
  left a window where deployed code queried a dropped column.

---

## Verification

Four gates, all required before merging:

```
npm test          # Vitest — unit and behavioural
npm run typecheck # tsc --noEmit over src/ ONLY
node --check      # the syntax gate for public/js/, which typecheck cannot see
npm run build     # the ONLY check that exercises real module resolution
```

Testing conventions:

- **Execute the code, do not match its source.** A `toContain()` check against a
  script's text passes with an inverted condition. Classic scripts are loaded via
  Vite's `?raw` plus `new Function`.
- **Assert the value that reaches the database**, not that a call returned.
- **Mutation-check anything load-bearing** — break the behaviour deliberately and
  confirm a test fails. This has repeatedly caught tests that passed against code
  doing the wrong thing, including a whole suite that never read the table it
  claimed to test.
- `tsconfig.json` does not pick up `@types/node`: no `Buffer`, `process` or
  `node:` imports in tests. It is deliberately loose; do not tighten it as a side
  effect of another change.

---

## Failure modes this codebase keeps re-learning

Written down because each cost real time, and each recurred:

1. **A school code where a team id belongs.** `'bhs'` into a uuid column fails
   with `22P02`, the service logs and returns null, and the page renders empty.
   Daily thoughts were silently dead for months this way. Team-scoped methods
   now refuse a non-uuid up front.
2. **A write refused by RLS returns no rows and no error.** Indistinguishable
   from success unless the caller checks. Service methods return `{ok, error}`
   and the UI shows it where the coach is looking.
3. **A column that does not exist.** `drills_bank.points` and `.duration`,
   `soccer_categories.school_id`, `matrix_session_results.is_deleted` — all
   declared or assumed, none present. Probe the live database.
4. **State that survives a team switch.** Guarding an assignment on
   `length > 0` leaves the previous squad's data on screen under the new team's
   name — and loading it can carry the old team's row ids into a write.
5. **A number that is the wrong number.** Shirt versus recording number had to
   be corrected on four screens after `0021`. Any screen read beside a paper
   sheet wants the recording number.

---

## Open work

- `src/app.core.ts`, `src/data.ts` and `src/utils.ts` are dormant and still carry
  pre-migration seed logic. They must be ported before anything wires them into
  the module graph.
- `src/views/schedule.view.ts` passes a school code where a team id belongs; it
  is marked and inert.
- The `coaches` display table overlaps confusingly with `team_coaches` and
  deserves its own decision.
- `practice_plans` is one row per drill slot, with a plan being the rows sharing
  a name. Normalising it into a header and items would be a real improvement.
