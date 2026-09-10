/**
 * The admin page's disclosure row.
 *
 * Eight sections stacked open made /admin a very long scroll. Each one now
 * sits behind a header carrying its title and a summary of its own state, so
 * the page is a short list you can read at a glance and open what you need.
 *
 * The body is hidden with `v-show` rather than `v-if` on purpose: a collapsed
 * section keeps whatever the coach typed into it, and the eight existing
 * per-section suites go on finding the markup they assert against.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SectionShell from './SectionShell.vue';

/*
 * Whether the body is hidden, read off the DOM rather than through VTU's
 * isVisible(). `v-show` sets an inline `display: none`, and isVisible()
 * reports that correctly at mount but goes on returning true after a
 * show -> hide toggle -- so it would pass a component that never closes.
 * The inline style and aria-expanded are the actual contract.
 */
const bodyHidden = (w: any) =>
  (w.find('[data-section-body]').attributes('style') || '').includes('display: none');

function mountShell(props: Record<string, unknown> = {}) {
  return mount(SectionShell, {
    props: { title: 'Drill categories', ...props },
    slots: { default: '<p data-inner>Twenty-five of them</p>' }
  });
}

describe('SectionShell', () => {
  it('shows the title', () => {
    expect(mountShell().find('[data-section-toggle]').text()).toContain('Drill categories');
  });

  it('shows a badge when given one, and none when not', () => {
    expect(mountShell({ badge: '25 categories' }).find('[data-section-badge]').text())
      .toBe('25 categories');
    expect(mountShell().find('[data-section-badge]').exists()).toBe(false);
  });

  it('starts closed', () => {
    const w = mountShell();
    expect(bodyHidden(w)).toBe(true);
    expect(w.find('[data-section-toggle]').attributes('aria-expanded')).toBe('false');
  });

  it('opens and closes again on click', async () => {
    const w = mountShell();
    await w.find('[data-section-toggle]').trigger('click');
    expect(bodyHidden(w)).toBe(false);
    expect(w.find('[data-section-toggle]').attributes('aria-expanded')).toBe('true');

    await w.find('[data-section-toggle]').trigger('click');
    expect(bodyHidden(w)).toBe(true);
    expect(w.find('[data-section-toggle]').attributes('aria-expanded')).toBe('false');
  });

  /*
   * Keyboard support comes from using a real <button>, which the platform
   * already operates on Enter and Space. Asserting that it IS one is honest;
   * firing a synthetic keydown at a div and watching a hand-rolled handler
   * respond would prove only that the handler exists.
   */
  it('is a button, so the keyboard reaches it', () => {
    const toggle = mountShell().find('[data-section-toggle]');
    expect(toggle.element.tagName).toBe('BUTTON');
    expect(toggle.attributes('type')).toBe('button');
  });

  it('points aria-controls at the body it discloses', () => {
    const w = mountShell();
    const controls = w.find('[data-section-toggle]').attributes('aria-controls');
    expect(controls).toBeTruthy();
    expect(w.find('[data-section-body]').attributes('id')).toBe(controls);
  });

  it('gives two shells on one page distinct body ids', () => {
    const a = mountShell().find('[data-section-body]').attributes('id');
    const b = mountShell().find('[data-section-body]').attributes('id');
    expect(a).not.toBe(b);
  });

  /*
   * The reason for v-show. A collapsed section's markup stays in the
   * document, so a section keeps its state across a collapse and the existing
   * per-section tests keep finding what they assert on.
   */
  it('keeps the slotted content in the document while closed', () => {
    expect(mountShell().find('[data-inner]').exists()).toBe(true);
  });

  /*
   * A badge that reports a problem has to look unlike one that reports a
   * count, or the one signal worth scanning for reads as furniture.
   */
  it('carries the tone it is given', () => {
    expect(mountShell({ badge: 'Connected', tone: 'live' })
      .find('[data-section-badge]').classes()).toContain('tag--live');
    expect(mountShell({ badge: 'Not configured', tone: 'warn' })
      .find('[data-section-badge]').classes()).toContain('tag--warn');
  });

  it('is a plain tag when given no tone', () => {
    const cls = mountShell({ badge: '25 categories' }).find('[data-section-badge]').classes();
    expect(cls).toContain('tag');
    expect(cls).not.toContain('tag--live');
    expect(cls).not.toContain('tag--warn');
  });

  it('can be asked to start open', () => {
    expect(bodyHidden(mountShell({ startOpen: true }))).toBe(false);
  });
});
