<script setup lang="ts">
/**
 * The fixtures after the next one, so a parent can plan the month (spec
 * 2026-09-10-home-hero-design.md §3). HomeView passes at most three --
 * upcomingMatches less its first entry, which the band already shows -- and
 * the whole schedule's size for the link.
 */
import { displayDate } from '../../domain/schedule-view';

defineProps<{ matches: any[]; total: number }>();
</script>

<template>
  <section v-if="matches.length" class="coming" data-coming-up>
    <p class="kicker">Coming up</p>
    <ul class="coming__list">
      <li v-for="m in matches" :key="m.id" class="coming__row" data-coming-row>
        <span class="coming__date tnum">{{ displayDate(m) }}</span>
        <span class="coming__opp">{{ m.opponent }}</span>
        <!-- The word carries the side; the outline only marks home. -->
        <span class="coming__side" :class="{ 'coming__side--home': m.isHome }">{{ m.isHome ? 'Home' : 'Away' }}</span>
      </li>
    </ul>
    <RouterLink :to="{ name: 'schedule' }" class="coming__all" data-all-fixtures>
      All {{ total }} fixture{{ total === 1 ? '' : 's' }} →
    </RouterLink>
  </section>
</template>

<style scoped>
.coming__list { margin: var(--space-2) 0 0; padding: 0; list-style: none; border-top: 1px solid var(--rule); }

.coming__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--rule);
}

.coming__date { width: 9.5rem; flex: none; font-size: 12px; color: var(--ink-muted); }
.coming__opp { flex: 1; font-family: var(--heading-face); font-size: 18px; color: var(--ink); overflow-wrap: anywhere; }

.coming__side {
  padding: 2px var(--space-2);
  border: 1px solid var(--rule);
  border-radius: 99px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.coming__side--home { border-color: var(--mark); color: var(--mark); }

.coming__all { display: inline-block; margin-top: var(--space-2); font-size: 13px; color: var(--live); }
</style>
