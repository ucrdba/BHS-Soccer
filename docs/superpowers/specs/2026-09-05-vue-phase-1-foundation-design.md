# Vue Migration Phase 1 — The Foundation

**Status:** proposed, awaiting approval
**Date:** 2026-09-05
**Branch:** `feature/convertToVue`
**Follows:** `docs/superpowers/specs/2026-09-05-vue-migration-design.md`, which settled the strategy. Phase 0 is complete: 13 framework-free modules under `src/domain/`, 1,924 tests.

## What this phase builds

The Vue application shell, and the Home view through it end to end. One screen, done properly, is the point: it proves the toolchain, the routing, the auth integration, the state layer, the test approach and the design language all work together before six more phases are built on them.

## Decisions taken

**Two HTML entry points, so the rebuild is genuinely parallel.** `index.html` keeps loading the legacy app and is not touched. A new `app.html` loads the Vue app from `src/vue-main.ts`. `vite.config.ts` gains both as rollup inputs, so one `npm run build` produces both and either can be opened.

*Why:* the strategy chose a parallel rebuild over a strangler precisely to avoid bridge code. Sharing one HTML file would reintroduce it — a flag, a mount decision, two apps racing for the same DOM. Two files cost one line of Vite config and keep the legacy app exactly as it is until cutover, which is when `app.html` becomes `index.html` and the old one is deleted.

*Rejected: mounting Vue into a hidden `<div id="app">` inside the existing `index.html`.* This is what the abandoned bootstrap found on this branch this morning was doing, and it had already broken the legacy app by dropping twenty of its twenty-two script tags. The two apps do not belong in one document.

**Vue 3 with `<script setup>` and the Composition API.** The default for new Vue work, and the form that reads best next to the framework-free modules Phase 0 produced — a component becomes a template over imported functions.

**Pinia for shared state, not a bespoke store.** Three things outlive a route change and are read by unrelated components: the signed-in profile, the active team, and the loaded collections. `src/data/store.ts` and `src/data/cache.ts` already exist and keep their jobs; Pinia is the layer components subscribe to.

**`vue-tsc` replaces `tsc` for typechecking.** `tsc --noEmit` cannot see inside a `.vue` file, so leaving it in place would silently stop checking every component written from here on. `npm run typecheck` becomes `vue-tsc --noEmit`, which still checks all of `src/`.

**Component tests use `@vue/test-utils` with the existing Vitest and jsdom.** No new runner. The domain modules keep their direct-import tests, and components get mount-and-assert tests, so the two kinds of coverage stay distinct.

**Branding is read from the organization, never hardcoded.** The `schools` row carries `mascot` and a `colors` JSONB of `{ primary, secondary }`. The shell reads the active organization's record and writes those into CSS custom properties at runtime; every component styles against the properties. A club opening the app sees its own colours and mascot.

*This also rules out one legacy pattern.* `public/js/app.core.js:293` resolves the school with `this.data.school?.code || 'bhs'`. Nothing in `src/vue-*` may resolve an organization by a `'bhs'` literal; it comes from the active team, or from the signed-in profile's `school_id`. Coaches outside Beaumont — club coaches specifically — use this application, so a hardcoded school code is a bug waiting for its second tenant.

**The design keeps its identity and is rebuilt underneath.** The dark navy ground with cyan and gold accents stays: it is the programme's look and the reason the app feels like a team's rather than a spreadsheet's. What changes is everything structural — a real spacing scale, real components instead of inline `style="..."` strings, states that exist (loading, empty, error), and layouts that work at phone width rather than merely not breaking.

*Rejected: a light data-first redesign, and a public/coach split.* The first discards the identity for no gain the coach asked for; the second doubles the design work before a single screen has been proven.

**The seven menu items do not change.** Home, Roster & Bios, Schedule & Results, Player Ratings, Coach Planner, Coaching Staff, Help — as the strategy settled.

## What Phase 1 delivers

| Piece | Detail |
| --- | --- |
| Toolchain | `vue`, `vue-router`, `pinia`, `@vitejs/plugin-vue`, `vue-tsc`, `@vue/test-utils` |
| Entry | `app.html` → `src/vue-main.ts` → `src/App.vue` |
| Router | Seven routes, `/` through `/help`, with the three guarded ones gated |
| Shell | Header, the nav (bar on desktop, drawer under 640px), footer with the build stamp |
| Auth | `src/auth.ts` and `src/auth/permissions.ts` reused as they are, exposed through a Pinia store |
| Theme | Organization colours and mascot from the `schools` row into CSS custom properties |
| Home | The whole view: next fixture with its countdown, the record, and the schedule state — built on `domain/schedule.ts` from Phase 0 |
| Tests | Component tests for the nav, the route guards and the Home view |

The Home view is the proof that Phase 0 paid off: its fixture logic is already extracted and tested, so the component is a template over `getNextMatch`, `scheduleState` and `nextMatchCountdown` rather than a reimplementation.

## Route guards

The three restricted routes match what `updateAuthUI()` enforces today:

| Route | Requires |
| --- | --- |
| `/matrix` | `auth.canAccessRatings()` |
| `/planner` | `auth.isCoach()` |
| `/coaches` | `auth.isCoach()` or `auth.isAdmin()` |

A guest who reaches one is redirected Home, exactly as the legacy app does. These remain **UI affordances only** — the enforcement is the RLS policies in `supabase_migration_auth.sql`, and a new privileged operation still needs a policy there rather than a guard here.

## Non-goals

**No other views.** Roster, Schedule, Player Ratings, Planner, Coaching Staff and Help are Phase 2 onward. Their routes exist and render a placeholder naming the phase that will fill them.

**Nothing is deleted.** `public/js/`, `app.js` and `index.html` are untouched. Deletion is Phase 7, after every screen is ported.

**No new features.** Home shows what Home shows today.

**The dormant `src/app.core.ts`, `src/data.ts` and `src/utils.ts` stay dormant.** They carry pre-migration seed logic that the live app had stripped out, and activating them as-is would reintroduce it. They are deleted in Phase 7, not revived here.

## Verification

- `npm test` passes, never below the 1,924 tests Phase 0 ended with.
- `npm run typecheck` — now `vue-tsc --noEmit` — passes over `src/`, components included.
- `npm run build` passes and emits **both** `index.html` and `app.html`.
- `powershell -File check_syntax.ps1` passes over all 22 classic scripts.
- `npm run dev` serves the legacy app at `/` unchanged, and the Vue app at `/app.html`.
- The Home view renders the correct next fixture, and its countdown ticks.
- Signing out drops the three guarded routes from the nav; visiting one directly redirects Home.

## Risks

**`vue-tsc` may report errors `tsc` did not.** It typechecks templates, which nothing has ever checked here. Any it finds in existing `src/` code are fixed as part of this phase; if the volume is large enough to be its own task, that is reported rather than absorbed silently.

**Two entry points means two apps to keep working.** Until cutover, a change to `src/main.ts` affects the legacy app and a change to `src/vue-main.ts` affects the new one. They share `src/domain/`, `src/data/` and `src/auth.ts`, so a change there affects both — and only `npm run build` plus the full suite proves it.

**Vercel serves `index.html` at the root.** The deployed site keeps showing the legacy app throughout the migration, with the Vue app reachable at `/app.html`. That is the intent, and it means nothing user-facing changes until Phase 7 swaps them.
