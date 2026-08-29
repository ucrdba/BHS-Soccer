# SDD ledger — plan: docs/superpowers/plans/2026-08-29-phase-3-competitive-matrix.md

Spec: docs/superpowers/specs/2026-08-29-postgres-source-of-truth-design.md ("Competitive matrix" section) — read, reachable
Branch: feat/typescript (feature branch, not main). Phase 0-1 already complete on this branch;
its ledger is at docs/superpowers/plans/2026-08-29-phase-0-1-execution-ledger.md (30 rulings).
Started: 2026-08-29, BASE 64a452d

## Pre-flight conflict scan

### Cross-task rows (tasks sharing a file or interface)

| Tasks | Shared | Produces vs consumes | Finding |
| --- | --- | --- | --- |
| T1 → T2 | `matrix_logs` columns | T1 creates player_a_id/player_b_id/outcome/is_deleted/school_id; T2's view reads exactly those | Clean — names match. |
| T2 → T3 | view columns | T2 emits player_id/wins/draws/losses/games/points/win_pct/rank; T3 selects `*` and T4 reads those keys | Clean. |
| T3 → T4 | `fetchMatrixStandings()` | defined T3, called T4 | Clean. |
| T3 → T6 | `logMatrixResult(schoolId, {playerAId, playerBId, outcome, drillId, scoreText, occurredOn})` | defined T3, called T6 with exactly those keys | Clean. |
| T4 → T5 | `matrixStats` shape | T4 produces {wins,draws,losses,games,points,winPct,rank}; T5 consumes those keys | **P3** — see below. |
| T4 → app.core.js:234 | `matrixStats` | line 234 already sets `matrixStats: p.matrix_stats || {}` in the players mapping | **P1** — see below. |
| T5 → roster.view.js:59, admin.js:64/706 | `matrixStats.rank` | three other files read `.rank`, two WITHOUT optional chaining | Clean — T4 sets matrixStats (incl. rank) for every player in this.data.players, so `.rank` always resolves. |
| T5, T6 | — | T5 edits matrix.view.js; T6 edits index.html + admin.js | Clean — disjoint files. |
| T1, T2 | `supabase/migrations/` | different filenames, 0002 and 0003 | Clean. |

### Self-consistency rows (each task's text against itself)

| Task | Finding |
| --- | --- |
| T1 | Clean. `current_profile_role()` verified to exist (supabase_migration_auth.sql:50). All referenced tables exist. |
| T2 | Clean — I hand-worked the Step 2 trace myself: P gets w1/d1/l1, games 3, points 4, win_pct 50.0; Q identical. Arithmetic checks out. |
| T3 | Clean. Uses `getSchoolUuid()` and `isUuid()`, both verified present in src/data/supabase.ts. |
| T4 | **P1**. |
| T5 | **P2** (leaderPts recomputed per row) and **P3** (object-level fallback misses the old shape). CSS class `score-progress` verified to exist (styles.css:604) — an earlier draft used a non-existent `score-bar-bg`, corrected during plan self-review. |
| T6 | Clean. `closeModals()` (utils.js:22), `syncFromSupabase()` (app.core.js:173) and `renderCurrentView()` all verified present. |
| T7 | Clean — human verification, no code. |

### Rulings

- **Ruling P1** (T4 vs app.core.js:234): `syncFromSupabase()` already assigns `matrixStats: p.matrix_stats || {}` while mapping players, and T4 adds a separate pass that overwrites it from the standings view. Functionally correct — the later pass wins — but an implementer could reasonably "tidy" one of the two and break the other. Decided: keep line 234 and document that T4 supersedes it, because `players.matrix_stats` is still read by the roster export and removing the column read would need a coordinated change there. Added that note to T4's code comment. **Cost if wrong:** a redundant assignment overwritten microseconds later; no behavioural effect.
- **Ruling P2** (T5 performance): `leaderPts` was computed inside the `.map()`, rescanning every player for every row — O(n²). Harmless at 12 players but a predictable review finding and trivially avoidable. Hoisted it above the map inside an IIFE. Verified brace/paren balance (18/18, 19/19). **Cost if wrong:** a template-literal syntax error, caught immediately by `node --check`.
- **Ruling P3** (T5 vs the old matrixStats shape — the one real bug this scan caught): T5's fallback was `p.matrixStats || {defaults}`, which only fires when matrixStats is entirely absent. But two code paths create players with the OLD shape — `roster.view.js:180` (add player through the UI) and `admin.js:1109` (import) — both producing `{wins, losses, points, rank, drillScore}` with no `games`, `draws` or `winPct`. For such a player the object-level fallback would NOT fire and the leaderboard would render `undefined` for GP and W-D-L until the next sync. Decided: per-key defaults instead of an object-level fallback, so a partial or legacy shape is filled in field by field. Left the two creation sites alone — they are corrected on the next sync anyway, and changing them is scope this plan did not ask for. **Cost if wrong:** none; per-key defaults are strictly more permissive than the object-level version.

Scan complete: 3 findings, 3 ruled, all fixed in the plan file before dispatch (T4 comment, T5 hoist, T5 per-key defaults).

## Human-gated tasks

Tasks 1 and 2 write migration files but CANNOT apply them — no agent here has DDL access.
Task 7 is end-to-end verification requiring both migrations applied plus a real browser.
Both must be surfaced clearly rather than silently skipped or faked.

## Progress

(no tasks complete)

Pre-dispatch verification (controller, for Task 6): live players.id and drills_bank.id are
real UUIDs (e.g. f5bc1564-12fb-43cf-a32f-d44d88771544, e747d3cf-5dec-4d3e-8390-787f8c84dd82),
so matrix_logs' player_a_id / player_b_id / drill_id foreign keys will be satisfied by ids taken
straight from this.data.players and this.data.drillsBank after a sync.
Edge case, acceptable: a player added through the UI but not yet synced carries a local id like
'p_1724...', which would fail the FK with 22P02 invalid-uuid. logMatrixResult returns
{ok:false, error} rather than null, so the form surfaces it instead of failing silently — which
is exactly why that method deviates from its ~45 siblings' return convention.

Tasks 1+2: BASE e88c086, dispatched as ONE batch (sonnet) — same shape (write one SQL migration
verbatim, verify by reading), independent files, no test cycle of their own.

Tasks 1+2 review: Spec compliant, Approved, 0 Critical/Important. Reviewer diffed both files
against the brief's SQL fences (byte-identical), independently re-derived the arithmetic rather
than checking the report's, and confirmed the highest-risk line: outcome='a' in the union's
player_b branch lands in the LOSS position, not inverted. Also verified the re-created policies
are character-for-character the project's uniform loop (supabase_migration_auth.sql:226-236),
security_invoker present, drill_id on delete set null, and the self-play check effective.
Tasks 1+2: minor (deferred): the migration grants insert/update/delete to `authenticated` only,
  whereas supabase_migration_auth.sql:216 grants them to both anon and authenticated and relies
  solely on RLS. Functionally identical (current_profile_role() is null for anon, so RLS denies
  either way) and arguably tighter defence-in-depth. It is my brief's text, not an implementer
  choice. Left as written.
Tasks 1+2: minor (deferred): the reviewer independently observed that a player with no logged
  matches produces NO row in matrix_standings, so the leaderboard must left-join players against
  the view or such players vanish. This is already Task 4's design — useful independent
  confirmation that the plan's approach is the right one.
Tasks 1+2: complete (commits e88c086..d781b8e, review clean, 25/25 tests)

Task 3: BASE d781b8e, dispatched (sonnet) in parallel with the Tasks 1+2 review — disjoint files
(TypeScript vs SQL migrations), reviewer is read-only.

Task 3 review: Spec compliant, Approved, 0 Critical/Important. Reviewer cross-checked against
fetchDailyThoughts (the known 'bhs'-into-UUID bug) and confirmed both new fetchers resolve via
getSchoolUuid() first — the bug is NOT repeated. Confirmed logMatrixResult distinguishes all five
outcomes including the zero-rows RLS denial, that nothing throws, and that drill_id is omitted
rather than sent null when no drill is chosen.
Task 3: minor (deferred): score_text uses `|| null` rather than `?? null`, so an empty string
  collapses to null. Correct for this field's semantics.
Task 3: minor (deferred, ANALYSED AND NOT REACHABLE): the reviewer noted the zero-rows check
  cannot distinguish "INSERT denied by RLS" from "INSERT succeeded but the SELECT-back was
  denied", which would report failure for a successful write — a false negative that could lead
  a coach to re-enter a result and duplicate it. Controller checked: matrix_logs_select is
  `coalesce(is_deleted,false) = false` (0002 migration line 47) and a freshly inserted row
  defaults is_deleted to false, so the select-back always succeeds under the policies as written.
  Not reachable today. Worth re-checking if that select policy is ever narrowed.
Task 3: complete (commits d781b8e..9425381, review clean, typecheck 0, build clean, 25/25)

Task 4: implementer DONE (3b9cdbd). Placement confirmed: the standings pass sits immediately
after `this.data.players = dbPlayers...map(...)` closes and before the dbSchedule fetch, inside
the same try.

Controller cleanup (outside the plan, from earlier import work): app.core.js had an orphaned
JSDoc — the upsert methods were inserted between photoOrPlaceholder's doc comment and the
function, leaving the comment describing the wrong method. Reattached; comment only, node --check
clean. Commit 60585b9.

Task 4 review: Spec compliant, Approved, 0 Critical/Important. Reviewer read syncFromSupabase in
its post-edit form (not just the hunk) and confirmed all four decisions: the pre-existing
matrix_stats assignment survives at app.core.js:234, the join runs after the players block and
before dbSchedule inside the same try, and it runs UNCONDITIONALLY rather than nested inside the
players-length guard. Traced all five failure cases; confirmed win_pct IS coerced via Number(),
which was the specific risk flagged — a PostgREST numeric column serialising as a string would
otherwise have reached .toFixed() in the renderer.
Task 4: minor (deferred): wins/draws/losses/games/points use bare `|| 0` without Number(),
  unlike win_pct. Safe while those remain integer columns in the view; would resurface the same
  string-serialisation bug if any became numeric.
Task 4: minor (deferred): an orphaned standings row (player deleted after results were logged)
  still counts toward unrankedFrom, inflating the fallback rank number. Cosmetic, no corruption.
Task 4: complete (commits 9425381..3b9cdbd, review clean, node --check clean, 25/25)

Ruling P4 (PROMOTED from the Task 4 reviewer's first Minor — I am ruling against my own brief):
unlogged players receive `rank = dbStandings.length + 1`, which is 1 when nothing has been logged
yet. So the first time a coach opens the leaderboard, ALL 12 players would be badged #1. The
reviewer rated this Minor and "inherited from the brief" — correct on provenance, but it is a
spec violation: the spec says unlogged players "rank last", and #1 is the opposite. It is also
the very first thing the human will see on that screen.
Decided: render a dash for rank when games === 0, matching how winPct already renders for the
same condition, and keep the numeric rank for sorting so unlogged players still sort below ranked
ones. Fixed in the plan before Task 5 was dispatched, so it costs nothing. Cost if wrong: an
unranked player shows "—" instead of a provisional number; trivially reversible.

Task 5: BASE 561c1ab, dispatched (sonnet).

Ruling P5 (Task 6, found pre-dispatch): my brief gave the stub form's range as index.html:88-121,
but the block actually spans 88-122 — it ends with THREE closing tags in sequence (</form>, then
</div> for .modal-window, then </div> for .modal-overlay). An implementer trusting the range would
leave a stray </div>, silently breaking the page structure for every element after it, or delete
one too many and close a parent early. Neither would be caught by node --check (it is HTML, not
JS) or by any test. Corrected the range and replaced the line-number instruction with locate-by-id
plus an explicit tag-counting check. Cost if wrong: none — the instruction is now to count rather
than to trust a number.

Task 5 review: Spec compliant, Approved, 0 Critical/Important. Reviewer traced the render for a
leader, a mid-table player and a zero-games player: IIFE returns and interpolates correctly (no
undefined tbody), six <th> align 1:1 in order with six <td>, .toFixed() is only reached in the
non-null branch, Math.max(1,...) forecloses both divide-by-zero and any barPct above 100, and the
games===0 dash prevents the everyone-is-#1 bug. Confirmed all four CSS classes exist in styles.css.
Task 5: minor (deferred): leaderPts is computed from the UNFILTERED this.data.players while rows
  are filtered to exclude soft-deleted players. If a soft-deleted player holds the highest points,
  the visible leader's bar reads under 100% instead of exactly 100%. Cosmetic; inherited from my
  brief's own code, not an implementer deviation. One-word fix (filter before computing) if the
  final review wants it.
Task 5: minor (deferred): the implementer reworded a comment because MY brief's example comment
  contained the literal token `drillScore`, which would have failed MY OWN Step 3 negative-grep
  gate. Reviewer judged the reword sound and meaning-preserving — it was the least-bad of three
  options, the others being failing the gate or deleting it.
Task 5: complete (commits 561c1ab..081bf88, review clean, node --check clean, 25/25)

Ruling P6 (final whole-branch review scope): `git log 4a56a07..HEAD` shows 23 commits since the
Phase 0-1 ledger closed. Only the last ten (64a452d onward) are Phase 3 and have had task-scoped
reviews. Commits 1-13 — the photo placeholders, the import upsert work, roster sorting, the
photo_url null change, the post-import re-sync, and the import UI clarification — were made
outside any plan and reviewed by NOBODY except me. That is a real gap: they include behavioural
changes to the import path, which is the most data-destructive surface in this app.
Decided: scope the final whole-branch review to 4a56a07..HEAD rather than to Phase 3 alone, so
that unreviewed feature work gets a reviewer's eyes before merge. Cost if wrong: a larger diff for
the final reviewer to read, and Phase 3's findings diluted among feature-work findings — worth it,
because the alternative is shipping the import changes with only my own verification behind them.

Task 6 review: Spec compliant, Approved, 0 Critical/Important. Reviewer produced a full element-id
cross-check table (all 8 matrix* ids defined exactly once in index.html, each read in admin.js, no
mismatches — ruling out silent null-returning getElementById calls). Recounted div tags WITHIN the
replaced block (old 6 open/6 close, new 10/10) rather than trusting the file-wide 248->252 balance,
confirming it is not a coincidence masking an internal mismatch. Traced the failure path: the
res.ok check returns BEFORE syncFromSupabase/renderCurrentView/closeModals, so the modal stays open
and no false-success state is reachable. Confirmed the surviving "Alex Rivera" at index.html:1117
is inside #registerForm, not the modal.
Task 6: minor (deferred): index.html:1117 placeholder text "e.g. Coach David Steele or Alex Rivera
  (#10)" on the registration name field — unrelated demo-name text, not a selectable option, not a
  regression. Follow-up ticket if the project wants all demo names purged.
Task 6: complete (commits 2fa82d5..b526574, review clean, build clean, 25/25)

ALL SIX AGENT-EXECUTABLE TASKS COMPLETE (1-6). Task 7 is human-gated: it needs both migrations
applied and a real browser. Dispatching the final whole-branch review over 4a56a07..HEAD per
ruling P6 — Phase 3 plus the thirteen unreviewed post-Phase-0/1 feature commits.

Controller observation logged during the final review (roster.view.js:180, addPlayer):
  A newly added player is given `matrixStats: {wins, losses, points, rank: players.length+1,
  drillScore: 75.0}` — the PRE-Phase-3 shape. It has no `draws`, `games`, or `winPct`, it carries
  the removed `drillScore`, and its `rank` is fabricated from array length rather than derived from
  standings. Until the next syncFromSupabase join runs, the roster card at roster.view.js:59 renders
  that invented rank as if it were real, and the matrix leaderboard reads fields that are absent.
  Not a crash (the roster only reads .rank), but it is the exact "import writes one shape, Phase 3
  reads another" interaction the final reviewer was asked about in cross-cutting question 3.
  Flagged here so it is triaged whether or not the reviewer finds it independently.

Pre-handoff verification on the final tree (b526574), run by the controller because the final
reviewer was barred from executing anything:
  - npm test: 25/25 passed, 4 files (vitest 4.1.11)
  - npm run build: succeeded in 999ms, 53 modules. The eight "can't be bundled without
    type=module" lines are the documented classic-script passthrough, NOT errors.
  - Built-artifact check (beyond what any per-task gate did): dist/js/ contains all 5 root scripts
    and all 6 view scripts; dist/img/ contains both player-placeholder.png and
    coach-placeholder.png; dist/index.html still references ./js/* in the required load order
    (data -> diagrammer -> app.core -> views -> admin -> utils). That ordering is load-bearing —
    BHSSoccerApp must exist before any Object.assign prototype extension runs — and it is now
    confirmed in the emitted output rather than only in source.
  - Working tree: no modified tracked files. Untracked only: Resouces/Thoughts4TheDay/*,
    Resouces/SQL/resetPassword.sql, assets/soccerPlayer.png. None are build inputs; the last two
    are new since the Phase 0/1 handoff and are unrelated to Phase 3.
  - Range facts: 24 commits in 4a56a07..HEAD; branch is 73 ahead of main, 71 ahead of
    origin/feat/typescript. Nothing pushed — the user's "don't push yet, I want to test" stands.

Controller finding while writing the migration runbook (operational, not a code defect):
  0002 opens with `drop table if exists public.matrix_logs cascade`. matrix_standings (0003)
  selects from that table, so it is a dependent object: RE-RUNNING 0002 AFTER 0003 SILENTLY DROPS
  THE VIEW. No error, no warning — and afterwards the leaderboard returns nothing while the table,
  its policies, and every structural check still look correct. This is not wrong in the migration
  (cascade is needed to clear the old policies), but it is a live foot-gun for anyone re-applying
  migrations, so it is now documented as the first section of the runbook: run 0002 then 0003,
  once; if 0002 is ever re-run, 0003 MUST be re-run immediately after.

Written: docs/runbooks/2026-08-29-phase-3-migration-runbook.md — the human's apply-and-verify
  procedure. Includes the count(*)=0 pre-check with an explicit STOP condition, and five structural
  verifications with the failure symptom for each. The load-bearing one is 4a: confirming
  reloptions contains security_invoker=true via pg_class, because a view that silently lost that
  option reads matrix_logs bypassing RLS entirely and nothing else on the page would reveal it.
  Not yet committed — holding until the final review lands in case its ordering changes the doc.

FINAL WHOLE-BRANCH REVIEW (4a56a07..b526574, 24 commits, opus): NOT READY — 4 must-fixes, all in
the thirteen previously-unreviewed ad-hoc commits. Phase 3 itself composed correctly end to end
across all seven layers with no type/null/empty-set/column-name mismatch found.

Ruling P7: the "22 behavioural checks written and passing across the two helpers" recorded in the
  Phase 0-1 ledger addendum IS FALSE, and I verified it myself rather than taking the reviewer's
  word: the suite has exactly four test files (permissions, cache, repo, store) and grep for
  upsertByKey/upsertByName/upsertByDateTime/comparePlayers/photoOrPlaceholder across all of them
  returns nothing. The most data-destructive code on this branch has ZERO automated coverage while
  my own ledger claimed otherwise. Correcting the claim is mandatory before merge. Cost if wrong:
  none — this is a correction of a false record.
Ruling P8: do NOT extract the merge logic into src/ to make it testable, even though that is the
  obvious way to earn coverage. The repo's defining hazard (CLAUDE.md, "three parallel copies")
  is the same app existing three times; adding a fourth copy of the most dangerous function to
  win a test is a bad trade. Accepted instead: no automated coverage for now, the compensating
  control is the mandatory manual export -> re-import -> diff check before any real import, and a
  Phase 2 follow-up to add tests when the import legitimately moves into src/. Cost if wrong: a
  regression in upsertByKey ships unnoticed; the manual check is the only net.
Ruling P9: verified must-fix 1 personally and it is WORSE than the review states. `number:
  parseInt(r.Number) || 0` yields 0 for an absent column, and 0 is not blank, so a partial sheet
  ZEROES EVERY JERSEY NUMBER — the exact field the user had just finished repairing. Objects
  (ratings, seasonStats, matrixStats) are never blank by the helper's definition, so they
  overwrite unconditionally: ratings reset to 80/80/80/80, seasonStats.games reset to 1. Schedule
  flips away fixtures to Home and resets completed results to UPCOMING.
Ruling P10: fold the filterRoster selector bug and the post-import re-sync ordering into the same
  fix wave rather than deferring them. Both are a few lines, both are in the same unreviewed
  commits, and the sync-ordering one is the live cause of the Unsplash-resurrection incident the
  user already hit. Cost if wrong: a slightly larger fix diff to re-review.
Ruling P11: ACCEPT the reviewer's triage verbatim on the five items it downgraded to ACCEPT
  PERMANENTLY (leaderPts, bare ||0 on bigint sums, orphaned-rank, authenticated-only write grant,
  score_text ||null). Each was checked against the tree rather than argued from the ledger, and
  the leaderPts one is genuinely unreachable because deletePlayer splices from this.data.players.
  Cost if wrong: low-severity cosmetic defects survive.

Fix wave applied as 6004c0b (admin.js, app.core.js, roster.view.js; +118/-49). All six items.
node --check clean, build succeeded, 25/25. The implementer correctly left the controller's
in-flight ledger correction uncommitted and out of scope. Scoped re-review dispatched on opus
against b526574..6004c0b, weighted toward a literal field-by-field trace of the Name+Goals
scenario, because there is no regression test behind this fix.

Controller corrected the Phase 0-1 ledger addendum directly (docs/.../phase-0-1-execution-ledger.md
line ~893): BOTH false statements in that entry are now marked as corrections rather than silently
edited, so the record shows what was claimed alongside what was true. The second falsehood was the
same "only columns the file actually supplied are written" claim that appeared in the JSDoc.

FOLLOW-UPS RULED OUT OF THIS FIX WAVE (deliberately not fixed now; each is real):
  1. HIGHEST VALUE — a database-side partial unique index is the durable fix for the duplicate-row
     class of bug, not the client-side upsert. The merge index is built from this.data.players,
     which NEVER contains soft-deleted players (syncFromSupabase and fetchPlayers both filter), so
     importing a sheet naming a player who was soft-deleted in Postgres still creates a live
     duplicate alongside the soft-deleted row. That is the exact shape of the 34-row incident, and
     the fix wave does NOT close it. Proposed:
       create unique index on public.players (school_id, lower(name))
         where coalesce(is_deleted, false) = false;
     This converts a silent duplicate into a visible error. Needs the human (DDL).
  2. There is NO UI to view, correct, or delete a logged matrix result. fetchMatrixLogs has no
     caller anywhere. The spec's central argument for deriving points -- "correcting a mis-entered
     result re-derives every rank" -- has nothing to correct through; a typo requires the SQL
     editor. This is the most valuable next feature.
  3. logged_by is never populated: logMatrixResult omits it from the payload, so the audit column
     added in 0002 will be null on every row. Cheap to fill from the session, and it CANNOT be
     backfilled later, so it is worth doing before real results accumulate.
  4. The import target dropdown offers "Matrix Competition Logs" and "Quiz" but handleImportFile
     has no branch for either. Pre-existing. If matrix import is ever built it must target the NEW
     head-to-head shape -- the matching export at admin.js:845 still emits the old
     PlayerName/Result/OpponentName columns against a this.data.matrixLogs that does not exist.
  5. upsertPlayer still writes matrix_stats on every player save (supabase.ts:762, called from
     add/edit player and from import), so the column now holds a stale snapshot of DERIVED
     standings rather than untouched legacy data. Nothing reads it. Phase 2 should drop the column
     rather than maintain it.
  6. src/views/matrix.view.ts and src/types.ts still carry the pre-Phase-3 six-column shape
     including drillScore. Dormant and outside the module graph, so not a branch violation, but
     the live-JS/dormant-TS drift just widened by a whole feature. Worth a line in CLAUDE.md.
  7. assets/profile.png (776 KB) is committed and referenced only by two comments -- it is the
     artwork source for the placeholders, permanently in history for no build purpose.
  8. The ledger's own remediation SQL for the stock coach photos says `set photo_url = ''`. It
     should be `= null` to match this branch's new convention. photoOrPlaceholder handles both, so
     it is cosmetic, but the human is going to run that statement.

LIVE DB STATE verified through the publishable anon key (read-only, no DDL) after the user said
"sql has been executed" — verified rather than assumed, and it was NOT the Phase 3 migrations:
  - APPLIED: the coach photo cleanup. Both coaches (Coach Bob Ayers, Barry Steele) now have
    photo_url = null, so the stock Unsplash face is gone and photoOrPlaceholder renders the
    silhouette. This clears an outstanding item carried since the Phase 0-1 handoff.
  - NOT APPLIED: 0002 and 0003. matrix_standings -> PGRST205 "Could not find the table
    'public.matrix_standings' in the schema cache" (HTTP 404). matrix_logs?select=player_a_id ->
    42703 "column matrix_logs.player_a_id does not exist" (HTTP 400), i.e. still the old
    winner-only shape. Phase 3 therefore still has never run against a database.
  - Useful consequence: matrix_logs?select=* returns [], so the runbook's Step 1 pre-check
    (count = 0) is ALREADY SATISFIED and 0002 is safe to apply.
  - Roster is healthy: 11 players, jersey numbers 1-11 all assigned, no duplicate names, every
    photo_url null. The test admin player is gone. No sign of the 34-row duplication recurring.

RE-REVIEW of 6004c0b (opus): all six briefed fixes ADDRESSED and verified against the live files,
scope discipline clean (3 files, no drive-by changes) — but FINDINGS REMAIN, and the two serious
ones are DEFECTS IN MY BRIEF, not implementer error.

Ruling P12: run a SECOND fix wave rather than parking these as residuals. The SDD loop allows one
  fix dispatch plus adjudication after a final review, and I am deliberately exceeding it. The
  reason: my own fix introduced a path that recreates the exact 34-duplicate-row incident the user
  already suffered in production. Shipping a newly-introduced data-destruction bug because the
  process says "adjudicate residuals" would be following the letter of the loop against its whole
  purpose. Cost if wrong: one more review cycle before handoff.
Ruling P13 (my brief's defect #1): I specified `time: opt(r.Time)` for the schedule mapping AND
  listed `time` in the defaults, without noticing that `time` is HALF THE COMPOSITE KEY
  (upsertByDateTime keys on date+time). Previously the '6:00 PM' default was applied BEFORE the key
  was computed, so a Time-less sheet still matched the many 6:00 PM fixtures. Now the key is
  "2026-09-01|", matches nothing, and every row inserts as a duplicate. Fix: treat `time` as a key
  field like date/opponent — default it in the mapping, not in `defaults`.
Ruling P14 (my brief's defect #2): I wrote "omit `games` entirely rather than resetting it to 1",
  not accounting for `seasonStats` being assigned WHOLESALE with no deep merge — so omitting it
  DELETES it. A plain export -> re-import round trip strips games-played from every matched player,
  and a Name+Goals sheet also zeroes assists. Fix: give upsertByKey a one-level deep merge for
  plain-object props (skipping blank values), and have the mapping emit only the stat keys the
  sheet actually supplied.
Ruling P15: the deep merge also dissolves the reviewer's issue 3 (a keeper mis-typed when the sheet
  omits Position, because isGoalkeeper reads only the sheet and never the stored record). With a
  per-key merge there is no shape to choose — supplied keys merge onto whatever the record already
  has. Fixing the general mechanism rather than special-casing the keeper is the better trade.
Ruling P16: fix the shared-default-object-reference hazard (applyDefaults assigns by reference, so
  every player inserted in one import shares ONE ratings object and ONE seasonStats object) even
  though the reviewer verified it is dormant today. It is two characters of clone and the failure
  mode — editing one player silently changing several — is the kind that gets diagnosed as
  haunted rather than as a bug.
Ruling P17: ACCEPT the remaining three residuals. (a) The triple re-render per import is real but
  pre-existing in kind and #importStatus lives in the modal, not #mainAppContainer, so no status
  message is detached. (b) Blank-key schedule rows insert locally, are rejected by a NOT NULL
  match_date, and are swept by the post-import sync — a misleading count, no corruption.
  (c) `name` being rewritten with the sheet's casing is intended behaviour for a case-insensitive
  key match. Cost if wrong: cosmetic only.

EMPIRICAL CHECK of the live schedule table (anon key, read-only) while fix wave 2 ran — this
changes the guidance around Ruling P13:
  Stored match_time values are HETEROGENEOUS, not uniformly '6:00 PM':
    AUG 14, 2026 / 6:30 PM / Vista Murietta            / COMPLETED / home
    AUG 21, 2026 / 5:00 PM / Citrus Valley Blackhawks  / UPCOMING  / away
    AUG 26, 2026 / 6:00 PM / "Rev "                    / UPCOMING  / home
    AUG 7,  2026 / 6:30 PM / Yucaipa Thunderbirds      / COMPLETED / home
    JUL 22, 2026 / FINAL   / Palm Springs Indians      / COMPLETED / away
    JUL 28, 2026 / FINAL   / Redlands East Valley      / COMPLETED / away
  Only ONE of six fixtures is at 6:00 PM. Therefore the PRE-fix-wave-1 behaviour (defaulting
  '6:00 PM' before the key was computed) would ALSO have mismatched five of six rows. Fix A
  restores the old behaviour and stops fix wave 1 from making things worse, but it does NOT make a
  Time-less schedule sheet safe against this data — it never was. The operative rule for the human
  is: a schedule sheet MUST carry a Time column whose values match the stored ones exactly. The
  app's own export and template both include Time, so an export -> re-import round trip is safe;
  only a hand-built partial sheet trips this.
  Two further observations, neither blocking: match_time holds 'FINAL' on completed games, i.e. the
  column carries a status-ish sentinel rather than a time, which makes date+time a weaker key than
  it looks; and one opponent is stored as "Rev " with a trailing space (harmless — opponent is not
  part of the key, and key parts are trimmed anyway).

Fix wave 2 applied as a232c23 (app.core.js, admin.js). All four items. node --check clean, build
succeeded, 25/25 at the time.

Ruling P18 — REVERSES Ruling P8. I had ruled against adding tests for the import helpers because
  the only way I saw to reach them was lifting the logic into src/, creating a FOURTH parallel copy
  of the app's most dangerous function. That reasoning was sound but the premise was wrong: the
  helpers can be tested WITHOUT copying them, by loading the real public/js/app.core.js text and
  evaluating it. There is nothing to keep in sync, because the test exercises the shipped file
  itself. Added src/data/import-upsert.test.ts — 11 cases covering the id-preservation that
  prevents duplicate rows, jersey/position/height/photo preservation, the ratings 80-reset, the
  seasonStats key-by-key merge, defaults-on-insert, per-record default cloning, schedule match
  without duplication, COMPLETED not reset to UPCOMING, away not flipped to home, and blank-key
  rows staying separate. Suite is now 36 tests across 5 files.
  I VERIFIED THE TESTS ACTUALLY CATCH THE BUGS rather than assuming: running the same assertions
  against public/js/app.core.js as it stood at 6004c0b yields seasonStats {goals:3} (assists and
  games destroyed) and a shared ratings reference; against b526574 the helper does not even accept
  defaults. They fail on the broken code and pass on the fixed code.
  Honest limitation, stated rather than papered over: these tests cover app.core.js only. The
  schedule Time-column key bug (Ruling P13) lives in the admin.js MAPPING layer, which they do not
  reach, so that class of defect is still uncovered.
  Implementation note for anyone extending this: the test avoids node's fs/vm because tsconfig does
  not pick up @types/node, and setting "types":["node"] would EXCLUDE the chai/estree types the
  other tests rely on. It uses Vite's ?raw import plus `new Function`, which additionally evaluates
  the script against vitest's real jsdom globals rather than hand-rolled stubs. Caught only by
  `npm run build` -- vitest passed while tsc failed, which is the CLAUDE.md lesson exactly.
