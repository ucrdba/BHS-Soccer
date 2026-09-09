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

/**
 * The primitives every screen shares. Seventeen components restated an
 * outlined button, a labelled input, a small tag and a hairline row in their
 * own scoped blocks, against the temporary aliases. They are defined once
 * here so a screen task is a deletion; a missing one sends the next task back
 * to writing its own copy, which is how the drift started.
 */
describe('the paper primitives', () => {
  const PRIMITIVES = [
    '.btn--small', '.btn--plain', '.btn--danger',
    '.field', '.field--wide', '.input', '.input--wide',
    '.tag', '.tag--live', '.tag--warn',
    '.note', '.note--good', '.note--bad',
    '.hrow', '.plate', '.plate__img', '.plate__label',
    '.kicker--accent'
  ];

  for (const cls of PRIMITIVES) {
    it(`defines ${cls}`, () => {
      expect(css, `${cls} is not in index.css`).toMatch(
        new RegExp(`\\${cls}[\\s,{:]`)
      );
    });
  }

  it('keeps the button variants stroke rather than fill', () => {
    expect(block('.btn--plain')).not.toMatch(/background:/);
    expect(block('.btn--danger')).not.toMatch(/background:/);
  });

  it('gives the input well the deep surface, not the page', () => {
    expect(block('.input')).toMatch(/background:\s*var\(--surface-deep\)/);
  });
});

/**
 * Files proved free of the legacy names. Phase 5 restyles the remaining
 * screens one at a time and each task appends its files here, so the guard
 * grows with the work and cannot silently skip a screen. Task 9 replaces this
 * list with every .vue file under src/ and deletes the alias block.
 */
const RESTYLED = [
  'src/components/roster/PlayerCard.vue',
  'src/components/roster/PlayerDetailModal.vue',
  'src/components/ui/BaseModal.vue',
  'src/views/CoachesView.vue',
  'src/components/coaches/CoachFormModal.vue',
];

const LEGACY_NAME = /--bhs-[a-z-]+|--text-muted|--text-main/;

describe('the restyled files', () => {
  for (const rel of RESTYLED) {
    it(`${rel} names no legacy token`, () => {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(LEGACY_NAME.test(src), `${rel} still reads a --bhs-* alias`).toBe(false);
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

/**
 * A white literal in a style block, in any of the shapes CSS allows.
 *
 * `\b` is not enough on its own: it cannot fall between two hex digits, so
 * `#ffffffaa` slips past `#ffffff\b`, and `white` in a shorthand such as
 * `1px dashed white` has no colon before it. The lookarounds keep
 * `white-space` and custom-property names out.
 */
const WHITE_LITERAL =
  /#fff(?:fff)?(?:[0-9a-f]{2})?\b|(?<![\w-])white\b(?!-)|rgba?\(\s*255\s*,?\s*255\s*,?\s*255/i;

describe('the white guard pattern', () => {
  const caught = [
    'color: #fff;', 'color: #FFF;', 'color:#ffffff;', 'border-color: #ffffffaa;',
    'color: white;', 'border: 1px dashed white;', 'background: rgb(255 255 255 / 0.1);',
    'background: rgba(255,255,255,.5);'
  ];
  const allowed = [
    'white-space: nowrap;', 'color: var(--white-ish);', 'color: #fffbe6;',
    'background: #ffd700;', 'content: "whiteboard";', 'color: var(--ink);'
  ];

  for (const s of caught) {
    it(`catches ${s}`, () => { expect(WHITE_LITERAL.test(s)).toBe(true); });
  }
  for (const s of allowed) {
    it(`allows ${s}`, () => { expect(WHITE_LITERAL.test(s)).toBe(false); });
  }
});

describe('component styles', () => {
  const files = vueFiles(join(process.cwd(), 'src'));

  it('set no hardcoded white — the ground is not always dark any more', () => {
    const offenders = files.filter(f => WHITE_LITERAL.test(styleOf(f)));
    expect(offenders.map(f => f.replace(process.cwd(), '')), 'use var(--ink) or a color-mix of it').toEqual([]);
  });
});
