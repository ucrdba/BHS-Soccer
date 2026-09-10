<script lang="ts">
/**
 * One collapsible section of the admin page.
 *
 * Eight sections rendered open made /admin a very long scroll, and the state
 * of any one of them — how many teams, how many pending requests — could only
 * be learned by scrolling to it. Each section now sits behind a header that
 * carries its own summary, so the page reads at a glance.
 *
 * The section supplies its own badge rather than the page collecting counts:
 * every section already loads the data it summarises, so nothing has to be
 * plumbed upward and no section stops being self-contained.
 *
 * The body is hidden with `v-show`, not `v-if`. A collapsed section keeps
 * whatever a coach had typed into it, and its markup stays in the document —
 * which is also what lets the eight per-section test suites go on asserting
 * against markup without every one of them having to open a disclosure first.
 */
/*
 * A plain <script> alongside the setup block, because `seq` has to live at
 * module scope: a `let` inside <script setup> is per-instance, and every
 * shell would then hand itself the same id.
 *
 * Counted rather than random so a rendered page is the same twice, which a
 * snapshot or a screenshot comparison needs.
 */
let seq = 0;
function nextBodyId(): string {
  seq += 1;
  return `admin-section-${seq}`;
}
</script>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  title: string;
  /** A short summary of this section's own state. Omitted when it has none. */
  badge?: string | null;
  /**
   * How the badge reads. A badge reporting a problem has to look unlike one
   * reporting a count, or the one signal worth scanning for is furniture.
   * `plain` for a figure, `live` for a good state, `warn` for a problem.
   */
  tone?: 'plain' | 'live' | 'warn';
  startOpen?: boolean;
}>();

const open = ref(!!props.startOpen);
const bodyId = nextBodyId();
</script>

<template>
  <section class="shell">
    <button
      type="button"
      class="shell__head"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="bodyId"
      data-section-toggle
      @click="open = !open"
    >
      <span class="shell__title kicker">{{ title }}</span>
      <span
        v-if="badge"
        class="shell__badge tag"
        :class="tone && tone !== 'plain' ? `tag--${tone}` : null"
        data-section-badge
      >{{ badge }}</span>
      <span class="shell__chev" :class="{ 'is-open': open }" aria-hidden="true">▾</span>
    </button>

    <div :id="bodyId" v-show="open" class="shell__body" data-section-body>
      <slot />
    </div>
  </section>
</template>

<style scoped>
.shell { border-bottom: 1px solid var(--rule); }

.shell__head {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  width: 100%;
  padding: var(--space-3) 0;
  border: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.shell__head:hover .shell__title { color: var(--ink); }
.shell__head:focus-visible { outline: 2px solid var(--live); outline-offset: -2px; }

.shell__title { flex: 1; min-width: 0; }

.shell__badge { flex: none; }

/* The affordance: it points down closed and up open, and it is the only thing
   on the row that moves. */
.shell__chev {
  flex: none;
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1;
  transition: transform 160ms ease;
}
.shell__chev.is-open { transform: rotate(180deg); color: var(--live); }

.shell__body { padding-bottom: var(--space-4); }

@media (prefers-reduced-motion: reduce) {
  .shell__chev { transition: none; }
}
</style>
