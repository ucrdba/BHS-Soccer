<script setup lang="ts">
/**
 * The demo warning, on every route and above the header.
 *
 * Not dismissible, with no close control: a visitor who hides it can spend an
 * hour believing the roster is real. Renders nothing unless demo mode is on,
 * which production never sets.
 */
import { demoConfig, DEMO_NOTICE_TEXT } from '../../demo';

const demo = demoConfig();
</script>

<template>
  <p v-if="demo.enabled" class="demo-notice" role="note" data-demo-notice>{{ DEMO_NOTICE_TEXT }}</p>
</template>

<style scoped>
/* The amber the load-error box outlines with, filled. */
.demo-notice {
  margin: 0;
  padding: var(--space-2) var(--space-4);
  background: var(--color-warning);
  color: var(--on-warning);
  text-align: center;
  font-size: 0.85rem;
  font-weight: 700;
  line-height: 1.4;
}
</style>
