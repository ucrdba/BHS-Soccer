/**
 * An organization's branding, and how it reaches the stylesheets.
 *
 * Beaumont is the first organization, not the only one. `schools` holds
 * organizations distinguished by a `kind` of `school` or `club`, and a club
 * has its own name, mascot and colours — so nothing here may fall back to a
 * team name, and every colour is read from the row rather than assumed.
 *
 * The defaults match what app.core.js already used when a school record
 * carried no colours, so an organization that has never set them looks the
 * same as it did before.
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

/**
 * The custom properties to paint onto the document.
 *
 * Deliberately the properties `index.css` already defines, so existing rules
 * pick the organization's colours up without being rewritten.
 */
export function themeVars(b: Branding): Record<string, string> {
  return {
    '--bhs-blue-primary': b.primary,
    '--bhs-gold-accent': b.secondary
  };
}
