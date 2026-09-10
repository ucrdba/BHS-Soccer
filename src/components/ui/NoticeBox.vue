<script setup lang="ts">
/**
 * What went wrong, said on the page.
 *
 * The data layer reports every failure to `domain/notices`; this is what
 * renders them. Mounted once in the shell, and on every route including the
 * tool screens — a save that failed during a match is exactly the one a coach
 * needs to be told about, and those screens deliberately have no header to
 * put it in.
 *
 * Nothing here auto-dismisses. A message that vanishes on its own is a
 * message a coach looking at the pitch never saw, and the failures reported
 * here are things that did not happen.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { subscribeToNotices, dismissNotice, clearNotices, type Notice } from '../../domain/notices';

const notices = ref<Notice[]>([]);
/** Which ones have had their technical detail opened, by id. */
const opened = ref<number[]>([]);

let off: (() => void) | null = null;

onMounted(() => {
  off = subscribeToNotices(list => { notices.value = list; });
});

onBeforeUnmount(() => { off?.(); off = null; });

/**
 * Newest first, and only a few.
 *
 * Twelve are kept so a developer can ask what else failed; three are shown,
 * because a column of boxes tall enough to cover the page is a second
 * problem rather than a clearer report of the first.
 */
const VISIBLE = 3;

const shown = computed(() => notices.value.slice().reverse().slice(0, VISIBLE));
const hidden = computed(() => Math.max(0, notices.value.length - VISIBLE));

const isOpen = (id: number): boolean => opened.value.includes(id);

function toggle(id: number): void {
  opened.value = isOpen(id) ? opened.value.filter(x => x !== id) : opened.value.concat(id);
}

function dismiss(id: number): void {
  opened.value = opened.value.filter(x => x !== id);
  dismissNotice(id);
}

function dismissAll(): void {
  opened.value = [];
  clearNotices();
}
</script>

<template>
  <!--
    aria-live so a screen reader hears a failure that arrives while the coach
    is elsewhere on the page; "polite" rather than "assertive" because it must
    not cut across what they are reading mid-sentence.
  -->
  <div
    v-if="shown.length" class="notices" role="region"
    aria-label="Problems" aria-live="polite" data-notices
  >
    <article v-for="n in shown" :key="n.id" class="notice" data-notice>
      <div class="notice__head">
        <p class="notice__message" data-notice-message>{{ n.message }}</p>
        <button
          type="button" class="notice__close" :aria-label="`Dismiss: ${n.message}`"
          data-notice-dismiss @click="dismiss(n.id)"
        >×</button>
      </div>

      <p class="notice__meta">
        <!--
          A repeat is a count rather than another box: a store retrying against
          a connection that is still down would otherwise fill the screen.
        -->
        <span v-if="n.count > 1" data-notice-count>Happened {{ n.count }} times. </span>
        <button
          v-if="n.detail" type="button" class="notice__more"
          :aria-expanded="isOpen(n.id)" data-notice-toggle @click="toggle(n.id)"
        >{{ isOpen(n.id) ? 'Hide details' : 'Details' }}</button>
      </p>

      <!--
        The technical text, kept out of the way but kept. It is what a coach
        forwards, and it is how the cause actually gets found.
      -->
      <p v-if="n.detail && isOpen(n.id)" class="notice__detail" data-notice-detail>
        <span class="notice__method">{{ n.method }}</span>{{ n.detail }}
      </p>
    </article>

    <p v-if="hidden" class="notices__more" data-notices-more>
      and {{ hidden }} more.
      <button type="button" class="notice__more" data-notices-clear @click="dismissAll">
        Dismiss all
      </button>
    </p>
  </div>
</template>

<style scoped>
/*
 * Anchored to the viewport so it is readable from any scroll position, and
 * away from the bottom bars the tool screens draw.
 */
.notices {
  position: fixed;
  right: var(--space-3);
  bottom: var(--space-3);
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: min(24rem, calc(100vw - var(--space-3) * 2));
}

.notice {
  padding: var(--space-3);
  border: 1px solid var(--rule);
  border-left: 4px solid var(--color-warning);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-md);
}

.notice__head { display: flex; align-items: flex-start; gap: var(--space-2); }

.notice__message {
  flex: 1;
  margin: 0;
  color: var(--ink);
  font-size: 14px;
  line-height: 1.45;
}

.notice__close {
  flex: none;
  min-width: 28px;
  min-height: 28px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-soft);
  font: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.notice__close:hover { color: var(--ink); }

.notice__meta {
  margin: var(--space-1) 0 0;
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.5;
}

.notice__more {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink-muted);
  font: inherit;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}

.notice__more:hover { color: var(--ink); }

.notice__detail {
  margin: var(--space-2) 0 0;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  background: var(--surface-deep);
  color: var(--ink-muted);
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  /* A Postgres error arrives as one long unbroken string. */
  overflow-wrap: anywhere;
}

.notice__method { display: block; color: var(--ink-soft); }

.notices__more {
  margin: 0;
  color: var(--ink-soft);
  font-size: 12px;
  text-align: right;
}

@media (prefers-reduced-motion: no-preference) {
  .notice { animation: notice-in 160ms ease-out; }
}

@keyframes notice-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
</style>
