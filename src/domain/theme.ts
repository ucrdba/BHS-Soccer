/**
 * An organization's branding, and how it reaches the stylesheets.
 *
 * Beaumont is the first organization, not the only one. `schools` holds
 * organizations distinguished by a `kind` of `school` or `club`, and a club
 * has its own name, mascot and colours — so nothing here may fall back to a
 * team name, and every colour is read from the row rather than assumed.
 *
 * The defaults are the app's historical colours, so an organization that has
 * never set them looks as it did before.
 */

import { parseColour, toHex } from './colour';

export const DEFAULT_PRIMARY = '#0047AB';
export const DEFAULT_SECONDARY = '#FFD700';

export interface Branding {
  name: string;
  mascot: string;
  primary: string;
  secondary: string;
}

/**
 * Any colour `parseColour` accepts is kept.
 *
 * These values are written straight into CSS custom properties, so anything
 * unparseable either breaks every rule that reads the property or, worse,
 * carries punctuation into the stylesheet. The trimmed string the coach typed
 * is stored, not a normalised form -- a value of `navy` round-trips to the
 * admin form as `navy`. Normalisation happens only in `themeVars`.
 */
function colour(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return parseColour(trimmed) ? trimmed : fallback;
}

export function brandingFor(school: any): Branding {
  const colors = school && typeof school.colors === 'object' && school.colors !== null
    ? school.colors
    : {};

  return {
    // No fallback name: a signed-out visitor mid-load must not be told they
    // are looking at some other organization's team.
    name: (school && school.name) || '',
    mascot: (school && school.mascot) || '',
    primary: colour(colors.primary, DEFAULT_PRIMARY),
    secondary: colour(colors.secondary, DEFAULT_SECONDARY)
  };
}

/** The two grounds a mark is guarded against. Spec §2.2. */
export const PAPER_GROUND = '#f3f2f2';
export const DARK_GROUND = '#0A1428';

/** What the mark becomes when the organization's colour cannot be seen. */
export const PAPER_MARK_FALLBACK = '#201f1d';
export const DARK_MARK_FALLBACK = '#FFD700';

/**
 * The fallback for the paper ground's two guarded accent properties
 * (`--org-mark-paper`, `--org-text-paper`).
 *
 * It is deliberately not PAPER_MARK_FALLBACK, even though that constant's
 * name suggests it belongs here. PAPER_MARK_FALLBACK is the same value as
 * PAPER_INK -- both are the paper ground's body-text colour -- so using it as
 * an accent fallback would hand a rejected colour's callers the ink itself,
 * which is precisely the distance `guardedColour` exists to enforce. #7d5411
 * is the accent the paper ground used before organization colours existed,
 * and it clears both floors against the paper ground and its ink (see
 * theme.test.ts's invariant test below).
 */
export const PAPER_ACCENT_FALLBACK = '#7d5411';

/**
 * 3:1 is WCAG's floor for graphical objects and large text. The mark is a
 * keyline, a rank figure or a kicker — never body copy — so that is the right
 * floor for it.
 */
export const MIN_MARK_CONTRAST = 3;

/** The ink each ground sets, which a mark must not be mistaken for. */
export const PAPER_INK = '#201f1d';
export const DARK_INK = '#F8FAFC';

/**
 * 4.5:1 is WCAG's floor for body-size text. A link is body-size text; a
 * keyline or a rank figure is not, which is why MIN_MARK_CONTRAST is 3.
 *
 * TODO: there is no equivalent text floor on the dark ground. MatrixBoard.vue's
 * `.rank` is 15px text on the ledger ground, guarded only at MIN_MARK_CONTRAST
 * (3:1), so a club with a green or royal-blue secondary gets rank figures at
 * roughly 3.6:1 -- readable, but below the 4.5:1 a body-size figure would get
 * on paper. Not fixed here: the asymmetry predates this change, and closing
 * it (a dark-ground text floor, and deciding which surfaces are text-weight)
 * is a design decision, not a bug this pass owns.
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
 * Euclidean sRGB distance is a crude perceptual model, and a deliberate
 * simplification rather than an oversight: the question here is coarse -- is
 * this the same colour as the text? -- and colour-space conversion is not
 * free. But it is known to over-accept light achromatic colours near the dark
 * ground's ink, because un-gamma-corrected sRGB distance is dominated by the
 * achromatic axis and over-weights the light end -- exactly where the dark
 * ink #F8FAFC sits, which is the only place this distance test does any work.
 * Silver is the named case it gets wrong: against #F8FAFC, #c0c0c0 scores 100
 * by this measure -- a confident accept at three times the threshold -- but
 * only ~20.5 by CIE ΔE76, closer to the ink than cream (23.8) and barely
 * further than ivory (8.8), which this guard rejects. "Navy and silver" and
 * "black and silver" are common school colour pairs, so this is not a
 * hypothetical. If it proves necessary, the upgrade is ΔE76 over CIE Lab at a
 * threshold near 25, not a different sRGB threshold.
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
 *
 * The fallback is normalised the same way a success is -- a caller passing
 * `#FFD700` and one passing `gold` must not get a different-cased answer
 * depending on whether the organization's own colour happened to pass.
 */
export function guardedColour(
  colour: string, ground: string, ink: string, min: number, fallback: string
): string {
  const fc = parseColour(fallback);
  const normalisedFallback = fc ? toHex(fc) : fallback;
  const c = parseColour(colour);
  if (!c) return normalisedFallback;
  if (contrastRatio(colour, ground) < min) return normalisedFallback;
  if (colourDistance(colour, ink) < MIN_INK_DISTANCE) return normalisedFallback;
  return toHex(c);
}

/**
 * The custom properties to paint onto the document.
 *
 * Always normalised hex, whatever the row holds: six hex digits are the only
 * thing that reaches a stylesheet, which is what makes accepting rgb() and
 * names safe. `guardedColour` normalises both of its own outcomes, so nothing
 * here needs a further `.toLowerCase()`.
 *
 * `--org-primary` and `--org-secondary` are raw and unguarded -- the
 * organization's colour exactly as entered, before either floor is applied.
 * Nothing in the app reads them today, and nothing should start: a component
 * that reaches for `--org-primary` instead of `--mark` / `--live` /
 * `--rule-strong` reintroduces the bug this guard exists to prevent. They are
 * kept anyway, rather than removed, because deleting two established custom
 * properties would only churn index.css and this file's tests for no gain.
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
      b.primary, PAPER_GROUND, PAPER_INK, MIN_MARK_CONTRAST, PAPER_ACCENT_FALLBACK
    ),
    '--org-mark-dark': guardedColour(
      b.secondary, DARK_GROUND, DARK_INK, MIN_MARK_CONTRAST, DARK_MARK_FALLBACK
    ),
    '--org-text-paper': guardedColour(
      b.primary, PAPER_GROUND, PAPER_INK, MIN_TEXT_CONTRAST, PAPER_ACCENT_FALLBACK
    )
  };
}
