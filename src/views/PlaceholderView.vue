<script setup lang="ts">
/**
 * A route that exists but is not built yet.
 *
 * Naming the phase is deliberate: an unlabelled "coming soon" tells a coach
 * nothing, and this app is served alongside a working legacy version that
 * still has the screen.
 */
defineProps<{ title: string; phase: string }>();
</script>

<template>
  <section class="placeholder">
    <h1 class="placeholder__title">{{ title }}</h1>
    <p class="placeholder__body">
      This screen is rebuilt in <strong>{{ phase }}</strong> of the Vue migration.
      It is still available in the current app.
    </p>
  </section>
</template>

<style scoped>
.placeholder { max-width: 34rem; margin: var(--space-8) auto; padding: var(--space-6) var(--space-4); text-align: center; }
.placeholder__title { margin: 0 0 var(--space-2); color: var(--ink); font-family: var(--heading-face); font-weight: 500; font-size: 24px; }
.placeholder__body { margin: 0; color: var(--ink-muted); line-height: 1.6; }
</style>
