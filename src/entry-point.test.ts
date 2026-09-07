/**
 * What `index.html` is, after the cutover.
 *
 * It is the document Vercel serves at the root, so this is the file that
 * decides which application exists. Until Phase 7 it loaded the legacy app —
 * `src/main.ts` plus twenty-two classic scripts from `./js/*` — and the Vue
 * rebuild lived at `app.html`. Now there is one document and one app.
 *
 * **The title names no single organization.** It read "Beaumont High School
 * Cougars | Boys Varsity Soccer", and Beaumont is the first organization
 * rather than the only one — a club coach's browser tab said somebody else's
 * name. The static title is neutral and the running app replaces it with
 * whatever the active organization is called, which is where every other
 * piece of branding already comes from.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const index = readFileSync(join(root, 'index.html'), 'utf8');

describe('the one entry point', () => {
  it('mounts the Vue app', () => {
    expect(index).toContain('id="vue-app"');
    expect(index).toContain('src/vue-main.ts');
  });

  it('LOADS NO CLASSIC SCRIPT', () => {
    // Each of these was a prototype extension bolted onto BHSSoccerApp at
    // load time, in an order index.html had to get right.
    expect(index).not.toMatch(/src=["']\.\/js\//);
    expect(index).not.toContain('app.core.js');
  });

  it('does not load the legacy entry module', () => {
    expect(index).not.toMatch(/src=["']\.?\/?src\/main\.ts/);
  });

  it('loads the workbook libraries, which the import and export read off window', () => {
    expect(index).toMatch(/xlsx-\d+\.\d+\.\d+/);
    expect(index).toMatch(/jszip\/\d+\.\d+\.\d+/);
  });

  it('IS THE ONLY ENTRY DOCUMENT', () => {
    // app.html existed so the two apps never shared a document. With one app
    // it would be a second URL serving the same thing.
    expect(existsSync(join(root, 'app.html'))).toBe(false);
  });

  it('ships the paper ground on the document so the first paint has tokens', () => {
    expect(index).toMatch(/<html[^>]*data-ground="paper"/);
  });

  it('loads the three faces from Google Fonts', () => {
    expect(index).toMatch(/fonts\.googleapis\.com\/css2\?[^"]*Cormorant\+Garamond/);
    expect(index).toMatch(/Lora/);
    expect(index).toMatch(/Oswald/);
  });

  it('loads one stylesheet, the token sheet', () => {
    // styles.css was the legacy app's 2,205-line sheet. Its surviving rules
    // moved into the components that use them.
    expect(index).toContain('./index.css');
    expect(index).not.toContain('styles.css');
  });
});

describe('THE TITLE NAMES NO SINGLE ORGANIZATION', () => {
  const title = (index.match(/<title>([^<]*)<\/title>/) || [])[1] || '';

  it('has one', () => {
    expect(title.trim().length).toBeGreaterThan(0);
  });

  it('is not one organization, its mascot, or its squad', () => {
    // A club coach's browser tab said "Beaumont High School Cougars".
    expect(title).not.toMatch(/beaumont|cougars|varsity/i);
  });

  it('says nothing about a single organization anywhere in the document', () => {
    const body = index.replace(/<!--[\s\S]*?-->/g, '');
    expect(body).not.toMatch(/beaumont|cougars/i);
  });
});

describe('the build', () => {
  const vite = readFileSync(join(root, 'vite.config.ts'), 'utf8');

  it('has one input, not two', () => {
    // Comments stripped: the history of the two entry points is worth keeping
    // in the file, and it is the configuration that must be down to one.
    const code = vite.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toContain('app.html');
    expect(code).not.toContain('rollupOptions');
  });

  it('still emits the build stamp, so a deployment can say what it is', () => {
    expect(vite).toContain('version.json');
  });
});
