# Organization colour — design

## 1. What this is

The organization's colour barely reaches the interface. `schools.colors` has
held a primary and a secondary since the first schema, and `src/domain/theme.ts`
paints them onto the document at runtime — but only four components read the
result, in nine declarations: the crest keyline in the header, the Matrix rank
figure, and a handful of lineup and live-match accents. Every other screen is
ink on paper with one fixed brown-gold accent that is the same for every
organization.

This design does three things:

1. **Accepts the colour formats a coach would actually type** — `#21196F`,
   `rgb(33, 25, 111)`, or a name like `navy`. Today only hex is accepted and
   anything else falls back to cobalt blue **silently**, which is how Beaumont's
   own colours came to be wrong in the database.
2. **Fixes the guard**, which currently lets a brand colour become
   indistinguishable from the body text beside it. This is not hypothetical:
   Beaumont's stored secondary is already `#FFFFFF`, so `--mark` on the ratings
   and touchline screens is already white, and the rank figures already read as
   plain text.
3. **Widens where the colour appears** on the paper ground, keeping the
   restyle's rule that colour is stroke and text, never fill.

The product is multi-tenant. Beaumont is the first organization, not the only
one — `schools` holds organizations distinguished by a `kind` of `school` or
`club`. Nothing here may be tuned to navy and white; every rule is expressed
against the token and must hold for a club whose colours are, say, orange and
black.

**Supersedes:** `docs/superpowers/specs/2026-09-07-mobile-restyle-design.md` §2.3
on one point only. That section says the organization's colours are "used only
as stroke, never as fill." The rule stands — nothing here introduces a fill —
but §2.3's list of *where* they are used (the crest keyline, the rank colour,
the standard box border, the kicker colour) is replaced by section 4 below.

## 2. Storage

`schools.colors` stays JSONB. **No migration.**

```json
{ "primary": "rgb(33, 25, 111)", "secondary": "white" }
```

**The row holds what the admin typed**, not a normalised form, so a coach who
entered `navy` sees `navy` when they reopen the form. Normalisation happens at
paint time (section 3).

**Unknown keys are preserved.** Beaumont's row carries a third key, `"navy"`,
which nothing reads — and `SchoolProfileSection.vue:109` currently drops it on
save by writing a fresh `{ primary, secondary }` object. The form must merge
into the existing `colors` object instead. Silently discarding a column's
content on an unrelated save is a data-loss bug regardless of whether anything
reads that key today.

## 3. The colour model

### 3.1 `src/domain/colour.ts` — new

A framework-free module: no DOM, no `localStorage`, no Supabase, matching the
other 34 in `src/domain/`. This matters — resolving a colour name by handing it
to the browser and reading back the computed value is the usual trick and is not
available here, so names come from a table in the module.

```ts
export interface Rgb { r: number; g: number; b: number }

/** The colour a coach typed, as channels, or null if it is not one. */
export function parseColour(value: unknown): Rgb | null;

/** An Rgb as the #rrggbb the stylesheet is given. */
export function toHex(c: Rgb): string;

/** The colour names accepted, lowercase, mapped to channels. */
export const COLOUR_NAMES: Record<string, Rgb>;
```

`parseColour` accepts, after trimming and lowercasing:

- `#rgb` and `#rrggbb`.
- `rgb(r, g, b)` and `rgb(r g b)` — integers 0–255, any internal whitespace.
  A channel outside 0–255 makes the whole value invalid rather than clamping:
  `rgb(300, 0, 0)` is a typo, and clamping it to red hides the typo.
- A name in `COLOUR_NAMES`.

It **rejects** everything else, and rejects `rgba()` and any other form carrying
alpha specifically. A translucent colour has no fixed contrast against a ground
— it depends on what is behind it — so the guard in section 3.3 could not
measure it, and a colour that cannot be guarded cannot be accepted.

`COLOUR_NAMES` holds the sixteen basic CSS colour names — `aqua`, `black`,
`blue`, `fuchsia`, `gray`, `green`, `lime`, `maroon`, `navy`, `olive`, `purple`,
`red`, `silver`, `teal`, `white`, `yellow` — plus the names a school or club
would plausibly use for its own colours: `brown`, `chocolate`, `coral`,
`crimson`, `cyan`, `darkblue`, `darkgreen`, `darkred`, `firebrick`,
`forestgreen`, `gold`, `grey`, `indigo`, `khaki`, `lavender`, `magenta`,
`midnightblue`, `orange`, `orchid`, `pink`, `plum`, `royalblue`, `salmon`,
`sienna`, `skyblue`, `steelblue`, `tan`, `turquoise`, `violet`. Forty-five
entries, each with its CSS-defined channels.

The list is deliberately not the full 148: a curated table stays readable and
testable, and `papayawhip` is not a school colour. A name outside it is refused
with a message naming the three accepted forms, so the boundary is visible
rather than silent.

### 3.2 What the stylesheet receives

`themeVars` emits **normalised `#rrggbb` only**, never the typed string.

`theme.ts` today carries a comment worrying that a non-hex value "either breaks
every rule that reads the property or, worse, carries punctuation into the
stylesheet." Normalising at the boundary settles that permanently: whatever a
coach types, what reaches a custom property is six hex digits. Accepting more
formats therefore *reduces* the injection surface rather than widening it,
because today's hex check is the only thing standing between the row and the
document.

### 3.3 The guard, and why it needs two different measures

`guardedMark` today asks one question: does this colour clear 3:1 against the
ground it sits on? That is WCAG's floor for graphical objects and large text,
and it is the right floor for a keyline or a rank figure. Two things are wrong
with it.

**It never asks whether the mark can be told apart from the text beside it.**
White clears 17:1 against the dark ground `#0A1428` and passes easily — while
being visually identical to that ground's `--ink` of `#F8FAFC`. That is the
live bug.

**It uses one floor for two jobs.** A link is body-size text and needs 4.5:1,
not 3:1. Retargeting an accent token to a 3:1-guarded colour would give a club
with a mid-tone brand links that pass as graphics and fail as text.

So: three measures, each answering a different question.

| Constant | Measure | Question |
| --- | --- | --- |
| `MIN_MARK_CONTRAST = 3` | WCAG contrast ratio | Can this keyline or figure be seen against the ground? |
| `MIN_TEXT_CONTRAST = 4.5` | WCAG contrast ratio | Can this be read as body-size text? |
| `MIN_INK_DISTANCE = 32` | Euclidean distance in sRGB | Is this a different colour from the text beside it? |

**The third is a distance, not a ratio, and that is the point.** WCAG contrast
is luminance-only and cannot see hue. Beaumont's navy `#21196F` and the paper
ink `#201f1d` are both very dark: their contrast ratio is about **1.09**, so a
ratio-based separation test would reject the organization's own colour and fall
back to near-black. By distance they are ~82 apart — plainly a different colour,
because one is blue. Meanwhile white against the dark ground's `#F8FAFC` is ~9
apart, and is correctly rejected. A threshold of 32, against a maximum possible
distance of ~441, separates the two cases with room either side.

Euclidean sRGB distance is a crude perceptual model and is named as such in the
module. It is adequate here because the question is coarse — *is this the same
colour as the text?* — and a more faithful model (CIE ΔE) would add a colour-space
conversion for no change in outcome on any case this guards against.

```ts
export function contrastRatio(a: string, b: string): number;   // existing, now via parseColour
export function colourDistance(a: string, b: string): number;  // new

/**
 * The organization's colour, or the fallback when it cannot do the job.
 * `min` is MIN_MARK_CONTRAST for a keyline or figure, MIN_TEXT_CONTRAST for
 * body-size text.
 */
export function guardedColour(
  colour: string, ground: string, ink: string, min: number, fallback: string
): string;
```

`guardedColour` returns `colour` when it clears `min` against `ground` **and**
is at least `MIN_INK_DISTANCE` from `ink`; otherwise `fallback`. An unparseable
`colour` returns `fallback` — the store keeps rendering a row that predates this
change or was written by hand.

### 3.4 The properties painted

```ts
export function themeVars(b: Branding): Record<string, string>;
```

| Property | Source | Guarded for | Fallback |
| --- | --- | --- | --- |
| `--org-primary` | primary, normalised | — (raw, for stroke) | — |
| `--org-secondary` | secondary, normalised | — (raw, for stroke) | — |
| `--org-mark-paper` | primary | 3:1 vs `#f3f2f2`, distance vs `#201f1d` | `#201f1d` |
| `--org-mark-dark` | secondary | 3:1 vs `#0A1428`, distance vs `#F8FAFC` | `#FFD700` |
| `--org-text-paper` | primary | 4.5:1 vs `#f3f2f2`, distance vs `#201f1d` | `#201f1d` |

`--org-text-paper` is new. There is deliberately no `--org-text-dark`: section 4
retargets the accent on the paper ground only, so nothing on a dark ground reads
an organization colour as body-size text.

For Beaumont, `rgb(33, 25, 111)` clears 4.5:1 against paper at roughly 13:1, so
`--org-mark-paper` and `--org-text-paper` are both the navy; and `white` fails
the distance test against `#F8FAFC`, so `--org-mark-dark` falls back to gold and
the touchline screens get their accent back.

## 4. Where the colour appears

### 4.1 The accent tokens, on the paper ground only

`index.css`'s `[data-ground="paper"]` block changes two declarations:

```css
--rule-strong: var(--org-mark-paper);
--live: var(--org-text-paper);
```

They were both the fixed `#7d5411`, coinciding on purpose because the Classical
system has one accent (restyle spec §2.2). They still coincide in role; they now
come from the organization.

This is the whole of the widening. It reaches every screen at once with no
component edited: links, the rule under the next fixture, accent kickers, active
tab underlines, the `.btn--go` outline, notice left-edges, picked quiz options,
active roster chips, and the focus-visible ring. `--live` takes the 4.5:1 value
because links are its body-size use; `--rule-strong` takes the 3:1 value because
its uses are rules and kickers.

**The pitch and ledger grounds are unchanged.** On the touchline and ratings
screens `--live` is cyan `#00F0FF` because it means *this is live right now*
under match conditions, and `--rule-strong` is gold because it marks a standard.
Those are functional colours, not brand ones, and re-theming them would trade
legibility on a touchline for consistency in a brand guideline.

### 4.2 Three explicit uses of `--mark`

Beyond the token retarget:

- **Page titles.** The `h1` on each screen takes `var(--mark)`. This is the
  clearest signal that the site belongs to a particular organization, and it is
  still text.
- **Roster shirt numbers** in `PlayerCard.vue`, currently `--ink-muted`.
- **The record strip** on the home page.

Each is a single declaration in a scoped block.

### 4.3 What does not change

No fill anywhere. No filled button, no coloured panel background, no coloured
header band. The crest stays a keyline. The restyle's editorial paper look is
intact; it now carries the organization's accent instead of a fixed one.

## 5. The admin form

`SchoolProfileSection.vue`:

- The two colour fields accept the three formats and say so in their hint.
- **A value that `parseColour` refuses blocks the save**, with a message naming
  what was entered and the three accepted forms. The form already refuses a
  blank name, because `upsertSchool` fills a blank with Beaumont's — this is the
  same discipline applied to the same kind of silent wrong answer.
- The form merges into the existing `colors` object rather than replacing it
  (section 2).
- A swatch beside each field shows the parsed colour, so a coach sees what they
  typed resolve before saving.
- When a guard has substituted a fallback, the form says which colour was
  substituted and why — "white cannot be told apart from the text on the match
  screens, so those use gold." An organization is entitled to know the interface
  overrode its brand, even though the spec's position (restyle §2.3) is that the
  interface adapts rather than the admin.

## 6. Beaumont's data

`seed_data.sql:10` currently reads:

```sql
'{"primary": "#0047AB", "secondary": "#FFFFFF", "navy": "#0A1428"}'::jsonb
```

The primary is wrong — cobalt, not the school's colour. It becomes:

```sql
'{"primary": "rgb(33, 25, 111)", "secondary": "white", "navy": "#0A1428"}'::jsonb
```

The `navy` key is retained: nothing reads it, but section 2 stops the form
dropping unknown keys, and deleting one here while teaching the code to preserve
them would be inconsistent.

`seed_data.sql` is a provisioning script and does not touch a running database,
so the live row needs its own statement, applied by hand in the Supabase SQL
editor:

```sql
update public.schools
   set colors = colors || '{"primary": "rgb(33, 25, 111)", "secondary": "white"}'::jsonb
 where code = 'bhs';
```

`||` merges, so any other key in the column survives.

## 7. Testing

Framework-free unless stated.

**`src/domain/colour.test.ts`** — new.
- `parseColour` on `#21196F`, `#abc`, `rgb(33, 25, 111)`, `rgb(33 25 111)`,
  `  NAVY  `, and each of the three with odd whitespace and casing.
- `parseColour` returns null for `rgba(0,0,0,0.5)`, `hsl(200 50% 50%)`,
  `rgb(300, 0, 0)`, `#12345`, `papayawhip`, `''`, `null`, and a value containing
  a semicolon or brace — the injection case.
- `toHex` round-trips every entry in `COLOUR_NAMES`.
- Every `COLOUR_NAMES` value has channels in 0–255.

**`src/domain/theme.test.ts`** — extended.
- `contrastRatio` gives the same answers for `#21196F`, `rgb(33, 25, 111)` and
  the equivalent name — one colour, three spellings, one ratio.
- `colourDistance` on the two cases the threshold exists to separate:
  white against `#F8FAFC` is under 32, `#21196F` against `#201f1d` is over it.
- `guardedColour` returns the colour above both floors and the fallback below
  either, tested independently: a colour that passes contrast but fails distance
  falls back, and vice versa.
- **The regression case, named:** `themeVars` with Beaumont's stored branding
  (`rgb(33, 25, 111)` / `white`) emits gold for `--org-mark-dark` and the navy
  for `--org-mark-paper` and `--org-text-paper`.
- `themeVars` emits five properties, every value matching `/^#[0-9a-f]{6}$/i`.
- An unparseable stored colour yields the fallbacks rather than throwing.

**`src/design-tokens.test.ts`** — extended.
- The paper ground's `--rule-strong` and `--live` read the organization
  properties; the pitch and ledger grounds' do not.

**`SchoolProfileSection.test.ts`** — extended.
- An unparseable colour blocks the save and names the accepted forms.
- Saving preserves an unrelated key already in `colors`.

**Verification**, by exit code: `npm test`, `npm run typecheck`, `npm run build`.
Then the paper screens opened at 412px and 1280px and compared against a club
row with a deliberately awkward colour — a mid-tone orange, which should keep
its rules and lose its links to the fallback.

## 8. Out of scope

- Any fill: coloured header bands, filled buttons, tinted panels.
- Re-theming the pitch and ledger grounds.
- A third stored colour, or a per-team colour distinct from the organization's.
- Contrast-checking the fixed status colours (`--color-danger` and its
  siblings), which are not organization colours.
- The full 148-name CSS colour list.
- Making the guard's substitution configurable per organization.
