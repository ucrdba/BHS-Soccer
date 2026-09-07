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
import { useScheduleStore, type MatchForm } from '../stores/schedule';
import { useOrganizationStore } from '../stores/organization';
import { useAuthStore } from '../stores/auth';
import { useRosterStore } from '../stores/roster';
import { useLineupStore } from '../stores/lineup';
import { fixturesWithoutLineup } from '../domain/lineup';
import { displayDate, matchDirectionsUrl, matchOutcome } from '../domain/schedule-view';
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

const schoolId = computed(() => org.school?.id ?? null);

/**
 * Fixtures with no team sheet yet.
 *
 * The whole reason the lineup index is read: a coach checking on a Thursday
 * which of the weekend's games still needs one.
 */
const missingLineup = computed(() => new Set(
  fixturesWithoutLineup(schedule.matches, lineup.index).map((m: any) => m.id)));

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

/** The upcoming fixtures other than the next one, which gets its own card. */
const later = computed(() =>
  schedule.nextMatch ? upcoming.value.filter(m => m.id !== schedule.nextMatch!.id) : upcoming.value);

function outcomeWord(m: Match): string {
  const o = matchOutcome(m);
  return o === 'won' ? 'Won' : o === 'drawn' ? 'Drawn' : o === 'lost' ? 'Lost' : '';
}

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
        <p v-if="org.branding.name" class="sched__org kicker tnum">
          {{ org.branding.name }}<span v-if="org.activeTeam"> · {{ org.activeTeam.name }}</span>
        </p>
      </div>
      <div v-if="canEdit" class="sched__acts">
        <button type="button" class="btn btn--go" data-add-match @click="openAdd">Add fixture</button>
        <RouterLink class="btn" data-open-lineup :to="{ name: 'lineup' }">Lineup</RouterLink>
        <RouterLink class="btn" data-open-season :to="{ name: 'season-report' }">Season report</RouterLink>
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
        <p class="kicker kicker--accent">Upcoming</p>

        <article v-if="schedule.nextMatch" class="next" data-next-fixture data-fixture>
          <div class="next__top">
            <h2 class="next__opp">{{ schedule.nextMatch.opponent }}</h2>
            <span class="pill">{{ schedule.nextMatch.isHome ? 'Home' : 'Away' }}</span>
          </div>
          <p class="next__when tnum">
            {{ displayDate(schedule.nextMatch) }}<template v-if="schedule.nextMatch.time"> · {{ schedule.nextMatch.time }}</template><template v-if="schedule.nextMatch.location"> · {{ schedule.nextMatch.location }}</template>
          </p>
          <div class="next__links">
            <a v-if="matchDirectionsUrl(schedule.nextMatch)" class="textlink" data-directions
               :href="matchDirectionsUrl(schedule.nextMatch)!" target="_blank" rel="noopener">Directions</a>
            <template v-if="canEdit">
              <button type="button" class="textlink" data-match-edit @click="openEdit(schedule.nextMatch)">Edit</button>
              <RouterLink class="textlink" data-fixture-lineup
                          :to="{ name: 'lineup', params: { matchId: schedule.nextMatch.id } }">
                Lineup<span v-if="missingLineup.has(schedule.nextMatch.id)" class="dot" data-lineup-missing>•</span>
              </RouterLink>
              <RouterLink class="textlink" data-fixture-pm
                          :to="{ name: 'live', params: { matchId: schedule.nextMatch.id } }">Live ±</RouterLink>
              <button type="button" class="textlink textlink--danger" data-match-remove @click="onRemove(schedule.nextMatch)">Delete</button>
            </template>
          </div>
        </article>

        <ul class="list">
          <li v-for="m in later" :key="m.id" class="row" data-fixture>
            <div class="row__main">
              <p class="row__opp">{{ m.opponent }}</p>
              <p class="row__when tnum">{{ displayDate(m) }}<template v-if="m.time"> · {{ m.time }}</template></p>
              <div v-if="canEdit || matchDirectionsUrl(m)" class="row__links">
                <a v-if="matchDirectionsUrl(m)" class="textlink" data-directions
                   :href="matchDirectionsUrl(m)!" target="_blank" rel="noopener">Directions</a>
                <template v-if="canEdit">
                  <button type="button" class="textlink" data-match-edit @click="openEdit(m)">Edit</button>
                  <RouterLink class="textlink" data-fixture-lineup
                              :to="{ name: 'lineup', params: { matchId: m.id } }">
                    Lineup<span v-if="missingLineup.has(m.id)" class="dot" data-lineup-missing>•</span>
                  </RouterLink>
                  <RouterLink class="textlink" data-fixture-pm
                              :to="{ name: 'live', params: { matchId: m.id } }">Live ±</RouterLink>
                  <button type="button" class="textlink textlink--danger" data-match-remove @click="onRemove(m)">Delete</button>
                </template>
              </div>
            </div>
            <span class="row__side">{{ m.isHome ? 'Home' : 'Away' }}</span>
          </li>
        </ul>
      </section>

      <section v-if="played.length" class="group">
        <p class="kicker">
          Results
          <span v-if="schedule.record.gamesPlayed" class="tnum">· {{ schedule.record.recordText }}</span>
        </p>
        <ul class="list">
          <li v-for="m in played" :key="m.id" class="row" data-fixture>
            <div class="row__main">
              <p class="row__opp">{{ m.opponent }}</p>
              <p class="row__when tnum">{{ displayDate(m) }} · {{ m.isHome ? 'home' : 'away' }}</p>
              <div v-if="canEdit" class="row__links">
                <button type="button" class="textlink" data-match-edit @click="openEdit(m)">Edit</button>
                <RouterLink class="textlink" data-fixture-lineup
                            :to="{ name: 'lineup', params: { matchId: m.id } }">
                  Lineup<span v-if="missingLineup.has(m.id)" class="dot" data-lineup-missing>•</span>
                </RouterLink>
                <RouterLink class="textlink" data-fixture-pm
                            :to="{ name: 'live', params: { matchId: m.id } }">Live ±</RouterLink>
                <button type="button" class="textlink textlink--danger" data-match-remove @click="onRemove(m)">Delete</button>
              </div>
            </div>
            <div class="row__result tnum">
              <p v-if="m.score" class="row__score" data-score>{{ m.score }}</p>
              <p v-if="outcomeWord(m)" class="row__word" data-outcome>{{ outcomeWord(m) }}</p>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <!-- The one remaining modal. Live ± and the season report each moved to their own route. -->
    <MatchFormModal
      v-if="canEdit"
      :open="formOpen" :match="editing" :busy="busy" :error="formError"
      @close="formOpen = false" @save="onSave" />
  </section>
</template>

<style scoped>
.sched { padding: var(--space-4) var(--space-4) var(--space-8); }

.sched__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--rule);
}

.sched__title { font-family: var(--heading-face); font-weight: 500; font-size: 24px; color: var(--ink); }
.sched__org { margin-top: var(--space-1); }
.sched__acts { display: flex; flex-wrap: wrap; gap: var(--space-2); }

.group { margin-top: var(--space-6); }
.group:first-child { margin-top: 0; }
.kicker--accent { color: var(--rule-strong); }

/* The next fixture, carried out of the list. */
.next {
  margin-top: var(--space-3);
  padding: var(--space-3) var(--space-3) var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
}

.next__top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); }
.next__opp { font-family: var(--heading-face); font-weight: 500; font-size: 21px; line-height: 1.1; color: var(--ink); }
.next__when { margin-top: 6px; font-size: 12.5px; color: var(--ink-muted); }
.next__links { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-3); margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--rule); }

.pill {
  padding: 3px 8px;
  border: 1px solid var(--rule);
  border-radius: 99px;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-muted);
  white-space: nowrap;
}

/* Text links, underlined in the accent, as the canvas draws them. */
.textlink {
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--live);
  background: none;
  color: var(--live);
  font: inherit;
  font-size: 11.5px;
  line-height: 1.6;
  text-decoration: none;
  cursor: pointer;
}
.textlink:hover, .textlink:focus-visible { color: var(--ink); border-bottom-color: var(--ink); }
.textlink--danger { color: var(--ink-muted); border-bottom-color: var(--rule); }
.textlink--danger:hover, .textlink--danger:focus-visible { color: var(--color-danger); border-bottom-color: var(--color-danger); }
.dot { margin-left: 3px; color: var(--color-warning); }

.list { margin: 0; padding: 0; list-style: none; }

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--rule);
}

.row__main { min-width: 0; }
.row__opp { font-size: 14.5px; color: var(--ink); }
.row__when { margin-top: 2px; font-size: 11.5px; color: var(--ink-muted); }
.row__links { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); margin-top: var(--space-1); }
.row__side { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-muted); white-space: nowrap; }
.row__result { text-align: right; }
.row__score { font-family: var(--heading-face); font-size: 16px; color: var(--ink); }
.row__word { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-muted); }

.empty { padding: var(--space-8) var(--space-3); color: var(--ink-muted); text-align: center; }

.notice {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  margin: 0 0 var(--space-3);
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
  .sched { max-width: 64rem; margin: 0 auto; }
}
</style>
