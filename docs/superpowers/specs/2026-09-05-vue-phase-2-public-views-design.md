# Vue Migration Phase 2 — Auth and the Public Views

**Status:** proposed, awaiting approval
**Date:** 2026-09-05
**Branch:** `feature/convertToVue`
**Follows:** `docs/superpowers/specs/2026-09-05-vue-phase-1-foundation-design.md`. Phase 1 is complete: shell, router, stores, theming and the Home view, at 1,994 tests.

## What this phase builds

Signing in, and the four screens a visitor or a coach reaches without entering the command centre: **Roster & Bios**, **Schedule & Results**, **Coaching Staff** and **Help** — each with the coach-only writes that belong to it.

## What the survey found, before any of it was planned

Three things about the existing code changed this phase's shape, and none of them were visible from the file names.

**`coaches.view.js` is not the Coaching Staff screen.** It is the sign-in, register and verify flow. `renderCoachesView` lives at `public/js/views/planner.view.js:530`, inside the 2.3k-line planner file — so the Coaching Staff screen has to be cut out of a file whose other 1,800 lines belong to Phase 4.

**The Vue app cannot sign in at all.** Phase 1 left the header's account button as a logged no-op, so every guarded route is unreachable there and no coach-facing screen can be exercised rather than assumed. That is why auth comes first in this phase rather than last.

**`help.view.js` is mostly not code.** Of its 926 lines, `helpSections()` is 725 — a nested data structure of help text. It is content to move, not logic to port, and it should live somewhere a non-programmer could plausibly edit.

## Decisions taken

**Auth is built first, before any view.** It unblocks the rest of the migration: without it, every later phase would be built against an app nobody can sign into, and each coach-only branch would ship untested. The `AuthManager` in `src/auth.ts` already exposes `loginUser` and `registerUser` and is real Supabase Auth, so this is a UI port, not new authentication.

**Full create, edit and delete for Roster and Schedule.** A roster a coach cannot edit is half a screen, and leaving the writes for later means a second pass over every file. *Rejected: read-only views now.* It would have been a smaller phase that finished nothing.

**Modals stay component state, and get one shared component.** The strategy settled that only the seven nav views get URLs. The application has thirty-six modals, and Phase 2 touches seven of them, so this is where the reusable `BaseModal` is established — focus trapping, Escape to close, a backdrop click, and the scroll lock — rather than at the thirty-sixth.

*Rejected: routing the modals.* Deep-linking an edit form raises questions about a refresh mid-edit that this phase should not be answering.

**Feedback replaces `alert()`.** The legacy flow announces success with `alert("🎉 Welcome back, …")`, which blocks the page and cannot be styled or tested. A dismissible inline message in the shell replaces it. This is a redesign phase, so the improvement is in scope.

**The help content moves to a data module, not a component.** `helpSections()` becomes `src/content/help.ts` — a typed structure the Help view renders. It is the one part of this app most likely to be edited by someone who is not changing code, and burying it in a template makes that harder than it needs to be.

**Coaching Staff is cut out of `planner.view.js` without touching the rest.** Only `renderCoachesView` and the staff CRUD move. The planner's other 1,800 lines are Phase 4 and are not read, refactored or disturbed.

**Rows are mapped in `src/domain/`, as `schedule-row.ts` established.** Players and coaches get the same treatment: one tested snake_case-to-camelCase mapping each, so the two apps cannot drift into reading a table differently.

**Branding stays organization-driven.** No `Beaumont`, `Cougars` or `'bhs'` literal enters any file this phase adds. The roster heading, the staff list and the schedule all name the organization from the `schools` row.

## What Phase 2 delivers

| Piece | Detail |
| --- | --- |
| `BaseModal` | Focus trap, Escape, backdrop click, scroll lock. Used by all seven modals below. |
| Auth | Sign in, register, the email-typo suggestion, the pending-verification tab, sign out |
| Roster | The squad, sorted and filtered; a player's detail; add, edit, delete; add an existing player to the team |
| Schedule | Fixtures and results; add, edit, delete; the directions link |
| Coaching Staff | The staff list, plus approving and rejecting pending accounts |
| Help | The content module, the section index, and the search |
| Domain | `player-row.ts`, `coach-row.ts` mappings; `roster-filter.ts` for the filter rules |
| Stores | `roster`, `coaches` |

### Auth, specifically

Three tabs, as today: **Sign in**, **Register**, **Verify**. Reuses what exists rather than reimplementing it:

- `auth.loginUser(email, password)` and `auth.registerUser({ name, email, password, role })` from `src/auth.ts`
- `src/auth/email-typo.ts` for the near-miss suggestion, which is already a tested module

The suggestion keeps its current character: **offered, never enforced.** An unfamiliar domain is ordinary for a club coach, and someone may genuinely own an address one character from Gmail — so "use what I typed" stays an equal, obvious path rather than a buried one.

Registration continues to land in a pending-approval state that a coach or admin clears. Nothing here changes who may approve whom.

## Non-goals

**The command centre is untouched.** Player Ratings, the planner, the diagrammer, match tools and the admin panel are Phases 3 to 6. Their routes keep their placeholders.

**No Phase 5 entry points.** `roster.view.js` and `schedule.view.js` link out to `openLineupModal`, `openPlusMinus`, `openSeasonReport` and `openRecordingNumbersModal`. Those are match tools. The Vue views omit the buttons rather than render dead ones, and the legacy app still has them.

**Nothing is deleted.** `public/js/`, `app.js` and `index.html` stay exactly as they are until Phase 7.

**No schema change.** Every table and column already exists.

## Verification

- `npm test` passes, above the 1,994 Phase 1 ended with.
- `npm run typecheck` (`vue-tsc`) passes, components included.
- `npm run build` passes and still emits both entry points.
- `check_syntax.ps1` passes over all 22 classic scripts.
- `git diff` against Phase 1's last commit shows **no change** to `index.html`, `public/js/` or `app.js`.
- Signing in through the Vue app reveals the three guarded nav items; signing out hides them again.
- A coach can add, edit and delete a player and a fixture, and the change survives a reload — which is the only proof the write reached Postgres rather than local state.

## Risks

**Writing to Postgres is the first real risk of this migration.** Everything before this phase was read-only or local. A write that silently fails, or one that lands unscoped, is the failure mode to guard against — `upsertMatch` already refuses a fixture with no valid team, for precisely this reason, and the Vue paths must not route around that guard.

**Coach-only branches are easy to leave untested.** Every write path needs a test that asserts a guest cannot reach it, not merely that the button is hidden. The client-side guard is an affordance; RLS is the enforcement, and neither substitutes for the other.

**`renderCoachesView` lives in a file this phase otherwise avoids.** Cutting it out of `planner.view.js` means reading a 2.3k-line file well enough to know where the boundary is. If the staff list turns out to be entangled with planner state, that is reported rather than worked around.
