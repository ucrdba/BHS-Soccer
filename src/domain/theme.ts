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

export const DEFAULT_PRIMARY = '#0047AB';
export const DEFAULT_SECONDARY = '#FFD700';

export interface Branding {
  name: string;
  mascot: string;
  primary: string;
  secondary: string;
}

/**
 * Only a hex colour is accepted.
 *
 * These values are written straight into CSS custom properties, so anything
 * else either breaks every rule that reads the property or, worse, carries
 * punctuation into the stylesheet. A row can hold whatever a coach typed.
 */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function colour(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX.test(value.trim()) ? value.trim() : fallback;
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
