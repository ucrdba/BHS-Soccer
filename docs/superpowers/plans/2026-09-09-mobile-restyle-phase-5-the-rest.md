# Mobile Restyle — Phase 5 ("The rest") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle Planner, Coaching Staff, Help, Quiz, Admin and every remaining
modal onto the paper ground's tokens, and delete the `--bhs-*` aliases from
`index.css` so a grep for `--bhs-` in `src/` returns nothing.

**Architecture:** The previous four phases restyled screen by screen, and each
one restated the same handful of rules in its own scoped block — an outlined
button, a labelled input, a small tag, a hairline row, a muted note. Twenty-four
files still carry those copies, styled against the temporary aliases. This phase
promotes that set to `index.css` once (Task 1), then each screen task deletes its
local copies, adopts the shared classes, and moves whatever is genuinely its own
onto the ground tokens. The alias block goes last, when nothing reads it.

**Tech Stack:** Vue 3 `<script setup>`, scoped SFC styles, plain CSS custom
properties, Vitest + `@vue/test-utils`.

**Spec:** `docs/superpowers/specs/2026-09-07-mobile-restyle-design.md` — §2.2
(ground tokens), §5.1 (paper ground; the phase-5 screens are the paragraph
beginning "Coaching Staff, Help, Quiz, Admin, Planner"), §5.4 (dialogs), §6
(widths), §7 (retiring the legacy stylesheet), §9 item 5 (this phase).

---

## Global Constraints

- **No literal colours in a component style.** Every value comes from a ground
  token: `--ground`, `--surface`, `--surface-deep`, `--ink`, `--ink-muted`,
  `--ink-soft`, `--rule`, `--rule-strong`, `--live`, `--mark`, `--heading-face`,
  `--shadow-md`, plus the fixed `--color-success` / `--color-warning` /
  `--color-danger`, `--space-1…8`, `--radius-sm/md/lg`, `--font-heading` /
  `--font-body` / `--font-display`. `src/design-tokens.test.ts` already fails the
  build on a hardcoded white in any `.vue` style block.
- **No `--bhs-*` and no `--text-muted` / `--text-main` in `src/` when the phase
  ends.** `grep -rn -- '--bhs-\|--text-muted\|--text-main' src/` returning
  nothing is the exit condition (spec §7). `src/design-tokens.test.ts` and
  `src/domain/theme.test.ts` may still name them — they test the alias block
  itself — and `src/diagram/legacy/diagrammer.legacy.js` is a frozen fixture that
  is never edited (CLAUDE.md).
- **Colour is stroke, never fill** (spec §2.3). A button is an outline; the
  organization's colour is a keyline, not a background.
- **Paper rules** for every screen in this phase (spec §5.1): editorial
  headings in `var(--heading-face)`, `.kicker` for section labels, hairline
  sections, outlined buttons, bordered *unfilled* cards, `.plate` on
  photographs.
- **Widths** (spec §6): under 768px the canvas layout with 18–20px side padding;
  at 768px and above a centred measure — 64rem for tables, 40rem for reading
  pages. Help's prose measure is 38em with a sticky section index on the left
  and the search box above it.
- **`BaseModal` keeps its focus, Escape and scroll behaviour** and stays a
  bottom sheet under 640px (spec §5.4).
- **The tactical board canvas, its toolbar behaviour and the print layout are
  untouched** (spec §5.1) — only the surrounding chrome takes the tokens.
- **Verification is three gates, by exit code, at the end of every task:**
  `npm test`, `npm run typecheck`, `npm run build`. A green-looking Vitest run
  that exits non-zero has found a real bug (CLAUDE.md).
- **Commits follow Conventional Commits** and end with the trailer
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Tests select on `data-*` attributes, not classes.** A repo-wide grep finds
  only seven class selectors in tests (`.won`, `.skill__value`, `.skill__name`,
  `.plate__img`, `.is-short`, `.figure__value`, `.figure__label`) and none of
  them is in a phase-5 file except `.plate__img`, which Task 1 names explicitly.
  Renaming a class in a phase-5 template is therefore safe; **removing or
  renaming a `data-*` attribute is not** and must not happen in this phase.

---

## File Structure

**Created:** nothing. This phase adds no module.

**Modified — the shared sheet and its guard**

| File | Responsibility after this phase |
| --- | --- |
| `index.css` | Gains the paper primitives (Task 1); loses the alias block (Task 9). |
| `src/design-tokens.test.ts` | Gains a growing allowlist of files proved free of legacy names (Task 1), which every screen task extends; Task 9 replaces it with "every file". |

**Modified — the screens, one task each**

| Task | Files |
| --- | --- |
| 2 | `src/components/ui/BaseModal.vue` |
| 3 | `src/views/CoachesView.vue`, `src/components/coaches/CoachFormModal.vue` |
| 4 | `src/views/HelpView.vue` |
| 5 | `src/views/QuizView.vue`, `src/views/PlaceholderView.vue` |
| 6 | `src/views/AdminView.vue`, the eight `src/components/admin/*Section.vue`, `src/components/admin/ImportExportModal.vue` |
| 7 | `src/views/PlannerView.vue`, the six `src/components/planner/*.vue` |
| 8 | `src/components/auth/AuthModal.vue`, `src/components/roster/{PlayerFormModal,RecordingNumbersModal}.vue`, `src/components/schedule/MatchFormModal.vue` |
| 9 | `index.css`, `src/design-tokens.test.ts`, the four `.kicker--accent` holders, the spec, `CLAUDE.md` |

---

## The substitution table

Every screen task applies this. It is the alias block read backwards, with the
paper rules deciding which of the two readings of an accent is meant.

| Legacy name | Becomes | Why |
| --- | --- | --- |
| `var(--bhs-navy-bg)` | `var(--ground)` | page background |
| `var(--bhs-navy-card)` | `var(--surface)` | raised panel |
| `var(--bhs-blue-dark)` | `var(--surface-deep)` | an input well |
| `var(--bhs-navy-border)` | `var(--rule)` | hairline |
| `var(--bhs-silver)`, `var(--text-main)` | `var(--ink)` | primary text |
| `var(--text-muted, #94a3b8)` | `var(--ink-muted)` | secondary text — **drop the literal fallback** |
| `var(--bhs-gold-accent)` | `var(--rule-strong)` | an emphasised rule or a standard |
| `var(--color-danger, #f87171)` | `var(--color-danger)` | the fixed token needs no fallback |
| `var(--bhs-cyan-accent)` **marking what is live or active** — a picked option, a running state, a link | `var(--live)` | |
| `var(--bhs-cyan-accent)` **on a section label** — `.sec__h`, `.sub`, `.block__h`, `.form__h`, `.round__h`, `.staff__org`, `.quiz__org`, `.admin__org`, `.planner__org`, `.search__label`, `.index__title`, `.fld__label`, `.field__label` | delete the declaration; put `class="kicker"` on the element | a kicker is `--ink-muted`; the accent on paper is one colour and it is not for labels |

---

### Task 1: The paper primitives

The rules seventeen files each restate. Promoting them is what makes every
later task a deletion rather than a rewrite, and `.kicker--accent` is already
copied verbatim into four scoped blocks.

**Files:**
- Modify: `index.css` (append after the `.btn--go` rules at the end of the file)
- Modify: `src/components/roster/PlayerCard.vue` (delete the duplicated `.plate` base rules)
- Modify: `src/components/roster/PlayerDetailModal.vue` (same)
- Test: `src/design-tokens.test.ts`

**Interfaces:**
- Produces, for every later task: the global classes `.btn--small`,
  `.btn--plain`, `.btn--danger`, `.field`, `.field--wide`, `.input`,
  `.input--wide`, `.tag`, `.tag--live`, `.tag--warn`, `.note`, `.note--good`,
  `.note--bad`, `.hrow`, `.plate`, `.plate__img`, `.plate__label`,
  `.kicker--accent` — alongside the existing `.btn`, `.btn--go`, `.kicker`,
  `.tnum`, `.sr-only`.
- Produces, in `src/design-tokens.test.ts`: the module-level constant
  `RESTYLED: string[]` — repo-relative paths, `/` separated — which Tasks 2–8
  each append to.

- [ ] **Step 1: Write the failing test**

Append to `src/design-tokens.test.ts`, after the `describe('the temporary aliases', …)` block:

```ts
/**
 * The primitives every screen shares. Seventeen components restated an
 * outlined button, a labelled input, a small tag and a hairline row in their
 * own scoped blocks, against the temporary aliases. They are defined once
 * here so a screen task is a deletion; a missing one sends the next task back
 * to writing its own copy, which is how the drift started.
 */
describe('the paper primitives', () => {
  const PRIMITIVES = [
    '.btn--small', '.btn--plain', '.btn--danger',
    '.field', '.field--wide', '.input', '.input--wide',
    '.tag', '.tag--live', '.tag--warn',
    '.note', '.note--good', '.note--bad',
    '.hrow', '.plate', '.plate__img', '.plate__label',
    '.kicker--accent'
  ];

  for (const cls of PRIMITIVES) {
    it(`defines ${cls}`, () => {
      expect(css, `${cls} is not in index.css`).toMatch(
        new RegExp(`\\${cls}[\\s,{:]`)
      );
    });
  }

  it('keeps the button variants stroke rather than fill', () => {
    expect(block('.btn--plain')).not.toMatch(/background:/);
    expect(block('.btn--danger')).not.toMatch(/background:/);
  });

  it('gives the input well the deep surface, not the page', () => {
    expect(block('.input')).toMatch(/background:\s*var\(--surface-deep\)/);
  });
});

/**
 * Files proved free of the legacy names. Phase 5 restyles the remaining
 * screens one at a time and each task appends its files here, so the guard
 * grows with the work and cannot silently skip a screen. Task 9 replaces this
 * list with every .vue file under src/ and deletes the alias block.
 */
const RESTYLED = [
  'src/components/roster/PlayerCard.vue',
  'src/components/roster/PlayerDetailModal.vue'
];

const LEGACY_NAME = /--bhs-[a-z-]+|--text-muted|--text-main/;

describe('the restyled files', () => {
  for (const rel of RESTYLED) {
    it(`${rel} names no legacy token`, () => {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(LEGACY_NAME.test(src), `${rel} still reads a --bhs-* alias`).toBe(false);
    });
  }
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run src/design-tokens.test.ts
```

Expected: FAIL — the eighteen `defines .x` cases fail because `index.css` has no
such rule, and the three assertions calling `block()` throw
`no rule block for .btn--plain`. The two `RESTYLED` cases pass already; they are
there to prove the guard runs.

- [ ] **Step 3: Add the primitives to `index.css`**

Append to the end of `index.css`:

```css
/* ── Paper primitives ────────────────────────────────────────────────── */

/*
 * The rules every screen was restating in its own scoped block. They are here
 * rather than in seventeen components because they had already drifted: five
 * button paddings, three tag colours and two names for the same input.
 * Everything below is stroke and hairline — a component that wants a filled
 * control wants the wrong thing (spec §2.3).
 */

/* Smaller than .btn, for the controls that sit inside a row. */
.btn--small { min-height: 28px; padding: 0 var(--space-2); font-size: 12px; }

/* The action that is not the point of the screen. */
.btn--plain { border-color: var(--rule); color: var(--ink-muted); }

/* Destructive, and quiet until pointed at: the warning is in the hover, so a
   row of controls does not read as a row of alarms. */
.btn--danger { border-color: var(--rule); color: var(--ink-muted); }
.btn--danger:hover { border-color: var(--color-danger); color: var(--color-danger); }

/* A labelled control. The label is a .kicker; this is only the stack. */
.field { display: flex; flex-direction: column; gap: var(--space-1); }
.field--wide { grid-column: 1 / -1; }

/* The well a value is typed into. --surface-deep on every ground. */
.input {
  width: 100%;
  box-sizing: border-box;
  min-height: 36px;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: var(--surface-deep);
  color: var(--ink);
  font: inherit;
  font-size: 14px;
}
.input:focus-visible { outline: 2px solid var(--live); outline-offset: -2px; }
.input:disabled { color: var(--ink-soft); cursor: not-allowed; }
.input--wide { grid-column: 1 / -1; }
textarea.input { min-height: 5rem; line-height: 1.5; resize: vertical; }

/* A stated fact beside a name — a count, a role, a state. Muted by default:
   a tag that shouts is a tag nobody reads past. */
.tag {
  display: inline-block;
  padding: 1px var(--space-2);
  border: 1px solid var(--rule);
  border-radius: 99px;
  color: var(--ink-muted);
  font-size: 11px;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.tag--live { border-color: var(--live); color: var(--live); }
.tag--warn { border-color: var(--color-warning); color: var(--color-warning); }

/* A sentence the screen says back to the reader: what it did, or why it
   would not. */
.note { margin: var(--space-2) 0 0; color: var(--ink-muted); font-size: 13px; line-height: 1.5; }
.note--good { color: var(--live); }
.note--bad { color: var(--color-danger); }

/* The list row the paper rules ask for: content, a hairline, nothing else. */
.hrow {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: baseline;
  justify-content: space-between;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--rule);
}
.hrow:last-child { border-bottom: 0; }

/*
 * A photograph matted like a tipped-in plate, or the box that says there is
 * not one. The size belongs to whoever uses it — a roster card, a coach card
 * and the player dialog each want a different one.
 */
.plate {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
  background: var(--surface-deep);
}
.plate__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: sepia(0.22) saturate(0.82) contrast(1.05);
}
.plate__label {
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

/* A kicker that carries the accent — the fixture rule, a standard. */
.kicker--accent { color: var(--rule-strong); }
```

- [ ] **Step 4: Delete the duplicated plate rules from the two roster components**

Read `src/components/roster/PlayerCard.vue` first, then delete from its scoped
block the **base** `.plate`, `.plate__img` and `.plate__label` declarations —
the ones the global rule now provides. Keep what is this component's own:
`.plate--empty`, and the `@media (min-width: 768px)` rules setting
`.plate { width: 100%; height: 160px; }` and `.plate__label { display: block; }`.
The phone-size `width`/`height` on `.plate` is also its own — keep it.

Do the same in `src/components/roster/PlayerDetailModal.vue`: delete the base
declarations, keep its own 104px size.

Report which declarations you removed from each file. Both files keep every
element and every `data-*` attribute; only style declarations move.

- [ ] **Step 5: Run the tests**

```bash
npx vitest run src/design-tokens.test.ts src/components/roster
```

Expected: PASS, including the `.plate__img` case in `PlayerCard.test.ts`, which
is the one class selector any test in this area uses.

- [ ] **Step 6: Run the three gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"; npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"; npm run build > /dev/null 2>&1; echo "BUILD=$?"
```

Expected: `TEST=0 TYPECHECK=0 BUILD=0`. A non-zero exit is a failure even when
the printed output looked green.

- [ ] **Step 7: Commit**

```bash
git add index.css src/design-tokens.test.ts src/components/roster/PlayerCard.vue src/components/roster/PlayerDetailModal.vue
git commit -m "feat: the paper primitives every screen was restating

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The paper dialog

`BaseModal` is the frame every remaining modal sits in, so it goes before them.
Spec §5.4: the ground's `--surface` panel, a hairline border, `--shadow-md`, the
title in the heading face, and a bottom sheet under 640px. Its focus trap,
Escape handling and scroll lock are behaviour, not style, and are not touched.

**Files:**
- Modify: `src/components/ui/BaseModal.vue` (style block only, plus `class="kicker"` on nothing — this component has no label)
- Test: `src/components/ui/BaseModal.test.ts` (unchanged; it must stay green), `src/design-tokens.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 — the dialog frame is its own.
- Produces: the panel every modal in Tasks 3, 6, 7 and 8 renders inside. Those
  tasks assume the panel already supplies the border, background, shadow and
  title face, and must not restate them.

- [ ] **Step 1: Add the file to the guard**

In `src/design-tokens.test.ts`, append to `RESTYLED`:

```ts
  'src/components/ui/BaseModal.vue',
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run src/design-tokens.test.ts
```

Expected: FAIL — `src/components/ui/BaseModal.vue still reads a --bhs-* alias`.

- [ ] **Step 3: Replace the style block**

Replace the whole `<style scoped>` block in `src/components/ui/BaseModal.vue`
with:

```css
<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-3);
}

/* The scrim is per ground: --scrim was added in phase 4 for the More sheet. */
.modal__backdrop { position: absolute; inset: 0; background: var(--scrim); }

.modal__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 32rem;
  max-height: calc(100vh - var(--space-6));
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-md);
}

.modal__panel--wide { max-width: 48rem; }

/* index.css clears :focus so :focus-visible can own the ring; the panel is
   focused programmatically when a dialog has no control, and must show one. */
.modal__panel:focus { outline: 2px solid var(--live); outline-offset: -2px; }

.modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--rule);
}

.modal__title {
  margin: 0;
  color: var(--ink);
  font-family: var(--heading-face);
  font-weight: 500;
  font-size: 19px;
  line-height: 1.2;
}

.modal__close {
  padding: 0 var(--space-1);
  border: 0;
  background: none;
  color: var(--ink-muted);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
}

.modal__close:hover,
.modal__close:focus-visible { color: var(--ink); }

.modal__body { padding: var(--space-4); overflow-y: auto; }

.modal__foot {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--rule);
}

/* Under 640px the dialog is a sheet off the bottom edge (spec §5.4). */
@media (max-width: 640px) {
  .modal { padding: 0; align-items: flex-end; }
  .modal__panel {
    max-width: none;
    max-height: 92vh;
    border-bottom: 0;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
}
</style>
```

- [ ] **Step 4: Confirm `--scrim` exists on all three grounds**

Phase 4 added it for the More sheet's backdrop (commit `505f3a8`). Verify:

```bash
grep -n "scrim" index.css
```

Expected: three declarations, one inside each ground block — at the time of
writing, lines 69, 90 and 109. **If it is defined on fewer than three, stop and
add the missing ones**, and add `--scrim` to the `GROUND_TOKENS` list in
`src/design-tokens.test.ts` so the omission cannot recur.

- [ ] **Step 5: Run the tests**

```bash
npx vitest run src/design-tokens.test.ts src/components/ui
```

Expected: PASS. `BaseModal.test.ts` asserts focus, Escape and scroll behaviour
and is unchanged — if any of it fails, a behaviour was edited and must be put
back.

- [ ] **Step 6: Run the three gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"; npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"; npm run build > /dev/null 2>&1; echo "BUILD=$?"
```

Expected: `TEST=0 TYPECHECK=0 BUILD=0`.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/BaseModal.vue src/design-tokens.test.ts index.css
git commit -m "feat: the paper dialog

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Coaching Staff

Two files. The screen's filled navy cards become bordered unfilled ones, the
circular photo becomes a `.plate`, the org line and the queue heading become
kickers, and both local `.btn` blocks go.

**Files:**
- Modify: `src/views/CoachesView.vue`
- Modify: `src/components/coaches/CoachFormModal.vue`
- Test: `src/views/CoachesView.test.ts` and `src/components/coaches/CoachFormModal.test.ts` (unchanged), `src/design-tokens.test.ts`

**Interfaces:**
- Consumes from Task 1: `.btn`, `.btn--go`, `.btn--small`, `.btn--plain`,
  `.btn--danger`, `.field`, `.field--wide`, `.input`, `.input--wide`, `.note`,
  `.note--bad`, `.hrow`, `.plate`, `.plate__img`, `.plate__label`, `.kicker`.
- Consumes from Task 2: the dialog frame, for `CoachFormModal`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add both files to the guard**

In `src/design-tokens.test.ts`, append to `RESTYLED`:

```ts
  'src/views/CoachesView.vue',
  'src/components/coaches/CoachFormModal.vue',
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run src/design-tokens.test.ts
```

Expected: FAIL — two cases, one per file.

- [ ] **Step 3: Adopt the primitives in `CoachesView.vue`'s template**

Class changes only — every `data-*` attribute, `v-if`, `v-for`, handler and
piece of text stays exactly as it is.

| Element | Was | Becomes |
| --- | --- | --- |
| the org line under the title | `class="staff__org"` | `class="staff__org kicker"` |
| the queue heading | `class="queue__title"` | `class="queue__title kicker"` |
| each queue row | `class="queue__row"` | `class="queue__row hrow"` |
| the coach photo `<img>` | `class="card__photo"` | wrap in `<span class="plate card__plate">` with the `<img class="plate__img">` inside, and `<span v-else class="plate__label">Photo</span>` for a coach with no photograph |
| the level line | `class="card__level"` | `class="card__level kicker"` |
| every `class="btn btn--go"` etc. | local | unchanged names — the global rules now supply them |

- [ ] **Step 4: Replace `CoachesView.vue`'s style block**

```css
<style scoped>
.staff { padding: var(--space-4) var(--space-4) var(--space-8); }

.staff__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--rule);
}

.staff__title { font-family: var(--heading-face); font-weight: 500; font-size: 24px; color: var(--ink); }
.staff__org { margin-top: var(--space-1); }

/* Accounts waiting to be let in: an emphasised rule, not a filled panel. */
.queue {
  margin: var(--space-4) 0 var(--space-6);
  padding-left: var(--space-3);
  border-left: 2px solid var(--rule-strong);
}

.queue__title { margin: 0 0 var(--space-2); }
.queue__list { margin: 0; padding: 0; list-style: none; }
.queue__who { display: flex; flex-direction: column; color: var(--ink); font-size: 14px; }
.queue__meta { color: var(--ink-muted); font-size: 12px; }
.queue__acts { display: flex; gap: var(--space-1); }

.grid { display: flex; flex-direction: column; }

/* A bordered, unfilled card (spec §5.1): the rule carries it, not a fill. */
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--rule);
}

.card__plate { width: 4.5rem; height: 4.5rem; }
.card__name { margin: 0; color: var(--ink); font-family: var(--heading-face); font-weight: 500; font-size: 18px; }
.card__level { margin-top: 2px; }
.card__bio { margin: var(--space-2) 0 0; color: var(--ink-muted); font-size: 13px; line-height: 1.55; }
.card__contact { margin: var(--space-1) 0 0; font-size: 13px; }
.card__contact a { color: var(--live); }
.card__admin { display: flex; gap: var(--space-1); }

.empty { padding: var(--space-8) var(--space-3); color: var(--ink-muted); text-align: center; }

.notice {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  margin: var(--space-3) 0 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule);
  border-left: 4px solid var(--live);
  border-radius: var(--radius-md);
  color: var(--ink);
  font-size: 13px;
}
.notice--bad { border-left-color: var(--color-warning); }
.notice__x { border: 0; background: none; color: inherit; font-size: 1.2rem; line-height: 1; cursor: pointer; }

@media (min-width: 768px) {
  .staff { max-width: 64rem; margin: 0 auto; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr)); gap: var(--space-4); }
  .card { padding: var(--space-4); border: 1px solid var(--rule); border-radius: var(--radius-md); }
}
</style>
```

Note what is gone: the local `.btn`, `.btn--small`, `.btn--go`, `.btn--plain`
and `.btn--danger` blocks, and `.card__photo`. Task 1 supplies all six.

- [ ] **Step 5: Restyle `CoachFormModal.vue`**

Read the file. In the template, put `class="kicker"` on every
`class="field__label"` element. In the style block, delete the `.btn`,
`.btn--go`, `.btn--plain`, `.field`, `.field--wide`, `.field__label` and
`.field__input` blocks entirely — Task 1 supplies `.btn*`, `.field`,
`.field--wide` and `.kicker`; change `class="field__input"` to `class="input"`
in the template (and `class="input input--wide"` where `.field--wide` applied to
a control rather than its wrapper). Keep only `.grid` and `.err`, rewritten:

```css
<style scoped>
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: var(--space-3); }
.err { margin: var(--space-3) 0 0; color: var(--color-danger); font-size: 13px; }
</style>
```

Report the exact set of blocks you deleted and any class this file used that
Task 1 does not supply.

- [ ] **Step 6: Run the tests**

```bash
npx vitest run src/design-tokens.test.ts src/views/CoachesView.test.ts src/components/coaches
```

Expected: PASS.

- [ ] **Step 7: Run the three gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"; npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"; npm run build > /dev/null 2>&1; echo "BUILD=$?"
```

Expected: `TEST=0 TYPECHECK=0 BUILD=0`.

- [ ] **Step 8: Look at it**

```bash
npm run dev
```

Open `/coaches` in the in-app browser at 412px and again at 1200px. Confirm: no
filled cards, the photograph is a plate, the queue reads as an indented block
under an emphasised rule, and the buttons are outlines. Screenshot both widths.

- [ ] **Step 9: Commit**

```bash
git add src/views/CoachesView.vue src/components/coaches/CoachFormModal.vue src/design-tokens.test.ts
git commit -m "feat: Coaching Staff on the paper ground

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Help

One file, and the only screen in this phase with a layout requirement of its
own: spec §5.1 gives it a 38em reading measure with a sticky section index on
the left above 768px and the search box above that index. Its unscoped
`help-*` block already uses the new tokens — phase 1 moved it out of
`styles.css` — so only the scoped block and the layout change.

**Files:**
- Modify: `src/views/HelpView.vue`
- Test: `src/views/HelpView.test.ts` (unchanged), `src/design-tokens.test.ts`

**Interfaces:**
- Consumes from Task 1: `.input`, `.kicker`, `.tag`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add the file to the guard**

```ts
  'src/views/HelpView.vue',
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run src/design-tokens.test.ts
```

Expected: FAIL — `src/views/HelpView.vue still reads a --bhs-* alias`.

- [ ] **Step 3: Adopt the primitives in the template**

| Element | Was | Becomes |
| --- | --- | --- |
| the search label | `class="search__label"` | `class="search__label kicker"` |
| the search input | `class="search__input"` | `class="search__input input"` |
| each index part heading | `class="index__title"` | `class="index__title kicker"` |
| the role pill on a section | `class="section__role"` | `class="section__role tag"` |

Move the `<label class="search">…</label>` element so it sits **above** the
`.index` element inside the left column of `.help__body`, per spec §5.1
("a sticky section index on the left above 768px, with the search box above
it"). Under 768px the column collapses and the search stays where the reader
meets it first. `data-*` attributes and the `v-model` binding do not move.

- [ ] **Step 4: Replace the scoped style block**

Replace only the `<style scoped>` block. **Leave the second, unscoped
`<style>` block exactly as it is** — it styles `v-html` markup that scoped
styles cannot reach, and it is already on the new tokens.

```css
<style scoped>
.help { padding: var(--space-4) var(--space-4) var(--space-8); }

.help__head { margin-bottom: var(--space-4); padding-bottom: var(--space-3); border-bottom: 1px solid var(--rule); }
.help__title { font-family: var(--heading-face); font-weight: 500; font-size: 24px; color: var(--ink); }
.help__sub { margin-top: var(--space-1); color: var(--ink-muted); font-size: 14px; line-height: 1.5; }

.search { display: block; margin-bottom: var(--space-4); }
.search__label { display: block; margin-bottom: var(--space-1); }

.count { margin: 0 0 var(--space-3); color: var(--live); font-size: 13px; }

.help__body { display: block; }

/* The index is a sidebar only where there is room for one; under 768px the
   handbook is one column and the search is simply the first thing on it. */
.index__part { margin-bottom: var(--space-4); }
.index__title { margin: 0 0 var(--space-1); }
.index__list { margin: 0; padding: 0; list-style: none; }

.index__link {
  display: block;
  width: 100%;
  padding: 3px 0;
  border: 0;
  background: none;
  color: var(--ink-muted);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.index__link:hover, .index__link:focus-visible { color: var(--live); }

.section {
  padding-bottom: var(--space-6);
  margin-bottom: var(--space-6);
  border-bottom: 1px solid var(--rule);
  scroll-margin-top: var(--space-8);
}
.section:last-child { border-bottom: 0; }

.section__head { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: baseline; margin-bottom: var(--space-2); }
.section__title { margin: 0; color: var(--ink); font-family: var(--heading-face); font-weight: 500; font-size: 20px; }

.section__body { color: var(--ink-muted); font-size: 14px; line-height: 1.65; }

.empty { padding: var(--space-8) var(--space-3); color: var(--ink-muted); text-align: center; }

/* Above 768px: the index on the left, the prose in a 38em measure (spec §6). */
@media (min-width: 768px) {
  .help { max-width: 64rem; margin: 0 auto; }
  .help__body { display: grid; grid-template-columns: 15rem minmax(0, 38em); gap: var(--space-8); align-items: start; }
  .help__aside { position: sticky; top: var(--space-8); }
}
</style>
```

The `.help__aside` selector is new: wrap the search label and the `.index`
element in `<div class="help__aside">` so the sticky behaviour applies to the
pair rather than the index alone. The old `@media (max-width: 860px)` rule and
its `position: static !important` override are deleted — the layout is now
single-column by default and only becomes a grid above 768px, so nothing needs
overriding.

- [ ] **Step 5: Run the tests**

```bash
npx vitest run src/design-tokens.test.ts src/views/HelpView.test.ts
```

Expected: PASS. `HelpView.test.ts` covers the search filtering and the section
index; if a case fails, the element move in Step 3 changed a `data-*` hook or
broke the `v-model` and must be corrected.

- [ ] **Step 6: Run the three gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"; npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"; npm run build > /dev/null 2>&1; echo "BUILD=$?"
```

Expected: `TEST=0 TYPECHECK=0 BUILD=0`.

- [ ] **Step 7: Look at it**

Open `/help` at 412px and 1200px. Confirm the prose measure is ~38em wide at
the larger size, the index sticks while the prose scrolls, the search sits
above the index, and the `help-table`, `help-steps` and `help-calc` blocks
inside a section still render correctly.

- [ ] **Step 8: Commit**

```bash
git add src/views/HelpView.vue src/design-tokens.test.ts
git commit -m "feat: the handbook gets its reading measure and a sticky index

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Quiz and the placeholder

Two files, both small. The quiz's options are the one place in this phase where
`--bhs-cyan-accent` genuinely means "live": a picked option is marked with it.

**Files:**
- Modify: `src/views/QuizView.vue`
- Modify: `src/views/PlaceholderView.vue`
- Test: `src/views/QuizView.test.ts` (unchanged), `src/design-tokens.test.ts`

**Interfaces:**
- Consumes from Task 1: `.btn`, `.btn--go`, `.kicker`, `.note`, `.hrow`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add both files to the guard**

```ts
  'src/views/QuizView.vue',
  'src/views/PlaceholderView.vue',
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run src/design-tokens.test.ts
```

Expected: FAIL — two cases.

- [ ] **Step 3: Adopt the primitives in `QuizView.vue`'s template**

Put `class="kicker"` on the `.quiz__org` element. Everything else keeps its
classes; the local `.btn` and `.btn--go` blocks are deleted in Step 4 and the
global ones take over.

- [ ] **Step 4: Replace `QuizView.vue`'s style block**

```css
<style scoped>
.quiz { padding: var(--space-4) var(--space-4) var(--space-8); }

.quiz__head { margin-bottom: var(--space-4); padding-bottom: var(--space-3); border-bottom: 1px solid var(--rule); }
.quiz__title { font-family: var(--heading-face); font-weight: 500; font-size: 24px; color: var(--ink); }
.quiz__sub { margin-top: var(--space-1); color: var(--ink-muted); font-size: 14px; line-height: 1.5; }
.quiz__org { margin-top: var(--space-1); }

.state { padding: var(--space-6) 0; color: var(--ink-muted); text-align: center; font-size: 14px; }
.state--bad { color: var(--color-danger); }

.list { margin: 0; padding: 0; list-style: none; }

.q { margin-bottom: var(--space-4); padding-bottom: var(--space-3); border-bottom: 1px solid var(--rule); }
.q__text { margin: 0 0 var(--space-2); color: var(--ink); font-size: 15px; line-height: 1.5; }
.q__none { margin: 0; color: var(--color-danger); font-size: 13px; }

/* An answer the player can pick: an outline that fills only with the live
   colour's own light wash when chosen, so the choice is unmistakable without
   becoming a filled control. */
.opt {
  display: flex;
  gap: var(--space-2);
  align-items: baseline;
  margin-bottom: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  color: var(--ink);
  font-size: 14px;
  cursor: pointer;
}
.opt:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
.opt.is-picked { border-color: var(--live); background: color-mix(in srgb, var(--live) 10%, transparent); }
.opt__letter { color: var(--ink-muted); font-family: var(--heading-face); font-weight: 500; }
.opt.is-picked .opt__letter { color: var(--live); }

/* The mark says the word as well as the colour — a wrong answer read only by
   hue is a wrong answer a colour-blind player cannot read at all. */
.q__mark { margin: var(--space-1) 0 0; font-size: 13px; }
.is-right { color: var(--live); }
.is-wrong { color: var(--color-danger); }

.foot { display: flex; gap: var(--space-3); align-items: center; }
.foot__count { color: var(--ink-muted); font-size: 13px; }

.score { margin: var(--space-3) 0 0; color: var(--ink); font-family: var(--heading-face); font-weight: 500; font-size: 20px; }

.notice {
  margin: var(--space-3) 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule);
  border-left: 4px solid var(--live);
  border-radius: var(--radius-md);
  color: var(--ink-muted);
  font-size: 13px;
  line-height: 1.5;
}

@media (min-width: 768px) { .quiz { max-width: 40rem; margin: 0 auto; } }
</style>
```

The measure is 40rem, not 64rem: the quiz is a reading page, not a table
(spec §6).

- [ ] **Step 5: Replace `PlaceholderView.vue`'s style block**

```css
<style scoped>
.placeholder { max-width: 34rem; margin: var(--space-8) auto; padding: var(--space-6) var(--space-4); text-align: center; }
.placeholder__title { margin: 0 0 var(--space-2); color: var(--ink); font-family: var(--heading-face); font-weight: 500; font-size: 24px; }
.placeholder__body { margin: 0; color: var(--ink-muted); line-height: 1.6; }
</style>
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run src/design-tokens.test.ts src/views/QuizView.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run the three gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"; npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"; npm run build > /dev/null 2>&1; echo "BUILD=$?"
```

Expected: `TEST=0 TYPECHECK=0 BUILD=0`.

- [ ] **Step 8: Commit**

```bash
git add src/views/QuizView.vue src/views/PlaceholderView.vue src/design-tokens.test.ts
git commit -m "feat: the quiz on the paper ground

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Admin

Ten files, and the most repetitive of the phase: the eight sections restate the
same `.sec` / `.sec__h` / `.row` / `.tag` / `.inp` / `.btn` / `.note` block with
small variations. Nearly all of it is deletion.

**Files:**
- Modify: `src/views/AdminView.vue`
- Modify: `src/components/admin/ApprovalsSection.vue`, `CategoriesSection.vue`, `QuizBankSection.vue`, `TeamsSection.vue`, `UnassignedPlayersSection.vue`, `ImportExportSection.vue`, `SchoolProfileSection.vue`, `DiagnosticsSection.vue`
- Modify: `src/components/admin/ImportExportModal.vue`
- Test: the nine existing `src/components/admin/*.test.ts` and `src/views/AdminView.test.ts` (all unchanged), `src/design-tokens.test.ts`

**Interfaces:**
- Consumes from Task 1: `.btn`, `.btn--go`, `.btn--small`, `.btn--plain`,
  `.btn--danger`, `.field`, `.field--wide`, `.input`, `.input--wide`, `.tag`,
  `.tag--live`, `.tag--warn`, `.note`, `.note--good`, `.note--bad`, `.hrow`,
  `.kicker`.
- Consumes from Task 2: the dialog frame, for `ImportExportModal`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add all ten files to the guard**

```ts
  'src/views/AdminView.vue',
  'src/components/admin/ApprovalsSection.vue',
  'src/components/admin/CategoriesSection.vue',
  'src/components/admin/QuizBankSection.vue',
  'src/components/admin/TeamsSection.vue',
  'src/components/admin/UnassignedPlayersSection.vue',
  'src/components/admin/ImportExportSection.vue',
  'src/components/admin/SchoolProfileSection.vue',
  'src/components/admin/DiagnosticsSection.vue',
  'src/components/admin/ImportExportModal.vue',
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run src/design-tokens.test.ts
```

Expected: FAIL — ten cases.

- [ ] **Step 3: Replace `AdminView.vue`'s style block**

Put `class="kicker"` on `.admin__org` and on every `.sec__h` element in the
template first, then:

```css
<style scoped>
.admin { padding: var(--space-4) var(--space-4) var(--space-8); }

.admin__head { margin-bottom: var(--space-4); padding-bottom: var(--space-3); border-bottom: 1px solid var(--rule); }
.admin__title { font-family: var(--heading-face); font-weight: 500; font-size: 24px; color: var(--ink); }
.admin__sub { margin-top: var(--space-1); max-width: 42rem; color: var(--ink-muted); font-size: 14px; line-height: 1.5; }
.admin__org { margin-top: var(--space-1); }

.sec { margin-bottom: var(--space-6); }
.sec__h { margin: 0 0 var(--space-2); }
.sec__note { margin: 0; color: var(--ink-muted); font-size: 13px; }

.notice {
  margin: var(--space-3) 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule);
  border-left: 4px solid var(--live);
  border-radius: var(--radius-md);
  color: var(--ink-muted);
  font-size: 13px;
  line-height: 1.5;
}
.notice--bad { border-left-color: var(--color-warning); color: var(--ink); }

code { font-size: 0.9em; }

@media (min-width: 768px) { .admin { max-width: 64rem; margin: 0 auto; } }
</style>
```

- [ ] **Step 4: Convert the eight sections, one at a time**

For each of the eight `*Section.vue` files, in this order — `ApprovalsSection`,
`UnassignedPlayersSection`, `CategoriesSection`, `TeamsSection`,
`QuizBankSection`, `ImportExportSection`, `SchoolProfileSection`,
`DiagnosticsSection` — read the file, then:

**Template.** Apply these class changes and nothing else. No `data-*`
attribute, handler, `v-if`, `v-for` or piece of text may change.

| Was | Becomes |
| --- | --- |
| `class="sec__h"`, `class="sub"`, `class="form__h"`, `class="block__h"`, `class="fld__label"`, `class="field__label"` | the same, plus ` kicker` |
| `class="inp"` | `class="input"` |
| `class="inp inp--wide"` | `class="input input--wide"` |
| `class="fld"` | `class="field"` |
| `class="row"` | `class="row hrow"` |
| `class="tag"` (the emphasised one) | `class="tag tag--live"` |
| `class="tag tag--quiet"` | `class="tag"` |
| `class="tag tag--warn"` | unchanged — Task 1 supplies it |
| `class="note note--good"`, `class="note note--bad"` | unchanged — Task 1 supplies all three |
| `class="muted"` | `class="note"` |

**Style.** Delete every one of these blocks — Task 1 supplies each:
`.btn`, `.btn--go`, `.btn--primary`, `.btn--small`, `.inp`, `.inp--wide`,
`.fld`, `.fld__label`, `.field__label`, `.tag`, `.tag--quiet`, `.tag--warn`,
`.note`, `.note--good`, `.note--bad`, `.muted`, `.row` (its hairline and
padding only — keep any `grid-template-columns` it sets under a different
name), `.sec__h`, `.sub`, `.form__h`, `.block__h`.

"Delete the block" means delete the declarations `.kicker`, `.btn*`, `.input`
and `.tag` now supply — colour, size, letter-spacing, text-transform, border,
background, cursor. A **margin** on a label or a row is that file's own spacing
and may stay, as `.sec__h { margin: 0 0 var(--space-2); }` does in `AdminView`
above. Keeping a margin is not a missed deletion.

Keep, and rewrite onto the tokens using the substitution table: `.sec`,
`.sec__n`, `.sec__note`, `.row__what`, `.row__name`, `.row__who`, `.row__acts`,
`.row__email`, `.row__meta`, `.row__q`, `.row__coaches`, `.row__n`, `.add`,
`.acts`, `.form`, `.forms`, `.coach`, `.coach__x`, `.opt`, `.opt__correct`,
`.grid`, `.panel`, `.error`, `.ok`, `.block`, `.mini`, `.table`, `.table__name`,
`.tables`, `.hint` and its modifiers — whichever of them the file actually has.
`.panel` becomes a bordered unfilled block:

```css
.panel {
  padding: var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
}
```

After each file, run its test and report the result:

```bash
npx vitest run src/components/admin/<Name>Section.test.ts
```

- [ ] **Step 5: Convert `ImportExportModal.vue`**

Same rules as Step 4. Its `.hint--good` / `.hint--bad` / `.hint--warn` triple
maps onto `.note--good` / `.note--bad` and a new local rule for the warn case:

```css
.hint--warn { color: var(--color-warning); }
```

Its `.table` is a preview of what an import would change and **carries meaning
in every column**, so under 768px it scrolls horizontally inside its own
container with the name column sticky (spec §6):

```css
.tables { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th, .table td { padding: var(--space-1) var(--space-2); border-bottom: 1px solid var(--rule); text-align: left; white-space: nowrap; }
.table th { color: var(--ink-muted); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; }
.table__name { position: sticky; left: 0; background: var(--surface); }
```

`.table__name` reads `--surface` rather than `--ground` because this table is
inside a dialog panel.

- [ ] **Step 6: Run the tests**

```bash
npx vitest run src/design-tokens.test.ts src/components/admin src/views/AdminView.test.ts
```

Expected: PASS, all nine admin test files plus the view.

- [ ] **Step 7: Run the three gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"; npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"; npm run build > /dev/null 2>&1; echo "BUILD=$?"
```

Expected: `TEST=0 TYPECHECK=0 BUILD=0`.

- [ ] **Step 8: Look at it**

Open `/admin` at 412px and 1200px signed in as a coach and again as an admin —
each section is gated individually, so the two views differ and both must be
checked. Confirm the sections read as kickers over hairline rows, the import
preview table scrolls with a sticky name column, and no panel is filled.

- [ ] **Step 9: Commit**

```bash
git add src/views/AdminView.vue src/components/admin src/design-tokens.test.ts
git commit -m "feat: the admin panel on the paper ground

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Planner

Seven files. **The tactical board's canvas, its toolbar behaviour and the print
layout are out of scope** (spec §5.1) — `TacticalBoard.vue` takes the tokens on
its surrounding chrome and nothing else, and `src/diagram/` is not touched at
all.

**Files:**
- Modify: `src/views/PlannerView.vue`
- Modify: `src/components/planner/TacticalBoard.vue`, `DiagramModal.vue`, `DrillFormModal.vue`, `DrillsBankModal.vue`, `RoundRobinModal.vue`, `SavePlanModal.vue`
- Test: the six existing `src/components/planner/*.test.ts` and `src/views/PlannerView.test.ts` (all unchanged), `src/design-tokens.test.ts`

**Interfaces:**
- Consumes from Task 1: `.btn`, `.btn--go`, `.btn--small`, `.btn--plain`,
  `.btn--danger`, `.field`, `.input`, `.input--wide`, `.tag`, `.tag--live`,
  `.note`, `.note--good`, `.note--bad`, `.hrow`, `.kicker`.
- Consumes from Task 2: the dialog frame, for the five modals.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add all seven files to the guard**

```ts
  'src/views/PlannerView.vue',
  'src/components/planner/TacticalBoard.vue',
  'src/components/planner/DiagramModal.vue',
  'src/components/planner/DrillFormModal.vue',
  'src/components/planner/DrillsBankModal.vue',
  'src/components/planner/RoundRobinModal.vue',
  'src/components/planner/SavePlanModal.vue',
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run src/design-tokens.test.ts
```

Expected: FAIL — seven cases.

- [ ] **Step 3: Replace `PlannerView.vue`'s style block**

Put `class="kicker"` on `.planner__org` and on `.bar__label` in the template,
then:

```css
<style scoped>
.planner { padding: var(--space-4) var(--space-4) var(--space-8); }

.planner__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--rule);
}

.planner__title { font-family: var(--heading-face); font-weight: 500; font-size: 24px; color: var(--ink); }
.planner__sub { margin-top: var(--space-1); color: var(--ink-muted); font-size: 14px; line-height: 1.5; }
.planner__org { margin-top: var(--space-1); }
.planner__acts { display: flex; flex-wrap: wrap; gap: var(--space-2); }

/* A control in the header strip. Outlined, like every other action. */
.act {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font-family: var(--heading-face);
  font-size: 14px;
  cursor: pointer;
}
.act:hover { background: color-mix(in srgb, var(--ink) 7%, transparent); }
.act--go { border-color: var(--live); color: var(--live); }

/* The saved-plan picker. */
.picker { margin: var(--space-4) 0; padding: var(--space-3); border: 1px solid var(--rule); border-radius: var(--radius-md); }
.picker__row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: baseline; justify-content: space-between; padding: var(--space-1) 0; }
.picker__meta { color: var(--ink-muted); font-size: 12px; }
.picker__none { margin: var(--space-1) var(--space-1); color: var(--ink-muted); font-size: 13px; }

/* The running total for the session. */
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: baseline;
  margin: var(--space-4) 0;
  padding: var(--space-2) 0;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}
.bar__label { color: var(--ink-muted); }
.bar__value { color: var(--ink); font-family: var(--heading-face); font-weight: 500; font-size: 17px; font-variant-numeric: tabular-nums; }

.empty { padding: var(--space-8) var(--space-3); color: var(--ink-muted); text-align: center; line-height: 1.6; }

.list { margin: 0; padding: 0; list-style: none; }

/* A drill in the plan: a hairline row, selected by an accent keyline rather
   than a fill. */
.drill {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: baseline;
  justify-content: space-between;
  padding: var(--space-2);
  border: 1px solid transparent;
  border-bottom-color: var(--rule);
}
.drill.is-selected { border-color: var(--rule-strong); border-radius: var(--radius-md); }
.drill__what { display: flex; flex-direction: column; gap: 2px; }
.drill__name { color: var(--ink); font-size: 14px; }
.drill__when { color: var(--ink-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.drill__dur { color: var(--live); font-size: 12px; font-variant-numeric: tabular-nums; }
.drill__slot { color: var(--ink-muted); font-size: 12px; }
.drill__notes { width: 100%; margin-top: var(--space-1); color: var(--ink-muted); font-size: 13px; line-height: 1.5; }
.drill__diagram { display: inline-flex; align-items: center; gap: 4px; color: var(--live); font-size: 12px; }
.drill__acts { display: flex; gap: var(--space-1); }

/* The smallest control there is: a text button inside a row. */
.mini { padding: 0 var(--space-1); border: 0; background: none; color: var(--ink-muted); font: inherit; font-size: 12px; cursor: pointer; }
.mini:hover { color: var(--ink); }
.mini--danger:hover { color: var(--color-danger); }

.notice {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  margin: var(--space-3) 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule);
  border-left: 4px solid var(--live);
  border-radius: var(--radius-md);
  color: var(--ink);
  font-size: 13px;
}
.notice--bad { border-left-color: var(--color-warning); }
.notice__x { border: 0; background: none; color: inherit; font-size: 1.2rem; line-height: 1; cursor: pointer; }

@media (min-width: 768px) { .planner { max-width: 64rem; margin: 0 auto; } }
</style>
```

Note the `.drill.is-selected` change: it was `background: rgba(0, 71, 171, 0.18)`
— a hardcoded literal of the old organization blue, which is exactly what the
multi-organization rule forbids (CLAUDE.md: never hardcode Beaumont's anything).
Selection is now a keyline.

- [ ] **Step 4: Convert `TacticalBoard.vue`**

Chrome only. In its style block rewrite `.wrap`, `.board`, `.tools`, `.tool`,
`.frames`, `.frame`, `.notice` and `.spacer` onto the tokens using the
substitution table. **Do not touch `.canvas`'s dimensions, the canvas element,
any pointer handler, or anything under `src/diagram/`** — coordinates are canvas
pixels and a size change slides every player relative to the pitch (CLAUDE.md).
A toolbar button becomes:

```css
.tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  min-height: 34px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.tool.is-on { border-color: var(--live); color: var(--live); }
```

If the component's "active tool" class is named something other than `.is-on`,
keep its existing name and report what it is.

- [ ] **Step 5: Convert the five planner modals**

For `DiagramModal.vue`, `DrillFormModal.vue`, `DrillsBankModal.vue`,
`RoundRobinModal.vue` and `SavePlanModal.vue`, in that order: read the file,
apply the same template class map as Task 6 Step 4, plus these two, and delete
the same style blocks.

| Was | Becomes |
| --- | --- |
| `class="btn btn--primary"` | `class="btn btn--go"` |
| `class="hint"` / `hint--good` / `hint--bad` | `class="note"` / `note--good` / `note--bad` |

Keep and rewrite onto the tokens whichever of these the file has: `.lede`,
`.slot`, `.times`, `.weights`, `.danger`, `.block`, `.round`, `.round__h`
(plus ` kicker`), `.match`, `.match__who`, `.match__v`, `.match__bye`,
`.match__result`, `.state`, `.state--bad`, `.bar`, `.spacer`, `.mini`,
`.mini--danger`, `.form`, `.fld--top`.

After each file, run its test and report the result:

```bash
npx vitest run src/components/planner/<Name>.test.ts
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run src/design-tokens.test.ts src/components/planner src/views/PlannerView.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run the three gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"; npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"; npm run build > /dev/null 2>&1; echo "BUILD=$?"
```

Expected: `TEST=0 TYPECHECK=0 BUILD=0`.

- [ ] **Step 8: Look at it, including the board and the print layout**

Open `/planner` at 412px and 1200px. Open the drills bank, the drill form, the
round robin and the save dialog. Open a drill's diagram, draw on it, save,
reopen it and confirm the drawing is still there — `diagram_data` is stored,
unversioned and irreplaceable (CLAUDE.md). Then print-preview a plan and confirm
the layout is unchanged.

- [ ] **Step 9: Commit**

```bash
git add src/views/PlannerView.vue src/components/planner src/design-tokens.test.ts
git commit -m "feat: the practice planner on the paper ground

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: The remaining modals

Four files: the sign-in dialog, the player form, the recording-numbers dialog
and the fixture form. `RecordingNumbersModal` carries the one table in this
task and the one rule that is not cosmetic.

**Files:**
- Modify: `src/components/auth/AuthModal.vue`
- Modify: `src/components/roster/PlayerFormModal.vue`
- Modify: `src/components/roster/RecordingNumbersModal.vue`
- Modify: `src/components/schedule/MatchFormModal.vue`
- Test: the four existing test files (unchanged), `src/design-tokens.test.ts`

**Interfaces:**
- Consumes from Task 1: `.btn`, `.btn--go`, `.btn--plain`, `.btn--small`,
  `.field`, `.field--wide`, `.input`, `.input--wide`, `.note`, `.note--good`,
  `.note--bad`, `.kicker`, `.hrow`.
- Consumes from Task 2: the dialog frame.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add all four files to the guard**

```ts
  'src/components/auth/AuthModal.vue',
  'src/components/roster/PlayerFormModal.vue',
  'src/components/roster/RecordingNumbersModal.vue',
  'src/components/schedule/MatchFormModal.vue',
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run src/design-tokens.test.ts
```

Expected: FAIL — four cases.

- [ ] **Step 3: Convert `AuthModal.vue`**

Template: `class="field__label"` gains ` kicker`; `class="field__input"` becomes
`class="input"`; `class="feedback feedback--error"` becomes
`class="note note--bad"` and `feedback--info` becomes `note`.

Delete the `.btn`, `.btn--go`, `.btn--plain`, `.field`, `.field__label`,
`.field__input`, `.feedback`, `.feedback--error` and `.feedback--info` blocks.
Keep, rewritten onto the tokens: `.tabs`, `.tabs__btn`, `.suggest`,
`.suggest__text`, `.suggest__actions`, `.verify__target`. The tab strip:

```css
.tabs { display: flex; gap: var(--space-3); margin-bottom: var(--space-4); border-bottom: 1px solid var(--rule); }
.tabs__btn {
  padding: var(--space-2) 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--ink-muted);
  font-family: var(--heading-face);
  font-size: 15px;
  cursor: pointer;
}
.tabs__btn.is-on { border-bottom-color: var(--live); color: var(--live); }
```

If the active-tab class is not `.is-on`, keep the existing name and report it.

**Do not change any text about sign-up.** Sign-up must stay open to personal
email addresses — club coaches and their players do not have a school domain
(CLAUDE.md, and the user has said so directly). This task changes appearance
only.

- [ ] **Step 4: Convert `PlayerFormModal.vue` and `MatchFormModal.vue`**

Both have the same shape as `CoachFormModal` in Task 3. Template:
`class="field__label"` gains ` kicker`; `class="field__input"` becomes
`class="input"`; a `.field--wide` wrapper keeps its name (Task 1 supplies it);
`class="field__hint"` becomes `class="note"`.

Delete `.btn`, `.btn--go`, `.btn--plain`, `.field`, `.field--wide`,
`.field__label`, `.field__input`, `.field__hint`. Keep, rewritten:

```css
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: var(--space-3); }
.err { margin: var(--space-3) 0 0; color: var(--color-danger); font-size: 13px; }
```

- [ ] **Step 5: Convert `RecordingNumbersModal.vue`**

Template: `class="fld__label"` gains ` kicker`; `class="inp"` becomes
`class="input"`; `class="inp inp--narrow"` becomes
`class="input input--narrow"`. `.input--narrow` stays a **local** rule in this
component's scoped block — it is the only narrow field in the app, so it does
not belong in `index.css`:

```css
.input--narrow { width: 4.5rem; min-width: 0; text-align: right; font-variant-numeric: tabular-nums; }
```

`class="btn btn--primary"` becomes `class="btn btn--go"`; `.hint` / `.hint--good`
/ `.hint--bad` become `.note` / `.note--good` / `.note--bad`; `.muted` becomes
`.note`.

Delete `.btn`, `.btn--primary`, `.fld`, `.fld__label`, `.inp`, `.inp--narrow`,
`.hint`, `.hint--bad`, `.hint--good`, `.muted`. Keep, rewritten: `.head`,
`.head__pending`, `.lede`, `.tabular`, `.wrap`, `.tbl`.

The table carries a number per player and **never hides a column** (spec §6):

```css
.wrap { overflow-x: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th, .tbl td { padding: var(--space-1) var(--space-2); border-bottom: 1px solid var(--rule); text-align: left; white-space: nowrap; }
.tbl th { color: var(--ink-muted); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; }
.tabular { font-variant-numeric: tabular-nums; }
```

**Nothing about the numbering behaviour changes.** A proposal is still only a
draft the coach accepts, a swap still clears before it sets, and a duplicate is
still refused before any write starts (CLAUDE.md). This task touches styles and
class names only.

- [ ] **Step 6: Run the tests**

```bash
npx vitest run src/design-tokens.test.ts src/components/auth src/components/roster src/components/schedule
```

Expected: PASS.

- [ ] **Step 7: Run the three gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"; npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"; npm run build > /dev/null 2>&1; echo "BUILD=$?"
```

Expected: `TEST=0 TYPECHECK=0 BUILD=0`.

- [ ] **Step 8: Look at it**

Open each of the four dialogs at 412px — each must be a bottom sheet — and at
1200px. Confirm the recording-numbers table scrolls rather than dropping a
column.

- [ ] **Step 9: Commit**

```bash
git add src/components/auth src/components/roster src/components/schedule src/design-tokens.test.ts
git commit -m "feat: the remaining dialogs on the paper ground

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Delete the aliases and close the phase

The exit condition (spec §7): a grep for `--bhs-` in `src/` returns nothing, and
the alias block leaves `index.css`. The four scoped copies of `.kicker--accent`
go with it, now that Task 1 defines it once.

**Files:**
- Modify: `index.css` (delete the alias block)
- Modify: `src/design-tokens.test.ts` (replace the allowlist with every file; delete the alias describe)
- Modify: `src/views/HomeView.vue`, `src/views/ScheduleView.vue`, `src/views/MatrixView.vue`, `src/components/roster/PlayerDetailModal.vue` (delete the duplicated `.kicker--accent`)
- Modify: `docs/superpowers/specs/2026-09-07-mobile-restyle-design.md` (§9 item 5)
- Modify: `CLAUDE.md` (the alias sentence, and the stale test counts)

**Interfaces:**
- Consumes: every file added to `RESTYLED` by Tasks 1–8.
- Produces: the phase's exit condition.

- [ ] **Step 1: Prove nothing still reads an alias**

```bash
grep -rn -- '--bhs-\|--text-muted\|--text-main' src/ --include=*.vue; echo "VUE_HITS=$?"
```

Expected: no output and `VUE_HITS=1` (grep found nothing). **If anything is
listed, stop** — a screen task missed a file, and it must be fixed under that
task's commit rather than swept into this one.

- [ ] **Step 2: Rewrite the guard so it covers every file**

In `src/design-tokens.test.ts`, delete the whole
`describe('the temporary aliases', …)` block and the `ALIASES` constant, and
replace the `RESTYLED` constant and its `describe` with:

```ts
/**
 * The exit condition of the restyle (spec §7). The temporary --bhs-* aliases
 * are gone from index.css, so a component still naming one would resolve to
 * nothing and render unstyled — silently, because an unset custom property
 * inherits rather than erroring. This walks every component instead of a
 * list, so a new file cannot be added against the old names.
 */
const LEGACY_NAME = /--bhs-[a-z-]+|--text-muted|--text-main/;

describe('the legacy token names', () => {
  it('are gone from index.css', () => {
    expect(css).not.toMatch(LEGACY_NAME);
  });

  it('are gone from every component', () => {
    const files = vueFiles(join(process.cwd(), 'src'));
    const offenders = files
      .filter(f => LEGACY_NAME.test(readFileSync(f, 'utf8')))
      .map(f => f.replace(process.cwd(), ''));
    expect(offenders, 'use a ground token from index.css').toEqual([]);
  });
});
```

`vueFiles` is already defined further down the file; move this `describe` below
its definition, or move the function above this block. Report which you did.

- [ ] **Step 3: Run it to make sure it fails**

```bash
npx vitest run src/design-tokens.test.ts
```

Expected: FAIL on `are gone from index.css` — the alias block is still there.
The per-component case should already pass, because Step 1 proved it.

- [ ] **Step 4: Delete the alias block from `index.css`**

Remove the comment and the rule block — at the time of writing, lines 113–136:
the one whose comment begins "Temporary aliases" and whose body declares
`--bhs-navy-bg` through `--glass-shadow`. Read the file first and report the
exact lines you removed.

The block's last three declarations are `--glass-bg`, `--glass-border` and
`--glass-shadow`. A grep proves nothing in `src/` reads any of them, so they go
with the rest of the block rather than needing a task of their own:

```bash
grep -rn -- '--glass-' src/; echo "GLASS_HITS=$?"
```

Expected: no output and `GLASS_HITS=1`.

- [ ] **Step 5: Delete the four duplicated `.kicker--accent` rules**

Task 1 defines it in `index.css`. Delete the scoped copy from
`src/views/HomeView.vue`, `src/views/ScheduleView.vue`, `src/views/MatrixView.vue`
and `src/components/roster/PlayerDetailModal.vue`. Each is the single line
`.kicker--accent { color: var(--rule-strong); }`.

- [ ] **Step 6: Run the tests**

```bash
npx vitest run src/design-tokens.test.ts src/views src/components
```

Expected: PASS.

- [ ] **Step 7: Run the three gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"; npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"; npm run build > /dev/null 2>&1; echo "BUILD=$?"
```

Expected: `TEST=0 TYPECHECK=0 BUILD=0`.

- [ ] **Step 8: Walk every route on both widths**

Open each of `/`, `/schedule`, `/roster`, `/matrix`, `/planner`, `/coaches`,
`/help`, `/quiz`, `/admin` and the four tool routes at 412px and 1200px. An
alias that was resolving something is now unset, and an unset custom property
inherits rather than erroring — so a missed declaration shows up as text in the
wrong colour, never as a console message. Report anything that looks wrong.

- [ ] **Step 9: Note the phase in the spec**

In §9's list, append to the line beginning `5. **The rest.**`:

```
 — done 2026-09-09; the shared paper primitives moved into index.css first, which turned each screen into a deletion, and `.plate` and `.kicker--accent` stopped being copied per component.
```

- [ ] **Step 10: Correct the stale numbers in `CLAUDE.md`**

Two places say the suite is "2,300 tests" and one says "123 files"; it is
currently 2,501 across 142 and this phase adds more. Run `npm test`, read the
real figures off the summary line, and update both mentions. In the Conventions
section, replace the sentence beginning "**The `--bhs-*` names are temporary
aliases**" with:

```
The `--bhs-*` aliases are gone as of phase 5; `src/design-tokens.test.ts` walks every component and fails on one.
```

- [ ] **Step 11: Commit**

```bash
git add index.css src/design-tokens.test.ts src/views src/components docs/superpowers/specs/2026-09-07-mobile-restyle-design.md CLAUDE.md
git commit -m "refactor: delete the --bhs-* aliases

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review against the spec

**Spec coverage.**

- §5.1, "Coaching Staff, Help, Quiz, Admin, Planner … restyled to the paper
  rules only: editorial headings, kickers for section labels, hairline
  sections, outlined buttons, bordered unfilled cards, `.plate` on
  photographs" — Tasks 3 (Coaching Staff, including the plate), 4 (Help),
  5 (Quiz), 6 (Admin), 7 (Planner). The primitives that make "outlined
  buttons" and "kickers" one definition rather than seventeen are Task 1.
- §5.1, "Help additionally gets a reading measure of 38em for its prose and a
  sticky section index on the left above 768px, with the search box above it" —
  Task 4, Steps 3 and 4.
- §5.1, "The tactical board canvas, its toolbar behaviour and the print layout
  are untouched; only their surrounding chrome takes the tokens" — Task 7,
  Step 4, stated as a prohibition, and Step 8 verifies a saved diagram still
  loads.
- §5.4, the dialog — Task 2, and every modal task consumes it rather than
  restating the panel.
- §6, widths — the measure is set per screen: 64rem for the table screens
  (Coaching Staff, Admin, Planner), 40rem for the reading pages (Quiz), 38em
  for Help's prose. The two tables that carry meaning in every column get
  horizontal scroll with a sticky name column: the import preview (Task 6,
  Step 5) and the recording-numbers table (Task 8, Step 5).
- §7, "`--bhs-*` names … deleted in phase 5, after the last scoped style has
  been rewritten. A grep for `--bhs-` in `src/` returning nothing is the exit
  condition" — Task 9, Steps 1, 3 and 4.
- §7, the nineteen legacy classes — already moved into scoped styles by phase 1;
  `styles.css` is already deleted and `design-tokens.test.ts` already asserts
  its absence. Nothing left for this phase.
- §8, testing — the existing suite stays green at every task; the new guard is
  `design-tokens.test.ts`'s growing allowlist, which gives each task a real
  red/green cycle rather than "restyle and hope". No component test is
  rewritten, because tests here select on `data-*` and not on classes.
- §9 item 5 — Task 9, Step 9.

**Gaps found and closed while reviewing.** The spec's §5.1 list does not mention
`PlaceholderView.vue`, `ImportExportSection.vue`, `SchoolProfileSection.vue` or
`DiagnosticsSection.vue`, but each names `--text-muted` and so blocks the exit
condition; they are folded into Tasks 5 and 6. `.kicker--accent` is duplicated
in four already-restyled files — not a spec requirement, but deleting the alias
block is the moment to stop copying it, so it is in Task 9.

**Placeholder scan.** Every code step carries its code. Six steps tell the
implementer to read an existing file and adapt — the two roster plate blocks
(Task 1, Step 4), the eight admin sections (Task 6, Step 4), the five planner
modals (Task 7, Step 5), the tactical board's active-tool class name (Task 7,
Step 4), the auth modal's active-tab class name (Task 8, Step 3), and where
`vueFiles` sits relative to the new describe (Task 9, Step 2) — and each says to
report what it found. Those are real ambiguities in existing code, not gaps in
the plan.

**Type consistency.** The class names Task 1 defines are exactly the ones Tasks
2–8 consume: `.btn--small`, `.btn--plain`, `.btn--danger`, `.field`,
`.field--wide`, `.input`, `.input--wide`, `.tag`, `.tag--live`, `.tag--warn`,
`.note`, `.note--good`, `.note--bad`, `.hrow`, `.plate`, `.plate__img`,
`.plate__label`, `.kicker--accent`. No task consumes `.btn--primary`, `.inp`,
`.fld`, `.hint` or `.muted` — those are the names being deleted, and the
substitution table maps each onto a name Task 1 defines. `RESTYLED` is declared
in Task 1 and appended to by Tasks 2–8 in that spelling, and replaced wholesale
by Task 9. `LEGACY_NAME` is declared once in Task 1 and redeclared in Task 9's
replacement block, which is why Task 9 deletes the old constant along with the
allowlist.
