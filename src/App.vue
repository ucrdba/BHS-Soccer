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
 *
 * NoticeBox is the one thing outside that rule: it renders on every route,
 * bare ones included. A save that failed during a match is exactly the
 * failure a coach must be told about, and those screens have no header to
 * put it in.
 *
 * DemoNotice is the other: on the demo deployment it sits above everything, on
 * every route, bare ones included, because a visitor on the live-match screen
 * must know the players are made up just as much as one on the home page.
 */
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import AppHeader from './components/layout/AppHeader.vue';
import AppNav from './components/layout/AppNav.vue';
import AppFooter from './components/layout/AppFooter.vue';
import NoticeBox from './components/ui/NoticeBox.vue';
import DemoNotice from './components/layout/DemoNotice.vue';
import { useOrganizationStore } from './stores/organization';

const org = useOrganizationStore();
const route = useRoute();
const toolChrome = computed(() => route.meta.chrome === 'tool');

onMounted(() => org.load());
</script>

<template>
  <DemoNotice />
  <AppHeader v-if="!toolChrome" />
  <AppNav v-if="!toolChrome" />

  <main id="main" class="shell__main" :class="{ 'shell__main--tool': toolChrome }">
    <p v-if="org.loadError" class="shell__error" role="alert">
      {{ org.loadError }}
    </p>
    <RouterView />
  </main>

  <AppFooter v-if="!toolChrome" />

  <NoticeBox />
</template>

<style scoped>
.shell__main {
  min-height: 60vh;
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
