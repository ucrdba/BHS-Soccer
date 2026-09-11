<script setup lang="ts">
/**
 * The home page.
 *
 * Composition only: every figure and every string comes from a tested module
 * in src/domain/, and every piece of the page is its own component (spec
 * 2026-09-10-home-hero-design.md). The band holds who the organization is and
 * the next match; the coach's message follows for the squad; then what's
 * coming up and how the season is going.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useOrganizationStore } from '../stores/organization';
import { useScheduleStore } from '../stores/schedule';
import { useAuthStore } from '../stores/auth';
import {
  nextMatchCountdown, longCountdown, lastCompletedMatch, upcomingMatches,
  getNextMatch, scheduleState
} from '../domain/schedule';
import { displayDate, matchOutcome, recentForm } from '../domain/schedule-view';
import DailyThought from '../components/home/DailyThought.vue';
import HomeHero from '../components/home/HomeHero.vue';
import ComingUp from '../components/home/ComingUp.vue';
import SeasonSummary from '../components/home/SeasonSummary.vue';

const org = useOrganizationStore();
const schedule = useScheduleStore();
const auth = useAuthStore();
const canWriteThought = computed(() => auth.isCoach || auth.isAdmin);

/**
 * The clock, re-read on a tick rather than stored.
 *
 * `now` is the only mutable thing: bumping it invalidates the computeds that
 * ask the domain module which match is next and how long until it. Storing
 * the digits instead would mean two places that can disagree.
 */
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  // A timer left running after a route change keeps a dead component's
  // reactive graph alive, so it is cleared on unmount.
  timer = setInterval(() => { now.value = Date.now(); }, 1000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });

// The schedule is team-scoped, so it reloads when the active team changes.
watch(() => org.activeTeamId, (id) => { schedule.load(id); }, { immediate: true });

/** Nothing is claimed about the season until a load has actually happened. */
const settled = computed(() => !schedule.loading && schedule.loadedTeamId !== null);

/*
 * "Next match" and "coming up" read the same rule off the same clock (spec
 * §6.2), so they can never disagree: upcomingMatches(now) is the list,
 * getNextMatch(now) is its first entry, and comingUp is what follows it. All
 * three re-run whenever `now` ticks, rather than reading the store's
 * `nextMatch`/`state`, which are computed once from the matches and cached
 * until the next load -- stale the instant the grace period for the
 * displayed match ends while the tab stays open.
 */
const upcoming = computed(() => (settled.value ? upcomingMatches(schedule.matches, now.value) : []));
const next = computed(() => (settled.value ? getNextMatch(schedule.matches, now.value) : null));
const state = computed(() => scheduleState(schedule.matches, now.value));

/** "League · City" from the organization's row, or '' when it has neither. */
const place = computed(() =>
  [org.school?.league, org.school?.city].filter(Boolean).join(' · '));

const kicker = computed(() => {
  const m = next.value;
  if (!m) return 'Next match';
  const side = m.isHome ? 'Home' : 'Away';
  return m.location ? `Next match · ${side} · ${m.location}` : `Next match · ${side}`;
});

/** What the band says when there is no next match. */
const headline = computed(() => {
  if (schedule.loadError) return 'Schedule unavailable';
  if (!settled.value) return 'Loading the schedule…';
  if (next.value) return next.value.opponent;
  if (state.value === 'empty') return 'Schedule coming soon';
  if (state.value === 'stale') return 'No upcoming fixtures';
  return 'Season complete';
});

const countdown = computed(() => (
  next.value ? longCountdown(nextMatchCountdown(schedule.matches, new Date(now.value))) : null
));

const when = computed(() => {
  const m = next.value;
  if (!m) return '';
  const date = displayDate(m);
  return m.time ? `${date} · Kick-off ${m.time}` : date;
});

/** Up to three fixtures after the one the band already shows. */
const comingUp = computed(() => upcoming.value.slice(1, 4));

/**
 * The most recent completed fixture with a readable score, in words.
 * Not `schedule.lastPlayed`: that is the latest fixture on the calendar,
 * which includes next week's. Only a result is a result.
 */
const lastResult = computed(() => {
  const m = lastCompletedMatch(schedule.matches);
  const outcome = matchOutcome(m);
  if (!m || !outcome) return null;
  const word = outcome === 'won' ? 'Won' : outcome === 'drawn' ? 'Drew' : 'Lost';
  return { opponent: m.opponent, side: m.isHome ? 'home' : 'away', word, score: m.score };
});

const form = computed(() => recentForm(schedule.matches));
const opensOn = computed(() => (next.value ? displayDate(next.value) : ''));
</script>

<template>
  <div class="home">
    <!-- The header names the organization for the eye; this is for a screen
         reader arriving on the page, and says which team it is about. -->
    <p v-if="org.branding.name" class="sr-only" data-home-org>
      {{ org.branding.name }}<template v-if="org.branding.mascot"> · {{ org.branding.mascot }}</template><template v-if="org.activeTeam"> · {{ org.activeTeam.name }}</template>
    </p>

    <HomeHero
      :photo="org.branding.heroUrl" :logo="org.branding.logoUrl" :org-name="org.branding.name"
      :place="place" :kicker="kicker" :headline="headline" :quiet="!next"
      :countdown="countdown" :when="when" />

    <div class="page">
      <p v-if="schedule.loadError" class="refused" role="alert">{{ schedule.loadError }}</p>

      <!-- Why there is no next match, in the words the page has always used. -->
      <p v-else-if="settled && !next" class="state">
        <template v-if="state === 'empty'">
          No fixtures have been added yet.<template v-if="auth.isCoach"> Add them from the Schedule tab.</template>
        </template>
        <template v-else-if="state === 'stale'">
          <template v-if="schedule.lastPlayed">
            Last match: {{ schedule.lastPlayed.opponent }} on {{ schedule.lastPlayed.date }}.
          </template>
          <template v-if="auth.isCoach"> Add the next fixture, or record the result of the last one.</template>
          <template v-else> Check back soon for the next match.</template>
        </template>
        <template v-else>
          All scheduled matches have been played. Final record: {{ schedule.record.recordText }}
        </template>
      </p>

      <!-- The coach speaking to the squad: straight after the band, for the
           squad only, and v-if so a visitor's browser never fetches it. -->
      <DailyThought v-if="auth.isLoggedIn" :team-id="org.activeTeamId" :can-edit="canWriteThought" />

      <div class="split">
        <ComingUp :matches="comingUp" :total="schedule.matches.length" />
        <SeasonSummary
          v-if="settled"
          :record="schedule.record" :last-result="lastResult" :form="form"
          :opens-on="opensOn" :fixtures="schedule.matches.length" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.home { padding: 0 0 var(--space-8); }

.refused,
.state { margin: var(--space-4) var(--space-4) 0; }

.state { font-size: 13px; line-height: 1.5; color: var(--ink-muted); }

.refused {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-warning);
  border-left-width: 4px;
  border-radius: var(--radius-md);
  color: var(--ink);
  font-size: 0.9rem;
}

/* One column on a phone; side by side once there is room for two. */
.split {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
  gap: var(--space-6) var(--space-8);
  margin: var(--space-6) var(--space-4) 0;
}

@media (min-width: 768px) {
  .page { max-width: 40rem; margin-inline: auto; }
}
</style>
