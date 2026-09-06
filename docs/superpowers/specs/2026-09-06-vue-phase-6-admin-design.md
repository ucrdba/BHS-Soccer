# Vue Migration Phase 6 — Administration

**Status:** proposed
**Date:** 2026-09-06
**Branch:** `feature/convertToVue`
**Follows:** `docs/superpowers/specs/2026-09-06-vue-phase-5-match-tools-design.md`. Phase 5 is complete: all seven nav views and all seven match tools are real, at 3,159 tests.

## What this phase builds

Everything left. The admin panel, the XLSX import and export, the quiz, the daily thoughts and the school profile — after which `public/js/` has nothing the Vue app cannot do, and Phase 7 can delete it.

## The shape of what is left

| Legacy file | Lines | Holds |
| --- | --- | --- |
| `admin.js` | 3,258 | Admin panel (approvals, teams, categories, unassigned players, quiz bank, credentials, diagnostics), the 11-table XLSX import/export, plus some Matrix result entry |
| `views/thoughts.view.js` | 317 | The daily thought, and copy-to-team |
| `views/planner.view.js` | ~900 of 2,344 | Taking the quiz, the school profile forms |

Everything else in `public/js/` is already superseded.

## The thing to get right

**This is the phase where a mistake is permanent rather than merely wrong.**

The Matrix could show a bad number; the planner could lose a drill. Here:

- **The import writes eleven tables.** A misread column does not fail — it silently overwrites a season of data with something plausible.
- **The admin panel changes who can do what.** Approving the wrong signup hands a stranger a coach's access to a squad of minors.
- **Retiring a category, a player or a question is a write across rows the coach cannot see.**

So three rules run through the whole phase:

**Every destructive action names what it will do, in specifics.** Not "are you sure?" — *which* rows, *how many*, and what will survive. The legacy panel already does this in places and the rebuild must not lose it.

**An import is previewed before it is applied.** The legacy importer applies as it reads. The rebuild reads, reports what it matched and what it would change, and applies only on a second, informed press. This is a change from the legacy behaviour, and it is the one behavioural change this phase should make.

**Nothing is deleted; everything is retired.** `is_deleted` is the repo-wide convention and every write path here keeps it.

## The second thing to get right

**The XLSX import must not guess a team.**

`resolveImportTeam` and `askImportTeamChoices` exist because a spreadsheet names a team as text — "Varsity", "JV", "Boys Varsity" — and the database holds uuids. The legacy importer asks the coach to map the unknown ones, and refuses rather than guessing.

That matters more than it looks. A row imported against the wrong team is a player on a squad they never played for, and `team_players` is where minutes, ratings and recording numbers live. **The mapping prompt stays**, and the preview above makes it better: the coach sees the mapping before anything is written rather than in the middle of it.

## Decisions taken

**The admin panel becomes a route, not a modal.** It is the one surface that is genuinely a place rather than a dialog: several unrelated sections, deep-linkable, and long enough that a modal fights it.

This is a deliberate exception to the migration's "seven nav views get URLs, thirty-six modals stay component state" rule, and the reason is that the admin panel was never really a modal.

**But the route is coach-or-admin, and the sections are gated individually.** The obvious design — guard `/admin` on `can_access_admin_dashboard` — is wrong, and checking rather than assuming is what showed it:

- `schema_roles.sql` grants `can_access_admin_dashboard` to **`admin` only**; coach, player and guest all have it `false`.
- But `openAdminModal` in the legacy panel shows the categories, the unassigned players and the quiz bank to **any coach**, and only the teams-and-organizations block is behind `isAdmin()`.

So gating the whole route on that permission would take away access a coach has today. The route is guarded like `/coaches` — coach or admin — and each section carries its own gate, which is what the legacy panel actually does.

**And the permission can fail closed for a real admin.** `fetchRoles()` returns null when the client is unconfigured or the `roles` table is unreadable, `main.ts` and `vue-main.ts` both then call `setRoles([])`, and `canFor` returns false for every key. That is the safe direction, but it means an admin can be locked out of their own panel by a configuration problem. The admin-only sections must therefore say *"this needs the roles table"* rather than simply not rendering — an empty page is indistinguishable from a page with nothing in it.

**The quiz is player-facing and gets a route too.** Taking a quiz is not a dialog on top of the planner; it is a thing a player does. `/quiz`, visible to a signed-in player.

**Import/export stays a modal**, because it is a task with a beginning and an end, launched from admin.

**The credentials editor and the diagnostics stay, and stay admin-only.** They are how a misconfigured deployment is diagnosed without a developer, which is worth more than the tidiness of removing them.

**The daily thought moves to Home.** It is a message to the squad and Home is where the squad looks; burying it in the planner is an artefact of the file split.

## What each part delivers

**6a — The admin panel.** The route and its shell, approvals, teams and organizations, unassigned players, categories. The management surfaces, in order of how dangerous they are.

**6b — The quiz and the daily thought.** The bank in admin, taking the quiz at `/quiz`, and the thought on Home with its copy-to-team.

**6c — Import and export.** The 11-table XLSX round trip, with the preview, plus the school profile form and the credentials/diagnostics panel.

## Non-goals

**No schema change.** Every table and every client method exists.

**No new dependency.** `XLSX` and `JSZip` are already loaded from a CDN and declared in `globals.d.ts`; the Vue app uses the same globals rather than adding npm packages, because changing how they load is Phase 7's business, not this phase's.

**The legacy app keeps working.** `public/js/`, `app.js` and `index.html` are untouched until Phase 7 — which matters more here than anywhere, because the import/export is the path an admin would reach for if the rebuild has a problem.

## Verification

- `npm test` passes, above the 3,159 Phase 5 ended with.
- `npm run typecheck`, `npm run build` and `check_syntax.ps1` pass, by exit code.
- `git diff` shows no change to `index.html`, `public/js/` or `app.js`.
- **An import previews before it writes**, and the preview names the rows it would change.
- **An unknown team in a spreadsheet is asked about, never guessed.**
- Every destructive action names what it affects before doing it.
- A guest reaching `/admin` is redirected; a coach sees the coach sections and not the admin ones.
- An exported workbook re-imports into the same state.

## Risks

**The import is the highest-stakes code in the application.** It writes eleven tables from a file a coach assembled by hand, and its failure mode is plausible-looking data rather than an error. The preview is the mitigation; a round-trip test is the proof.

**The admin panel is the least-tested area of the legacy app.** Much of it was written to diagnose problems as they appeared, and the tests under `src/data/` cover the pieces that broke rather than the whole. Where the rebuild finds behaviour with no test, it needs one before it is ported.

**`can_access_admin_dashboard` is unused today.** Wiring anything to it means the `roles` table's contents suddenly matter, and `canFor` fails closed on an empty table — so a deployment whose `roles` rows never got seeded locks its own admin out of the sections that manage teams and organizations. `schema_roles.sql` seeds it correctly, but that script is applied by hand, and this repo has a documented history of the live database not matching its provisioning scripts. **Check it against the live database before cutover**, and make the failure legible in the meantime rather than silent.
