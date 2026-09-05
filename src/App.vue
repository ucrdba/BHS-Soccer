<script setup lang="ts">
/**
 * The application shell.
 *
 * The organization loads once, here, rather than in each view: its branding
 * paints the whole page and every screen scopes to the active team.
 */
import { onMounted } from 'vue';
import AppHeader from './components/layout/AppHeader.vue';
import AppNav from './components/layout/AppNav.vue';
import AppFooter from './components/layout/AppFooter.vue';
import { useOrganizationStore } from './stores/organization';

const org = useOrganizationStore();
onMounted(() => org.load());
</script>

<template>
  <AppHeader />
  <AppNav />

  <main id="main" class="shell__main">
    <p v-if="org.loadError" class="shell__error" role="alert">
      {{ org.loadError }}
    </p>
    <RouterView />
  </main>

  <AppFooter />
</template>

<style scoped>
.shell__main {
  min-height: 60vh;
}

.shell__error {
  margin: 1rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--bhs-gold-accent);
  border-radius: 6px;
  color: var(--bhs-gold-accent);
  font-size: 0.9rem;
}
</style>
