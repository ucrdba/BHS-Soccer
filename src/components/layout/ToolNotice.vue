<script setup lang="ts">
/**
 * What a tool route shows instead of its screen.
 *
 * A tool route renders without the app's header and navigation, so a coach
 * who reaches one from a stale bookmark has no way back unless the notice
 * carries it. While the source is merely loading there is nothing to escape
 * from yet, so no way out is offered — an escape hatch on a page that is
 * about to work reads as a failure.
 */
import type { RouteLocationRaw } from 'vue-router';

withDefaults(defineProps<{
  kind: 'loading' | 'missing';
  message: string;
  backTo: RouteLocationRaw;
  backLabel?: string;
}>(), { backLabel: 'Back to the schedule' });
</script>

<template>
  <section class="notice" :data-tool-notice="kind">
    <p class="notice__message" data-tool-notice-message>{{ message }}</p>
    <RouterLink
      v-if="kind === 'missing'" :to="backTo"
      class="notice__back" data-tool-notice-back
    >{{ backLabel }}</RouterLink>
  </section>
</template>

<style scoped>
.notice {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: center;
  justify-content: center;
  height: 100vh;
  height: 100dvh;
  padding: var(--space-4);
  background: var(--ground);
  color: var(--ink-muted);
  font-size: 14px;
  text-align: center;
}

.notice__back {
  color: var(--live);
  border-bottom: 1px solid var(--live);
  text-decoration: none;
}

.notice__back:hover,
.notice__back:focus-visible { color: var(--ink); border-bottom-color: var(--ink); }
</style>
