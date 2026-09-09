# Organization colour — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept `#21196F`, `rgb(33, 25, 111)` and `navy` as an organization's
colours; stop a brand colour becoming indistinguishable from the text beside it;
and widen where that colour appears on the paper ground.

**Architecture:** A new framework-free `src/domain/colour.ts` parses the three
accepted formats to channels, and everything downstream — the contrast guard,
the stylesheet, the admin form — works from that one parser. `theme.ts`'s guard
gains a second question (is this a different colour from the ink?) measured by
perceptual distance rather than contrast ratio, because contrast is luminance-only
and cannot tell navy from near-black. The widening is then two declarations in
`index.css`'s paper block plus ten single-declaration edits, because the accent
already flows through two ground tokens that every component reads.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Pinia, plain CSS custom
properties, Vitest + `@vue/test-utils`, Supabase/Postgres (JSONB).

**Spec:** `docs/superpowers/specs/2026-09-09-organization-colour-design.md`

---

## Global Constraints

- **Every accepted colour normalises to `#rrggbb` before it reaches a stylesheet.**
  `themeVars` emits nothing else. This is what makes accepting more formats safe:
  whatever a coach typed, six hex digits reach the document.
- **No literal colour in a component style block.** `src/design-tokens.test.ts`
  fails the build on a hardcoded white in any `.vue` style block. Values come from
  the ground tokens (`--ink`, `--ink-muted`, `--ink-soft`, `--rule`,
  `--rule-strong`, `--live`, `--mark`, `--surface`, `--surface-deep`, `--ground`,
  `--heading-face`, `--shadow-md`, `--scrim`), the fixed
  `--color-success` / `--color-warning` / `--color-danger`, `--space-1…8`
  (there is no `--space-5` or `--space-7`), and `--radius-sm/md/lg`.
- **`src/domain/` is framework-free**: no DOM, no `localStorage`, no Supabase, no
  `this`. That is why colour names come from a table in the module rather than
  from the browser.
- **The product is multi-tenant.** Beaumont is the first organization, not the
  only one; `schools` holds organizations with a `kind` of `school` or `club`.
  Never hardcode `'bhs'`, `Beaumont`, `Cougars`, or a literal organization
  colour in new work. Every rule here is expressed against a token and must hold
  for a club whose colours are, say, orange and black.
- **The three guard constants**, used exactly as the spec assigns them:
  `MIN_MARK_CONTRAST = 3` (WCAG ratio, for a keyline or figure),
  `MIN_TEXT_CONTRAST = 4.5` (WCAG ratio, for body-size text),
  `MIN_INK_DISTANCE = 32` (Euclidean sRGB distance, for "is this the same colour
  as the text?").
- **The pitch and ledger grounds are not re-themed.** On the touchline and
  ratings screens `--live` stays cyan because it means *this is live right now*,
  and `--rule-strong` stays gold because it marks a standard.
- **No fill anywhere.** Colour is stroke and text. No filled button, no coloured
  panel background, no coloured header band (spec §8).
- **Verification is three gates, by exit code:** `npm test`, `npm run typecheck`,
  `npm run build`. Check the exit code, not the printed output — Vitest can print
  a green summary and still exit 1. The reliable form is
  `npm test > /dev/null 2>&1; echo "EXIT=$?"`.
- **Commits follow Conventional Commits** and end with the trailer
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Tests select on `data-*` attributes, not classes.** Renaming a class is safe;
  removing or renaming a `data-*` hook is not.

---

## File Structure

**Created**

| File | Responsibility |
| --- | --- |
| `src/domain/colour.ts` | Parse a typed colour to channels; the name table; render channels as hex. Nothing else — no contrast, no guard, no branding. |
| `src/domain/colour.test.ts` | Its tests. |

**Modified**

| File | Change |
| --- | --- |
| `src/domain/theme.ts` | `luminance`/`contrastRatio` move onto `parseColour`; gains `colourDistance` and `guardedColour`; `themeVars` emits five normalised properties. |
| `src/domain/theme.test.ts` | Extended for the above, including the Beaumont regression case. |
| `index.css` | The paper ground's `--rule-strong` and `--live` read the organization properties; `--org-text-paper` gains a cold-load fallback. |
| `src/design-tokens.test.ts` | Asserts the retarget on paper and its absence on the two dark grounds. |
| Eight `src/views/*.vue` | The page title takes `var(--mark)`. |
| `src/components/roster/PlayerCard.vue` | The shirt number takes `var(--mark)`. |
| `src/views/HomeView.vue` | The record strip figures take `var(--mark)`. |
| `src/components/admin/SchoolProfileSection.vue` | Accepts three formats, refuses an unparseable one, merges `colors`, shows a swatch and any substitution. |
| `src/components/admin/SchoolProfileSection.test.ts` | Extended. |
| `seed_data.sql` | Beaumont's real colours. |

`colour.ts` is deliberately separate from `theme.ts`: one answers "what colour is
this string", the other "should we use it". Keeping them apart is what lets the
parser be tested against forty-five names and a dozen malformed inputs without
dragging branding into it.

---

### Task 1: The colour parser

**Files:**
- Create: `src/domain/colour.ts`
- Test: `src/domain/colour.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, for Tasks 2 and 5:
  ```ts
  export interface Rgb { r: number; g: number; b: number }
  export function parseColour(value: unknown): Rgb | null;
  export function toHex(c: Rgb): string;           // always lowercase #rrggbb
  export const COLOUR_NAMES: Record<string, Rgb>;  // keys lowercase
  ```

- [ ] **Step 1: Write the failing test**

Create `src/domain/colour.test.ts`:

```ts
/**
 * The colours a coach may type.
 *
 * An organization's colours are entered by hand in the admin panel, so the
 * three forms a person actually reaches for all have to work: a hex code
 * copied from a brand guide, an rgb() triple copied from a design tool, and
 * the name of the colour. Everything else is refused rather than guessed at,
 * because a value that cannot be parsed cannot be contrast-guarded either.
 */
import { describe, it, expect } from 'vitest';
import { parseColour, toHex, COLOUR_NAMES } from './colour';

describe('parseColour', () => {
  it('reads a six-digit hex', () => {
    expect(parseColour('#21196F')).toEqual({ r: 33, g: 25, b: 111 });
  });

  it('reads a three-digit hex, doubling each channel', () => {
    expect(parseColour('#abc')).toEqual({ r: 170, g: 187, b: 204 });
  });

  it('reads an rgb() triple, comma or space separated', () => {
    expect(parseColour('rgb(33, 25, 111)')).toEqual({ r: 33, g: 25, b: 111 });
    expect(parseColour('rgb(33 25 111)')).toEqual({ r: 33, g: 25, b: 111 });
    expect(parseColour('rgb(  33,25 , 111 )')).toEqual({ r: 33, g: 25, b: 111 });
  });

  it('reads a name, ignoring case and surrounding space', () => {
    expect(parseColour('  NAVY  ')).toEqual({ r: 0, g: 0, b: 128 });
    expect(parseColour('white')).toEqual({ r: 255, g: 255, b: 255 });
  });

  // A channel outside 0-255 is a typo. Clamping it to red would hide the typo
  // and hand back a colour nobody chose.
  it('refuses an out-of-range channel rather than clamping', () => {
    expect(parseColour('rgb(300, 0, 0)')).toBeNull();
    expect(parseColour('rgb(-1, 0, 0)')).toBeNull();
  });

  // Alpha has no fixed contrast against a ground -- it depends what is behind
  // it -- so a colour carrying alpha cannot be guarded, and is not accepted.
  it('refuses anything carrying alpha', () => {
    expect(parseColour('rgba(0, 0, 0, 0.5)')).toBeNull();
    expect(parseColour('#21196F80')).toBeNull();
  });

  it('refuses forms it cannot measure', () => {
    for (const v of ['hsl(200 50% 50%)', 'oklch(0.6 0.1 200)', 'currentColor',
                     '#12345', '#gg0000', 'papayawhip', '', '   ']) {
      expect(parseColour(v), v).toBeNull();
    }
  });

  // The value ends up in a stylesheet. Nothing that could close a declaration
  // or open a rule may survive parsing.
  it('refuses a value carrying stylesheet punctuation', () => {
    for (const v of ['red; } body { display: none', 'blue;', 'var(--ink)',
                     'url(x)', 'navy)']) {
      expect(parseColour(v), v).toBeNull();
    }
  });

  it('refuses a non-string', () => {
    for (const v of [null, undefined, 42, {}, []]) {
      expect(parseColour(v as unknown), String(v)).toBeNull();
    }
  });
});

describe('toHex', () => {
  it('renders channels as lowercase #rrggbb, padding single digits', () => {
    expect(toHex({ r: 33, g: 25, b: 111 })).toBe('#21196f');
    expect(toHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
    expect(toHex({ r: 255, g: 255, b: 255 })).toBe('#ffffff');
  });

  it('round-trips every name in the table', () => {
    for (const [name, rgb] of Object.entries(COLOUR_NAMES)) {
      expect(parseColour(toHex(rgb)), name).toEqual(rgb);
    }
  });
});

describe('COLOUR_NAMES', () => {
  it('holds the sixteen basic CSS names', () => {
    for (const n of ['aqua', 'black', 'blue', 'fuchsia', 'gray', 'green', 'lime',
                     'maroon', 'navy', 'olive', 'purple', 'red', 'silver',
                     'teal', 'white', 'yellow']) {
      expect(COLOUR_NAMES, n).toHaveProperty(n);
    }
  });

  it('keys are lowercase and channels are in range', () => {
    for (const [name, { r, g, b }] of Object.entries(COLOUR_NAMES)) {
      expect(name, name).toBe(name.toLowerCase());
      for (const c of [r, g, b]) {
        expect(Number.isInteger(c), name).toBe(true);
        expect(c, name).toBeGreaterThanOrEqual(0);
        expect(c, name).toBeLessThanOrEqual(255);
      }
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run src/domain/colour.test.ts
```

Expected: FAIL — the module does not exist, so the import cannot resolve.

- [ ] **Step 3: Write the module**

Create `src/domain/colour.ts`:

```ts
/**
 * A colour, as a coach typed it.
 *
 * An organization's colours are entered by hand in the admin panel, so this
 * accepts the three forms a person reaches for: a hex code from a brand guide,
 * an rgb() triple from a design tool, and the name of the colour. It refuses
 * everything else — including alpha, which has no fixed contrast against a
 * ground, and so could not be guarded by `domain/theme.ts`.
 *
 * The names are a table rather than a lookup through the browser because this
 * module, like the rest of src/domain/, is framework-free: no DOM, no
 * localStorage, no Supabase. It is also deliberately not the full CSS list of
 * 148 — a curated table stays readable and testable, and `papayawhip` is not a
 * school colour. A name outside it is refused, so the boundary is visible
 * rather than silent.
 */

export interface Rgb { r: number; g: number; b: number }

/**
 * The names accepted, as hex. The sixteen basic CSS colour names, plus the
 * ones a school or club would plausibly use for its own.
 */
const NAMED_HEX: Record<string, string> = {
  // The sixteen basic CSS colours.
  aqua: '#00ffff', black: '#000000', blue: '#0000ff', fuchsia: '#ff00ff',
  gray: '#808080', green: '#008000', lime: '#00ff00', maroon: '#800000',
  navy: '#000080', olive: '#808000', purple: '#800080', red: '#ff0000',
  silver: '#c0c0c0', teal: '#008080', white: '#ffffff', yellow: '#ffff00',
  // Colours a programme might actually claim.
  brown: '#a52a2a', chocolate: '#d2691e', coral: '#ff7f50', crimson: '#dc143c',
  cyan: '#00ffff', darkblue: '#00008b', darkgreen: '#006400', darkred: '#8b0000',
  firebrick: '#b22222', forestgreen: '#228b22', gold: '#ffd700', grey: '#808080',
  indigo: '#4b0082', khaki: '#f0e68c', lavender: '#e6e6fa', magenta: '#ff00ff',
  midnightblue: '#191970', orange: '#ffa500', orchid: '#da70d6', pink: '#ffc0cb',
  plum: '#dda0dd', royalblue: '#4169e1', salmon: '#fa8072', sienna: '#a0522d',
  skyblue: '#87ceeb', steelblue: '#4682b4', tan: '#d2b48c', turquoise: '#40e0d0',
  violet: '#ee82ee'
};

/** Exactly #rgb or #rrggbb. An eight-digit hex carries alpha and is refused. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/;

/** rgb(r,g,b) or rgb(r g b). No alpha, no percentages. */
const RGB = /^rgb\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)$/;

function fromHex(hex: string): Rgb {
  const h = hex.slice(1);
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16)
  };
}

/** The names accepted, as channels. */
export const COLOUR_NAMES: Record<string, Rgb> = Object.fromEntries(
  Object.entries(NAMED_HEX).map(([name, hex]) => [name, fromHex(hex)])
);

/** The colour a coach typed, as channels, or null if it is not one. */
export function parseColour(value: unknown): Rgb | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;

  if (HEX.test(v)) return fromHex(v);

  const m = RGB.exec(v);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number);
    // A channel outside the range is a typo; clamping would hide it.
    if ([r, g, b].some(c => c > 255)) return null;
    return { r, g, b };
  }

  return COLOUR_NAMES[v] ?? null;
}

/** Channels as the lowercase #rrggbb a stylesheet is given. */
export function toHex({ r, g, b }: Rgb): string {
  const pair = (c: number): string => c.toString(16).padStart(2, '0');
  return `#${pair(r)}${pair(g)}${pair(b)}`;
}
```

Note the `RGB` regex admits only digits, so `rgb(-1, 0, 0)` fails the pattern
rather than needing a lower-bound check — but read the test for
`rgb(-1, 0, 0)` and confirm it passes before moving on. If it does not, add the
check rather than editing the test.

- [ ] **Step 4: Run the test**

```bash
npx vitest run src/domain/colour.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the three gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"; npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"; npm run build > /dev/null 2>&1; echo "BUILD=$?"
```

Expected: `TEST=0 TYPECHECK=0 BUILD=0`.

- [ ] **Step 6: Commit**

```bash
git add src/domain/colour.ts src/domain/colour.test.ts
git commit -m "feat: parse the colours a coach may type

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The guard

The live bug and its fix. Beaumont's stored secondary is already `#FFFFFF`, and
`guardedMark` already passes it — white clears 17:1 against the dark ground —
so `--mark` on the ratings and touchline screens is white today, the same as
that ground's `--ink` of `#F8FAFC`. The rank figures already read as plain text.

**Files:**
- Modify: `src/domain/theme.ts`
- Test: `src/domain/theme.test.ts`

**Interfaces:**
- Consumes from Task 1: `parseColour`, `toHex`, `Rgb`.
- Produces, for Tasks 3 and 5:
  ```ts
  export const MIN_MARK_CONTRAST: 3;
  export const MIN_TEXT_CONTRAST: 4.5;
  export const MIN_INK_DISTANCE: 32;
  export const PAPER_GROUND: '#f3f2f2';
  export const DARK_GROUND: '#0A1428';
  export const PAPER_INK: '#201f1d';
  export const DARK_INK: '#F8FAFC';
  export function contrastRatio(a: string, b: string): number;
  export function colourDistance(a: string, b: string): number;
  export function guardedColour(
    colour: string, ground: string, ink: string, min: number, fallback: string
  ): string;
  export function themeVars(b: Branding): Record<string, string>;
  ```
  `themeVars` emits exactly `--org-primary`, `--org-secondary`,
  `--org-mark-paper`, `--org-mark-dark`, `--org-text-paper`, every value
  matching `/^#[0-9a-f]{6}$/`.

  `guardedMark` is **removed**; `guardedColour` replaces it. Check for other
  callers before deleting (`git grep -n guardedMark src/`) and report what you
  found.

- [ ] **Step 1: Write the failing test**

Replace the existing `contrastRatio` / `guardedMark` / `themeVars` describes in
`src/domain/theme.test.ts` with these, keeping every other describe in the file
unchanged:

```ts
describe('contrastRatio', () => {
  it('is 21 for black against white and 1 for a colour against itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#21196f', '#21196f')).toBeCloseTo(1, 5);
  });

  // One colour, three spellings, one answer -- the guard has to measure a
  // colour whatever form the admin typed it in.
  it('gives the same answer for every accepted spelling', () => {
    const hex = contrastRatio('#000080', PAPER_GROUND);
    expect(contrastRatio('rgb(0, 0, 128)', PAPER_GROUND)).toBeCloseTo(hex, 10);
    expect(contrastRatio('navy', PAPER_GROUND)).toBeCloseTo(hex, 10);
  });
});

describe('colourDistance', () => {
  /*
   * Why this is a distance and not a contrast ratio. WCAG contrast is
   * luminance-only: Beaumont's navy and the paper ink are both very dark, so
   * their ratio is about 1.09 and a ratio-based test would throw the
   * organization's own colour away. By distance they are plainly different,
   * because one is blue.
   */
  it('separates a brand colour from ink it merely shares a luminance with', () => {
    expect(contrastRatio('#21196f', PAPER_INK)).toBeLessThan(1.5);
    expect(colourDistance('#21196f', PAPER_INK)).toBeGreaterThan(MIN_INK_DISTANCE);
  });

  it('catches a colour that really is the text colour', () => {
    expect(colourDistance('#ffffff', DARK_INK)).toBeLessThan(MIN_INK_DISTANCE);
  });

  it('is zero for a colour against itself and symmetric', () => {
    expect(colourDistance('#21196f', '#21196f')).toBe(0);
    expect(colourDistance('#000000', '#ffffff'))
      .toBeCloseTo(colourDistance('#ffffff', '#000000'), 10);
  });
});

describe('guardedColour', () => {
  it('keeps a colour that clears both floors', () => {
    expect(guardedColour('#21196f', PAPER_GROUND, PAPER_INK, MIN_MARK_CONTRAST, '#201f1d'))
      .toBe('#21196f');
  });

  // The two floors are independent: failing either one is enough.
  it('falls back when the contrast floor fails', () => {
    expect(guardedColour('#f5f4f4', PAPER_GROUND, PAPER_INK, MIN_MARK_CONTRAST, '#201f1d'))
      .toBe('#201f1d');
  });

  it('falls back when the colour is the ink, even at high contrast', () => {
    expect(contrastRatio('#ffffff', DARK_GROUND)).toBeGreaterThan(MIN_MARK_CONTRAST);
    expect(guardedColour('#ffffff', DARK_GROUND, DARK_INK, MIN_MARK_CONTRAST, '#FFD700'))
      .toBe('#FFD700');
  });

  it('applies the text floor more strictly than the mark floor', () => {
    const mid = '#8a7fd0';
    const asMark = guardedColour(mid, PAPER_GROUND, PAPER_INK, MIN_MARK_CONTRAST, '#201f1d');
    const asText = guardedColour(mid, PAPER_GROUND, PAPER_INK, MIN_TEXT_CONTRAST, '#201f1d');
    expect(asMark).toBe(mid);
    expect(asText).toBe('#201f1d');
  });

  it('falls back on a colour it cannot parse', () => {
    expect(guardedColour('nonsense', PAPER_GROUND, PAPER_INK, MIN_MARK_CONTRAST, '#201f1d'))
      .toBe('#201f1d');
  });
});

describe('themeVars', () => {
  const beaumont = brandingFor({
    name: 'Beaumont High School', mascot: 'Cougars',
    colors: { primary: 'rgb(33, 25, 111)', secondary: 'white' }
  });

  it('emits the five properties, all as normalised hex', () => {
    const vars = themeVars(beaumont);
    expect(Object.keys(vars).sort()).toEqual([
      '--org-mark-dark', '--org-mark-paper', '--org-primary',
      '--org-secondary', '--org-text-paper'
    ]);
    for (const [prop, value] of Object.entries(vars)) {
      expect(value, prop).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  /*
   * The regression this whole task exists for. Beaumont's secondary is white,
   * which clears 17:1 against the navy ground and so passed the old guard --
   * making the rank figures and armed buttons the same colour as the text
   * beside them.
   */
  it('refuses a white secondary as the mark on the dark grounds', () => {
    expect(themeVars(beaumont)['--org-mark-dark']).toBe('#ffd700');
  });

  it('keeps the navy primary for both paper roles', () => {
    const vars = themeVars(beaumont);
    expect(vars['--org-mark-paper']).toBe('#21196f');
    expect(vars['--org-text-paper']).toBe('#21196f');
  });

  /*
   * A row holding nonsense renders the app's historical defaults, not the
   * guard's fallbacks: brandingFor substitutes DEFAULT_PRIMARY and
   * DEFAULT_SECONDARY before themeVars ever sees the value, so an organization
   * that never set its colours looks as it did before. Both defaults clear
   * both floors, so nothing is guarded away.
   */
  it('renders the historical defaults when the row holds nonsense', () => {
    const vars = themeVars(brandingFor({ colors: { primary: '???', secondary: '???' } }));
    expect(vars['--org-mark-paper']).toBe('#0047ab');
    expect(vars['--org-text-paper']).toBe('#0047ab');
    expect(vars['--org-mark-dark']).toBe('#ffd700');
  });
});
```

Update the file's imports to bring in `colourDistance`, `guardedColour`,
`MIN_TEXT_CONTRAST`, `MIN_INK_DISTANCE`, `PAPER_INK` and `DARK_INK`.

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run src/domain/theme.test.ts
```

Expected: FAIL — `colourDistance`, `guardedColour`, `PAPER_INK`, `DARK_INK`,
`MIN_TEXT_CONTRAST` and `MIN_INK_DISTANCE` are not exported, and `themeVars`
emits four properties rather than five.

- [ ] **Step 3: Rewrite the guard in `src/domain/theme.ts`**

Keep `Branding`, `brandingFor`, `DEFAULT_PRIMARY`, `DEFAULT_SECONDARY`,
`PAPER_GROUND`, `DARK_GROUND`, `PAPER_MARK_FALLBACK`, `DARK_MARK_FALLBACK` and
`MIN_MARK_CONTRAST` as they are, with two changes to `brandingFor`: its private
`colour()` helper now validates with `parseColour` instead of its own hex regex,
and **it stores the trimmed string the coach typed, not a normalised form**, so
a value of `navy` round-trips to the admin form as `navy`.

Then replace the guard section:

```ts
import { parseColour, toHex } from './colour';

/** The ink each ground sets, which a mark must not be mistaken for. */
export const PAPER_INK = '#201f1d';
export const DARK_INK = '#F8FAFC';

/**
 * 4.5:1 is WCAG's floor for body-size text. A link is body-size text; a
 * keyline or a rank figure is not, which is why MIN_MARK_CONTRAST is 3.
 */
export const MIN_TEXT_CONTRAST = 4.5;

/**
 * How far a mark must sit from the ink beside it, as Euclidean distance in
 * sRGB, out of a possible ~441.
 *
 * This is a distance and not a contrast ratio on purpose. WCAG contrast is
 * luminance-only and cannot see hue: Beaumont's navy #21196F and the paper ink
 * #201f1d are both very dark, so their ratio is about 1.09, and a ratio-based
 * test would reject the organization's own colour. By distance they are ~82
 * apart, because one is blue. White against the dark ground's #F8FAFC is ~9
 * apart and is correctly rejected. 32 separates the two with room either side.
 *
 * Euclidean sRGB distance is a crude perceptual model. It is adequate because
 * the question is coarse -- is this the same colour as the text? -- and a
 * faithful model would add a colour-space conversion without changing the
 * answer in any case this guards against.
 */
export const MIN_INK_DISTANCE = 32;

/** sRGB relative luminance, per WCAG 2. */
function luminance(c: { r: number; g: number; b: number }): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/**
 * WCAG contrast ratio between two colours, 1 (identical) to 21.
 * An unparseable colour gives 1 -- the worst answer, so a guard fails closed.
 */
export function contrastRatio(a: string, b: string): number {
  const ca = parseColour(a);
  const cb = parseColour(b);
  if (!ca || !cb) return 1;
  const la = luminance(ca);
  const lb = luminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Euclidean distance between two colours in sRGB. Unparseable gives 0. */
export function colourDistance(a: string, b: string): number {
  const ca = parseColour(a);
  const cb = parseColour(b);
  if (!ca || !cb) return 0;
  return Math.sqrt(
    (ca.r - cb.r) ** 2 + (ca.g - cb.g) ** 2 + (ca.b - cb.b) ** 2
  );
}

/**
 * The organization's colour, or the fallback when it cannot do the job.
 *
 * An admin picks the colours, and the spec's position is that the interface
 * adapts rather than the admin. Two ways a colour fails: it cannot be seen
 * against the ground, or it cannot be told apart from the text beside it.
 * `min` is MIN_MARK_CONTRAST for a keyline or figure, MIN_TEXT_CONTRAST for
 * body-size text.
 */
export function guardedColour(
  colour: string, ground: string, ink: string, min: number, fallback: string
): string {
  const c = parseColour(colour);
  if (!c) return fallback;
  if (contrastRatio(colour, ground) < min) return fallback;
  if (colourDistance(colour, ink) < MIN_INK_DISTANCE) return fallback;
  return toHex(c);
}

/**
 * The custom properties to paint onto the document.
 *
 * Always normalised hex, whatever the row holds: six hex digits are the only
 * thing that reaches a stylesheet, which is what makes accepting rgb() and
 * names safe.
 */
export function themeVars(b: Branding): Record<string, string> {
  const raw = (v: string, fallback: string): string => {
    const c = parseColour(v);
    return c ? toHex(c) : fallback;
  };
  return {
    '--org-primary': raw(b.primary, DEFAULT_PRIMARY.toLowerCase()),
    '--org-secondary': raw(b.secondary, DEFAULT_SECONDARY.toLowerCase()),
    '--org-mark-paper': guardedColour(
      b.primary, PAPER_GROUND, PAPER_INK, MIN_MARK_CONTRAST, PAPER_MARK_FALLBACK
    ).toLowerCase(),
    '--org-mark-dark': guardedColour(
      b.secondary, DARK_GROUND, DARK_INK, MIN_MARK_CONTRAST, DARK_MARK_FALLBACK
    ).toLowerCase(),
    '--org-text-paper': guardedColour(
      b.primary, PAPER_GROUND, PAPER_INK, MIN_TEXT_CONTRAST, PAPER_MARK_FALLBACK
    ).toLowerCase()
  };
}
```

Delete `guardedMark` and the old hex-parsing `luminance`. Run
`git grep -n "guardedMark" src/` first and report every caller you found and
what you did with it.

- [ ] **Step 4: Run the test**

```bash
npx vitest run src/domain/theme.test.ts
```

Expected: PASS. If the `#8a7fd0` case in `guardedColour` does not straddle the
two floors, compute a colour that does and use it — the point of the case is
that the floors differ, not that colour specifically. Report the value you used.

- [ ] **Step 5: Run the three gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"; npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"; npm run build > /dev/null 2>&1; echo "BUILD=$?"
```

Expected: `TEST=0 TYPECHECK=0 BUILD=0`.

- [ ] **Step 6: Commit**

```bash
git add src/domain/theme.ts src/domain/theme.test.ts
git commit -m "fix: a brand colour must differ from the text beside it

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The paper accent

Two declarations, and the whole widening. `--rule-strong` and `--live` on the
paper ground are both `#7d5411`, coinciding on purpose because the Classical
system has one accent. Pointing them at the organization reaches every paper
screen at once with no component edited: links, the rule under the next fixture,
accent kickers, active tab underlines, the `.btn--go` outline, notice
left-edges, picked quiz options, active roster chips, and the focus-visible
ring.

**Files:**
- Modify: `index.css`
- Test: `src/design-tokens.test.ts`

**Interfaces:**
- Consumes from Task 2: the `--org-mark-paper` and `--org-text-paper` properties.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Append to `src/design-tokens.test.ts`, after the `describe('the fixed tokens', …)` block:

```ts
/**
 * The accent belongs to the organization, on the paper ground only.
 *
 * The touchline and ratings screens keep cyan and gold: there --live means
 * "this is happening right now" under match conditions and --rule-strong marks
 * a standard. Those are functional colours, and re-theming them would trade
 * legibility on a touchline for consistency in a brand guideline.
 */
describe('the organization accent', () => {
  it('drives both paper accent tokens', () => {
    const paper = block('[data-ground="paper"]');
    expect(paper).toMatch(/--rule-strong:\s*var\(--org-mark-paper\)/);
    expect(paper).toMatch(/--live:\s*var\(--org-text-paper\)/);
  });

  it('does not reach the two dark grounds', () => {
    for (const ground of ['pitch', 'ledger']) {
      const body = block(`[data-ground="${ground}"]`);
      expect(body, `${ground} --rule-strong`).not.toMatch(/--rule-strong:\s*var\(--org/);
      expect(body, `${ground} --live`).not.toMatch(/--live:\s*var\(--org/);
    }
  });

  it('gives --org-text-paper a cold-load fallback like its siblings', () => {
    expect(css).toMatch(/--org-text-paper:\s*#[0-9a-fA-F]{6}/);
  });
});
```

Also add `'--org-text-paper'` to the list in the existing
`carries the four organization properties with cold-load fallbacks` case, and
rename that case to say five.

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run src/design-tokens.test.ts
```

Expected: FAIL — the paper block still declares `--rule-strong: #7d5411` and
`--live: #7d5411`, and `--org-text-paper` has no fallback in `:root`.

- [ ] **Step 3: Retarget the paper accent**

In `index.css`, in the `:root, [data-ground="paper"]` block, replace:

```css
  --rule-strong: #7d5411;
  --live: #7d5411;
```

with:

```css
  /* The accent is the organization's, guarded. --rule-strong takes the 3:1
     value because its uses are rules and kickers; --live takes the 4.5:1 one
     because links are its body-size use. src/domain/theme.ts. */
  --rule-strong: var(--org-mark-paper);
  --live: var(--org-text-paper);
```

And in the `:root` block where the organization properties are declared, add the
cold-load fallback beside its siblings:

```css
  --org-text-paper: #0047AB;
```

Leave the `[data-ground="pitch"]` and `[data-ground="ledger"]` blocks untouched.

- [ ] **Step 4: Run the test**

```bash
npx vitest run src/design-tokens.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the three gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"; npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"; npm run build > /dev/null 2>&1; echo "BUILD=$?"
```

Expected: `TEST=0 TYPECHECK=0 BUILD=0`.

- [ ] **Step 6: Commit**

```bash
git add index.css src/design-tokens.test.ts
git commit -m "feat: the paper accent is the organization's

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The three explicit marks

Ten single-declaration edits, all the same shape. Batch them; this is one diff,
not ten.

**Files:**
- Modify, changing `color: var(--ink)` to `color: var(--mark)` in the named rule:
  - `src/views/RosterView.vue` — `.roster__title`
  - `src/views/ScheduleView.vue` — `.sched__title`
  - `src/views/PlannerView.vue` — `.planner__title`
  - `src/views/CoachesView.vue` — `.staff__title`
  - `src/views/HelpView.vue` — `.help__title`
  - `src/views/AdminView.vue` — `.admin__title`
  - `src/views/QuizView.vue` — `.quiz__title`
  - `src/views/PlaceholderView.vue` — `.placeholder__title`
- Modify: `src/components/roster/PlayerCard.vue` — `.card__num`
- Modify: `src/views/HomeView.vue` — `.stat__value`

**`src/views/MatrixView.vue` is deliberately excluded.** Its route carries
`meta: { ground: 'ledger' }` (`src/router/index.ts:117`), so `--mark` there
resolves to `--org-mark-dark` and its title would take the dark-ground accent.
The spec keeps the ratings screen out of the widening. Do not touch
`.matrix__title`.

The four tool screens (`LineupView`, `LiveMatchView`, `SeasonReportView`,
`SessionEntryView`) are also excluded, for the same reason — they are pitch and
ledger routes and draw their titles through `ToolScreen.vue`.

**Interfaces:**
- Consumes from Task 3: nothing directly — `--mark` already resolved to
  `--org-mark-paper` on the paper ground before this plan began. These edits
  are independent of Task 3 and could land in either order.
- Produces: nothing.

- [ ] **Step 1: Confirm the rules say what the plan says**

```bash
grep -n "__title {\|card__num\|stat__value" src/views/RosterView.vue src/views/ScheduleView.vue src/views/PlannerView.vue src/views/CoachesView.vue src/views/HelpView.vue src/views/AdminView.vue src/views/QuizView.vue src/views/PlaceholderView.vue src/components/roster/PlayerCard.vue src/views/HomeView.vue
```

Each of the ten should show a rule containing `color: var(--ink)`. Report any
that does not, and do not guess — if a rule has moved or been renamed, say so
and stop.

`PlayerCard.vue`'s `.card__num` is a multi-line block; the `color` declaration
may be on its own line. `HomeView.vue`'s `.stat__value` is a one-line rule.

- [ ] **Step 2: Make the ten edits**

In each named rule, and **only** in that rule, change `color: var(--ink)` to
`color: var(--mark)`. Change nothing else — no font size, no weight, no
template, no `data-*`.

- [ ] **Step 3: Check no other rule was caught**

```bash
git diff --stat
git diff | grep -c "^[-+].*color: var(--mark)"
```

Expected: ten files changed, and ten added lines matching. If the count is not
ten, a rule was missed or an extra one was changed — find which before going on.

- [ ] **Step 4: Run the tests**

```bash
npx vitest run src/views src/components/roster src/design-tokens.test.ts
```

Expected: PASS. No test asserts on these colours, so this step is a regression
check rather than a proof.

- [ ] **Step 5: Run the three gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"; npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"; npm run build > /dev/null 2>&1; echo "BUILD=$?"
```

Expected: `TEST=0 TYPECHECK=0 BUILD=0`.

- [ ] **Step 6: Commit**

```bash
git add src/views src/components/roster/PlayerCard.vue
git commit -m "feat: titles, shirt numbers and the record carry the organization's mark

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The admin form, and Beaumont's colours

Where the silence gets fixed. A colour the parser refuses currently falls
through to cobalt with no signal — which is how Beaumont's stored primary came
to be `#0047AB` rather than its own colour.

**Files:**
- Modify: `src/components/admin/SchoolProfileSection.vue`
- Test: `src/components/admin/SchoolProfileSection.test.ts`
- Modify: `seed_data.sql`

**Interfaces:**
- Consumes from Task 1: `parseColour`, `toHex`.
- Consumes from Task 2: `guardedColour`, `MIN_MARK_CONTRAST`, `DARK_GROUND`,
  `DARK_INK`, `DARK_MARK_FALLBACK`.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Append to `src/components/admin/SchoolProfileSection.test.ts`. Read the file
first and reuse its existing mount helper and service mock rather than writing
new ones — and note that `vi.clearAllMocks()` clears calls but **not**
implementations, so set any override *after* mounting, or put it in
`beforeEach`.

```ts
describe('the colour fields', () => {
  it('refuses to save a colour it cannot parse, and says what it accepts', async () => {
    const wrapper = await mountSection();      // reuse the file's helper
    await wrapper.find('[data-school-primary]').setValue('greenish');
    await wrapper.find('[data-school-save]').trigger('click');

    expect(upsertSchool).not.toHaveBeenCalled();
    const msg = wrapper.find('[data-school-colour-error]').text();
    expect(msg).toContain('greenish');
    expect(msg).toMatch(/hex|rgb|name/i);
  });

  it('accepts each of the three forms', async () => {
    for (const value of ['#21196F', 'rgb(33, 25, 111)', 'navy']) {
      const wrapper = await mountSection();
      await wrapper.find('[data-school-primary]').setValue(value);
      await wrapper.find('[data-school-save]').trigger('click');
      expect(upsertSchool, value).toHaveBeenCalled();
    }
  });

  // The row carries keys this form does not edit. Writing a fresh object
  // silently drops them -- Beaumont's row has a "navy" key that disappeared on
  // every save.
  it('preserves a key in colors that it does not edit', async () => {
    const wrapper = await mountSection({
      colors: { primary: '#21196F', secondary: 'white', navy: '#0A1428' }
    });
    await wrapper.find('[data-school-save]').trigger('click');

    const sent = upsertSchool.mock.calls[0][0];
    expect(sent.colors.navy).toBe('#0A1428');
  });

  it('says which colour the interface had to substitute, and why', async () => {
    const wrapper = await mountSection({
      colors: { primary: '#21196F', secondary: 'white' }
    });
    expect(wrapper.find('[data-school-colour-note]').text()).toMatch(/white/i);
  });
});
```

Adapt the mount helper's signature to whatever the file already uses for
seeding a school row, and report what you found.

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run src/components/admin/SchoolProfileSection.test.ts
```

Expected: FAIL — no `data-school-colour-error` or `data-school-colour-note`
element exists, an unparseable colour is saved rather than refused, and the
save drops the `navy` key.

- [ ] **Step 3: Validate before saving**

In `SchoolProfileSection.vue`'s `<script setup>`, import from the domain modules
and add:

```ts
import { parseColour, toHex } from '../../domain/colour';
import {
  guardedColour, MIN_MARK_CONTRAST, DARK_GROUND, DARK_INK, DARK_MARK_FALLBACK
} from '../../domain/theme';

/** What the two fields accept, said once so the message and the hint agree. */
const COLOUR_FORMS = 'a hex code (#21196F), an rgb() triple (rgb(33, 25, 111)), or a colour name (navy)';

const colourError = computed<string | null>(() => {
  for (const [label, value] of [['Primary', form.value.primary], ['Secondary', form.value.secondary]] as const) {
    if (!parseColour(value)) {
      return `${label} colour: "${value}" is not a colour this app can read. Use ${COLOUR_FORMS}.`;
    }
  }
  return null;
});

/**
 * The mark the touchline and ratings screens will actually use.
 *
 * An organization is entitled to know the interface overrode its brand, even
 * though the spec's position is that the interface adapts rather than the
 * admin.
 */
const substituted = computed<string | null>(() => {
  const s = form.value.secondary;
  if (!parseColour(s)) return null;
  const used = guardedColour(s, DARK_GROUND, DARK_INK, MIN_MARK_CONTRAST, DARK_MARK_FALLBACK);
  const asked = toHex(parseColour(s)!);
  return used.toLowerCase() === asked.toLowerCase()
    ? null
    : `${s} cannot be told apart from the text on the match screens, so those use ${used} instead.`;
});
```

In the save handler, refuse early — the same discipline the form already applies
to a blank name, and for the same reason: a silent wrong answer is worse than a
refusal.

```ts
if (colourError.value) { error.value = colourError.value; return; }
```

And merge rather than replace, so a key this form does not edit survives:

```ts
colors: {
  ...(row.value?.colors ?? {}),
  primary: form.value.primary.trim(),
  secondary: form.value.secondary.trim()
},
```

Read the component for the actual name of the loaded row — the plan writes
`row.value` but the file may hold it differently. Report what you found.

- [ ] **Step 4: Show it in the template**

Beside the two colour fields, add the hint, the swatch and the two messages.
Keep every existing `data-*` attribute; add only the three new ones.

```html
<label class="field">
  <span class="kicker">Primary colour</span>
  <span class="swatch-row">
    <input v-model="form.primary" data-school-primary type="text" class="input" />
    <span class="swatch" :style="{ background: swatchFor(form.primary) }" aria-hidden="true"></span>
  </span>
</label>
```

with the same shape for the secondary, and after the grid:

```html
<p class="note" data-school-colour-forms>Colours accept {{ COLOUR_FORMS }}.</p>
<p v-if="colourError" class="note note--bad" role="alert" data-school-colour-error>{{ colourError }}</p>
<p v-if="substituted" class="note" data-school-colour-note>{{ substituted }}</p>
```

`swatchFor` returns the parsed colour as hex, or `transparent` when the value is
not a colour, so a half-typed value shows nothing rather than the last good one:

```ts
function swatchFor(value: string): string {
  const c = parseColour(value);
  return c ? toHex(c) : 'transparent';
}
```

Scoped styles — the swatch is a stroked box showing a fill of a colour that is
not a token, which is the one legitimate case for an inline background in this
codebase, and it carries `aria-hidden` because the field's text already says the
colour:

```css
.swatch-row { display: flex; gap: var(--space-2); align-items: center; }
.swatch {
  width: 28px;
  height: 28px;
  flex: none;
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
}
```

- [ ] **Step 5: Run the test**

```bash
npx vitest run src/components/admin/SchoolProfileSection.test.ts
```

Expected: PASS.

- [ ] **Step 6: Correct Beaumont's seeded colours**

In `seed_data.sql`, line 10, replace:

```sql
  '{"primary": "#0047AB", "secondary": "#FFFFFF", "navy": "#0A1428"}'::jsonb,
```

with:

```sql
  '{"primary": "rgb(33, 25, 111)", "secondary": "white", "navy": "#0A1428"}'::jsonb,
```

The `navy` key stays: nothing reads it, but Step 3 has just taught the form to
preserve unknown keys, and deleting one here would contradict that.

- [ ] **Step 7: Run the three gates**

```bash
npm test > /dev/null 2>&1; echo "TEST=$?"; npm run typecheck > /dev/null 2>&1; echo "TYPECHECK=$?"; npm run build > /dev/null 2>&1; echo "BUILD=$?"
```

Expected: `TEST=0 TYPECHECK=0 BUILD=0`.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/SchoolProfileSection.vue src/components/admin/SchoolProfileSection.test.ts seed_data.sql
git commit -m "feat: the admin form reads three colour forms and refuses the rest

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 9: Hand the live-database statement to the user**

`seed_data.sql` is a provisioning script and does not touch a running database.
Report this statement for the user to apply in the Supabase SQL editor, and say
plainly that until it runs, the deployed site still shows cobalt:

```sql
update public.schools
   set colors = colors || '{"primary": "rgb(33, 25, 111)", "secondary": "white"}'::jsonb
 where code = 'bhs';
```

`||` merges, so any other key in the column survives.

---

## Self-Review

**Spec coverage.**

- §2 storage, JSONB, no migration, row holds what was typed — Task 2 Step 3
  (`brandingFor` keeps the trimmed string) and Task 5 Step 3 (the merge).
- §2 unknown keys preserved — Task 5 Steps 1 and 3, with a test.
- §3.1 `colour.ts`, the three accepted forms, alpha refused, forty-five names —
  Task 1.
- §3.2 normalised hex only reaches the stylesheet — Task 2 Step 3 (`themeVars`),
  asserted in Task 2 Step 1.
- §3.3 three measures, distance not ratio, the Beaumont arithmetic — Task 2.
- §3.4 five properties and the table of guards — Task 2 Step 3.
- §4.1 the paper accent retarget, dark grounds untouched — Task 3, asserted both
  ways.
- §4.2 titles, shirt numbers, the record strip — Task 4.
- §4.3 no fill — the only `background` this plan adds is the admin swatch, which
  is a preview of a colour rather than a UI surface, and is called out as such.
- §5 the admin form: three forms, refusal, merge, swatch, substitution notice —
  Task 5.
- §6 Beaumont's data, seed and live statement — Task 5 Steps 6 and 9.
- §7 testing — each task's Step 1.

**Gap found and closed while reviewing.** The spec's §7 asks for a design-tokens
assertion that the dark grounds do *not* read an organization property; the
first draft of Task 3 asserted only the positive case. Both directions are now
in Task 3 Step 1, which is the assertion that actually protects the touchline.

**Placeholder scan.** Every code step carries its code. Five steps tell the
implementer to read existing code and report what they found — the `guardedMark`
callers (Task 2 Step 3), the `#8a7fd0` straddle value (Task 2 Step 4), the ten
rules' current text (Task 4 Step 1), the test file's mount helper (Task 5
Step 1), and the loaded row's variable name (Task 5 Step 3). Each is a real
ambiguity in existing code, not a gap in the plan.

**Type consistency.** `parseColour` returns `Rgb | null` in Task 1 and is called
that way in Tasks 2 and 5. `toHex` takes an `Rgb` and returns a lowercase
`#rrggbb`, which is why Task 2's `themeVars` test asserts
`/^#[0-9a-f]{6}$/` without a case-insensitive flag and why the fallback
constants are lowercased at the point of use. `guardedColour`'s five parameters
appear in the same order in Task 2's definition, Task 2's tests and Task 5's
`substituted`. `MIN_MARK_CONTRAST` is reused from the existing module rather
than redeclared; `MIN_TEXT_CONTRAST`, `MIN_INK_DISTANCE`, `PAPER_INK` and
`DARK_INK` are new in Task 2 and consumed only afterwards.
