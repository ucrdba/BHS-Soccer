/**
 * The printed practice plan.
 *
 * It is a rendered HTML document handed to the browser's own print dialog --
 * no PDF library, which would be a dependency for a worse result.
 *
 * The escaping tests are not decoration. A drill's name and a coach's notes
 * are free text going straight into a document, so a plan called
 * `Rondo <3v1>` prints as an unclosed tag and takes the rest of the page with
 * it.
 */
import { describe, it, expect } from 'vitest';
import { buildPrintDocument, escapeHtml } from './plan-print';
import type { PlanItem } from './practice-plan';

const item = (over: Partial<PlanItem> = {}): PlanItem => ({
  name: 'Rondo', time: '4:00 PM - 4:20 PM', duration: '20 min',
  coachNotes: 'Two touch', ...over
});

const PLAN = [
  item(),
  item({ name: 'Shooting', time: '4:20 PM - 4:35 PM', duration: '15 min', coachNotes: '' })
];

const doc = (items = PLAN, over: any = {}) => buildPrintDocument({
  planName: 'Tuesday Session',
  organization: 'Legends FC',
  team: 'U16',
  items,
  ...over
});

describe('what the document says', () => {
  it('names the plan and the organization', () => {
    const html = doc();
    expect(html).toContain('Tuesday Session');
    expect(html).toContain('Legends FC');
    expect(html).toContain('U16');
  });

  it('carries every drill, in order', () => {
    const html = doc();
    expect(html.indexOf('Rondo')).toBeLessThan(html.indexOf('Shooting'));
  });

  it('prints each drill\'s slot and duration', () => {
    // What the coach reads against a watch.
    const html = doc();
    expect(html).toContain('4:00 PM - 4:20 PM');
    expect(html).toContain('20 min');
  });

  it('heads the document with the total session time', () => {
    expect(doc()).toContain('35 min');
  });

  it('says when the session starts and ends', () => {
    const html = doc();
    expect(html).toContain('4:00 PM');
    expect(html).toContain('4:35 PM');
  });

  it('keeps the coach notes readable, line breaks and all', () => {
    const html = doc([item({ coachNotes: 'Two touch\nBoth feet' })]);
    expect(html).toMatch(/pre-wrap|<br/);
    expect(html).toContain('Both feet');
  });

  it('leaves out the notes block for a drill with none', () => {
    // An empty grey box on every second row makes a printed plan harder to
    // read, not easier.
    const html = doc([item({ coachNotes: '' })]);
    expect(html).not.toContain('Coach focus');
  });

  it('is a complete document, not a fragment', () => {
    // It is written into a print window, which needs a document.
    const html = doc();
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain('</html>');
  });
});

describe('a plan with nothing in it', () => {
  it('refuses rather than printing an empty page', () => {
    expect(buildPrintDocument({ planName: 'X', organization: 'Y', team: '', items: [] }))
      .toBeNull();
  });
});

describe('escaping', () => {
  it('escapes a drill name, which is free text', () => {
    // "Rondo <3v1>" would otherwise print as an unclosed tag and swallow the
    // rest of the page.
    const html = doc([item({ name: 'Rondo <3v1>' })]);
    expect(html).toContain('Rondo &lt;3v1&gt;');
    expect(html).not.toContain('<3v1>');
  });

  it('escapes the coach notes as well', () => {
    const html = doc([item({ coachNotes: 'Press <hard> & win it back' })]);
    expect(html).toContain('&lt;hard&gt;');
    expect(html).toContain('&amp;');
  });

  it('escapes the plan name and the organization', () => {
    const html = doc(PLAN, { planName: 'A & B', organization: '<Club>' });
    expect(html).toContain('A &amp; B');
    expect(html).toContain('&lt;Club&gt;');
  });

  it('handles the ampersand first, so escapes are not double-escaped', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('escapes quotes, for text landing in an attribute', () => {
    expect(escapeHtml('say "this"')).toBe('say &quot;this&quot;');
  });
});

describe('diagrams', () => {
  it('prints a drill\'s diagram when one has been rendered for it', () => {
    const html = doc([item({ name: 'Rondo' })], {
      diagrams: { Rondo: [{ dataUrl: 'data:image/png;base64,AAA', label: 'Step 1' }] }
    });
    expect(html).toContain('data:image/png;base64,AAA');
    expect(html).toContain('Step 1');
  });

  it('prints every step of an animated diagram', () => {
    const html = doc([item({ name: 'Rondo' })], {
      diagrams: {
        Rondo: [
          { dataUrl: 'data:image/png;base64,AAA', label: 'Start' },
          { dataUrl: 'data:image/png;base64,BBB', label: 'Then' }
        ]
      }
    });
    expect(html).toContain('base64,BBB');
    expect(html).toContain('Then');
  });

  it('prints the plan perfectly well with no diagrams at all', () => {
    // Rasterizing them needs a canvas, which the caller may not have.
    expect(doc()).toContain('Rondo');
  });

  it('escapes a step label, which comes from a coach-typed keyframe', () => {
    const html = doc([item({ name: 'Rondo' })], {
      diagrams: { Rondo: [{ dataUrl: 'data:image/png;base64,AAA', label: '<b>Step</b>' }] }
    });
    expect(html).toContain('&lt;b&gt;Step&lt;/b&gt;');
  });
});
