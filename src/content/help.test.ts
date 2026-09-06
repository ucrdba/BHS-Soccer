/**
 * That the handbook survived being moved.
 *
 * The content was lifted verbatim out of public/js/views/help.view.js, and the
 * risk of moving 700 lines of authored prose is losing some of it silently.
 * This compares the module against the legacy view section by section, so any
 * divergence is a failure rather than a discovery months later.
 *
 * It can be deleted once help.view.js is, in Phase 7.
 */
/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, vi } from 'vitest';
import helpSrc from '../../public/js/views/help.view.js?raw';
import appCoreSrc from '../../public/js/app.core.js?raw';
import { helpSections, helpPath, helpNote, helpWarn, helpTable } from './help';

let legacy: any[];

beforeAll(() => {
  const strip = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  const ctor = new Function(
    [appCoreSrc, helpSrc].map(strip).join('\n;\n') + '\nreturn BHSSoccerApp;'
  )();
  (globalThis as any).window = globalThis;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const app = Object.create(ctor.prototype);
  app.data = {};
  legacy = app.helpSections();
});

describe('the moved handbook', () => {
  it('has the same number of sections', () => {
    expect(helpSections()).toHaveLength(legacy.length);
  });

  it('has the same sections, in the same order, under the same parts', () => {
    const shape = (s: any) => `${s.part}/${s.id}/${s.title}`;
    expect(helpSections().map(shape)).toEqual(legacy.map(shape));
  });

  it('carries identical body text for every section', () => {
    const moved = helpSections();
    legacy.forEach((was, i) => {
      // Whitespace differs by indentation after the move; the words must not.
      const flat = (s: string) => String(s).replace(/\s+/g, ' ').trim();
      expect(flat(moved[i].body), moved[i].id).toBe(flat(was.body));
    });
  });

  it('carries the same roles per section', () => {
    const moved = helpSections();
    legacy.forEach((was, i) => {
      expect(moved[i].roles.map((r: any) => r.kind), moved[i].id)
        .toEqual(was.roles.map((r: any) => r.kind));
    });
  });

  it('gives every section a unique id', () => {
    const ids = helpSections().map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the content helpers', () => {
  it('renders a click path as a route rather than prose', () => {
    const html = helpPath('Header', 'team picker');
    expect(html).toContain('help-path');
    expect(html).toContain('<b>Header</b>');
    expect(html).toContain('<b>team picker</b>');
  });

  it('labels a note and a warning distinctly', () => {
    expect(helpNote('Heads up', '<p>x</p>')).toContain('help-note');
    expect(helpWarn('Careful', '<p>x</p>')).toContain('help-warn');
  });

  it('renders a table with a header row and a body row per entry', () => {
    const html = helpTable(['A', 'B'], [['1', '2'], ['3', '4']]);
    expect((html.match(/<th>/g) || [])).toHaveLength(2);
    expect((html.match(/<tr>/g) || [])).toHaveLength(3);
    expect((html.match(/<td>/g) || [])).toHaveLength(4);
  });
});
