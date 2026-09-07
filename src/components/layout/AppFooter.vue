<script setup lang="ts">
/**
 * Which build is serving this page.
 *
 * Reuses src/build-info.ts, the same module the legacy footer uses, so both
 * apps report the commit the same way. Vite injects window.__BUILD__ in dev
 * and in a real build, so this reads correctly on localhost too -- which is
 * exactly where you most want to know what you are running.
 */
import { computed } from 'vue';
import { buildInfo, formatBuildStamp, buildStampTitle } from '../../build-info';

const info = computed(() => buildInfo());
const stamp = computed(() => formatBuildStamp(info.value));
const title = computed(() => buildStampTitle(info.value));
const year = new Date().getFullYear();
</script>

<template>
  <footer class="foot">
    <span class="foot__copy">&copy; {{ year }}</span>
    <span class="foot__build" :title="title">{{ stamp }}</span>
  </footer>
</template>

<style scoped>
.foot {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  max-width: 64rem;
  margin: var(--space-8) auto 0;
  padding: var(--space-4);
  border-top: 1px solid var(--rule);
  color: var(--ink-muted);
  font-size: 0.78rem;
}

.foot__build {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  cursor: help;
}

/* Room for the fixed bottom bar on a phone. The footer is the last thing
   in the document, so the reservation belongs here, not on main. Tool
   routes render no footer and no bar. */
@media (max-width: 767.98px) {
  .foot { padding-bottom: calc(72px + env(safe-area-inset-bottom)); }
}
</style>
