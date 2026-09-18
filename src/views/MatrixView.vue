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
import RecordResultModal from '../components/matrix/RecordResultModal.vue';
import SquadReportModal from '../components/matrix/SquadReportModal.vue';
import PrintFormsModal from '../components/planner/PrintFormsModal.vue';
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
/**
 * The exercise the breakdown is scoped to, or null for all of them.
 *
 * Opened from an exercise's leaderboard the coach's question already has an
 * exercise in it; opened from the overall board it does not.
 */
const openPlayerDrillId = ref<string | null>(null);

function openFromBoard(id: string): void {
  openPlayerDrillId.value = null;
  openPlayerId.value = id;
}

function openFromExercise(id: string): void {
  openPlayerDrillId.value = matrix.exerciseFilter || null;
  openPlayerId.value = id;
}
const notice = ref<string | null>(null);

const weightsOpen = ref(false);
const resultOpen = ref(false);
const squadOpen = ref(false);
const formsOpen = ref(false);
const progressOpen = ref(false);
/** Set when the chart is opened from a squad report graph, so it opens on that row. */
const progressFor = ref<{ playerId: string | null; drillId: string | null }>({ playerId: null, drillId: null });

/** The chart on its own button: whatever it had chosen. */
function openProgress(): void {
  progressFor.value = { playerId: null, drillId: null };
  progressOpen.value = true;
}

/** The chart from a graph, over the squad report, which stays open beneath it. */
function openProgressFor(pick: { playerId: string; drillId: string }): void {
  progressFor.value = pick;
  progressOpen.value = true;
}
/**
 * Every live exercise, which is one list rather than two.
 *
 * There used to be a picker here that only chose what "Record a session"
 * opened, and a second one on the exercise panel that chose what the
 * leaderboard showed. Choosing in the obvious one appeared to do nothing,
 * because its only effect was a link's href.
 *
 * Merging them takes the wider list, because the two were narrow in opposite
 * directions: the recording list carried brand-new exercises with no results
 * yet, and the viewing list carried 1v1s. Narrowing to either would have lost
 * a real case — recording an exercise for the first time, or reading a 1v1's
 * standings. So the picker offers everything and the two jobs gate themselves.
 */
const sessionDrills = computed(() => session.drills);

/**
 * Whether the chosen exercise can be recorded as a session.
 *
 * head_to_head is entered as pairings; giving one drill both routes would let
 * the same day's competition be counted twice. That rule used to be enforced
 * by keeping 1v1s out of the picker, which also kept their ratings out of
 * reach. It is now said on screen instead.
 */
const chosenDrill = computed(() =>
  session.drills.find((d: any) => d.id === matrix.exerciseFilter) || null);

const recordable = computed(() =>
  !!sessionDrills.value.length
  && (!chosenDrill.value || chosenDrill.value.measure !== 'head_to_head'));

/**
 * Whether the chosen exercise has anything to show. `matrix.exercises` is the
 * drills that carry results, so an exercise absent from it has never been
 * recorded — which is a sentence, not an empty table.
 */
const hasResults = computed(() =>
  matrix.exercises.some((d: any) => d.id === matrix.exerciseFilter));

/** What "Record a session" opens: the chosen exercise, or the first offered. */
const sessionDrillId = computed(() =>
  matrix.exerciseFilter || (sessionDrills.value[0]?.id ?? ''));

/**
 * Choosing an exercise is choosing what the screen is about, so it moves to
 * the panel that shows it. Leaving the coach on the board to discover a tab
 * is what made the control read as broken.
 */
function onExerciseChosen(id: string): void {
  matrix.setExerciseFilter(id);
  if (id) chosenPanel.value = 'exercise';
}

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
        v-if="sessionDrills.length"
        class="acts__select" aria-label="Exercise" data-session-drill
        :value="matrix.exerciseFilter"
        @change="onExerciseChosen(($event.target as HTMLSelectElement).value)"
      >
        <option value="">All exercises</option>
        <option v-for="d in sessionDrills" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>
      <RouterLink
        v-if="recordable" class="act" data-record-session
        :to="{ name: 'session-entry', params: { drillId: sessionDrillId } }"
      >Record a session</RouterLink>
      <!--
        Not a dead label any more. head_to_head is scored from pairings rather
        than sessions, and this is where a pairing is recorded -- the thing
        the old sentence described but did not offer.
      -->
      <button
        v-else-if="sessionDrills.length" type="button" class="act"
        data-record-pairings @click="resultOpen = true"
      >Record a 1v1</button>
      <p v-else class="act act--dead" data-record-session>Add an exercise in the planner first</p>
      <button type="button" class="act" data-open-weights @click="weightsOpen = true">Weights &amp; standards</button>
      <button type="button" class="act" data-open-squad @click="squadOpen = true">Squad report</button>
        <button type="button" class="act" data-open-forms @click="formsOpen = true">Print forms</button>
      <button type="button" class="act" data-open-progress @click="openProgress">Progress</button>
    </div>

    <p v-if="!settled" class="empty">Loading the ratings…</p>
    <p v-else-if="matrix.players.length === 0" class="empty" data-empty>
      No players on this team yet.
    </p>

    <div v-else class="panel" :data-panel="panel">
      <template v-if="panel === 'board'">
        <MatrixBoard @open-player="openFromBoard" />
      </template>

      <!--
        No picker of its own: the one in the actions row above chooses the
        exercise for the whole screen, and having two was what made choosing
        in the obvious one look like it did nothing.
      -->
      <template v-else-if="panel === 'exercise'">
        <ExerciseLeaderboard
          v-if="matrix.exerciseFilter && hasResults"
          @open-player="openFromExercise" />
        <p v-else-if="matrix.exerciseFilter" class="empty" data-no-results>
          No results recorded for {{ chosenDrill?.name || 'this exercise' }} yet.
        </p>
        <p v-else class="empty">Choose an exercise above to see it on its own.</p>
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
      :drill-id="openPlayerDrillId"
      @close="openPlayerId = null" />

    <RecordResultModal
      v-if="chosenDrill"
      :open="resultOpen" :team-id="org.activeTeamId"
      :drill-id="chosenDrill.id" :drill-name="chosenDrill.name"
      :players="matrix.players" :logs="matrix.logs"
      @close="resultOpen = false" @saved="reload" />

    <WeightsModal
      v-if="isCoach"
      :open="weightsOpen" :team-id="org.activeTeamId" :school-id="schoolId"
      @close="weightsOpen = false" @saved="reload" />

    <SquadReportModal
      v-if="isCoach"
      :open="squadOpen" :team-id="org.activeTeamId" @close="squadOpen = false"
      @open-progress="openProgressFor" />

    <PrintFormsModal
      v-if="isCoach"
      :open="formsOpen" :team-id="org.activeTeamId" :school-id="schoolId"
      @close="formsOpen = false" />

    <ProgressModal
      v-if="isCoach"
      :open="progressOpen" :team-id="org.activeTeamId"
      :initial-player-id="progressFor.playerId" :initial-drill-id="progressFor.drillId"
      @close="progressOpen = false" />
  </section>
</template>

<style scoped>
.matrix { padding: var(--space-4) var(--space-4) var(--space-8); }

.matrix__head { padding-bottom: var(--space-3); border-bottom: 1px solid var(--rule); }

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

/*
 * The background is explicit, not transparent. The closed control renders
 * against the page either way — which is what made this hard to see — but the
 * open dropdown is painted by the browser, and with no background of its own
 * it falls back to the platform default -- a pale list -- while options inherit
 * --ink. The list was then invisible except under the hover highlight.
 *
 * The `option` rule is belt and braces: not every browser passes the select's
 * background down to the list.
 */
.acts__select, .picker__select {
  min-height: 36px;
  padding: 0 var(--space-2);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: var(--surface-deep);
  color: var(--ink);
  font: inherit;
  font-size: 12px;
}

.acts__select option, .picker__select option {
  background: var(--surface-deep);
  color: var(--ink);
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
