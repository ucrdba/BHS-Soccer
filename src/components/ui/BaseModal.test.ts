/**
 * The modal every screen reuses.
 *
 * A dialog that cannot be dismissed with Escape, or that lets Tab wander onto
 * the page behind it, is a dialog somebody gets stuck in -- and this app is
 * used one-handed on a touchline. Thirty-six of these exist in the legacy app,
 * each with its own close handling; this is the one that replaces them.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount, enableAutoUnmount } from '@vue/test-utils';
import BaseModal from './BaseModal.vue';

// The page lock counts open dialogs, so one left mounted by a test would hold
// the page locked for the next.
enableAutoUnmount(afterEach);

const mountModal = (props: Record<string, any> = {}, slots: Record<string, any> = {}) =>
  mount(BaseModal, {
    props: { open: true, title: 'Edit player', ...props },
    slots: { default: '<button id="a">A</button><button id="b">B</button>', ...slots },
    attachTo: document.body
  });

describe('BaseModal', () => {
  it('renders nothing when closed', () => {
    expect(mountModal({ open: false }).find('[data-modal]').exists()).toBe(false);
  });

  it('shows the title and the slotted content when open', () => {
    const w = mountModal();
    expect(w.text()).toContain('Edit player');
    expect(w.find('#a').exists()).toBe(true);
  });

  it('is a dialog, and says what names it', () => {
    const dialog = mountModal().find('[data-modal]');
    expect(dialog.attributes('role')).toBe('dialog');
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(dialog.attributes('aria-label')).toBe('Edit player');
  });

  it('closes on Escape', async () => {
    const w = mountModal();
    await w.find('[data-modal]').trigger('keydown', { key: 'Escape' });
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('closes on a backdrop click but not on a click inside', async () => {
    const w = mountModal();
    await w.find('[data-modal-panel]').trigger('click');
    expect(w.emitted('close')).toBeUndefined();

    await w.find('[data-modal-backdrop]').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('closes from the close button', async () => {
    const w = mountModal();
    await w.find('[data-modal-close]').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('renders a footer when one is given', () => {
    const w = mountModal({}, { footer: '<button id="save">Save</button>' });
    expect(w.find('#save').exists()).toBe(true);
  });

  it('locks the page behind it, and unlocks on close', async () => {
    const w = mountModal();
    expect(document.body.style.overflow).toBe('hidden');
    await w.setProps({ open: false });
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('unlocks when unmounted while still open', () => {
    // Otherwise a route change with a modal open leaves the page unscrollable
    // with nothing on screen to explain why.
    const w = mountModal();
    expect(document.body.style.overflow).toBe('hidden');
    w.unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('moves focus into the panel when it opens', async () => {
    const w = mount(BaseModal, {
      props: { open: false, title: 'T' },
      slots: { default: '<button id="a">A</button>' },
      attachTo: document.body
    });
    await w.setProps({ open: true });
    await new Promise(r => setTimeout(r, 0));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('keeps Tab inside the panel', async () => {
    const w = mountModal();
    const last = w.find('#b').element as HTMLElement;
    last.focus();
    await w.find('[data-modal]').trigger('keydown', { key: 'Tab' });
    // Wrapped rather than escaping to the page behind.
    expect(w.find('[data-modal-panel]').element.contains(document.activeElement)).toBe(true);
  });
});

describe('one dialog over another', () => {
  // The squad report opens the progress chart on top of itself. Closing the
  // chart must not unlock the page while the report is still up behind it.
  it('keeps the page locked until the last one closes', async () => {
    const under = mountModal({ title: 'Squad report' });
    const over = mountModal({ title: 'Progress' });
    expect(document.body.style.overflow).toBe('hidden');

    await over.setProps({ open: false });
    expect(document.body.style.overflow).toBe('hidden');

    await under.setProps({ open: false });
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('counts one unmounted while open as closed', async () => {
    const under = mountModal({ title: 'Squad report' });
    const over = mountModal({ title: 'Progress' });
    over.unmount();
    expect(document.body.style.overflow).toBe('hidden');
    await under.setProps({ open: false });
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
