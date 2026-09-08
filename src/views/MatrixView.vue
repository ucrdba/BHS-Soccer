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
import { useRouter } from 'vue-router';
import MatrixBoard from '../components/matrix/MatrixBoard.vue';
import ExerciseLeaderboard from '../components/matrix/ExerciseLeaderboard.vue';
import ResultsPanel from '../components/matrix/ResultsPanel.vue';
import PlayerBreakdownModal from '../components/matrix/PlayerBreakdownModal.vue';
import SessionHistory from '../components/matrix/SessionHistory.vue';
import WeightsModal from '../components/matrix/WeightsModal.vue';
import SquadReportModal from '../components/matrix/SquadReportModal.vue';
import ProgressModal from '../components/matrix/ProgressModal.vue';
import { useMatrixStore } from '../stores/matrix';
import { useSessionStore } from '../stores/session';
import { useOrganizationStore } from '../stores/organization';
import { useAuthStore } from '../stores/auth';
import { visiblePanels, panelFor } from '../domain/matrix-panels';

const matrix = useMatrixStore();
const session = useSessionStore();
const org = useOrganizationStore();
const auth = useAuthStore();
const router = useRouter();

const isCoach = computed(() => auth.isCoach || auth.isAdmin);
const schoolId = computed(() => org.school?.id ?? null);
const settled = computed(() => !matrix.loading && matrix.loadedTeamId !== null);

/** Which panel the segmented control is showing. */
const chosenPanel = ref<string>('board');
const panels = computed(() => visiblePanels(isCoach.value));
const panel = computed(() =>
  panelFor(chosenPanel.value, isCoach.value, !!matrix.exerciseFilter));

const openPlayerId = ref<string | null>(null);
const notice = ref<string | null>(null);

const weightsOpen = ref(false);
const squadOpen = ref(false);
const progressOpen = ref(false);
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

/** Editing a recorded session reopens the grid at its own URL. */
function onEditSession(drillId: string, sessionId: string): void {
  router.push({ name: 'session-entry', params: { drillId }, query: { session: sessionId } });
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
      <p class="kicker kicker--accent">Competitive matrix</p>
      <h1 class="matrix__title">Player Ratings</h1>
      <p class="matrix__meta tnum">
        <span v-if="org.branding.name">
          {{ org.branding.name }}<span v-if="org.activeTeam"> · {{ org.activeTeam.name }}</span>
        </span>
        <span class="matrix__counts">
          {{ matrix.exercises.length }} exercises · {{ matrix.players.length }} players
        </span>
      </p>
    </header>

    <p v-if="notice" class="notice" role="status" data-notice>
      {{ notice }}
      <button type="button" class="notice__x" aria-label="Dismiss" @click="notice = null">&times;</button>
    </p>
    <p v-if="matrix.loadError" class="notice notice--bad" role="alert" data-load-error>
      {{ matrix.loadError }}
    </p>

    <nav class="tabs" aria-label="Ratings panels">
      <button
        v-for="p in panels" :key="p.key"
        type="button" class="tab" :class="{ 'is-on': panel === p.key }"
        data-panel-tab @click="chosenPanel = p.key"
      >{{ p.label }}</button>
    </nav>

    <div v-if="isCoach" class="acts">
      <select
        v-if="sessionDrills.length" v-model="sessionDrillId"
        class="acts__select" aria-label="Exercise to record" data-session-drill
      >
        <option v-for="d in sessionDrills" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>
      <RouterLink
        v-if="sessionDrills.length" class="act" data-record-session
        :to="{ name: 'session-entry', params: { drillId: sessionDrillId || sessionDrills[0].id } }"
      >Record a session</RouterLink>
      <p v-else class="act act--dead" data-record-session>Add an exercise in the planner first</p>
      <button type="button" class="act" data-open-weights @click="weightsOpen = true">Weights &amp; standards</button>
      <button type="button" class="act" data-open-squad @click="squadOpen = true">Squad report</button>
      <button type="button" class="act" data-open-progress @click="progressOpen = true">Progress</button>
    </div>

    <p v-if="!settled" class="empty">Loading the ratings…</p>
    <p v-else-if="matrix.players.length === 0" class="empty" data-empty>
      No players on this team yet.
    </p>

    <div v-else class="panel" :data-panel="panel">
      <template v-if="panel === 'board'">
        <MatrixBoard @open-player="openPlayerId = $event" />
      </template>

      <template v-else-if="panel === 'exercise'">
        <label class="picker">
          <span class="picker__label kicker">Exercise</span>
          <select
            class="picker__select" data-exercise-filter
            :value="matrix.exerciseFilter"
            @change="matrix.setExerciseFilter(($event.target as HTMLSelectElement).value)"
          >
            <option value="">Choose an exercise</option>
            <option v-for="d in matrix.exercises" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
        </label>
        <ExerciseLeaderboard v-if="matrix.exerciseFilter" />
        <p v-else class="empty">Pick an exercise to see it on its own.</p>
      </template>

      <template v-else-if="panel === 'results'">
        <ResultsPanel :can-edit="isCoach" @remove="onRemoveResult" />
      </template>

      <template v-else>
        <SessionHistory
          :can-edit="isCoach" :team-id="org.activeTeamId"
          @edit="onEditSession" @changed="reload" />
      </template>
    </div>

    <PlayerBreakdownModal
      :player-id="openPlayerId" :team-id="org.activeTeamId"
      @close="openPlayerId = null" />

    <WeightsModal
      v-if="isCoach"
      :open="weightsOpen" :team-id="org.activeTeamId" :school-id="schoolId"
      @close="weightsOpen = false" @saved="reload" />

    <SquadReportModal
      v-if="isCoach"
      :open="squadOpen" :team-id="org.activeTeamId" @close="squadOpen = false" />

    <ProgressModal
      v-if="isCoach"
      :open="progressOpen" :team-id="org.activeTeamId" @close="progressOpen = false" />
  </section>
</template>

<style scoped>
.matrix { padding: var(--space-4) var(--space-4) var(--space-8); }

.matrix__head { padding-bottom: var(--space-3); border-bottom: 1px solid var(--rule); }
.kicker--accent { color: var(--rule-strong); }

.matrix__title {
  margin-top: 6px;
  font-family: var(--heading-face);
  font-weight: 400;
  font-size: 28px;
  line-height: 1.1;
  color: var(--ink);
}

.matrix__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: space-between;
  margin-top: var(--space-3);
  padding-top: var(--space-2);
  border-top: 1px solid var(--rule);
  font-size: 11.5px;
  color: var(--ink-muted);
}

.tabs {
  display: flex;
  gap: var(--space-4);
  margin-top: var(--space-3);
  padding-bottom: var(--space-2);
  overflow-x: auto;
}

.tab {
  padding: 0 0 4px;
  border: 0;
  border-bottom: 1px solid transparent;
  background: none;
  color: var(--ink-muted);
  font: inherit;
  font-size: 11.5px;
  white-space: nowrap;
  cursor: pointer;
}

.tab.is-on { color: var(--live); border-bottom-color: var(--live); }

.acts { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }

.act {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  padding: 0 var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  text-decoration: none;
  cursor: pointer;
}

.act--dead { color: var(--ink-muted); cursor: default; }
.act:hover { border-color: var(--live); color: var(--live); }
.act--dead:hover { border-color: var(--rule); color: var(--ink-muted); }

.acts__select, .picker__select {
  min-height: 36px;
  padding: 0 var(--space-2);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 12px;
}

.picker { display: flex; flex-direction: column; gap: 4px; margin-bottom: var(--space-3); }
.picker__label { color: var(--ink-muted); }

.panel { margin-top: var(--space-3); }

.empty { padding: var(--space-8) var(--space-3); text-align: center; color: var(--ink-muted); }

.notice {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule);
  border-left: 4px solid var(--live);
  border-radius: var(--radius-md);
  color: var(--ink);
  font-size: 0.85rem;
}

.notice--bad { border-left-color: var(--color-warning); }
.notice__x { border: 0; background: none; color: inherit; font-size: 1.2rem; line-height: 1; cursor: pointer; }

@media (min-width: 768px) {
  .matrix { max-width: 64rem; margin: 0 auto; }
}
</style>
