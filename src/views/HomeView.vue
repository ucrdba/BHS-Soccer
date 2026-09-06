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
import { nextMatchCountdown } from '../domain/schedule';
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
  return nextMatchCountdown(schedule.matches) || { days: '00', hours: '00', mins: '00' };
});

/** Nothing is claimed about the season until a load has actually happened. */
const settled = computed(() => !schedule.loading && schedule.loadedTeamId !== null);

const headline = computed(() => {
  if (schedule.nextMatch) return `NEXT MATCH vs ${String(schedule.nextMatch.opponent || '').toUpperCase()}`;
  if (schedule.state === 'empty') return 'SCHEDULE COMING SOON';
  if (schedule.state === 'stale') return 'NO UPCOMING FIXTURES';
  return 'SEASON COMPLETE';
});
</script>

<template>
  <section class="hero">
    <p v-if="org.branding.name" class="hero__org">
      {{ org.branding.name }}
      <span v-if="org.activeTeam" class="hero__team">· {{ org.activeTeam.name }}</span>
    </p>

    <h1 v-if="org.branding.mascot" class="hero__title">
      HOME OF THE <span class="hero__mascot">{{ org.branding.mascot.toUpperCase() }}</span>
    </h1>

    <div class="fixture">
      <div class="fixture__detail">
        <p v-if="schedule.loadError" class="fixture__error" role="alert">
          {{ schedule.loadError }}
        </p>

        <template v-else-if="!settled">
          <h2 class="fixture__headline">LOADING THE SCHEDULE…</h2>
        </template>

        <template v-else>
          <h2 class="fixture__headline">{{ headline }}</h2>

          <p v-if="schedule.nextMatch" class="fixture__line">
            {{ schedule.nextMatch.isHome ? 'Home' : 'Away' }}
            <template v-if="schedule.nextMatch.location"> · {{ schedule.nextMatch.location }}</template>
            <template v-if="schedule.nextMatch.date"> | {{ schedule.nextMatch.date }}</template>
            <template v-if="schedule.nextMatch.time">, {{ schedule.nextMatch.time }}</template>
          </p>

          <p v-else-if="schedule.state === 'empty'" class="fixture__line">
            No fixtures have been added yet.<template v-if="auth.isCoach"> Add them from the Schedule tab.</template>
          </p>

          <p v-else-if="schedule.state === 'stale'" class="fixture__line">
            <template v-if="schedule.lastPlayed">
              Last match: {{ schedule.lastPlayed.opponent }} on {{ schedule.lastPlayed.date }}.
            </template>
            <template v-if="auth.isCoach">
              Add the next fixture, or record the result of the last one.
            </template>
            <template v-else>Check back soon for the next match.</template>
          </p>

          <p v-else class="fixture__line">
            All scheduled matches have been played. Final record:
            {{ schedule.record.recordText }}
          </p>
        </template>
      </div>

      <div class="countdown" aria-label="Time until the next match">
        <div class="countdown__unit">
          <span class="countdown__num" data-countdown-unit>{{ countdown.days }}</span>
          <span class="countdown__label">Days</span>
        </div>
        <div class="countdown__unit">
          <span class="countdown__num" data-countdown-unit>{{ countdown.hours }}</span>
          <span class="countdown__label">Hrs</span>
        </div>
        <div class="countdown__unit">
          <span class="countdown__num" data-countdown-unit>{{ countdown.mins }}</span>
          <span class="countdown__label">Min</span>
        </div>
      </div>
    </div>
  </section>

  <!-- Directly after the hero: it is the coach speaking to the squad, and
       the squad reads this page first. -->
  <DailyThought :team-id="org.activeTeamId" :can-edit="canWriteThought" />

  <section v-if="settled && schedule.record.gamesPlayed > 0" class="stats">
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
</template>

<style scoped>
.hero {
  padding: 3rem 1.25rem 2rem;
  background:
    linear-gradient(160deg,
      color-mix(in srgb, var(--bhs-blue-primary) 35%, transparent),
      transparent 60%),
    var(--bhs-navy-bg);
  border-bottom: 1px solid var(--bhs-navy-border);
}

.hero__org {
  margin: 0 0 0.5rem;
  color: var(--bhs-cyan-accent);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.hero__team { color: var(--text-muted, #94a3b8); letter-spacing: 0.06em; }

.hero__title {
  margin: 0 0 2rem;
  color: #fff;
  font-size: clamp(1.75rem, 5vw, 3rem);
  line-height: 1.1;
  letter-spacing: 0.01em;
}

.hero__mascot { color: var(--bhs-cyan-accent); }

.fixture {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  align-items: center;
  justify-content: space-between;
  max-width: 60rem;
  padding: 1.25rem 1.5rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bhs-navy-card) 85%, transparent);
}

.fixture__detail { min-width: 0; }

.fixture__headline {
  margin: 0 0 0.35rem;
  color: #fff;
  font-size: 1.05rem;
  letter-spacing: 0.04em;
}

.fixture__line {
  margin: 0;
  color: var(--text-muted, #94a3b8);
  font-size: 0.88rem;
  line-height: 1.5;
}

.fixture__error {
  margin: 0;
  color: var(--bhs-gold-accent);
  font-size: 0.88rem;
}

.countdown { display: flex; gap: 0.75rem; }

.countdown__unit {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 3.25rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 8px;
}

.countdown__num {
  color: var(--bhs-cyan-accent);
  font-size: 1.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.countdown__label {
  margin-top: 0.25rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.66rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 1rem;
  max-width: 60rem;
  margin: 2rem auto;
  padding: 0 1.25rem;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 1rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 10px;
  background: var(--bhs-navy-card);
}

.stat__value {
  color: #fff;
  font-size: 1.35rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.stat__label {
  color: var(--text-muted, #94a3b8);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

@media (max-width: 640px) {
  .hero { padding: 2rem 1rem 1.5rem; }
  .fixture { padding: 1rem; }
}
</style>
