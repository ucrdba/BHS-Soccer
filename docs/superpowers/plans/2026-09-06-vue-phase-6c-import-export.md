# Vue Migration Phase 6c — Import, Export and the Rest

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 11-table XLSX round trip, the school profile form, and the credentials/diagnostics panel. The last of Phase 6.

**Architecture:** One table-definition list shared by every export mode, a domain module for the import shaping, and components. `domain/csv.ts` and `domain/upsert.ts` already hold the parsing and the merge from Phase 0.

**Spec:** `docs/superpowers/specs/2026-09-06-vue-phase-6-admin-design.md`

**Baseline:** 3,314 tests across 172 files, four gates green, at commit `cac3e66`.

## What the survey found, and it changes the plan

**The legacy export invents data.** This is not a style problem; it is the same class of failure as the import, one step earlier.

- The **quiz** sheet exports a single hardcoded sample question — never the real bank.
- The **matrix** sheet substitutes a fabricated row (`Sample Player`, `1v1 Gauntlet`, `WIN`) when a team has no logs.
- The **profiles** sheet falls back to two invented users (`coach_bob`, `sam_admin`).
- **Beaumont's details are hardcoded as defaults** throughout: `'bhs'`, `'Beaumont High School'`, `'Cougars'`, `'Beaumont, CA'`, `'Coach Bob Miller'`.

An export is a backup. A coach who exports, sees a plausible workbook, and later re-imports it **injects a fabricated quiz question, two fake user profiles and a made-up match result into their database** — and every club gets Beaumont's name on their config sheet.

So the rebuild's export writes **only what is in the database**. An empty table exports an empty sheet with its headers, which is what tells a coach the table is empty. That is a deliberate behavioural change and it is the right one.

**The same eleven table definitions are written out three times** in `exportXLSX` — once for the zip, once for the single workbook, once per table. They have already drifted. The rebuild defines them once.

## The thing to get right

**The import previews before it writes.** The legacy importer applies as it reads, so a misread column is discovered after it has overwritten a season. The rebuild reads, reports what it matched and what it would change, and applies on a second, informed press.

**And it never guesses a team.** A spreadsheet names a team as text; the database holds uuids. A row imported against the wrong team is a player on a squad they never played for, in the table where minutes, ratings and recording numbers live. Unknown names are put to the coach to map, and the preview is where that happens now.

## Global Constraints

- **`index.html`, `public/js/` and `app.js` are not touched.** This matters most here: the legacy import/export is the path an admin reaches for if the rebuild has a problem.
- **The export invents nothing.** No sample rows, no default users, no Beaumont.
- **No `'bhs'`, `Beaumont` or `Cougars` literal.**
- **`XLSX` and `JSZip` are the CDN globals**, already declared in `globals.d.ts`. No npm packages — how they load is Phase 7's business.
- **Nothing is deleted; everything is retired.**
- `typescript` stays 5.x; `.at()` unavailable; `tsconfig` stays loose.
- Conventional Commits. Four gates, **checked by real exit code**.

---

### Task 1: `domain/workbook.ts` — the eleven tables, defined once

**Files:** Create `src/domain/workbook.ts` and its test.

```ts
export interface TableDef {
  key: string;            // 'players'
  fileName: string;       // '3_Roster_Players.xlsx'
  sheetName: string;      // 'Players'
  headers: string[];      // the column order, which is also the template
  toRows: (data: any) => Record<string, any>[];
}

export function tableDefs(): TableDef[];
export function sheetFor(def: TableDef, data: any): Record<string, any>[];
```

- [x] **Step 1: Write the failing test**

- All eleven tables are defined, once, with the file names the legacy export used — a coach's saved workbooks and their habits both depend on those.
- **An empty table produces an empty array, not a sample row.** Assert it for the quiz, the matrix and the profiles specifically: those are the three that fabricate today.
- **Nothing carries a Beaumont default.** A school with no name exports an empty cell, not "Beaumont High School".
- Every sheet's keys match its declared headers, so a template and an export agree — the template is what a coach fills in and re-imports.
- `IsDeleted` is written for every table that has it, since the importer reads it.

- [x] **Step 2: Run it, watch it fail, write the module, watch it pass**

- [x] **Step 3: Gates and commit**

---

### Task 2: Exporting

**Files:** `src/components/admin/ImportExportModal.vue` and its test.

- [x] **Step 1: Write the failing test**

- One workbook, per-table files, and a zip — all three from the same definitions.
- **The quiz sheet contains the team's real questions**, and nothing when there are none.
- A template downloads with the headers and no rows.
- The library being absent is reported rather than throwing — the CDN may not have loaded yet.

- [x] **Step 2: Build it, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 3: `domain/import-plan.ts` — reading a workbook into a plan

**Files:** Create `src/domain/import-plan.ts` and its test.

```ts
export interface ImportPlan {
  sheets: { key: string; sheetName: string; rows: any[]; unknownTeams: string[] }[];
  totals: { rows: number; sheets: number };
  warnings: string[];
}

export function planImport(sheets: Record<string, any[]>, known: { teams: any[] }): ImportPlan;
```

- [x] **Step 1: Write the failing test**

- A sheet is matched to a table by its name, and an unrecognised sheet is **warned about rather than ignored** — a coach who renamed a tab needs to know why nothing happened.
- **Team names that match nothing are collected, not guessed.** This is the list the preview asks about.
- A team name that matches, case- and space-insensitively, is resolved.
- The row counts are per sheet, because "1,400 rows" tells a coach nothing about which table is about to change.
- A blank cell is `undefined` rather than `''`, so `upsertByKey`'s blank-skip can tell "not supplied" from "supplied empty" — that distinction is what stops a sparse sheet wiping columns it never mentioned.

- [x] **Step 2: Run it, watch it fail, write the module, watch it pass**

- [x] **Step 3: Gates and commit**

---

### Task 4: The preview, and applying it

**Files:** Extend `ImportExportModal.vue` and its test.

- [x] **Step 1: Write the failing test**

- **Choosing a file previews and writes nothing.** Assert no client write method is called.
- The preview names each sheet, its row count, and what it maps to.
- **Unknown team names are put to the coach**, with the teams to choose from — and **applying is refused while any are unmapped.**
- Applying writes, and reports what was inserted, updated and **rejected** — the legacy loop counts rejections because a refused row otherwise reports as a clean import.
- A second press does not double-write: the preview is consumed.

- [x] **Step 2: Build it, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 5: The school profile, credentials and diagnostics

**Files:** `src/components/admin/SchoolProfileSection.vue`, `src/components/admin/DiagnosticsSection.vue`, tests.

- [x] **Step 1: Write the failing tests**

- The profile edits the **active organization's** name, mascot, city, league, colours and record — never a defaulted one, and the mascot is required because headings render it.
- Changing it updates the branding the app shows, since `schools` is where every heading reads from.
- Credentials and diagnostics are **admin-only**, and the credentials editor says what it changes and that it is stored on this device.
- The diagnostic reports what it found rather than only pass/fail — it exists so a misconfigured deployment can be diagnosed without a developer.

- [x] **Step 2: Build both, watch the tests pass**

- [x] **Step 3: Gates and commit**

---

### Task 6: Close out Phase 6

- [ ] **Step 1: Confirm the legacy app is untouched**

```bash
git diff --stat 05ed4b1..HEAD -- index.html public/js app.js
```

- [ ] **Step 2: Update `CLAUDE.md`** — Phase 6 done, and what Phase 7 inherits.

- [ ] **Step 3: Commit**

## Definition of done

- An export contains only what is in the database — no sample rows, no invented users, no Beaumont defaults.
- The eleven tables are defined in exactly one place.
- An import previews before it writes, and names the rows it would change.
- An unknown team is asked about, and applying is refused until it is mapped.
- Rejected rows are counted and reported.
- The school profile edits the active organization and the mascot is required.
- Four gates green by exit code; `git diff` shows no change to the legacy app.
