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
