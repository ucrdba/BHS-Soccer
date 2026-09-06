/**
 * Searching the handbook.
 *
 * The legacy version walked the DOM after innerHTML landed, which is why the
 * router called it on a setTimeout. As a filter over the sections it needs no
 * elements, and can be checked properly.
 */
import { describe, it, expect } from 'vitest';
import { searchHelp, helpIndex, searchableText } from './help-search';
import { helpSections } from '../content/help';
import type { HelpSection } from '../content/help';

const section = (over: Partial<HelpSection> = {}): HelpSection => ({
  id: 's1', part: 'Getting started', title: 'First time here',
  roles: [{ kind: 'all', label: 'Everyone' }],
  body: '<p>Sign in and wait for approval.</p>',
  ...over
} as HelpSection);

describe('searchableText', () => {
  it('strips tags, so a query does not match markup', () => {
    // Otherwise searching "table" matches every section containing one.
    const text = searchableText(section({ body: '<table><td>rows</td></table>' }));
    expect(text).not.toContain('<');
    expect(text).toContain('rows');
  });

  it('decodes the entities the prose is written with', () => {
    const text = searchableText(section({ body: '<p>don&rsquo;t &mdash; do</p>' }));
    expect(text).toContain("don't");
    expect(text).toContain('-');
  });

  it('includes the title', () => {
    expect(searchableText(section({ title: 'Switching teams' }))).toContain('Switching teams');
  });
});

describe('searchHelp', () => {
  const sections = [
    section({ id: 'a', title: 'Importing a roster', body: '<p>Upload a spreadsheet.</p>' }),
    section({ id: 'b', title: 'Switching teams', body: '<p>Use the team picker.</p>' }),
    section({ id: 'c', title: 'The Matrix', body: '<p>Ratings and standings.</p>' })
  ];

  it('returns everything for an empty query', () => {
    // Nothing would read as "the handbook has no answer", which is a lie.
    expect(searchHelp(sections, '')).toHaveLength(3);
    expect(searchHelp(sections, '   ')).toHaveLength(3);
  });

  it('matches a word in the title', () => {
    expect(searchHelp(sections, 'matrix').map(s => s.id)).toEqual(['c']);
  });

  it('matches a word in the body', () => {
    expect(searchHelp(sections, 'spreadsheet').map(s => s.id)).toEqual(['a']);
  });

  it('ignores case', () => {
    expect(searchHelp(sections, 'MATRIX').map(s => s.id)).toEqual(['c']);
  });

  it('requires every word, in any order', () => {
    // "import roster" means both words, not the phrase.
    expect(searchHelp(sections, 'roster importing').map(s => s.id)).toEqual(['a']);
    expect(searchHelp(sections, 'roster matrix')).toEqual([]);
  });

  it('is empty when nothing matches, rather than everything', () => {
    expect(searchHelp(sections, 'zzzznothing')).toEqual([]);
  });

  it('does not throw on a missing list', () => {
    expect(searchHelp(null as any, 'x')).toEqual([]);
  });
});

describe('helpIndex', () => {
  it('groups by part, in the order the parts first appear', () => {
    // The handbook is written to be read top to bottom: "Getting started"
    // belongs first whatever its initial letter.
    const idx = helpIndex([
      section({ id: 'a', part: 'Getting started' }),
      section({ id: 'b', part: 'Coaching' }),
      section({ id: 'c', part: 'Getting started' })
    ]);
    expect(idx.map(p => p.part)).toEqual(['Getting started', 'Coaching']);
    expect(idx[0].sections.map(s => s.id)).toEqual(['a', 'c']);
  });

  it('is empty for no sections', () => {
    expect(helpIndex([])).toEqual([]);
  });
});

describe('against the real handbook', () => {
  const all = helpSections();

  it('indexes every section into a part', () => {
    const counted = helpIndex(all).reduce((n, p) => n + p.sections.length, 0);
    expect(counted).toBe(all.length);
  });

  it('finds the sections a coach would actually search for', () => {
    for (const q of ['roster', 'schedule', 'matrix', 'lineup', 'quiz']) {
      expect(searchHelp(all, q).length, q).toBeGreaterThan(0);
    }
  });

  it('narrows as a query gets longer', () => {
    const broad = searchHelp(all, 'roster').length;
    const narrow = searchHelp(all, 'roster import spreadsheet').length;
    expect(narrow).toBeLessThanOrEqual(broad);
  });
});
