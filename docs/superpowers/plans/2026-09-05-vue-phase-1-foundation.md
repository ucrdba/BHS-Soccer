# Vue Migration Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Vue application shell alongside the legacy app, and build the Home view through it end to end.

**Architecture:** A second HTML entry point (`app.html` → `src/vue-main.ts` → `src/App.vue`) so the two apps never share a document. Vue Router owns the seven nav routes; Pinia holds auth, the active organization and its theme; components are templates over the framework-free modules Phase 0 produced.

**Tech Stack:** Vue 3 (`<script setup>`, Composition API), Vue Router, Pinia, `@vitejs/plugin-vue`, `vue-tsc`, `@vue/test-utils`, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-09-05-vue-phase-1-foundation-design.md`

**Baseline entering this plan:** 1,924 tests across 93 files, all four gates green, at commit `c0b73fa`.

## Global Constraints

- **`index.html`, `public/js/`, and `app.js` are not touched.** Deletion is Phase 7. If a task seems to need a change there, stop and report it.
- **Never resolve an organization by a `'bhs'` literal.** It comes from the active team, or the signed-in profile's `school_id`. Club coaches outside Beaumont use this application, so a hardcoded school code is a bug waiting for its second tenant.
- **Never hardcode branding.** Name, mascot and colours come from the `schools` row. `schools.colors` is a JSONB `{ primary, secondary }`.
- `tsconfig.json` stays loose — `strict: false`, `noImplicitAny: false`. Do not tighten it.
- `.at()` is unavailable at this `lib` target; index from `length - 1`.
- Conventional Commits.
- Four gates on every commit: `npm test`, `npm run typecheck`, `npm run build`, and `powershell -File check_syntax.ps1`.
- **Check real exit codes.** `npm run typecheck | tail` returns *tail's* status, not the command's — that masked a failing typecheck once in Phase 0. Run the command bare, or check `$?` on the command itself.

---

### Task 1: The toolchain and the second entry point

Nothing renders yet. This task's deliverable is that `npm run build` emits two HTML files and `npm run typecheck` runs `vue-tsc`.

**Files:**
- Create: `app.html`, `src/vue-main.ts`, `src/App.vue`
- Modify: `package.json`, `vite.config.ts`, `src/vite-env.d.ts`, `vitest.config.mts`

- [ ] **Step 1: Install the dependencies**

```bash
npm install vue vue-router pinia
npm install -D @vitejs/plugin-vue vue-tsc @vue/test-utils @pinia/testing
```

- [ ] **Step 2: Register the Vue plugin and the second rollup input**

In `vite.config.ts`, import the plugin and add it to `plugins`, keeping the existing `build-stamp` plugin:

```ts
import vue from '@vitejs/plugin-vue';
```

```ts
  plugins: [
    vue(),
    {
      name: 'build-stamp',
      // ...unchanged
    }
  ],
```

And replace the single input with both entries:

```ts
  build: {
    outDir: 'dist',
    rollupOptions: {
      // Two apps, deliberately. index.html is the legacy app and is untouched
      // until Phase 7; app.html is the Vue rebuild. Sharing one document would
      // reintroduce exactly the bridge code the parallel rebuild avoids.
      input: {
        legacy: 'index.html',
        vue: 'app.html'
      }
    },
  },
```

- [ ] **Step 3: Switch typechecking to `vue-tsc`**

In `package.json`, `tsc --noEmit` cannot see inside a `.vue` file, so both scripts change:

```json
    "build": "vue-tsc --noEmit && vite build",
    "typecheck": "vue-tsc --noEmit",
```

- [ ] **Step 4: Teach TypeScript and Vitest about `.vue` files**

Append to `src/vite-env.d.ts`:

```ts
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
```

In `vitest.config.mts`, the config must load the Vue plugin or component tests cannot compile, and the include pattern must reach `.vue` test files:

```ts
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
    css: true,
  },
});
```

- [ ] **Step 5: Write the entry point**

`app.html`, deliberately minimal — the shell is a component, not markup:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cougars Soccer</title>
  <link rel="stylesheet" href="./index.css">
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <div id="vue-app"></div>
  <script type="module" src="/src/vue-main.ts"></script>
</body>
</html>
```

`src/vue-main.ts`:

```ts
/**
 * The Vue application's entry point.
 *
 * Deliberately separate from src/main.ts, which wires the legacy app. The two
 * share src/domain/, src/data/ and src/auth.ts, and nothing else: they never
 * run in the same document.
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { auth } from './auth';
import { supabaseService } from './data/supabase';
import { can, setRoles, type RoleRow } from './auth/permissions';

// The classic scripts reach these through window; the Vue tree imports them
// directly, so nothing is published here.
const app = createApp(App);
app.use(createPinia());
app.use(router);

/**
 * Session restoration before the first render.
 *
 * The legacy app exposes this as `window.authReady` and awaits it in
 * app.core.js. Here the mount simply waits, so no route guard can run against
 * a session that has not loaded and bounce a signed-in coach to the home page.
 */
async function boot() {
  try {
    await supabaseService.completeEmailLink();
  } catch (err) {
    console.warn('Email link completion notice:', err);
  }
  try {
    await auth.init();
    const rows = await supabaseService.fetchRoles();
    setRoles((rows as RoleRow[]) ?? []);
  } catch (err) {
    console.error('Auth initialisation failed; continuing as guest.', err);
  }
  app.mount('#vue-app');
}

boot();
```

`src/App.vue`, a placeholder for now — Task 5 fills it in:

```vue
<script setup lang="ts">
</script>

<template>
  <RouterView />
</template>
```

- [ ] **Step 6: Verify the build emits both apps**

```bash
npm run typecheck
npm run build
ls dist/index.html dist/app.html
```

Expected: typecheck exits 0, build exits 0, and both files exist. If `vue-tsc` reports errors in existing `src/` code, fix them here — and if there are more than a handful, stop and report rather than absorbing a large unrelated diff into this task.

- [ ] **Step 7: Verify both apps still serve**

```bash
npm run dev
```

Check `/` renders the legacy app exactly as before, and `/app.html` renders a blank page with no console errors. A blank page is the correct result: the router has no routes yet.

- [ ] **Step 8: Run the remaining gates and commit**

```bash
npm test
powershell -File check_syntax.ps1
git add package.json package-lock.json vite.config.ts vitest.config.mts src/vite-env.d.ts app.html src/vue-main.ts src/App.vue
git commit -m "feat: Vue toolchain and a second entry point

app.html loads the Vue rebuild; index.html keeps the legacy app and is
untouched. Both are rollup inputs, so one build emits both.

typecheck and build move from tsc to vue-tsc: tsc --noEmit cannot see
inside a .vue file and would have silently stopped checking every
component written from here on.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `domain/season-record.ts`

The Home view computes the season record inline, by regex over score strings. It is logic, it is untested, and the Vue Home needs it — so it becomes a domain module first, the same way Phase 0 treated everything else.

**Files:**
- Create: `src/domain/season-record.ts`, `src/domain/season-record.test.ts`

**Interfaces:**
```ts
export interface SeasonRecord {
  wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number; cleanSheets: number;
  gamesPlayed: number; goalsPerGame: string; recordText: string;
}
export function seasonRecord(schedule: any[]): SeasonRecord;
```

**A behaviour change, made deliberately.** The original strips the score's prefix with `.replace(/BHS\s*/i, '')`, so a club whose scores read `"LEGENDS 3 - 1"` has its prefix left in place. It happens to survive because the digit match runs afterwards, but the intent is plainly "remove our own name", and hardcoding one organization's is wrong in a product club coaches use. The module strips any leading non-digit run instead. This is Phase 1, a rebuild — unlike Phase 0, improving is allowed here — and it is recorded in the commit message.

- [ ] **Step 1: Write the failing test**

```ts
/**
 * The season record, from the score column.
 *
 * Scores are free text a coach typed: "BHS 3 – 1", "2-0", "3:1". Anything
 * that cannot be read as two numbers is not counted, because guessing at a
 * malformed score puts a fictional result in the record.
 */
import { describe, it, expect } from 'vitest';
import { seasonRecord } from './season-record';

const match = (score: string, status = 'COMPLETED') => ({ status, score });

describe('seasonRecord', () => {
  it('counts a win, a draw and a loss', () => {
    const r = seasonRecord([match('3 - 1'), match('2 - 2'), match('0 - 1')]);
    expect(r.wins).toBe(1);
    expect(r.draws).toBe(1);
    expect(r.losses).toBe(1);
  });

  it('reads the dash, the en dash and the colon alike', () => {
    expect(seasonRecord([match('3 – 1'), match('3-1'), match('3:1')]).wins).toBe(3);
  });

  it('strips any leading team name, not just one organization\'s', () => {
    // The original hardcoded /BHS\s*/i, which is wrong for a club.
    expect(seasonRecord([match('BHS 3 - 1')]).wins).toBe(1);
    expect(seasonRecord([match('LEGENDS 3 - 1')]).wins).toBe(1);
  });

  it('counts goals for and against', () => {
    const r = seasonRecord([match('3 - 1'), match('2 - 0')]);
    expect(r.goalsFor).toBe(5);
    expect(r.goalsAgainst).toBe(1);
  });

  it('counts a clean sheet only when nothing was conceded', () => {
    expect(seasonRecord([match('2 - 0'), match('2 - 1')]).cleanSheets).toBe(1);
  });

  it('ignores a fixture that is not completed', () => {
    expect(seasonRecord([match('3 - 1', 'SCHEDULED')]).gamesPlayed).toBe(0);
  });

  it('ignores a completed fixture with no score', () => {
    expect(seasonRecord([{ status: 'COMPLETED', score: '' }]).gamesPlayed).toBe(0);
  });

  it('ignores a score it cannot read as two numbers', () => {
    // Guessing would put a fictional result in the record.
    expect(seasonRecord([match('postponed')]).gamesPlayed).toBe(0);
    expect(seasonRecord([match('3')]).gamesPlayed).toBe(0);
  });

  it('reads the record as wins - losses - draws', () => {
    expect(seasonRecord([match('3 - 1'), match('0 - 1'), match('2 - 2')]).recordText)
      .toBe('1 - 1 - 1');
  });

  it('averages goals per game to two places', () => {
    expect(seasonRecord([match('3 - 1'), match('2 - 0')]).goalsPerGame).toBe('2.50');
  });

  it('reads 0.00 goals per game with nothing played, rather than dividing by zero', () => {
    const r = seasonRecord([]);
    expect(r.goalsPerGame).toBe('0.00');
    expect(r.recordText).toBe('0 - 0 - 0');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/domain/season-record.test.ts`
Expected: FAIL — `Failed to resolve import "./season-record"`.

- [ ] **Step 3: Write the module**

```ts
/**
 * The season record, derived from the schedule's score column.
 *
 * Scores are free text a coach typed, in whatever shape the sheet they copied
 * used. Anything that does not yield two numbers is not counted at all:
 * guessing at a malformed score would put a fictional result in the record,
 * and a wrong record is worse than a short one.
 */

export interface SeasonRecord {
  wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number; cleanSheets: number;
  gamesPlayed: number; goalsPerGame: string; recordText: string;
}

export function seasonRecord(schedule: any[]): SeasonRecord {
  const completed = (schedule || []).filter(m => m && m.status === 'COMPLETED' && m.score);

  let wins = 0, draws = 0, losses = 0;
  let goalsFor = 0, goalsAgainst = 0, cleanSheets = 0, gamesPlayed = 0;

  completed.forEach(m => {
    // Strip any leading team name rather than one organization's: the original
    // hardcoded /BHS\s*/i, which says nothing useful about a club's scoreline.
    const raw = String(m.score || '').replace(/^[^\d]*/, '').replace(/–|—|-|:/g, ' ');
    const nums = raw.match(/\d+/g);
    if (!nums || nums.length < 2) return;

    const gf = parseInt(nums[0], 10);
    const ga = parseInt(nums[1], 10);
    if (!Number.isFinite(gf) || !Number.isFinite(ga)) return;

    gamesPlayed++;
    goalsFor += gf;
    goalsAgainst += ga;
    if (ga === 0) cleanSheets++;
    if (gf > ga) wins++;
    else if (gf === ga) draws++;
    else losses++;
  });

  return {
    wins, draws, losses, goalsFor, goalsAgainst, cleanSheets, gamesPlayed,
    goalsPerGame: gamesPlayed > 0 ? (goalsFor / gamesPlayed).toFixed(2) : '0.00',
    recordText: `${wins} - ${losses} - ${draws}`
  };
}
```

- [ ] **Step 4: Run it, run the gates, commit**

```bash
npx vitest run src/domain/season-record.test.ts
npm test && npm run typecheck && npm run build
git add src/domain/season-record.ts src/domain/season-record.test.ts
git commit -m "feat: derive the season record in a tested domain module

Lifted out of renderHomeView, where it was untested regex over free-text
scores. The Vue Home view needs it, and a component should be a template
over tested logic.

Generalises the prefix strip: the original removed a literal /BHS\s*/i,
which says nothing useful about a club's scoreline. Any leading
non-digit run is stripped instead.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The router and its guards

**Files:**
- Create: `src/router/index.ts`, `src/router/guards.test.ts`, `src/views/PlaceholderView.vue`
- Modify: `src/App.vue` (already renders `<RouterView />`, so probably nothing)

**Interfaces:**
```ts
export const router: Router;
/** Exported separately so it can be tested without a router instance. */
export function routeAllowed(name: string, a: AuthLike): boolean;
export interface AuthLike {
  isCoach(): boolean; isAdmin(): boolean; canAccessRatings(): boolean;
}
```

- [ ] **Step 1: Write the failing guard test**

The guard rules are worth testing without mounting a router, so they live in a plain function.

```ts
/**
 * Which routes a visitor may reach.
 *
 * These mirror what updateAuthUI() enforces in the legacy app. They are UI
 * affordances only -- the real enforcement is the RLS policies in
 * supabase_migration_auth.sql, and a new privileged operation needs a policy
 * there, not a guard here.
 */
import { describe, it, expect } from 'vitest';
import { routeAllowed } from './index';

const guest = { isCoach: () => false, isAdmin: () => false, canAccessRatings: () => false };
const player = { isCoach: () => false, isAdmin: () => false, canAccessRatings: () => true };
const coach = { isCoach: () => true, isAdmin: () => false, canAccessRatings: () => true };
const admin = { isCoach: () => false, isAdmin: () => true, canAccessRatings: () => true };

describe('routeAllowed', () => {
  it('lets anyone reach the public routes', () => {
    for (const name of ['home', 'roster', 'schedule', 'help']) {
      expect(routeAllowed(name, guest), name).toBe(true);
    }
  });

  it('keeps a guest out of ratings, the planner and the staff list', () => {
    expect(routeAllowed('matrix', guest)).toBe(false);
    expect(routeAllowed('planner', guest)).toBe(false);
    expect(routeAllowed('coaches', guest)).toBe(false);
  });

  it('lets a player see ratings but not the planner', () => {
    expect(routeAllowed('matrix', player)).toBe(true);
    expect(routeAllowed('planner', player)).toBe(false);
  });

  it('lets a coach everywhere', () => {
    for (const name of ['matrix', 'planner', 'coaches']) {
      expect(routeAllowed(name, coach), name).toBe(true);
    }
  });

  it('lets an admin reach the staff list without being a coach', () => {
    expect(routeAllowed('coaches', admin)).toBe(true);
  });

  it('allows an unknown route rather than locking the app', () => {
    expect(routeAllowed('nonsense', guest)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/router/guards.test.ts`

- [ ] **Step 3: Write the router**

```ts
import { createRouter, createWebHistory, type Router } from 'vue-router';
import { auth } from '../auth';
import HomeView from '../views/HomeView.vue';
import PlaceholderView from '../views/PlaceholderView.vue';

export interface AuthLike {
  isCoach(): boolean; isAdmin(): boolean; canAccessRatings(): boolean;
}

/**
 * UI affordances only. Real enforcement is the RLS policies in
 * supabase_migration_auth.sql.
 */
export function routeAllowed(name: string, a: AuthLike): boolean {
  if (name === 'matrix') return a.canAccessRatings();
  if (name === 'planner') return a.isCoach();
  if (name === 'coaches') return a.isCoach() || a.isAdmin();
  return true;
}

const placeholder = (title: string, phase: string) => ({
  component: PlaceholderView,
  props: { title, phase }
});

export const router: Router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/roster', name: 'roster', ...placeholder('Roster & Bios', 'Phase 2') },
    { path: '/schedule', name: 'schedule', ...placeholder('Schedule & Results', 'Phase 2') },
    { path: '/matrix', name: 'matrix', ...placeholder('Player Ratings', 'Phase 3') },
    { path: '/planner', name: 'planner', ...placeholder('Coach Planner', 'Phase 4') },
    { path: '/coaches', name: 'coaches', ...placeholder('Coaching Staff', 'Phase 2') },
    { path: '/help', name: 'help', ...placeholder('Help', 'Phase 2') },
    // Anything else is the home page rather than a dead end.
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ],
  scrollBehavior: () => ({ top: 0, behavior: 'smooth' })
});

router.beforeEach((to) => {
  if (routeAllowed(String(to.name || ''), auth)) return true;
  return { name: 'home' };
});
```

**Note on the history mode.** `createWebHistory` gives clean URLs but needs the server to serve `app.html` for every unknown path. Vite's dev server does this for the configured entry; Vercel does not without a rewrite. Phase 1 does not add one, because nothing user-facing points at `/app.html` yet — a direct visit to `/roster` on the deployed site will 404 until Phase 7 makes the Vue app the root and adds the rewrite. Record this in the commit message so it is not rediscovered as a bug.

- [ ] **Step 4: Write `PlaceholderView.vue`**

```vue
<script setup lang="ts">
defineProps<{ title: string; phase: string }>();
</script>

<template>
  <section class="placeholder">
    <h1>{{ title }}</h1>
    <p>This screen is built in {{ phase }} of the Vue migration. It is still
       served by the existing app.</p>
  </section>
</template>

<style scoped>
.placeholder {
  max-width: 40rem;
  margin: 4rem auto;
  padding: 0 1.5rem;
  text-align: center;
  color: var(--text-muted);
}
.placeholder h1 {
  color: var(--bhs-cyan-accent);
  margin-bottom: 0.5rem;
}
</style>
```

- [ ] **Step 5: Run the test, the gates, and commit**

`HomeView.vue` does not exist yet, so create it as a one-line stub for this task and fill it in Task 6:

```vue
<template><section /></template>
```

```bash
npx vitest run src/router/guards.test.ts
npm test && npm run typecheck && npm run build
git add src/router src/views
git commit -m "feat: Vue router with the seven nav routes and their guards

Guard rules live in routeAllowed() so they can be tested without
mounting a router. They mirror updateAuthUI() and remain UI affordances
only; enforcement is the RLS policies.

createWebHistory needs a server rewrite to serve app.html for unknown
paths. Vite's dev server does; Vercel does not, and none is added here
because nothing points at /app.html yet. Phase 7 adds it when the Vue
app becomes the root.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The stores, and the organization's theme

**Files:**
- Create: `src/stores/auth.ts`, `src/stores/organization.ts`, `src/stores/organization.test.ts`
- Create: `src/domain/theme.ts`, `src/domain/theme.test.ts`

**Interfaces:**
```ts
// domain/theme.ts — pure, so it is tested without a store
export interface Branding { name: string; mascot: string; primary: string; secondary: string }
export function brandingFor(school: any): Branding;
export function themeVars(b: Branding): Record<string, string>;

// stores/auth.ts
export const useAuthStore: StoreDefinition;   // user, role, isCoach, isAdmin, canAccessRatings
// stores/organization.ts
export const useOrganizationStore: StoreDefinition;  // school, teams, activeTeamId, branding
```

- [ ] **Step 1: Write the failing theme test**

```ts
/**
 * Branding comes from the organization, never from a constant.
 *
 * Beaumont is the first organization, not the only one: club coaches use this
 * too, and a club has its own name, mascot and colours. Anything that renders
 * a team name or colour reads it from the schools row.
 */
import { describe, it, expect } from 'vitest';
import { brandingFor, themeVars } from './theme';

describe('brandingFor', () => {
  it('reads the name, mascot and colours from the school record', () => {
    expect(brandingFor({
      name: 'Legends FC', mascot: 'Lions',
      colors: { primary: '#123456', secondary: '#abcdef' }
    })).toEqual({
      name: 'Legends FC', mascot: 'Lions',
      primary: '#123456', secondary: '#abcdef'
    });
  });

  it('falls back to the app defaults when colours are missing', () => {
    const b = brandingFor({ name: 'Some School', mascot: 'Hawks' });
    expect(b.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(b.secondary).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('does not invent a school name when there is no record', () => {
    // A signed-out visitor mid-load must not be told they are at Beaumont.
    const b = brandingFor(null);
    expect(b.name).toBe('');
    expect(b.mascot).toBe('');
  });

  it('ignores a colours blob that is not an object', () => {
    expect(() => brandingFor({ name: 'A', mascot: 'B', colors: 'blue' })).not.toThrow();
  });
});

describe('themeVars', () => {
  it('maps branding onto the CSS custom properties the styles use', () => {
    const vars = themeVars({ name: 'X', mascot: 'Y', primary: '#111111', secondary: '#222222' });
    expect(vars['--bhs-blue-primary']).toBe('#111111');
    expect(vars['--bhs-gold-accent']).toBe('#222222');
  });
});
```

- [ ] **Step 2: Run it, watch it fail, write `src/domain/theme.ts`, watch it pass**

The defaults match what `app.core.js` already falls back to: `#0047AB` primary, `#FFD700` secondary.

- [ ] **Step 3: Write the two stores**

`src/stores/auth.ts` wraps the existing singleton rather than replacing it — `src/auth.ts` is real Supabase Auth and both apps use it:

```ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { auth } from '../auth';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(auth.getCurrentUser());

  // auth.subscribe fires on every auth change; the legacy app re-renders the
  // current view from it. Here it updates one ref and Vue does the rest.
  auth.subscribe(() => { user.value = auth.getCurrentUser(); });

  return {
    user,
    role: computed(() => auth.getRole()),
    isLoggedIn: computed(() => auth.isLoggedIn()),
    isCoach: computed(() => auth.isCoach()),
    isAdmin: computed(() => auth.isAdmin()),
    canAccessRatings: computed(() => auth.canAccessRatings())
  };
});
```

`src/stores/organization.ts` resolves the active organization from the active team — **not** from a school code — and applies the theme:

```ts
import { defineStore } from 'pinia';
import { ref, computed, watchEffect } from 'vue';
import { supabaseService } from '../data/supabase';
import { resolveActiveTeam } from '../data/team-scope';
import { brandingFor, themeVars } from '../domain/theme';

export const useOrganizationStore = defineStore('organization', () => {
  const schools = ref<any[]>([]);
  const teams = ref<any[]>([]);
  const activeTeamId = ref<string | null>(null);
  const loading = ref(false);

  /**
   * The organization the active team belongs to.
   *
   * Resolved from the team, never from a school code. app.core.js still falls
   * back to a 'bhs' literal; that is legacy to work around, not to copy.
   */
  const school = computed(() => {
    const team = teams.value.find(t => String(t.id) === String(activeTeamId.value));
    if (team?.school_id) {
      const found = schools.value.find(s => String(s.id) === String(team.school_id));
      if (found) return found;
    }
    return schools.value[0] || null;
  });

  const branding = computed(() => brandingFor(school.value));

  // Paint the organization's colours onto the document so every component
  // styles against the properties rather than a literal.
  watchEffect(() => {
    const vars = themeVars(branding.value);
    for (const [prop, value] of Object.entries(vars)) {
      document.documentElement.style.setProperty(prop, value);
    }
  });

  async function load() {
    loading.value = true;
    try {
      schools.value = (await supabaseService.fetchSchools()) || [];
      // fetchTeamsForViewer, not fetchTeams: it returns only the teams the
      // signed-in profile may see, which is what the switcher offers.
      teams.value = (await supabaseService.fetchTeamsForViewer()) || [];
      // Three arguments: the available teams, the per-device preference in
      // localStorage under bhs_active_team_id, and the public default.
      const stored = localStorage.getItem('bhs_active_team_id');
      activeTeamId.value = resolveActiveTeam(teams.value as any, stored, null)?.id ?? null;
    } finally {
      loading.value = false;
    }
  }

  return { schools, teams, activeTeamId, school, branding, loading, load };
});
```

Both names were checked against `src/data/supabase.ts:613` and `src/data/team-scope.ts:16` when this plan was written. Read `resolveActiveTeam`'s body before wiring it — the third argument's meaning matters for a signed-out visitor, and guessing it wrong shows the wrong team's roster to the public.

- [ ] **Step 4: Write the store test, run the gates, commit**

Test that `school` resolves through the active team, falls back to the first school when nothing matches, and that `branding` follows it. Mount Pinia with `createPinia()` and `setActivePinia()`.

---

### Task 5: The application shell

**Files:**
- Create: `src/components/layout/AppHeader.vue`, `AppNav.vue`, `AppFooter.vue`
- Create: `src/components/layout/AppNav.test.ts`
- Modify: `src/App.vue`

- [ ] **Step 1: Write the failing nav test**

The nav's one real rule is which items a visitor sees, so that is what the test covers.

```ts
/**
 * Which nav items a visitor sees.
 *
 * The legacy app hides three of the seven from a guest by setting
 * style.display on each <li>. Here the list is filtered, so an item a
 * visitor may not reach is not in the document at all.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import AppNav from './AppNav.vue';

const PUBLIC = ['Home', 'Roster & Bios', 'Schedule & Results', 'Help'];
const GUARDED = ['Player Ratings', 'Coach Planner', 'Coaching Staff'];

/** Mount with the auth store seeded to a role. */
function mountAs(state: Record<string, boolean>) {
  return mount(AppNav, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        initialState: {
          auth: {
            isCoach: false, isAdmin: false, canAccessRatings: false, ...state
          }
        }
      })],
      stubs: { RouterLink: { template: '<a><slot /></a>' } }
    }
  });
}

const labels = (w: any) => w.findAll('[data-nav-item]').map((n: any) => n.text());

describe('AppNav', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('shows all seven items to a coach', () => {
    const w = mountAs({ isCoach: true, canAccessRatings: true });
    for (const label of [...PUBLIC, ...GUARDED]) {
      expect(labels(w), label).toContain(label);
    }
  });

  it('shows a guest only the four public items', () => {
    const w = mountAs({});
    expect(labels(w)).toEqual(expect.arrayContaining(PUBLIC));
    for (const label of GUARDED) {
      expect(labels(w), label).not.toContain(label);
    }
  });

  it('shows a player the ratings but not the planner', () => {
    const w = mountAs({ canAccessRatings: true });
    expect(labels(w)).toContain('Player Ratings');
    expect(labels(w)).not.toContain('Coach Planner');
  });

  it('shows an admin the staff list without their being a coach', () => {
    expect(labels(mountAs({ isAdmin: true }))).toContain('Coaching Staff');
  });

  it('keeps the seven in their established order', () => {
    const w = mountAs({ isCoach: true, isAdmin: true, canAccessRatings: true });
    expect(labels(w)).toEqual([...PUBLIC.slice(0, 3), 'Player Ratings',
      'Coach Planner', 'Coaching Staff', 'Help']);
  });

  it('opens the drawer and closes it again', () => {
    const w = mountAs({});
    expect(w.find('[data-nav-drawer]').classes()).not.toContain('open');
    w.find('[data-nav-toggle]').trigger('click');
    expect(w.find('[data-nav-drawer]').classes()).toContain('open');
    w.find('[data-nav-toggle]').trigger('click');
    expect(w.find('[data-nav-drawer]').classes()).not.toContain('open');
  });
});
```

This needs `@pinia/testing`, so add it in Task 1's install line alongside the rest. The component must therefore carry `data-nav-item` on each entry, `data-nav-drawer` on the drawer and `data-nav-toggle` on its button — the test is the contract for those hooks.

- [ ] **Step 2: Build the three layout components**

The nav is a bar at desktop width and a drawer under 640px, matching what the legacy app does. Keep the seven labels and their order. Every colour is a CSS custom property, never a literal — the organization's theme sets them.

The footer carries the build stamp, reusing `src/build-info.ts` (`buildInfo`, `formatBuildStamp`, `buildStampTitle`) exactly as the legacy footer does.

The header shows the organization's name and mascot from the store, and the auth control: **Sign In / Register** for a guest, **Admin Center** for a coach or admin, **My Account** otherwise — the three states `updateAuthUI()` produces. Wire the buttons to no-ops with a TODO comment naming the phase that builds those modals; do not build them here.

- [ ] **Step 3: Assemble `src/App.vue`**

```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import AppHeader from './components/layout/AppHeader.vue';
import AppNav from './components/layout/AppNav.vue';
import AppFooter from './components/layout/AppFooter.vue';
import { useOrganizationStore } from './stores/organization';

const org = useOrganizationStore();
onMounted(() => org.load());
</script>

<template>
  <AppHeader />
  <AppNav />
  <main id="main">
    <RouterView />
  </main>
  <AppFooter />
</template>
```

- [ ] **Step 4: Run the gates and commit**

---

### Task 6: The Home view, end to end

The proof that Phase 0 paid off: every figure on this screen comes from a tested module, so the component is a template.

**Files:**
- Create: `src/views/HomeView.test.ts`
- Modify: `src/views/HomeView.vue`

- [ ] **Step 1: Write the failing view test**

```ts
/**
 * The home page's four states.
 *
 * The legacy version had two -- a fixture, or "SEASON COMPLETE" -- so every
 * other reason read as the season being over. At the start of a season, with
 * one past friendly on the books, that is precisely backwards.
 */
```

Cover, by mounting with seeded store state:

- an upcoming fixture: the opponent, the date, and a countdown that is not `00/00/00`
- `empty`: "schedule coming soon", and the coach-only hint about adding fixtures shown only to a coach
- `stale`: names the last played match, and does not claim the season is over
- `complete`: the final record
- the hero shows the organization's name and mascot from the store, **not** the words "Beaumont" or "Cougars" from a literal
- the record and goals-per-game come from `seasonRecord`

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Write `HomeView.vue`**

It imports `getNextMatch`, `scheduleState`, `lastPlayedMatch` and `nextMatchCountdown` from `../domain/schedule`, and `seasonRecord` from `../domain/season-record`. It computes nothing itself.

The countdown ticks with a `setInterval` started in `onMounted` and **cleared in `onUnmounted`** — a timer left running after a route change is a leak that keeps a dead component's reactive graph alive.

The hero reads `org.branding.name` and `org.branding.mascot`. There must be no `Beaumont` or `Cougars` literal anywhere in this file.

- [ ] **Step 4: Verify by eye**

```bash
npm run dev
```

Open `/app.html`. Check the fixture matches what `/` shows, the countdown ticks, and the nav hides the three guarded items when signed out.

- [ ] **Step 5: Run all four gates and commit**

---

### Task 7: Close out Phase 1

- [ ] **Step 1: Confirm the legacy app is untouched**

```bash
git diff --stat c0b73fa..HEAD -- index.html public/js app.js
```

Expected: no output. If anything appears, it was not meant to and needs explaining.

- [ ] **Step 2: Update `CLAUDE.md`**

The "three parallel copies" section is now wrong — there is a fourth, and it is the one being built. Rewrite that table to describe: the dead `app.js`, the live `public/js/`, the shared `src/` modules, and the new Vue app under `src/App.vue`, `src/views/`, `src/components/`, `src/stores/`, `src/router/`. Record that `index.html` serves the legacy app and `app.html` the Vue one, that `npm run typecheck` is now `vue-tsc`, and that the Vercel rewrite for history-mode routing is still owed.

- [ ] **Step 3: Commit**

## Definition of done

- `npm test` passes, above the 1,924 baseline.
- `npm run typecheck` (`vue-tsc`) passes.
- `npm run build` passes and emits both `dist/index.html` and `dist/app.html`.
- `check_syntax.ps1` passes over all 22 classic scripts.
- `npm run dev` serves the unchanged legacy app at `/` and the Vue app at `/app.html`.
- Home renders correctly in all four schedule states, themed from the organization.
- `git diff` against `c0b73fa` shows no change to `index.html`, `public/js/` or `app.js`.
