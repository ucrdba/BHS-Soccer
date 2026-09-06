/**
 * What the deployment has to provide that the dev server provides for free.
 *
 * Two things, both invisible until the site is deployed:
 *
 * **`createWebHistory` needs unknown paths served the app's HTML.** Vite's dev
 * server does this; Vercel does not. Without a rewrite, `/roster` typed into
 * the address bar or reloaded is a 404 — every route works in development and
 * only the entry path works in production, which is the worst way to find out.
 *
 * **`XLSX` and `JSZip` are CDN globals.** `ImportExportModal.vue` reads both
 * off `window` and reports their absence rather than throwing, so a missing
 * script tag does not crash anything — it just means export quietly refuses,
 * with a message about the library not having loaded that would send someone
 * looking in entirely the wrong place.
 *
 * The rewrite's destination is checked by reading the file it names, so this
 * holds whether the Vue app is served from `app.html` or, after the cutover,
 * from `index.html`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (f: string) => readFileSync(join(root, f), 'utf8');

const vercel = JSON.parse(read('vercel.json'));

/** The rewrite that catches client-side routes. */
const catchAll = () => (vercel.rewrites || [])[0];

/**
 * Vercel matches `source` with path-to-regexp, which passes a parenthesised
 * group through as a regular expression. Approximating it with `RegExp` is
 * close enough to prove the lookahead lets the right paths through.
 */
const matches = (path: string) => {
  const src: string = catchAll().source;
  return new RegExp(`^${src}$`).test(path);
};

describe('THE REWRITE createWebHistory NEEDS', () => {
  it('exists at all', () => {
    // Without it every route but the entry path 404s on the deployed site.
    expect(vercel.rewrites).toBeDefined();
    expect(catchAll()).toBeDefined();
  });

  it('sends a client-side route to the document that mounts the app', () => {
    const dest = catchAll().destination.replace(/^\//, '');
    expect(existsSync(join(root, dest))).toBe(true);
    expect(read(dest)).toContain('vue-main.ts');
  });

  it('catches the nav routes', () => {
    ['/roster', '/schedule', '/matrix', '/planner', '/coaches', '/help', '/admin', '/quiz']
      .forEach(p => expect(matches(p), p).toBe(true));
  });

  it('catches a nested path', () => {
    expect(matches('/roster/anything')).toBe(true);
  });

  it('DOES NOT SWALLOW version.json', () => {
    // It is emitted so the deployed commit can be read with one request. Sent
    // to the app's HTML instead, it answers with a page and the check reads a
    // successful response that is not the file.
    expect(matches('/version.json')).toBe(false);
  });

  it('does not swallow the built assets', () => {
    ['/assets/index-abc123.js', '/assets/index-abc123.css', '/index.css', '/favicon.ico']
      .forEach(p => expect(matches(p), p).toBe(false));
  });

  it('does not swallow anything else that looks like a file', () => {
    expect(matches('/robots.txt')).toBe(false);
    expect(matches('/img/crest.png')).toBe(false);
  });
});

describe('THE CDN LIBRARIES THE IMPORT AND EXPORT NEED', () => {
  const entry = read(catchAll().destination.replace(/^\//, ''));

  it('loads SheetJS, or the workbook export refuses', () => {
    expect(entry).toMatch(/xlsx[.\w-]*\.min\.js/i);
  });

  it('loads JSZip, or the per-table zip refuses', () => {
    expect(entry).toMatch(/jszip[.\w-]*\.min\.js/i);
  });

  it('pins a version rather than tracking latest', () => {
    // An unpinned CDN URL changes the library under a deployment that was
    // never rebuilt.
    expect(entry).toMatch(/xlsx-\d+\.\d+\.\d+/);
    expect(entry).toMatch(/jszip\/\d+\.\d+\.\d+/);
  });
});
