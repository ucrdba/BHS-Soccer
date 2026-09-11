/**
 * Branding comes from the organization, never from a constant.
 *
 * Beaumont is the first organization, not the only one: club coaches use this
 * application, and a club has its own name, mascot and colours. Anything that
 * renders a team name or paints a colour reads it from the schools row.
 */
import { describe, it, expect } from 'vitest';
import {
  safeLogoUrl,
  brandingFor, themeVars, contrastRatio, colourDistance, guardedColour,
  DEFAULT_PRIMARY, DEFAULT_SECONDARY,
  PAPER_GROUND, DARK_GROUND, PAPER_MARK_FALLBACK, PAPER_ACCENT_FALLBACK, DARK_MARK_FALLBACK,
  MIN_MARK_CONTRAST, MIN_TEXT_CONTRAST, MIN_INK_DISTANCE, PAPER_INK, DARK_INK
} from './theme';

describe('brandingFor', () => {
  it('reads the name, mascot and colours from the school record', () => {
    expect(brandingFor({
      name: 'Legends FC',
      mascot: 'Lions',
      colors: { primary: '#123456', secondary: '#abcdef' }
    })).toEqual({
      name: 'Legends FC',
      mascot: 'Lions',
      primary: '#123456',
      secondary: '#abcdef',
      logoUrl: ''
    });
  });

  it('falls back to the app defaults when colours are missing', () => {
    const b = brandingFor({ name: 'Some School', mascot: 'Hawks' });
    expect(b.primary).toBe(DEFAULT_PRIMARY);
    expect(b.secondary).toBe(DEFAULT_SECONDARY);
  });

  it('fills in only the colour that is missing', () => {
    const b = brandingFor({ name: 'A', mascot: 'B', colors: { primary: '#111111' } });
    expect(b.primary).toBe('#111111');
    expect(b.secondary).toBe(DEFAULT_SECONDARY);
  });

  it('does not invent a school name when there is no record', () => {
    // A signed-out visitor mid-load must not be told they are at Beaumont.
    const b = brandingFor(null);
    expect(b.name).toBe('');
    expect(b.mascot).toBe('');
    expect(b.primary).toBe(DEFAULT_PRIMARY);
  });

  it('ignores a colours blob that is not an object', () => {
    const b = brandingFor({ name: 'A', mascot: 'B', colors: 'blue' as any });
    expect(b.primary).toBe(DEFAULT_PRIMARY);
  });

  it('ignores a colour that is not a hex string', () => {
    // A bad value would be written straight into a CSS custom property and
    // silently break every rule that reads it.
    const b = brandingFor({ name: 'A', mascot: 'B', colors: { primary: 'red; }', secondary: 42 } as any });
    expect(b.primary).toBe(DEFAULT_PRIMARY);
    expect(b.secondary).toBe(DEFAULT_SECONDARY);
  });

  it('accepts three-digit hex', () => {
    expect(brandingFor({ name: 'A', mascot: 'B', colors: { primary: '#abc' } }).primary)
      .toBe('#abc');
  });
});

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
    // Fix 4: guardedColour normalises the fallback the same way it normalises
    // a success, so an upper-case fallback constant comes back lower-case.
    expect(guardedColour('#ffffff', DARK_GROUND, DARK_INK, MIN_MARK_CONTRAST, '#FFD700'))
      .toBe('#ffd700');
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

  /*
   * The regression Fix 1 exists for. PAPER_MARK_FALLBACK is the same value as
   * PAPER_INK, so themeVars using it as the fallback for --org-mark-paper and
   * --org-text-paper handed a rejected colour's callers a result at zero
   * distance from the ink -- the exact thing guardedColour's contract forbids.
   * PAPER_ACCENT_FALLBACK is the real fallback for those two properties now,
   * and every fallback constant this module hands to guardedColour must clear
   * the same floors a real colour would have to.
   */
  it('never falls back to a colour the guard would itself reject', () => {
    expect(colourDistance(PAPER_ACCENT_FALLBACK, PAPER_INK)).toBeGreaterThanOrEqual(MIN_INK_DISTANCE);
    expect(contrastRatio(PAPER_ACCENT_FALLBACK, PAPER_GROUND)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    expect(colourDistance(DARK_MARK_FALLBACK, DARK_INK)).toBeGreaterThanOrEqual(MIN_INK_DISTANCE);
    expect(contrastRatio(DARK_MARK_FALLBACK, DARK_GROUND)).toBeGreaterThanOrEqual(MIN_MARK_CONTRAST);
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
    // This case is only correct because DEFAULT_PRIMARY and DEFAULT_SECONDARY
    // clear both floors on their own grounds -- pinned directly below, so a
    // default that stops clearing a floor fails here rather than surfacing
    // only as an unrelated-looking mismatch in this "nonsense" case.
    expect(guardedColour(DEFAULT_PRIMARY, PAPER_GROUND, PAPER_INK, MIN_TEXT_CONTRAST, PAPER_ACCENT_FALLBACK))
      .toBe(DEFAULT_PRIMARY.toLowerCase());
    expect(guardedColour(DEFAULT_SECONDARY, DARK_GROUND, DARK_INK, MIN_MARK_CONTRAST, DARK_MARK_FALLBACK))
      .toBe(DEFAULT_SECONDARY.toLowerCase());

    const vars = themeVars(brandingFor({ colors: { primary: '???', secondary: '???' } }));
    expect(vars['--org-mark-paper']).toBe('#0047ab');
    expect(vars['--org-text-paper']).toBe('#0047ab');
    expect(vars['--org-mark-dark']).toBe('#ffd700');
  });
});

describe('safeLogoUrl', () => {
  /*
   * An admin types this and it is rendered into an <img> on the PUBLIC home
   * page, so it is held to two shapes: http(s), or a path to a file shipped
   * with the app.
   */
  it('keeps a web address', () => {
    expect(safeLogoUrl('https://cdn.example.org/crest.png')).toBe('https://cdn.example.org/crest.png');
    expect(safeLogoUrl('http://example.org/crest.png')).toBe('http://example.org/crest.png');
  });

  it('keeps a path to a file shipped with the app', () => {
    expect(safeLogoUrl('/img/crest.jpg')).toBe('/img/crest.jpg');
    expect(safeLogoUrl('  /img/crest.jpg  ')).toBe('/img/crest.jpg');
  });

  it('refuses a protocol-relative address, which looks like a path and is another host', () => {
    expect(safeLogoUrl('//evil.example/crest.png')).toBe('');
  });

  it('refuses every other scheme', () => {
    expect(safeLogoUrl('javascript:alert(1)')).toBe('');
    expect(safeLogoUrl('data:image/png;base64,AAAA')).toBe('');
    expect(safeLogoUrl('img/crest.jpg')).toBe('');
  });

  it('is empty for nothing at all', () => {
    expect(safeLogoUrl('')).toBe('');
    expect(safeLogoUrl(null)).toBe('');
    expect(safeLogoUrl(42)).toBe('');
  });
});

describe('brandingFor, the logo', () => {
  it("reads the organization's own logo off its row", () => {
    expect(brandingFor({ name: 'A', mascot: 'B', logo_url: '/img/a.png' }).logoUrl).toBe('/img/a.png');
  });

  it("has none when the organization has none, rather than somebody else's", () => {
    expect(brandingFor({ name: 'A', mascot: 'B' }).logoUrl).toBe('');
    expect(brandingFor(null).logoUrl).toBe('');
  });

  it('drops an address the page would refuse', () => {
    expect(brandingFor({ name: 'A', mascot: 'B', logo_url: 'javascript:alert(1)' }).logoUrl).toBe('');
  });
});
