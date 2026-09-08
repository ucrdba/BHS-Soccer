<script setup lang="ts">
/**
 * Session entry, at its own URL.
 *
 * The drill is in the path and an existing session may be named in the query,
 * so a coach can return to a half-entered sheet from a bookmark. The view
 * loads the exercises and the squad itself rather than assuming the ratings
 * screen filled the stores first.
 */
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ToolNotice from '../components/layout/ToolNotice.vue';
import SessionEntryScreen from '../components/matrix/SessionEntryScreen.vue';
import { useOrganizationStore } from '../stores/organization';
import { useRosterStore } from '../stores/roster';
import { useSessionStore } from '../stores/session';
import { subjectState } from '../domain/tool-subject';

const route = useRoute();
const router = useRouter();
const org = useOrganizationStore();
const roster = useRosterStore();
const session = useSessionStore();

const drillId = computed(() => (route.params.drillId as string) || null);
const sessionId = computed(() => (route.query.session as string) || null);
const schoolId = computed(() => org.school?.id ?? null);

const drill = computed(() =>
  session.drills.find((d: any) => String(d.id) === String(drillId.value)) || null);

/**
 * True once the whole open sequence for the CURRENT drill/session has
 * resolved: the roster has loaded, the exercise library has been read, and
 * (when there is an id to open) `openExisting`/`openNew` has returned.
 *
 * Reset to false at the top of every watch run, so a change of drill or
 * session re-gates the screen rather than leaving it open on stale data.
 * Without this, `SessionEntryScreen` mounts as soon as `session.drills` is
 * non-empty -- true on the very first render whenever `MatrixView` already
 * filled it -- while `roster.load` and `session.openNew`/`openExisting` are
 * still in flight. Both of those assign fresh objects the screen's own watch
 * rebuilds from, so anything the coach has already typed is silently
 * discarded.
 */
const opened = ref(false);

/**
 * A reason the sheet can never open, as distinct from one that has not
 * opened yet.
 *
 * Both of these leave `opened` false for good: the watch returns early when
 * there is no active team, and a roster read that throws leaves
 * `loadedTeamId` null. A tool route has no header and no bottom bar, so a
 * coach parked on the loading card has no way back — the same stranding the
 * failed-library case was fixed for. A reason is an answer: it settles the
 * state, which shows the missing notice, which carries a back link.
 */
const blocker = computed<string | null>(() => {
  if (!org.activeTeamId) return 'Choose a team before recording a session.';
  if (roster.loadError) return roster.loadError;
  return null;
});

/**
 * Settled means the exercises have actually been read and the sheet has
 * actually finished opening, so "no such exercise" is an answer rather than
 * a race, and the screen never renders over data that is still being
 * replaced out from under it.
 *
 * A failed `loadDrills` counts as settled too: it never touches
 * `session.loading`, so without this a failed fetch is indistinguishable
 * from a still-loading one and the coach is stranded on the loading card,
 * which (being a tool route with no header or nav) offers no way out.
 */
const state = computed(() => subjectState({
  settled: !!blocker.value || (
    !session.loading
    && (session.drills.length > 0 || !!session.loadError)
    && roster.loadedTeamId === org.activeTeamId
    && opened.value
  ),
  id: drillId.value,
  // A blocker is not a lookup failure, but it reaches the reader the same
  // way: the missing notice, carrying its own message and a way back.
  found: blocker.value ? null : drill.value
}));

/**
 * Opening the sheet: an existing session is reopened with its results, a new
 * one starts blank. Both are the store's own calls; the view only decides
 * which the URL asked for.
 */
watch(
  () => [org.activeTeamId, drillId.value, sessionId.value] as const,
  async ([teamId, id, existing]) => {
    opened.value = false;
    if (!teamId) return;
    await roster.load(teamId);
    await session.loadDrills(schoolId.value);
    if (id) {
      if (existing) await session.openExisting(existing, teamId);
      else await session.openNew(id, teamId);
    }
    opened.value = true;
  },
  { immediate: true }
);

function onDone(): void {
  router.push({ name: 'matrix' });
}
</script>

<template>
  <ToolNotice
    v-if="state === 'loading'" kind="loading"
    message="Loading the exercise…" :back-to="{ name: 'matrix' }"
  />

  <ToolNotice
    v-else-if="state === 'missing'" kind="missing"
    :message="blocker || session.loadError
      || 'That exercise is not in this organization\'s drill library.'"
    :back-to="{ name: 'matrix' }" back-label="Back to the ratings"
  />

  <SessionEntryScreen
    v-else
    :drill-id="drillId!"
    :team-id="org.activeTeamId"
    :school-id="schoolId"
    :players="roster.players"
    @close="onDone"
  />
</template>
