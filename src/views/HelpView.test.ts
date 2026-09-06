/**
 * The handbook screen.
 *
 * The whole of it is public. Coach-only sections are MARKED rather than
 * hidden: knowing a feature exists is useful to someone who cannot reach it
 * yet, and the handbook is where a player finds out what to ask for.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import HelpView from './HelpView.vue';
import { helpSections } from '../content/help';

function mountHelp(guest = true) {
  return mount(HelpView, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        stubActions: true,
        initialState: {
          auth: { isCoach: !guest, isAdmin: false, isGuest: guest, canAccessRatings: !guest }
        }
      })]
    }
  });
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('the handbook', () => {
  it('renders every section', () => {
    expect(mountHelp().findAll('[data-help-section]'))
      .toHaveLength(helpSections().length);
  });

  it('renders the authored markup rather than escaping it', () => {
    // The bodies are HTML. Escaped, the handbook reads as source code.
    const w = mountHelp();
    expect(w.html()).toContain('<p>');
    expect(w.text()).not.toContain('<p>');
  });

  it('builds an index of every section', () => {
    expect(mountHelp().findAll('[data-help-jump]'))
      .toHaveLength(helpSections().length);
  });

  it('marks coach-only sections rather than hiding them from a guest', () => {
    // A player reading the handbook is how they learn what to ask for.
    const w = mountHelp(true);
    expect(w.findAll('[data-help-role]').length).toBeGreaterThan(0);
    expect(w.findAll('[data-help-section]')).toHaveLength(helpSections().length);
  });
});

describe('searching', () => {
  it('shows everything before anything is typed, and no count', async () => {
    const w = mountHelp();
    expect(w.find('[data-help-count]').exists()).toBe(false);
    expect(w.findAll('[data-help-section]')).toHaveLength(helpSections().length);
  });

  it('narrows to matching sections and says how many', async () => {
    const w = mountHelp();
    await w.find('[data-help-search]').setValue('matrix');

    const shown = w.findAll('[data-help-section]');
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(helpSections().length);
    expect(w.find('[data-help-count]').text()).toContain(String(shown.length));
  });

  it('narrows the index alongside the sections', async () => {
    const w = mountHelp();
    await w.find('[data-help-search]').setValue('matrix');
    expect(w.findAll('[data-help-jump]').length)
      .toBe(w.findAll('[data-help-section]').length);
  });

  it('says so when nothing matches, and suggests what to try', async () => {
    const w = mountHelp();
    await w.find('[data-help-search]').setValue('zzzznothingatall');

    expect(w.findAll('[data-help-section]')).toHaveLength(0);
    expect(w.find('[data-help-none]').exists()).toBe(true);
    expect(w.find('[data-help-none]').text()).toMatch(/single word|screen name/i);
  });

  it('shows everything again when the box is cleared', async () => {
    const w = mountHelp();
    await w.find('[data-help-search]').setValue('matrix');
    await w.find('[data-help-search]').setValue('');
    expect(w.findAll('[data-help-section]')).toHaveLength(helpSections().length);
  });

  it('ignores case', async () => {
    const w = mountHelp();
    await w.find('[data-help-search]').setValue('MATRIX');
    expect(w.findAll('[data-help-section]').length).toBeGreaterThan(0);
  });
});
