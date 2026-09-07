<script setup lang="ts">
/**
 * Schedule & Results.
 *
 * The date rendering, the directions rule and the season record are tested
 * domain modules; this is a template over them.
 *
 * The Phase 5 entry points the legacy schedule carries — the lineup board and
 * plus/minus tracking — are absent rather than stubbed. Both still work in the
 * legacy app.
 */
import { ref, computed, watch } from 'vue';
import MatchFormModal from '../components/schedule/MatchFormModal.vue';
import LineupModal from '../components/schedule/LineupModal.vue';
import SeasonReportModal from '../components/schedule/SeasonReportModal.vue';
import PlusMinusModal from '../components/schedule/PlusMinusModal.vue';
import { useScheduleStore, type MatchForm } from '../stores/schedule';
import { useOrganizationStore } from '../stores/organization';
import { useAuthStore } from '../stores/auth';
import { useRosterStore } from '../stores/roster';
import { useLineupStore } from '../stores/lineup';
import { fixturesWithoutLineup } from '../domain/lineup';
import { displayDate, matchDirectionsUrl } from '../domain/schedule-view';
import type { Match } from '../domain/schedule-row';

const schedule = useScheduleStore();
const org = useOrganizationStore();
const auth = useAuthStore();
const roster = useRosterStore();
const lineup = useLineupStore();

const canEdit = computed(() => auth.isCoach || auth.isAdmin);

const editing = ref<Match | null>(null);
const formOpen = ref(false);
const busy = ref(false);
const formError = ref<string | null>(null);
const notice = ref<string | null>(null);

const lineupOpen = ref(false);
const lineupMatch = ref<Match | null>(null);
const seasonOpen = ref(false);
const pmOpen = ref(false);
const pmMatch = ref<Match | null>(null);

function openPlusMinus(m: Match): void {
  pmMatch.value = m;
  pmOpen.value = true;
}

const schoolId = computed(() => org.school?.id ?? null);

/**
 * Fixtures with no team sheet yet.
 *
 * The whole reason the lineup index is read: a coach checking on a Thursday
 * which of the weekend's games still needs one.
 */
const missingLineup = computed(() => new Set(
  fixturesWithoutLineup(schedule.matches, lineup.index).map((m: any) => m.id)));

function openLineup(m: Match | null): void {
  lineupMatch.value = m;
  lineupOpen.value = true;
}

async function onLineupSaved(): Promise<void> {
  notice.value = 'Lineup saved.';
  await lineup.loadIndex(org.activeTeamId);
}

const settled = computed(() => !schedule.loading && schedule.loadedTeamId !== null);

watch(() => org.activeTeamId, (id) => {
  schedule.load(id);
  // The roster is the squad a lineup is picked from, and the index is what
  // marks the fixtures still missing one.
  if (canEdit.value) { roster.load(id); lineup.loadIndex(id); }
}, { immediate: true });

/** Upcoming first, then results — the order a coach reads the page in. */
const upcoming = computed(() =>
  schedule.matches.filter(m => m.status !== 'COMPLETED'));
const played = computed(() =>
  schedule.matches.filter(m => m.status === 'COMPLETED').slice().reverse());

function openAdd(): void {
  editing.value = null;
  formError.value = null;
  formOpen.value = true;
}

function openEdit(m: Match): void {
  editing.value = m;
  formError.value = null;
  formOpen.value = true;
}

async function onSave(f: MatchForm): Promise<void> {
  const teamId = org.activeTeamId;
  if (!teamId) { formError.value = 'No active team selected.'; return; }

  busy.value = true;
  formError.value = null;
  try {
    const res = editing.value
      ? await schedule.updateMatch(editing.value.id, f, teamId)
      : await schedule.addMatch(f, teamId);

    if (res?.ok) {
      formOpen.value = false;
      notice.value = editing.value ? 'Fixture updated.' : 'Fixture added.';
      return;
    }
    formError.value = res?.error || 'Could not save.';
  } finally {
    busy.value = false;
  }
}

async function onRemove(m: Match): Promise<void> {
  const teamId = org.activeTeamId;
  if (!teamId) return;
  if (!window.confirm(`Delete the fixture against ${m.opponent} on ${displayDate(m)}?`)) return;

  const res = await schedule.removeMatch(m.id, teamId);
  notice.value = res?.ok ? 'Fixture deleted.' : (res?.error || 'Could not delete.');
}
</script>

<template>
  <section class="sched">
    <header class="sched__head">
      <div>
        <h1 class="sched__title">Schedule &amp; Results</h1>
        <p v-if="org.branding.name" class="sched__org">
          {{ org.branding.name }}
          <span v-if="org.activeTeam">· {{ org.activeTeam.name }}</span>
        </p>
      </div>
      <div v-if="canEdit" class="sched__acts">
        <button type="button" class="btn btn--go" data-add-match @click="openAdd">
          + Add fixture
        </button>
        <button type="button" class="btn" data-open-lineup @click="openLineup(null)">
          Lineup
        </button>
        <button type="button" class="btn" data-open-season @click="seasonOpen = true">
          Season report
        </button>
      </div>
    </header>

    <p v-if="notice" class="notice" role="status" data-notice>
      {{ notice }}
      <button type="button" class="notice__x" aria-label="Dismiss" @click="notice = null">&times;</button>
    </p>
    <p v-if="schedule.loadError" class="notice notice--bad" role="alert" data-load-error>
      {{ schedule.loadError }}
    </p>

    <p v-if="!settled" class="empty">Loading the schedule…</p>
    <p v-else-if="schedule.matches.length === 0" class="empty" data-empty>
      No fixtures yet.<template v-if="canEdit"> Add one to get started.</template>
    </p>

    <template v-else>
      <section v-if="upcoming.length" class="group">
        <h2 class="group__title">Upcoming</h2>
        <ul class="list">
          <li v-for="m in upcoming" :key="m.id" class="row" data-fixture>
            <div class="row__main">
              <span class="row__when">{{ displayDate(m) }}</span>
              <span class="row__who">
                <span class="row__ha">{{ m.isHome ? 'vs' : 'at' }}</span>
                {{ m.opponent }}
              </span>
              <span class="row__where">
                {{ m.location }}
                <template v-if="m.time"> · {{ m.time }}</template>
              </span>
            </div>
            <div class="row__side">
              <a v-if="matchDirectionsUrl(m)" class="row__link" data-directions
                 :href="matchDirectionsUrl(m)!" target="_blank" rel="noopener">Directions</a>
              <template v-if="canEdit">
                <button type="button" class="row__btn" data-fixture-lineup @click="openLineup(m)">
                  Lineup<span v-if="missingLineup.has(m.id)" class="row__dot" data-lineup-missing>•</span>
                </button>
                <button type="button" class="row__btn" data-fixture-pm @click="openPlusMinus(m)">
                  &plusmn;
                </button>
                <button type="button" class="row__btn" data-match-edit @click="openEdit(m)">Edit</button>
                <button type="button" class="row__btn row__btn--danger" data-match-remove
                        @click="onRemove(m)">Delete</button>
              </template>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="played.length" class="group">
        <h2 class="group__title">
          Results
          <span v-if="schedule.record.gamesPlayed" class="group__record">
            {{ schedule.record.recordText }}
          </span>
        </h2>
        <ul class="list">
          <li v-for="m in played" :key="m.id" class="row" data-fixture>
            <div class="row__main">
              <span class="row__when">{{ displayDate(m) }}</span>
              <span class="row__who">
                <span class="row__ha">{{ m.isHome ? 'vs' : 'at' }}</span>
                {{ m.opponent }}
              </span>
              <span class="row__where">{{ m.location }}</span>
            </div>
            <div class="row__side">
              <span v-if="m.score" class="row__score" data-score>{{ m.score }}</span>
              <template v-if="canEdit">
                <button type="button" class="row__btn" data-fixture-lineup @click="openLineup(m)">
                  Lineup<span v-if="missingLineup.has(m.id)" class="row__dot" data-lineup-missing>•</span>
                </button>
                <button type="button" class="row__btn" data-fixture-pm @click="openPlusMinus(m)">
                  &plusmn;
                </button>
                <button type="button" class="row__btn" data-match-edit @click="openEdit(m)">Edit</button>
                <button type="button" class="row__btn row__btn--danger" data-match-remove
                        @click="onRemove(m)">Delete</button>
              </template>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <LineupModal
      v-if="canEdit"
      :open="lineupOpen" :match-id="lineupMatch?.id ?? null"
      :match-label="lineupMatch ? `${lineupMatch.opponent}` : ''"
      :team-id="org.activeTeamId" :school-id="schoolId" :players="roster.players"
      @close="lineupOpen = false" @saved="onLineupSaved" />

    <PlusMinusModal
      v-if="canEdit"
      :open="pmOpen" :match-id="pmMatch?.id ?? null"
      :match-label="pmMatch ? `${pmMatch.opponent}` : ''"
      :team-id="org.activeTeamId" :school-id="schoolId" :players="roster.players"
      @close="pmOpen = false" />

    <SeasonReportModal
      v-if="canEdit"
      :open="seasonOpen" :team-id="org.activeTeamId"
      :teams="org.teams" :players="roster.players"
      @close="seasonOpen = false" />

    <MatchFormModal
      v-if="canEdit"
      :open="formOpen" :match="editing" :busy="busy" :error="formError"
      @close="formOpen = false" @save="onSave" />
  </section>
</template>

<style scoped>
.sched { max-width: 60rem; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }

.sched__head {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}

.sched__title { margin: 0; color: var(--ink); font-size: 1.4rem; }

.sched__org {
  margin: 0.25rem 0 0;
  color: var(--bhs-cyan-accent);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.group { margin-bottom: 2rem; }

.group__title {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  margin: 0 0 0.75rem;
  color: var(--bhs-cyan-accent);
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.group__record {
  color: var(--text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

.list { margin: 0; padding: 0; list-style: none; }

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.8rem 0.9rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 8px;
  background: var(--bhs-navy-card);
  margin-bottom: 0.5rem;
}

.row__main { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }

.row__when {
  color: var(--bhs-gold-accent);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.row__who { color: var(--ink); font-size: 1rem; font-weight: 600; }
.row__ha { color: var(--text-muted, #94a3b8); font-weight: 400; font-size: 0.85rem; }
.row__where { color: var(--text-muted, #94a3b8); font-size: 0.78rem; }

.row__side { display: flex; gap: 0.4rem; align-items: center; }

.row__score {
  color: var(--ink);
  font-size: 1rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.row__link {
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--bhs-cyan-accent);
  border-radius: 5px;
  color: var(--bhs-cyan-accent);
  font-size: 0.74rem;
  text-decoration: none;
}

.row__btn {
  padding: 0.3rem 0.55rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  font: inherit;
  font-size: 0.74rem;
  cursor: pointer;
}

.row__btn:hover { color: var(--ink); }
.row__btn--danger:hover { border-color: var(--color-danger, #f87171); color: var(--color-danger, #f87171); }

.empty { padding: 3rem 1rem; color: var(--text-muted, #94a3b8); text-align: center; }

.sched__acts { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-start; }

.row__dot { margin-left: 0.25rem; color: var(--bhs-gold-accent); }

.notice {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 1rem;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--bhs-cyan-accent);
  border-radius: 6px;
  color: var(--bhs-cyan-accent);
  font-size: 0.85rem;
}

.notice--bad { border-color: var(--color-danger, #f87171); color: var(--color-danger, #f87171); }

.notice__x {
  border: 0; background: none; color: inherit;
  font-size: 1.2rem; line-height: 1; cursor: pointer;
}

.btn {
  padding: 0.55rem 1rem;
  border: 1px solid transparent;
  border-radius: 6px;
  font: inherit;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn--go { background: var(--bhs-cyan-accent); color: var(--bhs-navy-bg); }
</style>
