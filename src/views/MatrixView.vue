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
import ResultsPanel from '../components/matrix/ResultsPanel.vue';
import PlayerBreakdownModal from '../components/matrix/PlayerBreakdownModal.vue';
import SessionModal from '../components/matrix/SessionModal.vue';
import SessionHistory from '../components/matrix/SessionHistory.vue';
import WeightsModal from '../components/matrix/WeightsModal.vue';
import { useMatrixStore } from '../stores/matrix';
import { useSessionStore } from '../stores/session';
import { useOrganizationStore } from '../stores/organization';
import { useAuthStore } from '../stores/auth';

const matrix = useMatrixStore();
const session = useSessionStore();
const org = useOrganizationStore();
const auth = useAuthStore();

const isCoach = computed(() => auth.isCoach || auth.isAdmin);
const schoolId = computed(() => org.school?.id ?? null);
const settled = computed(() => !matrix.loading && matrix.loadedTeamId !== null);

const openPlayerId = ref<string | null>(null);
const notice = ref<string | null>(null);

const sessionOpen = ref(false);
const weightsOpen = ref(false);
/** The exercise the grid is recording. Chosen before it opens. */
const sessionDrillId = ref('');

/**
 * Sessions are recorded per exercise, and head_to_head is deliberately not
 * offered: those are entered as pairings, and giving one drill both routes
 * would let the same day's competition be counted twice.
 */
const sessionDrills = computed(() =>
  session.drills.filter((d: any) => d.measure !== 'head_to_head'));

async function openSessions(): Promise<void> {
  await session.loadDrills(schoolId.value);
  await session.loadHistory(org.activeTeamId);
}

async function onRecordSession(): Promise<void> {
  const drillId = sessionDrillId.value || sessionDrills.value[0]?.id || '';
  if (!drillId) { notice.value = 'Add an exercise in the practice planner first.'; return; }
  sessionDrillId.value = drillId;
  await session.openNew(drillId, org.activeTeamId);
  sessionOpen.value = true;
}

async function onEditSession(drillId: string): Promise<void> {
  // openExisting has already loaded the results and the bands; the grid reads
  // them off the store.
  sessionDrillId.value = drillId;
  sessionOpen.value = true;
}

/**
 * Points are derived in Postgres, so nothing on the board moves until it is
 * read again — a recorded session, a corrected one, or a changed weight all
 * re-derive every rank.
 */
async function reload(): Promise<void> {
  await matrix.load(org.activeTeamId, schoolId.value);
  await session.loadHistory(org.activeTeamId);
}

/**
 * Deleting one result re-derives every rank, so the confirmation says so.
 *
 * A coach removing a single bad row should know the whole board moves — that
 * is the point of points being derived rather than stored, but it is not
 * obvious from a delete button.
 */
async function onRemoveResult(r: any): Promise<void> {
  const teamId = org.activeTeamId;
  if (!teamId) return;

  const who = r.drew ? `${r.a} and ${r.b}` : `${r.winner} and ${r.loser}`;
  const when = r.log.occurred_on ? ` on ${r.log.occurred_on}` : '';
  const ok = window.confirm(
    `Delete the result between ${who}${when}?\n\n`
    + "Both players' points and ranks will be recalculated without it."
  );
  if (!ok) return;

  const res = await matrix.removeResult(r.log.id, teamId, schoolId.value);
  notice.value = res?.ok
    ? 'Result deleted; ranks recalculated.'
    : (res?.error || 'Could not delete that result.');
}

watch(
  () => [org.activeTeamId, schoolId.value],
  () => {
    matrix.load(org.activeTeamId, schoolId.value);
    if (isCoach.value) openSessions();
  },
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

      <div v-if="isCoach" class="matrix__acts">
        <select
          v-if="sessionDrills.length" v-model="sessionDrillId"
          class="acts__select" aria-label="Exercise to record"
          data-session-drill
        >
          <option v-for="d in sessionDrills" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
        <button type="button" class="act" data-record-session @click="onRecordSession">
          Record a session
        </button>
        <button type="button" class="act" data-open-weights @click="weightsOpen = true">
          Weights &amp; standards
        </button>
      </div>
    </header>

    <p v-if="notice" class="notice" role="status" data-notice>
      {{ notice }}
      <button type="button" class="notice__x" aria-label="Dismiss" @click="notice = null">&times;</button>
    </p>
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

      <ResultsPanel :can-edit="isCoach" @remove="onRemoveResult" />

      <SessionHistory
        :can-edit="isCoach" :team-id="org.activeTeamId"
        @edit="onEditSession" @changed="reload" />
    </template>

    <PlayerBreakdownModal
      :player-id="openPlayerId" :team-id="org.activeTeamId"
      @close="openPlayerId = null" />

    <SessionModal
      v-if="isCoach"
      :open="sessionOpen" :team-id="org.activeTeamId" :school-id="schoolId"
      :players="matrix.players" :drill-id="sessionDrillId"
      @close="sessionOpen = false" @saved="reload" />

    <WeightsModal
      v-if="isCoach"
      :open="weightsOpen" :team-id="org.activeTeamId" :school-id="schoolId"
      @close="weightsOpen = false" @saved="reload" />
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

.matrix__head { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between; }
.matrix__acts { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-start; }

.acts__select {
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 6px;
  background: var(--bhs-navy-bg);
  color: #fff;
  font: inherit;
  font-size: 0.8rem;
}

.act {
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--bhs-cyan-accent);
  border-radius: 6px;
  background: transparent;
  color: var(--bhs-cyan-accent);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

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
