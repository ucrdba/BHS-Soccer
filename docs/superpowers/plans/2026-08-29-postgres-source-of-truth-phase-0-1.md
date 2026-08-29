# Postgres Source of Truth — Phase 0 & 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get a real ES-module data layer and real Supabase authentication running in the browser, replacing the fake client-side auth and the localStorage-as-seed model.

**Architecture:** A new `src/main.ts` module entry point installs `window.supabaseService`, `window.auth`, `window.authReady` and `window.can` before the app constructs, so the existing classic-script view files keep working untouched. The base repository class ships here with Postgres-first writes; **`window.store` and the per-entity repositories are Phase 2** and are deliberately not installed by this plan. Auth call sites are made `await`-ready *before* the auth implementation is swapped, so every task ships working software.

**Tech Stack:** TypeScript 7, Vite 8, Vitest + jsdom, Supabase JS v2, Postgres (Supabase).

**Spec:** `docs/superpowers/specs/2026-08-29-postgres-source-of-truth-design.md`

## Global Constraints

- **Node ≥20.19** is required. Vite 8 declares `engines.node: "^20.19.0 || >=22.12.0"`, and the installed v14 cannot launch the TypeScript 7 binary either. Nothing in the toolchain runs until Task 1 completes.
- **`app.data` must remain a genuinely mutable object.** View files perform 21 array mutations, 38 reassignments and 35 `saveData()` calls directly against `this.data`. A read-only getter shim is not viable.
- **`rows.length === 0` is never a reason to fall back to cache or seed.** This is the governing rule of the store.
- **Writes go to Postgres first, local state second.** On write failure, local state must not change.
- **Unmigrated entities keep working through the `window.supabaseService` facade.** Do not remove the facade in this plan.
- **`npm run typecheck` does NOT cover `public/js/`.** `tsconfig.json` sets `"include": ["src"]`, so a clean typecheck says nothing about any view file. For every task that edits a file under `public/js/`, the syntax gate is `node --check <file>` — run it on each edited file and show the output. A green typecheck plus a green test run can both pass while a view file has a syntax error.
- **Every task that changes anything in the `src/` module graph MUST run `npm run build`, and the report must show the result.** This is the ONLY check that exercises real module resolution. `npm run typecheck` does not: `tsc` happily resolves `import './globals'` to a `.d.ts` file that has no runtime counterpart, while Vite/Rollup cannot. `npm test` does not, unless a test happens to import the affected file. A dev-server `curl /` does not — Vite serves `index.html` regardless of whether the module graph is broken. Task 12 shipped a build-breaking import with typecheck clean, 21/21 tests green, `node --check` clean and the dev server returning 200.
- **Every task runs `npm run typecheck` before committing, and the report must show its output.** `npm test` does NOT typecheck — Vitest transpiles without checking types, so a task can be 15/15 green and still ship type errors. Task 4 did exactly that. A clean test run is not evidence of a clean build.
- **Do not change `tsconfig.json`.** `strict: false` is deliberate, so the ported JavaScript typechecks without a rewrite. If code fails to compile, fix the code, not the compiler settings.
- **Cache keys are versioned:** `bhs.cache.v1.<collection>`.
- **All view-file edits are in `public/js/` after Task 1.** Paths in tasks 8–13 reflect the post-move location.
- **Line numbers in this plan are pre-edit.** Tasks 9, 10 and 11 all modify `public/js/admin.js` in sequence, so each edit shifts the lines beneath it. Always locate the edit site by the quoted symbol name or comment text given in the task, never by the line number alone. Re-grep before editing.
- **Never create `src/data/index.ts`.** The pre-existing seed module `src/data.ts` coexists with the new `src/data/` directory, and `src/app.core.ts:13` imports it as `'./data'`. Under `moduleResolution: "bundler"` that resolves to `data.ts` only because no `data/index.ts` exists; adding one would silently redirect that import. Always import the new modules by explicit filename — `'./data/cache'`, `'./data/store'`, `'./data/repo'`, `'./data/supabase'`.
- **No top-level `await` in `src/main.ts`.** Whether top-level await delays `DOMContentLoaded` is subtle; the app must not depend on it. Asynchronous boot work chains onto `window.authReady`, which `app.core.js` awaits explicitly.
- **Phases 2–4 are out of scope:** entity-by-entity repository migration, matrix schema and standings view, quiz and thoughts import.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Module entry point. Installs globals. No logic. |
| `src/data/cache.ts` | Versioned localStorage read/write. Pure, no network. |
| `src/data/store.ts` | `CollectionState` model and fetch-result resolution rules. |
| `src/data/supabase.ts` | Typed Supabase client. Raw row I/O only. Port of `supabaseClient.js`. |
| `src/data/repo.ts` | Base repository: fetch, save, softDelete. Postgres-first writes. |
| `src/auth/permissions.ts` | `can(key)` backed by the `roles` table. |
| `supabase/migrations/0001_tighten_profiles_select.sql` | RLS fix. |
| `public/js/**` | Existing classic view scripts, moved verbatim in Task 1. |

---

### Task 1: Toolchain and `public/js` move

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Move: `js/` → `public/js/`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm run dev` and a `dist/` that actually loads. Every later task depends on this.

- [ ] **Step 1: Verify the current Node version is the blocker**

Run: `node -v`
Expected: `v14.21.3` — confirming the problem before changing anything.

- [ ] **Step 2: Upgrade Node**

This is a machine-level change, not a repo change. Use whichever is available:

```bash
winget install OpenJS.NodeJS.LTS
```

or with nvm-windows:

```bash
nvm install 22.12.0
nvm use 22.12.0
```

- [ ] **Step 3: Verify the upgrade**

Run: `node -v`
Expected: `v20.19.0` or higher (`v22.x` preferred).

- [ ] **Step 4: Reinstall dependencies against the new Node**

```bash
rm -rf node_modules package-lock.json
npm install
```

Native bindings and the lockfile were resolved under Node 14 and must be rebuilt.

- [ ] **Step 5: Verify the TypeScript binary now launches**

Run: `npm run typecheck`
Expected: completes without `ERR_UNKNOWN_FILE_EXTENSION`. Type errors in `src/` are acceptable at this point; a crash is not.

- [ ] **Step 6: Move the classic scripts into `public/`**

```bash
mkdir -p public
git mv js public/js
```

Vite copies `public/` verbatim to the dist root, so `index.html`'s existing `./js/...` paths resolve unchanged in both dev and build. **Do not edit any `<script src>` paths in `index.html`.**

- [ ] **Step 7: Verify the dev server serves the app**

Run: `npm run dev`
Expected: server starts on `:3000` and the page loads with no 404s for `./js/*.js` in the browser network tab. The app should render the home view exactly as before.

- [ ] **Step 8: Verify the build now produces a loadable dist**

```bash
npm run build
ls dist/js/
```

Expected: `dist/js/` exists and contains `app.core.js`, `admin.js`, `utils.js`, and the `views/` directory. Before this task, `dist/` contained only `index.html` and `assets/`, so every script tag 404'd.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "build: move classic scripts to public/js so Vite emits a loadable dist"
```

---

### Task 2: Vitest setup

**Files:**
- Create: `vitest.config.ts`
- Create: `src/data/cache.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1's working toolchain.
- Produces: `npm test` runs Vitest with a jsdom environment, so later tasks can test `localStorage` code.

- [ ] **Step 1: Install Vitest and jsdom**

```bash
npm install -D vitest jsdom
```

- [ ] **Step 2: Create the Vitest config**

Do not pin a major version: Vite 8 is newer than the Vite range Vitest 3 supports, so let npm resolve the current compatible pair and record the resolved versions in the report.

A separate config file, so the Vite build config stays untouched.

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
});
```

- [ ] **Step 3: Add the test scripts**

In `package.json`, add to `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test proving jsdom gives us localStorage**

```ts
// src/data/cache.test.ts
import { describe, it, expect } from 'vitest';

describe('test environment', () => {
  it('provides a working localStorage', () => {
    localStorage.setItem('probe', 'value');
    expect(localStorage.getItem('probe')).toBe('value');
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: 1 test passes. If `localStorage is not defined`, the `environment: 'jsdom'` setting is not being picked up.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/data/cache.test.ts
git commit -m "test: add Vitest with jsdom environment"
```

---

### Task 3: Versioned cache

**Files:**
- Create: `src/data/cache.ts`
- Modify: `src/data/cache.test.ts`

**Interfaces:**
- Consumes: Task 2's test setup.
- Produces:
  - `readCache<T>(name: string): CacheEntry<T> | null`
  - `writeCache<T>(name: string, rows: T[], fetchedAt: number): void`
  - `backupLegacyBlob(): string | null`
  - `type CacheEntry<T> = { rows: T[]; fetchedAt: number }`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `src/data/cache.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readCache, writeCache, backupLegacyBlob } from './cache';

beforeEach(() => localStorage.clear());

describe('cache', () => {
  it('round-trips rows and fetchedAt', () => {
    writeCache('players', [{ id: 'p1' }], 1000);
    expect(readCache('players')).toEqual({ rows: [{ id: 'p1' }], fetchedAt: 1000 });
  });

  it('returns null for a missing collection', () => {
    expect(readCache('players')).toBeNull();
  });

  it('returns null rather than throwing on corrupt JSON', () => {
    localStorage.setItem('bhs.cache.v1.players', '{not json');
    expect(readCache('players')).toBeNull();
  });

  // Storage access itself can throw, not just parsing — a sandboxed iframe or a
  // browser with site data blocked throws SecurityError from getItem.
  it('returns null rather than throwing when storage access itself fails', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(() => readCache('players')).not.toThrow();
    expect(readCache('players')).toBeNull();
    spy.mockRestore();
  });

  it('writes under a versioned key', () => {
    writeCache('players', [], 1);
    expect(localStorage.getItem('bhs.cache.v1.players')).not.toBeNull();
  });

  it('caches an empty array as a real value, not as absence', () => {
    writeCache('players', [], 500);
    expect(readCache('players')).toEqual({ rows: [], fetchedAt: 500 });
  });

  it('returns null rather than throwing when backup storage access fails', () => {
    localStorage.setItem('bhs_soccer_app_data', '{\"players\":[]}');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(() => backupLegacyBlob()).not.toThrow();
    spy.mockRestore();
    // The blob must survive a failed backup rather than being destroyed.
    expect(localStorage.getItem('bhs_soccer_app_data')).toBe('{\"players\":[]}');
  });

  it('backs up the legacy blob without importing it, and only once', () => {
    localStorage.setItem('bhs_soccer_app_data', '{"players":[]}');
    const key = backupLegacyBlob();
    expect(key).toMatch(/^bhs_soccer_app_data\.backup\./);
    expect(localStorage.getItem(key!)).toBe('{"players":[]}');
    expect(localStorage.getItem('bhs_soccer_app_data')).toBeNull();
    expect(backupLegacyBlob()).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./cache"`.

- [ ] **Step 3: Implement**

```ts
// src/data/cache.ts
const PREFIX = 'bhs.cache.v1.';
const LEGACY_KEY = 'bhs_soccer_app_data';

export type CacheEntry<T> = { rows: T[]; fetchedAt: number };

export function readCache<T>(name: string): CacheEntry<T> | null {
  // getItem must be INSIDE the try: in a sandboxed iframe or a browser with
  // site data blocked, the localStorage accessor itself throws SecurityError —
  // it is not only setItem that can fail. A cache miss is survivable; a throw
  // out of this function would crash the boot path.
  try {
    const raw = localStorage.getItem(PREFIX + name);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    return { rows: parsed.rows as T[], fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

export function writeCache<T>(name: string, rows: T[], fetchedAt: number): void {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify({ rows, fetchedAt }));
  } catch {
    // Quota exceeded or storage disabled. A cache miss is survivable; a crash is not.
  }
}

/**
 * Renames the pre-migration monolithic blob out of the way exactly once.
 * Deliberately does NOT import it: that data is seed-contaminated and
 * re-importing it would re-pollute Postgres. Returns the backup key, or
 * null if there was nothing to back up.
 */
export function backupLegacyBlob(): string | null {
  // Guarded for the same reason as readCache — and it matters more here,
  // because main.ts calls this during boot. If setItem throws (quota), we
  // return before removeItem, so a blob we could not back up is never
  // destroyed.
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw === null) return null;
    const key = `${LEGACY_KEY}.backup.${new Date().toISOString().slice(0, 10)}`;
    localStorage.setItem(key, raw);
    localStorage.removeItem(LEGACY_KEY);
    return key;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/data/cache.ts src/data/cache.test.ts
git commit -m "feat: add versioned collection cache with legacy blob backup"
```

---

### Task 4: Collection state model

**Files:**
- Create: `src/data/store.ts`
- Create: `src/data/store.test.ts`

**Interfaces:**
- Consumes: `CacheEntry<T>` from `src/data/cache.ts`.
- Produces:
  - `type CollectionStatus = 'loading' | 'ready' | 'stale' | 'error'`
  - `interface CollectionState<T> { rows: T[]; status: CollectionStatus; fetchedAt: number | null; error: string | null }`
  - `type FetchResult<T> = { ok: true; rows: T[] } | { ok: false; error: string }`
  - `initialState<T>(): CollectionState<T>`
  - `resolveFetch<T>(args: { result: FetchResult<T>; cached: CacheEntry<T> | null; sessionValid: boolean; now: number }): CollectionState<T>`

This task encodes the two rules the whole design rests on. Test them explicitly.

- [ ] **Step 1: Write the failing tests**

```ts
// src/data/store.test.ts
import { describe, it, expect } from 'vitest';
import { initialState, resolveFetch } from './store';

const cached = { rows: [{ id: 'cached' }], fetchedAt: 100 };

describe('resolveFetch', () => {
  it('starts in loading with no rows', () => {
    expect(initialState()).toEqual({
      rows: [], status: 'loading', fetchedAt: null, error: null,
    });
  });

  it('is ready when rows come back', () => {
    const s = resolveFetch({
      result: { ok: true, rows: [{ id: 'a' }] }, cached, sessionValid: true, now: 200,
    });
    expect(s.status).toBe('ready');
    expect(s.rows).toEqual([{ id: 'a' }]);
    expect(s.fetchedAt).toBe(200);
  });

  // The governing rule: empty is a real answer, not a trigger to fall back.
  it('is ready with zero rows and does NOT fall back to cache', () => {
    const s = resolveFetch({
      result: { ok: true, rows: [] }, cached, sessionValid: true, now: 200,
    });
    expect(s.status).toBe('ready');
    expect(s.rows).toEqual([]);
  });

  // The RLS trap: an expired session is filtered silently to zero rows, not a 403.
  it('is error when empty arrives on an invalid session', () => {
    const s = resolveFetch({
      result: { ok: true, rows: [] }, cached, sessionValid: false, now: 200,
    });
    expect(s.status).toBe('error');
    expect(s.error).toMatch(/session/i);
  });

  it('is stale with cached rows when the fetch fails and a cache exists', () => {
    const s = resolveFetch({
      result: { ok: false, error: 'network down' }, cached, sessionValid: true, now: 200,
    });
    expect(s.status).toBe('stale');
    expect(s.rows).toEqual([{ id: 'cached' }]);
    expect(s.fetchedAt).toBe(100);
    expect(s.error).toBe('network down');
  });

  it('is error with no rows when the fetch fails and there is no cache', () => {
    const s = resolveFetch({
      result: { ok: false, error: 'network down' }, cached: null, sessionValid: true, now: 200,
    });
    expect(s.status).toBe('error');
    expect(s.rows).toEqual([]);
  });

  // Same guard as above, but with no cache present — proves the invalid-session
  // check fires on its own rather than only when cached rows exist to compare against.
  it('is error on an invalid session even when there is no cache to fall back to', () => {
    const s = resolveFetch({
      result: { ok: true, rows: [] }, cached: null, sessionValid: false, now: 200,
    });
    expect(s.status).toBe('error');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./store"`.

- [ ] **Step 3: Implement**

```ts
// src/data/store.ts
import type { CacheEntry } from './cache';

export type CollectionStatus = 'loading' | 'ready' | 'stale' | 'error';

export interface CollectionState<T> {
  rows: T[];
  status: CollectionStatus;
  fetchedAt: number | null;
  error: string | null;
}

// Each variant declares the other's key as optional-undefined. This repo's
// tsconfig sets `strict: false` (so the ported JS typechecks without a
// rewrite), and under `strictNullChecks: false` a boolean-literal discriminant
// does NOT narrow a generic union — `result.error` after `if (result.ok)`
// fails to compile. Declaring both keys on both variants makes the access
// resolve while the discriminant still documents intent. Do not "simplify"
// this back to a bare two-member union, and do not turn on `strict` to make
// it work: that would break the ported supabaseClient code.
export type FetchResult<T> =
  | { ok: true; rows: T[]; error?: undefined }
  | { ok: false; rows?: undefined; error: string };

export function initialState<T>(): CollectionState<T> {
  return { rows: [], status: 'loading', fetchedAt: null, error: null };
}

export function resolveFetch<T>(args: {
  result: FetchResult<T>;
  cached: CacheEntry<T> | null;
  sessionValid: boolean;
  now: number;
}): CollectionState<T> {
  const { result, cached, sessionValid, now } = args;

  if (result.ok) {
    // RLS filters SELECTs silently: an expired session returns 200 with zero
    // rows rather than a 403. Without this guard an expired coach session
    // renders as an empty roster instead of an error.
    if (result.rows.length === 0 && !sessionValid) {
      return {
        rows: [], status: 'error', fetchedAt: null,
        error: 'Your session has expired. Sign in again to load this data.',
      };
    }
    // An empty result on a valid session is a real answer. Never fall back.
    return { rows: result.rows, status: 'ready', fetchedAt: now, error: null };
  }

  if (cached) {
    return {
      rows: cached.rows, status: 'stale',
      fetchedAt: cached.fetchedAt, error: result.error,
    };
  }

  return { rows: [], status: 'error', fetchedAt: null, error: result.error };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: 7 store tests pass, plus the 6 cache tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/store.ts src/data/store.test.ts
git commit -m "feat: add collection state model distinguishing empty, stale and denied"
```

---

### Task 5: Typed Supabase client

**Files:**
- Create: `src/data/supabase.ts`
- Keep (do not delete yet): `supabaseClient.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `supabaseService` — an object structurally compatible with `SupabaseServiceLike` in `src/globals.d.ts`, so it can be assigned to `window.supabaseService`.

This is a port, not a redesign. Preserve every method name and signature; the ~40 existing call sites depend on them.

- [ ] **Step 1: Install the Supabase client as a real dependency**

```bash
npm install @supabase/supabase-js@^2
```

The CDN `<script>` tag in `index.html` currently supplies a `supabase` global. Once this module imports the package directly, that tag is redundant, but leave it for now — `supabaseClient.js` still uses it until Task 7.

- [ ] **Step 2: Port the client factory and credential resolution**

```ts
// src/data/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const FALLBACK_URL = 'https://arsigevpgpbqluqbnhjr.supabase.co';

function resolveUrl(): string {
  return (window as any).ENV_SUPABASE_URL
    || localStorage.getItem('bhs_supabase_url')
    || FALLBACK_URL;
}

// The anon key is designed to be publishable — it ships in every Supabase
// client bundle, and RLS (not secrecy) is what actually protects the data.
// Keep the existing fallback: dropping it would leave the app silently
// disconnected the moment Task 7 deletes supabaseClient.js, degrading to
// localStorage-only — precisely the failure this migration removes.
// Copy the value verbatim from supabaseClient.js.
const FALLBACK_ANON_KEY = '<copy from getSupabaseAnonKey() in supabaseClient.js>';

function resolveKey(): string {
  return (window as any).ENV_SUPABASE_ANON_KEY
    || localStorage.getItem('bhs_supabase_anon_key')
    || FALLBACK_ANON_KEY;
}

let client: SupabaseClient | null = null;

export function initClient(): void {
  const url = resolveUrl();
  const key = resolveKey();
  client = (url.includes('.supabase.co') && key.startsWith('eyJ'))
    ? createClient(url, key)
    : null;
}

export function getClient(): SupabaseClient | null {
  return client;
}

initClient();
```

Credential precedence is unchanged from `supabaseClient.js`: `ENV_SUPABASE_ANON_KEY`, then `localStorage['bhs_supabase_anon_key']` (written by the Admin Center’s "Save Credentials" control), then the committed fallback. Preserving the fallback keeps the app connected across the Task 7 cutover.

- [ ] **Step 3: Port the remaining methods verbatim**

Copy each method from `supabaseClient.js` into a `supabaseService` object export, changing only what typing requires. The full list, which must all be present because `src/globals.d.ts` declares them and call sites use them:

`isConfigured`, `setCredentials`, `signUpUser`, `signInUser`, `signOutUser`, `getSession`, `onAuthStateChange`, `verifyOtp`, `fetchOwnProfile`, `getSchoolUuid`, `upsertProfile`, `approveProfile`, `rejectProfile`, `fetchPendingApprovals`, `testProfileInsert`, `runFullDatabaseDiagnostic`, `fetchPlayers`, `fetchSchedule`, `upsertMatch`, `deleteMatch`, `fetchPracticePlans`, `saveFullPracticePlan`, `savePracticePlanItem`, `upsertPracticePlanItem`, `deletePracticePlanItem`, `fetchSoccerCategories`, `upsertSoccerCategory`, `fetchDrillsBank`, `upsertDrillBankItem`, `deleteDrillBankItem`, `upsertPlayer`, `deletePlayer`, `fetchSchool`, `fetchSchools`, `upsertSchool`, `fetchCoaches`, `upsertCoach`, `deleteCoach`, `fetchDailyThoughts`, `fetchLatestDailyThoughts`, `upsertDailyThought`, `deleteDailyThought`, `setActiveDailyThought`, `saveQuizAttempt`, `fetchQuizResults`.

**Also port the internal helper `isUuid(str)`.** It is not part of the public surface and
`src/globals.d.ts` does not declare it, but nine methods call `this.isUuid(...)` —
`getSchoolUuid`, `upsertMatch`, `savePracticePlanItem`, `upsertSoccerCategory`,
`upsertDrillBankItem`, `upsertPlayer`, `upsertSchool`, `upsertCoach`, and
`saveFullPracticePlan`. Omitting it produces `this.isUuid is not a function` across every
write path. Verify after porting:

```bash
grep -c "isUuid" src/data/supabase.ts
```

Expected: 10 (one definition plus nine call sites).

- [ ] **Step 4: Verify it type-checks**

Run: `npm run typecheck`
Expected: no errors in `src/data/supabase.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/data/supabase.ts package.json package-lock.json
git commit -m "feat: port supabaseClient.js to a typed module"
```

---

### Task 6: Base repository

**Files:**
- Create: `src/data/repo.ts`
- Create: `src/data/repo.test.ts`

**Interfaces:**
- Consumes: `CollectionState`, `resolveFetch`, `initialState` from `./store`; `readCache`, `writeCache` from `./cache`.
- Produces:
  - `interface EntityClient<T> { fetchAll(): Promise<T[]>; upsert(row: T): Promise<T>; softDelete(id: string): Promise<void> }`
  - `class Repository<T extends { id?: string }>` with `state: CollectionState<T>`, `rows: T[]`, `load(sessionValid: boolean): Promise<void>`, `save(row: T): Promise<{ ok: boolean; error?: string }>`, `remove(id: string): Promise<{ ok: boolean; error?: string }>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/data/repo.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Repository, type EntityClient } from './repo';

type Row = { id?: string; name: string };

function clientThat(overrides: Partial<EntityClient<Row>>): EntityClient<Row> {
  return {
    fetchAll: async () => [],
    upsert: async (r) => r,
    softDelete: async () => {},
    ...overrides,
  };
}

beforeEach(() => localStorage.clear());

describe('Repository', () => {
  it('loads rows and caches them', async () => {
    const repo = new Repository<Row>('players', clientThat({
      fetchAll: async () => [{ id: 'a', name: 'Alex' }],
    }));
    await repo.load(true);
    expect(repo.rows).toEqual([{ id: 'a', name: 'Alex' }]);
    expect(repo.state.status).toBe('ready');
    expect(localStorage.getItem('bhs.cache.v1.players')).not.toBeNull();
  });

  it('serves cache as stale when the fetch throws', async () => {
    const seeded = new Repository<Row>('players', clientThat({
      fetchAll: async () => [{ id: 'a', name: 'Alex' }],
    }));
    await seeded.load(true);

    const failing = new Repository<Row>('players', clientThat({
      fetchAll: async () => { throw new Error('offline'); },
    }));
    await failing.load(true);
    expect(failing.state.status).toBe('stale');
    expect(failing.rows).toEqual([{ id: 'a', name: 'Alex' }]);
  });

  it('applies a successful save to local rows', async () => {
    const repo = new Repository<Row>('players', clientThat({
      upsert: async (r) => ({ ...r, id: 'server-id' }),
    }));
    await repo.load(true);
    const res = await repo.save({ name: 'New' });
    expect(res.ok).toBe(true);
    expect(repo.rows).toEqual([{ id: 'server-id', name: 'New' }]);
  });

  // Postgres first, local second: a rejected write must not mutate local state.
  it('leaves local rows untouched when a save fails', async () => {
    const repo = new Repository<Row>('players', clientThat({
      fetchAll: async () => [{ id: 'a', name: 'Alex' }],
      upsert: async () => { throw new Error('permission denied'); },
    }));
    await repo.load(true);
    const res = await repo.save({ name: 'New' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/permission denied/);
    expect(repo.rows).toEqual([{ id: 'a', name: 'Alex' }]);
  });

  it('leaves local rows untouched when a delete fails', async () => {
    const repo = new Repository<Row>('players', clientThat({
      fetchAll: async () => [{ id: 'a', name: 'Alex' }],
      softDelete: async () => { throw new Error('denied'); },
    }));
    await repo.load(true);
    const res = await repo.remove('a');
    expect(res.ok).toBe(false);
    expect(repo.rows).toEqual([{ id: 'a', name: 'Alex' }]);
  });

  it('removes the row locally when the delete succeeds', async () => {
    const repo = new Repository<Row>('players', clientThat({
      fetchAll: async () => [{ id: 'a', name: 'Alex' }],
    }));
    await repo.load(true);
    const res = await repo.remove('a');
    expect(res.ok).toBe(true);
    expect(repo.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./repo"`.

- [ ] **Step 3: Implement**

```ts
// src/data/repo.ts
import { readCache, writeCache } from './cache';
import { initialState, resolveFetch, type CollectionState, type FetchResult } from './store';

export interface EntityClient<T> {
  fetchAll(): Promise<T[]>;
  upsert(row: T): Promise<T>;
  softDelete(id: string): Promise<void>;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class Repository<T extends { id?: string }> {
  state: CollectionState<T>;

  constructor(private name: string, private client: EntityClient<T>) {
    this.state = initialState<T>();
  }

  get rows(): T[] {
    return this.state.rows;
  }

  async load(sessionValid: boolean): Promise<void> {
    const cached = readCache<T>(this.name);
    let result: FetchResult<T>;
    try {
      result = { ok: true, rows: await this.client.fetchAll() };
    } catch (e) {
      result = { ok: false, error: messageOf(e) };
    }
    this.state = resolveFetch<T>({ result, cached, sessionValid, now: Date.now() });
    if (this.state.status === 'ready') {
      writeCache(this.name, this.state.rows, this.state.fetchedAt!);
    }
  }

  /** Postgres first. Local state changes only after the server accepts. */
  async save(row: T): Promise<{ ok: boolean; error?: string }> {
    let saved: T;
    try {
      saved = await this.client.upsert(row);
    } catch (e) {
      return { ok: false, error: messageOf(e) };
    }
    const rows = this.state.rows.slice();
    const idx = rows.findIndex(r => r.id !== undefined && r.id === saved.id);
    if (idx === -1) rows.push(saved); else rows[idx] = saved;
    this.commit(rows);
    return { ok: true };
  }

  async remove(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.softDelete(id);
    } catch (e) {
      return { ok: false, error: messageOf(e) };
    }
    this.commit(this.state.rows.filter(r => r.id !== id));
    return { ok: true };
  }

  private commit(rows: T[]): void {
    this.state = { ...this.state, rows };
    if (this.state.fetchedAt !== null) {
      writeCache(this.name, rows, this.state.fetchedAt);
    }
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: 6 repo tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/data/repo.ts src/data/repo.test.ts
git commit -m "feat: add base repository with Postgres-first writes"
```

---

### Task 7: Module entry point

**Files:**
- Create: `src/main.ts`
- Modify: `index.html:1161-1166`
- Delete: `supabaseClient.js`

**Interfaces:**
- Consumes: `supabaseService` from `./data/supabase`.
- Produces: `window.supabaseService` installed from the module. `window.auth` is **not** touched in this task — `auth.js` still owns it.

The deliverable is that the app behaves identically while the client comes from a module. Auth is deliberately left alone so this task is independently reviewable.

- [ ] **Step 1: Write the entry point**

```ts
// src/main.ts
import { supabaseService } from './data/supabase';

declare global {
  interface Window { supabaseService?: typeof supabaseService }
}

window.supabaseService = supabaseService;
```

- [ ] **Step 2: Wire it into the page and drop the replaced scripts**

In `index.html`, replace lines 1161–1166:

```html
  <!-- Scripts -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
  <script src="./supabaseClient.js"></script>
  <script src="./auth.js"></script>
```

with:

```html
  <!-- Scripts -->
  <script type="module" src="./src/main.ts"></script>
  <script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
  <script src="./auth.js"></script>
```

The Supabase CDN tag goes because the module now imports the package. The SheetJS and JSZip tags stay — `admin.js` still uses those globals.

- [ ] **Step 3: Delete the replaced client**

```bash
git rm supabaseClient.js
```

- [ ] **Step 4: Verify boot order in the browser**

Run: `npm run dev`, then in the browser console:

```js
typeof window.supabaseService
```

Expected: `"object"`. Also confirm no console error of the form `supabaseService is not defined` during load. This proves module scripts run before `DOMContentLoaded`, which is when `js/utils.js` constructs the app.

- [ ] **Step 5: Verify the app still works end to end**

In the browser: the home view renders, the roster loads, and the Admin Center opens. Behaviour must be indistinguishable from before.

- [ ] **Step 6: Commit**

```bash
git add index.html src/main.ts
git commit -m "feat: install supabaseService from a module entry point"
```

---

### Task 8: Make the five auth entry points await-ready

**Files:**
- Modify: `public/js/views/coaches.view.js:73-167`

**Interfaces:**
- Consumes: nothing new.
- Produces: `handleSignIn`, `handleRegister`, `handleVerifyOtp`, `approveUserAccess`, `rejectUserAccess` become `async`.

`await` on a non-Promise returns the value unchanged, so these edits are safe while `auth.js` is still synchronous. That is what makes this task shippable on its own.

- [ ] **Step 1: Make `handleSignIn` async**

At `public/js/views/coaches.view.js:73`, change the declaration and the call:

```js
  async handleSignIn() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const feedback = document.getElementById('authFormFeedback');

    const res = await window.auth.loginUser(email, password);
```

Leave the rest of the body unchanged.

- [ ] **Step 2: Make the caller await it**

At `public/js/views/coaches.view.js:70`, the enclosing handler calls `this.handleSignIn();`. Change to:

```js
    await this.handleSignIn();
```

and mark its enclosing method `async`. If the enclosing method is invoked from an inline `onclick`, no further change is needed — a returned Promise is discarded harmlessly there.

- [ ] **Step 3: Apply the same change to the remaining four**

```js
  async handleRegister() {
    // ...
    const res = await window.auth.registerUser({ name, email, password, role });
```

```js
  async handleVerifyOtp() {
    // ...
    const res = await window.auth.verifyUserOtp(email, code);
```

```js
  async approveUserAccess(userId) {
    const ok = await window.auth.approveUserAccess(userId);
```

```js
  async rejectUserAccess(userId) {
    const ok = await window.auth.rejectUserAccess(userId);
```

- [ ] **Step 4: Verify nothing regressed**

Run: `npm run dev`. Sign in with a sample user from `auth.js` (`headcoach@beaumont.edu`). Expected: the welcome alert appears and the view re-renders — identical behaviour to before, now through an async path.

- [ ] **Step 5: Commit**

```bash
git add public/js/views/coaches.view.js
git commit -m "refactor: make auth entry points await-ready ahead of the async cutover"
```

---

### Task 9: Move pending approvals out of the render template

**Files:**
- Modify: `public/js/admin.js:200-216`
- Modify: `public/js/admin.js:749` (`openAdminModal`)
- Modify: `public/js/views/coaches.view.js` (`approveUserAccess`, `rejectUserAccess`) — the refresh paths live here, not in `admin.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `app._pendingApprovals` — an array populated before render. `renderAdminModalContent()` stays synchronous.

`renderAdminModalContent()` builds an HTML string synchronously and calls `window.auth.getPendingApprovals()` three times inside it. Once that method is async it returns a Promise, and `.length` becomes `undefined` with `.map` throwing. Awaiting inside a template literal is not possible, so the data must be fetched before render.

- [ ] **Step 1: Fetch before rendering**

At `public/js/admin.js:749`, change `openAdminModal`:

```js
  async openAdminModal() {
    this._pendingApprovals = (await window.auth.getPendingApprovals()) || [];
    this.renderAdminModalContent();
    const modal = document.getElementById('adminModal');
    if (modal) { modal.style.display = ''; modal.classList.add('active'); }
  },
```

Keep whatever modal-opening lines already exist; only the first line is new.

- [ ] **Step 2: Read from the pre-fetched array in the template**

At `public/js/admin.js:200-216`, replace the three `window.auth.getPendingApprovals()` calls with `pending`, declared once at the top of `renderAdminModalContent()`:

```js
    const pending = this._pendingApprovals || [];
```

```html
            <span class="badge badge-gold">${pending.length} REQUESTS</span>
```

```js
            ${pending.length === 0 ? `
```

```js
                ${pending.map(p => `
```

- [ ] **Step 3: Refresh after an approval decision**

The two call sites that re-render after an approval decision are **not in `admin.js`** — they are
`approveUserAccess` and `rejectUserAccess` in `public/js/views/coaches.view.js`. Both are already
`async`. Change the bare render call in each:

```js
  async approveUserAccess(userId) {
    const ok = await window.auth.approveUserAccess(userId);
    if (ok) {
      this.updateAuthUI();
      this.renderCurrentView();
      await this.openAdminModal();
      alert('🎉 User access approved successfully!');
    }
  },

  async rejectUserAccess(userId) {
    const ok = await window.auth.rejectUserAccess(userId);
    if (ok) {
      await this.openAdminModal();
      alert('User request rejected.');
    }
  }
```

Without this, pre-fetching is a regression rather than a refactor: before this task the template
called `getPendingApprovals()` live during render, so re-rendering after an approve fetched fresh
data. Reading a stale pre-fetched field instead leaves the actioned user sitting in the queue
until the modal is closed and reopened.

Change only these two render calls. Do not blanket-replace other `renderAdminModalContent()`
calls elsewhere in the file.

- [ ] **Step 4: Verify**

Run: `npm run dev`. Open the Admin Center as the coach sample user. Expected: the "Pending User Approval Queue" accordion shows the same count and entries as before.

- [ ] **Step 5: Commit**

```bash
git add public/js/admin.js
git commit -m "refactor: pre-fetch pending approvals so admin render stays synchronous"
```

---

### Task 10: Replace inline logout handlers

**Files:**
- Modify: `public/js/admin.js:88`, `public/js/admin.js:128`
- Modify: `public/js/admin.js` (add `handleSignOut`)

**Interfaces:**
- Produces: `app.handleSignOut()` — async; used by both sign-out buttons.

`onclick="window.auth.logout(); app.updateAuthUI(); app.renderCurrentView(); app.closeModals();"` runs the three follow-up calls immediately. Once `logout()` is async they execute before the session is actually cleared, leaving the UI showing a signed-in state.

- [ ] **Step 1: Add the handler**

Add to the `Object.assign(BHSSoccerApp.prototype, {...})` block in `public/js/admin.js`:

```js
  async handleSignOut() {
    await window.auth.logout();
    this.updateAuthUI();
    this.renderCurrentView();
    this.closeModals();
  },
```

- [ ] **Step 2: Point both buttons at it**

At `public/js/admin.js:88`:

```html
        <button class="btn btn-secondary" onclick="app.handleSignOut()">🚪 Sign Out</button>
```

At `public/js/admin.js:128`:

```html
        ${!isGuest ? `<button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="app.handleSignOut()">🚪 Sign Out</button>` : `<span class="badge badge-gold">PUBLIC ACCESS</span>`}
```

- [ ] **Step 3: Verify**

Run: `npm run dev`. Sign in, then sign out from both buttons. Expected: the header returns to the guest state and restricted tabs become locked.

- [ ] **Step 4: Commit**

```bash
git add public/js/admin.js
git commit -m "refactor: route sign-out through an async handler"
```

---

### Task 11: Remove the role switcher and the fake self-test

**Files:**
- Modify: `public/js/admin.js:106-152` (remove `sampleUsers` and the switcher accordion)
- Modify: `public/js/admin.js:742-747` (remove `switchUserRole`)
- Modify: `public/js/admin.js:365-405` (remove the fake registration self-test)
- Modify: `public/js/utils.js:129-137` (remove the dead `.role-switch-card` listener)

**Interfaces:**
- Removes: `app.switchUserRole`, `window.auth.switchRole` usage.

Real auth has no `switchRole`, and it cannot be added: `guard_profile_privileged_columns` raises an exception on any self-service role change. The self-test at `admin.js:372-399` chains `registerUser` → `verifyUserOtp` → `getPendingApprovals` → `approveUserAccess` → `loginUser`; against real Supabase Auth it would create genuine `auth.users` rows on every run.

- [ ] **Step 1: Remove the switcher UI**

Delete the `sampleUsers` array declared at `public/js/admin.js:108` and the entire "Section 1: Active User Role Switcher" `<details>` block at lines 130–152. Replace the section with a read-only display of the current account:

```js
      <!-- Section 1: Active User Account -->
      <details class="admin-accordion">
        <summary class="admin-accordion-summary">
          <span>🔑 ACTIVE USER ACCOUNT</span>
          <span class="badge badge-gold">${currentUser.name} (${currentUser.role.toUpperCase()})</span>
        </summary>
        <div class="admin-accordion-content">
          <p class="text-muted" style="font-size: 0.85rem; margin: 0;">
            Signed in as <strong style="color:#FFF;">${currentUser.email}</strong>.
            Roles are assigned by an administrator and cannot be changed from this panel.
          </p>
        </div>
      </details>
```

- [ ] **Step 2: Remove the method**

Delete `switchUserRole` at `public/js/admin.js:742-747` entirely.

- [ ] **Step 3: Remove the dead listener**

At `public/js/utils.js:129-137`, `attachDynamicListeners` binds `.role-switch-card`, a class that no longer appears anywhere in `index.html`. Replace the method body:

```js
  attachDynamicListeners() {
    // No dynamic listeners at present. Retained because renderCurrentView()
    // calls this after every view swap.
  },
```

- [ ] **Step 4: Remove the fake registration self-test**

Delete the block at `public/js/admin.js:365-405` that chains `registerUser`, `verifyUserOtp`, `getPendingApprovals`, `approveUserAccess` and `loginUser`, along with the button that invokes it. The live database diagnostic (`runLiveDatabaseTest`) stays.

- [ ] **Step 5: Verify no references remain**

Run: `grep -rn "switchRole\|switchUserRole\|role-switch-card\|sampleUsers" public/js/ index.html`
Expected: no output.

- [ ] **Step 6: Verify the app still runs**

Run: `npm run dev`. Open the Admin Center. Expected: the account section renders read-only, and no console errors.

- [ ] **Step 7: Commit**

```bash
git add public/js/admin.js public/js/utils.js
git commit -m "refactor: remove demo role switcher and fake registration self-test"
```

---

### Task 12: Swap in real Supabase Auth

**Files:**
- Modify: `src/main.ts`
- Modify: `public/js/app.core.js:39` (`init`)
- Delete: `auth.js`
- Modify: `index.html` (drop the `auth.js` tag)

**Interfaces:**
- Consumes: `auth` from `src/auth.ts`; all await-ready call sites from Tasks 8–11.
- Produces: `window.auth` is the real `AuthManager`; `window.authReady` is a Promise that resolves once the session is restored.

Every call site was made await-ready in the previous four tasks, so this is a flip rather than a rewrite.

- [ ] **Step 1: Install the real auth manager**

```ts
// src/main.ts
import { supabaseService } from './data/supabase';
import { auth } from './auth';

// src/globals.d.ts ALREADY declares `Window.supabaseService`. Re-declaring it
// here is a TS2717 duplicate-property conflict, not a redundancy the compiler
// tolerates — Task 7 hit exactly this. Declare only the globals this file adds.
declare global {
  interface Window {
    auth: typeof auth;
    authReady: Promise<void>;
  }
}

window.supabaseService = supabaseService;
window.auth = auth;

// Start session restoration immediately, but expose it as a Promise rather
// than blocking module evaluation with a top-level await. Whether top-level
// await delays DOMContentLoaded is subtle enough that the app should not
// depend on it — app.core.js awaits this explicitly instead.
window.authReady = auth.init();
```

- [ ] **Step 2: Harden the credential getters against blocked storage**

`src/data/supabase.ts` calls `initSupabaseClient()` at module-evaluation time, and its two
credential getters read `localStorage` unguarded:

```ts
function getSupabaseUrl(): string {
  return (window as any).ENV_SUPABASE_URL
    || localStorage.getItem('bhs_supabase_url')
    || '...';
}
```

This was faithfully ported from `supabaseClient.js` and is not a regression — but its
consequence changes here. A classic script that throws kills only itself; a **module** that
throws during evaluation never assigns any of its globals. Once `window.auth` and
`window.authReady` come from this module graph, a `SecurityError` from blocked site data
(sandboxed iframe, browser privacy settings) stops being "no database" and becomes "no app":
every `window.auth.*` call site throws.

Wrap the storage read in each getter, preserving the precedence order exactly:

```ts
function readStoredCredential(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getSupabaseUrl(): string {
  return (window as any).ENV_SUPABASE_URL
    || readStoredCredential('bhs_supabase_url')
    || 'https://arsigevpgpbqluqbnhjr.supabase.co';
}
```

Apply the same change to `getSupabaseAnonKey()`, leaving its fallback key untouched.

- [ ] **Step 3: Await the session before the first render**

`auth.init()` restores the session asynchronously. Without this, the first `updateAuthUI()` and `renderCurrentView()` run against a guest session and a signed-in user briefly sees the public view.

In `public/js/app.core.js`, at the top of `init()` (line 39), add the await before the existing `subscribe` call:

```js
  async init() {
    await window.authReady;

    window.auth.subscribe(() => {
      this.updateAuthUI();
      this.renderCurrentView();
    });
```

Leave the remainder of `init()` unchanged.

- [ ] **Step 4: Remove the fake implementation**

```bash
git rm auth.js
```

In `index.html`, delete the `<script src="./auth.js"></script>` line.

- [ ] **Step 5: Remove the demo OTP banner**

The fake auth returned a verification code to the client, and the UI displayed it. Real
Supabase Auth emails the code instead: `AppUser` has no `verificationCode` field and
`RegisterResult` has no `otpCode`, so both call sites now pass `undefined`. It fails soft
rather than throwing — but the banner it feeds reads *"DEMO VERIFICATION OTP CODE: … (or
enter 123456)"*, which would instruct real users to enter a code Supabase will reject.

In `public/js/views/coaches.view.js`, drop the unused second argument at both call sites
(in `handleSignIn` and `handleRegister`, originally lines 86 and 103 — locate by symbol):

```js
        this.openVerifyTab(res.user.email);
```

```js
        this.openVerifyTab(email);
```

and simplify `openVerifyTab` to tell the user where the code actually came from:

```js
  openVerifyTab(email) {
    this.switchAuthTab('verify');
    this.pendingVerifyEmail = email;
    const targetEl = document.getElementById('verifyTargetEmail');
    const bannerEl = document.getElementById('simulatedCodeBanner');
    if (targetEl) targetEl.textContent = email;
    if (bannerEl) {
      bannerEl.textContent = 'We emailed you a 6-digit verification code. Enter it below.';
    }
  },
```

Verify no demo-code path survives:

Run: `grep -rn "otpCode\|verificationCode\|123456" public/js/`
Expected: no output. (`admin.js`'s uses were deleted with the fake self-test in Task 11.)

- [ ] **Step 6: Verify no call site was missed**

Run: `grep -rn "window\.auth\." public/js/ index.html | grep -v "await\|async"`

Inspect each hit. Getters (`getCurrentUser`, `getRole`, `isCoach`, `isAdmin`, `canAccessRatings`, `isLoggedIn`, `subscribe`) are synchronous in `src/auth.ts` and correctly appear here. Any of the seven async methods appearing without `await` is a bug from Tasks 8–10.

- [ ] **Step 7: Verify sign-in against the real database**

Run: `npm run dev`. Sign in with the existing `admin`/`active` account (use Supabase password reset if the credential is unknown).
Expected: the header shows the admin role, and restricted tabs unlock. A wrong password must now be rejected — the fake implementation accepted any password, so verify this explicitly.

- [ ] **Step 8: Verify the guest path**

Sign out. Expected: the roster and schedule still render for an anonymous visitor; matrix and planner show the restricted-access guard.

- [ ] **Step 9: Commit**

```bash
git add index.html src/main.ts src/data/supabase.ts public/js/app.core.js public/js/views/coaches.view.js
git commit -m "feat: replace fake client-side auth with real Supabase Auth"
```

---

### Task 13: Permissions from the roles table

**Files:**
- Create: `src/auth/permissions.ts`
- Create: `src/auth/permissions.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `supabaseService` from `../data/supabase`; `auth` from `../auth`; `window.authReady` from Task 12.
- Adds: `supabaseService.fetchRoles()` — a new method on the ported client (see Step 5).
- Produces:
  - `type PermissionKey` — the 15 keys present in `roles.permissions`
  - `loadRoles(): Promise<void>`
  - `can(key: PermissionKey): boolean`
  - `window.can` — installed for use from view template strings

The four role names stay hardcoded in RLS as the enforcement backstop; this drives UI affordances only.

- [ ] **Step 1: Write the failing tests**

```ts
// src/auth/permissions.test.ts
import { describe, it, expect } from 'vitest';
import { canFor } from './permissions';

const roles = [
  { name: 'coach', permissions: { can_modify_roster: true, can_manage_schools: false } },
  { name: 'guest', permissions: { can_modify_roster: false, can_manage_schools: false } },
];

describe('canFor', () => {
  it('grants a permission the role has', () => {
    expect(canFor(roles, 'coach', 'can_modify_roster')).toBe(true);
  });

  it('denies a permission the role lacks', () => {
    expect(canFor(roles, 'coach', 'can_manage_schools')).toBe(false);
  });

  it('denies everything for an unknown role', () => {
    expect(canFor(roles, 'nobody', 'can_modify_roster')).toBe(false);
  });

  it('denies when the roles table has not loaded, rather than granting', () => {
    expect(canFor([], 'coach', 'can_modify_roster')).toBe(false);
  });
});
```

The last test matters: an empty roles collection must fail closed.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./permissions"`.

- [ ] **Step 3: Implement**

```ts
// src/auth/permissions.ts
import { auth } from '../auth';

export type PermissionKey =
  | 'can_view_roster' | 'can_modify_roster'
  | 'can_view_schedule' | 'can_modify_schedule'
  | 'can_view_ratings' | 'can_modify_ratings'
  | 'can_view_planner' | 'can_modify_planner'
  | 'can_view_coaches' | 'can_modify_coaches'
  | 'can_manage_users' | 'can_manage_roles' | 'can_manage_schools'
  | 'can_import_export' | 'can_access_admin_dashboard';

export interface RoleRow {
  name: string;
  permissions: Partial<Record<PermissionKey, boolean>>;
}

/** Pure form, for testing. Fails closed on unknown role or unloaded table. */
export function canFor(roles: RoleRow[], roleName: string, key: PermissionKey): boolean {
  const role = roles.find(r => r.name === roleName);
  return role ? role.permissions[key] === true : false;
}

let loaded: RoleRow[] = [];

export function setRoles(rows: RoleRow[]): void {
  loaded = rows;
}

export function can(key: PermissionKey): boolean {
  return canFor(loaded, auth.getRole(), key);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: 4 permission tests pass.

- [ ] **Step 5: Load roles at boot and expose `can`**

Roles gate UI affordances, so they must be loaded before the first render. Chain the
load onto `window.authReady` — which `app.core.js` already awaits — rather than
introducing a top-level `await`, which the Global Constraints forbid.

In `src/main.ts`, replace the `window.authReady = auth.init();` line from Task 12 with:

The ported client does **not** export a raw `getClient` accessor — it exposes only the
`supabaseService` instance, and every other collection is read through a method on it. Follow
that pattern rather than breaking the encapsulation: add a `fetchRoles()` method to
`src/data/supabase.ts`, beside the other fetchers, matching their existing idiom exactly
(guard on `isConfigured()`, `console.warn` and return `null` on error):

```ts
  async fetchRoles(): Promise<Array<{ name: string; permissions: Record<string, boolean> }> | null> {
    if (!this.isConfigured()) return null;
    try {
      const { data, error } = await this.client.from('roles').select('name,permissions');
      if (error) {
        console.warn('Supabase fetchRoles notice:', error.message);
        return null;
      }
      return data;
    } catch (e) {
      console.warn('Supabase fetchRoles exception:', e);
      return null;
    }
  }
```

Then in `src/main.ts`, extend the existing `window.authReady` chain. **Task 12's fix round
already attached a `.catch()` to it**, and the order matters: the `.then()` must come *before*
the `.catch()`, so that a roles-load failure is caught too. If you append `.then()` after the
existing `.catch()`, a rejected `fetchRoles()` would reject `window.authReady` — and because
`app.core.js` awaits that promise above `bindEvents()` and `renderCurrentView()`, the app would
render a static shell with no event handlers. That is the exact bug Task 12's `.catch()` was
added to prevent; do not reintroduce it through the back door.

```ts
import { supabaseService } from './data/supabase';
import { can, setRoles, type RoleRow } from './auth/permissions';

window.authReady = auth.init()
  .then(async () => {
    const rows = await supabaseService.fetchRoles();
    setRoles((rows as RoleRow[]) ?? []);
  })
  .catch((err) => {
    console.error('Auth initialisation failed; continuing as guest.', err);
  });

window.can = can;
```

`fetchRoles()` returns `null` rather than throwing when the client is unconfigured, and
`canFor` fails closed on an empty roles list, so an unreachable database denies permissions
rather than granting them.

Add `can: typeof can` to the `Window` interface declaration.

Also add `fetchRoles` to the `SupabaseServiceLike` interface in `src/globals.d.ts`, so the
declared shape keeps matching the real one.

Note that `setRoles` failing to run leaves the roles list empty, and `canFor` fails
closed — a load failure denies permissions rather than granting them.

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev`, then in the console while signed in as the admin:

```js
window.can('can_manage_schools')   // true
window.can('can_modify_roster')    // true
```

Sign out and re-check: both must be `false` for a guest.

- [ ] **Step 7: Commit**

```bash
git add src/auth/permissions.ts src/auth/permissions.test.ts src/main.ts
git commit -m "feat: drive UI permissions from the roles table"
```

---

### Task 14: Tighten the profiles select policy

**Files:**
- Create: `supabase/migrations/0001_tighten_profiles_select.sql`

**Interfaces:**
- Consumes: nothing in code.
- Produces: anonymous visitors can no longer read every profile row.

`profiles_select` is currently `using (is_deleted = false)` with no further restriction, so any anonymous visitor can read every profile including email and role.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0001_tighten_profiles_select.sql
--
-- profiles_select previously allowed any anon caller to read every profile
-- row, including email and role. Restrict to self plus coach/admin, which is
-- all the approval queue needs. Nothing public reads profiles.
--
-- Rollback:
--   drop policy if exists "profiles_select" on public.profiles;
--   create policy "profiles_select" on public.profiles
--     for select using (is_deleted = false);

drop policy if exists "profiles_select" on public.profiles;

create policy "profiles_select" on public.profiles
  for select using (
    is_deleted = false
    and (
      id = auth.uid()
      or public.current_profile_role() in ('coach', 'admin')
    )
  );
```

- [ ] **Step 2: Apply it**

Paste the file into the Supabase SQL editor and run it.

- [ ] **Step 3: Verify anonymous access is closed**

```bash
curl -s -H "apikey: $ANON_KEY" \
  "https://arsigevpgpbqluqbnhjr.supabase.co/rest/v1/profiles?select=id"
```

Expected: `[]`. Before the migration this returned both profile rows.

- [ ] **Step 4: Verify the approval queue still works**

Run: `npm run dev`. Sign in as the admin and open the Admin Center.
Expected: the pending approval queue still lists the `pending_verification` profile. If it is empty, `current_profile_role()` is not resolving — check that the signed-in profile's `role` column is `admin`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_tighten_profiles_select.sql
git commit -m "fix: restrict profiles select to self and coach/admin"
```

---

### Task 15: Remove seed data and make the cache authoritative

**Files:**
- Modify: `public/js/app.core.js:15-38` (`loadData`, `saveData`)
- Modify: `public/js/data.js` (delete `DEFAULT_BHS_DATA` contents)
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `backupLegacyBlob` from `./data/cache`.
- Produces: `app.data` no longer contains seed rows. Collections start empty and are filled by `syncFromSupabase()`.

This is the change that fixes the live `daily_thoughts` bug: the table has zero rows in Postgres, but every browser renders the hardcoded seed thought because `loadData()` substitutes `DEFAULT_BHS_DATA` whenever a collection is empty.

- [ ] **Step 1: Back up the legacy blob at boot**

In `src/main.ts`, before `auth.init()`:

```ts
import { backupLegacyBlob } from './data/cache';

const backedUp = backupLegacyBlob();
if (backedUp) {
  console.info(`Legacy local data preserved at "${backedUp}". Postgres is now authoritative.`);
}
```

- [ ] **Step 2: Strip the seed substitution from `loadData`**

Replace `loadData()` at `public/js/app.core.js:15-33` with:

```js
  loadData() {
    return {
      school: null,
      schools: [],
      players: [],
      schedule: [],
      drillsBank: [],
      currentPracticePlan: [],
      savedPlans: [],
      activePlanName: '',
      coaches: [],
      dailyThoughts: [],
      soccerCategories: [],
    };
  }
```

Every `if (!data.X || data.X.length === 0) data.X = DEFAULT_BHS_DATA.X` line is deleted. That pattern is the bug.

- [ ] **Step 3: Empty the seed module**

Replace the contents of `public/js/data.js` with:

```js
/**
 * Seed data was removed when Postgres became the source of truth.
 * This file is retained only because index.html loads it by path;
 * the empty object keeps any stale reference from throwing.
 */
const DEFAULT_BHS_DATA = {};
```

- [ ] **Step 4: Guard the null school**

`loadData()` now returns `school: null`, and views read `this.data.school.name`. Run:

```bash
grep -rn "data\.school\." public/js/
```

Add optional chaining (`this.data.school?.name`) at each hit, with a literal fallback where the value is interpolated into HTML, for example `${this.data.school?.name || 'Loading…'}`.

- [ ] **Step 5: Fix the surviving `DEFAULT_BHS_DATA` fallbacks**

Emptying the seed object in Step 3 turns `DEFAULT_BHS_DATA.school` into `undefined`, which
the previous step's grep does **not** catch. Three sites in `public/js/views/planner.view.js`
use it as a fallback and will silently produce `undefined` or `[null]`:

```bash
grep -rn "DEFAULT_BHS_DATA" public/js/
```

Expected hits: `planner.view.js` at the `getSchoolsList`, `fillSchoolFormFields` and
`updateHeaderBranding` methods (originally lines 754, 831 and 968 — locate by symbol, the
line numbers will have shifted).

Rewrite each to drop the seed fallback and handle absence honestly:

```js
    // getSchoolsList
    this.data.schools = this.data.school ? [this.data.school] : [];
```

```js
    // fillSchoolFormFields
    const sData = schoolData || this.data.school;
    if (!sData) return;
```

```js
    // updateHeaderBranding
    const school = this.data.school;
    if (!school) return;
```

Verify none remain outside the seed module itself:

Run: `grep -rn "DEFAULT_BHS_DATA" public/js/ | grep -v "public/js/data.js"`
Expected: no output.

- [ ] **Step 6: Verify empty state rather than seed data**

Clear site data in the browser, then run `npm run dev` with valid Supabase credentials configured.
Expected: roster, schedule and drills populate from Postgres. The "Coach's Daily Thoughts" section renders an **empty state**, not the hardcoded "Coach Bob Miller" thought — that table genuinely has zero rows, and this is the fix landing.

- [ ] **Step 7: Verify the offline path**

Load the app once with a connection, then stop the network and reload.
Expected: cached rows still render, the staleness indicator appears, and no seed data appears for `daily_thoughts`.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add public/js/app.core.js public/js/data.js src/main.ts
git commit -m "feat: remove seed data so Postgres is the only source of truth"
```

---

## Self-Review

**Spec coverage.** Phase 0 → Tasks 1–2. Phase 1: module boundary → Task 7; `supabaseClient.js` port → Task 5; store and repository layer → Tasks 3, 4, 6; `auth.js` deletion and the 15 sync→async sites → Tasks 8–12; `switchRole` removal → Task 11; `permissions.ts` → Task 13; `profiles_select` RLS → Task 14; `DEFAULT_BHS_DATA` removal → Task 15. Phases 2–4 are excluded by scope.

**Two spec items deliberately deferred, and why.** The staleness banner and app-wide write-disable are specified but have no task here: they are UI affordances over `CollectionState.status`, and no view consumes the store until Phase 2. Task 15 Step 6 verifies the underlying `stale` state resolves correctly. The per-entity repositories in `src/data/repos/` are likewise Phase 2 — Task 6 delivers the base class they extend.

**Interface consistency.** `CollectionState`, `FetchResult` and `CacheEntry` are defined in Tasks 3–4 and consumed unchanged in Task 6. `Repository.save()` and `Repository.remove()` both return `{ ok, error? }`. `canFor` is the pure tested form; `can` is the bound wrapper.
