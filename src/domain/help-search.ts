/**
 * Searching and indexing the handbook.
 *
 * The legacy version did this by walking the DOM after `innerHTML` landed —
 * hence the `setTimeout` in the router. Here it is a filter over the sections,
 * so it needs no elements to exist and can be tested without a browser.
 */
import type { HelpSection } from '../content/help';

export interface HelpPart { part: string; sections: HelpSection[] }

/**
 * The searchable text of a section.
 *
 * Tags are stripped so a query for "table" does not match every section
 * containing one, and entities are decoded so searching for "don't" finds
 * prose written with a typographic apostrophe.
 */
export function searchableText(section: HelpSection): string {
  return String(section.title || '') + ' ' + String(section.body || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&rsquo;|&#8217;/g, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&mdash;|&ndash;/g, '-')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ');
}

/**
 * Sections matching a query.
 *
 * Every word must appear somewhere in the section, in any order — a coach
 * searching "import roster" means both words, not the phrase. An empty query
 * returns everything rather than nothing.
 */
export function searchHelp(sections: HelpSection[], query: string): HelpSection[] {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return (sections || []).slice();

  return (sections || []).filter(s => {
    const hay = searchableText(s).toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

/**
 * The index, grouped by part, in the order the parts first appear.
 *
 * Order comes from the content rather than an alphabetical sort: the handbook
 * is written to be read top to bottom, and "Getting started" belongs first
 * whatever its initial letter.
 */
export function helpIndex(sections: HelpSection[]): HelpPart[] {
  const parts: HelpPart[] = [];
  for (const s of sections || []) {
    let group = parts.find(p => p.part === s.part);
    if (!group) { group = { part: s.part, sections: [] }; parts.push(group); }
    group.sections.push(s);
  }
  return parts;
}
