/**
 * The handbook.
 *
 * Seven hundred lines of authored prose, moved verbatim out of
 * `help.view.js`. This file used to compare the module against that view
 * section by section — the risk of moving authored content being that some of
 * it disappears silently. Phase 7 deleted the view, so the comparison is
 * gone and what stays is the shape the rest of the app relies on:
 * `HelpView.vue` renders one panel per section and `domain/help-search.ts`
 * searches their bodies, so a section with no id, no part or an empty body is
 * a hole in the handbook that nothing else would report.
 */
import { describe, it, expect } from 'vitest';
import {
  helpSections, helpPath, helpNote, helpWarn, helpTable
} from './help';

const sections = helpSections();

describe('the handbook itself', () => {
  it('is there', () => {
    expect(sections.length).toBeGreaterThan(20);
  });

  it('gives every section an id, a part, a title and a body', () => {
    sections.forEach(s => {
      expect(s.id, s.title).toBeTruthy();
      expect(s.part, s.id).toBeTruthy();
      expect(s.title, s.id).toBeTruthy();
      expect(String(s.body).trim().length, s.id).toBeGreaterThan(0);
    });
  });

  it('HAS NO DUPLICATE ID', () => {
    // The id is the anchor the index links to and the key HelpView renders
    // on; two sections sharing one means a link that reaches the wrong page.
    const ids = sections.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every section at least one audience', () => {
    // A section with no roles is filtered out of every view of the handbook,
    // so it is written and never shown.
    sections.forEach(s => {
      expect(Array.isArray(s.roles), s.id).toBe(true);
      expect(s.roles.length, s.id).toBeGreaterThan(0);
      s.roles.forEach(r => expect(['coach', 'admin', 'all'], s.id).toContain(r.kind));
    });
  });

  it('has something for a signed-out visitor', () => {
    expect(sections.some(s => s.roles.some(r => r.kind === 'all'))).toBe(true);
  });

  it('groups the sections under a handful of parts, in order', () => {
    const parts = sections.map(s => s.part);
    // Each part appears as one contiguous run, which is what makes the index
    // read as sections rather than as a shuffled list.
    const runs = parts.filter((p, i) => i === 0 || parts[i - 1] !== p);
    expect(new Set(runs).size).toBe(runs.length);
  });

  it('returns a fresh array each call, so a caller cannot sort it for everyone', () => {
    expect(helpSections()).not.toBe(sections);
  });

  it('NAMES NO SINGLE ORGANIZATION as the one the reader belongs to', () => {
    // Beaumont is the first organization, not the only one. It may be named
    // as an example; it may not be the assumed reader.
    const bodies = sections.map(s => s.body).join(' ');
    expect(bodies).not.toMatch(/your school,? Beaumont/i);
  });
});

describe('the authoring helpers', () => {
  it('renders a click path as steps rather than prose', () => {
    const html = helpPath('Coach Planner', 'Drills', 'Add');
    expect(html).toContain('<b>Coach Planner</b>');
    expect(html).toContain('<b>Add</b>');
    expect(html).toContain('help-path');
  });

  it('renders a note and a warning with their labels', () => {
    expect(helpNote('Note', '<p>x</p>')).toContain('help-note-label');
    expect(helpNote('Note', '<p>x</p>')).toContain('<p>x</p>');
    expect(helpWarn('Careful', '<p>y</p>')).toContain('help-warn-label');
  });

  it('renders a table with a head and a body row per row given', () => {
    const html = helpTable(['A', 'B'], [['1', '2'], ['3', '4']]);
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>4</td>');
    expect((html.match(/<tr>/g) || [])).toHaveLength(3);   // header + two rows
  });

  it('wraps a table so a wide one scrolls rather than pushing the page sideways', () => {
    expect(helpTable(['A'], [['1']])).toContain('help-tablewrap');
  });

  it('copes with an empty table', () => {
    expect(() => helpTable([], [])).not.toThrow();
  });
});
