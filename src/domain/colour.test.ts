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
