/**
 * The shape of the design system.
 *
 * One stylesheet defines the same token names three times, once per ground,
 * so a component styled against `--ink` or `--rule` is correct on every
 * ground without knowing which one it is on. These tests read the file
 * rather than a rendered page because the failure they guard against is a
 * token defined on two grounds and forgotten on the third — which renders as
 * "inherit" and looks like a bug in whichever component hits it first.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'index.css'), 'utf8');

/** Every token a ground must define. Spec §2.2. */
const GROUND_TOKENS = [
  '--ground', '--surface', '--surface-deep', '--ink', '--ink-muted', '--ink-soft',
  '--rule', '--rule-strong', '--live', '--mark', '--heading-face', '--shadow-md'
];

/** The body of the rule block whose selector list contains `selector`. */
function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`[^{}]*${escaped}[^{}]*\\{([^}]*)\\}`));
  if (!m) throw new Error(`no rule block for ${selector}`);
  return m[1];
}

describe('the ground blocks', () => {
  for (const ground of ['paper', 'pitch', 'ledger']) {
    it(`${ground} defines every ground token`, () => {
      const body = block(`[data-ground="${ground}"]`);
      for (const token of GROUND_TOKENS) {
        expect(body, `${ground} is missing ${token}`).toMatch(new RegExp(`${token}\\s*:`));
      }
    });
  }

  it('gives the pitch ground the display face for headings', () => {
    expect(block('[data-ground="pitch"]')).toMatch(/--heading-face:\s*var\(--font-display\)/);
  });

  it('gives paper and ledger the heading face', () => {
    expect(block('[data-ground="paper"]')).toMatch(/--heading-face:\s*var\(--font-heading\)/);
    expect(block('[data-ground="ledger"]')).toMatch(/--heading-face:\s*var\(--font-heading\)/);
  });

  it('reads the mark from the guarded organization colour, per ground', () => {
    expect(block('[data-ground="paper"]')).toMatch(/--mark:\s*var\(--org-mark-paper\)/);
    expect(block('[data-ground="pitch"]')).toMatch(/--mark:\s*var\(--org-mark-dark\)/);
    expect(block('[data-ground="ledger"]')).toMatch(/--mark:\s*var\(--org-mark-dark\)/);
  });
});

describe('the fixed tokens', () => {
  it('names the three faces and no longer loads Inter', () => {
    expect(css).toMatch(/--font-heading:\s*"Cormorant Garamond"/);
    expect(css).toMatch(/--font-body:\s*"Lora"/);
    expect(css).toMatch(/--font-display:\s*"Oswald"/);
    expect(css).not.toMatch(/Inter/);
  });

  it('carries the four organization properties with cold-load fallbacks', () => {
    for (const p of ['--org-primary', '--org-secondary', '--org-mark-paper', '--org-mark-dark']) {
      expect(css, p).toMatch(new RegExp(`${p}\\s*:\\s*#[0-9a-fA-F]{6}`));
    }
  });
});

describe('the temporary aliases', () => {
  // Phase 5 deletes this block; until then every legacy name must resolve.
  const ALIASES: Record<string, string> = {
    '--bhs-navy-bg': '--ground',
    '--bhs-navy-card': '--surface',
    '--bhs-navy-border': '--rule',
    '--bhs-blue-primary': '--org-primary',
    '--bhs-blue-dark': '--surface-deep',
    '--bhs-blue-electric': '--live',
    '--bhs-cyan-accent': '--live',
    '--bhs-gold-accent': '--rule-strong',
    '--bhs-silver': '--ink',
    '--text-main': '--ink',
    '--text-muted': '--ink-muted'
  };

  for (const [legacy, token] of Object.entries(ALIASES)) {
    it(`${legacy} resolves to ${token}`, () => {
      expect(css).toMatch(new RegExp(`${legacy}\\s*:\\s*var\\(${token}\\)`));
    });
  }
});

describe('the legacy stylesheet', () => {
  it('is gone', () => {
    expect(existsSync(join(process.cwd(), 'styles.css'))).toBe(false);
  });
});

/** Every .vue file under src/. */
function vueFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) vueFiles(p, out);
    else if (p.endsWith('.vue')) out.push(p);
  }
  return out;
}

/** The style blocks of a single-file component, joined. */
function styleOf(path: string): string {
  const src = readFileSync(path, 'utf8');
  return Array.from(src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)).map(m => m[1]).join('\n');
}

describe('component styles', () => {
  const files = vueFiles(join(process.cwd(), 'src'));

  it('set no hardcoded white — the ground is not always dark any more', () => {
    const offenders = files.filter(f => /#fff\b|#ffffff\b|:\s*white\b|rgba?\(\s*255\s*,?\s*255\s*,?\s*255/i.test(styleOf(f)));
    expect(offenders.map(f => f.replace(process.cwd(), '')), 'use var(--ink) or a color-mix of it').toEqual([]);
  });
});
