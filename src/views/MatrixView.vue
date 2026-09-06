<script setup lang="ts">
/**
 * Player Ratings — the Competitive Matrix.
 *
 * Filtering to one exercise answers a different question from the overall
 * board: who has the most small-sided wins, who is best at Coopers. Both are
 * worth asking, so the picker switches between them rather than one replacing
 * the other.
 *
 * The route is guarded on canAccessRatings(), so a guest never arrives here.
 * A player does, and sees the board without the coach controls.
 */
import { ref, computed, watch } from 'vue';
import MatrixBoard from '../components/matrix/MatrixBoard.vue';
import ExerciseLeaderboard from '../components/matrix/ExerciseLeaderboard.vue';
import { useMatrixStore } from '../stores/matrix';
import { useOrganizationStore } from '../stores/organization';
import { useAuthStore } from '../stores/auth';

const matrix = useMatrixStore();
const org = useOrganizationStore();
const auth = useAuthStore();

const isCoach = computed(() => auth.isCoach || auth.isAdmin);
const schoolId = computed(() => org.school?.id ?? null);
const settled = computed(() => !matrix.loading && matrix.loadedTeamId !== null);

const openPlayerId = ref<string | null>(null);

watch(
  () => [org.activeTeamId, schoolId.value],
  () => { matrix.load(org.activeTeamId, schoolId.value); },
  { immediate: true }
);
</script>

<template>
  <section class="matrix">
    <header class="matrix__head">
      <div>
        <h1 class="matrix__title">Player Ratings</h1>
        <p class="matrix__sub">
          Practice competition, tracked. Points are derived from every logged
          result, so correcting one re-ranks everybody.
        </p>
        <p v-if="org.branding.name" class="matrix__org">
          {{ org.branding.name }}
          <span v-if="org.activeTeam">· {{ org.activeTeam.name }}</span>
        </p>
      </div>
    </header>

    <p v-if="matrix.loadError" class="notice notice--bad" role="alert" data-load-error>
      {{ matrix.loadError }}
    </p>

    <div class="picker">
      <label class="picker__label" for="exercise-filter">Exercise</label>
      <select
        id="exercise-filter" class="picker__select" data-exercise-filter
        :value="matrix.exerciseFilter"
        @change="matrix.setExerciseFilter(($event.target as HTMLSelectElement).value)"
      >
        <option value="">All exercises — overall points</option>
        <option v-for="d in matrix.exercises" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>
      <span class="picker__hint">Click a column heading to re-sort.</span>
    </div>

    <p v-if="!settled" class="empty">Loading the ratings…</p>
    <p v-else-if="matrix.players.length === 0" class="empty" data-empty>
      No players on this team yet.
    </p>

    <template v-else>
      <ExerciseLeaderboard v-if="matrix.exerciseFilter" />
      <MatrixBoard v-else @open-player="openPlayerId = $event" />
    </template>
  </section>
</template>

<style scoped>
.matrix { max-width: 68rem; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }

.matrix__head { margin-bottom: 1.25rem; }
.matrix__title { margin: 0; color: #fff; font-size: 1.4rem; }

.matrix__sub {
  margin: 0.3rem 0 0;
  max-width: 44rem;
  color: var(--text-muted, #94a3b8);
  font-size: 0.88rem;
  line-height: 1.5;
}

.matrix__org {
  margin: 0.4rem 0 0;
  color: var(--bhs-cyan-accent);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.picker {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
  margin-bottom: 1rem;
}

.picker__label {
  color: var(--text-muted, #94a3b8);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.picker__select {
  min-width: 15rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 6px;
  background: var(--bhs-navy-bg);
  color: #fff;
  font: inherit;
  font-size: 0.85rem;
}

.picker__hint { color: var(--text-muted, #94a3b8); font-size: 0.74rem; }

.empty { padding: 3rem 1rem; color: var(--text-muted, #94a3b8); text-align: center; }

.notice {
  margin: 0 0 1rem;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--bhs-cyan-accent);
  border-radius: 6px;
  color: var(--bhs-cyan-accent);
  font-size: 0.85rem;
}

.notice--bad { border-color: var(--color-danger, #f87171); color: var(--color-danger, #f87171); }
</style>
