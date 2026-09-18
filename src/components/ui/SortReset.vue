<script setup lang="ts">
/**
 * "Reset sort", the same on every sortable table.
 *
 * Each screen shows it only while its table is sorted some other way than it
 * starts, and handles the click itself: putting the starting order back and
 * forgetting the remembered sort (`data/sort-memory.ts`). The button
 * disappearing is what says it worked. Attributes and the click listener fall
 * through to the button.
 */
</script>

<template>
  <button type="button" class="sort-reset">Reset sort</button>
</template>

<style scoped>
.sort-reset {
  padding: 2px 8px;
  border: 1px solid var(--rule);
  border-radius: 999px;
  background: transparent;
  color: var(--ink-muted);
  font: inherit;
  font-size: 11.5px;
  line-height: 1.6;
  white-space: nowrap;
  cursor: pointer;
}

.sort-reset:hover { color: var(--ink); border-color: var(--rule-strong); }
.sort-reset:focus-visible { outline: 2px solid var(--mark); outline-offset: 1px; }
</style>
