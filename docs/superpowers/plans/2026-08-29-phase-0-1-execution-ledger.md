# SDD ledger — plan: docs/superpowers/plans/2026-08-29-postgres-source-of-truth-phase-0-1.md

Spec: docs/superpowers/specs/2026-08-29-postgres-source-of-truth-design.md (read, reachable)
Branch: feat/typescript (feature branch, not main — no worktree created; work proceeds here)
Started: 2026-08-29

## Pre-flight conflict scan

### Cross-task rows (tasks sharing a file or interface)

| Tasks | Shared | Produces vs consumes | Finding |
| --- | --- | --- | --- |
| T2 → T3 | `src/data/cache.test.ts` | T2 creates a jsdom smoke test; T3 replaces file contents | **P6** — T2's test is deleted by T3. Intentional; T3's tests exercise `localStorage`, so jsdom coverage is retained. No action. |
| T1, T2, T5 | `package.json` | scripts / devDeps / deps | Clean — different keys, sequential. |
| T3 → T4 → T6 | `CacheEntry`, `FetchResult`, `CollectionState` | T3 exports `CacheEntry`; T4 exports `FetchResult`+`CollectionState`; T6 imports all three | Clean — `FetchResult` is exported by T4 and imported by name in T6. |
| T5 → T7 | `supabaseService` | T5 Step 3 creates the export; T7 imports it | Clean. |
| T7 → T12 → T13 → T15 | `src/main.ts` | Each appends to the entry point | **P1** — see below. |
| T7 → T12 | `index.html` script block | T7 drops supabaseClient.js + CDN; T12 drops auth.js | Clean — sequential and consistent. |
| T9, T10 → T11 | `public/js/admin.js` | Three sequential edits to one 1327-line file | **P5** — see below. |
| T12 → T15 | `public/js/app.core.js` | T12 edits `init()`; T15 edits `loadData()` | Clean — different methods, and `loadData` precedes `init` so no line drift into T15's target. |
| T14 → T9/T12 | `profiles` RLS | Tightened policy vs the approval queue | Clean — the queue runs as `admin`, which satisfies `current_profile_role() in ('coach','admin')`. |
| T6 → T13 | `Repository` | T13's Interfaces block claimed to consume it | **P2** — see below. |

### Self-consistency rows (each task's text against itself)

| Task | Finding |
| --- | --- |
| T1 | Clean. Declares `vite.config.ts` under Files but never edits it — harmless over-declaration, left as is. |
| T2 | **P7** — pinned `vitest@^3` against Vite 8. |
| T3 | Clean — tests match the implementation; 6 tests, 6 behaviours. |
| T4 | Clean — 7 tests cover both governing rules explicitly. |
| T5 | Clean — the 45-method list matches `src/globals.d.ts`. |
| T6 | Clean after the `FetchResult` import fix made during plan self-review. |
| T7 | Clean. |
| T8 | Clean — 5 call sites, all named with line numbers in one file, single task so no drift. |
| T9 | Clean. |
| T10 | Clean. |
| T11 | Clean in content; line numbers affected by P5. |
| T12 | Clean after the `window.authReady` correction made during plan self-review. |
| T13 | **P1, P2**. |
| T14 | Clean — migration is self-contained with a documented rollback. |
| T15 | **P4**. |
| Header | **P3** — `window.store` named in Architecture, installed by no task. |

### Rulings

- **Ruling P1** (T13 vs T12, `src/main.ts`): T13 Step 5 said "after `await auth.init()`", but T12 as corrected writes `window.authReady = auth.init()` with no top-level await — and T13's own code then reintroduced a top-level `await` that the design deliberately avoids. Decided: the roles load chains onto `window.authReady` via `.then()`, so `app.core.js`'s existing `await window.authReady` covers both session restore and roles. Rewrote T13 Step 5 in the plan and added a Global Constraint forbidding top-level await in `main.ts`. **Cost if wrong:** roles could load after first render, briefly showing a coach the guest UI; visible and cheap to fix.
- **Ruling P2** (T13 Interfaces): the block claimed `Consumes: Repository from ../data/repo`, but the code uses `getClient`. Corrected to `getClient` + `auth` + `window.authReady`. **Cost if wrong:** none; documentation only.
- **Ruling P3** (Header vs tasks): the Architecture paragraph promised `window.store` among the installed globals, but no task creates or installs it — per-entity repositories are Phase 2. Rewrote the paragraph to name the globals actually installed and to state that `window.store` is Phase 2. **Cost if wrong:** a reviewer might expect a store global and flag its absence; the ledger and header now agree it is out of scope.
- **Ruling P4** (T15): Step 3 empties `DEFAULT_BHS_DATA`, but Step 4's grep (`data\.school\.`) does not catch the three `DEFAULT_BHS_DATA.school` fallbacks in `planner.view.js` (`getSchoolsList`, `fillSchoolFormFields`, `updateHeaderBranding`), which would silently become `undefined` / `[null]`. Added a new Step 5 that rewrites all three and verifies no references survive outside the seed module. **Cost if wrong:** the school form and header branding break at runtime — the most likely real bug this scan prevented.
- **Ruling P5** (T9/T10 → T11, line drift): T11 cites `admin.js` lines 106-152, 742-747 and 365-405, all pre-edit; T10 inserts `handleSignOut` and shifts everything beneath it. Added a Global Constraint: locate edit sites by quoted symbol or comment text and re-grep before editing, never by line number alone. **Cost if wrong:** an implementer edits the wrong region; caught by the task review.
- **Ruling P7** (T2): `vitest@^3` was pinned, but Vite 8 postdates the Vite range Vitest 3 supports, so the pin risks an unresolvable peer set. Unpinned to `npm install -D vitest jsdom` and required the implementer to record the resolved versions. **Cost if wrong:** a Vitest major with a different config shape; the config is four lines and trivially adjusted.

Scan complete: 6 defects found, 6 ruled, 4 fixed in the plan file (P1, P2, P3, P4) and 2 carried as Global Constraints (P5, P7). Plan corrections are written into the plan file itself because `scripts/task-brief` extracts briefs from it — a ruling recorded only here would never reach an implementer.

## Blocked

Task 1: BLOCKED on human action. `node -v` reports v14.21.3; the plan's Global Constraints
require >=20.19 and every task depends on it. Installing Node is a machine-level change
outside this repo, so it is one of the four legitimate stop conditions. Nothing dispatched.

## Progress

(no tasks complete)

## Execution

Node gate CLEARED by human: nvm switched to v24.20.0 (npm 11.19.0). Satisfies Vite 8's
`>=22.12.0`. Task 1 steps 1-3 are therefore already satisfied; the implementer starts at
step 4.

Ruling (Task 1, step 7): the plan verifies the dev server via "no 404s in the browser
network tab", which a subagent cannot observe. Substituted an equivalent headless check —
start the dev server in the background, curl `/` and `/js/app.core.js` expecting HTTP 200,
then stop it. Cost if wrong: a 404 that only manifests in a real browser slips through;
low, because the same paths are also verified in the dist build at step 8.

Task 1: BASE 0088677, dispatched (sonnet).

Finding P8 (Task 1, step 9 — found during execution, not pre-flight): the plan's commit
step uses `git add -A`, but `CLAUDE.md` is untracked in the working tree, so it will be
swept into the "build: move classic scripts" commit. Not racing the running implementer
for the git index; will handle on report. Ruling: if CLAUDE.md landed in the Task 1
commit, split it out into its own commit rather than amending away a file the human
may want kept. Cost if wrong: one extra commit, no code impact.

P8 CONFIRMED BY HUMAN: "commit CLAUDE.md separately". Not a ruling — an instruction.
If Task 1's `git add -A` swept CLAUDE.md into the build commit, split it out into its
own commit. If it did not, commit it on its own once Task 1's implementer has released
the git index. Either way CLAUDE.md ends up in a commit of its own.

Task 1: implementer reported DONE (d94597d). CLAUDE.md committed separately as 0870f14
per human instruction — P8 closed.

Ruling (Task 1 residual dist gap): the implementer flagged that index.css, styles.css,
supabaseClient.js and auth.js are not copied to dist. Verified myself: the CSS half is
WRONG — Vite bundles both stylesheets into dist/assets/index-sOxIBg-5.css and rewrites
the link tag. The JS half is RIGHT — dist/index.html still references ./supabaseClient.js
and ./auth.js, neither of which exists in dist/. Decided: real but transient. Task 7
deletes supabaseClient.js and Task 12 deletes auth.js, removing both references, so the
gap closes by design without extra work. Task 1's brief is met (its Step 8 check was
`ls dist/js/`). Carry forward: re-verify dist has no dangling script refs after Task 12.
Cost if wrong: the production build stays broken for two files until Task 12 — no impact
on dev, and Phase 1 is not deployed mid-flight.

Task 1: minor (deferred): brief listed package.json and vite.config.ts as Modify targets
  but neither needed changing — Vite's default publicDir already handles the move.
  Plan-maintenance note only; build evidence confirms no functional gap.
Task 1: minor (deferred): typecheck evidence infers exit 0 from absence of error output
  rather than capturing `echo $?` explicitly.
Task 1: complete (commits 0088677..d94597d, review clean)

Task 2: BASE 0870f14, dispatched (sonnet).

Ruling P7 VALIDATED: npm resolved vitest 4.1.11 (not 3.x) against vite 8.2.2, jsdom 30.0.1,
with no peer conflicts. The plan's original `vitest@^3` pin would have resolved wrong.

Ruling P9 (Task 5, found during execution): the port list omitted the internal helper
`isUuid(str)`, which nine methods call via `this.isUuid(...)` (getSchoolUuid, upsertMatch,
savePracticePlanItem, upsertSoccerCategory, upsertDrillBankItem, upsertPlayer, upsertSchool,
upsertCoach, saveFullPracticePlan). It is not declared in src/globals.d.ts, so an
implementer working strictly from the list would drop it and break every write path with
`this.isUuid is not a function`. Added it to the plan's Task 5 with a grep verification.
Cost if wrong: none — it is a genuine dependency, verified by grep.

Ruling P10 (fallout from Task 1, outside its diff): check_syntax.ps1 still lists 'js\...'
paths that no longer exist after the move to public/js/, so the script is broken. CLAUDE.md
documents that script as the project's verification method, so it is stale too. Decided:
defer both to a documentation-refresh step after Task 15 rather than reopening Task 1 or
patching now — CLAUDE.md will additionally be wrong about auth.js, supabaseClient.js and
DEFAULT_BHS_DATA once Phase 1 lands, so a single refresh at the end does the job once.
Cost if wrong: check_syntax.ps1 stays broken during Phase 1; it is not used by any task's
verification (Vitest is), so nothing in this plan depends on it.

Task 2: BASE 0870f14, implementer DONE_WITH_CONCERNS (b9c7b7e). Reported non-pristine test
output (Vite configLoader CJS/ESM warning, from missing "type":"module"). NOT pre-judged —
passed to the reviewer unfiltered for an independent severity call.

Ruling P11 (module resolution, found during execution): the pre-existing seed module
src/data.ts now coexists with the new src/data/ directory, and src/app.core.ts:13 imports
it as './data'. Under moduleResolution "bundler" that resolves to data.ts only because no
data/index.ts exists. Added a Global Constraint forbidding src/data/index.ts and requiring
explicit filename imports ('./data/cache' etc). Cost if wrong: none — it forbids something
no task needs. Note for Phase 2: src/data.ts still holds the TS twin of the seed data that
Task 15 strips from public/js/data.js; it is inert (nothing loads src/ yet) and typechecks
fine, so it is left alone here.

Task 2 review: Needs fixes. 1 Important (vitest.config.ts -> .mts to silence the recurring
configLoader warning at source, single-file blast radius — a narrower option the implementer
never evaluated). 1 Minor (src/data.ts vs src/data/ naming trap) — ALREADY CLOSED by ruling
P11 before the review landed; no fix needed, reviewer lacked that context.
Task 2: fix round 1/5 dispatched (resumed original implementer).

Ruling P12 (Task 4, found during execution): the seventh test was named "is ready with zero
rows on an invalid session when there is no cache to mask it" but asserted
`expect(s.status).toBe('error')` — the name contradicted its own assertion. Renamed to "is
error on an invalid session even when there is no cache to fall back to" and added a comment
explaining what it proves beyond the preceding test (the guard fires independently of cache
presence). Cost if wrong: none — assertion unchanged, name and comment only.
Task 2: fix round 1/5 (1 addressed, 0 open — .mts rename silenced configLoader warning,
  forbidden fallbacks not used; commits b9c7b7e..6652976)
Task 2: complete (commits 0870f14..6652976, review clean)

Task 3: BASE 59bb9aa, dispatched (haiku — brief carries complete code, transcription+TDD).

Ruling P13 (Task 12, found during execution): the fake auth returned a verification code to
the client and coaches.view.js displayed it. Real Supabase Auth emails the code — AppUser has
no verificationCode field and RegisterResult has no otpCode — so after the swap both call
sites (coaches.view.js handleSignIn and handleRegister) pass undefined. openVerifyTab guards
on the value so it fails soft rather than throwing, but the banner it feeds reads "DEMO
VERIFICATION OTP CODE: ... (or enter 123456)", which would tell real users to enter a code
Supabase rejects. Added Task 12 Step 4 to drop the unused argument at both call sites,
replace the banner with "We emailed you a 6-digit verification code", and grep-verify no
otpCode/verificationCode/123456 path survives. Cost if wrong: a cosmetic banner change on
the verify tab; the auth flow itself is unaffected either way.

Task 3 review: Approved with 1 Important (plan-mandated) + 1 Minor.
Task 3: minor (deferred): report's line-delta for cache.test.ts (+35) doesn't match the
  diff (8 -> 39); reporting imprecision, no code impact.

Ruling P14 (Task 3, Important, plan-mandated — reviewer was RIGHT): readCache placed
`localStorage.getItem` OUTSIDE its try block, so only JSON.parse failures were caught. In a
sandboxed iframe or a browser with site data blocked, the localStorage accessor itself
throws SecurityError, which would escape readCache and crash the boot path — violating the
stated requirement that both readCache and writeCache swallow storage exceptions. The defect
originates in MY plan's reference code, which the implementer copied verbatim; writeCache
did not have the gap. Decided: fix it rather than accept it. Moved getItem inside the try in
the plan, added a seventh test that stubs Storage.prototype.getItem to throw SecurityError
and asserts readCache neither throws nor returns non-null, and added the `vi` import the new
test needs. Dispatching as Task 3 fix round 1. Cost if wrong: none — strictly widens the
catch; no behaviour changes on the success path.
Task 3: fix round 1/5 (1 addressed, 0 open — getItem moved inside try, TDD confirmed: RED
  showed SecurityError escaping; commits 19a6c9f..522aef7)

Ruling P15 (Task 3, PROMOTED from the re-reviewer's out-of-scope observation): backupLegacyBlob()
retains three unguarded storage accesses (getItem/setItem/removeItem) — the same failure mode
just fixed in readCache. The skill says out-of-scope observations go to the ledger as deferred
minors, but this one is load-bearing: Task 15 Step 1 calls backupLegacyBlob() during boot in
src/main.ts, so a SecurityError there crashes the exact path we just hardened. Decided: promote
and fix now in fix round 2, while the implementer's context on this file is warm — cheaper than
a Task 15 surprise. Also guarded ordering: setItem before removeItem inside the try, so a blob
that could not be backed up is never destroyed. Added an eighth test stubbing setItem to throw
QuotaExceededError and asserting the legacy blob survives. Cost if wrong: one extra fix round
on a file that is otherwise complete.
Task 3: fix round 2/5 dispatched.
Task 3: fix round 2/5 (1 addressed, 0 open — all three storage calls guarded, setItem
  precedes removeItem so a failed backup cannot destroy the blob, test setup ordering
  correct, TDD confirmed; commits 522aef7..774a0f3)
Task 3: complete (commits 59bb9aa..774a0f3, review clean, 8/8 tests)

Task 4: dispatched (haiku — brief carries complete code, transcription+TDD).

Task 4 review: Spec compliant, Approved, 0 Critical/Important. Reviewer confirmed the
zero-rows test asserts s.rows toEqual [] (genuinely load-bearing, would fail under a cache
fallback) and that stale preserves cached.fetchedAt rather than overwriting with now.
Task 4: minor (deferred): report/brief said "6 cache tests"; actual is 8 (stale estimate
  from before Task 3's two fix rounds added tests).
Task 4: minor (deferred): ok + rows>0 + sessionValid:false resolves to ready. Correct under
  the RLS model — public tables legitimately return rows to anon — but undocumented.
Task 4: complete (commits 774a0f3..231d09c, review clean, 15/15 tests)

Ruling P16 (Task 5, found during execution — would have broken Task 7): my Task 5 text
dropped the hardcoded anon key, leaving resolveKey() returning ''. initClient() then yields
null, isConfigured() false, and at Task 7 — where supabaseClient.js is DELETED — the app
would silently degrade to localStorage-only. That is exactly the failure this migration
exists to remove, and Task 7's "app still works" check could pass while the database sat
disconnected. Decided: keep the fallback. Supabase anon keys are designed to be publishable
(they ship in every client bundle); RLS is the actual protection, and Task 14 tightens it.
The key is already committed and already in the deployed dist, so removing it from one file
un-publishes nothing while breaking connectivity mid-plan. Restored FALLBACK_ANON_KEY with
the precedence chain unchanged from supabaseClient.js. Cost if wrong: the committed anon key
remains committed — status quo, and reversible later with a proper .env story.

Ruling P17 (Task 4, SYSTEMIC — found via Task 5's report, confirmed by running tsc myself):
`npm run typecheck` fails with 2 errors in src/data/store.ts:45,49 — "Property 'error' does
not exist on type 'FetchResult<T>'". Task 4 shipped with type errors and passed review as
clean, because every brief so far required `npm test` but never `npm run typecheck`, and
Vitest transpiles without checking types. 15/15 green proved nothing about the build.

Root cause verified experimentally in the scratchpad, not guessed: the repo's tsconfig sets
strict:false, and under strictNullChecks:false a boolean-literal discriminant does not narrow
a generic union. The identical code compiles cleanly under strict:true (confirmed), and
inverting to `if (!result.ok)` does NOT help (also confirmed — both shapes fail).

Decided: change the type, not the compiler settings. The spec explicitly keeps tsconfig loose
so the ported JS compiles without a rewrite, and turning on strict would break the just-ported
supabase.ts. Each FetchResult variant now declares the other's key as optional-undefined,
which makes the property access resolve under strict:false while keeping the discriminant.
Verified compiling in the scratchpad before dispatch. Cost if wrong: a slightly less tidy
union type; behaviour is identical and no runtime code changes.

Also added two Global Constraints: every task must run typecheck and show its output, and
tsconfig.json must not be edited. This closes the systemic hole for Tasks 6 and 13, which
would otherwise have repeated it.
Task 4: REOPENED — fix round 1/5 dispatched.
Task 4: fix round 1/5 (2 addressed, 0 open — FetchResult reshaped, tsconfig untouched,
  bodies and tests unchanged, typecheck 0 errors verified independently by controller;
  commits 231d09c..0c9ee7b)
Task 4: complete (commits 774a0f3..0c9ee7b, review clean, 15/15 tests, typecheck clean)

Task 5 review: Spec compliant, Approved, 0 Critical/Important. Reviewer verified all 45
methods against the original file directly, isUuid wired to all 9 call sites, and
FALLBACK_ANON_KEY holding a real JWT rather than a placeholder.
Task 5: complete (commits 2d4835c..4713e50, review clean)

Ruling P18 (Task 13, PROMOTED from Task 5's Minor — reviewer lacked cross-task context):
the Task 5 reviewer noted as Minor that the implementer kept the original's module-scope
`initSupabaseClient()` instead of the brief's illustrative `initClient()`/`getClient()`
exported pair. In isolation that is cosmetic, and arguably closer to the original. But
Task 13's code does `import { getClient } from './data/supabase'`, and the shipped module
exports ONLY `supabaseService` (verified: `grep '^export' src/data/supabase.ts` returns one
line). Task 13 would have failed to compile.
Decided: do NOT reopen Task 5 to add a raw client accessor. Every other collection in that
file is read through a method on the service, so exposing the client would break the
encapsulation the file otherwise maintains. Instead Task 13 now adds a `fetchRoles()` method
in the file's existing idiom (isConfigured guard, console.warn, return null) and main.ts
calls `supabaseService.fetchRoles()`. Also requires adding fetchRoles to SupabaseServiceLike
in src/globals.d.ts so the declared shape keeps matching the real one.
Cost if wrong: one extra method on the service; strictly less invasive than exporting the
raw client.

Task 6 review: Spec compliant, Approved, 0 Critical/Important. Reviewer confirmed both
failure-path tests seed a real row before the failing mutation, so an optimistic-update
regression would actually fail them (not vacuous empty-array checks). Postgres-first
ordering verified by construction: no code path reaches commit() before the client call.
Task 6: minor (deferred, FLAG FOR FINAL REVIEW): save()'s update-existing-row branch
  (rows[idx] = saved) has NO test — every test inserts a new row. Correct by inspection,
  but every Phase 2 entity edit flow will exercise it. Cheapest possible coverage gap to
  close; final review should triage whether to close it before merge.
Task 6: minor (deferred): no test asserts the cache stays unwritten on a first load failure.
Task 6: minor (deferred): save() pushes rather than replacing if a client returns a row with
  no id, silently duplicating. Low risk — a real Postgres upsert with .select() returns an id.
Task 6: minor (deferred): commit() reuses the load-time fetchedAt when caching after a
  save/remove, so cache freshness does not reflect the mutation. Inherited from my brief's
  code; relevant to whoever designs staleness policy in Phase 2.
Task 6: complete (commits 1951dd6..5124a3a, review clean, 21/21 tests, typecheck clean)

Task 7 pre-dispatch verification (controller): index.html script block confirmed at
1161-1166 as the brief expects. Confirmed ONLY supabaseClient.js references the CDN
`supabase` global (lines 21, 23), so removing that <script> tag with the file is safe.
Boot-order safety re-confirmed: auth.js's parse-time work is `window.auth = new AuthManager()`
whose constructor touches only localStorage; every supabaseService call in auth.js is inside
loginUser/registerUser, which run on user action long after modules have executed.
Task 7: BASE 5124a3a, dispatched (sonnet).

Ruling P19 (Tasks 12/13, found via Task 7's concern — a real plan defect with forward reach):
my Task 7 main.ts snippet included `declare global { interface Window { supabaseService?: ... } }`,
but src/globals.d.ts ALREADY declares `Window.supabaseService?: SupabaseServiceLike`. That is a
TS2717 duplicate-property conflict, not a tolerated redundancy. Task 7's implementer correctly
dropped the block and relied on structural compatibility; typecheck is clean.
Verified the same defect was waiting in Task 12, whose snippet re-declared supabaseService
alongside auth/authReady. Fixed the plan so Task 12 declares only the globals it adds, with a
comment naming the conflict so it is not "helpfully" restored. Task 13 adds `can` to that same
block and was already worded as an addition, so it needed no change.
Cost if wrong: none — the declaration is redundant with globals.d.ts either way; removing it
is what makes the file compile.

Task 7 verification (controller-verified, not taken on report): index.html script block now
opens with <script type="module" src="./src/main.ts">, the Supabase CDN tag and the
./supabaseClient.js tag are both gone, ./auth.js correctly retained, and supabaseClient.js no
longer exists on disk.
Task 7: implementer DONE_WITH_CONCERNS (a6a13ca). Reported honestly that no browser automation
was available, so `typeof window.supabaseService === 'object'` was NOT verified at runtime —
flagged rather than fabricated. Also found that a plain curl for /supabaseClient.js returns 200
because Vite's dev server falls back to index.html for unmatched routes; it returns 404 under a
`Sec-Fetch-Dest: script` header, which is what a real script tag sends. Good investigation.

Task 7 review: Spec compliant, Approved, 0 Critical/Important. Reviewer independently
reproduced the SPA-fallback investigation (a fabricated path also returns 200, confirming the
200 is generic dev-server fallback and the file is genuinely deleted) and confirmed boot order
is safe by module-defer semantics. Recommended a manual browser smoke test before closing.
Task 7: minor (deferred): no in-browser confirmation that window.supabaseService is populated;
  static evidence only (typecheck, build, module serves). Residual risk bounded to a
  module-eval-time throw — see P20, which closes the one real path.
Task 7: complete (commits 5124a3a..a6a13ca, review clean)

Ruling P20 (Task 12, found by controller while narrowing Task 7's residual risk): the reviewer
named "a throw inside src/data/supabase.ts module-eval code" as the one unverified risk. I
traced it. initSupabaseClient() runs at module scope (line 58) and DOES guard createClient in
try/catch — but getSupabaseUrl() and getSupabaseAnonKey() call localStorage.getItem unguarded,
the same SecurityError path already fixed in cache.ts under P14/P15.
Not a regression: identical to the original supabaseClient.js, and Task 5 was correctly told to
port faithfully. But the consequence changes at Task 12. A classic script that throws kills only
itself; a module that throws during evaluation assigns none of its globals. Once window.auth and
window.authReady live in this graph, blocked site data stops meaning "no database" and starts
meaning "no app" — every one of the 43 window.auth.* call sites throws.
Decided: do NOT reopen Task 5 (it ported faithfully, as instructed). Fold the hardening into
Task 12 as Step 2, where the blast radius actually grows and which already touches this area.
Added a readStoredCredential() helper preserving precedence exactly. Cost if wrong: two extra
try/catch wrappers; no behaviour change when storage works.

Task 8 review: Spec compliant, Approved, 0 Critical/Important. Reviewer independently
adjudicated the implementer's microtask concern rather than echoing it: checked every external
caller (index.html:1093/1106/1131 onsubmit handlers, admin.js:219-220 onclick handlers,
admin.js:394 self-test which bypasses the view wrapper) and found none depends on same-tick
completion of the post-await UI updates. Every invocation is a single-statement handler with
nothing following it. Deferral is behaviorally inert.
Task 8: minor (deferred): coaches.view.js has no automated coverage (pre-existing). Behaviour
  preservation rests on static reasoning; no manual click-through of sign-in/register/verify/
  approve/reject was performed.
Task 8: minor (deferred): quickLogin() is invoked nowhere — it survives only in the dead root
  app.js monolith. Dead code; candidate for removal in a later cleanup.
Task 8: complete (commits b5d3d6f..27cbc7a, review clean)

Task 9: BASE 27cbc7a, dispatched (sonnet). First of three sequential admin.js edits — line
drift constraint applies from here (locate by symbol, never by line number).

Ruling P21 (SYSTEMIC, found via Task 9's report): `npm run typecheck` does NOT cover
public/js/. tsconfig.json sets "include": ["src"], so every "typecheck: 0 errors" reported by
Tasks 8 and 9 said nothing whatever about the view files those tasks actually edited. My own
Global Constraint (added under P17) was giving false assurance for exactly the tasks where it
mattered least. Decided: add a Global Constraint requiring `node --check <file>` on each edited
public/js file as the real syntax gate, and keep the typecheck requirement for src/ work.
Affects Tasks 10, 11, 12, 15 going forward; Tasks 8 and 9 are retroactively covered by the fix
round below. Cost if wrong: one extra command per view-file task.

Ruling P22 (Task 9 — REGRESSION introduced, must fix now, not defer): the implementer correctly
reported it could not satisfy Step 3 within its allowed scope, because the two render calls that
follow an approval decision live in public/js/views/coaches.view.js (approveUserAccess:156,
rejectUserAccess:164), not in admin.js. My brief scoped the task to admin.js only, so the step
was unsatisfiable as written — an error in my planning, correctly refused rather than worked
around.
This is not deferrable. Before Task 9 the template called getPendingApprovals() live during
render, so re-rendering after an approve fetched fresh data. After Task 9 it reads the stale
pre-fetched field, so an approved or rejected user remains visible in the queue until the modal
is closed and reopened. Task 9 as committed is a behaviour regression, not a refactor.
Decided: extend Task 9's scope to those two call sites and fix in fix round 1. Both methods are
already async (from Task 8), so `await this.openAdminModal()` works directly. Cost if wrong: two
changed lines in a file the next task also touches.

Task 9: minor (deferred): public/js/admin.js defines openImportExportModal() TWICE in the same
  object literal (lines 757 and 810). The first is dead — a later duplicate key silently wins.
  Pre-existing shadowing bug, unrelated to this plan; flag for the final review.
Task 9: minor (deferred): admin modal UI not exercised (no browser automation).
Task 9: fix round 1/5 dispatched.
Task 9: fix round 1/5 (2 addressed, 0 open — refresh paths fixed in coaches.view.js,
  node --check clean on both files; commits b9247fe..f953d2b)
Task 9 review: Spec compliant, Approved, 0 Critical/Important. Reviewer traced the full
approve-click sequence and confirmed the staleness regression is genuinely CLOSED, not moved:
openAdminModal() re-fetches then renders, and both approve/reject paths await it. Grepped every
remaining bare renderAdminModalContent() call (admin.js:437, 746, 752) and confirmed none sits
on an approval path. Also confirmed re-entering openAdminModal() on an already-open modal is
idempotent (setting an existing class does not re-trigger animation).
Task 9: minor (deferred, FLAG FOR FINAL REVIEW): the dead duplicate openImportExportModal() at
  admin.js:758 calls the now-async openAdminModal() WITHOUT await. Unreachable today because
  the second definition at admin.js:810 silently wins, but it becomes a live bug the moment
  anyone fixes the duplicate key. Two linked pre-existing defects; fix them together or not
  at all.
Task 9: complete (commits 27cbc7a..f953d2b, review clean)

Task 10: BASE f953d2b, dispatched (sonnet). Second of three sequential admin.js edits.
Task 10 review: Spec compliant, Approved, ZERO issues at any severity. Reviewer confirmed the
new handleSignOut key does not collide with an existing object-literal key — the one hazard
node --check cannot detect — and that the guest-badge ternary is byte-identical apart from the
onclick value.
Task 10: complete (commits f953d2b..25ea00e, review clean)

Task 11 pre-dispatch verification (controller): pinned all removal targets by symbol, since
every line number in the brief is stale after three prior admin.js edits. Current positions:
sampleUsers at admin.js:116, the "ACTIVE USER ACCOUNT & ROLE SWITCHER" details block from ~140,
switchUserRole at admin.js:751, the fake self-test runAuthDiagnosticTest at admin.js:368-435,
and the dead .role-switch-card listener at utils.js:130.
Notable: runAuthDiagnosticTest is invoked NOWHERE (grepped public/js/ and index.html — the only
hit is its own definition). The brief says to remove "the button that invokes it"; there is no
such button. It is already dead code, so removal is a pure deletion.
Task 11: BASE 25ea00e, dispatched (sonnet).

Ruling P23 (Task 11): the implementer correctly stayed within its five enumerated targets but
flagged stale copy at admin.js:231 — "File import/export actions are reserved for Coach and
Admin roles. Switch to Coach Bob or Admin Sam above to enable full import/export functions."
The switcher it points at was just deleted, so the instruction is now impossible to follow.
Decided: fix it in Task 11's fix round rather than defer. It is user-visible text made wrong by
this task's own removal, so it belongs to this task, and it is a one-line change. New copy tells
the user to sign in with a coach or administrator account. Cost if wrong: one sentence of UI copy.
Task 11: minor (deferred): admin.js carries hardcoded "Coach Bob Miller" /
  "Admin Sam" rows as export fallbacks for this.data.userProfiles — a key that does not exist in
  AppData, so those export sheets always emit the fake pair. Phase 2 work (the spec makes
  userProfiles a real collection there); out of scope for Phase 1.
Task 11: minor (deferred): read-only account section not visually verified (no browser).
Task 11: fix round 1/5 dispatched.
CORRECTION to the userProfiles note above: the implementer found MORE fallback sites than the
two I named — lines 754, 782, 840-841, 921 and 1176, all the same "Coach Bob Miller"/"Admin Sam"
default-row category. It reported the discrepancy rather than quietly matching my count. ~6 sites
for Phase 2, not 2.
Task 11: fix round 1/5 (1 addressed, 0 open — stale switcher copy replaced, no "Switch to" hits
  remain, node --check clean; commits 20a5d52..2b62f60)
Task 11 review: Spec compliant, Approved, ZERO issues. Reviewer verified every deletion boundary
against named neighbours (renderAdminModalContent/saveSupabaseCredentials, saveSchoolProfile/
openAdminModal, cancelCustomConfirm/parseMatchDateTime) — no dangling commas, orphaned braces or
swallowed neighbours at any of the four removal sites. Confirmed runLiveDatabaseTest survives
(admin.js:504, still wired to its button at :327) and attachDynamicListeners survives as a no-op
(utils.js:128-131, still called from app.core.js:411).
Task 11: complete (commits 25ea00e..2b62f60, review clean)

Task 12: BASE 2b62f60, dispatched (sonnet). THE CUTOVER — deletes auth.js and makes real
Supabase Auth live. Steps 7 and 8 of the brief (verify sign-in against the real database, verify
the guest path) require a browser and a real account password; no subagent can perform them.
Dispatched steps 1-6 and 9 only, with 7-8 explicitly delegated. These MUST be surfaced to the
human as the outstanding verification for this task — the app's authentication is unusable if
they fail, and nothing else in the plan would catch it.

Task 12 review (opus): Spec compliant, Approved, 0 Critical, 5 Important, 6 Minor. Reviewer
independently re-derived the call-site tally from scratch and reproduced 30/23/7/0 exactly,
confirmed boot order through the deferred-module -> DOMContentLoaded chain, and confirmed the
initial-notification question is a harmless no-op (auth.ts:73 sets currentUser before the
callback registers).
FALSE ALARM in that review: it reported HEAD as 999b26a rather than ed01e44. Verified myself —
HEAD IS ed01e44, working tree clean. 999b26a sits 35 commits back from a previous session with a
nearly identical commit message ("...+ RLS hardening"). Its cross-checks read the working tree,
which is at ed01e44, so all findings stand.

Controller probe (de-risking the human's sign-in test): profiles rows verified intact — the admin
row has a proper auth.users UUID, role=admin, status=active, is_deleted=false, and its school_id
resolves to code 'bhs'. The reviewer's top residual risk (missing/unreadable profiles row causing
a lockout indistinguishable from a wrong password) should therefore NOT bite the admin account.

Task 12 triage — IN SCOPE, dispatched as fix round 1:
  Important #1: window.authReady has no .catch(). app.core.js:40 awaits it above bindEvents,
    updateAuthUI, populateCategoryDropdowns, renderCurrentView and startCountdownTimer, and init()
    is called unawaited from the constructor. A rejected auth.init() therefore yields a blank
    shell with no event handlers — auth failure becomes total app failure. supabase-js reads its
    session from localStorage, so this re-enters through the same blocked-storage door Step 2 was
    written to close. Two-line fix.
  Important #3: src/auth.ts notifies subscribers on EVERY onAuthStateChange event. supabase-js
    fires TOKEN_REFRESHED on its own schedule and SIGNED_IN/INITIAL_SESSION on tab-visibility
    regain — the fake auth only fired on user action. The subscriber calls renderCurrentView(),
    which replaces innerHTML, so an idle coach can have an unsaved practice plan and the tactical
    canvas wiped by a background token refresh. Highest-value fake-vs-real divergence found.
  Minor #8: orphaned quickLogin() in coaches.view.js defaults to password 'password' and is
    referenced nowhere. Dead demo code with a hardcoded credential; cheap to delete.

Task 12 triage — OUT OF SCOPE (all in src/auth.ts, which this task does not touch; pre-existing
but made LIVE by this task). FLAG FOR FINAL REVIEW / follow-up:
  Important #4: the resume-verification path is unreachable. coaches.view.js:85 opens the OTP tab
    on res.isPendingVerification, but real loginUser only sets that AFTER a successful password
    check (auth.ts:107); Supabase rejects an unconfirmed email first (auth.ts:97), returning no
    such flag. A user who registers, closes the modal and returns can never reach the OTP form.
    The fake implementation handled this. Behavioural regression.
  Important #5: auth.ts:75-78's onAuthStateChange callback is async and awaits another
    supabase.auth call. supabase-js v2 warns against this — the callback holds a navigator.locks
    lock and the await defeats re-entrancy detection. Failure mode is currentUser silently
    ceasing to track auth changes.
  Important #2 (design consequence, matches brief): first paint is now gated on two network
    round-trips (auth.getUser + profiles select) with no timeout, because the await sits at the
    very top of init(). Previously boot was not network-blocking.
  Minor #6: coaches.view.js:121-125 looks up #simulatedCodeBanner, which no longer exists in
    index.html — the new "we emailed you a code" string never displays. Harmless: index.html:1134
    already tells the user to check their inbox.
  Minor #7: coaches.view.js:108 reads res.user.name in a branch that is dead today (real
    registerUser always returns requiresVerification:true and never sets user) — a TypeError
    waiting for anyone who adds an auto-confirm path.
  Minor #9: approve/reject fail silently. auth.ts:171-181 returns false when approveProfile
    returns null, which now includes an RLS denial — the admin sees nothing happen at all.
Task 12: fix round 1/5 dispatched (findings #1, #3, #8).
Task 12: fix round 1/5 (3 addressed, 0 open — .catch() chained so authReady always resolves;
  lastAuthKey seeded from getCurrentUser() BEFORE subscribe and includes status; quickLogin
  removed cleanly; src/auth.ts confirmed untouched. Re-reviewer additionally verified the seed
  and the callback compute keys from matching AppUser shapes, so the comparison is sound rather
  than superficially plausible. Commits ed01e44..c51c1ba)
Task 12: complete (commits 2b62f60..c51c1ba, review clean)
  OUTSTANDING FOR HUMAN: brief Steps 7-8 — sign in against the real database, confirm a WRONG
  password is now rejected, and check the guest path. Never performed by anyone.

Ruling P24 (Task 13, cross-task — found before dispatch): Task 13 Step 5 said to replace
`window.authReady = auth.init();`, but Task 12's fix round changed that line to
`auth.init().catch(...)`. The instruction was stale, and the failure mode is nasty: appending
`.then()` AFTER the existing `.catch()` means a rejected fetchRoles() rejects window.authReady,
and app.core.js awaits it above bindEvents()/renderCurrentView() — reproducing the exact
blank-shell bug Task 12's .catch() was added to prevent, through the back door. Rewrote Step 5
to chain .then() BEFORE .catch() with that reasoning spelled out. Cost if wrong: caught by the
review either way, but this saves a fix round on the most fragile line in the codebase.
Task 13: BASE 76b95c3, dispatched (sonnet).

*** Ruling P25 (CRITICAL — Task 12 shipped a BROKEN BUILD; found by Task 13's implementer,
confirmed by controller) ***
`src/auth.ts:11` contains `import './globals';`, but only `src/globals.d.ts` exists — a
declaration file with no runtime counterpart. tsc resolves it happily; Vite/Rollup cannot.
Verified myself by stashing Task 13's work and running `npm run build` on the committed Task 12
HEAD: BUILD EXIT 1, "Module not found", with the chain printed as
index.html -> src/main.ts -> src/auth.ts -> ./globals.
This is not a latent risk. At the current HEAD the app does not build, and in a browser
src/main.ts fails to evaluate, so window.auth is never assigned and all 30 window.auth.* call
sites throw. The app is dead.
It became reachable at Task 12, which added `import { auth } from './auth'` to main.ts. Before
that, main.ts imported only ./data/supabase, which does not import ./globals — which is why
Task 7's build passed.
EVERY CHECK WE RAN MISSED IT, and each for a different reason:
  - npm run typecheck: tsc resolves ./globals to the .d.ts and tolerates it.
  - npm test 21/21: no test imports src/auth.ts.
  - node --check: only covers public/js, and only syntax.
  - curl / returning 200: Vite dev serves index.html regardless of module-graph health.
  - Task 12's report did not run `npm run build` at all; Task 7 was the last task that did, and
    it passed legitimately because auth.ts was not yet in the graph.
This is precisely the "no browser verification" gap flagged after Task 7. It bit exactly where
predicted, on the most important task in the plan.
Decided: (a) add a Global Constraint requiring `npm run build` for any task touching the src/
module graph — it is the only check that exercises real module resolution; (b) authorise the
Task 13 implementer to edit src/auth.ts, which I had forbidden, solely to delete that one dead
import line. The ambient declarations in globals.d.ts already apply via tsconfig's
"include": ["src"], so no runtime import is needed and nothing else changes.
Cost if wrong: if the import were somehow load-bearing, typecheck would fail immediately and
visibly — the opposite of the silent failure it causes today.
P25 RESOLVED: Task 13 deleted src/auth.ts:11's dead `import './globals'`. Controller verified
independently: `npm run build` now EXIT 0, and dist/ contains a real JS bundle
(assets/index-CxFRhzX1.js, 238.50 kB) — every previous dist emitted only CSS and images because
the module graph never resolved. The implementer also reported /src/auth.ts returning 200 where
it previously returned 500. Chain order confirmed by controller: auth.init() -> .then() ->
.catch(), with the rationale preserved as a comment so it is not "tidied" later.
Task 13: BASE 76b95c3, implementer DONE (935f96c), 25/25 tests, typecheck clean, build clean.
Task 13 review: Spec compliant, Approved, 0 Critical/Important. Reviewer confirmed the auth.ts
scope exception was exactly one deleted line with nothing else in that file touched, and the
.then()-before-.catch() ordering. Notably it MUTATION-TESTED the fail-closed guarantee —
constructed a plausible fail-open variant and confirmed both edge-case tests would flip and fail,
rather than just noting the tests exist. Also noted window.can is installed synchronously outside
the promise chain, so a view calling it before roles load gets a defined function that fails
closed rather than a TypeError.
Task 13: minor (deferred): canFor does role.permissions[key] === true with no guard for a null
  permissions blob — would throw rather than fail closed. Unreachable under the current schema
  (JSONB is fully populated) but a latent landmine; inherited from my brief's reference code.
Task 13: minor (deferred): no test for "key present but undefined" as distinct from explicit false.
Task 13: complete (commits 76b95c3..935f96c, review clean, 25/25 tests, build clean)

Task 14: BASE 935f96c, dispatched (sonnet). HARD BOUNDARY: applying the migration requires the
Supabase SQL editor or a service-role credential; the repo has only the publishable anon key,
which cannot execute DDL. The agent writes and commits the migration file ONLY. Applying it and
verifying the effect is the human's step, and must be surfaced clearly.
Task 14: implementer DONE (8a937e8), migration written and correctly NOT applied. Controller
traced the policy logic independently: for anon, auth.uid() is NULL and current_profile_role()
returns NULL, so both disjuncts are NULL and no rows match; players match only their own row;
coach/admin match all non-deleted. Rollback documented. One file, 21 insertions.
Task 15: BASE 8a937e8, dispatched (sonnet) in parallel with Task 14's review — disjoint files
(SQL migration vs app.core.js/data.js/main.ts/planner.view.js), reviewer is read-only.
Task 14 review: Spec compliant, Approved, ZERO issues. Reviewer traced the policy per caller
class using SQL three-valued logic correctly — for anon the clause evaluates to NULL (not false),
and a using clause admits only on TRUE, so anon gets zero rows. Player sees only own row;
coach/admin see all non-deleted; soft-deleted rows excluded for everyone. Confirmed
current_profile_role() is `security definer stable` (supabase_migration_auth.sql:50-54) so the
policy's call into it does not recurse. Rollback block verified byte-for-byte identical to the
original policy.
Task 14: complete (commits 935f96c..8a937e8, review clean)
  OUTSTANDING FOR HUMAN: apply the migration via the Supabase SQL editor, then confirm an
  anonymous read of profiles returns [] (it returns 2 rows today).

Ruling P26 (final review scope): `git merge-base main HEAD` is ba49f15, 42 commits back — but
that range includes two large pre-session commits (35f4b9f "convert app to TypeScript with Vite
build tooling" and 999b26a "replace fake client-side auth with real Supabase Auth + RLS
hardening") that this plan did not produce. The session began with HEAD at 999b26a, which is the
state the spec and plan were written against.
Decided: scope the final whole-branch review to 999b26a..HEAD — this plan's work. Reviewing the
pre-session TypeScript conversion would bury this plan's diff in unrelated changes and invite
findings against code no task here touched. Cost if wrong: pre-existing defects in that earlier
work go unreviewed by this pass — they were already unreviewed before it, and several are
separately logged (src/auth.ts's four findings, the duplicate openImportExportModal keys, the
userProfiles export fallbacks).

Ruling P27 (Task 15, from the implementer's own concerns — both confirmed by controller):

(a) SURVIVING FABRICATED ATTRIBUTION. getActiveThought() in planner.view.js returns a fallback
object when dailyThoughts is empty. Its `text` is 'No coach thoughts entered for today.' — a
correct, honest empty state — but its `coachName` is 'Coach Bob Miller', and home.view.js:93 and
planner.view.js:461 each independently re-add `|| 'Coach Bob Miller'` on top. Neither grep caught
it because none of them references DEFAULT_BHS_DATA. Net effect: the app would truthfully say "no
thoughts today" while attributing that statement to an invented person. That directly undercuts
the plan's headline outcome, so it is in scope. Fixing it requires home.view.js, which was
outside Task 15's file list — scope extended.

(b) saveData() RECREATES THE LEGACY KEY. saveData() writes `bhs_soccer_app_data`, the exact key
backupLegacyBlob() renames away at boot. So: boot backs it up and removes it, then the first
mutation recreates it. My Task 15 brief never redefined saveData() — the spec said it would
become a cache write, but no step implemented that. Now loadData() never reads that key, so the
blob is written and never read: dead weight that also defeats the one-time backup. Decided: make
saveData() a documented no-op. Persistence already happens via the Postgres upserts that
accompany every mutation, and reload repopulates through syncFromSupabase; per-collection caching
is Phase 2's repository work under bhs.cache.v1.*.

Cost if wrong for (b): if any flow depended on the blob surviving a reload, it would now lose
local state on refresh — but loadData() already stopped reading it in this same task, so that
dependency is already broken either way; this only stops the pointless write.

Task 15: minor (deferred, FLAG FOR FINAL REVIEW): planner.view.js:659 hardcodes a fake quiz
  leaderboard row ({ player_name: 'Coach Bob Miller', score: 5, percentage: 100 }) shown when
  there are no results. quiz_attempts has 0 rows live, so this fabricated entry displays today.
  Same bug class as daily_thoughts, but the quiz belongs to Phase 4.
Task 15: minor (deferred): thought-editor form defaults at planner.view.js:312/326/336 fall back
  to 'Coach Bob Miller' when composing a thought. Less harmful (it is an input default, not
  displayed content) but should follow the signed-in user.
Task 15: minor (deferred): getSchoolsList() lazy-init guard kept rather than made unconditional —
  implementer's judgment call to avoid clobbering a populated multi-tenant list. Reasonable.
Task 15: fix round 1/5 dispatched.
Task 15: fix round 1/5 (2 addressed, 0 open — fabricated attribution removed at all three display
  sites, saveData() now a documented no-op; commits deb4037..285a419). Controller verified all
  three edits directly.
The implementer again corrected MY expected grep counts rather than matching them, surfacing two
discrepancies:
Task 15: minor (deferred): a FIFTH "Coach Bob Miller" site at planner.view.js:293 in
  renderThoughtsList() — a per-record fallback for real stored thoughts, in neither my fix-list
  nor my do-not-touch list. Correctly left untouched and flagged. Only displays when a real
  daily_thoughts row lacks a coach name; the table has 0 rows today.

*** CARRY FORWARD TO PHASE 2 — HIGH VALUE ***
src/app.core.ts still carries the ENTIRE pre-Task-15 seed bug: `let data = DEFAULT_BHS_DATA`,
`localStorage.getItem('bhs_soccer_app_data')`, and the full chain of
`if (!data.X || data.X.length === 0) data.X = DEFAULT_BHS_DATA.X` fallbacks (lines 35-40).
Verified dormant — it is not in main.ts's module graph and does not appear in the built bundle —
so it changes nothing today. But it is the TypeScript twin that Phase 2 activates when it wires
src/ in. Doing so without porting Task 15's changes would silently reintroduce the exact bug this
entire plan was written to eliminate, including the daily_thoughts fabrication.
This is the "three parallel copies of the app" hazard documented in CLAUDE.md coming due. The
same applies to src/data.ts (the seed itself) and src/utils.ts.
Task 15 review: Spec compliant, Approved, 0 Critical, 1 Important (parked — see P28), 2 Minor.
Reviewer verified boot ordering for backupLegacyBlob (main.ts:29, before auth.init at :47, and
before DOMContentLoaded constructs the app), confirmed all 35 saveData() call sites ignore the
return value so the no-op is a safe drop-in, and traced the empty-database render paths: season
stats produce 0/0.00 rather than NaN because the reduce starts from literal zeros, and branding
falls through to static index.html markup rather than undefined.

Ruling P28 (Task 15 Important — PARKED, not fixed): saveData()'s no-op means an edit made while
Supabase is unconfigured or unreachable is memory-only and lost on reload, silently. The reviewer
cites planner.view.js:1906-1924 (openCreateMasterDrillModalForPlanDrill) which pushes a drill and
calls saveData() with no Supabase write in that function.
Traced it: the loss does not come from the no-op. It comes from stripping loadData(), which no
longer reads bhs_soccer_app_data at all — so writing that blob would persist nothing regardless.
The no-op only stops a pointless write.
This is inherent to the approved design ("localStorage becomes a pure cache of the last successful
fetch — never a seed"), and the spec's answer is Phase 2's write-disable: "while any collection is
stale or error, writes are disabled and a staleness banner shows." That UI gating is explicitly
out of Phase 1 scope, since no view consumes CollectionState yet.
Decided: PARK. Fixing it half-way now — restoring the blob write — would resurrect the parallel
source of truth this plan exists to remove. Narrow in practice: the repo ships a working anon key,
so Supabase is configured by default. Cost if wrong: an edit made during a genuine outage is lost
on refresh with no warning, until Phase 2's write-disable lands. FLAG TO HUMAN.
Task 15: minor (deferred): home.view.js:34-60 renders "SEASON COMPLETE / Final record: 0 - 0 - 0"
  when schedule is genuinely empty — reads as a finished season rather than "no data yet".
  Pre-existing, but exactly the class of message that looks wrong once the seed is gone.
Task 15: complete (commits 8a937e8..285a419, review clean, 25/25 tests, build clean)

ALL 15 TASKS COMPLETE. Dispatching final whole-branch review over 999b26a..HEAD (39 commits).

=== FINAL WHOLE-BRANCH REVIEW (opus, 41 commits / 7240 lines, read in 6 passes + a 7th against
the working tree) — verdict: NOT READY, five bounded must-fixes ===

Must-fix, all confirmed by the reviewer against the working tree (several are in UNCHANGED lines
whose MEANING this branch changed — which is why no task-scoped review could see them):
 M1 admin.js:193 + supabase_migration_auth.sql:162 — the UI offers coaches an approval action the
    database refuses. profiles_update is `id = auth.uid() or current_profile_role() = 'admin'`
    (admin only), and guard_profile_privileged_columns raises for any non-admin changing
    role/status. Task 14 widened SELECT to coach/admin, so a coach now SEES a queue it cannot act
    on. Fails silently end to end: .update() returns [], supabase.ts:246 yields undefined,
    auth.ts:173 returns false, coaches.view.js:144 `if (ok)` does nothing. No alert, no error.
 M2 admin.js:207 `${p.requestedRole.toUpperCase()}` throws on a null requested_role. Task 9 swapped
    the data source from the fake auth's SAMPLE_USERS (always populated) to real profiles rows,
    where auth.ts:38 maps it to undefined. One such row and renderAdminModalContent() aborts —
    the admin modal never opens. The clearest "shape changed, semantics did not follow".
 M3 app.core.js:248-256 — a SIX-ROW soccerCategories seed survived Task 15, and init() calls
    populateCategoryDropdowns() BEFORE syncFromSupabase(), so it fires every boot now that
    loadData() returns []. Task 15's greps targeted DEFAULT_BHS_DATA.* and data\.school\.; this
    inline duplicate matches neither. Masked only because soccer_categories has 25 live rows.
    admin.js:790/941 EXPORT those invented categories to XLSX as though they were data. This is
    the plan's headline bug, still live in the running module graph.
 M4 planner.view.js:657-660 — this.data.quizAttempts is not a key loadData() creates, so it is
    undefined every boot and the fallback ALWAYS wins. TWO fabricated rows (the ledger named one),
    rendered under a heading reading "Calculated from quiz_attempts & player_answers database
    tables". False provenance asserted in text.
 M5 app.core.js:222 AND src/data/supabase.ts:938 — a sixth and seventh 'Coach Bob Miller'. The
    first re-injects it in the SYNC path upstream of the three display sites Task 15 fixed; the
    second is a WRITE path that stamps the invented name into the now-authoritative table.

Ruling P29 (M1 — how to reconcile the coach/admin approval conflict): two options were offered —
gate the UI on isAdmin(), or widen profiles_update to coaches in the unapplied migration.
Decided: GATE THE UI. My own spec says a coach or admin clears the pending state, but the
pre-existing supabase_migration_auth.sql made it admin-only, and widening RLS would let coaches
change role and status — a privilege-escalation surface. That is a deliberate security decision
for the human to make, not something to slip into a fix wave. The UI now matches the database;
if coaches should be able to approve, that is a separate, considered RLS change.
Cost if wrong: coaches cannot approve signups until the human decides otherwise — visible and
easily reversed, whereas the reverse error grants privilege silently.

Ruling P30 (final-review triage adopted, with one addition): accepting the reviewer's triage
table wholesale. Adding to the fix wave beyond its five must-fixes: the duplicate
openImportExportModal (delete the FIRST copy at admin.js:673-675, closing both linked defects at
once), the two admin.js strings that now claim LocalStorage persistence which saveData() no
longer provides, auth.ts's onAuthStateChange lock hazard (a setTimeout wrap — the symptom is a
signed-out user retaining a coach UI, which is severe and silent), the stale forward-looking
comments in supabase.ts/globals.d.ts, the guest being told "Signed in as guest@cougars-fan.com",
and the CLAUDE.md + check_syntax.ps1 refresh that P10 deferred to "after Task 15" and which never
happened — that is unfinished plan work, not a deferral.

*** CROSS-CUTTING FINDINGS — the reason this review existed. Two are Phase 2 blockers. ***
 C1 Repository.load(sessionValid) is the ENTIRE mechanism for distinguishing "empty table" from
    "RLS filtered you to zero rows" — the spec's headline requirement — and NOTHING in the branch
    can supply that boolean. AuthManager exposes no session accessor, and the nearest candidate,
    isLoggedIn(), returns FALSE for a guest with a perfectly valid anon session (auth.ts:196
    requires role !== 'guest'). Wiring it to that in Phase 2 would flip every public collection —
    roster, schedule — to status 'error' for every anonymous visitor whenever a table is
    legitimately empty. cache/store/repo compose with each other but NOT with auth. Phase 2 needs
    an explicit auth.hasValidSession() before the first repository is instantiated. Every
    repo.test.ts case passes load(true), so nothing covers this seam.
 C2 Repository.commit() never revises status, so after a failed load followed by a successful save
    the state reads { status: 'stale'|'error', rows: [savedRow] } — the server just accepted a
    write while the UI would show a staleness banner. In the 'error' case fetchedAt is null so the
    cache write is skipped silently and the save is lost on reload. Latent in the model all of
    Phase 2 builds on.
 C3 syncFromSupabase() still guards every collection with `if (rows && rows.length > 0)`
    (app.core.js:107,121,139,154,201,214,229). Task 15 did not fix that; it changed the fallback
    from seed data to [], converting a wrong answer into a blank one. Genuine improvement,
    correctly scoped — but the spec reads as though the defect were closed. It is deferred.
 C4 daily_thoughts CANNOT BE READ OR WRITTEN AT ALL — this is why the table is empty. The schema
    declares school_id UUID (supabase_schema.sql:127) but supabase.ts:906/918/936 pass the literal
    string 'bhs' with no getSchoolUuid() call, unlike every other fetch in the file. Postgres
    rejects with 22P02 invalid input syntax for uuid. Faithfully ported from supabaseClient.js, so
    not a regression and outside the plan's letter — but it means the empty state the human is
    about to verify is PERMANENT, and creating a thought through the UI will fail. Compounding it,
    the schema itself defaults coach_name NOT NULL DEFAULT 'Coach Bob Miller' (line 129), so the
    fabrication Task 15 removed from the client is baked into the database.
 C5 CLAUDE.md contradicts the branch on seven counts; most actionably it tells a reader to
    `npx serve .` "with no build step", which is now false in both halves.
 C8 UX regressions no task-scoped review could see: openAdminModal() now awaits a network fetch
    BEFORE revealing the modal (no spinner, no timeout); it fires that profiles query for players
    too; and Task 11's replacement paragraph tells a guest "Signed in as guest@cougars-fan.com"
    under a heading reading ACTIVE USER ACCOUNT.
 C7 Boot path traced whole — NO cross-task ordering defect found. All 30 window.auth.* call sites
    resolve to real AuthManager methods, all 7 async ones awaited everywhere, authReady cannot
    reject (.then before .catch confirmed at main.ts:48-54).
 CLOSED: the Task 1 dist carry-forward was re-verified — dist/index.html has no dangling script
 references.
Final fix wave: ONE dispatch, all items. Then exactly one scoped re-review.

=== POST-MERGE: RLS MIGRATION APPLIED AND VERIFIED (2026-08-29) ===
The human applied supabase/migrations/0001_tighten_profiles_select.sql via the Supabase SQL
editor. Controller verified against the live database:
  BEFORE (baseline probe): anonymous read of public.profiles returned 2 rows, exposing id, role,
    status and email for every user of the site.
  AFTER: returns [] — 0 rows visible to anon.
  REGRESSION CHECK: all eight anon-readable tables unchanged from baseline — players 7,
    schedule 6, drills_bank 10, soccer_categories 25, coaches 2, practice_plans 27, schools 7,
    roles 4. Nothing over-tightened.
Task 14's outstanding human step is therefore CLOSED. The remaining unverified items are the
browser checks: sign-in against the live database, wrong-password rejection, the guest path, the
empty daily_thoughts state, and the offline path.

=== LIVE BROWSER VERIFICATION (2026-08-29) — first time this branch ran in a browser ===
Dev server started; Vite 8 forwards client console messages to the terminal, which finally
closed the "nothing has run in a browser" gap without browser automation.

VERIFIED PASSING:
  - The app boots and is NOT an inert shell. It executes JS and makes live Supabase calls, so
    src/main.ts evaluated and window.supabaseService installed. This was the top-ranked residual
    risk (P25's failure signature) and it is now disproven by observation, not inference.
  - / , /src/main.ts and /js/app.core.js all serve 200.
  - *** WRONG-PASSWORD REJECTION CONFIRMED *** — console shows
    "Supabase Auth signIn notice: Invalid login credentials" on a bad-password attempt.
    signInWithPassword is genuinely checking the password. The fake auth this branch replaced
    accepted ANY password, so this is the headline behavioural change of the whole plan,
    verified live.
  - No ReferenceError, no unhandled rejection, no module-resolution failure in the console.

CONFIRMED DEFECT (was static analysis, now observed):
  - The final review's cross-cutting finding C4 is real and fires on every page load:
    `Supabase fetchDailyThoughts error: {"code":"22P02","message":"invalid input syntax for
    type uuid: \"bhs\""}`. The schema declares school_id UUID; supabase.ts passes the literal
    string 'bhs' with no getSchoolUuid() call. daily_thoughts can be neither read nor written.
    Pre-existing, faithfully ported, outside this plan's scope — but no longer hypothetical.

*** NEW PHASE 2 CARRY-FORWARD: the password-reset flow has no landing point in the app ***
Found while the human tried to obtain a password for testing. Supabase's recovery email
redirects to the configured Site URL with the token in the URL fragment
(#access_token=...&type=recovery). supabase-js consumes it silently (detectSessionInUrl defaults
to true) and establishes a recovery session — but the application has NO handling for it
whatsoever: grep across src/ and public/js/ finds no `type=recovery`, no `PASSWORD_RECOVERY`
event handler, no `updateUser`, and no `resetPasswordForEmail`. There is no "forgot password"
entry point either.
Consequence: anyone clicking a recovery link lands on the home page with a live recovery session
and no way to use it. The reset silently dead-ends. The only workaround today is calling
`window.supabaseService.client.auth.updateUser({ password })` from the browser console.
This is not a regression — the fake auth had no passwords at all, so no reset flow was possible.
It is a hole that only exists BECAUSE auth is now genuinely real, and it belongs with the auth
work rather than the data work. Phase 2 should add: a "Forgot password?" link calling
resetPasswordForEmail, a PASSWORD_RECOVERY branch in the onAuthStateChange handler, and a
set-new-password form. Note src/auth.ts currently exposes no method for any of these.
