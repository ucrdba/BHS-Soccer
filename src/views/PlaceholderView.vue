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
.placeholder {
  max-width: 34rem;
  margin: 5rem auto;
  padding: 2rem 1.5rem;
  text-align: center;
}

.placeholder__title {
  color: var(--bhs-cyan-accent);
  font-size: 1.5rem;
  margin: 0 0 0.75rem;
}

.placeholder__body {
  color: var(--text-muted);
  line-height: 1.6;
  margin: 0;
}
</style>
