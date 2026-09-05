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
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  margin-top: 3rem;
  padding: 1.25rem 1rem;
  border-top: 1px solid var(--bhs-navy-border);
  color: var(--text-muted, #94a3b8);
  font-size: 0.78rem;
}

.foot__build {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  cursor: help;
}
</style>
