<script setup lang="ts">
/**
 * The dialog every screen reuses.
 *
 * The legacy app has thirty-six modals, each closing itself its own way -- a
 * backdrop listener here, an onclick there, and Escape almost nowhere. This
 * owns all of it once: focus in on open and back out on close, Tab trapped,
 * Escape, backdrop click, and the page behind locked while it is up.
 */
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  /** Widens the panel for forms that need two columns. */
  wide?: boolean;
}>(), { wide: false });

const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);
/** Where focus was before this opened, so it can be given back. */
let previouslyFocused: HTMLElement | null = null;

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
].join(',');

function focusable(): HTMLElement[] {
  if (!panel.value) return [];
  return Array.from(panel.value.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter(el => el.offsetParent !== null || el === document.activeElement);
}

function lockScroll(on: boolean): void {
  if (typeof document === 'undefined') return;
  document.body.style.overflow = on ? 'hidden' : '';
}

watch(() => props.open, async (open) => {
  lockScroll(open);
  if (open) {
    previouslyFocused = (document.activeElement as HTMLElement) || null;
    await nextTick();
    // The first control, or the panel itself when the dialog is only text.
    (focusable()[0] || panel.value)?.focus();
  } else {
    previouslyFocused?.focus?.();
    previouslyFocused = null;
  }
}, { immediate: true });

// A route change with a modal open would otherwise leave the page
// unscrollable with nothing on screen to explain why.
onBeforeUnmount(() => lockScroll(false));

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') { emit('close'); return; }
  if (e.key !== 'Tab') return;

  const items = focusable();
  if (items.length === 0) { e.preventDefault(); return; }

  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement as HTMLElement;

  if (e.shiftKey && (active === first || !panel.value?.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <div
    v-if="open"
    class="modal"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    data-modal
    @keydown="onKeydown"
  >
    <div class="modal__backdrop" data-modal-backdrop @click="emit('close')" />

    <div
      ref="panel"
      class="modal__panel"
      :class="{ 'modal__panel--wide': wide }"
      tabindex="-1"
      data-modal-panel
    >
      <header class="modal__head">
        <h2 class="modal__title">{{ title }}</h2>
        <button
          type="button"
          class="modal__close"
          aria-label="Close"
          data-modal-close
          @click="emit('close')"
        >&times;</button>
      </header>

      <div class="modal__body">
        <slot />
      </div>

      <footer v-if="$slots.footer" class="modal__foot">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-3);
}

/* The scrim is per ground: --scrim was added in phase 4 for the More sheet. */
.modal__backdrop { position: absolute; inset: 0; background: var(--scrim); }

.modal__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 32rem;
  max-height: calc(100vh - var(--space-6));
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-md);
}

.modal__panel--wide { max-width: 48rem; }

/* index.css clears :focus so :focus-visible can own the ring; the panel is
   focused programmatically when a dialog has no control, and must show one. */
.modal__panel:focus { outline: 2px solid var(--live); outline-offset: -2px; }

.modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--rule);
}

.modal__title {
  margin: 0;
  color: var(--ink);
  font-family: var(--heading-face);
  font-weight: 500;
  font-size: 19px;
  line-height: 1.2;
}

.modal__close {
  padding: 0 var(--space-1);
  border: 0;
  background: none;
  color: var(--ink-muted);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
}

.modal__close:hover,
.modal__close:focus-visible { color: var(--ink); }

.modal__body { padding: var(--space-4); overflow-y: auto; }

.modal__foot {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--rule);
}

/* Under 640px the dialog is a sheet off the bottom edge (spec §5.4). */
@media (max-width: 640px) {
  .modal { padding: 0; align-items: flex-end; }
  .modal__panel {
    max-width: none;
    max-height: 92vh;
    border-bottom: 0;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
}
</style>
