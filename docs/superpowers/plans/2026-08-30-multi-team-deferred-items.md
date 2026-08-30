# Deferred items and rulings — for the final whole-branch review

Seven findings were deferred as Minor during the task loop, and eighteen rulings were made on the
project owner's behalf. **Triage of the deferred list is the most valuable thing this review can
produce** — decide each, do not merely restate it. Check the rulings too; each was a decision taken
without asking.

## Deferred minors — triage each as FIX BEFORE MERGE / LATER / ACCEPT PERMANENTLY

1. **`0005:230-235` — a stale comment.** It says re-running the player copy after a player moved
   teams aborts with `23505`. But section 11 of the same file now drops `players.school_id` at the
   end of every successful run, so a re-run would fail earlier with `42703` (column does not
   exist). Comment-only, and it describes a scenario the migration collapse made unreachable.

2. **`setActiveTeam` can silently revert.** It sets `activeTeamId`, then `syncFromSupabase`
   re-resolves it from scratch. A transient `fetchTeamsForViewer` failure normalizes to `[]`, so
   the switch quietly reverts rather than failing loudly. Inherent to the single-resolution-path
   design.

3. **Unescaped interpolation in the team switcher.** `<optgroup label="${org}">` and
   `<option value="${t.id}">` — a quote in a coach-entered team name would break the `<select>`.
   Matches the repo-wide convention: no `escapeHtml` helper exists anywhere in `public/js/`, and
   the same pattern appears in `app.core.js`, `admin.js` and `planner.view.js`. Inherited risk, not
   a regression.

4. **Teams from two *unnamed* organizations merge into one `"Team"` optgroup.** Edge case only
   reachable if a school row has an empty name.

5. **The dormant `src/views/roster.view.ts` mirror still carries the old `upsertPlayer('bhs', …)`
   calls** — writes to columns `0005` drops. Not in the module graph so nothing breaks today, but
   it would reintroduce the bug if ever wired live. Same dormant-twin drift `CLAUDE.md` already
   describes for `src/app.core.ts`.

6. **`upsertTeamMembership` hardcodes `is_deleted: false`**, so re-adding a previously-removed
   player resurrects their old membership row with its number and stats rather than starting fresh.
   I ruled this desirable (Ruling R) — an undo rather than a duplicate-key error — but a second
   opinion is worth having.

7. **`searchPlayersByName` has no organization scope.** It searches every player identity in the
   database, so a coach at one club sees names from another organization in the add-existing-player
   search. I first wrote this up as a privacy finding and then checked, which weakened it
   considerably: `players` is publicly readable by design — this is a public roster site and the
   `players_select` policy grants `anon` — so the search exposes nothing that is not already on a
   public page. It is also not trivially fixable now, because `0005` drops `players.school_id`
   entirely; scoping would mean joining through `team_players`. Recording it as a **usability**
   issue rather than a security one: with several organizations the search will return people a
   coach has no business adding, and the `unique (school_id, player_id)` constraint is what stops
   them. Worth a scope filter eventually, not before merge.

## The pattern this branch kept hitting

**Every specification defect was mine, and the implementers built exactly what I wrote.** Three
were structural and caught only by review:

- **Task 1** shipped `team_coaches` empty, which would have stripped roster-write access from every
  existing coach the moment the code deployed — and `team_coaches_write` is admin-only, so they
  could not have restored it themselves.
- **Task 2's review** found that *no task in the plan rewired the existing player CRUD*.
  `addPlayer` and `saveEditPlayer` still wrote to columns `0005` drops, so Add Player would have
  silently done nothing after the migration.
- **Task 3's guard** was pasted at the top of `syncFromSupabase`, gating seven fetches that are not
  team-scoped at all — so any transient failure of one call blanked school branding, drills and
  coaches for the whole sync pass.

And separately: **six weak tests across two plans, all the same shape** — asserting a symbol is
*present* rather than *exercised*. Two rounds were spent removing that pattern from this branch
(Tasks 2 and 4). **Please treat any remaining plan-authored test body with the same suspicion as
implementation code, and say plainly if one cannot fail.**

## The eighteen rulings — check these

- **A** — carried corrections for two tasks whose Files blocks omitted a file their own steps edit.
- **B**, superseded by **P** — I first ruled Task 5's missing tests could be filled with shallow
  presence assertions, then reversed it after spending a round removing exactly that pattern.
- **C** — no batching; all six tasks touch different surfaces.
- **D** — fixed eleven Task 1 findings in one round.
- **E** — put the `team_coaches` backfill in the migration rather than leaving it a manual runbook
  step, because a manual step is one somebody forgets.
- **F** — fixed all twelve findings in one dispatch.
- **G** *(the owner's call)* — collapsed the two-migration split after the owner said current data
  is reproducible. **Consequence worth checking: the migration must now be applied at merge time,
  not before**, because it drops `players.number` as it creates the new tables and the deployed
  app breaks in the gap.
- **H** — withdrew two findings that only guarded data preservation.
- **I** — fixed a query comparing an auth uid to a `players.id`, which could never match and would
  have silently shown a signed-in player the wrong team's roster.
- **J** — accepted that the standings check cannot detect a win/loss inversion (see below).
- **K** — expanded Task 5 to own the whole player-write surface rather than adding a seventh task.
- **L** — accepted that creating a player is two writes with no transaction; a failure leaves a
  person on no team, which is recoverable and must be *reported* rather than engineered away.
- **M** — fixed `fetchPublicDefaultTeamId`, which assumed a global uniqueness the schema does not
  provide.
- **N** — narrowed Task 3's over-broad guard.
- **O** — replaced Task 4's grep-based tests with behavioural ones.
- **Q** — added `deleteTeamMembership` before review rather than leaving raw client access.
- **R** — accepted that re-adding a removed player resurrects their old membership.

## What nobody in this chain could verify

- **No SQL has been executed.** No agent has DDL access — only the publishable anon key. The
  migration is verified by reading and by the runbook, nothing else.
- **Nothing has run in a browser.** The switcher, the roster, the add-player flow: all verified by
  static tracing plus the four gates.
- **A win/loss inversion in `matrix_standings` is undetectable at runtime.** I had the replacement
  check attacked rather than confirmed, and the reviewer agreed: comparing twice the log count
  against the sum of `games` catches a failed backfill or a dropped union branch, but an inversion
  swaps *which* player is credited without changing *how many* sides exist. Correctness there rests
  entirely on two reviewers having read the SQL against `0003`.
