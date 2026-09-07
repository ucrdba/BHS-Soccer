<script setup lang="ts">
/**
 * The frame a touchline screen sits in.
 *
 * A route marked `chrome: 'tool'` renders without the app's header and
 * navigation — a match clock does not want a masthead over it — so the
 * screen carries its own top bar, and with it the only way back. The body
 * scrolls between the two bars rather than the page scrolling, which keeps
 * the clock and the event buttons under a coach's thumb while the squad
 * list moves.
 *
 * One frame for all three screens on purpose: the same top bar written three
 * times drifts into three different top bars.
 */
import type { RouteLocationRaw } from 'vue-router';

withDefaults(defineProps<{
  title: string;
  /** A line above the title: the period, the fixture, the date. */
  kicker?: string;
  backTo: RouteLocationRaw;
  /** Name the destination when "Back" is vaguer than it could be. */
  backLabel?: string;
}>(), { backLabel: 'Back' });
</script>

<template>
  <section class="tool" data-tool-screen>
    <header class="tool__top">
      <RouterLink :to="backTo" class="tool__back" data-tool-back>{{ backLabel }}</RouterLink>
      <div class="tool__names">
        <p v-if="kicker" class="tool__kicker kicker" data-tool-kicker>{{ kicker }}</p>
        <h1 class="tool__title" data-tool-title>{{ title }}</h1>
      </div>
      <div class="tool__control">
        <slot name="top-right" />
      </div>
    </header>

    <div class="tool__body">
      <slot />
    </div>

    <footer v-if="$slots.foot" class="tool__foot" data-tool-foot>
      <slot name="foot" />
    </footer>
  </section>
</template>

<style scoped>
/*
 * A column the height of the viewport: the two bars keep their place and the
 * middle scrolls. `min-height: 0` on the body is what actually lets it
 * scroll inside a flex column — without it the body grows and the footer
 * leaves the screen.
 */
.tool {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: var(--ground);
  color: var(--ink);
}

.tool__top {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: none;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--rule);
}

.tool__back {
  flex: none;
  color: var(--live);
  font-size: 12.5px;
  text-decoration: none;
  border-bottom: 1px solid var(--live);
}

.tool__back:hover,
.tool__back:focus-visible { color: var(--ink); border-bottom-color: var(--ink); }

.tool__names { flex: 1; min-width: 0; }
.tool__kicker { color: var(--ink-muted); }

.tool__title {
  font-family: var(--heading-face);
  font-size: 19px;
  line-height: 1.15;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.tool__control { flex: none; }

.tool__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-3) var(--space-4);
}

.tool__foot {
  display: flex;
  gap: var(--space-2);
  flex: none;
  padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
  border-top: 1px solid var(--rule);
}

@media (min-width: 768px) {
  .tool { max-width: 64rem; margin: 0 auto; }
}
</style>
