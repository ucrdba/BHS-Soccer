# Mobile Restyle Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's stylesheet with the token sheet and three grounds from the restyle spec, rebuild the shell (crest header, bottom bar with a More sheet, hairline footer, tool chrome), retire the legacy `styles.css`, and leave every existing view rendering on the paper ground with its old layout.

**Architecture:** One stylesheet, `index.css`, defines fixed tokens and the same ground token names three times under `data-ground` on `<html>`; the router sets that attribute from route meta. Organization colours are painted at runtime under `--org-*` names with a contrast guard, and the old `--bhs-*` names are aliased to the new tokens so nothing breaks before phases 2–5 rewrite each view. The shell components are rewritten; every other component only loses its hardcoded whites.

**Tech Stack:** Vue 3 `<script setup>`, Vue Router 5, Pinia 4, Vitest 4 with jsdom and `@vue/test-utils`, `vue-tsc`, Vite 8. Fonts from Google Fonts (Cormorant Garamond, Lora, Oswald).

**Spec:** `docs/superpowers/specs/2026-09-07-mobile-restyle-design.md` (sections 2, 3, 6, 7, 8 and phase 1 of section 9). The canvas is `qlaudDesignSpec/soccer-program-mobile.dc.html`.

**Baseline entering this plan:** commit `f29425f` on `feature/convertToVue`, 2,300 tests across 123 files, three gates green.

## Global Constraints

- **Three gates on every commit, checked by exit code:** `npm test`, `npm run typecheck`, `npm run build`. Vitest can print green and exit 1; run `npm test > /dev/null 2>&1; echo "EXIT=$?"` in bash or `npm test | Out-Null; $LASTEXITCODE` in PowerShell.
- **Never hardcode a school, mascot, colour or `'bhs'`.** Branding comes from the `schools` row through the organization store. Club coaches use this application.
- **The token names are exactly these** (spec §2.2): `--ground`, `--surface`, `--surface-deep`, `--ink`, `--ink-muted`, `--ink-soft`, `--rule`, `--rule-strong`, `--live`, `--mark`, `--heading-face`, `--shadow-md`. Ground names are exactly `paper`, `pitch`, `ledger`.
- **Organization properties are exactly** `--org-primary`, `--org-secondary`, `--org-mark-paper`, `--org-mark-dark` (spec §2.3). The contrast floor is 3:1.
- **The `--bhs-*` aliases are temporary.** They are added in Task 1 and removed in phase 5. New code in this plan uses the new names only.
- **Organization colours are stroke only** — never a fill behind text, never body text.
- `tsconfig.json` stays loose (`strict: false`). Do not tighten it. `.at()` is unavailable at this `lib` target.
- `typescript` stays on 5.x. Do not upgrade it.
- Conventional Commits, one commit per task, with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Files use LF; git warns about CRLF on this machine and that warning is not an error.

---

## File structure

| File | Responsibility |
| --- | --- |
| `index.css` (rewrite) | The token sheet: fixed tokens, three ground blocks, temporary aliases, base elements, the global `.btn`, `.tnum`, `.kicker`. |
| `index.html` (modify) | Fonts link, `data-ground="paper"` on `<html>`, no `styles.css` link. |
| `styles.css` (delete) | The legacy sheet. |
| `src/domain/theme.ts` (modify) | `contrastRatio`, `guardedMark`, renamed `themeVars`. |
| `src/router/ground.ts` (create) | `Ground`, `groundFor`, `applyGround`, route meta typing. |
| `src/router/index.ts` (modify) | `meta.ground` on every route; `afterEach` applies it. |
| `src/domain/nav-bar.ts` (create) | `barItems` — which items fit the bar and which overflow. |
| `src/domain/team-switcher.ts` (create) | `teamGroups` — teams grouped by organization for the switcher. |
| `src/components/layout/AppNav.vue` (rewrite) | Bottom bar under 768px with a More sheet; hairline top nav above. |
| `src/components/layout/AppHeader.vue` (rewrite) | The crest block: mark, name, mascot, team switcher, record, account button. |
| `src/components/layout/AppFooter.vue` (modify) | Hairline footer on the tokens. |
| `src/App.vue` (modify) | Hides the shell on `meta.chrome === 'tool'`; bottom padding for the bar. |
| `src/views/HelpView.vue` (modify) | Its unscoped style block takes the help classes `styles.css` still carried. |
| `src/design-tokens.test.ts` (create) | Guard: the sheet's shape, no legacy sheet, no hardcoded whites in components. |
| every `src/**/*.vue` with `#fff` (modify) | Hardcoded whites become `var(--ink)`. |
| `CLAUDE.md` (modify) | The conventions line describes the tokens and grounds. |

---

### Task 1: The token sheet

`index.css` becomes the design system. Nothing else changes yet: `styles.css` is still linked, and every `--bhs-*` name still resolves through the alias block, so the app keeps rendering while the sheet underneath it changes.

**Files:**
- Modify: `index.css` (full rewrite)
- Modify: `index.html`
- Create: `src/design-tokens.test.ts`
- Modify: `src/entry-point.test.ts`

**Interfaces:**
- Produces: the token names listed in Global Constraints, the `.btn`, `.btn--go`, `.tnum` and `.kicker` classes, and `[data-ground]` on `<html>`. Later tasks style against these names only.

- [ ] **Step 1: Write the failing tests**

Create `src/design-tokens.test.ts`:

```ts
/**
 * The shape of the design system.
 *
 * One stylesheet defines the same token names three times, once per ground,
 * so a component styled against `--ink` or `--rule` is correct on every
 * ground without knowing which one it is on. These tests read the file
 * rather than a rendered page because the failure they guard against is a
 * token defined on two grounds and forgotten on the third — which renders as
 * "inherit" and looks like a bug in whichever component hits it first.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'index.css'), 'utf8');

/** Every token a ground must define. Spec §2.2. */
const GROUND_TOKENS = [
  '--ground', '--surface', '--surface-deep', '--ink', '--ink-muted', '--ink-soft',
  '--rule', '--rule-strong', '--live', '--mark', '--heading-face', '--shadow-md'
];

/** The body of the rule block whose selector list contains `selector`. */
function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`[^{}]*${escaped}[^{}]*\\{([^}]*)\\}`));
  if (!m) throw new Error(`no rule block for ${selector}`);
  return m[1];
}

describe('the ground blocks', () => {
  for (const ground of ['paper', 'pitch', 'ledger']) {
    it(`${ground} defines every ground token`, () => {
      const body = block(`[data-ground="${ground}"]`);
      for (const token of GROUND_TOKENS) {
        expect(body, `${ground} is missing ${token}`).toMatch(new RegExp(`${token}\\s*:`));
      }
    });
  }

  it('gives the pitch ground the display face for headings', () => {
    expect(block('[data-ground="pitch"]')).toMatch(/--heading-face:\s*var\(--font-display\)/);
  });

  it('gives paper and ledger the heading face', () => {
    expect(block('[data-ground="paper"]')).toMatch(/--heading-face:\s*var\(--font-heading\)/);
    expect(block('[data-ground="ledger"]')).toMatch(/--heading-face:\s*var\(--font-heading\)/);
  });

  it('reads the mark from the guarded organization colour, per ground', () => {
    expect(block('[data-ground="paper"]')).toMatch(/--mark:\s*var\(--org-mark-paper\)/);
    expect(block('[data-ground="pitch"]')).toMatch(/--mark:\s*var\(--org-mark-dark\)/);
    expect(block('[data-ground="ledger"]')).toMatch(/--mark:\s*var\(--org-mark-dark\)/);
  });
});

describe('the fixed tokens', () => {
  it('names the three faces and no longer loads Inter', () => {
    expect(css).toMatch(/--font-heading:\s*"Cormorant Garamond"/);
    expect(css).toMatch(/--font-body:\s*"Lora"/);
    expect(css).toMatch(/--font-display:\s*"Oswald"/);
    expect(css).not.toMatch(/Inter/);
  });

  it('carries the four organization properties with cold-load fallbacks', () => {
    for (const p of ['--org-primary', '--org-secondary', '--org-mark-paper', '--org-mark-dark']) {
      expect(css, p).toMatch(new RegExp(`${p}\\s*:\\s*#[0-9a-fA-F]{6}`));
    }
  });
});

describe('the temporary aliases', () => {
  // Phase 5 deletes this block; until then every legacy name must resolve.
  const ALIASES: Record<string, string> = {
    '--bhs-navy-bg': '--ground',
    '--bhs-navy-card': '--surface',
    '--bhs-navy-border': '--rule',
    '--bhs-blue-primary': '--org-primary',
    '--bhs-blue-dark': '--surface-deep',
    '--bhs-blue-electric': '--live',
    '--bhs-cyan-accent': '--live',
    '--bhs-gold-accent': '--rule-strong',
    '--bhs-silver': '--ink',
    '--text-main': '--ink',
    '--text-muted': '--ink-muted'
  };

  for (const [legacy, token] of Object.entries(ALIASES)) {
    it(`${legacy} resolves to ${token}`, () => {
      expect(css).toMatch(new RegExp(`${legacy}\\s*:\\s*var\\(${token}\\)`));
    });
  }
});
```

Add to `src/entry-point.test.ts`, inside `describe('the one entry point', …)`:

```ts
  it('ships the paper ground on the document so the first paint has tokens', () => {
    expect(index).toMatch(/<html[^>]*data-ground="paper"/);
  });

  it('loads the three faces from Google Fonts', () => {
    expect(index).toMatch(/fonts\.googleapis\.com\/css2\?[^"]*Cormorant\+Garamond/);
    expect(index).toMatch(/Lora/);
    expect(index).toMatch(/Oswald/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/design-tokens.test.ts src/entry-point.test.ts`
Expected: FAIL — `no rule block for [data-ground="paper"]`, and the two new entry-point cases fail on the missing attribute and fonts link.

- [ ] **Step 3: Rewrite `index.css`**

Replace the whole file with:

```css
/*
 * The design system: fixed tokens, three grounds, the base elements.
 *
 * Every component styles against the ground tokens (--ink, --rule, --live …)
 * and never against a literal, so the same component is correct on the light
 * paper ground and on the two dark ones. Which ground applies is decided by
 * `data-ground` on <html>, which the router sets from route meta — see
 * src/router/ground.ts. Spec: docs/superpowers/specs/2026-09-07-mobile-restyle-design.md §2.
 */

:root {
  /* Status — fixed on every ground. */
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-danger: #EF4444;

  /* Spacing and radii, from the Classical system (4.6px step, 4px radius). */
  --space-1: 4.6px;
  --space-2: 9.2px;
  --space-3: 13.8px;
  --space-4: 18.4px;
  --space-6: 27.6px;
  --space-8: 36.8px;
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 7px;

  /* The three faces. Which one headings use is per ground (--heading-face). */
  --font-heading: "Cormorant Garamond", Georgia, "Times New Roman", serif;
  --font-body: "Lora", Georgia, "Times New Roman", serif;
  --font-display: "Oswald", "Arial Narrow", system-ui, sans-serif;

  /*
   * The organization's colours. The organization store paints these at
   * runtime from the schools row (src/domain/theme.ts); the values here are
   * only the cold-load fallbacks, and they are the app's historical defaults
   * so an organization that never set colours looks as it always did.
   * The two -mark- values are the same colours after the contrast guard.
   */
  --org-primary: #0047AB;
  --org-secondary: #FFD700;
  --org-mark-paper: #0047AB;
  --org-mark-dark: #FFD700;

  /* Dark text for the rare light surface on a dark ground (a gold button). */
  --text-dark: #0F172A;
}

/* ── Grounds ─────────────────────────────────────────────────────────── */

/* paper: the light editorial ground. Also the default, should the attribute
   ever be missing, so the page is never unstyled. */
:root,
[data-ground="paper"] {
  --ground: #f3f2f2;
  --surface: #eae9e9;
  --surface-deep: #e0dede;
  --ink: #201f1d;
  --ink-muted: #605d5d;
  --ink-soft: #9b9797;
  --rule: color-mix(in srgb, #201f1d 16%, transparent);
  --rule-strong: #7d5411;
  --live: #7d5411;
  --mark: var(--org-mark-paper);
  --heading-face: var(--font-heading);
  --shadow-md: 0 3px 10px color-mix(in srgb, #2d2b2b 16%, transparent);
  color-scheme: light;
}

/* pitch: the touchline ground. Navy, the display face, cyan for what is live. */
[data-ground="pitch"] {
  --ground: #0A1428;
  --surface: #112240;
  --surface-deep: #0d1b33;
  --ink: #F8FAFC;
  --ink-muted: #94A3B8;
  --ink-soft: #4a5b78;
  --rule: #233554;
  --rule-strong: #FFD700;
  --live: #00F0FF;
  --mark: var(--org-mark-dark);
  --heading-face: var(--font-display);
  --shadow-md: 0 8px 32px rgb(0 0 0 / 0.45);
  color-scheme: dark;
}

/* ledger: the ratings ground. Navy with the editorial faces, gold as stroke. */
[data-ground="ledger"] {
  --ground: #0A1428;
  --surface: #112240;
  --surface-deep: #0d1b33;
  --ink: #F8FAFC;
  --ink-muted: #94A3B8;
  --ink-soft: #4a5b78;
  --rule: #233554;
  --rule-strong: #FFD700;
  --live: #00F0FF;
  --mark: var(--org-mark-dark);
  --heading-face: var(--font-heading);
  --shadow-md: 0 8px 32px rgb(0 0 0 / 0.45);
  color-scheme: dark;
}

/* ── Temporary aliases ───────────────────────────────────────────────── */

/*
 * The names the pre-restyle components use, resolved onto the tokens so that
 * every view renders while phases 2–5 rewrite them one at a time. Phase 5
 * deletes this block; `grep -r -- '--bhs-' src/` returning nothing is its exit
 * condition. Do not use these names in new work.
 */
:root {
  --bhs-navy-bg: var(--ground);
  --bhs-navy-card: var(--surface);
  --bhs-navy-border: var(--rule);
  --bhs-blue-primary: var(--org-primary);
  --bhs-blue-dark: var(--surface-deep);
  --bhs-blue-electric: var(--live);
  --bhs-cyan-accent: var(--live);
  --bhs-gold-accent: var(--rule-strong);
  --bhs-silver: var(--ink);
  --text-main: var(--ink);
  --text-muted: var(--ink-muted);
  --glass-bg: var(--surface);
  --glass-border: var(--rule);
  --glass-shadow: var(--shadow-md);
}

/* ── Base elements ───────────────────────────────────────────────────── */

*, *::before, *::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  min-height: 100vh;
  overflow-x: hidden;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.55;
}

h1, h2, h3, h4, h5, h6 {
  margin: 0;
  font-family: var(--heading-face);
  font-weight: 500;
  line-height: 1.12;
  letter-spacing: -0.01em;
}

/* The touchline face is a condensed sans, and it sets in caps. */
[data-ground="pitch"] h1,
[data-ground="pitch"] h2,
[data-ground="pitch"] h3 {
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

p { margin: 0; }

a { color: var(--live); text-underline-offset: 3px; }

img { display: block; max-width: 100%; }

button, input, select, textarea { font: inherit; color: inherit; }

:focus { outline: none; }
:focus-visible { outline: 2px solid var(--live); outline-offset: 2px; }
::selection { background: color-mix(in srgb, var(--live) 30%, transparent); }

::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: var(--ground); }
::-webkit-scrollbar-thumb { background: var(--rule); border-radius: 4px; }

/* ── Shared primitives ───────────────────────────────────────────────── */

/* Figures that stand in columns. */
.tnum { font-variant-numeric: tabular-nums; }

/* A section label: small caps, letterspaced, quiet. */
.kicker {
  font-family: var(--font-body);
  font-size: 9.5px;
  font-weight: 400;
  line-height: 1;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/*
 * The outlined button. Colour is stroke, never fill (spec §2, the Classical
 * rule). Components that define their own scoped `.btn` override this; the
 * few that do not get a correct button from here.
 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 calc(var(--space-3) * 1.2);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font-family: var(--heading-face);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  text-decoration: none;
  cursor: pointer;
}
.btn:hover { background: color-mix(in srgb, var(--ink) 7%, transparent); }
.btn:active { background: color-mix(in srgb, var(--ink) 14%, transparent); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* The one action a screen most wants: outlined in the live colour. */
.btn--go { border-color: var(--live); color: var(--live); }
.btn--go:hover { background: color-mix(in srgb, var(--live) 12%, transparent); }
.btn--go:active { background: color-mix(in srgb, var(--live) 22%, transparent); }
```

- [ ] **Step 4: Update `index.html`**

Change the opening tag and the head. The file becomes:

```html
<!DOCTYPE html>
<html lang="en" data-ground="paper">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Soccer Program</title>
  <meta name="description"
    content="Roster, schedule and coaching tools for the soccer programme.">

  <!--
    The three faces. Cormorant Garamond and Lora are the editorial pairing
    the paper and ledger grounds use; Oswald is the touchline display face.
    Weights match what the canvas uses; every face has a real fallback in
    index.css.
  -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Oswald:wght@300;400;500;600&display=swap">

  <link rel="stylesheet" href="./index.css">
  <link rel="stylesheet" href="./styles.css">
</head>
```

Keep the `<body>` exactly as it is. `styles.css` stays linked until Task 2.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/design-tokens.test.ts src/entry-point.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the three gates**

Run: `npm test`, `npm run typecheck`, `npm run build` and check each exit code is 0. The full suite passes because every legacy name still resolves.

- [ ] **Step 7: Start the dev server and look**

Run `npm run dev` (or use the browser tool's `preview_start`) and open `/`. The page is now light with serif type and its old layout. Headings that were white are invisible; that is expected and Task 9 fixes it.

- [ ] **Step 8: Commit**

```bash
git add index.css index.html src/design-tokens.test.ts src/entry-point.test.ts
git commit -m "feat: the token sheet and the three grounds

index.css becomes the design system: fixed tokens, the same ground tokens
defined for paper, pitch and ledger under data-ground, and the legacy
--bhs-* names aliased onto them so every view keeps rendering until its
own phase rewrites it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Retire the legacy stylesheet

`styles.css` has 178 classes; the Vue app still reaches five of them through the help content (`help-steps`, `help-calc`, `help-calc-hl`, `.help-section mark` and the `help-*` rules `HelpView.vue` already restates) and the global `.btn` three admin sections rely on. Task 1 supplied `.btn`; this task moves the help rules and deletes the file.

**Files:**
- Modify: `src/views/HelpView.vue` (the unscoped `<style>` block at the end)
- Delete: `styles.css`
- Modify: `index.html`
- Modify: `src/entry-point.test.ts`, `src/design-tokens.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/entry-point.test.ts`:

```ts
  it('loads one stylesheet, the token sheet', () => {
    // styles.css was the legacy app's 2,205-line sheet. Its surviving rules
    // moved into the components that use them.
    expect(index).toContain('./index.css');
    expect(index).not.toContain('styles.css');
  });
```

Add to `src/design-tokens.test.ts`, a new top-level describe:

```ts
describe('the legacy stylesheet', () => {
  it('is gone', () => {
    expect(existsSync(join(process.cwd(), 'styles.css'))).toBe(false);
  });
});
```

and extend the import line at the top of that file to `import { readFileSync, existsSync } from 'node:fs';`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/design-tokens.test.ts src/entry-point.test.ts`
Expected: FAIL on both new cases.

- [ ] **Step 3: Move the help rules into `HelpView.vue`**

In `src/views/HelpView.vue`, the second style block (the unscoped one beginning `<style>` with the comment about v-html) already defines `.help-path`, `.help-note`, `.help-warn`, `.help-tablewrap` and `.help-table`. Append these rules to the end of that block, before `</style>`:

```css
/* Numbered because these genuinely are sequences: do this, then this. */
.help-steps { list-style: none; counter-reset: hstep; padding-left: 0 !important; }
.help-steps > li {
  counter-increment: hstep;
  position: relative;
  padding-left: 34px;
  margin-bottom: 10px;
}
.help-steps > li::before {
  content: counter(hstep);
  position: absolute;
  left: 0;
  top: 0;
  width: 23px;
  height: 23px;
  display: grid;
  place-items: center;
  border: 1px solid var(--live);
  border-radius: 50%;
  color: var(--live);
  font-family: var(--heading-face);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

/* A worked calculation, set as a figure. */
.help-calc {
  margin: 0 0 14px;
  padding: 13px 15px;
  overflow-x: auto;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: var(--surface-deep);
  color: var(--ink-muted);
  font-family: ui-monospace, "Courier New", monospace;
  font-size: 0.78rem;
  line-height: 1.75;
  font-variant-numeric: tabular-nums;
}
.help-calc-hl { color: var(--live); }

.section__body mark {
  padding: 0 2px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--rule-strong) 28%, transparent);
  color: var(--ink);
}
```

Also in that same unscoped block, replace the legacy names already there so the block is self-contained on the tokens:

- `border: 1px solid var(--bhs-navy-border)` → `border: 1px solid var(--rule)`
- `color: var(--text-muted, #94a3b8)` → `color: var(--ink-muted)`
- `border-left: 3px solid var(--bhs-cyan-accent)` → `border-left: 3px solid var(--live)`
- `border-left-color: var(--bhs-gold-accent)` → `border-left-color: var(--color-warning)` (a warning is a warning, not the org's colour)
- `color: var(--bhs-cyan-accent)` → `color: var(--live)`
- `color: var(--bhs-gold-accent)` → `color: var(--color-warning)`
- `border-bottom: 1px solid var(--bhs-navy-border)` → `border-bottom: 1px solid var(--rule)`
- `background: rgb(255 255 255 / 0.03)` → `background: color-mix(in srgb, var(--ink) 3%, transparent)`
- `color: #fff` (in `.section__body h4` and `.section__body b, strong`) → `color: var(--ink)`

- [ ] **Step 4: Delete the sheet and its link**

```bash
git rm styles.css
```

In `index.html`, delete the line `  <link rel="stylesheet" href="./styles.css">`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/design-tokens.test.ts src/entry-point.test.ts src/views/HelpView.test.ts src/content/help.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the three gates**

`npm test`, `npm run typecheck`, `npm run build`; all exit 0.

- [ ] **Step 7: Look at the admin screen**

Sign in as a coach on the dev server, open `/admin`, and confirm the Diagnostics, Import/Export and Organization profile sections still show outlined buttons (they were the three relying on the global `.btn`). Open `/help` and confirm a numbered step list still shows its numbers.

- [ ] **Step 8: Commit**

```bash
git add -A index.html src/views/HelpView.vue src/entry-point.test.ts src/design-tokens.test.ts
git commit -m "chore: retire styles.css

The legacy sheet's last five live rules move into HelpView's unscoped
block, restated on the tokens; the global outlined .btn now comes from
index.css. Nothing else in the file was referenced from a component.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The contrast guard and the renamed organization properties

`src/domain/theme.ts` learns to measure contrast and `themeVars` emits the four `--org-*` properties. The organization store needs no change: it already loops over whatever `themeVars` returns.

**Files:**
- Modify: `src/domain/theme.ts`
- Modify: `src/domain/theme.test.ts`
- Modify: `src/stores/organization.test.ts:104-112` (the "paints the organization colours" case)

**Interfaces:**
- Produces: `contrastRatio(a: string, b: string): number`, `guardedMark(colour: string, ground: string, fallback: string): string`, constants `PAPER_GROUND`, `DARK_GROUND`, `PAPER_MARK_FALLBACK`, `DARK_MARK_FALLBACK`, `MIN_MARK_CONTRAST`; `themeVars(b: Branding): Record<string, string>` with keys `--org-primary`, `--org-secondary`, `--org-mark-paper`, `--org-mark-dark`.

- [ ] **Step 1: Write the failing tests**

In `src/domain/theme.test.ts`, replace the `describe('themeVars', …)` block with:

```ts
describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#0047AB', '#0047AB')).toBeCloseTo(1, 5);
  });

  it('accepts three-digit hex', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 1);
  });

  it('clears the floor for the default colours on their grounds', () => {
    // The first organization must look exactly as the canvas draws it.
    expect(contrastRatio(DEFAULT_PRIMARY, PAPER_GROUND)).toBeGreaterThanOrEqual(MIN_MARK_CONTRAST);
    expect(contrastRatio(DEFAULT_SECONDARY, DARK_GROUND)).toBeGreaterThanOrEqual(MIN_MARK_CONTRAST);
  });
});

describe('guardedMark', () => {
  it('keeps a colour that reads against the ground', () => {
    expect(guardedMark('#0047AB', PAPER_GROUND, PAPER_MARK_FALLBACK)).toBe('#0047AB');
    expect(guardedMark('#FFD700', DARK_GROUND, DARK_MARK_FALLBACK)).toBe('#FFD700');
  });

  it('falls back when the organization colour would vanish', () => {
    // A club whose secondary is navy has chosen a colour that cannot be seen
    // on the navy ground. The interface adapts, not the admin. Spec §18.
    expect(guardedMark('#0A1428', DARK_GROUND, DARK_MARK_FALLBACK)).toBe(DARK_MARK_FALLBACK);
    // And a pale primary cannot be a keyline on paper.
    expect(guardedMark('#eeeeee', PAPER_GROUND, PAPER_MARK_FALLBACK)).toBe(PAPER_MARK_FALLBACK);
  });
});

describe('themeVars', () => {
  const branding = { name: 'X', mascot: 'Y', primary: '#111111', secondary: '#eeeeee' };

  it('emits the organization colours and their guarded marks', () => {
    const vars = themeVars(branding);
    expect(vars['--org-primary']).toBe('#111111');
    expect(vars['--org-secondary']).toBe('#eeeeee');
    // #111111 reads on paper; #eeeeee reads on navy.
    expect(vars['--org-mark-paper']).toBe('#111111');
    expect(vars['--org-mark-dark']).toBe('#eeeeee');
  });

  it('substitutes the fallback mark for a colour that fails its ground', () => {
    const vars = themeVars({ name: 'X', mascot: 'Y', primary: '#eeeeee', secondary: '#0A1428' });
    expect(vars['--org-primary']).toBe('#eeeeee');           // still painted, for stroke
    expect(vars['--org-mark-paper']).toBe(PAPER_MARK_FALLBACK);
    expect(vars['--org-mark-dark']).toBe(DARK_MARK_FALLBACK);
  });

  it('no longer emits the legacy names', () => {
    expect(themeVars(branding)['--bhs-blue-primary']).toBeUndefined();
  });

  it('returns only custom properties, so nothing else can be injected', () => {
    for (const key of Object.keys(themeVars(branding))) {
      expect(key).toMatch(/^--/);
    }
  });
});
```

Update the import at the top of the test file to:

```ts
import {
  brandingFor, themeVars, contrastRatio, guardedMark,
  DEFAULT_PRIMARY, DEFAULT_SECONDARY,
  PAPER_GROUND, DARK_GROUND, PAPER_MARK_FALLBACK, DARK_MARK_FALLBACK, MIN_MARK_CONTRAST
} from './theme';
```

In `src/stores/organization.test.ts`, change the painting case to the new name:

```ts
  it('paints the organization colours onto the document', async () => {
    localStorage.setItem('bhs_active_team_id', 't2');
    const store = useOrganizationStore();
    await store.load();
    await Promise.resolve();

    expect(document.documentElement.style.getPropertyValue('--org-primary'))
      .toBe('#123456');
    expect(document.documentElement.style.getPropertyValue('--org-secondary'))
      .toBe('#abcdef');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/domain/theme.test.ts src/stores/organization.test.ts`
Expected: FAIL — `contrastRatio` is not exported; `--org-primary` is empty.

- [ ] **Step 3: Implement**

In `src/domain/theme.ts`, replace everything from the `themeVars` doc comment to the end of the file with:

```ts
/** The two grounds a mark is guarded against. Spec §2.2. */
export const PAPER_GROUND = '#f3f2f2';
export const DARK_GROUND = '#0A1428';

/** What the mark becomes when the organization's colour cannot be seen. */
export const PAPER_MARK_FALLBACK = '#201f1d';
export const DARK_MARK_FALLBACK = '#FFD700';

/**
 * 3:1 is WCAG's floor for graphical objects and large text. The mark is a
 * keyline, a rank figure or a kicker — never body copy — so that is the right
 * floor for it.
 */
export const MIN_MARK_CONTRAST = 3;

/** sRGB relative luminance of a #rgb or #rrggbb colour, per WCAG 2. */
function luminance(hex: string): number {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const channel = (i: number): number => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio between two hex colours, 1 (identical) to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The organization's colour, or the fallback when it would vanish.
 *
 * An admin picks the colours, and a club whose secondary is navy has picked
 * one that cannot be seen on the navy ground. The spec's answer (§18) is that
 * the interface adapts rather than the admin: the colour is still painted for
 * stroke, but the mark reads.
 */
export function guardedMark(colour: string, ground: string, fallback: string): string {
  return contrastRatio(colour, ground) >= MIN_MARK_CONTRAST ? colour : fallback;
}

/**
 * The custom properties to paint onto the document.
 *
 * The raw colours, for stroke, and one guarded mark per ground. index.css
 * reads `--mark` from `--org-mark-paper` on the paper ground and from
 * `--org-mark-dark` on the two dark ones.
 */
export function themeVars(b: Branding): Record<string, string> {
  return {
    '--org-primary': b.primary,
    '--org-secondary': b.secondary,
    '--org-mark-paper': guardedMark(b.primary, PAPER_GROUND, PAPER_MARK_FALLBACK),
    '--org-mark-dark': guardedMark(b.secondary, DARK_GROUND, DARK_MARK_FALLBACK)
  };
}
```

Also update the file's header comment: replace the sentence beginning "The defaults match what app.core.js already used" with "The defaults are the app's historical colours, so an organization that has never set them looks as it did before."

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/domain/theme.test.ts src/stores/organization.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the three gates and commit**

All three exit 0. Then:

```bash
git add src/domain/theme.ts src/domain/theme.test.ts src/stores/organization.test.ts
git commit -m "feat: organization colours painted as --org-*, with a contrast guard

themeVars emits the raw primary and secondary for stroke and one guarded
mark per ground, so a club whose colour would vanish on its ground still
gets a readable mark. The interface adapts, not the admin.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The ground follows the route

A pure function maps route meta to a ground name; the router applies it after every navigation. Every existing route is paper in this phase, so the observable change is only that the attribute is maintained.

**Files:**
- Create: `src/router/ground.ts`
- Create: `src/router/ground.test.ts`
- Modify: `src/router/index.ts`

**Interfaces:**
- Produces: `type Ground = 'paper' | 'pitch' | 'ledger'`; `GROUNDS: Ground[]`; `groundFor(meta): Ground`; `applyGround(doc, ground): void`; and the `RouteMeta` augmentation `{ ground?: Ground; chrome?: 'tool' }` that Task 8 reads.

- [ ] **Step 1: Write the failing tests**

Create `src/router/ground.test.ts`:

```ts
/**
 * Which ground a route renders on.
 *
 * The ground is a function of the route, not of state: the touchline tools
 * are navy, the ratings are the ledger, everything else is paper. A route
 * that names no ground, or names one that does not exist, gets paper rather
 * than leaving the document unstyled.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { groundFor, applyGround, GROUNDS } from './ground';
import { router } from './index';

describe('groundFor', () => {
  it('returns the named ground', () => {
    expect(groundFor({ ground: 'pitch' })).toBe('pitch');
    expect(groundFor({ ground: 'ledger' })).toBe('ledger');
    expect(groundFor({ ground: 'paper' })).toBe('paper');
  });

  it('defaults to paper when the meta names nothing', () => {
    expect(groundFor({})).toBe('paper');
    expect(groundFor(undefined)).toBe('paper');
    expect(groundFor(null)).toBe('paper');
  });

  it('defaults to paper for a name that is not a ground', () => {
    expect(groundFor({ ground: 'navy' })).toBe('paper');
    expect(groundFor({ ground: 42 })).toBe('paper');
  });

  it('knows exactly three grounds', () => {
    expect(GROUNDS).toEqual(['paper', 'pitch', 'ledger']);
  });
});

describe('applyGround', () => {
  it('stamps the ground on the document element', () => {
    applyGround(document, 'ledger');
    expect(document.documentElement.dataset.ground).toBe('ledger');
  });

  it('tolerates no document at all', () => {
    expect(() => applyGround(undefined, 'pitch')).not.toThrow();
  });
});

describe('the router', () => {
  beforeEach(() => { document.documentElement.dataset.ground = 'ledger'; });

  it('applies the destination ground after every navigation', async () => {
    // Every route in this phase is paper, so navigating from a stale value
    // must reset it. The touchline and ledger routes arrive in phases 3–4.
    await router.push('/help');
    await router.isReady();
    expect(document.documentElement.dataset.ground).toBe('paper');
  });

  it('names a ground on every route', () => {
    for (const r of router.getRoutes()) {
      if (r.redirect) continue;
      expect(GROUNDS, r.path).toContain(r.meta.ground);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/router/ground.test.ts`
Expected: FAIL — `./ground` does not exist.

- [ ] **Step 3: Create `src/router/ground.ts`**

```ts
/**
 * Which ground a route renders on.
 *
 * Three grounds exist (spec §2.2): `paper`, the light editorial ground the
 * public and desk screens use; `pitch`, the navy touchline ground; `ledger`,
 * navy with the editorial faces for the ratings. Each defines the same token
 * names in index.css under `[data-ground]`, so a component never needs to
 * know which it is on.
 *
 * The ground is a property of the route, which is why it lives in meta and
 * not in a store: nobody chooses it, the screen implies it.
 */
export type Ground = 'paper' | 'pitch' | 'ledger';

export const GROUNDS: Ground[] = ['paper', 'pitch', 'ledger'];

declare module 'vue-router' {
  interface RouteMeta {
    /** The ground this route renders on. Absent means paper. */
    ground?: Ground;
    /**
     * 'tool' hides the header, nav and footer: the touchline and session
     * screens draw their own top and bottom bars. Read by App.vue.
     */
    chrome?: 'tool';
  }
}

/** The ground a route's meta names, or paper when it names none or nonsense. */
export function groundFor(meta: { ground?: unknown } | null | undefined): Ground {
  const g = meta?.ground;
  return GROUNDS.includes(g as Ground) ? (g as Ground) : 'paper';
}

/** Stamp the ground on the document element, where index.css reads it. */
export function applyGround(
  doc: { documentElement: { dataset: DOMStringMap } } | undefined,
  ground: Ground
): void {
  if (!doc) return;
  doc.documentElement.dataset.ground = ground;
}
```

- [ ] **Step 4: Wire the router**

In `src/router/index.ts`:

Add the import after the view imports:

```ts
import { groundFor, applyGround } from './ground';
```

Replace the `routes` array so every real route carries its ground. **Note that `/admin` and `/quiz` are not registered today** — `AdminView` and `QuizView` are imported and the catch-all redirects both paths to `/`, so the admin screen the guide describes is unreachable by URL. Register them here; `routeAllowed` already answers for `admin` (coach or admin) and allows `quiz` as an unknown name.

```ts
  routes: [
    { path: '/',         name: 'home',     component: HomeView,     meta: { ground: 'paper' } },
    { path: '/roster',   name: 'roster',   component: RosterView,   meta: { ground: 'paper' } },
    { path: '/schedule', name: 'schedule', component: ScheduleView, meta: { ground: 'paper' } },
    // The ratings move to the ledger ground in phase 4 of the restyle.
    { path: '/matrix',   name: 'matrix',   component: MatrixView,   meta: { ground: 'paper' } },
    { path: '/planner',  name: 'planner',  component: PlannerView,  meta: { ground: 'paper' } },
    { path: '/coaches',  name: 'coaches',  component: CoachesView,  meta: { ground: 'paper' } },
    { path: '/help',     name: 'help',     component: HelpView,     meta: { ground: 'paper' } },
    { path: '/admin',    name: 'admin',    component: AdminView,    meta: { ground: 'paper' } },
    { path: '/quiz',     name: 'quiz',     component: QuizView,     meta: { ground: 'paper' } },
    // Anything else is the home page rather than a dead end.
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ],
```

Add to `src/router/ground.test.ts`, inside `describe('the router', …)`:

```ts
  it('routes the admin screen and the quiz, which the nav does not list', () => {
    const paths = router.getRoutes().map(r => r.path);
    expect(paths).toContain('/admin');
    expect(paths).toContain('/quiz');
  });
```

After the `router.beforeEach(...)` block, add:

```ts
/**
 * The ground follows the route. Set after navigation rather than before so a
 * refused navigation never repaints the page it stayed on.
 */
router.afterEach((to) => {
  applyGround(typeof document === 'undefined' ? undefined : document, groundFor(to.meta));
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/router/ground.test.ts src/router/guards.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the three gates and commit**

```bash
git add src/router/ground.ts src/router/ground.test.ts src/router/index.ts
git commit -m "feat: the ground follows the route

groundFor maps route meta to one of the three grounds, defaulting to paper,
and the router stamps it on <html> after every navigation.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: What fits in the bottom bar

A pure function decides which nav items sit in the bar and which go behind More. It is separate from the component so the rule ("five fit; otherwise four plus More") is tested without mounting anything.

**Files:**
- Create: `src/domain/nav-bar.ts`
- Create: `src/domain/nav-bar.test.ts`

**Interfaces:**
- Produces: `barItems<T>(visible: T[], max?: number): { bar: T[]; overflow: T[] }`. `overflow.length > 0` is exactly when the More tab renders.

- [ ] **Step 1: Write the failing test**

Create `src/domain/nav-bar.test.ts`:

```ts
/**
 * Which items sit in the bottom bar.
 *
 * A phone's bottom bar holds five tabs comfortably and seven not at all. A
 * guest's four public items fit; a coach's seven become four plus More. The
 * strip that scrolled sideways with its scrollbar hidden was rejected once
 * already — the items past the edge were there and nothing said so.
 */
import { describe, it, expect } from 'vitest';
import { barItems } from './nav-bar';

const items = (n: number) => Array.from({ length: n }, (_, i) => `item${i + 1}`);

describe('barItems', () => {
  it('puts everything in the bar when it fits', () => {
    expect(barItems(items(4))).toEqual({ bar: items(4), overflow: [] });
    expect(barItems(items(5))).toEqual({ bar: items(5), overflow: [] });
  });

  it('keeps the first four and overflows the rest when it does not', () => {
    expect(barItems(items(7))).toEqual({
      bar: ['item1', 'item2', 'item3', 'item4'],
      overflow: ['item5', 'item6', 'item7']
    });
  });

  it('never overflows a single item — More would replace what it hides', () => {
    expect(barItems(items(6))).toEqual({
      bar: ['item1', 'item2', 'item3', 'item4'],
      overflow: ['item5', 'item6']
    });
  });

  it('honours a different capacity', () => {
    expect(barItems(items(4), 3)).toEqual({ bar: ['item1', 'item2'], overflow: ['item3', 'item4'] });
  });

  it('handles nothing', () => {
    expect(barItems([])).toEqual({ bar: [], overflow: [] });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/nav-bar.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/domain/nav-bar.ts`**

```ts
/**
 * Which items sit in a phone's bottom bar, and which go behind More.
 *
 * `max` tabs fit. When the visible list is within it, every item is in the
 * bar and there is no More. When it is not, the first `max - 1` are in the
 * bar and the rest overflow, so More takes the last slot rather than
 * replacing an item it would then have to hide.
 */
export interface BarSplit<T> {
  bar: T[];
  overflow: T[];
}

export function barItems<T>(visible: T[], max = 5): BarSplit<T> {
  if (visible.length <= max) return { bar: visible.slice(), overflow: [] };
  return { bar: visible.slice(0, max - 1), overflow: visible.slice(max - 1) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/domain/nav-bar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/nav-bar.ts src/domain/nav-bar.test.ts
git commit -m "feat: which nav items fit the bottom bar

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The navigation

`AppNav.vue` becomes a fixed bottom bar under 768px with a More sheet, and a hairline top nav above. Items get a short label for the tab; the full label stays in `NAV_ITEMS` for the router tests and as the link's `title`.

**Files:**
- Modify: `src/router/index.ts` (`NavItem` gains `short`)
- Modify: `src/components/layout/AppNav.vue` (rewrite)
- Modify: `src/components/layout/AppNav.test.ts`

**Interfaces:**
- Consumes: `barItems` from Task 5; `NAV_ITEMS`, `routeAllowed` from the router.
- Produces: DOM hooks `data-nav-item` (one per item in the bar, in `NAV_ITEMS` order, rendering the short label), `data-nav-toggle` (the More tab; present only when items overflow), `data-nav-drawer` (the sheet), `data-nav-sheet-item` (each link in the sheet), `data-nav-admin` (the Admin link in the sheet).

- [ ] **Step 1: Add short labels to `NAV_ITEMS`**

In `src/router/index.ts`:

```ts
export interface NavItem {
  name: string;
  path: string;
  /** The full name, for the router tests and a link's title. */
  label: string;
  /** What a bottom-bar tab has room for. */
  short: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  { name: 'home',     path: '/',          label: 'Home',               short: 'Home',     icon: '⚽' },
  { name: 'roster',   path: '/roster',    label: 'Roster & Bios',      short: 'Roster',   icon: '👥' },
  { name: 'schedule', path: '/schedule',  label: 'Schedule & Results', short: 'Schedule', icon: '📅' },
  { name: 'matrix',   path: '/matrix',    label: 'Player Ratings',     short: 'Ratings',  icon: '🏆' },
  { name: 'planner',  path: '/planner',   label: 'Coach Planner',      short: 'Planner',  icon: '📋' },
  { name: 'coaches',  path: '/coaches',   label: 'Coaching Staff',     short: 'Staff',    icon: '👔' },
  { name: 'help',     path: '/help',      label: 'Help',               short: 'Help',     icon: '📖' }
];
```

- [ ] **Step 2: Rewrite the test**

Replace `src/components/layout/AppNav.test.ts` with:

```ts
/**
 * Which nav items a visitor sees, and where.
 *
 * The list is filtered by the same rule the router guards on, so an item a
 * visitor may not reach is not rendered at all. On a phone the bar holds
 * five: a guest's four public items fit, a coach's seven become four plus a
 * More sheet holding the rest and the admin screen.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import AppNav from './AppNav.vue';

const PUBLIC = ['Home', 'Roster', 'Schedule', 'Help'];
const ALL = ['Home', 'Roster', 'Schedule', 'Ratings', 'Planner', 'Staff', 'Help'];

/** Mount with the auth store seeded to a role. */
function mountAs(state: Record<string, boolean>) {
  return mount(AppNav, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: false,
        initialState: {
          auth: {
            isCoach: false, isAdmin: false, canAccessRatings: false,
            isGuest: true, isLoggedIn: false, role: 'guest', user: null,
            ...state
          }
        }
      })],
      stubs: {
        RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' }
      }
    }
  });
}

const barLabels = (w: any) => w.findAll('[data-nav-item]').map((n: any) => n.text());
const sheetLabels = (w: any) => w.findAll('[data-nav-sheet-item]').map((n: any) => n.text());

describe('AppNav', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('shows all seven items to a coach, in their established order', () => {
    const w = mountAs({ isCoach: true, canAccessRatings: true, isGuest: false });
    expect(barLabels(w)).toEqual(ALL);
  });

  it('shows a guest only the four public items', () => {
    const w = mountAs({});
    expect(barLabels(w)).toEqual(PUBLIC);
  });

  it('shows a player the ratings but not the planner', () => {
    const w = mountAs({ canAccessRatings: true, isGuest: false });
    expect(barLabels(w)).toContain('Ratings');
    expect(barLabels(w)).not.toContain('Planner');
  });

  it('shows an admin the staff list without their being a coach', () => {
    const w = mountAs({ isAdmin: true, canAccessRatings: true, isGuest: false });
    expect(barLabels(w)).toContain('Staff');
    // The planner is isCoach() alone, matching the legacy rule.
    expect(barLabels(w)).not.toContain('Planner');
  });

  it('gives a guest no More tab — four items fit the bar', () => {
    const w = mountAs({});
    expect(w.find('[data-nav-toggle]').exists()).toBe(false);
    expect(w.find('[data-nav-drawer]').exists()).toBe(false);
  });

  it('puts a coach\'s overflow behind More, with the admin screen', () => {
    const w = mountAs({ isCoach: true, canAccessRatings: true, isGuest: false });
    expect(w.find('[data-nav-toggle]').exists()).toBe(true);
    expect(sheetLabels(w)).toEqual(['Planner', 'Staff', 'Help', 'Admin']);
    // The bar marks which of its items are behind More on a phone.
    const overflowed = w.findAll('[data-nav-item][data-nav-overflow]').map((n: any) => n.text());
    expect(overflowed).toEqual(['Planner', 'Staff', 'Help']);
  });

  it('offers Admin in the sheet to an admin who is not a coach', () => {
    const w = mountAs({ isAdmin: true, canAccessRatings: true, isGuest: false });
    expect(w.find('[data-nav-admin]').exists()).toBe(true);
  });

  it('opens the sheet and closes it again', async () => {
    const w = mountAs({ isCoach: true, canAccessRatings: true, isGuest: false });
    expect(w.find('[data-nav-drawer]').classes()).not.toContain('is-open');
    expect(w.find('[data-nav-toggle]').attributes('aria-expanded')).toBe('false');

    await w.find('[data-nav-toggle]').trigger('click');
    expect(w.find('[data-nav-drawer]').classes()).toContain('is-open');
    expect(w.find('[data-nav-toggle]').attributes('aria-expanded')).toBe('true');

    await w.find('[data-nav-toggle]').trigger('click');
    expect(w.find('[data-nav-drawer]').classes()).not.toContain('is-open');
  });

  it('closes the sheet when an item is chosen', async () => {
    // A sheet left open over the page it just navigated to reads as a bug.
    const w = mountAs({ isCoach: true, canAccessRatings: true, isGuest: false });
    await w.find('[data-nav-toggle]').trigger('click');
    await w.findAll('[data-nav-sheet-item]')[0].trigger('click');
    expect(w.find('[data-nav-drawer]').classes()).not.toContain('is-open');
  });

  it('closes the sheet on the backdrop', async () => {
    const w = mountAs({ isCoach: true, canAccessRatings: true, isGuest: false });
    await w.find('[data-nav-toggle]').trigger('click');
    await w.find('[data-nav-backdrop]').trigger('click');
    expect(w.find('[data-nav-drawer]').classes()).not.toContain('is-open');
  });

  it('keeps the full name on each link for assistive tech', () => {
    const w = mountAs({});
    const roster = w.findAll('[data-nav-item]')[1];
    expect(roster.attributes('title')).toBe('Roster & Bios');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/components/layout/AppNav.test.ts src/router/guards.test.ts`
Expected: the AppNav cases fail (labels are full names, no sheet); guards still pass.

- [ ] **Step 4: Rewrite `AppNav.vue`**

```vue
<script setup lang="ts">
/**
 * The main navigation: a bottom bar on a phone, a hairline top nav on a desk.
 *
 * The items come from NAV_ITEMS, the same list the router is built from, and
 * are filtered through the same routeAllowed() the navigation guard uses, so
 * an item a visitor cannot reach is not in the document at all.
 *
 * Under 768px the bar holds five. `barItems` decides which sit in it and
 * which go behind More — a sheet that also carries the admin screen, which is
 * not in NAV_ITEMS because most visitors cannot open it. Above 768px every
 * item is in the bar and the More tab and the sheet are display:none; the
 * bar renders every item once, with the overflowed ones marked, so the
 * split is a matter of CSS rather than two lists.
 */
import { ref, computed } from 'vue';
import { NAV_ITEMS, routeAllowed, type NavItem } from '../../router';
import { barItems } from '../../domain/nav-bar';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const sheetOpen = ref(false);

const visibleItems = computed(() =>
  NAV_ITEMS.filter(item => routeAllowed(item.name, {
    isCoach: () => auth.isCoach,
    isAdmin: () => auth.isAdmin,
    canAccessRatings: () => auth.canAccessRatings
  })));

const split = computed(() => barItems(visibleItems.value));
const overflowNames = computed(() => new Set(split.value.overflow.map(i => i.name)));
const hasMore = computed(() => split.value.overflow.length > 0);

/** The admin screen is reached on purpose; it lives in the sheet, not the bar. */
const showAdmin = computed(() => auth.isCoach || auth.isAdmin);

function isOverflow(item: NavItem): boolean {
  return overflowNames.value.has(item.name);
}

function toggleSheet(): void {
  sheetOpen.value = !sheetOpen.value;
}

/** A sheet left open over the page it just navigated to reads as a bug. */
function closeSheet(): void {
  sheetOpen.value = false;
}
</script>

<template>
  <nav class="nav" aria-label="Main">
    <ul class="nav__bar">
      <li
        v-for="item in visibleItems" :key="item.name"
        class="nav__item" :class="{ 'nav__item--overflow': isOverflow(item) }"
      >
        <RouterLink
          :to="item.path"
          class="nav__link"
          :title="item.label"
          data-nav-item
          :data-nav-overflow="isOverflow(item) ? '' : undefined"
          @click="closeSheet"
        >{{ item.short }}</RouterLink>
      </li>

      <li v-if="hasMore" class="nav__item nav__item--more">
        <button
          type="button"
          class="nav__link nav__more"
          data-nav-toggle
          :aria-expanded="sheetOpen ? 'true' : 'false'"
          aria-controls="nav-more"
          @click="toggleSheet"
        >More</button>
      </li>
    </ul>

    <div
      v-if="hasMore"
      id="nav-more"
      class="sheet"
      :class="{ 'is-open': sheetOpen }"
      data-nav-drawer
    >
      <div class="sheet__backdrop" data-nav-backdrop @click="closeSheet" />
      <ul class="sheet__list">
        <li v-for="item in split.overflow" :key="item.name" class="sheet__item">
          <RouterLink
            :to="item.path" class="sheet__link" :title="item.label"
            data-nav-sheet-item @click="closeSheet"
          >{{ item.short }}</RouterLink>
        </li>
        <li v-if="showAdmin" class="sheet__item">
          <RouterLink
            to="/admin" class="sheet__link" title="Admin"
            data-nav-sheet-item data-nav-admin @click="closeSheet"
          >Admin</RouterLink>
        </li>
      </ul>
    </div>
  </nav>
</template>

<style scoped>
/* ── The bar ── */

.nav__bar {
  display: flex;
  margin: 0;
  padding: 0;
  list-style: none;
}

.nav__item { flex: 1; min-width: 0; }

.nav__link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  padding: 0 var(--space-2);
  border: 0;
  border-top: 2px solid transparent;
  background: none;
  color: var(--ink-muted);
  font-family: var(--font-body);
  font-size: 10px;
  line-height: 1.3;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}

.nav__link:hover,
.nav__link:focus-visible { color: var(--ink); }

/* router-link-exact-active is applied by Vue Router to the current route. */
.nav__link.router-link-exact-active {
  color: var(--ink);
  border-top-color: var(--live);
}

/*
 * Under 768px: fixed to the bottom, on the surface, with the overflowed
 * items hidden and the More tab shown. The safe-area inset keeps the bar
 * above a phone's home indicator.
 */
@media (max-width: 767.98px) {
  .nav {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 40;
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--surface);
    border-top: 1px solid var(--rule);
  }

  .nav__item--overflow { display: none; }
}

/* 768px and above: a hairline top nav, every item in a row, no More. */
@media (min-width: 768px) {
  .nav {
    position: sticky;
    top: 0;
    z-index: 40;
    background: var(--ground);
    border-bottom: 1px solid var(--rule);
  }

  .nav__bar {
    gap: var(--space-4);
    max-width: 64rem;
    margin: 0 auto;
    padding: 0 var(--space-4);
  }

  .nav__item { flex: none; }

  .nav__link {
    min-height: 44px;
    padding: 0;
    border-top: 0;
    border-bottom: 1px solid transparent;
    font-size: 14px;
  }

  .nav__link.router-link-exact-active {
    border-top-color: transparent;
    border-bottom-color: var(--live);
    color: var(--live);
  }

  .nav__item--more,
  .sheet { display: none; }
}

/* ── The More sheet ── */

.sheet {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: none;
}

.sheet.is-open { display: block; }

.sheet__backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--ink) 40%, transparent);
}

.sheet__list {
  position: absolute;
  inset: auto 0 0 0;
  margin: 0;
  padding: var(--space-2) 0 calc(var(--space-8) + 48px + env(safe-area-inset-bottom));
  list-style: none;
  background: var(--surface);
  border-top: 1px solid var(--rule);
  box-shadow: var(--shadow-md);
}

.sheet__link {
  display: block;
  padding: var(--space-3) var(--space-4);
  color: var(--ink);
  font-size: 15px;
  text-decoration: none;
  border-bottom: 1px solid var(--rule);
}

.sheet__link:hover,
.sheet__link:focus-visible { background: color-mix(in srgb, var(--ink) 6%, transparent); }

.sheet__link.router-link-exact-active { color: var(--live); }
</style>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/layout/AppNav.test.ts src/router/guards.test.ts src/router/ground.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the three gates and look**

All three exit 0. On the dev server, use the browser tool's `resize_window` with the `mobile` preset: the bar sits at the bottom with Home, Roster, Schedule, Help for a guest. Sign in as a coach: Home, Roster, Schedule, Ratings, More; tap More; the sheet lists Planner, Staff, Help, Admin. Reset with the `desktop` preset: a hairline top nav with all seven.

- [ ] **Step 7: Commit**

```bash
git add src/router/index.ts src/components/layout/AppNav.vue src/components/layout/AppNav.test.ts
git commit -m "feat: the navigation is a bottom bar on a phone, a hairline on a desk

Five tabs fit; a coach's seven become four plus a More sheet that also
carries the admin screen. The items render once and CSS decides the split.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The crest header

`AppHeader.vue` becomes the crest block from canvas 1a: the keyline mark, the organization name and mascot, the team switcher grouped by organization, the season record, and one account button.

**Files:**
- Create: `src/domain/team-switcher.ts`, `src/domain/team-switcher.test.ts`
- Modify: `src/components/layout/AppHeader.vue` (rewrite)
- Create: `src/components/layout/AppHeader.test.ts`

**Interfaces:**
- Consumes: `org.branding`, `org.teams`, `org.schools`, `org.activeTeamId`, `org.activeTeam`, `org.setActiveTeam(id)` from the organization store; `schedule.record`, `schedule.loadedTeamId` from the schedule store; `auth.isGuest`, `auth.role`, `auth.logout()`.
- Produces: `teamGroups(teams, schools): TeamGroup[]` where `TeamGroup = { id: string; label: string; teams: { id: string; name: string; season: string }[] }`; DOM hooks `data-crest-mark`, `data-org-name`, `data-org-mascot`, `data-team-switcher`, `data-team-name`, `data-season-record`, `data-role-badge`, `data-account-btn`.

- [ ] **Step 1: Write the failing domain test**

Create `src/domain/team-switcher.test.ts`:

```ts
/**
 * Teams grouped by organization, for the switcher.
 *
 * The grouping is the point of the control: a person may coach a school team
 * and a club team, and confusing the two is the failure the switcher exists
 * to prevent. The label is the organization's name from its own row, never
 * a school code.
 */
import { describe, it, expect } from 'vitest';
import { teamGroups } from './team-switcher';

const SCHOOLS = [
  { id: 's1', name: 'Beaumont High School' },
  { id: 's2', name: 'Legends FC' }
];

describe('teamGroups', () => {
  it('groups teams under their organization, in the order the teams arrive', () => {
    const groups = teamGroups([
      { id: 't1', school_id: 's1', name: 'Varsity', season: '2026' },
      { id: 't2', school_id: 's1', name: 'JV', season: '2026' },
      { id: 't3', school_id: 's2', name: 'U16 Reds', season: null }
    ], SCHOOLS);

    expect(groups).toEqual([
      { id: 's1', label: 'Beaumont High School', teams: [
        { id: 't1', name: 'Varsity', season: '2026' },
        { id: 't2', name: 'JV', season: '2026' }
      ] },
      { id: 's2', label: 'Legends FC', teams: [
        { id: 't3', name: 'U16 Reds', season: '' }
      ] }
    ]);
  });

  it('falls back to the name the team row carries when the school is not loaded', () => {
    const groups = teamGroups([
      { id: 't3', school_id: 's9', name: 'U16', season: '', school_name: 'Riverside SC' }
    ], SCHOOLS);
    expect(groups[0].label).toBe('Riverside SC');
  });

  it('labels an organization it cannot name honestly rather than inventing one', () => {
    const groups = teamGroups([{ id: 't3', school_id: 's9', name: 'U16' }], []);
    expect(groups[0].label).toBe('Organization');
  });

  it('is empty for no teams', () => {
    expect(teamGroups([], SCHOOLS)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/domain/team-switcher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/domain/team-switcher.ts`**

```ts
/**
 * Teams grouped by organization, for the header's switcher.
 *
 * Almost everything on every screen is scoped to the active team, and a
 * person may belong to a school team and a club team at once. Grouping by
 * organization is what stops the two being confused. The label comes from
 * the organization's row, or from the name the team row carries when the
 * schools have not loaded — and never from a code.
 */
export interface SwitcherTeam {
  id: string;
  name: string;
  season: string;
}

export interface TeamGroup {
  id: string;
  label: string;
  teams: SwitcherTeam[];
}

export function teamGroups(teams: any[], schools: any[]): TeamGroup[] {
  const byId = new Map<string, any>((schools || []).map(s => [String(s.id), s]));
  const groups: TeamGroup[] = [];
  const index = new Map<string, TeamGroup>();

  for (const t of teams || []) {
    const key = String(t.school_id ?? '');
    let group = index.get(key);
    if (!group) {
      const school = byId.get(key);
      group = {
        id: key,
        label: (school && school.name) || t.school_name || 'Organization',
        teams: []
      };
      index.set(key, group);
      groups.push(group);
    }
    group.teams.push({ id: String(t.id), name: String(t.name || ''), season: t.season ? String(t.season) : '' });
  }

  return groups;
}
```

- [ ] **Step 4: Run it to verify it passes, then commit the domain piece**

Run: `npx vitest run src/domain/team-switcher.test.ts` → PASS.

```bash
git add src/domain/team-switcher.ts src/domain/team-switcher.test.ts
git commit -m "feat: teams grouped by organization for the switcher

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: Write the failing component test**

Create `src/components/layout/AppHeader.test.ts`:

```ts
/**
 * The crest: who you are looking at, and who you are.
 *
 * Every word of the branding comes from the organization's row. The mark is
 * the organization's initial in a keyline; the switcher groups teams by
 * organization; the record appears only once the schedule has actually been
 * read for the active team.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import AppHeader from './AppHeader.vue';
import { useOrganizationStore } from '../../stores/organization';

const BHS = { id: 's1', name: 'Beaumont High School', mascot: 'Cougars', colors: {} };
const CLUB = { id: 's2', name: 'Legends FC', mascot: 'Lions', colors: {} };
const VARSITY = { id: 't1', school_id: 's1', name: 'Varsity', season: '2026' };
const JV = { id: 't2', school_id: 's1', name: 'JV', season: '2026' };
const U16 = { id: 't3', school_id: 's2', name: 'U16 Reds', season: '' };

function mountWith(opts: {
  schools?: any[]; teams?: any[]; activeTeamId?: string | null; auth?: Record<string, any>;
  matches?: any[]; loadedTeamId?: string | null;
} = {}) {
  return mount(AppHeader, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        initialState: {
          organization: {
            schools: opts.schools ?? [BHS, CLUB],
            teams: opts.teams ?? [VARSITY, JV, U16],
            activeTeamId: opts.activeTeamId === undefined ? 't1' : opts.activeTeamId,
            loading: false, loadError: null
          },
          schedule: {
            matches: opts.matches ?? [],
            loading: false, loadError: null,
            loadedTeamId: opts.loadedTeamId === undefined ? null : opts.loadedTeamId
          },
          auth: {
            isCoach: false, isAdmin: false, canAccessRatings: false,
            isGuest: true, isLoggedIn: false, role: 'guest', user: null,
            ...(opts.auth || {})
          }
        }
      })],
      stubs: { AuthModal: true }
    }
  });
}

describe('AppHeader', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('draws the organization\'s initial as the mark, and its name and mascot', () => {
    const w = mountWith();
    expect(w.find('[data-crest-mark]').text()).toBe('B');
    expect(w.find('[data-org-name]').text()).toBe('Beaumont High School');
    expect(w.find('[data-org-mascot]').text()).toBe('Cougars');
  });

  it('follows the active team to its organization', () => {
    const w = mountWith({ activeTeamId: 't3' });
    expect(w.find('[data-crest-mark]').text()).toBe('L');
    expect(w.find('[data-org-mascot]').text()).toBe('Lions');
  });

  it('draws no mark and no mascot before an organization has loaded', () => {
    // No fallback name: a visitor mid-load must not be told they are at
    // some other organization's team. The store's `school` falls back to
    // the first school, so seed none.
    const w = mountWith({ schools: [], teams: [], activeTeamId: null });
    expect(w.find('[data-crest-mark]').exists()).toBe(false);
    expect(w.find('[data-org-mascot]').exists()).toBe(false);
  });

  it('offers the switcher grouped by organization when there is more than one team', () => {
    const w = mountWith();
    const groups = w.findAll('[data-team-switcher] optgroup');
    expect(groups.map(g => g.attributes('label'))).toEqual(['Beaumont High School', 'Legends FC']);
    expect(w.findAll('[data-team-switcher] option').map(o => o.text()))
      .toEqual(['Varsity · 2026', 'JV · 2026', 'U16 Reds']);
    expect((w.find('[data-team-switcher]').element as HTMLSelectElement).value).toBe('t1');
  });

  it('switches the active team', async () => {
    const w = mountWith();
    await w.find('[data-team-switcher]').setValue('t3');
    // createTestingPinia stubs actions with spies; the hook returns that store.
    const org = useOrganizationStore();
    expect(org.setActiveTeam).toHaveBeenCalledWith('t3');
  });

  it('shows the one team as text when there is nothing to switch to', () => {
    const w = mountWith({ teams: [VARSITY] });
    expect(w.find('[data-team-switcher]').exists()).toBe(false);
    expect(w.find('[data-team-name]').text()).toBe('Varsity · 2026');
  });

  it('shows the record once the schedule has been read', () => {
    const w = mountWith({
      loadedTeamId: 't1',
      matches: [
        { status: 'COMPLETED', score: '3-1' },
        { status: 'COMPLETED', score: '1-1' },
        { status: 'COMPLETED', score: '0-2' },
        { status: 'SCHEDULED' }
      ]
    });
    expect(w.find('[data-season-record]').text().replace(/\s+/g, ' ')).toBe('1W 1L 1D');
  });

  it('claims nothing about the season until the schedule has loaded', () => {
    expect(mountWith({ loadedTeamId: null }).find('[data-season-record]').exists()).toBe(false);
    expect(mountWith({ loadedTeamId: 't1', matches: [] }).find('[data-season-record]').exists()).toBe(false);
  });

  it('offers a guest sign-in and a member sign-out with their role', () => {
    const guest = mountWith();
    expect(guest.find('[data-account-btn]').text()).toBe('Sign in');
    expect(guest.find('[data-role-badge]').exists()).toBe(false);

    const coach = mountWith({ auth: { isGuest: false, isLoggedIn: true, role: 'coach', user: { name: 'Sam' } } });
    expect(coach.find('[data-account-btn]').text()).toBe('Sign out');
    expect(coach.find('[data-role-badge]').text()).toBe('COACH');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/components/layout/AppHeader.test.ts`
Expected: FAIL — the mark, switcher and record hooks do not exist.

- [ ] **Step 7: Rewrite `AppHeader.vue`**

```vue
<script setup lang="ts">
/**
 * The crest: who you are looking at, and who you are.
 *
 * Every word of the branding comes from the organization's row. The mark is
 * the organization's initial inside a keyline drawn in its own colour — the
 * one place on the paper ground the organization's primary appears, as
 * stroke. The team switcher groups teams by organization because that
 * distinction is the point: a person may coach a school team and a club
 * team, and confusing the two is the failure the control exists to prevent.
 */
import { computed, ref } from 'vue';
import AuthModal from '../auth/AuthModal.vue';
import { useAuthStore } from '../../stores/auth';
import { useOrganizationStore } from '../../stores/organization';
import { useScheduleStore } from '../../stores/schedule';
import { teamGroups } from '../../domain/team-switcher';

const auth = useAuthStore();
const org = useOrganizationStore();
const schedule = useScheduleStore();
const authOpen = ref(false);

/** The first letter of the organization's name; nothing before it loads. */
const initial = computed(() => (org.branding.name || '').trim().charAt(0).toUpperCase());

const groups = computed(() => teamGroups(org.teams, org.schools));
const showSwitcher = computed(() => org.teams.length > 1);

const activeTeamText = computed(() => {
  const t: any = org.activeTeam;
  if (!t) return '';
  return t.season ? `${t.name} · ${t.season}` : String(t.name || '');
});

/**
 * Nothing is claimed about the season until the schedule has actually been
 * read for this team. The header does not load it: the home and schedule
 * screens do, and a record that appears as you reach them is honest.
 */
const record = computed(() => schedule.loadedTeamId ? schedule.record : null);
const showRecord = computed(() => !!record.value && record.value.gamesPlayed > 0);

const accountLabel = computed(() => auth.isGuest ? 'Sign in' : 'Sign out');
const badgeText = computed(() => String(auth.role || '').toUpperCase());

function onTeamChange(e: Event): void {
  const value = (e.target as HTMLSelectElement).value;
  org.setActiveTeam(value || null);
}

async function onAccountClick(): Promise<void> {
  if (auth.isGuest) { authOpen.value = true; return; }
  await auth.logout();
}
</script>

<template>
  <header class="crest">
    <div class="crest__row">
      <span v-if="initial" class="crest__mark" aria-hidden="true" data-crest-mark>{{ initial }}</span>

      <div class="crest__names">
        <p class="crest__org kicker tnum" data-org-name>{{ org.branding.name || ' ' }}</p>
        <p v-if="org.branding.mascot" class="crest__mascot" data-org-mascot>
          {{ org.branding.mascot }}
        </p>
      </div>

      <div class="crest__account">
        <span v-if="!auth.isGuest" class="crest__badge" data-role-badge>{{ badgeText }}</span>
        <button type="button" class="crest__btn" data-account-btn @click="onAccountClick">
          {{ accountLabel }}
        </button>
      </div>
    </div>

    <div class="crest__row crest__row--meta">
      <label v-if="showSwitcher" class="switcher">
        <span class="sr-only">Team</span>
        <select
          class="switcher__select"
          data-team-switcher
          :value="org.activeTeamId || ''"
          @change="onTeamChange"
        >
          <optgroup v-for="g in groups" :key="g.id" :label="g.label">
            <option v-for="t in g.teams" :key="t.id" :value="t.id">
              {{ t.season ? `${t.name} · ${t.season}` : t.name }}
            </option>
          </optgroup>
        </select>
        <span class="switcher__caret" aria-hidden="true">▾</span>
      </label>
      <span v-else-if="activeTeamText" class="switcher__static" data-team-name>{{ activeTeamText }}</span>
      <span v-else />

      <span v-if="showRecord" class="record tnum" data-season-record aria-label="Season record">
        <span>{{ record!.wins }}<em>W</em></span>
        <span>{{ record!.losses }}<em>L</em></span>
        <span>{{ record!.draws }}<em>D</em></span>
      </span>
    </div>

    <AuthModal :open="authOpen" @close="authOpen = false" />
  </header>
</template>

<style scoped>
.crest {
  padding: var(--space-4) var(--space-4) var(--space-3);
  border-bottom: 1px solid var(--rule);
  background: var(--ground);
}

.crest__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  max-width: 64rem;
  margin: 0 auto;
}

.crest__row--meta {
  justify-content: space-between;
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--rule);
}

/* The organization's initial in a keyline of its own colour. Stroke only. */
.crest__mark {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 38px;
  height: 38px;
  border: 1.5px solid var(--mark);
  border-radius: var(--radius-sm);
  color: var(--mark);
  font-family: var(--heading-face);
  font-size: 19px;
  line-height: 1;
}

.crest__names { flex: 1; min-width: 0; }

.crest__org {
  line-height: 1.3;
  color: var(--ink-muted);
  letter-spacing: 0.14em;
}

.crest__mascot {
  font-family: var(--heading-face);
  font-size: 26px;
  font-weight: 500;
  line-height: 1.1;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.crest__account {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.crest__badge {
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.crest__btn {
  min-height: 34px;
  padding: 0 var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font-family: var(--heading-face);
  font-size: 14px;
  cursor: pointer;
}

.crest__btn:hover,
.crest__btn:focus-visible { border-color: var(--live); color: var(--live); }

/* The switcher reads as text with a caret, not as a form control. */
.switcher {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--ink);
  font-size: 12.5px;
}

.switcher__select {
  appearance: none;
  -webkit-appearance: none;
  padding: 6px 18px 6px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.switcher__caret {
  position: absolute;
  right: 0;
  color: var(--live);
  pointer-events: none;
}

.switcher__static { font-size: 12.5px; color: var(--ink); }

.record {
  display: flex;
  gap: 10px;
  font-size: 12.5px;
  color: var(--ink);
}

.record em {
  font-style: normal;
  color: var(--ink-muted);
}
</style>
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/components/layout/AppHeader.test.ts src/views/HomeView.test.ts`
Expected: PASS.

- [ ] **Step 9: Run the three gates and look**

All three exit 0. On the dev server at the mobile preset the header shows the keyline initial, the organization name as a kicker, the mascot as the heading, the switcher (when the viewer has more than one team) and, on Home after the schedule loads, the record.

- [ ] **Step 10: Commit**

```bash
git add src/components/layout/AppHeader.vue src/components/layout/AppHeader.test.ts
git commit -m "feat: the crest header

The organization's initial in a keyline of its own colour, its name and
mascot, the team switcher grouped by organization, and the record once
the schedule has been read.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The shell hides itself on tool routes, and the footer

`App.vue` reads `meta.chrome` and drops the header, nav and footer for a tool screen; the footer takes the tokens. No tool route exists until phase 3, so the test supplies one.

**Files:**
- Modify: `src/App.vue`
- Modify: `src/components/layout/AppFooter.vue`
- Create: `src/App.test.ts`

**Interfaces:**
- Consumes: `RouteMeta.chrome` from Task 4.

- [ ] **Step 1: Write the failing test**

Create `src/App.test.ts`:

```ts
/**
 * The shell.
 *
 * On an ordinary route the header, nav and footer wrap the view. On a route
 * marked `chrome: 'tool'` — the touchline and session screens — they are
 * gone, because those screens draw their own top and bottom bars and a
 * second header over a match clock is in the way.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { createRouter, createMemoryHistory } from 'vue-router';
import App from './App.vue';
import { useOrganizationStore } from './stores/organization';

const Page = { template: '<p data-page>page</p>' };
const Tool = { template: '<p data-page>tool</p>' };

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Page, meta: { ground: 'paper' } },
      { path: '/tool', component: Tool, meta: { ground: 'pitch', chrome: 'tool' } }
    ]
  });
  await router.push(path);
  await router.isReady();

  const w = mount(App, {
    global: {
      plugins: [router, createTestingPinia({ createSpy: vi.fn })],
      stubs: {
        AppHeader: { template: '<header data-stub-header />' },
        AppNav: { template: '<nav data-stub-nav />' },
        AppFooter: { template: '<footer data-stub-footer />' }
      }
    }
  });
  await flushPromises();
  return w;
}

describe('App', () => {
  it('wraps an ordinary route in the header, nav and footer', async () => {
    const w = await mountAt('/');
    expect(w.find('[data-stub-header]').exists()).toBe(true);
    expect(w.find('[data-stub-nav]').exists()).toBe(true);
    expect(w.find('[data-stub-footer]').exists()).toBe(true);
    expect(w.find('[data-page]').text()).toBe('page');
    expect(w.find('main').classes()).not.toContain('shell__main--tool');
  });

  it('drops all three on a tool route', async () => {
    const w = await mountAt('/tool');
    expect(w.find('[data-stub-header]').exists()).toBe(false);
    expect(w.find('[data-stub-nav]').exists()).toBe(false);
    expect(w.find('[data-stub-footer]').exists()).toBe(false);
    expect(w.find('[data-page]').text()).toBe('tool');
    expect(w.find('main').classes()).toContain('shell__main--tool');
  });

  it('loads the organization once, at the shell', async () => {
    await mountAt('/');
    const org = useOrganizationStore();
    expect(org.load).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/App.test.ts`
Expected: the tool-route case fails — header, nav and footer are still rendered.

- [ ] **Step 3: Update `App.vue`**

```vue
<script setup lang="ts">
/**
 * The application shell.
 *
 * The organization loads once, here, rather than in each view: its branding
 * paints the whole page and every screen scopes to the active team.
 *
 * A route marked `chrome: 'tool'` renders bare. The touchline and session
 * screens draw their own top and bottom bars, and a header over a match
 * clock is in the way of a coach holding a phone one-handed.
 */
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import AppHeader from './components/layout/AppHeader.vue';
import AppNav from './components/layout/AppNav.vue';
import AppFooter from './components/layout/AppFooter.vue';
import { useOrganizationStore } from './stores/organization';

const org = useOrganizationStore();
const route = useRoute();
const toolChrome = computed(() => route.meta.chrome === 'tool');

onMounted(() => org.load());
</script>

<template>
  <AppHeader v-if="!toolChrome" />
  <AppNav v-if="!toolChrome" />

  <main id="main" class="shell__main" :class="{ 'shell__main--tool': toolChrome }">
    <p v-if="org.loadError" class="shell__error" role="alert">
      {{ org.loadError }}
    </p>
    <RouterView />
  </main>

  <AppFooter v-if="!toolChrome" />
</template>

<style scoped>
.shell__main {
  min-height: 60vh;
}

/* Room for the fixed bottom bar on a phone. A tool route has no bar. */
@media (max-width: 767.98px) {
  .shell__main:not(.shell__main--tool) {
    padding-bottom: calc(72px + env(safe-area-inset-bottom));
  }
}

.shell__error {
  margin: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-warning);
  border-left-width: 4px;
  border-radius: var(--radius-md);
  color: var(--ink);
  font-size: 0.9rem;
}
</style>
```

- [ ] **Step 4: Restyle the footer**

In `src/components/layout/AppFooter.vue`, replace the `<style scoped>` block with:

```css
.foot {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  max-width: 64rem;
  margin: var(--space-8) auto 0;
  padding: var(--space-4);
  border-top: 1px solid var(--rule);
  color: var(--ink-muted);
  font-size: 0.78rem;
}

.foot__build {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  cursor: help;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/App.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the three gates and commit**

```bash
git add src/App.vue src/App.test.ts src/components/layout/AppFooter.vue
git commit -m "feat: the shell steps aside on a tool route

Header, nav and footer render only when the route's meta does not mark it
a tool; the main region leaves room for the bottom bar on a phone; the
footer takes the tokens.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: No hardcoded whites

Forty-two components set `color: #fff` because the ground used to be navy. On paper that text is invisible. This task replaces every white literal in component styles with `var(--ink)` and white tints with an ink mix, and adds a guard so none come back.

**Files:**
- Modify: every `src/**/*.vue` whose `<style>` block contains `#fff`, `#ffffff`, `white`, or `rgb(a)(255, 255, 255 …)`
- Modify: `src/design-tokens.test.ts`

- [ ] **Step 1: Write the failing guard**

Add to `src/design-tokens.test.ts`:

```ts
import { readdirSync, statSync } from 'node:fs';

/** Every .vue file under src/. */
function vueFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) vueFiles(p, out);
    else if (p.endsWith('.vue')) out.push(p);
  }
  return out;
}

/** The style blocks of a single-file component, joined. */
function styleOf(path: string): string {
  const src = readFileSync(path, 'utf8');
  return Array.from(src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)).map(m => m[1]).join('\n');
}

describe('component styles', () => {
  const files = vueFiles(join(process.cwd(), 'src'));

  it('set no hardcoded white — the ground is not always dark any more', () => {
    const offenders = files.filter(f => /#fff\b|#ffffff\b|:\s*white\b|rgba?\(\s*255\s*,?\s*255\s*,?\s*255/i.test(styleOf(f)));
    expect(offenders.map(f => f.replace(process.cwd(), '')), 'use var(--ink) or a color-mix of it').toEqual([]);
  });
});
```

Put the `readdirSync, statSync` names on the existing `node:fs` import line instead of a second import.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/design-tokens.test.ts`
Expected: FAIL listing the 42 files.

- [ ] **Step 3: Run the sweep**

Write this script to the scratchpad (it is not committed) and run it from the repo root with `node <path>/sweep-white.mjs`:

```js
// Replace hardcoded whites inside <style> blocks of .vue files with tokens.
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.vue')) out.push(p);
  }
  return out;
}

const pct = (a) => Math.round(parseFloat(a) * 100);

function sweep(css) {
  return css
    // rgb(255 255 255 / .12) and rgba(255, 255, 255, 0.12) → ink at 12%
    .replace(/rgba?\(\s*255\s*,?\s*255\s*,?\s*255\s*[,/]\s*([0-9.]+)\s*\)/gi,
      (_, a) => `color-mix(in srgb, var(--ink) ${pct(a)}%, transparent)`)
    // #fff / #ffffff / white as a value → the ink
    .replace(/#ffffff\b/gi, 'var(--ink)')
    .replace(/#fff\b/gi, 'var(--ink)')
    .replace(/(:\s*)white\b/gi, '$1var(--ink)');
}

let changed = 0;
for (const file of walk('src')) {
  const src = readFileSync(file, 'utf8');
  const out = src.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (_, open, css, close) => open + sweep(css) + close);
  if (out !== src) { writeFileSync(file, out); changed++; console.log('swept', file); }
}
console.log(`${changed} files changed`);
```

- [ ] **Step 4: Read the diff**

Run `git diff --stat` and then `git diff` and read every hunk. Two kinds of replacement are wrong and must be undone by hand:

- A white used as a **fill behind dark text**, such as a light button with `background: #fff; color: var(--text-dark)`. That should become `background: var(--ink); color: var(--ground)` so the pair inverts together on every ground.
- A white on the **tactical board canvas** or in `src/diagram/` (there should be none in `.vue` styles, but check).

Everything else — `color: #fff` on headings, names, values; `border-color: #fff`; translucent white tints — is correct as `var(--ink)` and its mixes.

- [ ] **Step 5: Run the guard and the full suite**

Run: `npx vitest run src/design-tokens.test.ts` → PASS.
Run the three gates; all exit 0. Component tests that asserted on inline colour would fail here; none are expected to, but a failure names the file.

- [ ] **Step 6: Look at every route**

On the dev server, at the mobile preset and then at desktop, open `/`, `/roster`, `/schedule`, `/help`, then sign in as a coach and open `/matrix`, `/planner`, `/coaches`, `/admin`, `/quiz`. Every heading, name and figure is readable on the paper ground. Open one modal on each screen (the auth modal, add player, add fixture, the session grid, a drill form) and confirm its text reads. Note anything that is still low-contrast and fix it in the same task if it is a colour token, or leave it for its phase if it is a layout.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "fix: no hardcoded white in component styles

The ground is no longer always navy. Every white becomes the ink, every
white tint an ink mix, and a test keeps it that way.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: The guide, and the phase gate

`CLAUDE.md` describes the conventions; it must describe the tokens rather than the names this phase retired. Then the whole phase is verified as one.

**Files:**
- Modify: `CLAUDE.md` (the Conventions section, and the Layout table's `index.html` row)

- [ ] **Step 1: Update the conventions**

In `CLAUDE.md`, replace the bullet beginning "Component styles are scoped; shared design tokens are CSS custom properties in `index.css`" with:

```markdown
- **Component styles are scoped and style against the ground tokens in `index.css`** — `--ground`, `--surface`, `--surface-deep`, `--ink`, `--ink-muted`, `--ink-soft`, `--rule`, `--rule-strong`, `--live`, `--mark`, `--heading-face`, `--shadow-md` — never a literal colour. The same names are defined for three grounds (`paper`, `pitch`, `ledger`) under `data-ground` on `<html>`, which the router sets from `meta.ground` (`src/router/ground.ts`). The organization's colours arrive as `--org-primary` / `--org-secondary` (raw, for stroke) and `--org-mark-paper` / `--org-mark-dark` (after the 3:1 contrast guard in `domain/theme.ts`); `--mark` reads the right one per ground. **The `--bhs-*` names are temporary aliases** from the restyle's phase 1 and are deleted in phase 5 — do not use them in new work. `src/design-tokens.test.ts` guards all of this, including that no component style hardcodes a white.
- **Routes carry `meta.chrome: 'tool'`** to render without the header, nav and footer; the touchline and session screens draw their own bars. Spec: `docs/superpowers/specs/2026-09-07-mobile-restyle-design.md`.
```

In the Layout table, change the `index.html` row's second cell to:

```markdown
The only entry document. Mounts `#vue-app`, loads `src/vue-main.ts`, the fonts and the two CDN libraries. `data-ground="paper"` on `<html>` so the first paint has tokens.
```

Also delete the sentence in the Project section, if present, that mentions `styles.css`, and add to the "Commands" section's verification list nothing — the three gates are unchanged.

- [ ] **Step 2: Run the three gates for the whole phase**

```bash
npm test > /dev/null 2>&1; echo "TEST EXIT=$?"
npm run typecheck > /dev/null 2>&1; echo "TYPECHECK EXIT=$?"
npm run build > /dev/null 2>&1; echo "BUILD EXIT=$?"
```

All three print `0`. Then run `npm test` once more visibly and record the test and file counts for the phase-2 plan's baseline line.

- [ ] **Step 3: Confirm the exit conditions of the phase**

- `grep -rn "styles.css" index.html src` returns nothing.
- `grep -rn "Inter" index.css index.html` returns nothing.
- `git grep -n -- "--bhs-" src | wc -l` is greater than zero (the aliases are still consumed — that is expected; phase 5 removes them).
- At the mobile preset, `/` shows the crest header, the page, and the bottom bar; at desktop it shows the crest, the hairline top nav and the hairline footer.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: the guide describes the tokens and grounds

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review against the spec

- §2.1 fixed tokens, faces, `.tnum`, fonts in `index.html` — Task 1.
- §2.2 three ground blocks with the same names; `--heading-face`; `--mark` per ground — Task 1.
- §2.3 `--org-*` names, contrast guard at 3:1, fallbacks `#201f1d` and `#FFD700`, aliases for the migration — Tasks 1 and 3.
- §2.4 `groundFor`, `afterEach`, `data-ground="paper"` in `index.html` — Tasks 1 and 4. Task 4 also registers `/admin` and `/quiz`, which the router imported but never routed; the More sheet (§3.2) links to `/admin` and needs it reachable.
- §3.1 crest header: mark, kicker, mascot, switcher grouped by organization and hidden for one team, record only once settled, one account button with the role badge — Task 7.
- §3.2 bottom bar under 768px, top nav above, `barItems`, More sheet with Admin, hooks kept, `main` bottom padding, staff gating unchanged — Tasks 5, 6, 8.
- §3.3 footer — Task 8.
- §3.4 tool chrome — Task 8 (the routes themselves are phase 3).
- §7 `styles.css` deleted, surviving rules moved, helpers dropped, aliases added now and removed in phase 5 — Tasks 1, 2.
- §8 new tests: theme contrast, `groundFor`, `barItems`, `App` tool chrome, `AppNav` changes — Tasks 3, 4, 5, 6, 8. (`shortCountdown` and the route guards are phases 2 and 3.)
- §9 phase 1 exit: every view renders on paper with the new tokens — Task 9.

Placeholder scan: every code step has its code; the only "write to the scratchpad" step is the sweep script, which is given in full. Type consistency: `Ground`, `groundFor`, `applyGround` (Task 4) are what `router/index.ts` imports; `barItems` returns `{ bar, overflow }` in Task 5 and is read that way in Task 6; `teamGroups` returns `{ id, label, teams }` in Task 7's domain and template alike; `RouteMeta.chrome` is declared in Task 4 and read in Task 8.
