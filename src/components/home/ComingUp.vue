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
/* Sized by the column it sits in, not the window: beside the season summary
   on a computer it is narrower than it is alone on a phone. */
.coming { container-type: inline-size; }

.coming__list { margin: var(--space-2) 0 0; padding: 0; list-style: none; border-top: 1px solid var(--rule); }

.coming__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--rule);
}

.coming__date { width: 9.5rem; flex: none; font-size: 12px; color: var(--ink-muted); }
/* break-word, not anywhere: a name wraps between its words, and only a single
   word too long for the whole row is ever split. */
.coming__opp { flex: 1; font-family: var(--heading-face); font-size: 18px; color: var(--ink); overflow-wrap: break-word; }

/* Too narrow for date, opponent and side on one line -- a two-word opponent
   was left about 50px and broke mid-word. The date takes its own line above,
   and the opponent gets the row beside the side. */
@container (max-width: 20rem) {
  .coming__row { flex-wrap: wrap; row-gap: 2px; }
  .coming__date { width: 100%; }
}

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
