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
import type { Player } from '../domain/player-row';

const roster = useRosterStore();
const org = useOrganizationStore();
const auth = useAuthStore();

const canEdit = computed(() => auth.isCoach || auth.isAdmin);

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
      <div>
        <h1 class="roster__title">Roster &amp; Bios</h1>
        <p v-if="org.branding.name" class="roster__org">
          {{ org.branding.name }}
          <span v-if="org.activeTeam">· {{ org.activeTeam.name }}</span>
        </p>
      </div>
      <button
        v-if="canEdit" type="button" class="btn" data-open-numbers
        @click="numbersOpen = true"
      >Recording numbers</button>
      <button v-if="canEdit" type="button" class="btn btn--go" data-add-player @click="openAdd">
        + Add player
      </button>
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
        >{{ f.label }} <span class="chip__n">{{ f.count }}</span></button>
      </div>

      <div class="chips" role="group" aria-label="Sort">
        <button type="button" class="chip" :class="{ 'is-on': roster.sortBy === 'number' }"
                data-sort-number @click="roster.setSort('number')">Number</button>
        <button type="button" class="chip" :class="{ 'is-on': roster.sortBy === 'name' }"
                data-sort-name @click="roster.setSort('name')">Name</button>
      </div>
    </div>

    <p v-if="!settled" class="empty">Loading the roster…</p>
    <p v-else-if="roster.players.length === 0" class="empty" data-empty>
      No players on this team yet.<template v-if="canEdit"> Add one to get started.</template>
    </p>
    <p v-else-if="roster.visible.length === 0" class="empty" data-empty-filter>
      No players in that position group.
    </p>

    <div v-else class="grid">
      <PlayerCard
        v-for="p in roster.visible" :key="p.id"
        :player="p" :can-edit="canEdit"
        @open="detailFor = $event"
        @edit="openEdit"
        @remove="onRemove"
      />
    </div>

    <PlayerDetailModal
      :open="detailFor !== null" :player="detailFor" @close="detailFor = null" />

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
.roster { max-width: 72rem; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }

.roster__head {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}

.roster__title { margin: 0; color: #fff; font-size: 1.4rem; }

.roster__org {
  margin: 0.25rem 0 0;
  color: var(--bhs-cyan-accent);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}

.chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }

.chip {
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--bhs-navy-border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.chip.is-on { border-color: var(--bhs-cyan-accent); color: var(--bhs-cyan-accent); }
.chip__n { opacity: 0.65; font-variant-numeric: tabular-nums; }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.85rem;
}

.empty {
  padding: 3rem 1rem;
  color: var(--text-muted, #94a3b8);
  text-align: center;
}

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
  border: 0;
  background: none;
  color: inherit;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
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
