<script setup lang="ts">
/**
 * Roster & Bios.
 *
 * Sorting, filtering and the row mapping are tested modules; this is a
 * template over them plus the write flow.
 *
 * The Phase 5 entry points the legacy roster carries -- lineup, plus/minus,
 * the season report, recording numbers -- are deliberately absent rather than
 * stubbed. A button that does nothing is worse than one that is not there,
 * and the legacy app still has all four.
 */
import { ref, computed, watch } from 'vue';
import PlayerCard from '../components/roster/PlayerCard.vue';
import PlayerDetailModal from '../components/roster/PlayerDetailModal.vue';
import PlayerFormModal from '../components/roster/PlayerFormModal.vue';
import RecordingNumbersModal from '../components/roster/RecordingNumbersModal.vue';
import { useRosterStore, type PlayerForm } from '../stores/roster';
import { useOrganizationStore } from '../stores/organization';
import { useAuthStore } from '../stores/auth';
import { canSeeTeamRatings } from '../domain/ratings-visibility';
import type { Player } from '../domain/player-row';

const roster = useRosterStore();
const org = useOrganizationStore();
const auth = useAuthStore();

const canEdit = computed(() => auth.isCoach || auth.isAdmin);

/**
 * Whether this viewer may see the ratings on a bio.
 *
 * The roster is the right place to decide it: it knows which people are on
 * the team being looked at, which is what "a player of this team" means.
 */
const canSeeRatings = computed(() => canSeeTeamRatings({
  isCoach: auth.isCoach,
  isAdmin: auth.isAdmin,
  canAccessRatings: auth.canAccessRatings,
  viewerPlayerId: auth.user?.playerId ?? null,
  teamPlayerIds: roster.players.map((p: any) => p.id)
}));

const numbersOpen = ref(false);

const detailFor = ref<Player | null>(null);
const editing = ref<Player | null>(null);
const formOpen = ref(false);
const busy = ref(false);
const formError = ref<string | null>(null);
const notice = ref<string | null>(null);

/** Nothing is claimed about an empty squad until a load has happened. */
const settled = computed(() => !roster.loading && roster.loadedTeamId !== null);

watch(() => org.activeTeamId, (id) => { roster.load(id); }, { immediate: true });

function openAdd(): void {
  editing.value = null;
  formError.value = null;
  formOpen.value = true;
}

function openEdit(p: Player): void {
  editing.value = p;
  formError.value = null;
  formOpen.value = true;
}

async function onSave(f: PlayerForm): Promise<void> {
  const teamId = org.activeTeamId;
  const schoolId = org.activeTeam?.school_id;
  if (!teamId || !schoolId) { formError.value = 'No active team selected.'; return; }

  busy.value = true;
  formError.value = null;
  try {
    const res = editing.value
      ? await roster.updatePlayer(editing.value.id, f, teamId, schoolId)
      : await roster.addPlayer(f, teamId, schoolId);

    if (res?.ok) {
      formOpen.value = false;
      notice.value = editing.value ? 'Player updated.' : 'Player added.';
      return;
    }
    // A half-saved edit keeps the form open with what was typed: the profile
    // is stored, this team's fields are not, and re-typing the lot would be
    // the wrong instruction.
    formError.value = res?.error || 'Could not save.';
  } finally {
    busy.value = false;
  }
}

async function onRemove(p: Player): Promise<void> {
  const teamId = org.activeTeamId;
  if (!teamId) return;
  // Says what it actually does: the person stays in the program.
  const ok = window.confirm(
    `Remove ${p.name} from this team? They stay in the program and can be added to another team.`);
  if (!ok) return;

  const res = await roster.removePlayer(p.id, teamId);
  notice.value = res?.ok ? `${p.name} removed from this team.` : (res?.error || 'Could not remove.');
}
</script>

<template>
  <section class="roster">
    <header class="roster__head">
      <div class="roster__titles">
        <h1 class="roster__title">Roster &amp; Bios</h1>
        <p v-if="org.branding.name" class="roster__org kicker tnum">
          {{ org.branding.name }}<span v-if="org.activeTeam"> · {{ org.activeTeam.name }}</span>
        </p>
      </div>
      <div v-if="canEdit" class="roster__acts">
        <button type="button" class="btn" data-open-numbers @click="numbersOpen = true">Recording numbers</button>
        <button type="button" class="btn btn--go" data-add-player @click="openAdd">Add player</button>
      </div>
    </header>

    <p v-if="notice" class="notice" role="status" data-notice>
      {{ notice }}
      <button type="button" class="notice__x" aria-label="Dismiss" @click="notice = null">&times;</button>
    </p>
    <p v-if="roster.loadError" class="notice notice--bad" role="alert" data-load-error>
      {{ roster.loadError }}
    </p>

    <div class="controls">
      <div class="chips" role="group" aria-label="Filter by position">
        <button
          v-for="f in roster.filters" :key="f.key" type="button"
          class="chip" :class="{ 'is-on': roster.filter === f.key }"
          data-filter-chip
          @click="roster.setFilter(f.key)"
        >{{ f.label }} <span class="chip__n tnum">{{ f.count }}</span></button>
      </div>

      <div class="sort" role="group" aria-label="Sort">
        <span class="sort__label">Sort:</span>
        <button type="button" class="sort__opt" :class="{ 'is-on': roster.sortBy === 'number' }"
                data-sort-number @click="roster.setSort('number')">number</button>
        <span class="sort__sep" aria-hidden="true">·</span>
        <button type="button" class="sort__opt" :class="{ 'is-on': roster.sortBy === 'name' }"
                data-sort-name @click="roster.setSort('name')">name</button>
      </div>
    </div>

    <p v-if="!settled" class="empty">Loading the roster…</p>
    <p v-else-if="roster.players.length === 0" class="empty" data-empty>
      No players on this team yet.<template v-if="canEdit"> Add one to get started.</template>
    </p>
    <p v-else-if="roster.visible.length === 0" class="empty" data-empty-filter>
      No players in that position group.
    </p>

    <template v-else>
      <p class="kicker squad__kicker tnum">Squad · {{ roster.visible.length }} shown</p>
      <div class="grid">
        <PlayerCard
          v-for="p in roster.visible" :key="p.id"
          :player="p" :can-edit="canEdit"
          @open="detailFor = $event"
          @edit="openEdit"
          @remove="onRemove"
        />
      </div>
    </template>

    <PlayerDetailModal
      :open="detailFor !== null" :player="detailFor"
      :can-see-ratings="canSeeRatings" @close="detailFor = null" />

    <PlayerFormModal
      v-if="canEdit"
      :open="formOpen" :player="editing" :busy="busy" :error="formError"
      @close="formOpen = false" @save="onSave" />

    <RecordingNumbersModal
      v-if="canEdit"
      :open="numbersOpen" :team-id="org.activeTeamId" :players="roster.players"
      @close="numbersOpen = false" />
  </section>
</template>

<style scoped>
.roster { padding: var(--space-4) var(--space-4) var(--space-8); }

.roster__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--rule);
}

.roster__title { font-family: var(--heading-face); font-weight: 500; font-size: 24px; color: var(--ink); }
.roster__org { margin-top: var(--space-1); }
.roster__acts { display: flex; flex-wrap: wrap; gap: var(--space-2); }

.controls { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-3) 0; }

.chips { display: flex; flex-wrap: wrap; gap: 7px; }

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--rule);
  border-radius: 99px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.chip:hover { background: color-mix(in srgb, var(--ink) 7%, transparent); }
.chip.is-on {
  border-color: var(--live);
  color: var(--live);
  background: color-mix(in srgb, var(--live) 10%, transparent);
}
.chip__n { color: var(--ink-muted); }
.chip.is-on .chip__n { color: inherit; }

.sort { display: flex; align-items: baseline; gap: 6px; font-size: 11.5px; color: var(--ink-muted); }
.sort__opt { padding: 0; border: 0; background: none; color: var(--ink-muted); font: inherit; cursor: pointer; }
.sort__opt.is-on { color: var(--live); border-bottom: 1px solid var(--live); }
.sort__sep { color: var(--ink-soft); }

.squad__kicker { margin-top: var(--space-2); }
.grid { display: flex; flex-direction: column; }

.empty { padding: var(--space-8) var(--space-3); color: var(--ink-muted); text-align: center; }

.notice {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  margin: var(--space-3) 0 0;
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
  .roster { max-width: 64rem; margin: 0 auto; }
  .controls { flex-direction: row; justify-content: space-between; align-items: center; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: var(--space-3); }
}
</style>
