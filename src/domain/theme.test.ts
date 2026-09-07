/**
 * Branding comes from the organization, never from a constant.
 *
 * Beaumont is the first organization, not the only one: club coaches use this
 * application, and a club has its own name, mascot and colours. Anything that
 * renders a team name or paints a colour reads it from the schools row.
 */
import { describe, it, expect } from 'vitest';
import {
  brandingFor, themeVars, contrastRatio, guardedMark,
  DEFAULT_PRIMARY, DEFAULT_SECONDARY,
  PAPER_GROUND, DARK_GROUND, PAPER_MARK_FALLBACK, DARK_MARK_FALLBACK, MIN_MARK_CONTRAST
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
      secondary: '#abcdef'
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
