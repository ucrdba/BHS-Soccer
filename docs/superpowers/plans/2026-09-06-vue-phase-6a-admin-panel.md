# Vue Migration Phase 6a — The Admin Panel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin` — the route, approvals, teams and organizations, unassigned players, and categories.

**Architecture:** A new route (the migration's one deliberate exception to modals-stay-modals), one store, and a component per section. Every client method exists.

**Spec:** `docs/superpowers/specs/2026-09-06-vue-phase-6-admin-design.md`

**Baseline:** 3,159 tests across 161 files, four gates green, at commit `05ed4b1`.

## Scope

The management half of the admin panel, in order of how much damage each section can do. The quiz bank is 6b; import/export, the school profile and the diagnostics are 6c.

## The gating, which is not what it first looks like

**The route is coach-or-admin. The sections are gated individually.**

Guarding `/admin` on `can_access_admin_dashboard` is the obvious design and it is wrong:

- `schema_roles.sql` grants that permission to **`admin` only**.
- But `openAdminModal` shows the categories, the unassigned players and the quiz bank to **any coach** — only the teams-and-organizations block sits behind `isAdmin()`.

Gating the route on it would take away access a coach has today. So `/admin` is guarded like `/coaches`, and each section carries its own gate.

**And it can fail closed for a real admin.** `fetchRoles()` returns null when the client is unconfigured or `roles` is unreadable; both entry points then call `setRoles([])` and `canFor` returns false for everything. That is the safe direction, but an admin locked out by a configuration problem must be *told* — an empty page is indistinguishable from a page with nothing in it.

## Global Constraints

- **`index.html`, `public/js/` and `app.js` are not touched.**
- **Every destructive action names what it will do, in specifics** — which rows, how many, and what survives. Not "are you sure?".
- **Nothing is deleted; everything is retired.** `is_deleted` is the convention and every write here keeps it.
- **No `'bhs'`, `Beaumont` or `Cougars` literal.** The admin panel is where a second organization is created, so this matters more here than anywhere.
- `typescript` stays 5.x; `.at()` unavailable; `tsconfig` stays loose.
- Conventional Commits. Four gates, **checked by real exit code**.

---

### Task 1: The route and its shell

**Files:** Create `src/views/AdminView.vue` and its test; edit `src/router/index.ts` and its test.

- [x] **Step 1: Write the failing test**

- **A guest is redirected**, as `/matrix` and `/planner` already are.
- **A coach reaches it** and sees the coach sections.
- **A coach does NOT see the admin-only sections** — absent from the document, not hidden.
- An admin sees everything.
- **When `roles` has not loaded, the admin sections say so** rather than rendering nothing. Assert the message, because this is the case an admin hits when a deployment is misconfigured and the panel is exactly where they would go to find out.
- It is not in the main nav — it is reached deliberately, and a nav item for a page most people cannot open is noise.

- [x] **Step 2: Build it, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 2: Approvals

The most dangerous section: approving a signup hands somebody access to a squad of minors.

**Files:** `src/components/admin/ApprovalsSection.vue` and its test.

- [x] **Step 1: Write the failing test**

- Pending signups are listed with **who they say they are and what they asked for** — a name and an email alone is not enough to decide on.
- **Approving names the person and the role** before it happens.
- **Rejecting is not deletion**: it sets a status, and the panel says so, because a coach will otherwise assume a mistake is unrecoverable.
- The list is scoped to the **organization**, never bare — `getPendingApprovals()` called without one served a club admin Beaumont's signups, and that is a fixed bug this must not reintroduce.
- A failed read is reported rather than shown as "nobody is waiting", which would leave a real person waiting indefinitely.

- [x] **Step 2: Build it, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 3: Teams and organizations

**Files:** `src/components/admin/TeamsSection.vue` and its test.

- [x] **Step 1: Write the failing test**

- Admin-only, absent for a coach.
- Every team across every organization is listed, with its organization — `fetchAllTeams` exists because `this.data.teams` holds only the viewer's own.
- **A coach can be assigned to a team and removed from one**, and removing names the coach and the team.
- **Creating an organization and creating a team both take a kind** — `school` or `club` — because that distinction is what the whole multi-tenant model rests on.
- **No default organization.** Creating a team asks which one; it must not fall back to the first, or the only, or Beaumont.

- [x] **Step 2: Build it, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 4: Unassigned players and categories

**Files:** `src/components/admin/UnassignedPlayersSection.vue`, `src/components/admin/CategoriesSection.vue`, and tests.

- [ ] **Step 1: Write the failing tests**

Unassigned players — people in `players` with no `team_players` row, which is how an import leaves them:

- Each is listed with enough to identify them, and can be **added to a team the admin picks**.
- **Retiring one says they stay in the program**, the same wording the roster uses, because they are a person rather than a row.

Categories:

- Listed with **how many drills use each**, which is what makes retiring one a decision rather than a guess.
- **Retiring a category in use says how many drills it will affect.**
- Renaming and merging both exist; **merging names both sides and is not reversible**, so it says so.
- A **stray** category — one used by drills but absent from the table — can be adopted or merged. That is a real state the legacy panel handles and the rebuild must not drop.

- [ ] **Step 2: Build both, watch the tests pass**

- [ ] **Step 3: Gates and commit**

---

### Task 5: Close out 6a

- [ ] **Step 1: Confirm the legacy app is untouched**

```bash
git diff --stat 05ed4b1..HEAD -- index.html public/js app.js
```

- [ ] **Step 2: Update `CLAUDE.md`** — the admin route, its gating, and what 6b and 6c owe.

- [ ] **Step 3: Commit**

## Definition of done

- `/admin` exists, is refused to a guest, and shows a coach exactly the sections a coach may use.
- An admin locked out by an unloaded `roles` table is told why.
- Approving or rejecting a signup names the person first, and rejecting says it is recoverable.
- A team is created against a named organization, never a defaulted one.
- Retiring a category says how many drills it affects; retiring a player says they stay in the program.
- Four gates green by exit code; `git diff` shows no change to the legacy app.
