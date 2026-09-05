/**
 * Branding comes from the organization, never from a constant.
 *
 * Beaumont is the first organization, not the only one: club coaches use this
 * application, and a club has its own name, mascot and colours. Anything that
 * renders a team name or paints a colour reads it from the schools row.
 */
import { describe, it, expect } from 'vitest';
import { brandingFor, themeVars, DEFAULT_PRIMARY, DEFAULT_SECONDARY } from './theme';

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

describe('themeVars', () => {
  const branding = { name: 'X', mascot: 'Y', primary: '#111111', secondary: '#222222' };

  it('maps branding onto the custom properties the stylesheets already use', () => {
    const vars = themeVars(branding);
    expect(vars['--bhs-blue-primary']).toBe('#111111');
    expect(vars['--bhs-gold-accent']).toBe('#222222');
  });

  it('returns only custom properties, so nothing else can be injected', () => {
    for (const key of Object.keys(themeVars(branding))) {
      expect(key).toMatch(/^--/);
    }
  });
});
