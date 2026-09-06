# Vue Migration Phase 7 — Retire the Legacy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Vue app becomes the app. `index.html` serves it, `public/js/`, `app.js` and the dormant `src/` duplicates go, and `CLAUDE.md` describes one application instead of two.

**Spec:** `docs/superpowers/specs/2026-09-05-vue-migration-design.md` (phase 7 of the table).

**Baseline:** 3,447 tests across 176 files, four gates green, at commit `faa696e`.

## What the survey found, and it changes the order of the work

Three findings, and the first one is why this phase does not open by deleting anything.

### 1. Seven domain modules are tested ONLY through the legacy scripts

`src/domain/` modules are the shared logic both apps use, and these seven have
no test of their own:

| Module | Used by | Its only current coverage |
| --- | --- | --- |
| `csv.ts` | XLSX import | `src/data/import-upsert.test.ts` and friends |
| `upsert.ts` | XLSX import — `upsertByKey`, 76 lines | `src/data/import-upsert.test.ts` |
| `progress.ts` | the progress chart | `src/data/progress-report.test.ts` |
| `report.ts` | the squad report | `src/data/squad-report.test.ts` |
| `roster.ts` | roster sorting | `src/data/roster-player-crud.test.ts` |
| `round-robin.ts` | the 1v1 round robin | `src/data/round-robin.test.ts` |
| `season.ts` | the season report | `src/data/season-report.test.ts` |

Those tests load a classic script with `?raw` + `new Function` and assert that
the legacy delegation and the module agree. **Delete `public/js/` first and
seven live modules are left with no tests at all** — including `upsertByKey`,
which decides what an import overwrites, and `season.ts`, which holds
`seasonFullMatchMinutes` and therefore the rule that a match is not ninety
minutes.

So Task 1 gives those seven direct tests, ported from the agreement tests with
the legacy half dropped. Nothing is deleted until they are green.

### 2. The diagram agreement tests must survive the deletion

`src/diagram/{draw,geometry,frames,serialize}.test.ts` build a diagram on the
**legacy** board and compare both implementations. `diagram_data` is stored,
unversioned and irreplaceable — every drill and plan row may carry one, and a
reader that expects a subtly different shape orphans every diagram a coach has
drawn, with nothing on screen saying so. CLAUDE.md says to keep these tests and
it is right.

`public/js/diagrammer.js` is therefore **kept as a test fixture** rather than
deleted, moved to `src/diagram/legacy/` with a comment saying it is not shipped
and why it still exists. It is the golden master for a format that is still in
the database.

### 3. Two things the Vue app needs that only `index.html` currently provides

- **`XLSX` and `JSZip`** are loaded from CDN by `index.html` and **not** by
  `app.html`. `ImportExportModal.vue` reads both off `window`. The modal
  reports their absence rather than throwing, which is why nothing has failed
  yet — but on the deployed Vue app today, export would simply refuse.
- **The Vercel rewrite.** `createWebHistory` needs unknown paths served the
  app's HTML. Vite's dev server does this and Vercel does not, so a direct
  visit to `/roster` 404s. `vercel.json` has no `rewrites` key at all.

## The thing to get right

**A deployment must not be able to half-happen.** The rewrite and the CDN
libraries land BEFORE `index.html` changes, so at no point is there a commit
where the deployed site serves the Vue app without the routing that app needs.

**The legacy app keeps working until the moment it is deleted**, and after that
it is gone rather than half-gone: no dead script tags, no orphaned `onclick`
handlers, no `window` namespaces published for readers that no longer exist.

## Global Constraints

- **Nothing that ships is deleted before its replacement is proven.** Task 1
  before Task 4; the CDN libraries and the rewrite before the entry point.
- **No `'bhs'`, `Beaumont` or `Cougars` literal in what replaces anything** —
  including the `<title>`, which currently reads "Beaumont High School Cougars
  | Boys Varsity Soccer" and must not be carried over as-is.
- `typescript` stays 5.x; `tsconfig` stays loose.
- Conventional Commits, one commit per task. Four gates, **checked by real exit
  code** — and the fourth (`check_syntax.ps1`) is retired in Task 5 along with
  the scripts it checks, after which there are three.

---

### Task 1: Direct tests for the seven orphaned domain modules

**Files:** Create `src/domain/{csv,upsert,progress,report,roster,round-robin,season}.test.ts`.

- [ ] **Step 1: Write the tests**

- Ported from the assertions in the `src/data/*` agreement tests, importing the
  module directly — no `?raw`, no `new Function`, no hand-built `window`.
- **`upsert.ts` first and most carefully.** `upsertByKey` decides what an
  import overwrites; its blank-skip is what stops a sparse sheet wiping columns
  it never mentioned.
- **`season.ts` must pin `seasonFullMatchMinutes` reading `teams.match_minutes`** —
  high school is 80, clubs vary, and nothing may hardcode 90.
- **`report.ts` and `progress.ts` must pin that low-minute players are
  included.** They are the audience for these views, not noise in them.

- [ ] **Step 2: Watch them pass against the current modules**

They are characterisation tests of code that already works — a failure here is
a bug found, not a test to adjust.

- [ ] **Step 3: Gates and commit**

---

### Task 2: The Vercel rewrite, and the CDN libraries on the Vue entry

**Files:** `vercel.json`, `app.html`.

- [ ] **Step 1: Write the failing test**

- A test asserting `vercel.json` rewrites unknown paths to the app's HTML, and
  that it does **not** swallow `/version.json` or the asset directory.
- A test asserting the Vue entry document loads `XLSX` and `JSZip`.

- [ ] **Step 2: Make them pass**

- [ ] **Step 3: Gates and commit** — deployable on its own, and changes nothing
  a user sees.

---

### Task 3: `index.html` becomes the Vue app

**Files:** `index.html`, `app.html`, `vite.config.ts`.

- [ ] **Step 1: Write the failing test**

- `index.html` mounts `#vue-app` and loads `src/vue-main.ts`.
- It loads **no** `./js/*` script.
- Its `<title>` names no single organization.

- [ ] **Step 2: Make them pass**

- The legacy `index.html` is replaced by what `app.html` holds; `app.html` is
  removed and `vite.config.ts` drops to one input.
- `src/main.ts` — the legacy entry, which publishes the `window` namespaces the
  classic scripts read — is deleted here, since nothing loads it any more.
  `window.supabaseService` is still published by `src/vue-main.ts`, because
  `src/auth.ts` reads it off `window` in fifteen places.

- [ ] **Step 3: Gates and commit**

---

### Task 4: Delete the legacy

**Files:** `public/js/` (22 scripts), `app.js`, the 62 tests that load them,
`src/domain/test-globals.ts`.

- [ ] **Step 1: Keep the diagram fixture**

- Move `public/js/diagrammer.js` to `src/diagram/legacy/diagrammer.legacy.js`,
  update the four agreement tests' import paths, and write the comment
  explaining that it is a golden master for an unversioned stored format and is
  not shipped.

- [ ] **Step 2: Delete, and account for what went**

- Every `src/data/*.test.ts` that loads a classic script goes with it: they
  test prototype methods that no longer exist.
- `src/domain/test-globals.ts` exists only to install those namespaces.
- **Record the test-count drop in the commit message**, with the count before
  and after, so the loss is stated rather than discovered.

- [ ] **Step 3: Gates and commit**

---

### Task 5: The dormant duplicates and the tooling

**Files:** `src/app.core.ts`, `src/data.ts`, `src/utils.ts`, `src/globals.d.ts`,
`check_syntax.ps1`, the root one-off `*.ps1` scripts, `package.json`.

- [ ] **Step 1: Delete what is now unreachable**

- The three dormant modules still carry the pre-migration seed logic
  (`DEFAULT_BHS_DATA`, the localStorage cycle) that the live app had already
  stripped out. They were never wired in; they are deleted rather than ported.
- `check_syntax.ps1` checks `public/js/`, which no longer exists.
- `split_app.ps1`, `patch_commas.ps1`, `fix_boundary.ps1`, `find_methods.ps1`
  are one-off tooling from a split whose source is gone.

- [ ] **Step 2: Prune `src/globals.d.ts`**

Keep the `XLSX` / `JSZip` UMD declarations and `window.supabaseService`; drop
the "Pending migration" surface that existed for the classic scripts.

- [ ] **Step 3: Gates and commit** — three gates from here on.

---

### Task 6: Rewrite `CLAUDE.md`

- [ ] **Step 1: One application, not two**

- "Two apps, two entry points" goes; so does the per-phase migration history,
  which is what the plans and commit messages are for.
- **The rules that are not guessable from the code stay**, and they are the
  reason this file exists: the clock rule, low-minute players, `match_minutes`,
  `time_bands` as a standard, recording numbers, the practice-plan traps, the
  multi-organization rule and the `'bhs'` defaults still on ten service
  methods, the categories migration, the diagram format, `time.ts`'s parsing,
  and the setup-store rule.
- The four gates become three.

- [ ] **Step 2: Commit**

## Definition of done

- `npm run dev` and a built `dist/` serve the Vue app at `/`, and a direct
  visit to `/roster` works on Vercel.
- No file under `public/js/`, no `app.js`, no `app.html`, no `src/main.ts`.
- `src/diagram/legacy/diagrammer.legacy.js` remains, as a test fixture.
- The seven domain modules have their own tests.
- Three gates green by real exit code.
