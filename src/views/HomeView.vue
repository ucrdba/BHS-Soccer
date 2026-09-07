<script setup lang="ts">
/**
 * The home page.
 *
 * Every figure on this screen comes from a tested module in src/domain/, so
 * this file computes nothing: it is the proof that Phase 0's extraction paid
 * off. The fixture logic in particular -- which match is next, why there
 * isn't one, and the countdown -- is `domain/schedule.ts`, and the record is
 * `domain/season-record.ts`.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useOrganizationStore } from '../stores/organization';
import { useScheduleStore } from '../stores/schedule';
import { useAuthStore } from '../stores/auth';
import { nextMatchCountdown, shortCountdown, lastCompletedMatch } from '../domain/schedule';
import { displayDate, matchOutcome } from '../domain/schedule-view';
import DailyThought from '../components/home/DailyThought.vue';

const org = useOrganizationStore();
const schedule = useScheduleStore();
const auth = useAuthStore();
const canWriteThought = computed(() => auth.isCoach || auth.isAdmin);

/**
 * The countdown, re-derived on a tick rather than stored.
 *
 * `now` is the only mutable thing: bumping it invalidates the computed, which
 * asks the domain module again. Storing the digits instead would mean two
 * places that can disagree about which match is being counted down to.
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

const countdown = computed(() => {
  // Referenced so the tick invalidates this.
  void now.value;
  return shortCountdown(nextMatchCountdown(schedule.matches));
});

/** Nothing is claimed about the season until a load has actually happened. */
const settled = computed(() => !schedule.loading && schedule.loadedTeamId !== null);

/** What the fixture block says when there is no next match. */
const noFixtureLine = computed(() => {
  if (schedule.state === 'empty') return 'Schedule coming soon';
  if (schedule.state === 'stale') return 'No upcoming fixtures';
  return 'Season complete';
});

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
</script>

<template>
  <section class="home">
    <div class="fixture">
      <p v-if="org.branding.name" class="home__org kicker tnum">
        {{ org.branding.name }}<template v-if="org.branding.mascot"> · {{ org.branding.mascot }}</template><template v-if="org.activeTeam"> · {{ org.activeTeam.name }}</template>
      </p>

      <p v-if="schedule.loadError" class="refused" role="alert">{{ schedule.loadError }}</p>

      <template v-else-if="!settled">
        <p class="kicker">Next match</p>
        <p class="fixture__opp fixture__opp--quiet">Loading the schedule…</p>
      </template>

      <template v-else-if="schedule.nextMatch">
        <p class="kicker kicker--accent">Next match</p>
        <h1 class="fixture__opp" data-next-fixture>{{ schedule.nextMatch.opponent }}</h1>
        <p class="fixture__where">
          {{ schedule.nextMatch.isHome ? 'Home' : 'Away' }}
          <template v-if="schedule.nextMatch.location"> · {{ schedule.nextMatch.location }}</template>
        </p>
        <div class="when">
          <div>
            <p class="when__date tnum">{{ displayDate(schedule.nextMatch) }}</p>
            <p v-if="schedule.nextMatch.time" class="when__time tnum">Kick-off {{ schedule.nextMatch.time }}</p>
          </div>
          <div class="when__count" aria-label="Time until the next match">
            <p class="when__figure tnum" data-countdown>{{ countdown }}</p>
            <p class="when__label">to kick-off</p>
          </div>
        </div>
      </template>

      <template v-else>
        <p class="kicker">Next match</p>
        <h1 class="fixture__opp fixture__opp--quiet">{{ noFixtureLine }}</h1>
        <p v-if="schedule.state === 'empty'" class="fixture__where">
          No fixtures have been added yet.<template v-if="auth.isCoach"> Add them from the Schedule tab.</template>
        </p>
        <p v-else-if="schedule.state === 'stale'" class="fixture__where">
          <template v-if="schedule.lastPlayed">
            Last match: {{ schedule.lastPlayed.opponent }} on {{ schedule.lastPlayed.date }}.
          </template>
          <template v-if="auth.isCoach"> Add the next fixture, or record the result of the last one.</template>
          <template v-else> Check back soon for the next match.</template>
        </p>
        <p v-else class="fixture__where">
          All scheduled matches have been played. Final record: {{ schedule.record.recordText }}
        </p>
      </template>

      <div v-if="settled && lastResult" class="last" data-last-result>
        <p class="last__who">Last out · <em>{{ lastResult.opponent }}, {{ lastResult.side }}</em></p>
        <p class="last__score tnum">{{ lastResult.word }} {{ lastResult.score }}</p>
      </div>
    </div>

    <!-- Directly after the fixture: it is the coach speaking to the squad, and
         the squad reads this page first. -->
    <DailyThought :team-id="org.activeTeamId" :can-edit="canWriteThought" />

    <section v-if="settled && schedule.record.gamesPlayed > 0" class="stats tnum">
      <div class="stat">
        <span class="stat__value">{{ schedule.record.recordText }}</span>
        <span class="stat__label">Record (W&ndash;L&ndash;D)</span>
      </div>
      <div class="stat">
        <span class="stat__value">{{ schedule.record.gamesPlayed }}</span>
        <span class="stat__label">Played</span>
      </div>
      <div class="stat">
        <span class="stat__value">{{ schedule.record.goalsPerGame }}</span>
        <span class="stat__label">Goals / game</span>
      </div>
      <div class="stat">
        <span class="stat__value">{{ schedule.record.cleanSheets }}</span>
        <span class="stat__label">Clean sheets</span>
      </div>
    </section>
  </section>
</template>

<style scoped>
.home { padding: 0 0 var(--space-8); }

.fixture { padding: var(--space-4); }

.home__org { margin-bottom: var(--space-3); }
@media (max-width: 767.98px) {
  .home__org { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
}

.kicker--accent { color: var(--rule-strong); }

.fixture__opp {
  margin-top: var(--space-2);
  font-family: var(--heading-face);
  font-weight: 400;
  font-size: 32px;
  line-height: 1.05;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.fixture__opp--quiet { font-size: 24px; color: var(--ink-muted); }

.fixture__where { margin-top: 4px; font-size: 13px; color: var(--ink-muted); }

.when {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--rule-strong);
}

.when__date { font-family: var(--heading-face); font-size: 23px; line-height: 1; color: var(--ink); }
.when__time { margin-top: 3px; font-size: 13px; color: var(--ink-muted); }
.when__count { text-align: right; }
.when__figure { font-family: var(--heading-face); font-size: 23px; line-height: 1; color: var(--rule-strong); }
.when__label { margin-top: 4px; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-muted); }

.last {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-6);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}

.last__who { font-size: 12px; color: var(--ink-muted); }
.last__who em { font-style: italic; }
.last__score { font-family: var(--heading-face); font-size: 17px; color: var(--ink); }

.refused {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-warning);
  border-left-width: 4px;
  border-radius: var(--radius-md);
  color: var(--ink);
  font-size: 0.9rem;
}

.stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0 var(--space-4);
  margin: var(--space-6) var(--space-4) 0;
  border-top: 1px solid var(--rule);
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--rule);
}

.stat__value { font-family: var(--heading-face); font-size: 20px; color: var(--ink); }
.stat__label { font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-muted); }

@media (min-width: 768px) {
  .fixture, .stats { max-width: 40rem; margin-inline: auto; }
  .fixture { padding: var(--space-8) var(--space-4) 0; }
  .stats { grid-template-columns: repeat(4, 1fr); }
}
</style>
