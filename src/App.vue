<script setup lang="ts">
/**
 * The application shell.
 *
 * The organization loads once, here, rather than in each view: its branding
 * paints the whole page and every screen scopes to the active team.
 *
 * A route marked `chrome: 'tool'` renders bare. The touchline and session
 * screens draw their own top and bottom bars, and a header over a match
 * clock is in the way of a coach holding a phone one-handed.
 */
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import AppHeader from './components/layout/AppHeader.vue';
import AppNav from './components/layout/AppNav.vue';
import AppFooter from './components/layout/AppFooter.vue';
import { useOrganizationStore } from './stores/organization';

const org = useOrganizationStore();
const route = useRoute();
const toolChrome = computed(() => route.meta.chrome === 'tool');

onMounted(() => org.load());
</script>

<template>
  <AppHeader v-if="!toolChrome" />
  <AppNav v-if="!toolChrome" />

  <main id="main" class="shell__main" :class="{ 'shell__main--tool': toolChrome }">
    <p v-if="org.loadError" class="shell__error" role="alert">
      {{ org.loadError }}
    </p>
    <RouterView />
  </main>

  <AppFooter v-if="!toolChrome" />
</template>

<style scoped>
.shell__main {
  min-height: 60vh;
}

/* Room for the fixed bottom bar on a phone. A tool route has no bar. */
@media (max-width: 767.98px) {
  .shell__main:not(.shell__main--tool) {
    padding-bottom: calc(72px + env(safe-area-inset-bottom));
  }
}

.shell__error {
  margin: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-warning);
  border-left-width: 4px;
  border-radius: var(--radius-md);
  color: var(--ink);
  font-size: 0.9rem;
}
</style>
